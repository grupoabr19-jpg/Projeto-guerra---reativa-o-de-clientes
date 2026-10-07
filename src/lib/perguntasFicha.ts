/**
 * Opções padronizadas para as perguntas da ficha de atendimento de 17 perguntas
 * que anteriormente eram texto livre ou de múltipla escolha.
 * Cada conjunto possui opções pré-definidas e suporte à opção "Outros" com texto livre.
 */

export const OPCOES_Q3_SITUACAO = [
  'Sim, operando normalmente',
  'Sim, demanda reduzida',
  'Em recuperação judicial',
  'Encerrou as atividades',
  'Outros',
] as const

export const OPCOES_Q5_MOTIVO_INATIVIDADE = [
  'Preço ou Condições de Pagamento',
  'Atrasos recorrentes no frete',
  'Problemas de qualidade no material',
  'Mudança de fornecedor por relacionamento',
  'Queda de produção interna',
  'Outros',
] as const

export const OPCOES_Q6_SENSIBILIDADE_PRECO = [
  'Muito alta (decide por centavos no quilo)',
  'Média (avalia custo-benefício e prazo de entrega)',
  'Baixa (prioriza pontualidade e especificação técnica)',
  'Outros',
] as const

export const OPCOES_Q7_CONCORRENCIA = [
  'Nenhum / Não informado',
  'Distribuidores Locais',
  'Lojas de Materiais de Construção / Varejo',
  'Direto de Usina / Siderúrgica',
  'Serralherias / Transformadores Regionais',
  'Internet / Plataformas Online',
  'Outros Concorrentes Regionais',
  'Outros',
] as const

export const OPCOES_Q8_OCORRENCIA = [
  'Nenhum erro relatado no histórico recente',
  'Atraso na entrega do pedido',
  'Qualidade / especificações divergentes ou avaria no material',
  'Divergência de faturamento, nota fiscal ou boleto',
  'Envio de material incompleto ou divergente do pedido',
  'Problema no atendimento comercial ou falta de retorno',
  'Outros',
] as const

export const OPCOES_Q9_TIPO_ERRO = [
  'Nenhum erro ocorrido',
  'Atraso crítico na entrega',
  'Especificação/qualidade divergente',
  'Erro em nota fiscal / boleto',
  'Outros',
] as const

export const OPCOES_Q10_ACAO_CORRETIVA = [
  'Sem necessidade de ação reparatória',
  'Concessão de desconto comercial especial na próxima compra',
  'Ampliação de prazo de pagamento / novas condições no boleto',
  'Bonificação, reposição de lote ou troca de material',
  'Visita presencial do representante / suporte técnico',
  'Prioridade de entrega e garantia expressa de prazo',
  'Alinhamento direto com a gerência / canal direto dedicado',
  'Outros',
] as const

export const OPCOES_Q12_DISPOSICAO = [
  'Sim, enviar cotação de imediato',
  'Sim, reagendar para início do próximo mês',
  'Em processo de reavaliação de compras',
  'Recusou formalmente qualquer negociação',
  'Outros',
] as const

export const OPCOES_Q13_CANAL = [
  'WhatsApp',
  'E-mail',
  'Telefone / Ligação',
  'Visita de Representante',
  'Outros',
] as const

/**
 * Helper para extrair o valor de exibição normalizado de uma resposta,
 * separando a opção base de eventual detalhe "Outros: <detalhes>".
 */
export function normalizarRespostaParaGrafico(valorBruto: unknown): string {
  if (valorBruto === undefined || valorBruto === null) return 'Não respondido'
  const str = String(valorBruto).trim()
  if (!str) return 'Não respondido'

  if (str.startsWith('Outros:') || str.startsWith('Outros -')) {
    const detalhe = str.replace(/^Outros[:\s-]+/, '').trim()
    return detalhe ? `Outros (${detalhe})` : 'Outros'
  }
  return str
}

/**
 * Agrupa respostas em uma categoria padronizada (para gráficos de visão sintética).
 */
export function agruparOpcaoParaCategoria(
  valorBruto: unknown,
  opcoesConhecidas: readonly string[],
): string {
  if (valorBruto === undefined || valorBruto === null) return 'Não respondido'
  const str = String(valorBruto).trim()
  if (!str) return 'Não respondido'

  if (str.startsWith('Outros')) {
    return 'Outros'
  }

  // Verifica correspondência exata
  const encontrada = opcoesConhecidas.find((op) => op.toLowerCase() === str.toLowerCase())
  if (encontrada) return encontrada

  return 'Outros'
}
