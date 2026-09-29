/**
 * Segmentos oficiais do Projeto Guerra (14 segmentos exatos com a grafia oficial).
 * Estruturista, Calheiros, Construtora, Depósito (armadores), Distribuidor,
 * Indústria de transformação, Investidor, Lajeiro, Loja de Material de Construção,
 * Pedreiro, Produtor rural, Revenda, Serralheiro, Cliente final.
 */

export const SEGMENTOS_OFICIAIS = [
  'Estruturista',
  'Calheiros',
  'Construtora',
  'Depósito (armadores)',
  'Distribuidor',
  'Indústria de transformação',
  'Investidor',
  'Lajeiro',
  'Loja de Material de Construção',
  'Pedreiro',
  'Produtor rural',
  'Revenda',
  'Serralheiro',
  'Cliente final',
] as const

export type SegmentoOficial = (typeof SEGMENTOS_OFICIAIS)[number]

/**
 * Normaliza variações de grafia e termos comuns vindos de planilhas/ERPs
 * para um dos 14 segmentos oficiais.
 * Se não casar com nenhuma variação, retorna o valor original limpo (ou vazio).
 */
export function normalizarSegmento(valorBruto: string | null | undefined): string {
  if (!valorBruto) return ''
  const trimmed = valorBruto.trim()
  if (!trimmed) return ''

  // Casamento exato prévio
  const exato = SEGMENTOS_OFICIAIS.find(
    (s) => s.localeCompare(trimmed, 'pt-BR', { sensitivity: 'accent' }) === 0,
  )
  if (exato) return exato

  // Normalização de string para buscas flexíveis (sem acentos e minúsculo)
  const norm = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[._\-/\\,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Mapeamentos específicos de sinônimos e abreviações
  if (
    norm.includes('ind trans') ||
    norm.includes('industria de transf') ||
    norm.includes('transformacao') ||
    norm.includes('ind man') ||
    norm.includes('metalurg') ||
    norm.includes('industrial') ||
    norm.includes('manufat')
  ) {
    return 'Indústria de transformação'
  }

  if (
    norm === 'lmc' ||
    norm === 'l m c' ||
    norm.includes('loja de mat') ||
    norm.includes('loja mat') ||
    norm.includes('material de const') ||
    norm.includes('mat construcao') ||
    norm.includes('materiais de const')
  ) {
    return 'Loja de Material de Construção'
  }

  if (
    norm.includes('deposito') ||
    norm.includes('armador') ||
    norm.includes('corte e dobra') ||
    norm.includes('corte dobra')
  ) {
    return 'Depósito (armadores)'
  }

  if (norm.includes('estrutur') || norm.includes('estrutura metal')) {
    return 'Estruturista'
  }

  if (norm.includes('calheir') || norm.includes('calha')) {
    return 'Calheiros'
  }

  if (norm.includes('construt') || norm.includes('engenh') || norm.includes('obra')) {
    return 'Construtora'
  }

  if (norm.includes('distrib')) {
    return 'Distribuidor'
  }

  if (norm.includes('investid') || norm.includes('incorporad')) {
    return 'Investidor'
  }

  if (norm.includes('laje') || norm.includes('pre mold') || norm.includes('premold')) {
    return 'Lajeiro'
  }

  if (norm.includes('pedreir') || norm.includes('mestre de obra')) {
    return 'Pedreiro'
  }

  if (
    norm.includes('rural') ||
    norm.includes('agric') ||
    norm.includes('agro') ||
    norm.includes('produtor') ||
    norm.includes('fazend')
  ) {
    return 'Produtor rural'
  }

  if (norm.includes('revend') || norm.includes('comercio varej')) {
    return 'Revenda'
  }

  if (norm.includes('serralh') || norm.includes('ferrag')) {
    return 'Serralheiro'
  }

  if (
    norm.includes('cliente final') ||
    norm.includes('consumidor final') ||
    norm.includes('pessoa fisica') ||
    norm.includes('consumidor') ||
    norm === 'final'
  ) {
    return 'Cliente final'
  }

  // Se não encontrou regra específica, tenta ver se começa ou contém o nome oficial
  for (const oficial of SEGMENTOS_OFICIAIS) {
    const ofNorm = oficial
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (norm.includes(ofNorm) || ofNorm.includes(norm)) {
      return oficial
    }
  }

  // Preserva valor original se não bateu em nenhuma regra, garantindo não perda de dados
  return trimmed
}
