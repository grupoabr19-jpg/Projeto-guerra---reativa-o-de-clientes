import pb from '@/lib/pocketbase/client'
import { getBrasiliaDateStr } from '@/lib/expediente'
import type {
  User,
  Interacao,
  Cliente,
  TituloCatalogo,
  ConquistaUsuario,
  ConcursoSazonal,
  PesosGamificacao,
  RankingUserRow,
} from '@/types'
import { fetchConfiguracoes } from './api'

export const PESOS_GAMIFICACAO_PADRAO: PesosGamificacao = {
  atendimento_ligacao: 10,
  atendimento_formulario: 25,
  conversao_reativacao: 150,
  reagendamento_qualificado: 20,
  venda_perdida_com_motivo: 5,
  pontos_por_tonelada: 5,
}

// 1. Catálogo de Títulos
export async function fetchTitulosCatalogo(): Promise<TituloCatalogo[]> {
  return pb.collection('titulos_catalogo').getFullList<TituloCatalogo>({
    sort: 'ordem',
  })
}

// 2. Conquistas por Usuário
export async function fetchConquistasUsuario(usuarioId: string): Promise<ConquistaUsuario[]> {
  return pb.collection('conquistas_usuarios').getFullList<ConquistaUsuario>({
    filter: `usuario = '${usuarioId}'`,
    sort: '-created',
    expand: 'titulo',
  })
}

// 3. Registrar Conquista de Título para Usuário (idempotente)
export async function registrarConquistaTitulo(
  usuarioId: string,
  tituloId: string,
  pontos: number,
): Promise<ConquistaUsuario | null> {
  try {
    const existing = await pb
      .collection('conquistas_usuarios')
      .getFirstListItem<ConquistaUsuario>(`usuario = '${usuarioId}' && titulo = '${tituloId}'`)
    return existing
  } catch {
    return pb.collection('conquistas_usuarios').create<ConquistaUsuario>({
      usuario: usuarioId,
      titulo: tituloId,
      pontos_no_momento: pontos,
      data_conquista: new Date().toISOString(),
    })
  }
}

// 4. Concursos Sazonais
export async function fetchConcursosSazonais(): Promise<ConcursoSazonal[]> {
  return pb.collection('concursos_sazonais').getFullList<ConcursoSazonal>({
    sort: '-created',
    expand: 'vencedor,criado_por',
  })
}

export async function createConcursoSazonal(
  data: Partial<ConcursoSazonal>,
): Promise<ConcursoSazonal> {
  return pb.collection('concursos_sazonais').create<ConcursoSazonal>(data)
}

export async function updateConcursoSazonal(
  id: string,
  data: Partial<ConcursoSazonal>,
): Promise<ConcursoSazonal> {
  return pb.collection('concursos_sazonais').update<ConcursoSazonal>(id, data)
}

export async function deleteConcursoSazonal(id: string): Promise<boolean> {
  return pb.collection('concursos_sazonais').delete(id)
}

// 5. Pesos de Gamificação (configuráveis pelo admin)
export async function fetchPesosGamificacao(): Promise<PesosGamificacao> {
  try {
    const configs = await fetchConfiguracoes()
    const cfg = configs.find((c) => c.chave === 'pesos_gamificacao')
    if (cfg?.valor) {
      return {
        ...PESOS_GAMIFICACAO_PADRAO,
        ...(cfg.valor as Partial<PesosGamificacao>),
      }
    }
  } catch (err) {
    console.warn('Usando pesos de gamificação padrão:', err)
  }
  return PESOS_GAMIFICACAO_PADRAO
}

export async function updatePesosGamificacao(
  pesos: Partial<PesosGamificacao>,
): Promise<PesosGamificacao> {
  const current = await fetchPesosGamificacao()
  const updated = { ...current, ...pesos }
  const existing = await pb
    .collection('configuracoes')
    .getFirstListItem(`chave = 'pesos_gamificacao'`)
    .catch(() => null)

  if (existing) {
    await pb.collection('configuracoes').update(existing.id, { valor: updated })
  } else {
    await pb.collection('configuracoes').create({
      chave: 'pesos_gamificacao',
      descricao: 'Pesos e regras de pontuação da gamificação do Projeto Guerra',
      valor: updated,
    })
  }
  return updated
}

// 6. Cálculo da Pontuação e Ranking On-The-Fly
export async function calculateRankingData(options?: {
  periodo?: 'hoje' | '7dias' | '30dias' | 'total'
  regiao?: string // Filtro por região ou 'todas'
  currentUserId?: string
}): Promise<{
  ranking: RankingUserRow[]
  currentUserRow?: RankingUserRow
  catalogoTitulos: TituloCatalogo[]
  concursos: ConcursoSazonal[]
  pesos: PesosGamificacao
}> {
  const periodo = options?.periodo || 'total'
  const regiaoFiltro = options?.regiao && options.regiao !== 'todas' ? options.regiao : null
  const currentUserId = options?.currentUserId

  // Buscar em paralelo: usuários, catálogo de títulos, interações, clientes reativados, concursos e pesos
  const [users, catalogo, interacoes, clientesReativados, concursos, pesos] = await Promise.all([
    pb.collection('users').getFullList<User>({ sort: 'name' }),
    fetchTitulosCatalogo(),
    pb.collection('interacoes').getFullList<Interacao>({
      sort: '-created',
    }),
    pb.collection('clientes').getFullList<Cliente>({
      filter: "estado = 'reativado' || pedido_reativacao != '' || pedido_confirmado = true",
    }),
    fetchConcursosSazonais(),
    fetchPesosGamificacao(),
  ])

  // Filtrar usuários por região se selecionado
  const filteredUsers = users.filter((u) => {
    if (!regiaoFiltro) return true
    // Se o usuário tem regiões atribuídas, verificar se inclui a selecionada
    if (u.regioes && u.regioes.length > 0) {
      return u.regioes.includes(regiaoFiltro)
    }
    // Administradores e supervisores gerais sem região explícita participam
    return true
  })

  // Janela de data para o período no fuso de Brasília (America/Sao_Paulo)
  // DEFINIÇÃO UNIFICADA: Cortes de 7 e 30 dias pela meia-noite de Brasília
  const now = new Date()
  const hojeStr = getBrasiliaDateStr(now)
  const seteDiasAtrasStr = getBrasiliaDateStr(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  const trintaDiasAtrasStr = getBrasiliaDateStr(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))

  const isWithinPeriod = (dateStr?: string): boolean => {
    if (!dateStr) return false
    if (periodo === 'total') return true
    const dStr = getBrasiliaDateStr(new Date(dateStr))
    if (periodo === 'hoje') return dStr === hojeStr
    if (periodo === '7dias') return dStr >= seteDiasAtrasStr
    if (periodo === '30dias') return dStr >= trintaDiasAtrasStr
    return true
  }

  // Agrupar métricas por operador
  const metricsByUser: Record<
    string,
    {
      atendimentos: number
      conversoes: number
      reagendados: number
      vendasPerdidasMotivo: number
      formularios: number
      toneladas: number
      pontosCalculados: number
    }
  > = {}

  // Inicializar mapa para todos os usuários
  for (const u of filteredUsers) {
    metricsByUser[u.id] = {
      atendimentos: 0,
      conversoes: 0,
      reagendados: 0,
      vendasPerdidasMotivo: 0,
      formularios: 0,
      toneladas: 0,
      pontosCalculados: 0,
    }
  }

  // Processar interações no período
  for (const it of interacoes) {
    if (!it.operador || !metricsByUser[it.operador]) continue
    if (!isWithinPeriod(it.created)) continue

    const m = metricsByUser[it.operador]
    m.atendimentos += 1

    if (it.tipo === 'formulario') {
      m.formularios += 1
      m.pontosCalculados += pesos.atendimento_formulario
    } else {
      m.pontosCalculados += pesos.atendimento_ligacao
    }

    if (
      it.desfecho === 'reativado' ||
      it.desfecho === 'reativado_com_pedido' ||
      it.desfecho === 'fechou_pedido' ||
      it.numero_pedido
    ) {
      m.conversoes += 1
      m.pontosCalculados += pesos.conversao_reativacao
    } else if (it.desfecho === 'reagendado' || it.reagendado_para) {
      m.reagendados += 1
      m.pontosCalculados += pesos.reagendamento_qualificado
    } else if (
      (it.desfecho === 'nao_quer_negociar' || it.desfecho === 'compra_terceiros') &&
      it.motivo
    ) {
      m.vendasPerdidasMotivo += 1
      m.pontosCalculados += pesos.venda_perdida_com_motivo
    }
  }

  // Processar toneladas de clientes reativados/atendidos no período
  for (const c of clientesReativados) {
    if (!c.operador || !metricsByUser[c.operador]) continue
    if (!isWithinPeriod(c.updated || c.created)) continue

    const ton = c.toneladas_historico || c.peso_nf_tonelagem || 0
    if (ton > 0) {
      const m = metricsByUser[c.operador]
      m.toneladas += ton
      m.pontosCalculados += Math.round(ton * pesos.pontos_por_tonelada)
    }
  }

  // Fallback de título mínimo
  const tituloInicial: TituloCatalogo = catalogo[0] || {
    id: 't-inicial',
    codigo: 'aprendiz_reativacao',
    nome: 'Aprendiz da Reativação',
    emoji: '🌱',
    nivel: 'bronze',
    ordem: 1,
    pontos_necessarios: 1,
    categoria: 'Iniciação',
    cor_hex: '#94a3b8',
    created: '',
    updated: '',
  }

  // Construir linhas do ranking
  const rows: RankingUserRow[] = filteredUsers.map((u) => {
    const m = metricsByUser[u.id] || {
      atendimentos: 0,
      conversoes: 0,
      reagendados: 0,
      vendasPerdidasMotivo: 0,
      formularios: 0,
      toneladas: 0,
      pontosCalculados: 0,
    }

    const pontos = m.pontosCalculados

    // Determinar todos os títulos desbloqueados (pontos >= pontos_necessarios)
    const titulosDesbloqueados = catalogo.filter((t) => pontos >= t.pontos_necessarios)
    const tituloAtual =
      titulosDesbloqueados.length > 0
        ? titulosDesbloqueados[titulosDesbloqueados.length - 1]
        : tituloInicial

    // Próximo título a ser conquistado
    const proximoTitulo = catalogo.find((t) => t.pontos_necessarios > pontos)

    let progressoProximoPerc = 100
    if (proximoTitulo) {
      const basePontos = tituloAtual.pontos_necessarios
      const metaPontos = proximoTitulo.pontos_necessarios
      const diffMeta = metaPontos - basePontos
      const diffAtual = pontos - basePontos
      progressoProximoPerc =
        diffMeta > 0 ? Math.min(100, Math.max(0, Math.round((diffAtual / diffMeta) * 100))) : 100
    }

    return {
      posicao: 0, // calculado após ordenação
      usuario: u,
      pontos,
      atendimentos: m.atendimentos,
      conversoes: m.conversoes,
      reagendados: m.reagendados,
      toneladas: Math.round(m.toneladas * 10) / 10,
      tituloAtual,
      proximoTitulo,
      progressoProximoPerc,
      totalTitulosDesbloqueados: Math.max(1, titulosDesbloqueados.length),
      isCurrentUser: currentUserId ? u.id === currentUserId : false,
    }
  })

  // Ordenar por pontos DESC (desempate por conversões e depois atendimentos)
  rows.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.conversoes !== a.conversoes) return b.conversoes - a.conversoes
    return b.atendimentos - a.atendimentos
  })

  // Atribuir posição
  rows.forEach((row, idx) => {
    row.posicao = idx + 1
  })

  const currentUserRow = rows.find((r) => r.isCurrentUser)

  // Gravar em background as conquistas no PocketBase para o usuário atual se novo título
  if (currentUserRow && currentUserRow.usuario.id && currentUserRow.tituloAtual.id) {
    registrarConquistaTitulo(
      currentUserRow.usuario.id,
      currentUserRow.tituloAtual.id,
      currentUserRow.pontos,
    ).catch(() => {})
  }

  return {
    ranking: rows,
    currentUserRow,
    catalogoTitulos: catalogo,
    concursos,
    pesos,
  }
}
