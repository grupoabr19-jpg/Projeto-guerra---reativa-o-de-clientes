import pb from '@/lib/pocketbase/client'
import { calculateRankingData } from './gamificacao'
import { getBrasiliaDateStr, getBrasiliaParts, createBrasiliaDate } from '@/lib/expediente'
import { isConversao, isLigacaoOuChamada, calcularTaxaConversao } from '@/lib/conversao'
import type {
  Cliente,
  Interacao,
  RespostaFormulario,
  Importacao,
  Configuracao,
  Regiao,
  User,
  MetricasAtivosRemovidos,
  ClienteAtivoRemovidoItem,
} from '@/types'

export async function fetchClientes(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
  expand?: string
  searchTerm?: string
  regiao?: string
  estado?: string
  categoria?: string
  apenasPedidosEmAberto?: boolean
  allowedRegioes?: string[]
}) {
  const page = params?.page || 1
  const perPage = params?.perPage || 50
  const sort = params?.sort || '-score'

  // Montagem robusta de filtro server-side
  const filterParts: string[] = []

  if (params?.filter) {
    filterParts.push(params.filter)
  }

  // Permissão de região (lider/supervisor com rotas atribuídas)
  if (params?.allowedRegioes && params.allowedRegioes.length > 0) {
    const regConds = params.allowedRegioes.map((r) => {
      const up = r.trim().toUpperCase()
      if (up === 'BRAGANÇA' || up === 'BRAGANCA') {
        return "(regiao = 'BRAGANÇA' || regiao = 'BRAGANCA' || regiao = 'BRAGANÇA PAULISTA' || regiao = 'BRAGANCA PAULISTA')"
      }
      if (up === 'CAMBUÍ' || up === 'CAMBUI') {
        return "(regiao = 'CAMBUÍ' || regiao = 'CAMBUI' || regiao = 'MICRO-REGIÃO' || regiao = 'MICRO REGIAO')"
      }
      if (
        up === 'POÇOS DE CALDAS' ||
        up === 'POCOS DE CALDAS' ||
        up === 'POÇOS CALDAS' ||
        up === 'POCOS CALDAS'
      ) {
        return "(regiao = 'POÇOS DE CALDAS' || regiao = 'POCOS DE CALDAS' || regiao = 'POÇOS CALDAS' || regiao = 'POCOS CALDAS')"
      }
      if (up === 'JUNDIAÍ' || up === 'JUNDIAI') return "(regiao = 'JUNDIAÍ' || regiao = 'JUNDIAI')"
      if (up === 'ITAJUBÁ' || up === 'ITAJUBA') return "(regiao = 'ITAJUBÁ' || regiao = 'ITAJUBA')"
      return `regiao = '${r}'`
    })
    filterParts.push(`(${regConds.join(' || ')})`)
  }

  // Filtro de Região selecionada no dropdown
  if (params?.regiao && params.regiao !== 'todas') {
    const reg = params.regiao.trim()
    const up = reg.toUpperCase()
    if (up === 'SEM REGIÃO' || up === 'SEM REGIAO') {
      filterParts.push(
        "(regiao = '' || regiao = null || regiao = 'Sem Região' || regiao = 'SEM REGIAO')",
      )
    } else if (up === 'BRAGANÇA' || up === 'BRAGANCA') {
      filterParts.push(
        "(regiao = 'BRAGANÇA' || regiao = 'BRAGANCA' || regiao = 'BRAGANÇA PAULISTA' || regiao = 'BRAGANCA PAULISTA')",
      )
    } else if (up === 'CAMBUÍ' || up === 'CAMBUI') {
      filterParts.push(
        "(regiao = 'CAMBUÍ' || regiao = 'CAMBUI' || regiao = 'MICRO-REGIÃO' || regiao = 'MICRO REGIAO')",
      )
    } else if (
      up === 'POÇOS DE CALDAS' ||
      up === 'POCOS DE CALDAS' ||
      up === 'POÇOS CALDAS' ||
      up === 'POCOS CALDAS'
    ) {
      filterParts.push(
        "(regiao = 'POÇOS DE CALDAS' || regiao = 'POCOS DE CALDAS' || regiao = 'POÇOS CALDAS' || regiao = 'POCOS CALDAS')",
      )
    } else if (up === 'JUNDIAÍ' || up === 'JUNDIAI') {
      filterParts.push("(regiao = 'JUNDIAÍ' || regiao = 'JUNDIAI')")
    } else if (up === 'ITAJUBÁ' || up === 'ITAJUBA') {
      filterParts.push("(regiao = 'ITAJUBÁ' || regiao = 'ITAJUBA')")
    } else {
      filterParts.push(`regiao = '${reg}'`)
    }
  }

  // Filtro de Estado/Status
  if (params?.estado && params.estado !== 'todos') {
    if (params.estado === 'pedido_em_aberto') {
      filterParts.push('pedido_em_aberto = true')
    } else {
      filterParts.push(`estado = '${params.estado}'`)
    }
  }

  // Filtro direto de Pedidos em Aberto
  if (params?.apenasPedidosEmAberto) {
    filterParts.push('pedido_em_aberto = true')
  }

  // Filtro de Categoria de Base
  if (params?.categoria && params.categoria !== 'todas') {
    if (params.categoria === 'cliente_final') {
      filterParts.push("base_categoria = 'cliente_final'")
    } else if (params.categoria === 'atacado_fora_mapa') {
      filterParts.push("base_categoria = 'atacado_fora_mapa'")
    } else if (params.categoria === 'sem_dono_equipe') {
      filterParts.push('sem_dono_equipe = true')
    } else if (params.categoria === 'normal') {
      filterParts.push(
        "(base_categoria = 'normal' || base_categoria = '' || base_categoria = null)",
      )
    }
  }

  // Busca textual no servidor (código, nome, telefone, whatsapp, cpf_cnpj)
  if (params?.searchTerm && params.searchTerm.trim()) {
    const rawTerm = params.searchTerm.trim()
    const cleanTerm = rawTerm.replace(/['"\\]/g, '')
    const digitsOnly = cleanTerm.replace(/\D/g, '')

    const orClauses = [
      `codigo ~ '${cleanTerm}'`,
      `nome ~ '${cleanTerm}'`,
      `telefone ~ '${cleanTerm}'`,
      `whatsapp ~ '${cleanTerm}'`,
      `cpf_cnpj ~ '${cleanTerm}'`,
    ]

    if (digitsOnly && digitsOnly.length >= 3 && digitsOnly !== cleanTerm) {
      orClauses.push(`telefone ~ '${digitsOnly}'`)
      orClauses.push(`whatsapp ~ '${digitsOnly}'`)
      orClauses.push(`cpf_cnpj ~ '${digitsOnly}'`)
    }

    filterParts.push(`(${orClauses.join(' || ')})`)
  }

  const finalFilter = filterParts.length > 0 ? filterParts.join(' && ') : undefined

  return pb.collection('clientes').getList<Cliente>(page, perPage, {
    filter: finalFilter,
    sort,
    expand: params?.expand || 'operador',
  })
}

export async function fetchClienteById(id: string) {
  return pb.collection('clientes').getOne<Cliente>(id, {
    expand: 'operador',
  })
}

export async function updateCliente(id: string, data: Partial<Cliente>) {
  return pb.collection('clientes').update<Cliente>(id, data)
}

export async function fetchInteracoesByCliente(clienteId: string) {
  return pb.collection('interacoes').getFullList<Interacao>({
    filter: `cliente = '${clienteId}'`,
    sort: '-created',
    expand: 'operador,respostas_formulario_via_interacao',
  })
}

export async function fetchRespostasFormularioByCliente(clienteId: string) {
  try {
    return await pb.collection('respostas_formulario').getFullList<RespostaFormulario>({
      filter: `cliente = '${clienteId}'`,
      sort: '-created',
    })
  } catch {
    return []
  }
}

export async function createInteracao(data: {
  cliente: string
  operador: string
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'status' | 'nota' | 'formulario'
  conteudo?: string
  desfecho?: string
  motivo?: string
  reagendado_para?: string
  numero_pedido?: string
  estado_anterior?: string
  estado_novo?: string
}) {
  return pb.collection('interacoes').create<Interacao>(data)
}

export async function saveRespostasFormulario(data: {
  cliente: string
  operador: string
  interacao?: string
  respostas: Record<string, unknown>
  desfecho: string
  valor_potencial?: number
  toneladas_potencial?: number
  anexos?: File[]
}) {
  const formData = new FormData()
  formData.append('cliente', data.cliente)
  formData.append('operador', data.operador)
  if (data.interacao) {
    formData.append('interacao', data.interacao)
  }
  formData.append('desfecho', data.desfecho)
  formData.append('respostas', JSON.stringify(data.respostas || {}))

  if (data.valor_potencial !== undefined && data.valor_potencial !== null) {
    formData.append('valor_potencial', String(data.valor_potencial))
  }
  if (data.toneladas_potencial !== undefined && data.toneladas_potencial !== null) {
    formData.append('toneladas_potencial', String(data.toneladas_potencial))
  }

  if (data.anexos && data.anexos.length > 0) {
    const limitedFiles = data.anexos.slice(0, 3)
    for (const file of limitedFiles) {
      formData.append('anexos', file)
    }
  }

  return pb.collection('respostas_formulario').create<RespostaFormulario>(formData)
}

export function getFileUrl(collectionName: string, recordId: string, fileName: string): string {
  const basePbUrl = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
  return `${basePbUrl}/api/files/${collectionName}/${recordId}/${encodeURIComponent(fileName)}`
}

export async function fetchUltimaRespostaFormulario(clienteId: string) {
  try {
    const list = await pb.collection('respostas_formulario').getList<RespostaFormulario>(1, 1, {
      filter: `cliente = '${clienteId}'`,
      sort: '-created',
    })
    return list.items[0] || null
  } catch {
    return null
  }
}

export async function fetchImportacoes() {
  return pb.collection('importacoes').getFullList<Importacao>({
    sort: '-created',
    expand: 'criado_por',
  })
}

export async function fetchConfiguracoes() {
  return pb.collection('configuracoes').getFullList<Configuracao>()
}

export async function updateConfiguracao(chave: string, valor: Record<string, unknown>) {
  const existing = await pb
    .collection('configuracoes')
    .getFirstListItem<Configuracao>(`chave = '${chave}'`)
  return pb.collection('configuracoes').update<Configuracao>(existing.id, { valor })
}

/**
 * Busca a configuração de metas operacionais (endpoint com fallback para collection).
 * Acessível a qualquer perfil autenticado (operador, líder, supervisor, admin).
 */
export async function fetchMetasOperacionais(): Promise<import('@/types').MetasOperacionaisConfig> {
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/metas`, {
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    if (res.ok) {
      return (await res.json()) as import('@/types').MetasOperacionaisConfig
    }
  } catch {
    /* intentionally ignored */
  }

  // Fallback direto via SDK
  try {
    const rec = await pb
      .collection('configuracoes')
      .getFirstListItem<Configuracao>("chave = 'metas_operacionais'")
    if (rec && rec.valor) {
      return rec.valor as unknown as import('@/types').MetasOperacionaisConfig
    }
  } catch {
    /* intentionally ignored */
  }

  return {
    global: { contatos_dia: 0, conversoes_semana: 0 },
    por_regiao: {},
  }
}

/**
 * Salva a configuração de metas operacionais (exclusivo ADMIN).
 */
export async function saveMetasOperacionais(
  metas: import('@/types').MetasOperacionaisConfig,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/metas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(metas),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao salvar metas operacionais')
  }

  return res.json()
}

// Regiões de Atendimento
export async function fetchRegioes() {
  return pb.collection('regioes').getFullList<Regiao>({
    sort: 'ordem',
  })
}

export async function updateRegiao(id: string, data: Partial<Regiao>) {
  return pb.collection('regioes').update<Regiao>(id, data)
}

export async function createRegiao(data: Partial<Regiao>) {
  return pb.collection('regioes').create<Regiao>(data)
}

// Queue API calls
export async function reserveNextQueueClient(options?: {
  segmento?: string
  ordenacao?: 'score' | 'antigos' | 'novos'
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/reserve-next`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(options || {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Falha ao reservar cliente na fila')
  }
  return res.json() as Promise<{
    cliente: Cliente | null
    ja_reservado: boolean
    carteira_esgotada?: boolean
    segmento_zerado?: boolean
    total_carteira_sem_filtro?: number
    segunda_passada_executada?: boolean
    message: string
  }>
}

export interface ClienteBuscaCarteiraItem {
  id: string
  codigo: string
  nome: string
  regiao: string
  vendedor: string
  segmento: string
  dias_sem_faturar: number
  faixa: string
  score: number
  estado: string
  operador?: string
  lock_timestamp?: string
  ultimo_faturamento_data?: string
  ultimo_contato: string
  telefone?: string
  whatsapp?: string
  standby_ate?: string
  reativado_em?: string
  em_standby?: boolean
  pedido_em_aberto?: boolean
  status_faturamento?: string
  pedido_reativacao?: string
}

/**
 * Busca clientes por nome/código estritamente dentro da carteira do operador logado.
 * Retorna no máximo 20 registros e valida no servidor o vendedor da rota ou DDDs do atacado.
 */
export async function searchClientesCarteira(termo: string): Promise<{
  items: ClienteBuscaCarteiraItem[]
  total: number
  termo: string
}> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/search-carteira`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({ termo }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao buscar clientes na carteira')
  }
  return res.json()
}

/**
 * Reserva um cliente específico da carteira do operador logado com lock de 30 min.
 * Permite que o operador abra a ficha de um cliente encontrado na busca para atendê-lo
 * ou eliminá-lo da base como "Cliente Ativo — Fora da Base".
 */
export interface ReserveSpecificError extends Error {
  isStandby?: boolean
  standbyAte?: string
  clienteId?: string
  clienteNome?: string
  clienteCodigo?: string
}

export async function reserveSpecificQueueClient(clienteId: string): Promise<{
  cliente: Cliente
  message: string
}> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/reserve-specific`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({ cliente_id: clienteId }),
    },
  )
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    const error = new Error(
      errData.error || errData.message || 'Falha ao reservar cliente',
    ) as ReserveSpecificError
    if (errData.is_standby) {
      error.isStandby = true
      error.standbyAte = errData.standby_ate
      error.clienteId = errData.cliente_id || clienteId
      error.clienteNome = errData.cliente_nome
      error.clienteCodigo = errData.cliente_codigo
    }
    throw error
  }
  return res.json()
}

/**
 * Destrava um cliente em standby de 60 dias (exclusivo para perfil admin).
 * Remove o standby_ate e reativado_em e, se estava como 'reativado', devolve para 'na_base'.
 * Registra rastro de auditoria no servidor (eventos_log e timeline).
 */
export async function destravarClienteStandby(
  clienteId: string,
  motivo?: string,
): Promise<{ ok: boolean; message: string; cliente: Cliente }> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/destravar-standby`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({
        cliente_id: clienteId,
        motivo: motivo || 'Destrave manual de standby autorizado por administrador',
      }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao destravar cliente em standby')
  }
  return res.json()
}

export interface EditarAtendimentoFechadoAdminData {
  cliente_id: string
  respostas: Record<string, unknown>
  desfecho: string
  observacoes?: string
  motivo_edicao: string
  valor_potencial?: number
  toneladas_potencial?: number
}

/**
 * Edita a ficha e desfecho de um atendimento já concluído/fechado (exclusivo admin).
 * Preserva o status de standby/fora da fila intacto e grava rastro de auditoria dupla.
 */
export async function editarAtendimentoFechadoAdmin(
  data: EditarAtendimentoFechadoAdminData,
): Promise<{ ok: boolean; message: string; cliente: Cliente }> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/editar-atendimento-fechado`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao editar atendimento fechado')
  }
  return res.json()
}

export async function fetchInteracoesByOperador(operadorId: string) {
  return pb.collection('interacoes').getFullList<Interacao>({
    filter: `operador = '${operadorId}'`,
    sort: '-created',
    expand: 'cliente',
  })
}

/**
 * Busca clientes reagendados atribuídos a um operador.
 * DEFINIÇÃO UNIFICADA (Auditoria de Consistência):
 * Um cliente reagendado pertence à carteira de follow-up do operador se:
 * 1. O operador foi quem agendou o follow-up (`reagendado_operador = operadorId`) OU
 * 2. O cliente foi repassado / atribuído atualmente a ele (`operador = operadorId`),
 * desde que possua data de reagendamento ativa (`reagendado_para != ''`).
 * Esta regra unifica exatamente a visão de "Meu Painel" e "Dashboard/Equipe".
 */
export async function fetchClientesReagendadosOperador(operadorId: string) {
  return pb.collection('clientes').getFullList<Cliente>({
    filter: `(reagendado_operador = '${operadorId}' || operador = '${operadorId}') && reagendado_para != ''`,
    sort: '-prioridade_transferencia,reagendado_para',
  })
}

export async function releaseQueueLock(clienteId: string, rascunho?: Record<string, unknown>) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/release-lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ cliente_id: clienteId, rascunho_respostas: rascunho }),
  })
  return res.json()
}

export async function transferClienteOperador(data: {
  cliente_id: string
  destino_operador_id: string
  motivo?: string
  rascunho_respostas?: Record<string, unknown>
}) {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/transfer-client`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao transferir cliente')
  }
  return res.json()
}

export async function fetchUsers() {
  return pb.collection('users').getFullList<User>({ sort: 'name' })
}

export async function updateUserProfile(userId: string, data: Partial<User>) {
  return pb.collection('users').update<User>(userId, data)
}

export async function deleteUser(userId: string) {
  return pb.collection('users').delete(userId)
}

/**
 * Redefine a senha de um usuário via endpoint backend protegido (exclusivo admin).
 */
export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string; userId: string; userName: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/admin/reset-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({ userId, newPassword }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Falha ao redefinir senha do usuário')
  }
  return res.json()
}

/**
 * Envia batimento de presença (heartbeat) para o usuário autenticado.
 * Atualiza o last_seen no servidor.
 */
export async function sendPresenceHeartbeat(): Promise<{ ok: boolean; last_seen?: string }> {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/presence/heartbeat`,
      {
        method: 'POST',
        headers: {
          Authorization: pb.authStore.token,
        },
      },
    )
    if (!res.ok) {
      return { ok: false }
    }
    return (await res.json()) as { ok: boolean; last_seen?: string }
  } catch {
    return { ok: false }
  }
}

/**
 * Consulta o status de presença de todos os usuários (exclusivo admin / supervisor).
 */
export async function fetchPresenceStatus(): Promise<import('@/types').PresenceStatusResponse> {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/presence/status`, {
    headers: {
      Authorization: pb.authStore.token,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Falha ao buscar status de presença')
  }
  return res.json()
}

// Kommo API calls
export async function checkKommoStatus() {
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/status`, {
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch (_) {
      return {
        configured: true,
        connected: false,
        subdomain: 'ederbueno.kommo.com',
        mode: 'readonly',
        somente_leitura: true,
        status: 'timeout',
        message:
          'Servidor Kommo demorou para responder ou retornou formato texto. A integração opera em modo Somente Leitura.',
      }
    }
  } catch (err: unknown) {
    return {
      configured: true,
      connected: false,
      subdomain: 'ederbueno.kommo.com',
      mode: 'readonly',
      somente_leitura: true,
      status: 'error',
      message: err instanceof Error ? err.message : 'Falha na conexão com a API',
    }
  }
}

export async function testKommoConnection() {
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/test`, {
      method: 'POST',
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch (_) {
      return {
        ok: false,
        status: 'timeout',
        mode: 'readonly',
        somente_leitura: true,
        message:
          'Tempo limite na chamada Kommo CRM (Backend timeout). Em modo Somente Leitura, dados continuam disponíveis para consulta.',
        testedAt: new Date().toISOString(),
      }
    }
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'error',
      mode: 'readonly',
      somente_leitura: true,
      message: err instanceof Error ? err.message : 'Falha de comunicação com o servidor',
      testedAt: new Date().toISOString(),
    }
  }
}

/**
 * Consulta a lista de usuários do Kommo CRM em cache ou via endpoint somente-leitura.
 * Nunca grava no CRM.
 */
export async function fetchKommoUsers(): Promise<import('@/types').KommoUserItem[]> {
  // 1. Tentar rota dedicada /backend/v1/kommo/users
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/users`, {
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.users) && data.users.length > 0) {
        return data.users
      }
    }
  } catch {
    /* fallback */
  }

  // 2. Fallback: ler do registro 'kommo_config' em configuracoes (inspecao.users)
  try {
    const cfg = await pb
      .collection('configuracoes')
      .getFirstListItem<{ valor?: { inspecao?: { users?: import('@/types').KommoUserItem[] } } }>(
        "chave = 'kommo_config'",
      )
    const cachedUsers = cfg.valor?.inspecao?.users
    if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
      return cachedUsers.map((u) => ({
        id: String(u.id),
        name: u.name || '',
        email: u.email || '',
      }))
    }
  } catch {
    /* ignore */
  }

  return []
}

/**
 * Vincula ou desvincula a conta de um usuário do sistema local com uma identidade do Kommo CRM.
 * Exclusivo admin. Nunca grava no Kommo (somente-leitura) — salva kommo_user_id e kommo_user_nome no banco local.
 */
export async function linkKommoUser(params: {
  userId: string
  kommoUserId?: string
  kommoUserNome?: string
}): Promise<{ ok: boolean; message: string; user?: Partial<User> }> {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/link-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Falha ao vincular usuário com Kommo')
  }
  return res.json()
}

export async function syncKommoLead(data: {
  cliente_id: string
  action: 'reserve' | 'finalize'
  desfecho?: string
  observacoes?: string
}) {
  // Modo SOMENTE-LEITURA estrito restaurado: nenhuma escrita é enviada ao Kommo
  return { ok: true, readonly: true, skipped: true, data }
}

/**
 * Conclui faturamento de um cliente com pedido em aberto.
 * Chamada autenticada para POST /backend/v1/queue/concluir-faturamento
 */
export async function concluirFaturamentoPedido(params: {
  cliente_id: string
  data_faturamento: string
  valor_faturado: number
  numero_nf_fatura?: string
  observacoes?: string
}): Promise<{ ok: boolean; message: string; cliente: Cliente }> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/concluir-faturamento`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify(params),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao concluir faturamento')
  }
  return res.json()
}

// Process spreadsheet rows
export async function processSpreadsheetRows(data: {
  rows: Record<string, unknown>[]
  fileName: string
  substituicaoTotal: boolean
  modoImportacao?: 'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/import/process-rows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Falha ao processar planilha no servidor')
  }
  return res.json()
}

export interface ItemImportacaoFormulario {
  linha?: number
  codigoCliente: string
  nomeCliente?: string
  operadorEmail?: string
  operadorNome?: string
  dataInicio?: string
  dataConclusao?: string
  motivoInterrupcao?: string
  avaliacaoGeral?: string | number
  houveErro?: string
  naturezaFalha?: string
  setorFalha?: string
  anexoUrl?: string
  necessarioVoltar?: string
  probabilidadeRetomada?: string
  desfechoCru?: string
  desfechoNormalizado?: string
  valorPotencial?: number
  toneladasPotencial?: number
  observacaoGeral?: string
  numeroPedido?: string
  respostasPayload?: Record<string, unknown>
}

export interface RespostaImportacaoFormularioResultado {
  ok: boolean
  totalLidos: number
  importadas: number
  duplicadas: number
  reativacoesCompletas: number
  clientesNaoEncontrados: string[]
  totalNaoEncontrados: number
  erros: Array<{ linha: number; erro: string }>
  dryRun?: boolean
  prontosParaImportar?: number
}

/**
 * Envia itens normalizados de respostas de formulário para gravação no servidor (exclusivo admin).
 */
export async function importarRespostasFormulario(data: {
  items: ItemImportacaoFormulario[]
  dryRun?: boolean
}): Promise<RespostaImportacaoFormularioResultado> {
  const res = await fetch(
    `${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/import/respostas-formulario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao importar respostas do formulário')
  }
  return res.json()
}

// Bases de Referência (armzenamento de planilhas cruas para definição do mapeamento do banco)
export async function fetchBasesReferencia() {
  return pb.collection('bases_referencia').getFullList<import('@/types').BaseReferencia>({
    sort: '-created',
    expand: 'enviado_por',
  })
}

export async function createBaseReferencia(formData: FormData) {
  return pb.collection('bases_referencia').create<import('@/types').BaseReferencia>(formData, {
    expand: 'enviado_por',
  })
}

export async function updateBaseReferencia(
  id: string,
  data: Partial<import('@/types').BaseReferencia>,
) {
  return pb.collection('bases_referencia').update<import('@/types').BaseReferencia>(id, data, {
    expand: 'enviado_por',
  })
}

export async function deleteBaseReferencia(id: string) {
  return pb.collection('bases_referencia').delete(id)
}

/**
 * Agrega métricas de atendimentos gerais e por operador para o Dashboard.
 * Utiliza EXATAMENTE as mesmas definições de MeuPainel e da Gamificação,
 * aplicando os filtros de período e região selecionados pelo usuário.
 */
export async function fetchMetricasAtendimentosDashboard(options?: {
  periodo?: import('@/types').PeriodoAtendimentoFiltro
  regiao?: string
  segmento?: string
  vendedor?: string
  operador?: string
  faixaInatividade?: string
  faixaScore?: string
  faixaFaturamento?: string
  desfecho?: string
}): Promise<import('@/types').MetricasAtendimentosDashboard> {
  const periodo = options?.periodo || 'hoje'
  const regiaoFiltro = options?.regiao && options.regiao !== 'todas' ? options.regiao : null
  const segmentoFiltro = options?.segmento && options.segmento !== 'todos' ? options.segmento : null
  const vendedorFiltro = options?.vendedor && options.vendedor !== 'todos' ? options.vendedor : null
  const operadorFiltro = options?.operador && options.operador !== 'todos' ? options.operador : null
  const faixaInatFiltro =
    options?.faixaInatividade && options.faixaInatividade !== 'todas'
      ? options.faixaInatividade
      : null
  const faixaScoreFiltro =
    options?.faixaScore && options.faixaScore !== 'todas' ? options.faixaScore : null
  const faixaFatFiltro =
    options?.faixaFaturamento && options.faixaFaturamento !== 'todas'
      ? options.faixaFaturamento
      : null
  const desfechoFiltro = options?.desfecho && options.desfecho !== 'todos' ? options.desfecho : null

  // Construir janelas de data alinhadas ao fuso de Brasília (America/Sao_Paulo)
  const now = new Date()
  const hojeStr = getBrasiliaDateStr(now)

  // Filtro de data PocketBase para interações
  let pbInteracoesFilter = ''
  if (periodo === 'hoje') {
    // Início de hoje no fuso de Brasília convertido para UTC
    const inicioHojeBrt = createBrasiliaDate(
      getBrasiliaParts(now).year,
      getBrasiliaParts(now).month,
      getBrasiliaParts(now).day,
      0,
      0,
    )
    pbInteracoesFilter = `created >= '${inicioHojeBrt.toISOString().replace('T', ' ').slice(0, 19)}'`
  } else if (periodo === '7dias') {
    const seteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    pbInteracoesFilter = `created >= '${getBrasiliaDateStr(seteDiasAtras)} 00:00:00'`
  } else if (periodo === '30dias') {
    const trintaDiasAtras = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    pbInteracoesFilter = `created >= '${getBrasiliaDateStr(trintaDiasAtras)} 00:00:00'`
  }

  // Buscar em paralelo: usuários, interações do período (com expand cliente), clientes reagendados e clientes marcados como ativo_fora_base
  const [users, interacoes, reagendados, rankingData, clientesAtivosRemovidos] = await Promise.all([
    pb.collection('users').getFullList<import('@/types').User>({ sort: 'name' }),
    pb.collection('interacoes').getFullList<Interacao>({
      filter: pbInteracoesFilter || undefined,
      sort: '-created',
      expand: 'cliente,operador',
    }),
    pb.collection('clientes').getFullList<Cliente>({
      filter: "reagendado_para != '' || estado = 'reagendado'",
    }),
    calculateRankingData({ periodo, regiao: regiaoFiltro || undefined }).catch(() => null),
    pb
      .collection('clientes')
      .getFullList<Cliente>({
        filter: "ativo_fora_base = true || estado = 'ativo_fora_base'",
        sort: '-updated',
      })
      .catch(() => [] as Cliente[]),
  ])

  // Mapa de operadores e usuários
  const usersMap = new Map<string, import('@/types').User>()
  for (const u of users) {
    usersMap.set(u.id, u)
  }

  const normalizarNomeRegiao = (nome?: string | null): string => {
    if (!nome) return ''
    const upper = nome.trim().toUpperCase()
    if (
      upper === 'BRAGANÇA' ||
      upper === 'BRAGANCA' ||
      upper === 'BRAGANÇA PAULISTA' ||
      upper === 'BRAGANCA PAULISTA'
    )
      return 'BRAGANÇA'
    if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') return 'JUNDIAÍ'
    if (upper === 'VARGINHA') return 'VARGINHA'
    if (upper === 'POUSO ALEGRE') return 'POUSO ALEGRE'
    if (
      upper === 'POÇOS DE CALDAS' ||
      upper === 'POCOS DE CALDAS' ||
      upper === 'POÇOS CALDAS' ||
      upper === 'POCOS CALDAS'
    )
      return 'POÇOS DE CALDAS'
    if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') return 'ITAJUBÁ'
    if (upper === 'EXTREMA') return 'EXTREMA'
    if (
      upper === 'CAMBUÍ' ||
      upper === 'CAMBUI' ||
      upper === 'MICRO-REGIÃO' ||
      upper === 'MICRO REGIAO' ||
      upper === 'MICROREGIAO'
    )
      return 'CAMBUÍ'
    if (upper === 'ATACADO') return 'ATACADO'
    if (upper === 'REPESCAGEM') return 'REPESCAGEM'
    if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') return 'Sem Região'
    return nome.trim()
  }

  // Normalizador de região para comparação segura
  const matchRegiao = (r1?: string | null, r2?: string | null): boolean => {
    if (!r1 || !r2) return false
    const n1 = normalizarNomeRegiao(r1).toUpperCase()
    const n2 = normalizarNomeRegiao(r2).toUpperCase()
    if (n1 === n2) return true
    if (n1.includes(n2) || n2.includes(n1)) return true
    return false
  }

  // Filtrar usuários por região se selecionado
  const filteredUsers = users.filter((u) => {
    if (!regiaoFiltro || regiaoFiltro === 'todas') return true
    if (u.regioes && u.regioes.length > 0) {
      return u.regioes.some((r) => matchRegiao(r, regiaoFiltro))
    }
    // Usuário sem região atribuída (só inclui se filtro for 'Sem Região')
    const filtroUpper = regiaoFiltro.trim().toUpperCase()
    if (filtroUpper === 'SEM REGIÃO' || filtroUpper === 'SEM REGIAO') {
      return true
    }
    return false
  })

  // Operadores, supervisores e líderes que participam do atendimento
  // (e qualquer usuário que tenha atendimentos computados)
  const operadoresList = filteredUsers.filter(
    (u) => u.role === 'operador' || u.role === 'supervisor' || u.role === 'lider',
  )

  // Mapa de pontos de gamificação e títulos indexados por usuário
  const gamificacaoPorUsuario = new Map<
    string,
    { pontos: number; titulo?: { nome: string; emoji: string } }
  >()
  if (rankingData?.ranking) {
    for (const r of rankingData.ranking) {
      gamificacaoPorUsuario.set(r.usuario.id, {
        pontos: r.pontos,
        titulo: r.tituloAtual
          ? { nome: r.tituloAtual.nome, emoji: r.tituloAtual.emoji }
          : undefined,
      })
    }
  }

  // Verificador se cliente atende a todos os filtros combinados adicionais
  const isClienteMatchingFilters = (c?: Cliente): boolean => {
    if (!c) return true
    // Segmento
    if (
      segmentoFiltro &&
      (c.segmento || '').trim().toUpperCase() !== segmentoFiltro.trim().toUpperCase()
    ) {
      return false
    }
    // Vendedor
    if (
      vendedorFiltro &&
      (c.vendedor || '').trim().toUpperCase() !== vendedorFiltro.trim().toUpperCase()
    ) {
      return false
    }
    // Operador
    if (operadorFiltro && c.operador !== operadorFiltro) {
      return false
    }
    // Faixa Inatividade
    if (faixaInatFiltro) {
      const dias = c.dias_sem_faturar || 0
      if (faixaInatFiltro === '60_89' && (dias < 60 || dias > 89)) return false
      if (faixaInatFiltro === '90_179' && (dias < 90 || dias > 179)) return false
      if (faixaInatFiltro === '180_365' && (dias < 180 || dias > 365)) return false
      if (faixaInatFiltro === '365_plus' && dias <= 365) return false
      if (faixaInatFiltro === 'menos_60' && dias >= 60) return false
    }
    // Faixa Score
    if (faixaScoreFiltro) {
      const s = c.score || 0
      if (faixaScoreFiltro === 'baixo' && s >= 30) return false
      if (faixaScoreFiltro === 'medio' && (s < 30 || s > 60)) return false
      if (faixaScoreFiltro === 'alto' && s <= 60) return false
    }
    // Faixa Faturamento Histórico
    if (faixaFatFiltro) {
      const fat = c.fat_12m_reais || 0
      if (faixaFatFiltro === 'zero' && fat > 0) return false
      if (faixaFatFiltro === 'ate_10k' && fat > 10000) return false
      if (faixaFatFiltro === '10k_50k' && (fat <= 10000 || fat > 50000)) return false
      if (faixaFatFiltro === '50k_150k' && (fat <= 50000 || fat > 150000)) return false
      if (faixaFatFiltro === 'mais_150k' && fat <= 150000) return false
    }
    // Desfecho / Estado
    if (desfechoFiltro) {
      if (desfechoFiltro === 'reativado' && c.estado !== 'reativado') return false
      if (desfechoFiltro === 'reagendado' && c.estado !== 'reagendado') return false
      if (
        desfechoFiltro === 'venda_perdida' &&
        !['compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato'].includes(
          c.estado || '',
        )
      )
        return false
      if (desfechoFiltro === 'restricao_financeira' && c.estado !== 'restricao_financeira')
        return false
      if (
        desfechoFiltro === 'em_atendimento' &&
        !['em_atendimento', 'reservado'].includes(c.estado || '')
      )
        return false
      if (desfechoFiltro === 'na_base' && c.estado !== 'na_base') return false
      if (desfechoFiltro === 'contatado' && c.estado !== 'contatado') return false
    }
    return true
  }

  // Filtragem de interações por região e filtros combinados
  const isInteracaoMatchingRegion = (it: Interacao): boolean => {
    // Filtro de Operador direto na interação
    if (operadorFiltro && it.operador !== operadorFiltro) {
      return false
    }
    // Filtro de Desfecho direto na interação
    if (desfechoFiltro) {
      const d = it.desfecho || ''
      if (
        desfechoFiltro === 'reativado' &&
        !['reativado', 'reativado_com_pedido', 'fechou_pedido'].includes(d) &&
        !it.numero_pedido
      )
        return false
      if (desfechoFiltro === 'reagendado' && d !== 'reagendado' && !it.reagendado_para) return false
      if (
        desfechoFiltro === 'venda_perdida' &&
        !['compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato'].includes(
          d,
        )
      )
        return false
      if (desfechoFiltro === 'restricao_financeira' && d !== 'restricao_financeira') return false
      if (desfechoFiltro === 'contatado' && d !== 'contatado') return false
    }

    const cliente = it.expand?.cliente
    if (cliente && !isClienteMatchingFilters(cliente)) {
      return false
    }

    if (!regiaoFiltro || regiaoFiltro === 'todas') return true
    const clienteRegiao = cliente?.regiao
    if (clienteRegiao) {
      return matchRegiao(clienteRegiao, regiaoFiltro)
    }
    // Se não tiver região no cliente, checar regiões do operador
    const op = it.operador ? usersMap.get(it.operador) : undefined
    if (op?.regioes && op.regioes.length > 0) {
      return op.regioes.some((r) => matchRegiao(r, regiaoFiltro))
    }
    const filtroUpper = regiaoFiltro.trim().toUpperCase()
    if (filtroUpper === 'SEM REGIÃO' || filtroUpper === 'SEM REGIAO') {
      return !clienteRegiao && (!op?.regioes || op.regioes.length === 0)
    }
    return false
  }

  const interacoesValidas = interacoes.filter(isInteracaoMatchingRegion)
  // Follow-ups no período e reagendados
  const isReagendadoMatchingRegion = (c: Cliente): boolean => {
    if (!isClienteMatchingFilters(c)) return false
    if (!regiaoFiltro || regiaoFiltro === 'todas') return true
    if (c.regiao) {
      return matchRegiao(c.regiao, regiaoFiltro)
    }
    const filtroUpper = regiaoFiltro.trim().toUpperCase()
    if (filtroUpper === 'SEM REGIÃO' || filtroUpper === 'SEM REGIAO') {
      return !c.regiao || c.regiao.trim() === ''
    }
    return false
  }

  const reagendadosValidos = reagendados.filter(isReagendadoMatchingRegion)

  // Follow-ups do dia (reagendados para HOJE no fuso de Brasília)
  const followUpsHojeList = reagendadosValidos.filter((c) => {
    if (!c.reagendado_para) return false
    return getBrasiliaDateStr(new Date(c.reagendado_para)) === hojeStr
  })

  // Follow-ups pendentes (reagendados com data <= hoje que continuam em estado reagendado)
  const followUpsPendentesList = reagendadosValidos.filter((c) => {
    if (!c.reagendado_para) return false
    return getBrasiliaDateStr(new Date(c.reagendado_para)) <= hojeStr
  })

  // Cálculo por operador
  const opMetricsMap = new Map<
    string,
    {
      atendimentos: number
      ligacoes: number
      conversoes: number
      reagendamentos: number
      followUpsHoje: number
      vendasPerdidas: number
    }
  >()

  // Inicializar todos os operadores da lista
  for (const op of operadoresList) {
    opMetricsMap.set(op.id, {
      atendimentos: 0,
      ligacoes: 0,
      conversoes: 0,
      reagendamentos: 0,
      followUpsHoje: 0,
      vendasPerdidas: 0,
    })
  }

  // Preencher follow-ups de hoje por operador
  for (const c of followUpsHojeList) {
    const opId = c.reagendado_operador || c.operador
    if (opId && opMetricsMap.has(opId)) {
      opMetricsMap.get(opId)!.followUpsHoje += 1
    }
  }

  // Processar interações
  for (const it of interacoesValidas) {
    const opId = it.operador
    let m = opId ? opMetricsMap.get(opId) : undefined

    if (!m && opId && usersMap.has(opId)) {
      // Se não estava no filtro de operador mas a interação pertence a um usuário válido
      m = {
        atendimentos: 0,
        ligacoes: 0,
        conversoes: 0,
        reagendamentos: 0,
        followUpsHoje: 0,
        vendasPerdidas: 0,
      }
      opMetricsMap.set(opId, m)
    }

    const isLigacao = isLigacaoOuChamada(it)
    const isConv = isConversao(it)
    const isReagendamento = it.desfecho === 'reagendado' || Boolean(it.reagendado_para)
    const isVendaPerdida =
      it.desfecho === 'compra_terceiros' ||
      it.desfecho === 'nao_quer_negociar' ||
      it.desfecho === 'restricao_financeira' ||
      it.desfecho === 'sem_contato'

    if (m) {
      m.atendimentos += 1
      if (isLigacao) m.ligacoes += 1
      if (isConv) m.conversoes += 1
      if (isReagendamento) m.reagendamentos += 1
      if (isVendaPerdida) m.vendasPerdidas += 1
    }
  }

  // Montar lista de operadores
  const operadoresResumo: import('@/types').MetricasAtendimentoOperador[] = []

  for (const op of operadoresList) {
    const m = opMetricsMap.get(op.id) || {
      atendimentos: 0,
      ligacoes: 0,
      conversoes: 0,
      reagendamentos: 0,
      followUpsHoje: 0,
      vendasPerdidas: 0,
    }

    const taxa = calcularTaxaConversao(m.conversoes, m.ligacoes)
    const gam = gamificacaoPorUsuario.get(op.id)

    const regioesStr =
      op.regioes && op.regioes.length > 0 ? op.regioes.join(', ') : 'Sem Região Atribuída'

    operadoresResumo.push({
      operadorId: op.id,
      operadorNome: op.name || op.email,
      operadorEmail: op.email,
      regiao: regioesStr,
      role: op.role,
      atendimentos: m.atendimentos,
      ligacoes: m.ligacoes,
      conversoes: m.conversoes,
      reagendamentos: m.reagendamentos,
      followUpsHoje: m.followUpsHoje,
      vendasPerdidas: m.vendasPerdidas,
      taxaConversao: taxa,
      pontosGamificacao: gam?.pontos || 0,
      tituloGamificacao: gam?.titulo,
    })
  }

  // Ordenação padrão: por conversões desc, depois por atendimentos desc
  operadoresResumo.sort((a, b) => {
    if (b.conversoes !== a.conversoes) return b.conversoes - a.conversoes
    return b.atendimentos - a.atendimentos
  })

  // Totais Gerais (Nível 1)
  const totalGeralAtendimentos = interacoesValidas.length
  const totalGeralLigacoes = interacoesValidas.filter((i) => isLigacaoOuChamada(i)).length
  const totalGeralConversoes = interacoesValidas.filter((i) => isConversao(i)).length
  const totalGeralReagendamentos = interacoesValidas.filter(
    (i) => i.desfecho === 'reagendado' || Boolean(i.reagendado_para),
  ).length
  const totalGeralVendasPerdidas = interacoesValidas.filter(
    (i) =>
      i.desfecho === 'compra_terceiros' ||
      i.desfecho === 'nao_quer_negociar' ||
      i.desfecho === 'restricao_financeira' ||
      i.desfecho === 'sem_contato',
  ).length
  const taxaGeral = calcularTaxaConversao(totalGeralConversoes, totalGeralLigacoes)

  // ==========================================
  // AGREGADOR: CLIENTES ATIVOS REMOVIDOS DA BASE
  // ==========================================
  // Encontrar todas as interações de desfecho 'ativo_fora_base' (completas do banco ou do período)
  // Mapeamos a última interação por cliente para capturar o operador que registrou, observação e data exata
  const interacoesAtivoForaBase = await pb
    .collection('interacoes')
    .getFullList<Interacao>({
      filter: "desfecho = 'ativo_fora_base'",
      sort: '-created',
      expand: 'cliente,operador',
    })
    .catch(() => [] as Interacao[])

  // Mapa clienteId -> última interação de ativo_fora_base
  const mapInteracaoPorCliente = new Map<string, Interacao>()
  for (const it of interacoesAtivoForaBase) {
    const cId = it.cliente || it.expand?.cliente?.id
    if (cId && !mapInteracaoPorCliente.has(cId)) {
      mapInteracaoPorCliente.set(cId, it)
    }
  }

  // Filtrar clientes ativos removidos pelo filtro de região e de período
  const ativosRemovidosFiltrados: ClienteAtivoRemovidoItem[] = []
  const breakdownMotivos: Record<string, number> = {
    'Compra por CPF de terceiro': 0,
    'Compra por CNPJ de terceiro / coligada': 0,
    'Acompanhamento periódico do vendedor': 0,
    'Cliente ativo em outro cadastro/filial': 0,
    'Cliente Final — Uso Pessoal': 0,
    'Outros motivos': 0,
  }

  // Função auxiliar de normalização de categoria de motivo
  const categorizarMotivo = (motivoRaw?: string): string => {
    if (!motivoRaw) return 'Outros motivos'
    const lower = motivoRaw.toLowerCase()
    if (
      lower.includes('cliente final') ||
      lower.includes('uso pessoal') ||
      lower.includes('cliente_final')
    ) {
      return 'Cliente Final — Uso Pessoal'
    }
    if (lower.includes('cpf')) return 'Compra por CPF de terceiro'
    if (lower.includes('cnpj') || lower.includes('coligada'))
      return 'Compra por CNPJ de terceiro / coligada'
    if (lower.includes('acompanhamento') || lower.includes('vendedor'))
      return 'Acompanhamento periódico do vendedor'
    if (lower.includes('faturando') || lower.includes('filial') || lower.includes('outro cadastro'))
      return 'Cliente ativo em outro cadastro/filial'
    return 'Outros motivos'
  }

  // Juntar clientes com flag ativo_fora_base e os que têm interação ativo_fora_base
  const clientesIdsProcessados = new Set<string>()

  // Lista combinada de clientes
  const listaCandidatosAtivos = [...clientesAtivosRemovidos]
  for (const it of interacoesAtivoForaBase) {
    if (it.expand?.cliente && !listaCandidatosAtivos.some((c) => c.id === it.expand!.cliente!.id)) {
      listaCandidatosAtivos.push(it.expand.cliente)
    }
  }

  for (const c of listaCandidatosAtivos) {
    if (clientesIdsProcessados.has(c.id)) continue

    // Checar filtro de região
    if (regiaoFiltro && regiaoFiltro !== 'todas') {
      if (!matchRegiao(c.regiao, regiaoFiltro)) {
        continue
      }
    }

    const it = mapInteracaoPorCliente.get(c.id)
    const dataRemocao = it?.created || c.updated || c.created

    // Checar filtro de período com base na data de remoção
    if (periodo === 'hoje') {
      if (getBrasiliaDateStr(new Date(dataRemocao)) !== hojeStr) continue
    } else if (periodo === '7dias') {
      const seteDiasAtrasStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      if (dataRemocao < seteDiasAtrasStr) continue
    } else if (periodo === '30dias') {
      const trintaDiasAtrasStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      if (dataRemocao < trintaDiasAtrasStr) continue
    }

    clientesIdsProcessados.add(c.id)

    // Validar se cliente atende aos filtros adicionais
    if (!isClienteMatchingFilters(c)) {
      continue
    }

    // Extrair motivo e observação
    const motivoBruto =
      c.motivo_ativo_fora_base || it?.motivo || it?.conteudo || 'Motivo não informado'
    let motivoPrincipal = motivoBruto
    let observacaoExtra = ''

    if (motivoBruto.includes(' — ')) {
      const parts = motivoBruto.split(' — ')
      motivoPrincipal = parts[0].trim()
      observacaoExtra = parts.slice(1).join(' — ').trim()
    }

    const categoria = categorizarMotivo(motivoPrincipal)
    breakdownMotivos[categoria] = (breakdownMotivos[categoria] || 0) + 1

    const opUser = it?.expand?.operador || (c.operador ? usersMap.get(c.operador) : undefined)
    const operadorNome =
      opUser?.name || opUser?.email || (it?.operador ? 'Operador registrado' : 'Sistema / Manual')

    ativosRemovidosFiltrados.push({
      id: c.id,
      codigo: c.codigo || '—',
      nome: c.nome || 'Cliente sem nome',
      regiao: c.regiao || 'Sem Região',
      motivo_completo: motivoBruto,
      motivo_categoria: categoria,
      observacao: observacaoExtra,
      operador_nome: operadorNome,
      operador_id: it?.operador || c.operador,
      data_remocao: dataRemocao,
    })
  }

  // Ordenar mais recentes primeiro
  ativosRemovidosFiltrados.sort((a, b) => (b.data_remocao > a.data_remocao ? 1 : -1))

  const ativosRemovidosMetricas: MetricasAtivosRemovidos = {
    total: ativosRemovidosFiltrados.length,
    breakdown: breakdownMotivos,
    itens: ativosRemovidosFiltrados,
  }

  return {
    gerais: {
      totalAtendimentos: totalGeralAtendimentos,
      ligacoesFeitas: totalGeralLigacoes,
      conversoes: totalGeralConversoes,
      reagendamentos: totalGeralReagendamentos,
      followUpsHoje: followUpsHojeList.length,
      followUpsPendentes: followUpsPendentesList.length,
      vendasPerdidas: totalGeralVendasPerdidas,
      taxaConversao: taxaGeral,
    },
    operadores: operadoresResumo,
    ativosRemovidos: ativosRemovidosMetricas,
  }
}

/**
 * Busca detalhada de clientes ativos removidos da base com paginação/listagem
 * para a tela de Relatórios e Auditoria.
 */
export async function fetchClientesAtivosRemovidos(options?: {
  regiao?: string
  periodo?: import('@/types').PeriodoAtendimentoFiltro
}): Promise<MetricasAtivosRemovidos> {
  const dashData = await fetchMetricasAtendimentosDashboard({
    periodo: options?.periodo || 'total',
    regiao: options?.regiao,
  })
  return (
    dashData.ativosRemovidos || {
      total: 0,
      breakdown: {},
      itens: [],
    }
  )
}

/**
 * Consulta agregações e contagens reais da base de clientes diretamente no servidor (SQLite).
 * Substitui o download de 23k+ registros pelo navegador, entregando contagens e totais em milissegundos.
 */
/**
 * Consulta agregações e cruzamentos de dados avançados da base de clientes
 * com filtros combinados (AND) calculados diretamente no backend SQLite.
 */
export async function fetchReportsAnalytics(
  filtros?: import('@/types').FiltrosRelatoriosAvancados,
): Promise<import('@/types').ReportsAnalyticsResponse> {
  const params = new URLSearchParams()
  if (filtros?.regiao && filtros.regiao !== 'todas') params.set('regiao', filtros.regiao)
  if (filtros?.segmento && filtros.segmento !== 'todos') params.set('segmento', filtros.segmento)
  if (filtros?.vendedor && filtros.vendedor !== 'todos') params.set('vendedor', filtros.vendedor)
  if (filtros?.operador && filtros.operador !== 'todos') params.set('operador', filtros.operador)
  if (filtros?.faixaInatividade && filtros.faixaInatividade !== 'todas')
    params.set('faixaInatividade', filtros.faixaInatividade)
  if (filtros?.faixaScore && filtros.faixaScore !== 'todas')
    params.set('faixaScore', filtros.faixaScore)
  if (filtros?.faixaFaturamento && filtros.faixaFaturamento !== 'todas')
    params.set('faixaFaturamento', filtros.faixaFaturamento)
  if (filtros?.desfecho && filtros.desfecho !== 'todos') params.set('desfecho', filtros.desfecho)
  if (filtros?.periodo) params.set('periodo', filtros.periodo)
  if (filtros?.baseCategoria) params.set('baseCategoria', filtros.baseCategoria)

  const basePbUrl = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
  const queryStr = params.toString()
  const url = `${basePbUrl}/backend/v1/metrics/reports-analytics${queryStr ? `?${queryStr}` : ''}`

  const token = pb.authStore.token || ''
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = token
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      err.error ||
        err.message ||
        `Falha ao calcular análises e cruzamentos de relatórios (${res.status})`,
    )
  }

  return res.json()
}

export async function fetchMetricasBaseKpis(options?: {
  regiao?: string
  baseCategoria?: string
}): Promise<import('@/types').MetricasBaseKpisResponse> {
  const params = new URLSearchParams()
  const regiao = options?.regiao?.trim()
  if (regiao && regiao.toLowerCase() !== 'todas') {
    params.set('regiao', regiao)
  }
  if (options?.baseCategoria) {
    params.set('baseCategoria', options.baseCategoria)
  }
  const basePbUrl = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
  const queryStr = params.toString()
  const url = `${basePbUrl}/backend/v1/metrics/base-kpis${queryStr ? `?${queryStr}` : ''}`

  // Garantir token atualizado da authStore (e headers compatíveis com PocketBase)
  const token = pb.authStore.token || ''
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = token
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const statusMsg = res.status === 401 ? 'Não autenticado no servidor (sessão expirada)' : ''
    throw new Error(
      err.error ||
        err.message ||
        statusMsg ||
        `Falha ao buscar KPIs de base no servidor (${res.status})`,
    )
  }

  const data = await res.json()
  // Normalização defensiva da resposta (garante kpis.totalBase e kpis.naFila tanto em camelCase quanto snake_case)
  const kpisRaw = data?.kpis || {}
  const totalBase = Number(
    kpisRaw.totalBase ?? kpisRaw.total_base ?? data.totalBase ?? data.total_base ?? 0,
  )
  const naFila = Number(kpisRaw.naFila ?? kpisRaw.na_fila ?? data.naFila ?? data.na_fila ?? 0)
  const reativados = Number(
    kpisRaw.reativadosReais ??
      kpisRaw.reativados ??
      kpisRaw.reativado ??
      data.reativadosReais ??
      data.reativados ??
      0,
  )
  const taxaReativacao = Number(
    kpisRaw.taxaReativacaoFloat ??
      kpisRaw.taxaReativacao ??
      kpisRaw.taxa_reativacao ??
      data.taxaReativacao ??
      0,
  )
  const valorRecuperado = Number(
    kpisRaw.valorRecuperado ?? kpisRaw.valor_recuperado ?? data.valorRecuperado ?? 0,
  )
  const toneladasRecuperadas = Number(
    kpisRaw.toneladasRecuperadas ?? kpisRaw.toneladas_recuperadas ?? data.toneladasRecuperadas ?? 0,
  )
  const faturamentoRecenteCruzamento = Number(
    kpisRaw.faturamentoRecenteCruzamento ??
      kpisRaw.faturamento_recente_cruzamento ??
      data.faturamentoRecenteCruzamento ??
      data.faturamento_recente_cruzamento ??
      0,
  )
  const valorFaturamentoCruzamento = Number(
    kpisRaw.valorFaturamentoCruzamento ??
      kpisRaw.valor_faturamento_recente_cruzamento ??
      data.valorFaturamentoCruzamento ??
      data.valor_faturamento_recente_cruzamento ??
      0,
  )
  const toneladasFaturamentoCruzamento = Number(
    kpisRaw.toneladasFaturamentoCruzamento ??
      kpisRaw.toneladas_faturamento_recente_cruzamento ??
      data.toneladasFaturamentoCruzamento ??
      data.toneladas_faturamento_recente_cruzamento ??
      0,
  )
  const pedidosEmAberto = Number(
    kpisRaw.pedidosEmAberto ??
      kpisRaw.pedidos_em_aberto ??
      data.pedidosEmAberto ??
      data.pedidos_em_aberto ??
      0,
  )
  const valorPedidosEmAberto = Number(
    kpisRaw.valorPedidosEmAberto ??
      kpisRaw.valor_pedidos_em_aberto ??
      data.valorPedidosEmAberto ??
      data.valor_pedidos_em_aberto ??
      0,
  )

  return {
    kpis: {
      totalBase,
      naFila,
      reativados,
      reativadosReais: reativados,
      taxaReativacao,
      taxaReativacaoFloat: taxaReativacao,
      valorRecuperado,
      toneladasRecuperadas,
      faturamentoRecenteCruzamento,
      valorFaturamentoCruzamento,
      toneladasFaturamentoCruzamento,
      pedidosEmAberto,
      pedidos_em_aberto: pedidosEmAberto,
      valorPedidosEmAberto,
      valor_pedidos_em_aberto: valorPedidosEmAberto,
      reativadosTotalBruto: Number(
        kpisRaw.reativadosTotalBruto ?? kpisRaw.reativado_total ?? data.reativadosTotalBruto ?? 0,
      ),
      valorRecuperadoTotalBruto: Number(
        kpisRaw.valorRecuperadoTotalBruto ?? data.valorRecuperadoTotalBruto ?? 0,
      ),
    },
    estadosContagem: data.estadosContagem || {},
    regioesMap: data.regioesMap || {},
  }
}

// Re-export diagnóstico e gamificação APIs
export * from './diagnostico'
export * from './gamificacao'
