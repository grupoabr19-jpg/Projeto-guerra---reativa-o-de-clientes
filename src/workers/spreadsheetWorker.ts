// Web Worker dedicado para extração de cabeçalhos, total de linhas e amostra MULTI-ABA (até 20 linhas por aba)
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
      console.warn('Worker: falha ao carregar SheetJS de', url, err)
    }
  }

  if (!ctx.XLSX) {
    throw new Error('Não foi possível carregar a biblioteca SheetJS dentro do Worker')
  }
  return ctx.XLSX
}

/**
 * Detecta se uma linha parece ser um cabeçalho de tabela dinâmica (ex: "Rótulos de Coluna", "Rótulos de Linha", "Total Geral", "Soma de ...")
 * ou genérica com vazios tipo "Coluna_1", "Coluna_2".
 */
function isPivotHeader(cols: string[]): boolean {
  if (!cols || cols.length === 0) return false
  const lowerCols = cols.map((c) => String(c).toLowerCase().trim())
  const pivotKeywords = [
    'rótulos de coluna',
    'rotulos de coluna',
    'rótulos de linha',
    'rotulos de linha',
    'valores',
    'total geral',
    'soma de',
    'contagem de',
    'média de',
  ]
  const hasPivotKeyword = lowerCols.some((c) => pivotKeywords.some((pk) => c.includes(pk)))
  const genericCount = lowerCols.filter((c) => c.startsWith('coluna_') || c === '').length
  const mostlyGeneric = genericCount >= cols.length * 0.5 && genericCount >= 2

  return hasPivotKeyword || mostlyGeneric
}

/**
 * Analisa as primeiras linhas de uma matriz bruta de uma aba para:
 * 1. Identificar o índice da melhor linha de cabeçalho (pulando linhas em branco ou títulos genéricos de pivot)
 * 2. Normalizar os nomes das colunas
 * 3. Indicar se é tabela dinâmica / pivô
 * 4. Extrair até sampleSize linhas de amostra limpas
 */
function inspectSheetMatrix(
  rawMatrix: any[][],
  sampleSize: number = 20,
): {
  colunas: string[]
  amostra: Record<string, unknown>[]
  isPivot: boolean
  tipoAba: 'dados' | 'tabela_dinamica' | 'referencia' | 'resumo'
} {
  if (!rawMatrix || rawMatrix.length === 0) {
    return {
      colunas: [],
      amostra: [],
      isPivot: false,
      tipoAba: 'dados',
    }
  }

  // Vasculhar as primeiras até 8 linhas para encontrar a melhor linha de cabeçalho
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

    // Verifica quantas células são strings com nomes descritivos
    let textCellsCount = 0
    let hasPivotMarkers = false

    for (const cell of nonBlankCells) {
      const s = String(cell).trim()
      const sLower = s.toLowerCase()
      if (
        sLower.includes('rótulos') ||
        sLower.includes('rotulos') ||
        sLower.includes('total geral') ||
        sLower.includes('soma de')
      ) {
        hasPivotMarkers = true
      }
      // Considera texto se não for apenas número ou data
      if (isNaN(Number(s)) && s.length >= 2) {
        textCellsCount++
      }
    }

    // Dá peso maior para linhas com bastante células preenchidas de texto
    const score = textCellsCount * 2 + nonBlankCells.length - (hasPivotMarkers ? 3 : 0)
    if (score > bestScore) {
      bestScore = score
      bestHeaderIdx = r
    }
  }

  const headerRow = rawMatrix[bestHeaderIdx] || []
  const initialCols = headerRow.map((c: any, idx: number) => {
    const val = String(c ?? '').trim()
    return val || `Coluna_${idx + 1}`
  })

  // Detecta se é pivô
  const firstRowStrings = (rawMatrix[0] || []).map((c: any) => String(c ?? '').trim())
  const isPivot = isPivotHeader(firstRowStrings) || isPivotHeader(initialCols)

  // Desduplica nomes de colunas
  const seenCols: Record<string, number> = {}
  const colunas = initialCols.map((col: string, idx: number) => {
    let name = col || `Coluna_${idx + 1}`
    if (seenCols[name]) {
      seenCols[name]++
      name = `${name}_${seenCols[name]}`
    } else {
      seenCols[name] = 1
    }
    return name
  })

  // Amostra de linhas subsequentes à linha de cabeçalho
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

  return {
    colunas,
    amostra,
    isPivot,
    tipoAba: isPivot ? 'tabela_dinamica' : 'dados',
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, file, sampleSize = 20, mode = 'metadata', targetSheet } = e.data

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

    const arrayBuffer = await (file as Blob).arrayBuffer()

    self.postMessage({
      type: 'progress',
      id,
      stage: 'parsing_sheets',
      percent: 35,
      message: 'Decodificando estrutura de abas do Excel (SheetJS)...',
    })

    // Opções otimizadas para memória:
    // Não carregamos estilos nem fórmulas
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
      type: 'array',
      cellDates: true,
      cellStyles: false,
      cellHTML: false,
      cellFormula: false,
      raw: false,
      dense: false,
    })

    const sheetNames: string[] = workbook.SheetNames || []
    if (sheetNames.length === 0) {
      throw new Error('A planilha não contém nenhuma aba.')
    }

    // Se o modo for 'full_rows' (usado para importar dados linha a linha na tela de Importação)
    if (mode === 'full_rows') {
      // Se nenhuma aba específica foi solicitada, prioriza abas de dados brutos (ex: "BD", "Base", "Dados", "BD_Meta")
      // ignorando abas de resumo ou tabelas dinâmicas
      let sheetName = targetSheet
      if (!sheetName) {
        let bestScore = -1
        let bestName = sheetNames[0]
        for (const sName of sheetNames) {
          const lower = sName.toLowerCase().trim()
          let score = 0
          if (lower === 'bd' || lower === 'base' || lower === 'dados' || lower === 'faturamento') {
            score += 10000
          } else if (
            lower.startsWith('bd_') ||
            lower.startsWith('base_') ||
            lower.startsWith('dados_')
          ) {
            score += 5000
          } else if (
            lower.includes('resumo') ||
            lower.includes('desvio') ||
            lower.includes('tabela')
          ) {
            score -= 1000
          }
          if (score > bestScore) {
            bestScore = score
            bestName = sName
          }
        }
        sheetName = bestName
      }

      const worksheet = workbook.Sheets[sheetName]
      if (!worksheet) {
        throw new Error(`Aba "${sheetName}" não encontrada no arquivo.`)
      }

      self.postMessage({
        type: 'progress',
        id,
        stage: 'parsing_sheets',
        percent: 50,
        message: `Processando linhas da aba "${sheetName}"...`,
      })

      // Lê a matriz bruta linha a linha
      const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      })

      if (!rawMatrix || rawMatrix.length === 0) {
        throw new Error('A planilha selecionada está vazia.')
      }

      // Encontra a melhor linha de cabeçalho
      const { colunas } = inspectSheetMatrix(rawMatrix.slice(0, 10), 1)
      let headerRowIdx = 0
      for (let r = 0; r < Math.min(rawMatrix.length, 8); r++) {
        const row = rawMatrix[r]
        if (!Array.isArray(row)) continue
        const nonBlanks = row.filter(
          (c) => c !== undefined && c !== null && String(c).trim().length > 0,
        )
        if (nonBlanks.length >= colunas.length * 0.6 && nonBlanks.length >= 2) {
          headerRowIdx = r
          break
        }
      }

      const totalDataRows = Math.max(0, rawMatrix.length - (headerRowIdx + 1))
      self.postMessage({
        type: 'progress',
        id,
        stage: 'analyzing_rows',
        percent: 65,
        message: `Convertendo ${totalDataRows.toLocaleString('pt-BR')} linhas...`,
      })

      // Gera os objetos linha a linha com envio periódico de progresso
      const allRows: Record<string, unknown>[] = []
      const step = Math.max(1000, Math.floor(totalDataRows / 20))

      for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
        const row = rawMatrix[r]
        if (!row) continue
        const obj: Record<string, unknown> = {}
        let hasAnyVal = false

        for (let c = 0; c < colunas.length; c++) {
          const colName = colunas[c]
          const cellVal = row[c]
          if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
            obj[colName] = cellVal
            hasAnyVal = true
          } else {
            obj[colName] = ''
          }
        }

        if (hasAnyVal) {
          allRows.push(obj)
        }

        if (allRows.length % step === 0) {
          const pct = 65 + Math.floor((allRows.length / totalDataRows) * 30)
          self.postMessage({
            type: 'progress',
            id,
            stage: 'analyzing_rows',
            percent: Math.min(95, pct),
            message: `Carregadas ${allRows.length.toLocaleString('pt-BR')} de ${totalDataRows.toLocaleString('pt-BR')} linhas...`,
          })
        }
      }

      self.postMessage({
        type: 'success',
        id,
        result: {
          fileName: (file as File).name,
          totalLinhas: allRows.length,
          colunasDetectadas: colunas,
          amostraLinhas: allRows.slice(0, sampleSize),
          allRows,
          sheetNames,
          selectedSheet: sheetName,
        },
      })
      return
    }

    // Modo 'metadata' / análise multi-aba padrão
    self.postMessage({
      type: 'progress',
      id,
      stage: 'analyzing_rows',
      percent: 50,
      message: `Analisando ${sheetNames.length} abas encontradas...`,
    })

    const analiseAbas: Array<{
      nome: string
      total_linhas: number
      colunas: string[]
      amostra: Record<string, unknown>[]
      is_pivot?: boolean
      tipo_aba?: 'dados' | 'tabela_dinamica' | 'referencia' | 'resumo'
    }> = []

    let maxLinhasOverall = 0

    // Itera por TODAS as abas extraindo metadados e amostra de até sampleSize linhas
    for (let sIdx = 0; sIdx < sheetNames.length; sIdx++) {
      const sheetName = sheetNames[sIdx]
      const worksheet = workbook.Sheets[sheetName]
      if (!worksheet) continue

      // Reporta progresso proporcional às abas
      const sheetProgressPct = 50 + Math.floor((sIdx / sheetNames.length) * 40)
      self.postMessage({
        type: 'progress',
        id,
        stage: 'analyzing_rows',
        percent: sheetProgressPct,
        message: `Extraindo cabeçalhos e amostra da aba "${sheetName}" (${sIdx + 1}/${sheetNames.length})...`,
      })

      // Range da aba
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

      // Lê as primeiras linhas para cabeçalho e amostra (até 40 linhas brutas para cobrir cabeçalhos deslocados e até sampleSize amostras)
      const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
        range: 0,
      })

      if (totalLinhasAba === 0 && rawMatrix) {
        totalLinhasAba = Math.max(0, rawMatrix.length - 1)
      } else if (rawMatrix && rawMatrix.length > totalLinhasAba) {
        totalLinhasAba = Math.max(0, rawMatrix.length - 1)
      }

      if (totalLinhasAba > maxLinhasOverall) {
        maxLinhasOverall = totalLinhasAba
      }

      // Analisa matriz
      const { colunas, amostra, isPivot, tipoAba } = inspectSheetMatrix(rawMatrix, sampleSize)

      // Se o nome da aba indicar resumo ou apoio, classificar
      let finalTipoAba = tipoAba
      const lowerName = sheetName.toLowerCase()
      if (lowerName.includes('resumo')) {
        finalTipoAba = 'resumo'
      } else if (lowerName.includes('apoio') || lowerName.includes('tabela')) {
        finalTipoAba = 'referencia'
      }

      analiseAbas.push({
        nome: sheetName,
        total_linhas: totalLinhasAba,
        colunas,
        amostra,
        is_pivot: isPivot,
        tipo_aba: finalTipoAba,
      })
    }

    // Identificar a aba principal representativa da planilha:
    // Prioriza aba bruta de dados (ex: "BD", "Base", "Dados", ou com maior número de linhas e não-pivô)
    let bestSheetIndex = 0
    let highestDataScore = -1

    for (let i = 0; i < analiseAbas.length; i++) {
      const a = analiseAbas[i]
      const lower = a.nome.toLowerCase()
      let score = 0

      if (lower === 'bd' || lower === 'base' || lower === 'dados' || lower === 'faturamento') {
        score += 10000
      }
      if (lower.startsWith('bd_')) {
        score += 5000
      }
      if (!a.is_pivot) {
        score += 2000
      }
      // Colunas e linhas
      score += Math.min(a.colunas.length * 10, 500)
      score += Math.min(Math.floor(a.total_linhas / 10), 1000)

      if (score > highestDataScore) {
        highestDataScore = score
        bestSheetIndex = i
      }
    }

    // Aba padrão de exibição (se não encontrou score suficiente, usa a primeira)
    const primaryAba = analiseAbas[bestSheetIndex] || analiseAbas[0]

    self.postMessage({
      type: 'progress',
      id,
      stage: 'done',
      percent: 95,
      message: 'Finalizando extração multi-aba...',
    })

    self.postMessage({
      type: 'success',
      id,
      result: {
        fileName: (file as File).name,
        // Mantém compatibilidade com os campos globais existentes
        totalLinhas: primaryAba?.total_linhas || maxLinhasOverall,
        colunasDetectadas: primaryAba?.colunas || [],
        amostraLinhas: primaryAba?.amostra || [],
        sheetNames,
        analiseAbas,
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
