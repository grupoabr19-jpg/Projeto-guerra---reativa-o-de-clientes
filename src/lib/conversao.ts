/**
 * Regras unificadas de conversão para o Projeto Guerra.
 * Compartilhada entre MeuPainel, Equipe (Líder) e Dashboard.
 */

export interface ConversaoCheckable {
  desfecho?: string | null
  numero_pedido?: string | null
  pedido?: string | null
  pedido_reativacao?: string | null
  tipo?: string | null
}

/**
 * Define se uma interação ou desfecho comercial configura uma CONVERSÃO (Reativação com Pedido).
 *
 * Regra oficial:
 * 1. Desfecho explícito de reativação ('reativado', 'reativado_com_pedido', 'fechou_pedido')
 * 2. OU número de pedido preenchido (qualquer registro com pedido gerado na interação)
 */
export function isConversao(item?: ConversaoCheckable | null): boolean {
  if (!item) return false

  const d = String(item.desfecho || '')
    .trim()
    .toLowerCase()
  if (d === 'reativado' || d === 'reativado_com_pedido' || d === 'fechou_pedido') {
    return true
  }

  const numPed = String(item.numero_pedido || item.pedido || item.pedido_reativacao || '').trim()
  if (numPed && numPed !== '0' && numPed !== '-' && numPed.toLowerCase() !== 'null') {
    return true
  }

  return false
}

/**
 * Define se um atendimento é contabilizado como tentativa/chamada comercial efetiva.
 */
export function isLigacaoOuChamada(item?: ConversaoCheckable | null): boolean {
  if (!item) return false
  if (item.tipo === 'ligacao' || item.tipo === 'formulario') return true
  if (item.desfecho && item.desfecho.trim() !== '') return true
  return false
}

/**
 * Calcula a taxa de conversão percentual unificada (0 a 100).
 */
export function calcularTaxaConversao(conversoes: number, denominadores: number): number {
  if (!denominadores || denominadores <= 0) return 0
  return Math.round((conversoes / denominadores) * 100)
}
