// Utilitário avançado para carregamento, streaming e parse de planilhas (XLSX, XLS, CSV)
// Suporta arquivos pequenos e super-pesados (até 150-200 MB) sem travar a interface do navegador.
// Usa Web Worker para XLSX e streaming por chunks (ReadableStream / TextDecoder) para CSV grande.

import type { AbaReferencia } from '@/types'

export interface ParsedSpreadsheet {
  fileName: string
  totalLinhas: number
  colunasDetectadas: string[]
  amostraLinhas: Record<string, unknown>[]
  sheetNames: string[]
  analiseAbas: AbaReferencia[]
}

export interface ParseProgress {
  stage: 'init' | 'reading' | 'parsing' | 'extracting' | 'uploading' | 'complete'
  percent: number
  message: string
  processedRows?: number
  totalBytes?: number
}

declare global {
  interface Window {
    XLSX?: any
  }
}

let sheetJsPromise: Promise<any> | null = null

export async function loadSheetJS(): Promise<any> {
  if (typeof window !== 'undefined' && window.XLSX) {
    return window.XLSX
  }

  if (sheetJsPromise) {
    return sheetJsPromise
  }

  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
    script.async = true
    script.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX)
      } else {
        reject(new Error('SheetJS script loaded but window.XLSX is not defined'))
      }
    }
    script.onerror = () => {
      const fallbackScript = document.createElement('script')
      fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      fallbackScript.async = true
      fallbackScript.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX)
        } else {
          reject(new Error('Falha ao carregar biblioteca SheetJS'))
        }
      }
      fallbackScript.onerror = () => {
        reject(new Error('Não foi possível carregar o parser de planilhas SheetJS'))
      }
      document.head.appendChild(fallbackScript)
    }

    document.head.appendChild(script)
  })

  return sheetJsPromise
}

/**
 * Parsing em streaming para CSV de qualquer tamanho (mesmo centenas de MB)
 * Lê via ReadableStream linha por linha sem colocar todo o arquivo na memória.
 */
export async function parseCsvStream(
  file: File,
  sampleSize: number = 50,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedSpreadsheet> {
  onProgress?.({
    stage: 'reading',
    percent: 10,
    message: 'Iniciando leitura em streaming do CSV...',
    totalBytes: file.size,
  })

  const stream = file.stream()
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })

  let buffer = ''
  let delimiter: string | null = null
  let colunasDetectadas: string[] = []
  const amostraLinhas: Record<string, unknown>[] = []
  let totalLinhas = 0
  let isFirstLine = true
  let bytesRead = 0

  const parseLine = (line: string, delim: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === delim && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''))
    return result
  }

  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      bytesRead += value.length
      buffer += decoder.decode(value, { stream: !done })
    }

    let lineEndIdx: number
    while ((lineEndIdx = buffer.indexOf('\n')) !== -1) {
      let rawLine = buffer.slice(0, lineEndIdx)
      buffer = buffer.slice(lineEndIdx + 1)

      if (rawLine.endsWith('\r')) {
        rawLine = rawLine.slice(0, -1)
      }

      if (!rawLine.trim()) continue

      if (isFirstLine) {
        // Detecta delimitador (',' ou ';')
        const semicolons = (rawLine.match(/;/g) || []).length
        const commas = (rawLine.match(/,/g) || []).length
        delimiter = semicolons >= commas ? ';' : ','

        const rawHeaders = parseLine(rawLine, delimiter)
        colunasDetectadas = rawHeaders
          .map((h, idx) => h || `Coluna_${idx + 1}`)
          .filter((h) => h.length > 0)

        isFirstLine = false
      } else {
        totalLinhas++
        if (amostraLinhas.length < sampleSize && delimiter) {
          const cells = parseLine(rawLine, delimiter)
          const rowObj: Record<string, unknown> = {}
          colunasDetectadas.forEach((col, idx) => {
            rowObj[col] = cells[idx] !== undefined ? cells[idx] : ''
          })
          amostraLinhas.push(rowObj)
        }
      }
    }

    if (file.size > 0 && onProgress) {
      const pct = Math.min(90, Math.round((bytesRead / file.size) * 85) + 10)
      onProgress({
        stage: 'parsing',
        percent: pct,
        message: `Processando CSV em streaming (${totalLinhas.toLocaleString('pt-BR')} linhas lidas)...`,
        processedRows: totalLinhas,
        totalBytes: file.size,
      })
    }

    if (done) {
      break
    }
  }

  // Se sobrou alguma linha residual no buffer
  if (buffer.trim() && delimiter && !isFirstLine) {
    totalLinhas++
    if (amostraLinhas.length < sampleSize) {
      const cells = parseLine(buffer.trim(), delimiter)
      const rowObj: Record<string, unknown> = {}
      colunasDetectadas.forEach((col, idx) => {
        rowObj[col] = cells[idx] !== undefined ? cells[idx] : ''
      })
      amostraLinhas.push(rowObj)
    }
  }

  if (colunasDetectadas.length === 0) {
    throw new Error('Não foi possível identificar colunas válidas no CSV')
  }

  onProgress?.({
    stage: 'complete',
    percent: 100,
    message: `Concluído: ${totalLinhas.toLocaleString('pt-BR')} linhas e ${colunasDetectadas.length} colunas.`,
    processedRows: totalLinhas,
    totalBytes: file.size,
  })

  const analiseAbas: AbaReferencia[] = [
    {
      nome: 'CSV',
      total_linhas: totalLinhas,
      colunas: colunasDetectadas,
      amostra: amostraLinhas,
      is_pivot: false,
      tipo_aba: 'dados',
    },
  ]

  return {
    fileName: file.name,
    totalLinhas,
    colunasDetectadas,
    amostraLinhas,
    sheetNames: ['CSV'],
    analiseAbas,
  }
}

/**
 * Executa o parse de XLSX usando Web Worker dedicado com Vite worker constructor
 */
function parseWithWebWorker(
  file: File,
  sampleSize: number = 20,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedSpreadsheet> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null

    try {
      worker = new Worker(new URL('../workers/spreadsheetWorker.ts', import.meta.url), {
        type: 'module',
      })
    } catch (workerErr) {
      reject(workerErr)
      return
    }

    const taskId = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

    const timeoutTimer = setTimeout(() => {
      if (worker) {
        worker.terminate()
        worker = null
      }
      reject(
        new Error(
          'Tempo limite excedido ao processar a planilha pesada no Worker (timeout 10 min)',
        ),
      )
    }, 600000) // 10 minutos para planilhas gigantes de 120MB

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.id !== taskId) return

      if (data.type === 'progress') {
        onProgress?.({
          stage: data.stage === 'reading_bytes' ? 'reading' : 'parsing',
          percent: data.percent,
          message: data.message,
          totalBytes: file.size,
        })
      } else if (data.type === 'success') {
        clearTimeout(timeoutTimer)
        if (worker) {
          worker.terminate()
          worker = null
        }
        resolve(data.result)
      } else if (data.type === 'error') {
        clearTimeout(timeoutTimer)
        if (worker) {
          worker.terminate()
          worker = null
        }
        reject(new Error(data.error || 'Falha no processamento pelo Worker'))
      }
    }

    worker.onerror = (err) => {
      clearTimeout(timeoutTimer)
      if (worker) {
        worker.terminate()
        worker = null
      }
      reject(new Error(`Erro no Web Worker: ${err.message || 'Falha de execução'}`))
    }

    // Inicia envio ao worker
    worker.postMessage({
      id: taskId,
      file,
      sampleSize,
    })
  })
}

/**
 * Fallback na thread principal com SheetJS (usado caso Web Workers sejam bloqueados no navegador)
 */
async function parseWithMainThreadSheetJS(
  file: File,
  sampleSize: number = 50,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedSpreadsheet> {
  onProgress?.({
    stage: 'reading',
    percent: 20,
    message: 'Carregando SheetJS na thread principal...',
    totalBytes: file.size,
  })

  const XLSX = await loadSheetJS()
  onProgress?.({
    stage: 'reading',
    percent: 40,
    message: 'Lendo dados do arquivo...',
    totalBytes: file.size,
  })

  const arrayBuffer = await file.arrayBuffer()
  onProgress?.({
    stage: 'parsing',
    percent: 60,
    message: 'Decodificando workbook...',
    totalBytes: file.size,
  })

  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: 'array',
    cellDates: true,
    cellStyles: false,
    cellHTML: false,
    cellFormula: false,
    raw: false,
  })

  const sheetNames = workbook.SheetNames || []
  if (sheetNames.length === 0) {
    throw new Error('Nenhuma aba encontrada na planilha')
  }

  const analiseAbas: AbaReferencia[] = []
  let maxLinhasOverall = 0

  for (let sIdx = 0; sIdx < sheetNames.length; sIdx++) {
    const sheetName = sheetNames[sIdx]
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue

    let totalLinhasAba = 0
    const ref = worksheet['!ref']
    if (ref) {
      try {
        const range = XLSX.utils.decode_range(ref)
        totalLinhasAba = Math.max(0, range.e.r - range.s.r)
      } catch {
        /* intentionally ignored */
      }
    }

    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    })

    if (totalLinhasAba === 0 && rawMatrix) {
      totalLinhasAba = Math.max(0, rawMatrix.length - 1)
    }

    if (totalLinhasAba > maxLinhasOverall) {
      maxLinhasOverall = totalLinhasAba
    }

    // Identificar melhor linha de cabeçalho
    let bestHeaderIdx = 0
    let bestScore = -1
    const inspectLimit = Math.min(rawMatrix.length, 8)
    for (let r = 0; r < inspectLimit; r++) {
      const row = rawMatrix[r]
      if (!Array.isArray(row)) continue
      const nonBlankCells = row.filter(
        (c) => c !== undefined && c !== null && String(c).trim().length > 0,
      )
      if (nonBlankCells.length === 0) continue

      let textCount = 0
      let hasPivotMarkers = false
      for (const cell of nonBlankCells) {
        const s = String(cell).trim().toLowerCase()
        if (
          s.includes('rótulos') ||
          s.includes('rotulos') ||
          s.includes('total geral') ||
          s.includes('soma de')
        ) {
          hasPivotMarkers = true
        }
        if (isNaN(Number(s)) && s.length >= 2) {
          textCount++
        }
      }
      const score = textCount * 2 + nonBlankCells.length - (hasPivotMarkers ? 3 : 0)
      if (score > bestScore) {
        bestScore = score
        bestHeaderIdx = r
      }
    }

    const headerRow = rawMatrix[bestHeaderIdx] || []
    const rawCols = headerRow.map((c: any, idx: number) => {
      const val = String(c ?? '').trim()
      return val || `Coluna_${idx + 1}`
    })

    const lowerCols = rawCols.map((c: string) => c.toLowerCase())
    const isPivot =
      lowerCols.some(
        (c: string) => c.includes('rótulos') || c.includes('rotulos') || c.includes('total geral'),
      ) || rawCols.filter((c: string) => c.startsWith('Coluna_')).length >= rawCols.length * 0.5

    const seen: Record<string, number> = {}
    const colunas = rawCols.map((c: string, idx: number) => {
      let name = c || `Coluna_${idx + 1}`
      if (seen[name]) {
        seen[name]++
        name = `${name}_${seen[name]}`
      } else {
        seen[name] = 1
      }
      return name
    })

    const sampleRows = rawMatrix.slice(bestHeaderIdx + 1, bestHeaderIdx + 1 + sampleSize)
    const amostra: Record<string, unknown>[] = []
    for (const row of sampleRows) {
      if (!row) continue
      const obj: Record<string, unknown> = {}
      let hasAnyValue = false
      for (let c = 0; c < colunas.length; c++) {
        const colName = colunas[c]
        const cellVal = row[c]
        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
          obj[colName] = cellVal
          hasAnyValue = true
        } else {
          obj[colName] = ''
        }
      }
      if (hasAnyValue) {
        amostra.push(obj)
      }
    }

    let tipoAba: 'dados' | 'tabela_dinamica' | 'referencia' | 'resumo' = isPivot
      ? 'tabela_dinamica'
      : 'dados'
    const lowerName = sheetName.toLowerCase()
    if (lowerName.includes('resumo')) tipoAba = 'resumo'
    else if (lowerName.includes('apoio') || lowerName.includes('tabela')) tipoAba = 'referencia'

    analiseAbas.push({
      nome: sheetName,
      total_linhas: totalLinhasAba,
      colunas,
      amostra,
      is_pivot: isPivot,
      tipo_aba: tipoAba,
    })
  }

  // Escolhe a aba principal (prioriza BD / não-pivô)
  let bestSheetIndex = 0
  let highestScore = -1
  for (let i = 0; i < analiseAbas.length; i++) {
    const a = analiseAbas[i]
    const lower = a.nome.toLowerCase()
    let s = 0
    if (lower === 'bd' || lower === 'base' || lower === 'dados') s += 10000
    if (lower.startsWith('bd_')) s += 5000
    if (!a.is_pivot) s += 2000
    s += a.colunas.length * 10
    if (s > highestScore) {
      highestScore = s
      bestSheetIndex = i
    }
  }

  const primaryAba = analiseAbas[bestSheetIndex] || analiseAbas[0]

  onProgress?.({
    stage: 'complete',
    percent: 100,
    message: 'Análise multi-aba concluída com sucesso!',
    processedRows: primaryAba?.total_linhas || maxLinhasOverall,
  })

  return {
    fileName: file.name,
    totalLinhas: primaryAba?.total_linhas || maxLinhasOverall,
    colunasDetectadas: primaryAba?.colunas || [],
    amostraLinhas: primaryAba?.amostra || [],
    sheetNames: workbook.SheetNames,
    analiseAbas,
  }
}

/**
 * Ponto de entrada universal:
 * 1. Para CSV: faz streaming direto sem carregar tudo em RAM
 * 2. Para XLSX / XLS: tenta Web Worker prioritariamente (não congela UI); se falhar ou não suportar, faz fallback
 */
export async function parseSpreadsheetWithSheetJS(
  file: File,
  sampleSize: number = 20,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedSpreadsheet> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')

  if (isCsv) {
    return parseCsvStream(file, sampleSize, onProgress)
  }

  // Se tiver suporte a Worker, executa no Worker
  if (typeof Worker !== 'undefined') {
    try {
      return await parseWithWebWorker(file, sampleSize, onProgress)
    } catch (workerErr) {
      console.warn(
        'Web Worker falhou ou não pôde ser iniciado, tentando fallback na thread principal:',
        workerErr,
      )
      onProgress?.({
        stage: 'parsing',
        percent: 30,
        message: 'Alternando para processamento nativo...',
      })
      return parseWithMainThreadSheetJS(file, sampleSize, onProgress)
    }
  }

  return parseWithMainThreadSheetJS(file, sampleSize, onProgress)
}
