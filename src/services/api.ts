import pb from '@/lib/pocketbase/client'
import { calculateRankingData } from './gamificacao'
import type {
  Cliente,
  Interacao,
  RespostaFormulario,
  Importacao,
  Configuracao,
  Regiao,
  User,
} from '@/types'

export async function fetchClientes(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
  expand?: string
}) {
  return pb.collection('clientes').getList<Cliente>(params?.page || 1, params?.perPage || 20, {
    filter: params?.filter,
    sort: params?.sort || '-score',
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
    expand: 'operador',
  })
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
}) {
  return pb.collection('respostas_formulario').create<RespostaFormulario>(data)
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
  return res.json() as Promise<{ cliente: Cliente | null; ja_reservado: boolean; message: string }>
}

export async function fetchInteracoesByOperador(operadorId: string) {
  return pb.collection('interacoes').getFullList<Interacao>({
    filter: `operador = '${operadorId}'`,
    sort: '-created',
    expand: 'cliente',
  })
}

export async function fetchClientesReagendadosOperador(operadorId: string) {
  return pb.collection('clientes').getFullList<Cliente>({
    filter: `reagendado_operador = '${operadorId}' && reagendado_para != ''`,
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

export async function syncKommoLead(data: {
  cliente_id: string
  action: 'reserve' | 'finalize'
  desfecho?: string
  observacoes?: string
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/sync-lead`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(data),
  })
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
}): Promise<import('@/types').MetricasAtendimentosDashboard> {
  const periodo = options?.periodo || 'hoje'
  const regiaoFiltro = options?.regiao && options.regiao !== 'todas' ? options.regiao : null

  // Construir janelas de data
  const now = new Date()
  const hojeStr = now.toISOString().slice(0, 10)

  // Filtro de data PocketBase para interações
  let pbInteracoesFilter = ''
  if (periodo === 'hoje') {
    // Interações criadas a partir do início de hoje UTC
    pbInteracoesFilter = `created >= '${hojeStr} 00:00:00'`
  } else if (periodo === '7dias') {
    const seteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    pbInteracoesFilter = `created >= '${seteDiasAtras.toISOString().slice(0, 10)} 00:00:00'`
  } else if (periodo === '30dias') {
    const trintaDiasAtras = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    pbInteracoesFilter = `created >= '${trintaDiasAtras.toISOString().slice(0, 10)} 00:00:00'`
  }

  // Buscar em paralelo: usuários, interações do período (com expand cliente) e clientes reagendados
  const [users, interacoes, reagendados, rankingData] = await Promise.all([
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
  ])

  // Mapa de operadores e usuários
  const usersMap = new Map<string, import('@/types').User>()
  for (const u of users) {
    usersMap.set(u.id, u)
  }

  // Filtrar usuários por região se selecionado
  const filteredUsers = users.filter((u) => {
    if (!regiaoFiltro) return true
    if (u.regioes && u.regioes.length > 0) {
      return u.regioes.some(
        (r) =>
          r.trim().toUpperCase() === regiaoFiltro.trim().toUpperCase() ||
          r.includes(regiaoFiltro) ||
          regiaoFiltro.includes(r),
      )
    }
    // Administrador ou usuário sem região definida
    return u.role === 'admin'
  })

  // Operadores e supervisores que participam do atendimento
  const operadoresList = filteredUsers.filter(
    (u) => u.role === 'operador' || u.role === 'supervisor',
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

  // Filtragem de interações por região (se região informada, verificar cliente da interação ou região do operador)
  const isInteracaoMatchingRegion = (it: Interacao): boolean => {
    if (!regiaoFiltro) return true
    const clienteRegiao = it.expand?.cliente?.regiao
    if (clienteRegiao) {
      return (
        clienteRegiao.trim().toUpperCase() === regiaoFiltro.trim().toUpperCase() ||
        clienteRegiao.includes(regiaoFiltro)
      )
    }
    // Se não tiver região no cliente, checar regiões do operador
    const op = it.operador ? usersMap.get(it.operador) : undefined
    if (op?.regioes && op.regioes.length > 0) {
      return op.regioes.some(
        (r) =>
          r.trim().toUpperCase() === regiaoFiltro.trim().toUpperCase() || r.includes(regiaoFiltro),
      )
    }
    return false
  }

  const interacoesValidas = interacoes.filter(isInteracaoMatchingRegion)

  // Follow-ups no período e reagendados
  const isReagendadoMatchingRegion = (c: Cliente): boolean => {
    if (!regiaoFiltro) return true
    if (c.regiao) {
      return (
        c.regiao.trim().toUpperCase() === regiaoFiltro.trim().toUpperCase() ||
        c.regiao.includes(regiaoFiltro)
      )
    }
    return false
  }

  const reagendadosValidos = reagendados.filter(isReagendadoMatchingRegion)

  // Follow-ups do dia (reagendados para HOJE)
  const followUpsHojeList = reagendadosValidos.filter((c) => {
    if (!c.reagendado_para) return false
    return c.reagendado_para.slice(0, 10) === hojeStr
  })

  // Follow-ups pendentes (reagendados com data <= hoje que continuam em estado reagendado)
  const followUpsPendentesList = reagendadosValidos.filter((c) => {
    if (!c.reagendado_para) return false
    return c.reagendado_para.slice(0, 10) <= hojeStr
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

    const isLigacao = it.tipo === 'ligacao' || it.tipo === 'formulario' || Boolean(it.desfecho)
    const isConversao =
      it.desfecho === 'reativado' ||
      it.desfecho === 'reativado_com_pedido' ||
      it.desfecho === 'fechou_pedido' ||
      Boolean(it.numero_pedido)
    const isReagendamento = it.desfecho === 'reagendado' || Boolean(it.reagendado_para)
    const isVendaPerdida =
      it.desfecho === 'compra_terceiros' ||
      it.desfecho === 'nao_quer_negociar' ||
      it.desfecho === 'sem_contato'

    if (m) {
      m.atendimentos += 1
      if (isLigacao) m.ligacoes += 1
      if (isConversao) m.conversoes += 1
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

    const taxa = m.ligacoes > 0 ? Math.round((m.conversoes / m.ligacoes) * 100) : 0
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
  const totalGeralLigacoes = interacoesValidas.filter(
    (i) => i.tipo === 'ligacao' || i.tipo === 'formulario' || Boolean(i.desfecho),
  ).length
  const totalGeralConversoes = interacoesValidas.filter(
    (i) =>
      i.desfecho === 'reativado' ||
      i.desfecho === 'reativado_com_pedido' ||
      i.desfecho === 'fechou_pedido' ||
      Boolean(i.numero_pedido),
  ).length
  const totalGeralReagendamentos = interacoesValidas.filter(
    (i) => i.desfecho === 'reagendado' || Boolean(i.reagendado_para),
  ).length
  const totalGeralVendasPerdidas = interacoesValidas.filter(
    (i) =>
      i.desfecho === 'compra_terceiros' ||
      i.desfecho === 'nao_quer_negociar' ||
      i.desfecho === 'sem_contato',
  ).length
  const taxaGeral =
    totalGeralLigacoes > 0 ? Math.round((totalGeralConversoes / totalGeralLigacoes) * 100) : 0

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
  }
}

// Re-export gamificação APIs
export * from './gamificacao'
