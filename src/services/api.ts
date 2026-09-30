import pb from '@/lib/pocketbase/client'
import { calculateRankingData } from './gamificacao'
import { getBrasiliaDateStr, getBrasiliaParts, createBrasiliaDate } from '@/lib/expediente'
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

export async function deleteUser(userId: string) {
  return pb.collection('users').delete(userId)
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
      upper === 'MICRO REGIAO'
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

  // Filtragem de interações por região (se região informada, verificar cliente da interação ou região do operador)
  const isInteracaoMatchingRegion = (it: Interacao): boolean => {
    if (!regiaoFiltro || regiaoFiltro === 'todas') return true
    const clienteRegiao = it.expand?.cliente?.regiao
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
    'Outros motivos': 0,
  }

  // Função auxiliar de normalização de categoria de motivo
  const categorizarMotivo = (motivoRaw?: string): string => {
    if (!motivoRaw) return 'Outros motivos'
    const lower = motivoRaw.toLowerCase()
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
export async function fetchMetricasBaseKpis(options?: {
  regiao?: string
}): Promise<import('@/types').MetricasBaseKpisResponse> {
  const params = new URLSearchParams()
  const regiao = options?.regiao?.trim()
  if (regiao && regiao.toLowerCase() !== 'todas') {
    params.set('regiao', regiao)
  }
  const basePbUrl = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')
  const queryStr = params.toString()
  const url = `${basePbUrl}/backend/v1/metrics/base-kpis${queryStr ? `?${queryStr}` : ''}`

  const headers: Record<string, string> = {}
  if (pb.authStore.token) {
    headers['Authorization'] = pb.authStore.token
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || 'Falha ao buscar KPIs de base no servidor')
  }

  const data = await res.json()
  // Normalização defensiva da resposta (garante kpis.totalBase e kpis.naFila tanto em camelCase quanto snake_case)
  const kpisRaw = data?.kpis || {}
  const totalBase = Number(
    kpisRaw.totalBase ?? kpisRaw.total_base ?? data.totalBase ?? data.total_base ?? 0,
  )
  const naFila = Number(kpisRaw.naFila ?? kpisRaw.na_fila ?? data.naFila ?? data.na_fila ?? 0)
  const reativados = Number(kpisRaw.reativados ?? kpisRaw.reativado ?? data.reativados ?? 0)
  const taxaReativacao = Number(
    kpisRaw.taxaReativacao ?? kpisRaw.taxa_reativacao ?? data.taxaReativacao ?? 0,
  )
  const valorRecuperado = Number(
    kpisRaw.valorRecuperado ?? kpisRaw.valor_recuperado ?? data.valorRecuperado ?? 0,
  )
  const toneladasRecuperadas = Number(
    kpisRaw.toneladasRecuperadas ?? kpisRaw.toneladas_recuperadas ?? data.toneladasRecuperadas ?? 0,
  )

  return {
    kpis: {
      totalBase,
      naFila,
      reativados,
      taxaReativacao,
      valorRecuperado,
      toneladasRecuperadas,
    },
    estadosContagem: data.estadosContagem || {},
    regioesMap: data.regioesMap || {},
  }
}

// Re-export diagnóstico e gamificação APIs
export * from './diagnostico'
export * from './gamificacao'
