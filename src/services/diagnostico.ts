import pb from '@/lib/pocketbase/client'
import type {
  Cliente,
  Interacao,
  RespostaFormulario,
  User,
  PeriodoAtendimentoFiltro,
  RelatorioDiagnosticoCompleto,
  DiagnosticoItemMotivo,
  CategoriaDiagnostico,
} from '@/types'
import { getBrasiliaDateStr, getBrasiliaParts, createBrasiliaDate } from '@/lib/expediente'

// Configurações de Categorias com descrições executivas, cores e ícones
const DEFINICOES_CATEGORIAS: Record<
  CategoriaDiagnostico,
  {
    titulo: string
    descricao: string
    corBadge: string
    icone: string
  }
> = {
  preco_condicoes: {
    titulo: 'Preço & Condições Comerciais',
    descricao:
      'Sensibilidade alta a preço, busca por descontos, prazos de boleto ou margem apertada',
    corBadge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    icone: 'DollarSign',
  },
  concorrencia: {
    titulo: 'Concorrência & Terceiros',
    descricao: 'Comprando em outro distribuidor, concorrente regional ou canais alternativos',
    corBadge: 'bg-rose-50 text-rose-800 border-rose-300',
    icone: 'XCircle',
  },
  credito_capital: {
    titulo: 'Falta de Crédito ou Capital de Giro',
    descricao: 'Dificuldade de aprovação de crédito, boletos em aberto ou sem limite disponível',
    corBadge: 'bg-amber-50 text-amber-800 border-amber-300',
    icone: 'CreditCard',
  },
  sem_necessidade_obra: {
    titulo: 'Sem Necessidade / Obra Parada',
    descricao: 'Queda de produção interna, obra concluída, parada temporária ou demanda sazonal',
    corBadge: 'bg-blue-50 text-blue-800 border-blue-300',
    icone: 'Clock',
  },
  frete_prazo: {
    titulo: 'Prazo de Entrega, Frete e Logística',
    descricao:
      'Atrasos recorrentes de entrega, custo de frete elevado ou rota logística incompatível',
    corBadge: 'bg-orange-50 text-orange-800 border-orange-300',
    icone: 'Truck',
  },
  qualidade_operacional: {
    titulo: 'Qualidade do Material & Erros Operacionais',
    descricao:
      'Lote divergente, falha de especificação técnica, atraso crítico ou divergência em NF',
    corBadge: 'bg-purple-50 text-purple-800 border-purple-300',
    icone: 'AlertTriangle',
  },
  relacionamento_vendedor: {
    titulo: 'Relacionamento com Vendedor Original',
    descricao: 'Mudança de vendedor, falta de visitas, atrito comercial ou falha de acompanhamento',
    corBadge: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    icone: 'Users',
  },
  nao_localizado_telefone: {
    titulo: 'Não Localizado / Telefone Inexistente',
    descricao: 'Telefone inválido, caixa postal contínua, número trocou de titular ou não atende',
    corBadge: 'bg-slate-100 text-slate-800 border-slate-300',
    icone: 'PhoneOff',
  },
  recusa_formal: {
    titulo: 'Recusa Formal / Não Quer Negociar',
    descricao: 'Cliente declarou explicitamente que não tem interesse em negociar no momento',
    corBadge: 'bg-zinc-100 text-zinc-900 border-zinc-400',
    icone: 'Ban',
  },
  ativo_outro_cadastro: {
    titulo: 'Cliente Já Ativo (CPF/CNPJ Terceiro / Outra Filial)',
    descricao:
      'Faturando por CPF de terceiro, CNPJ coligada ou carteira contínua com vendedor externo',
    corBadge: 'bg-teal-50 text-teal-800 border-teal-300',
    icone: 'ShieldCheck',
  },
  outros: {
    titulo: 'Outros Motivos Diversificados',
    descricao:
      'Situações específicas relatadas pelo cliente que não se enquadram nas categorias principais',
    corBadge: 'bg-slate-50 text-slate-700 border-slate-200',
    icone: 'FileQuestion',
  },
}

interface MapeamentoOcorrencia {
  categoria: CategoriaDiagnostico
  perguntaOrigem: string
  respostaBruta: string
}

/**
 * Mapeia as 17 perguntas do formulário em categorias diagnósticas
 */
function extrairMotivosDeRespostas(
  respostas: Record<string, unknown> | null | undefined,
): MapeamentoOcorrencia[] {
  if (!respostas || typeof respostas !== 'object') return []
  const resultado: MapeamentoOcorrencia[] = []

  // Q3: Situação Operacional
  const q3 = String(respostas.q3 || '').trim()
  if (q3) {
    if (q3.includes('demanda reduzida') || q3.includes('Encerrou') || q3.includes('judicial')) {
      resultado.push({
        categoria: 'sem_necessidade_obra',
        perguntaOrigem: 'Q3 — Situação Operacional no Mercado',
        respostaBruta: q3,
      })
    }
  }

  // Q5: Motivo da Inatividade
  const q5 = String(respostas.q5 || '').trim()
  if (q5) {
    if (q5.includes('Preço') || q5.includes('Condições de Pagamento')) {
      resultado.push({
        categoria: 'preco_condicoes',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    } else if (q5.includes('frete') || q5.includes('Atrasos')) {
      resultado.push({
        categoria: 'frete_prazo',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    } else if (q5.includes('qualidade')) {
      resultado.push({
        categoria: 'qualidade_operacional',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    } else if (q5.includes('relacionamento') || q5.includes('vendedor')) {
      resultado.push({
        categoria: 'relacionamento_vendedor',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    } else if (q5.includes('Queda de produção')) {
      resultado.push({
        categoria: 'sem_necessidade_obra',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    } else if (q5 && q5 !== 'Outro') {
      resultado.push({
        categoria: 'outros',
        perguntaOrigem: 'Q5 — Principal Fator de Inatividade',
        respostaBruta: q5,
      })
    }
  }

  // Q6: Sensibilidade a Preço
  const q6 = String(respostas.q6 || '').trim()
  if (q6 && q6.includes('Muito alta')) {
    resultado.push({
      categoria: 'preco_condicoes',
      perguntaOrigem: 'Q6 — Grau de Sensibilidade a Preço',
      respostaBruta: 'Sensibilidade muito alta (decide por centavos no quilo)',
    })
  }

  // Q7: Concorrência
  const q7 = String(respostas.q7 || '').trim()
  if (
    q7 &&
    q7.length > 1 &&
    !q7.toLowerCase().includes('nenhum') &&
    !q7.toLowerCase().includes('não')
  ) {
    resultado.push({
      categoria: 'concorrencia',
      perguntaOrigem: 'Q7 — Concorrente ou Canal Alternativo Ativo',
      respostaBruta: `Comprando de: ${q7}`,
    })
  }

  // Q8, Q9, Q10: Reclamação Operacional / Qualidade
  const q9 = String(respostas.q9 || '').trim()
  if (q9 && q9 !== 'Nenhum erro ocorrido') {
    if (q9.includes('Atraso crítico')) {
      resultado.push({
        categoria: 'frete_prazo',
        perguntaOrigem: 'Q9 — Falha Operacional / Atraso Crítico',
        respostaBruta: q9,
      })
    } else if (q9.includes('Especificação') || q9.includes('qualidade')) {
      resultado.push({
        categoria: 'qualidade_operacional',
        perguntaOrigem: 'Q9 — Reclamação de Qualidade / Especificação',
        respostaBruta: q9,
      })
    } else if (q9.includes('nota fiscal') || q9.includes('boleto')) {
      resultado.push({
        categoria: 'credito_capital',
        perguntaOrigem: 'Q9 — Problema em Nota Fiscal / Boleto',
        respostaBruta: q9,
      })
    } else {
      resultado.push({
        categoria: 'qualidade_operacional',
        perguntaOrigem: 'Q9 — Ocorrência Operacional',
        respostaBruta: q9,
      })
    }
  }

  // Q12: Disposição para Retorno
  const q12 = String(respostas.q12 || '').trim()
  if (q12 && q12.includes('Recusou')) {
    resultado.push({
      categoria: 'recusa_formal',
      perguntaOrigem: 'Q12 — Disposição para Contraproposta',
      respostaBruta: q12,
    })
  }

  return resultado
}

/**
 * Mapeia desfechos de venda perdida ou interação
 */
function extrairMotivoDeDesfecho(
  desfecho: string,
  motivoRaw?: string,
  conteudoRaw?: string,
): MapeamentoOcorrencia | null {
  const d = (desfecho || '').toLowerCase()
  const m = (motivoRaw || '').toLowerCase()
  const c = (conteudoRaw || '').toLowerCase()
  const combined = `${m} ${c}`

  if (
    d === 'ativo_fora_base' ||
    combined.includes('ativo fora da base') ||
    combined.includes('cliente ativo')
  ) {
    return {
      categoria: 'ativo_outro_cadastro',
      perguntaOrigem: 'Desfecho — Cliente Ativo Fora da Base',
      respostaBruta: motivoRaw || 'Ativo por outro canal/CPF/vendedor',
    }
  }

  if (
    d === 'compra_terceiros' ||
    combined.includes('compra de terceiros') ||
    combined.includes('concorrente')
  ) {
    return {
      categoria: 'concorrencia',
      perguntaOrigem: 'Desfecho — Comprando de Terceiros / Concorrente',
      respostaBruta: motivoRaw || conteudoRaw || 'Comprando em fornecedor concorrente',
    }
  }

  if (
    d === 'sem_contato' ||
    combined.includes('sem contato') ||
    combined.includes('não atende') ||
    combined.includes('caixa')
  ) {
    return {
      categoria: 'nao_localizado_telefone',
      perguntaOrigem: 'Desfecho — Sem Contato / Inalcançável',
      respostaBruta: motivoRaw || 'Não atendeu / telefone incorreto',
    }
  }

  if (
    d === 'nao_quer_negociar' ||
    combined.includes('não quer negociar') ||
    combined.includes('recusa')
  ) {
    return {
      categoria: 'recusa_formal',
      perguntaOrigem: 'Desfecho — Não Quer Negociar / Recusa',
      respostaBruta: motivoRaw || 'Cliente recusou propostas de reativação',
    }
  }

  return null
}

/**
 * Função principal de inteligência diagnóstica: consolida respostas do formulário,
 * interações e desfechos para diagnosticar por que os clientes não estão comprando.
 */
export async function fetchRelatorioDiagnostico(options?: {
  periodo?: PeriodoAtendimentoFiltro
  regiao?: string
}): Promise<RelatorioDiagnosticoCompleto> {
  const periodo = options?.periodo || 'total'
  const regiaoFiltro = options?.regiao && options.regiao !== 'todas' ? options.regiao : null

  const now = new Date()
  const hojeStr = getBrasiliaDateStr(now)
  const seteDiasAtrasStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const trintaDiasAtrasStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Buscar dados em paralelo
  const [respostasList, interacoesList, usersList] = await Promise.all([
    pb.collection('respostas_formulario').getFullList<RespostaFormulario>({
      sort: '-created',
      expand: 'cliente,operador',
    }),
    pb.collection('interacoes').getFullList<Interacao>({
      filter: "desfecho != ''",
      sort: '-created',
      expand: 'cliente,operador',
    }),
    pb.collection('users').getFullList<User>(),
  ])

  // Mapas de apoio
  const usersMap = new Map<string, User>()
  usersList.forEach((u) => usersMap.set(u.id, u))

  // Inicializar acumuladores por categoria
  const categoriasMap = new Map<CategoriaDiagnostico, DiagnosticoItemMotivo>()
  Object.entries(DEFINICOES_CATEGORIAS).forEach(([catKey, def]) => {
    categoriasMap.set(catKey as CategoriaDiagnostico, {
      id: catKey,
      categoria: catKey as CategoriaDiagnostico,
      titulo: def.titulo,
      descricao: def.descricao,
      corBadge: def.corBadge,
      icone: def.icone,
      totalOcorrencias: 0,
      percentual: 0,
      porRegiao: {},
      porVendedorOrigem: {},
      porPeriodo: {
        hoje: 0,
        ultimos7dias: 0,
        ultimos30dias: 0,
        anterior30dias: 0,
      },
      clientes: [],
    })
  })

  const clientesContabilizados = new Set<string>()
  const distribuicaoGeralRegiao: Record<string, number> = {}
  const distribuicaoGeralVendedor: Record<string, number> = {}

  let totalHoje = 0
  let total7Dias = 0
  let total30Dias = 0
  let totalGeral = 0

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

  const matchRegiao = (r1?: string | null, r2?: string | null): boolean => {
    if (!r1 || !r2) return false
    const n1 = normalizarNomeRegiao(r1).toUpperCase()
    const n2 = normalizarNomeRegiao(r2).toUpperCase()
    if (n1 === n2) return true
    if (n1.includes(n2) || n2.includes(n1)) return true
    return false
  }

  // Função auxiliar de checagem de filtros de período e região
  const matchesFilter = (
    dataStr: string,
    regiaoCliente?: string,
    regiaoOperador?: string,
  ): boolean => {
    // Filtro de Região
    if (regiaoFiltro && regiaoFiltro !== 'todas') {
      const matchCli = regiaoCliente ? matchRegiao(regiaoCliente, regiaoFiltro) : false
      const matchOp = regiaoOperador ? matchRegiao(regiaoOperador, regiaoFiltro) : false
      const filtroUpper = regiaoFiltro.trim().toUpperCase()
      const isSemRegiao = filtroUpper === 'SEM REGIÃO' || filtroUpper === 'SEM REGIAO'

      if (isSemRegiao) {
        if (regiaoCliente && regiaoCliente.trim() !== '') return false
      } else if (!matchCli && !matchOp) {
        return false
      }
    }

    // Filtro de Período
    if (periodo === 'hoje') {
      if (getBrasiliaDateStr(new Date(dataStr)) !== hojeStr) return false
    } else if (periodo === '7dias') {
      if (dataStr < seteDiasAtrasStr) return false
    } else if (periodo === '30dias') {
      if (dataStr < trintaDiasAtrasStr) return false
    }
    return true
  }

  // 1. Processar respostas dos formulários
  for (const resp of respostasList) {
    const dataRegistro = resp.created
    const cliente = resp.expand?.cliente as Cliente | undefined
    const regiao = cliente?.regiao || 'Sem Região'
    const vendedor = cliente?.vendedor || 'Sem Vendedor Atribuído'

    const opUser =
      resp.expand?.operador || (resp.operador ? usersMap.get(resp.operador) : undefined)
    const operadorNome = opUser?.name || opUser?.email || 'Operador'
    const opRegiao = opUser?.regioes?.[0]

    if (!matchesFilter(dataRegistro, regiao, opRegiao)) {
      continue
    }

    const motivosExtraidos = extrairMotivosDeRespostas(resp.respostas)

    // Se o próprio desfecho for motivo de recusa/perda ou ativo_fora_base, adicionar também
    if (resp.desfecho) {
      const extraDesfecho = extrairMotivoDeDesfecho(resp.desfecho)
      if (extraDesfecho) {
        motivosExtraidos.push(extraDesfecho)
      }
    }

    if (motivosExtraidos.length > 0 && cliente?.id) {
      clientesContabilizados.add(cliente.id)
      totalGeral += 1
      if (getBrasiliaDateStr(new Date(dataRegistro)) === hojeStr) totalHoje += 1
      if (dataRegistro >= seteDiasAtrasStr) total7Dias += 1
      if (dataRegistro >= trintaDiasAtrasStr) total30Dias += 1

      distribuicaoGeralRegiao[regiao] = (distribuicaoGeralRegiao[regiao] || 0) + 1
      distribuicaoGeralVendedor[vendedor] = (distribuicaoGeralVendedor[vendedor] || 0) + 1
    }

    // Distribuir cada motivo encontrado
    for (const item of motivosExtraidos) {
      const diag = categoriasMap.get(item.categoria)
      if (!diag) continue

      diag.totalOcorrencias += 1
      diag.porRegiao[regiao] = (diag.porRegiao[regiao] || 0) + 1
      diag.porVendedorOrigem[vendedor] = (diag.porVendedorOrigem[vendedor] || 0) + 1

      if (getBrasiliaDateStr(new Date(dataRegistro)) === hojeStr) {
        diag.porPeriodo.hoje += 1
      }
      if (dataRegistro >= seteDiasAtrasStr) {
        diag.porPeriodo.ultimos7dias += 1
      }
      if (dataRegistro >= trintaDiasAtrasStr) {
        diag.porPeriodo.ultimos30dias += 1
      } else {
        diag.porPeriodo.anterior30dias += 1
      }

      if (cliente) {
        diag.clientes.push({
          id: `${resp.id}_${item.categoria}`,
          codigo: cliente.codigo || '—',
          nome: cliente.nome || 'Cliente sem identificação',
          regiao,
          vendedorOrigem: vendedor,
          operadorNome,
          dataRegistro,
          desfecho: resp.desfecho || 'contatado',
          perguntaOrigem: item.perguntaOrigem,
          respostaBruta: item.respostaBruta,
          valorPotencial: resp.valor_potencial,
          toneladasPotencial: resp.toneladas_potencial,
        })
      }
    }
  }

  // 2. Processar interações com desfechos específicos que NÃO tenham vindo pelo formulário
  // (por exemplo, contato rápido registrado diretamente com perda, recusa ou ativo_fora_base)
  for (const it of interacoesList) {
    const dataRegistro = it.created
    const cliente = it.expand?.cliente as Cliente | undefined
    const regiao = cliente?.regiao || 'Sem Região'
    const vendedor = cliente?.vendedor || 'Sem Vendedor Atribuído'

    const opUser = it.expand?.operador || (it.operador ? usersMap.get(it.operador) : undefined)
    const operadorNome = opUser?.name || opUser?.email || 'Operador'
    const opRegiao = opUser?.regioes?.[0]

    if (!matchesFilter(dataRegistro, regiao, opRegiao)) {
      continue
    }

    // Se já foi contado via formulário para este cliente no mesmo segundo, pular para não duplicar
    if (it.tipo === 'formulario') {
      continue
    }

    const motivoDesfecho = extrairMotivoDeDesfecho(it.desfecho || '', it.motivo, it.conteudo)
    if (motivoDesfecho) {
      const diag = categoriasMap.get(motivoDesfecho.categoria)
      if (diag) {
        diag.totalOcorrencias += 1
        diag.porRegiao[regiao] = (diag.porRegiao[regiao] || 0) + 1
        diag.porVendedorOrigem[vendedor] = (diag.porVendedorOrigem[vendedor] || 0) + 1

        if (getBrasiliaDateStr(new Date(dataRegistro)) === hojeStr) {
          diag.porPeriodo.hoje += 1
        }
        if (dataRegistro >= seteDiasAtrasStr) {
          diag.porPeriodo.ultimos7dias += 1
        }
        if (dataRegistro >= trintaDiasAtrasStr) {
          diag.porPeriodo.ultimos30dias += 1
        } else {
          diag.porPeriodo.anterior30dias += 1
        }

        if (cliente) {
          clientesContabilizados.add(cliente.id)
          totalGeral += 1
          if (getBrasiliaDateStr(new Date(dataRegistro)) === hojeStr) totalHoje += 1
          if (dataRegistro >= seteDiasAtrasStr) total7Dias += 1
          if (dataRegistro >= trintaDiasAtrasStr) total30Dias += 1

          distribuicaoGeralRegiao[regiao] = (distribuicaoGeralRegiao[regiao] || 0) + 1
          distribuicaoGeralVendedor[vendedor] = (distribuicaoGeralVendedor[vendedor] || 0) + 1

          diag.clientes.push({
            id: `${it.id}_desfecho`,
            codigo: cliente.codigo || '—',
            nome: cliente.nome || 'Cliente sem identificação',
            regiao,
            vendedorOrigem: vendedor,
            operadorNome,
            dataRegistro,
            desfecho: it.desfecho || '',
            perguntaOrigem: motivoDesfecho.perguntaOrigem,
            respostaBruta: motivoDesfecho.respostaBruta,
            observacao: it.conteudo || it.motivo,
          })
        }
      }
    }
  }

  // Ordenar lista de motivos e calcular percentuais
  const listaMotivos = Array.from(categoriasMap.values())
  const totalTodasOcorrencias = listaMotivos.reduce((acc, m) => acc + m.totalOcorrencias, 0)

  listaMotivos.forEach((m) => {
    m.percentual =
      totalTodasOcorrencias > 0 ? Math.round((m.totalOcorrencias / totalTodasOcorrencias) * 100) : 0
    // Ordenar clientes mais recentes primeiro
    m.clientes.sort((a, b) => (b.dataRegistro > a.dataRegistro ? 1 : -1))
  })

  // Ranking ordenado pelo número de ocorrências desc
  listaMotivos.sort((a, b) => b.totalOcorrencias - a.totalOcorrencias)

  return {
    totalRespondidos: totalTodasOcorrencias,
    totalClientesAnalisados: clientesContabilizados.size,
    rankingMotivos: listaMotivos,
    distribuicaoPorRegiao: distribuicaoGeralRegiao,
    distribuicaoPorVendedorOrigem: distribuicaoGeralVendedor,
    evolucaoTemporal: {
      hoje: totalHoje,
      ultimos7dias: total7Dias,
      ultimos30dias: total30Dias,
      total: totalGeral,
    },
  }
}
