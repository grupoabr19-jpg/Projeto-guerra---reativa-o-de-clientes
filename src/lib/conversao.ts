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
  operador?: string | null
  cliente?: string | null
  expand?: {
    cliente?: {
      id?: string
      estado?: string | null
      operador?: string | null
      operador_reativacao?: string | null
      codigo?: string | null
    } | null
    operador?: {
      id?: string
      name?: string | null
    } | null
  } | null
}

/**
 * Define se uma interação ou desfecho comercial configura uma CONVERSÃO (Reativação Real com Atendimento).
 *
 * Regra unificada do Projeto Guerra (alinhada a isReativacaoRealCond):
 * Uma conversão só conta se preencher cumulativamente:
 * 1. O cliente está no estado 'reativado' (ou possui histórico confirmado de reativação pelo operador)
 * 2. A reativação teve OPERADOR identificado (interação.operador ou cliente.operador preenchido)
 * 3. Teve atendimento real da equipe:
 *    - Desfecho comercial de reativação ('reativado', 'reativado_com_pedido', 'fechou_pedido')
 *    - OU número de pedido preenchido gerado pelo operador
 *
 * Registros de importação/cruzamento sem operador ou clientes que não estão reativados
 * NÃO são conversões da equipe.
 */
export function isConversao(item?: ConversaoCheckable | null): boolean {
  if (!item) return false

  // 1. Operador obrigatório: deve existir operador na interação ou no cliente atendido
  const opId = (
    item.operador ||
    item.expand?.operador?.id ||
    item.expand?.cliente?.operador ||
    item.expand?.cliente?.operador_reativacao ||
    ''
  ).trim()
  if (!opId) {
    return false
  }

  // 2. Estado do cliente associado: se o objeto cliente expandido estiver presente,
  // validar se está no estado 'reativado' (a mesma exigência de isReativacaoRealCond).
  if (item.expand?.cliente) {
    const estadoCliente = (item.expand.cliente.estado || '').trim().toLowerCase()
    if (estadoCliente !== 'reativado') {
      return false
    }
  }

  // 3. Atendimento real com desfecho de reativação ou número de pedido válido
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
