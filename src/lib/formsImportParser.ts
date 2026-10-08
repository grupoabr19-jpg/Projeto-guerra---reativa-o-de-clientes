/**
 * Utilitários para normalização e parsing das respostas exportadas do Microsoft Forms
 * (ou planilhas similares) para o modelo do Projeto Guerra.
 */

import type { ItemImportacaoFormulario } from '@/services/api'

// Regex para localizar código de cliente no padrão C000xxx (C seguido de dígitos, geralmente 6 dígitos)
export const REGEX_CODIGO_CLIENTE = /\b(C\d{4,8})\b/i

/**
 * Extrai o código do cliente mesmo que esteja misturado ao nome (ex: "EVALDO RIBEIRO C000404" -> "C000404")
 */
export function extrairCodigoCliente(valor?: unknown): string {
  if (valor === undefined || valor === null) return ''
  const str = String(valor).trim()
  if (!str) return ''

  const match = str.match(REGEX_CODIGO_CLIENTE)
  if (match && match[1]) {
    return match[1].toUpperCase()
  }

  // Se for algo como "000404" sem o C, ou "C 000404"
  const matchComEspaco = str.match(/\bC\s*(\d{4,8})\b/i)
  if (matchComEspaco && matchComEspaco[1]) {
    return `C${matchComEspaco[1]}`.toUpperCase()
  }

  return str.toUpperCase()
}

/**
 * Converte strings com valores em Reais (ex: "R$ 5.298", "R$ 19.254,60", "1653,00", "SEM COTAÇÃO")
 * para número puro. Textos como "SEM COTAÇÃO", "não fez", "nçao" retornam 0 ou undefined.
 */
export function normalizarValorReais(valor?: unknown): number {
  if (valor === undefined || valor === null) return 0
  const str = String(valor).trim()
  if (!str) return 0

  // Se contém apenas letras e nada de dígitos
  if (!/\d/.test(str)) {
    return 0
  }

  // Limpa R$, espaços e caracteres não numéricos exceto , e .
  let limpo = str.replace(/[R$\s]/gi, '').trim()

  // Se tiver texto adicional após os números (ex: "R$ 19.254,60 - pedido de venda 218375")
  // Pega a primeira ocorrência numérica formatada
  const numMatch = limpo.match(/(\d+(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/)
  if (numMatch) {
    limpo = numMatch[1]
  }

  // Se tem ponto de milhar e vírgula decimal (ex: 19.254,60)
  if (limpo.includes('.') && limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (limpo.includes(',')) {
    // Apenas vírgula decimal (ex: 1653,00)
    limpo = limpo.replace(',', '.')
  } else if (limpo.includes('.')) {
    // Pode ser milhar (ex: 1.987) ou decimal (ex: 5298.50)
    // Se o ponto tiver 3 dígitos após, pode ser milhar se não tiver outro separador
    const parts = limpo.split('.')
    if (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) < 1000) {
      // Ex: 1.987 -> 1987
      limpo = limpo.replace('.', '')
    }
  }

  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

/**
 * Converte strings com peso em toneladas/quilos (ex: "3.378 Kgs", "1700 kilos", "321,32", "210,90", "só aguardando...")
 * Retorna número decimal em toneladas ou unidades correspondentes.
 */
export function normalizarPesoToneladas(valor?: unknown): number {
  if (valor === undefined || valor === null) return 0
  const str = String(valor).trim()
  if (!str) return 0

  if (!/\d/.test(str)) {
    return 0
  }

  let limpo = str.replace(/[kKgGsSilos\s]/gi, '').trim()

  // Se tiver algo como "(494,98 KGS)" dentro de um texto
  const match = str.match(/(\d+(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/)
  if (match) {
    limpo = match[1]
  }

  if (limpo.includes('.') && limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (limpo.includes(',')) {
    limpo = limpo.replace(',', '.')
  }

  const num = parseFloat(limpo)
  if (isNaN(num)) return 0

  // Se o número for informado em Quilos (ex: > 100 quilos), converte para Toneladas se apropriado
  // mantendo consistência com o campo toneladas_potencial
  if (str.toLowerCase().includes('kg') || str.toLowerCase().includes('kilo')) {
    if (num > 50) {
      return Number((num / 1000).toFixed(3))
    }
  }

  return num
}

/**
 * Normaliza probabilidade de retomada nos 30 dias para uma das categorias padrão do sistema:
 * "Muito provável" | "Provável" | "Neutro" | "Pouco provável" | "Improvável"
 */
export function normalizarProbabilidadeRetomada(valor?: unknown): string {
  if (!valor) return ''
  const str = String(valor).trim().toLowerCase()
  if (str.includes('muito')) return 'Muito provável'
  if (str.includes('pouco')) return 'Pouco provável'
  if (str.includes('improv')) return 'Improvável'
  if (str.includes('neutr')) return 'Neutro'
  if (str.includes('prov')) return 'Provável'
  return String(valor).trim()
}

/**
 * Normaliza desfecho do forms para os estados do sistema:
 * - "Reativado" -> 'reativado'
 * - "Agendado para finalização posterior" -> 'reagendado'
 * - Os demais ("Cliente com mais de um ID...", "Cliente não quer negociar", "Suporte Técnico...", etc.)
 *   gravam como observação/desfecho livre sem alterar estado da máquina de estados bruscamente.
 */
export function normalizarDesfechoForms(valor?: unknown): {
  desfechoNormalizado: string
  desfechoCru: string
  deveAtualizarEstadoCliente: boolean
} {
  const cru = String(valor || '').trim()
  if (!cru) {
    return {
      desfechoNormalizado: 'contatado',
      desfechoCru: '',
      deveAtualizarEstadoCliente: false,
    }
  }

  const low = cru.toLowerCase()

  if (low.includes('reativado')) {
    return {
      desfechoNormalizado: 'reativado',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: true,
    }
  }

  if (low.includes('agendado') || low.includes('reagend')) {
    return {
      desfechoNormalizado: 'reagendado',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: true,
    }
  }

  if (
    low.includes('restrição') ||
    low.includes('restricao') ||
    low.includes('crédito bloqueado') ||
    low.includes('credito bloqueado') ||
    low.includes('sem limite')
  ) {
    return {
      desfechoNormalizado: 'restricao_financeira',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: false,
    }
  }

  if (low.includes('não quer') || low.includes('nao quer') || low.includes('recus')) {
    return {
      desfechoNormalizado: 'nao_quer_negociar',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: false, // não força quarentena cega na importação
    }
  }

  if (low.includes('duplic') || low.includes('mais de um id')) {
    return {
      desfechoNormalizado: 'duplicado',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: false,
    }
  }

  if (low.includes('sem contato') || low.includes('não atende')) {
    return {
      desfechoNormalizado: 'sem_contato',
      desfechoCru: cru,
      deveAtualizarEstadoCliente: false,
    }
  }

  // Outros desfechos livres tipo "Suporte Técnico / Pós-venda", "Cliente ativo"
  return {
    desfechoNormalizado: 'contatado',
    desfechoCru: cru,
    deveAtualizarEstadoCliente: false,
  }
}

/**
 * Converte data em formato dd/MM/yyyy HH:mm (ou ISO) para ISO string compatível com banco
 */
export function normalizarDataHoraForms(valor?: unknown): string | null {
  if (!valor) return null
  const str = String(valor).trim()
  if (!str) return null

  // Padrão dd/MM/yyyy HH:mm ou dd/MM/yyyy HH:mm:ss
  const matchBr = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  )
  if (matchBr) {
    const dia = parseInt(matchBr[1], 10)
    const mes = parseInt(matchBr[2], 10) - 1
    const ano = parseInt(matchBr[3], 10)
    const hora = matchBr[4] ? parseInt(matchBr[4], 10) : 12
    const min = matchBr[5] ? parseInt(matchBr[5], 10) : 0
    const seg = matchBr[6] ? parseInt(matchBr[6], 10) : 0
    const d = new Date(ano, mes, dia, hora, min, seg)
    if (!isNaN(d.getTime())) {
      return d.toISOString()
    }
  }

  const dIso = new Date(str)
  if (!isNaN(dIso.getTime())) {
    return dIso.toISOString()
  }

  return null
}

/**
 * Tenta inferir número do pedido se vier embutido em campos como cotação ou peso
 * (ex: "R$ 19.254,60 - pedido de venda 218375" -> "218375", "PEDIDO 221049" -> "221049")
 */
export function extrairNumeroPedido(texto?: unknown): string {
  if (!texto) return ''
  const str = String(texto)
  const match = str.match(/(?:pedido|pv|ped|nf)[\s\w]*?(\d{5,8})/i)
  if (match && match[1]) {
    return match[1]
  }
  return ''
}

export interface MapeamentoColunasForms {
  colunaCodigoCliente: string
  colunaNomeCliente: string
  colunaOperadorEmail: string
  colunaOperadorNome: string
  colunaDataInicio: string
  colunaDataConclusao: string
  colunaMotivoInterrupcao: string
  colunaAvaliacaoGeral: string
  colunaHouveErro: string
  colunaNaturezaFalha: string
  colunaSetorFalha: string
  colunaAnexoUrl: string
  colunaNecessarioVoltar: string
  colunaProbabilidadeRetomada: string
  colunaDesfecho: string
  colunaValorCotacao: string
  colunaPesoFaturado: string
}

/**
 * Sugere mapeamento automático por similaridade de nome de colunas
 */
export function sugerirMapeamentoColunasForms(headers: string[]): MapeamentoColunasForms {
  const norm = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const findHeader = (predicate: (normalized: string) => boolean) =>
    headers.find((h) => predicate(norm(h))) || ''

  return {
    colunaCodigoCliente: findHeader(
      (n) =>
        (n.includes('identificacao') && n.includes('cliente')) ||
        (n.includes('cod') && n.includes('cliente')),
    ),
    colunaNomeCliente: findHeader(
      (n) =>
        (n.includes('nome de cliente') || n.includes('nome do cliente') || n === 'nome cliente') &&
        !n.includes('operador'),
    ),
    colunaOperadorEmail: findHeader((n) => n === 'email' || n.includes('email')),
    colunaOperadorNome: findHeader(
      (n) =>
        (n === 'nome' || n.includes('respondente') || n.includes('vendedor')) &&
        !n.includes('cliente') &&
        !n.includes('empresa'),
    ),
    colunaDataInicio: findHeader((n) => n.includes('hora de inicio') || n.includes('inicio')),
    colunaDataConclusao: findHeader(
      (n) => n.includes('hora de conclusao') || n.includes('conclusao'),
    ),
    colunaMotivoInterrupcao: findHeader(
      (n) => n.includes('motivo') && (n.includes('interrupcao') || n.includes('compra')),
    ),
    colunaAvaliacaoGeral: findHeader(
      (n) => n.includes('avalia') && (n.includes('experiencia') || n.includes('geral')),
    ),
    colunaHouveErro: findHeader(
      (n) => n.includes('erro especifico') || n.includes('falha durante'),
    ),
    colunaNaturezaFalha: findHeader(
      (n) =>
        n.includes('natureza da falha') || (n.includes('houve um erro') && n.includes('natureza')),
    ),
    colunaSetorFalha: findHeader(
      (n) => n.includes('setor') || (n.includes('area') && n.includes('falhou')),
    ),
    colunaAnexoUrl: findHeader(
      (n) =>
        n.includes('arquivo para subsidiar') || n.includes('link de anexo') || n.includes('anexo'),
    ),
    colunaNecessarioVoltar: findHeader(
      (n) => n.includes('necessario para que voce voltasse') || n.includes('voltasse a comprar'),
    ),
    colunaProbabilidadeRetomada: findHeader(
      (n) => n.includes('probabilidade de voce retomar') || n.includes('retomar negocios'),
    ),
    colunaDesfecho: findHeader(
      (n) => n.includes('atendimento foi finalizado') || n.includes('desfecho'),
    ),
    colunaValorCotacao: findHeader(
      (n) => n.includes('reativado') && (n.includes('valor da cotacao') || n.includes('valor')),
    ),
    colunaPesoFaturado: findHeader(
      (n) => n.includes('peso faturado') || (n.includes('faturou') && n.includes('peso')),
    ),
  }
}

/**
 * Converte linhas brutas da planilha de Forms para os itens prontos de envio da API
 */
export function converterLinhasFormsParaPayload(
  rows: Record<string, unknown>[],
  mapeamento: MapeamentoColunasForms,
): ItemImportacaoFormulario[] {
  const result: ItemImportacaoFormulario[] = []

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]
    const linha = idx + 2

    const rawCodigo = r[mapeamento.colunaCodigoCliente]
    const codigoCliente = extrairCodigoCliente(rawCodigo)
    if (!codigoCliente) continue

    const rawNome = r[mapeamento.colunaNomeCliente]
    const operadorEmail = String(r[mapeamento.colunaOperadorEmail] || '').trim()
    const operadorNome = String(r[mapeamento.colunaOperadorNome] || '').trim()
    const dataInicioRaw = r[mapeamento.colunaDataInicio]
    const dataConclusaoRaw = r[mapeamento.colunaDataConclusao]

    const dataInicio = normalizarDataHoraForms(dataInicioRaw) || String(dataInicioRaw || '')
    const dataConclusao =
      normalizarDataHoraForms(dataConclusaoRaw) || String(dataConclusaoRaw || '')

    const motivoInterrupcao = String(r[mapeamento.colunaMotivoInterrupcao] || '').trim()
    const avaliacaoGeral = r[mapeamento.colunaAvaliacaoGeral]
    const houveErro = String(r[mapeamento.colunaHouveErro] || '').trim()
    const naturezaFalha = String(r[mapeamento.colunaNaturezaFalha] || '').trim()
    const setorFalha = String(r[mapeamento.colunaSetorFalha] || '').trim()
    const anexoUrl = String(r[mapeamento.colunaAnexoUrl] || '').trim()
    const necessarioVoltar = String(r[mapeamento.colunaNecessarioVoltar] || '').trim()
    const probabilidadeRetomada = normalizarProbabilidadeRetomada(
      r[mapeamento.colunaProbabilidadeRetomada],
    )

    const rawDesfecho = r[mapeamento.colunaDesfecho]
    const { desfechoNormalizado, desfechoCru } = normalizarDesfechoForms(rawDesfecho)

    const rawValor = r[mapeamento.colunaValorCotacao]
    const valorPotencial = normalizarValorReais(rawValor)

    const rawPeso = r[mapeamento.colunaPesoFaturado]
    const toneladasPotencial = normalizarPesoToneladas(rawPeso)

    // Se o campo peso ou valor tiver texto embutido (ex: "só aguardando liberação..."),
    // recolhe como observação para não perder nada
    const observacoesPartes: string[] = []
    if (
      typeof rawPeso === 'string' &&
      /[a-zA-Z]{3,}/.test(rawPeso) &&
      !rawPeso.match(/^(?:\d+[\s,.]*)+(?:kg|kgs|kilos|ton)?$/i)
    ) {
      observacoesPartes.push(`Obs Peso/Faturamento: ${rawPeso.trim()}`)
    }
    if (
      typeof rawValor === 'string' &&
      /[a-zA-Z]{3,}/.test(rawValor) &&
      !rawValor.match(/^(?:r\$)?(?:\s*\d+[\s,.]*)+$/i)
    ) {
      observacoesPartes.push(`Obs Cotação: ${rawValor.trim()}`)
    }

    const numeroPedido = extrairNumeroPedido(rawPeso) || extrairNumeroPedido(rawValor) || ''

    result.push({
      linha,
      codigoCliente,
      nomeCliente: String(rawNome || '').trim(),
      operadorEmail,
      operadorNome,
      dataInicio,
      dataConclusao,
      motivoInterrupcao,
      avaliacaoGeral: avaliacaoGeral ? String(avaliacaoGeral).trim() : '',
      houveErro,
      naturezaFalha,
      setorFalha,
      anexoUrl,
      necessarioVoltar,
      probabilidadeRetomada,
      desfechoCru,
      desfechoNormalizado,
      valorPotencial,
      toneladasPotencial,
      observacaoGeral: observacoesPartes.join(' | '),
      numeroPedido,
    })
  }

  return result
}
