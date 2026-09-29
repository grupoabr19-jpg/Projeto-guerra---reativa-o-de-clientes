// Web Worker dedicado para extração de cabeçalhos, total de linhas e amostra (até 50 linhas)
// Projetado especificamente para arquivos XLSX/XLS grandes (até 150-200 MB) sem travar a thread principal da UI.
// Usa importScripts com SheetJS versão standalone otimizada para Workers.

/* eslint-disable no-restricted-globals */

const SHEETJS_URLS = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
]

function ensureSheetJSLoaded() {
  const ctx = self as any
  if (ctx.XLSX) return ctx.XLSX

  for (const url of SHEETJS_URLS) {
    try {
      ctx.importScripts(url)
      if (ctx.XLSX) return ctx.XLSX
    } catch (err) {
      // Tenta próximo CDN
      console.warn('Worker: falha ao carregar SheetJS de', url, err)
    }
  }

  if (!ctx.XLSX) {
    throw new Error('Não foi possível carregar a biblioteca SheetJS dentro do Worker')
  }
  return ctx.XLSX
}

self.onmessage = async (e: MessageEvent) => {
  const { id, file, sampleSize = 50 } = e.data

  try {
    self.postMessage({
      type: 'progress',
      id,
      stage: 'init',
      percent: 5,
      message: 'Iniciando leitura no Worker...',
    })

    const XLSX = ensureSheetJSLoaded()
    self.postMessage({
      type: 'progress',
      id,
      stage: 'reading_bytes',
      percent: 15,
      message: 'Lendo bytes do arquivo...',
    })

    // Para evitar cópias duplicadas na memória quando possível
    const arrayBuffer = await (file as Blob).arrayBuffer()

    self.postMessage({
      type: 'progress',
      id,
      stage: 'parsing_sheets',
      percent: 45,
      message: 'Decodificando estrutura do arquivo Excel (SheetJS)...',
    })

    // Opções otimizadas para memória:
    // - sheetRows: NÃO usamos sheetRows global porque precisamos contar o total de linhas do range!
    // Mas desativamos cellStyles, cellHTML, cellFormula para poupar muita RAM.
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
      type: 'array',
      cellDates: true,
      cellStyles: false,
      cellHTML: false,
      cellFormula: false,
      raw: false,
      dense: false,
    })

    const sheetNames = workbook.SheetNames || []
    if (sheetNames.length === 0) {
      throw new Error('A planilha não contém nenhuma aba.')
    }

    const firstSheetName = sheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    if (!worksheet) {
      throw new Error(`Aba "${firstSheetName}" não pôde ser lida.`)
    }

    self.postMessage({
      type: 'progress',
      id,
      stage: 'analyzing_rows',
      percent: 75,
      message: 'Extraindo cabeçalhos e calculando contagem de linhas...',
    })

    // Obter range da planilha (ex: A1:ZZ250000)
    const ref = worksheet['!ref']
    let totalLinhas = 0
    let colunasDetectadas: string[] = []
    const amostraLinhas: Record<string, unknown>[] = []

    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      const rowCountFromRange = Math.max(0, range.e.r - range.s.r) // desconsiderando linha do cabeçalho
      totalLinhas = rowCountFromRange
    }

    // Extrair apenas as primeiras linhas (cabeçalho + sampleSize) usando range limitado
    // Isso evita converter 200.000 linhas em objetos JSON na memória!
    const headerAndSampleRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
      range: 0, // começar do topo
    })

    if (!headerAndSampleRows || headerAndSampleRows.length === 0) {
      throw new Error('A planilha está vazia')
    }

    // Atualiza totalLinhas com o número real de linhas não vazias se o range não estiver definido
    if (totalLinhas === 0) {
      totalLinhas = Math.max(0, headerAndSampleRows.length - 1)
    } else {
      // Se headerAndSampleRows tiver a contagem real de linhas não vazias:
      totalLinhas = Math.max(totalLinhas, headerAndSampleRows.length - 1)
    }

    const headerRow = headerAndSampleRows[0] || []
    colunasDetectadas = headerRow
      .map((c: any, idx: number) => {
        const val = String(c ?? '').trim()
        return val || `Coluna_${idx + 1}`
      })
      .filter((c: string) => c.length > 0)

    // Pegar até sampleSize linhas para amostra
    const sampleRows = headerAndSampleRows.slice(1, sampleSize + 1)
    for (let r = 0; r < sampleRows.length; r++) {
      const row = sampleRows[r]
      const obj: Record<string, unknown> = {}
      for (let c = 0; c < colunasDetectadas.length; c++) {
        const colName = colunasDetectadas[c]
        const cellVal = row[c]
        obj[colName] = cellVal !== undefined && cellVal !== null ? cellVal : ''
      }
      amostraLinhas.push(obj)
    }

    self.postMessage({
      type: 'progress',
      id,
      stage: 'done',
      percent: 95,
      message: 'Finalizando extração de metadados...',
    })

    self.postMessage({
      type: 'success',
      id,
      result: {
        fileName: (file as File).name,
        totalLinhas,
        colunasDetectadas,
        amostraLinhas,
        sheetNames,
      },
    })
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      id,
      error: err?.message || 'Erro no processamento do arquivo no Worker',
    })
  }
}

export {}
