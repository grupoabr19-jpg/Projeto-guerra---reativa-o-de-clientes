// Utilitário para carregamento dinâmico e parse com SheetJS (XLSX, XLS, CSV)
// Suporta carregamento sob demanda do CDN SheetJS oficial (cdn.sheetjs.com) com fallback

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
    // 1. Tenta CDN oficial do SheetJS
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
      // Fallback para cdnjs se o oficial falhar
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

export interface ParsedSpreadsheet {
  fileName: string
  totalLinhas: number
  colunasDetectadas: string[]
  amostraLinhas: Record<string, unknown>[]
  sheetNames: string[]
}

/**
 * Lê e analisa qualquer arquivo de planilha (.xlsx, .xls, .csv) no navegador
 * extraindo total de linhas, lista de colunas na ordem original e amostra das primeiras ~50 linhas.
 */
export async function parseSpreadsheetWithSheetJS(
  file: File,
  sampleSize: number = 50,
): Promise<ParsedSpreadsheet> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')

  try {
    const XLSX = await loadSheetJS()
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: true,
      raw: false,
    })

    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      throw new Error('Nenhuma aba encontrada na planilha')
    }

    const worksheet = workbook.Sheets[firstSheetName]

    // Obter dados como matriz de arrays para extrair cabeçalho exato
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    })

    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('A planilha está vazia')
    }

    // A primeira linha com dados é considerada o cabeçalho
    const headerRow = rawMatrix[0] || []
    const colunasDetectadas: string[] = headerRow
      .map((c: any, idx: number) => {
        const val = String(c ?? '').trim()
        return val || `Coluna_${idx + 1}`
      })
      .filter((c: string) => c.length > 0)

    const totalLinhas = Math.max(0, rawMatrix.length - 1)

    // Pegar até sampleSize linhas para amostra
    const sampleMatrix = rawMatrix.slice(1, sampleSize + 1)
    const amostraLinhas: Record<string, unknown>[] = sampleMatrix.map((row) => {
      const obj: Record<string, unknown> = {}
      colunasDetectadas.forEach((colName, idx) => {
        const cellVal = row[idx]
        obj[colName] = cellVal !== undefined && cellVal !== null ? cellVal : ''
      })
      return obj
    })

    return {
      fileName: file.name,
      totalLinhas,
      colunasDetectadas,
      amostraLinhas,
      sheetNames: workbook.SheetNames,
    }
  } catch (err) {
    // Se for CSV e SheetJS falhar por falta de rede, fazemos fallback de parse nativo
    if (isCsv) {
      return parseCsvNative(file, sampleSize)
    }
    throw err
  }
}

/**
 * Fallback nativo para arquivos CSV caso a rede esteja indisponível
 */
async function parseCsvNative(file: File, sampleSize: number = 50): Promise<ParsedSpreadsheet> {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    throw new Error('Arquivo CSV está vazio')
  }

  const delimiter = lines[0].includes(';') ? ';' : ','

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''))
    return result
  }

  const rawHeaders = parseLine(lines[0])
  const colunasDetectadas = rawHeaders.map((h, idx) => h || `Coluna_${idx + 1}`)
  const dataLines = lines.slice(1)
  const totalLinhas = dataLines.length

  const sampleLines = dataLines.slice(0, sampleSize)
  const amostraLinhas: Record<string, unknown>[] = sampleLines.map((line) => {
    const cols = parseLine(line)
    const obj: Record<string, unknown> = {}
    colunasDetectadas.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : ''
    })
    return obj
  })

  return {
    fileName: file.name,
    totalLinhas,
    colunasDetectadas,
    amostraLinhas,
    sheetNames: ['Sheet1'],
  }
}
