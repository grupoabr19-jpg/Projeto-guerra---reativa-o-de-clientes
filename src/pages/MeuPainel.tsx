import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PhoneCall,
  CheckCircle2,
  Calendar,
  Clock,
  TrendingUp,
  Flame,
  ArrowRight,
  UserCheck,
  Building2,
  PhoneForwarded,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Sparkles,
  Trophy,
  Award,
  Target,
  Filter,
  Headphones,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchInteracoesByOperador,
  fetchClientesReagendadosOperador,
  calculateRankingData,
  fetchMetasOperacionais,
  concluirFaturamentoPedido,
} from '@/services/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { isConversao, isLigacaoOuChamada, calcularTaxaConversao } from '@/lib/conversao'
import type { Interacao, Cliente, RankingUserRow, MetasOperacionaisConfig } from '@/types'
import { getBrasiliaDateStr, getBrasiliaParts, formatarDataHoraBrasilia } from '@/lib/expediente'

export type AtalhoPeriodo =
  | 'mes_atual'
  | 'mes_anterior'
  | '7dias'
  | '30dias'
  | 'tudo'
  | 'personalizado'

export function MeuPainelPage() {
  const { user } = useAuth()

  // Janelas e datas padrão no Fuso de Brasília
  const now = new Date()
  const hojeStr = getBrasiliaDateStr(now)
  const partsNow = getBrasiliaParts(now)

  // Primeiro e último dia do mês corrente (padrão solicitado)
  const primeiroDiaMesAtualStr = `${partsNow.year}-${String(partsNow.month).padStart(2, '0')}-01`
  const diasNoMesAtual = new Date(partsNow.year, partsNow.month, 0).getDate()
  const ultimoDiaMesAtualStr = `${partsNow.year}-${String(partsNow.month).padStart(2, '0')}-${String(diasNoMesAtual).padStart(2, '0')}`

  const [atalhoPeriodo, setAtalhoPeriodo] = useState<AtalhoPeriodo>('mes_atual')
  const [dataInicio, setDataInicio] = useState<string>(primeiroDiaMesAtualStr)
  const [dataFim, setDataFim] = useState<string>(ultimoDiaMesAtualStr)

  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [reagendados, setReagendados] = useState<Cliente[]>([])
  const [pedidosEmAberto, setPedidosEmAberto] = useState<Cliente[]>([])
  const [meuRanking, setMeuRanking] = useState<RankingUserRow | null>(null)
  const [metasConfig, setMetasConfig] = useState<MetasOperacionaisConfig | null>(null)

  // Modal de Complementar Faturamento
  const [modalFaturamentoAberto, setModalFaturamentoAberto] = useState(false)
  const [clienteParaFaturar, setClienteParaFaturar] = useState<Cliente | null>(null)
  const [dataFaturamentoInput, setDataFaturamentoInput] = useState(getBrasiliaDateStr(new Date()))
  const [valorFaturadoInput, setValorFaturadoInput] = useState('')
  const [nfFaturaInput, setNfFaturaInput] = useState('')
  const [obsFaturamentoInput, setObsFaturamentoInput] = useState('')
  const [salvandoFaturamento, setSalvandoFaturamento] = useState(false)

  useEffect(() => {
    if (user?.id) {
      loadData()
    }
  }, [user?.id])

  const loadData = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [listaInteracoes, listaReag, rankingInfo, metasRes, listaPedidosAbertos] =
        await Promise.all([
          fetchInteracoesByOperador(user.id),
          fetchClientesReagendadosOperador(user.id),
          calculateRankingData({ periodo: '30dias', currentUserId: user.id }),
          fetchMetasOperacionais(),
          pb
            .collection('clientes')
            .getFullList<Cliente>({
              filter: `pedido_em_aberto = true && (operador_reativacao = '${user.id}' || operador = '${user.id}')`,
              sort: '-updated',
            })
            .catch(() => [] as Cliente[]),
        ])
      setInteracoes(listaInteracoes)
      setReagendados(listaReag)
      setPedidosEmAberto(listaPedidosAbertos)
      setMeuRanking(rankingInfo.currentUserRow || null)
      setMetasConfig(metasRes)
    } catch (err) {
      console.error('Erro ao carregar dados do operador:', err)
    } finally {
      setLoading(false)
    }
  }

  // Manipulação dos atalhos de período
  const aplicarAtalho = (atalho: AtalhoPeriodo) => {
    setAtalhoPeriodo(atalho)
    const currParts = getBrasiliaParts(new Date())

    if (atalho === 'mes_atual') {
      const ini = `${currParts.year}-${String(currParts.month).padStart(2, '0')}-01`
      const maxDia = new Date(currParts.year, currParts.month, 0).getDate()
      const fim = `${currParts.year}-${String(currParts.month).padStart(2, '0')}-${String(maxDia).padStart(2, '0')}`
      setDataInicio(ini)
      setDataFim(fim)
    } else if (atalho === 'mes_anterior') {
      const prevYear = currParts.month === 1 ? currParts.year - 1 : currParts.year
      const prevMonth = currParts.month === 1 ? 12 : currParts.month - 1
      const ini = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
      const maxDia = new Date(prevYear, prevMonth, 0).getDate()
      const fim = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(maxDia).padStart(2, '0')}`
      setDataInicio(ini)
      setDataFim(fim)
    } else if (atalho === '7dias') {
      const seteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      setDataInicio(getBrasiliaDateStr(seteDiasAtras))
      setDataFim(hojeStr)
    } else if (atalho === '30dias') {
      const trintaDiasAtras = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      setDataInicio(getBrasiliaDateStr(trintaDiasAtras))
      setDataFim(hojeStr)
    } else if (atalho === 'tudo') {
      setDataInicio('')
      setDataFim('')
    }
  }

  // Filtrar interações pelo período selecionado (meia-noite de Brasília)
  const interacoesFiltradas = interacoes.filter((it) => {
    if (!it.created) return false
    const dStr = getBrasiliaDateStr(new Date(it.created))
    if (dataInicio && dStr < dataInicio) return false
    if (dataFim && dStr > dataFim) return false
    return true
  })

  // Métricas do operador no período filtrado (usando regra unificada de conversão)
  const totalLigacoes = interacoesFiltradas.filter((i) => isLigacaoOuChamada(i)).length

  const conversoes = interacoesFiltradas.filter((i) => isConversao(i)).length

  const clientesReagendadosNoPeriodo = interacoesFiltradas.filter(
    (i) => i.desfecho === 'reagendado' || Boolean(i.reagendado_para),
  ).length

  const taxaConversao = calcularTaxaConversao(conversoes, totalLigacoes)

  // Follow-ups do dia (reagendados para HOJE no horário de Brasília)
  const followUpsHoje = reagendados.filter((c) => {
    if (!c.reagendado_para) return false
    return getBrasiliaDateStr(new Date(c.reagendado_para)) === hojeStr
  })

  // Forecast de reagendados (próximos 7 dias)
  const proximos7Dias = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const forecastReagendados = reagendados.filter((c) => {
    if (!c.reagendado_para) return false
    const d = new Date(c.reagendado_para)
    return d > now && d <= proximos7Dias
  })

  const abrirModalFaturamento = (c: Cliente) => {
    setClienteParaFaturar(c)
    setDataFaturamentoInput(getBrasiliaDateStr(new Date()))
    setValorFaturadoInput(
      c.valor_faturado
        ? String(c.valor_faturado)
        : c.valor_ultima_compra
          ? String(c.valor_ultima_compra)
          : '',
    )
    setNfFaturaInput(c.numero_nf_fatura || c.pedido_reativacao || '')
    setObsFaturamentoInput('')
    setModalFaturamentoAberto(true)
  }

  const handleSalvarFaturamento = async () => {
    if (!clienteParaFaturar) return

    if (!dataFaturamentoInput) {
      toast({
        variant: 'destructive',
        title: 'Data obrigatória',
        description: 'Informe a data do faturamento.',
      })
      return
    }

    const valorNum = parseFloat(valorFaturadoInput.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor obrigatório',
        description: 'Informe um valor faturado válido e maior que zero (R$).',
      })
      return
    }

    setSalvandoFaturamento(true)
    try {
      const res = await concluirFaturamentoPedido({
        cliente_id: clienteParaFaturar.id,
        data_faturamento: dataFaturamentoInput,
        valor_faturado: valorNum,
        numero_nf_fatura: nfFaturaInput.trim() || undefined,
        observacoes: obsFaturamentoInput.trim() || undefined,
      })

      toast({
        title: 'Faturamento concluído!',
        description: res.message || 'Dados de faturamento gravados com sucesso.',
      })

      setModalFaturamentoAberto(false)
      setClienteParaFaturar(null)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar faturamento'
      toast({
        variant: 'destructive',
        title: 'Erro ao concluir faturamento',
        description: msg,
      })
    } finally {
      setSalvandoFaturamento(false)
    }
  }

  // Sequência / Streak (atendimentos nos últimos dias no fuso de Brasília)
  const diasComAtendimento = new Set(interacoes.map((i) => getBrasiliaDateStr(new Date(i.created))))
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const ds = getBrasiliaDateStr(d)
    if (diasComAtendimento.has(ds)) {
      streak++
    } else if (i > 0) {
      break
    }
  }

  // --- CÁLCULO DAS METAS OPERACIONAIS EM DESTAQUE ---
  // Obter meta global ou específica da primeira região atribuída ao operador
  let metaContatosDia: number | null = null
  let metaConversoesSemana: number | null = null

  if (metasConfig) {
    const userRegioes = user?.regioes || []
    let metaRegionalAchada: { contatos_dia?: number; conversoes_semana?: number } | null = null

    if (metasConfig.por_regiao) {
      for (const reg of userRegioes) {
        if (metasConfig.por_regiao[reg]) {
          metaRegionalAchada = metasConfig.por_regiao[reg]
          break
        }
      }
    }

    const contatosConfig = metaRegionalAchada?.contatos_dia ?? metasConfig.global?.contatos_dia
    const conversoesConfig =
      metaRegionalAchada?.conversoes_semana ?? metasConfig.global?.conversoes_semana

    if (contatosConfig && contatosConfig > 0) {
      metaContatosDia = contatosConfig
    }
    if (conversoesConfig && conversoesConfig > 0) {
      metaConversoesSemana = conversoesConfig
    }
  }

  // Contatos realizados HOJE (no fuso de Brasília)
  const contatosHoje = interacoes.filter((it) => {
    if (!it.created) return false
    const dStr = getBrasiliaDateStr(new Date(it.created))
    return dStr === hojeStr && (it.tipo === 'ligacao' || it.tipo === 'formulario' || it.desfecho)
  }).length

  // Conversões da SEMANA CORRENTE (desde a segunda-feira até domingo no fuso de Brasília)
  const diaSemana = partsNow.dayOfWeek // 0 = Domingo, 1 = Segunda, etc.
  const diffParaSegunda = diaSemana === 0 ? 6 : diaSemana - 1
  const segundaFeiraSemana = new Date(now.getTime() - diffParaSegunda * 24 * 60 * 60 * 1000)
  const segundaStr = getBrasiliaDateStr(segundaFeiraSemana)

  const conversoesSemana = interacoes.filter((it) => {
    if (!it.created) return false
    const dStr = getBrasiliaDateStr(new Date(it.created))
    return isConversao(it) && dStr >= segundaStr && dStr <= hojeStr
  }).length

  const percMetaContatos = metaContatosDia ? Math.round((contatosHoje / metaContatosDia) * 100) : 0
  const metaContatosAtingida = metaContatosDia !== null && contatosHoje >= metaContatosDia

  const percMetaConversoes = metaConversoesSemana
    ? Math.round((conversoesSemana / metaConversoesSemana) * 100)
    : 0
  const metaConversoesAtingida =
    metaConversoesSemana !== null && conversoesSemana >= metaConversoesSemana

  // Label amigável do período ativo
  const getPeriodoLabel = () => {
    if (atalhoPeriodo === 'mes_atual') return 'Mês Atual'
    if (atalhoPeriodo === 'mes_anterior') return 'Mês Anterior'
    if (atalhoPeriodo === '7dias') return 'Últimos 7 Dias'
    if (atalhoPeriodo === '30dias') return 'Últimos 30 Dias'
    if (atalhoPeriodo === 'tudo') return 'Desde o Início'
    if (dataInicio && dataFim)
      return `${dataInicio.split('-').reverse().join('/')} a ${dataFim.split('-').reverse().join('/')}`
    return 'Período Personalizado'
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner de Boas-vindas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Meu Painel de Ação</h1>
            <Badge className="bg-[#253575] text-white text-[10px] font-mono">Operador</Badge>
            {meuRanking?.tituloAtual && (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-900 border-amber-300 font-medium text-xs flex items-center space-x-1"
              >
                <span>{meuRanking.tituloAtual.emoji}</span>
                <span>{meuRanking.tituloAtual.nome}</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Olá, <strong className="text-slate-700">{user?.name || user?.email}</strong>. Acompanhe
            seus resultados diários, suas metas e o histórico completo desde o primeiro atendimento.
          </p>
        </div>

        {/* Card Gamificação Rápido e Botões */}
        <div className="flex flex-wrap items-center gap-3">
          {meuRanking && (
            <div className="flex items-center space-x-3 bg-slate-900 text-white p-2.5 px-3.5 rounded-lg border border-slate-800 text-xs">
              <div className="text-center pr-2.5 border-r border-slate-700">
                <span className="text-[9px] text-slate-400 block font-mono uppercase">Posição</span>
                <span className="font-mono font-bold text-amber-400 text-base">
                  #{meuRanking.posicao}
                </span>
              </div>
              <div>
                <div className="flex items-center space-x-1 font-mono font-semibold text-slate-200">
                  <span className="text-amber-300">
                    {meuRanking.pontos.toLocaleString('pt-BR')} pts
                  </span>
                  <span className="text-slate-400">• {meuRanking.conversoes} reativações</span>
                </div>
                <Link
                  to="/ranking"
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center mt-0.5"
                >
                  <span>Ver ranking completo</span>
                  <ArrowRight className="h-2.5 w-2.5 ml-0.5" />
                </Link>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-8 px-2.5 text-xs text-slate-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Link to="/atendimento">
              <Button
                size="sm"
                className="bg-[#F18800] hover:bg-[#d97b00] text-white font-semibold text-xs shadow-sm shadow-[#F18800]/25 h-8"
              >
                <Headphones className="h-3.5 w-3.5 mr-1.5" />
                Acessar Atendimento
              </Button>
            </Link>{' '}
          </div>
        </div>
      </div>

      {/* CARDS EM DESTAQUE DE METAS OPERACIONAIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Meta de Contatos por Dia */}
        <Card
          className={`border shadow-sm transition-all ${
            metaContatosDia === null
              ? 'border-slate-200 bg-slate-50/50'
              : metaContatosAtingida
                ? 'border-emerald-300 bg-emerald-50/40 shadow-emerald-100'
                : 'border-blue-200 bg-gradient-to-br from-blue-50/40 to-white'
          }`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    metaContatosDia === null
                      ? 'bg-slate-200 text-slate-600'
                      : metaContatosAtingida
                        ? 'bg-emerald-500 text-white'
                        : 'bg-[#253575] text-white'
                  }`}
                >
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Meta de Contatos por Dia
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">Produtividade de Hoje</h3>
                </div>
              </div>

              {metaContatosDia !== null ? (
                metaContatosAtingida ? (
                  <Badge className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 shadow-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Meta Atingida! ({percMetaContatos}%)
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-300 text-[11px] font-bold"
                  >
                    {percMetaContatos}% concluído
                  </Badge>
                )
              ) : (
                <Badge variant="secondary" className="bg-slate-200 text-slate-600 text-[11px]">
                  Neutro
                </Badge>
              )}
            </div>

            {metaContatosDia !== null ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black font-mono text-slate-900">
                      {loading ? '—' : contatosHoje}
                    </span>
                    <span className="text-sm font-semibold text-slate-500 font-mono ml-1.5">
                      / {metaContatosDia} contatos
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {metaContatosAtingida
                      ? `Parabéns! Superou a meta em ${contatosHoje - metaContatosDia} contato(s).`
                      : `Faltam ${Math.max(0, metaContatosDia - contatosHoje)} contatos hoje`}
                  </span>
                </div>

                <div className="space-y-1">
                  <Progress
                    value={Math.min(100, percMetaContatos)}
                    className={`h-2.5 ${metaContatosAtingida ? '[&>div]:bg-emerald-500' : '[&>div]:bg-[#253575]'}`}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0 contatos</span>
                    <span>Meta: {metaContatosDia}/dia</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-3 px-3 bg-white/80 rounded-lg border border-slate-200 text-center space-y-1">
                <AlertCircle className="h-5 w-5 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Meta não configurada</p>
                <p className="text-[11px] text-slate-400">
                  O administrador do sistema ainda não definiu a meta de contatos diários em
                  Configurações.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Meta de Conversões por Semana */}
        <Card
          className={`border shadow-sm transition-all ${
            metaConversoesSemana === null
              ? 'border-slate-200 bg-slate-50/50'
              : metaConversoesAtingida
                ? 'border-emerald-300 bg-emerald-50/40 shadow-emerald-100'
                : 'border-emerald-200 bg-gradient-to-br from-emerald-50/30 to-white'
          }`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    metaConversoesSemana === null
                      ? 'bg-slate-200 text-slate-600'
                      : metaConversoesAtingida
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-600 text-white'
                  }`}
                >
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Meta de Conversões por Semana
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">Reativações da Semana</h3>
                </div>
              </div>

              {metaConversoesSemana !== null ? (
                metaConversoesAtingida ? (
                  <Badge className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 shadow-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Meta Atingida! ({percMetaConversoes}%)
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[11px] font-bold"
                  >
                    {percMetaConversoes}% concluído
                  </Badge>
                )
              ) : (
                <Badge variant="secondary" className="bg-slate-200 text-slate-600 text-[11px]">
                  Neutro
                </Badge>
              )}
            </div>

            {metaConversoesSemana !== null ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black font-mono text-emerald-700">
                      {loading ? '—' : conversoesSemana}
                    </span>
                    <span className="text-sm font-semibold text-slate-500 font-mono ml-1.5">
                      / {metaConversoesSemana} conversões
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {metaConversoesAtingida
                      ? `Sensacional! Superou a meta semanal em ${conversoesSemana - metaConversoesSemana} venda(s).`
                      : `Faltam ${Math.max(0, metaConversoesSemana - conversoesSemana)} conversão(ões) nesta semana`}
                  </span>
                </div>

                <div className="space-y-1">
                  <Progress
                    value={Math.min(100, percMetaConversoes)}
                    className="h-2.5 [&>div]:bg-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Semana atual</span>
                    <span>Meta: {metaConversoesSemana}/semana</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-3 px-3 bg-white/80 rounded-lg border border-slate-200 text-center space-y-1">
                <AlertCircle className="h-5 w-5 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Meta não configurada</p>
                <p className="text-[11px] text-slate-400">
                  O administrador do sistema ainda não definiu a meta semanal de conversões em
                  Configurações.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTRO DE DATA HISTÓRICO COM ATALHOS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-[#253575]" />
            <h2 className="text-sm font-bold text-slate-800">Histórico & Filtro de Desempenho</h2>
            <Badge
              variant="outline"
              className="text-xs font-normal text-[#253575] bg-[#253575]/10 border-[#253575]/20"
            >
              {getPeriodoLabel()}
            </Badge>
          </div>

          {/* Atalhos Rápidos */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => aplicarAtalho('mes_atual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                atalhoPeriodo === 'mes_atual'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Mês Atual (Padrão)
            </button>
            <button
              onClick={() => aplicarAtalho('mes_anterior')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                atalhoPeriodo === 'mes_anterior'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Mês Anterior
            </button>
            <button
              onClick={() => aplicarAtalho('7dias')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                atalhoPeriodo === '7dias'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Últimos 7 Dias
            </button>
            <button
              onClick={() => aplicarAtalho('30dias')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                atalhoPeriodo === '30dias'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Últimos 30 Dias
            </button>
            <button
              onClick={() => aplicarAtalho('tudo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                atalhoPeriodo === 'tudo'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tudo (Desde o Início)
            </button>
          </div>
        </div>

        {/* Seleção Livre de Data Inicial e Final */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-medium">De:</span>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value)
                setAtalhoPeriodo('personalizado')
              }}
              className="h-8 text-xs w-36 bg-slate-50 font-mono"
            />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-medium">Até:</span>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value)
                setAtalhoPeriodo('personalizado')
              }}
              className="h-8 text-xs w-36 bg-slate-50 font-mono"
            />
          </div>

          <span className="text-[11px] text-slate-400 ml-auto">
            Todos os 6 indicadores abaixo refletem as ações registradas no período selecionado.
          </span>
        </div>
      </div>

      {/* Grid de Métricas Principais do Operador (Responde ao Filtro Histórico) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Ligações Feitas */}
        <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Ligações Feitas</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <PhoneCall className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {loading ? '—' : totalLigacoes}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">no período selecionado</span>
          </CardContent>
        </Card>

        {/* Conversões */}
        <Card className="border-slate-200 shadow-xs hover:border-emerald-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Conversões</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono">
              {loading ? '—' : conversoes}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-1 block">
              reativados com pedido
            </span>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border-slate-200 shadow-xs hover:border-purple-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">
                Taxa de Conversão
              </span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-purple-700 font-mono">
              {loading ? '—' : `${taxaConversao}%`}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">eficiência pessoal</span>
          </CardContent>
        </Card>

        {/* Clientes Reagendados */}
        <Card className="border-slate-200 shadow-xs hover:border-amber-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Reagendados</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <PhoneForwarded className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-amber-600 font-mono">
              {loading ? '—' : clientesReagendadosNoPeriodo}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">pedidos para retornar</span>
          </CardContent>
        </Card>

        {/* Follow-ups do Dia */}
        <Card className="border-slate-200 shadow-xs hover:border-rose-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Follow-ups Hoje</span>
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 font-mono">
              {loading ? '—' : followUpsHoje.length}
            </div>
            <span className="text-[11px] text-rose-700 font-medium mt-1 block">
              agendados p/ hoje
            </span>
          </CardContent>
        </Card>

        {/* Sequência / Streak */}
        <Card className="border-slate-200 shadow-xs hover:border-orange-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Sequência Ativa</span>
              <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-orange-600 font-mono">
              {loading ? '—' : `${streak}d`}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">dias consecutivos</span>
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO NOVA: Meus Pedidos em Aberto (Aguardando Faturamento) */}
      <Card className="border-amber-200 bg-amber-50/20 shadow-sm">
        <CardHeader className="pb-3 border-b border-amber-100/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[#253575] flex items-center gap-2">
                  <span>Meus Pedidos em Aberto</span>
                  <Badge className="bg-amber-500 text-white font-mono text-[10px]">
                    {pedidosEmAberto.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Clientes reativados com pedido pendente de faturamento na sua carteira
                </CardDescription>
              </div>
            </div>
            {pedidosEmAberto.length > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-semibold w-fit"
              >
                ⏳ Aguardando Complementação
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">Carregando pedidos...</div>
          ) : pedidosEmAberto.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 space-y-1">
              <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500" />
              <p className="font-semibold text-slate-700">Tudo em dia!</p>
              <p className="text-slate-400 text-[11px]">
                Nenhum pedido em aberto aguardando faturamento no momento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pedidosEmAberto.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 bg-white rounded-lg border border-amber-200/90 shadow-2xs hover:border-amber-300 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] font-bold text-[#253575] bg-[#253575]/10 border-[#253575]/20"
                        >
                          {c.codigo}
                        </Badge>
                        <span className="font-bold text-xs text-slate-900 truncate max-w-[200px]">
                          {c.nome}
                        </span>
                      </div>
                      <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] shrink-0 font-medium">
                        Pendente
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      <span>
                        <strong>Região:</strong> {c.regiao || '—'}
                      </span>
                      {c.pedido_reativacao && (
                        <>
                          <span>•</span>
                          <span className="font-mono font-semibold text-emerald-700">
                            Pedido #{c.pedido_reativacao}
                          </span>
                        </>
                      )}
                      {c.reativado_em && (
                        <>
                          <span>•</span>
                          <span>
                            Reativado em {new Date(c.reativado_em).toLocaleDateString('pt-BR')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      {c.dias_sem_faturar ? `${c.dias_sem_faturar}d sem faturar` : 'Recém-faturado'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => abrirModalFaturamento(c)}
                      className="bg-[#F18800] hover:bg-[#d97b00] text-white text-xs font-bold h-7 px-3 shadow-xs"
                    >
                      Complementar Faturamento
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid de Seções: Follow-ups de Hoje e Forecast de Reagendados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Seção 1: Follow-ups de Hoje */}
        <Card className="border-slate-200 shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Follow-ups do Dia ({followUpsHoje.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Clientes que pediram retorno para a data de hoje
                  </CardDescription>
                </div>
              </div>
              <Link to="/atendimento">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-blue-600 hover:text-blue-700 h-7 px-2"
                >
                  Atender Fila
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Carregando contatos...</div>
            ) : followUpsHoje.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <UserCheck className="h-8 w-8 mx-auto text-emerald-400 mb-1" />
                <p className="font-semibold text-slate-700">Tudo em dia para hoje!</p>
                <p className="text-slate-400 text-[11px]">
                  Nenhum reagendamento pendente para a data de hoje. Acesse a tela de{' '}
                  <strong>Atendimento</strong> para puxar o próximo cliente disponível.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {followUpsHoje.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-slate-900 truncate">{c.nome}</span>
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] text-blue-700 bg-blue-50 border-blue-200"
                        >
                          {c.codigo}
                        </Badge>
                        {c.prioridade_transferencia && (
                          <Badge className="bg-indigo-600 text-white text-[9px] px-1.5 py-0 font-bold">
                            ⭐ Repassado por Colega (Prioridade)
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                        <span>{c.regiao || 'Sem Região'}</span>
                        {c.telefone && <span>• {c.telefone}</span>}
                        {c.dias_sem_faturar ? (
                          <span>• {c.dias_sem_faturar}d sem faturar</span>
                        ) : null}
                      </div>
                    </div>
                    <Link to="/atendimento">
                      <Button
                        size="sm"
                        className="bg-[#253575] hover:bg-[#1d2b5e] text-white text-xs h-8"
                      >
                        <Headphones className="h-3.5 w-3.5 mr-1.5" />
                        Atender Próximo
                      </Button>
                    </Link>{' '}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção 2: Forecast de Clientes Reagendados (Próximos 7 Dias) */}
        <Card className="border-slate-200 shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Forecast de Reagendamentos ({forecastReagendados.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Projeção de clientes agendados para os próximos 7 dias
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-mono text-indigo-700 bg-indigo-50 border-indigo-200"
              >
                Próximos 7 Dias
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Carregando forecast...</div>
            ) : forecastReagendados.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                <Calendar className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                <p className="font-semibold text-slate-600">
                  Sem reagendamentos futuros nesta semana
                </p>
                <p className="text-slate-400 text-[11px]">
                  Quando você reagendar clientes durante os atendimentos, a previsão aparecerá aqui
                  automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {forecastReagendados.map((c) => {
                  const dataReag = c.reagendado_para ? new Date(c.reagendado_para) : null
                  const dataFmt = dataReag
                    ? dataReag.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        weekday: 'short',
                      })
                    : '—'

                  return (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 truncate">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {c.nome}
                          </span>
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] text-slate-600 bg-white"
                          >
                            {c.codigo}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                          <span>{c.regiao || 'Sem Região'}</span>
                          {c.segmento && <span>• {c.segmento}</span>}
                          {c.valor_ultima_compra ? (
                            <span>
                              • R${' '}
                              {c.valor_ultima_compra.toLocaleString('pt-BR', {
                                minimumFractionDigits: 0,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <Badge className="bg-indigo-600 text-white font-mono text-[10px]">
                          {dataFmt}
                        </Badge>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {formatarDataHoraBrasilia(c.reagendado_para, { formatoCurto: true })}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico Recente de Atendimentos Pessoais */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Últimos Atendimentos Registrados
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Desfecho das suas ligações mais recentes
                </CardDescription>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {interacoesFiltradas.length} atendimentos
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Carregando histórico...</div>
          ) : interacoesFiltradas.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhum atendimento registrado no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Desfecho</th>
                    <th className="py-2.5 px-4">Pedido / Valor</th>
                    <th className="py-2.5 px-4">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {interacoesFiltradas.slice(0, 10).map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                        {formatarDataHoraBrasilia(it.created)}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {it.expand?.cliente?.nome || 'Cliente'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="capitalize text-slate-600">{it.tipo}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className={
                            it.desfecho === 'reativado' || it.desfecho === 'reativado_com_pedido'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]'
                              : it.desfecho === 'reagendado'
                                ? 'border-amber-300 bg-amber-50 text-amber-700 text-[10px]'
                                : 'border-slate-200 text-slate-600 text-[10px]'
                          }
                        >
                          {it.desfecho?.replace(/_/g, ' ') || 'Finalizado'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {it.numero_pedido ? (
                          <span className="font-bold text-emerald-600">
                            Pedido #{it.numero_pedido}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs text-[11px]">
                        {it.conteudo || it.motivo || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Dialog: Complementar Faturamento */}
      <Dialog open={modalFaturamentoAberto} onOpenChange={setModalFaturamentoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#F18800]" />
              <span>Complementar Faturamento</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preencha os dados da nota/fatura para confirmar o faturamento e finalizar a pendência
              do cliente <strong className="text-slate-800">{clienteParaFaturar?.nome}</strong> (
              {clienteParaFaturar?.codigo}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Data do Faturamento *</Label>
              <Input
                type="date"
                value={dataFaturamentoInput}
                onChange={(e) => setDataFaturamentoInput(e.target.value)}
                className="text-xs bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Valor Faturado (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 4850.00"
                  value={valorFaturadoInput}
                  onChange={(e) => setValorFaturadoInput(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Número da NF / Fatura
                </Label>
                <Input
                  type="text"
                  placeholder="Ex: NF-449102"
                  value={nfFaturaInput}
                  onChange={(e) => setNfFaturaInput(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Observações (Opcional)</Label>
              <Textarea
                placeholder="Detalhes do faturamento, condições atendidas..."
                value={obsFaturamentoInput}
                onChange={(e) => setObsFaturamentoInput(e.target.value)}
                rows={2}
                className="text-xs bg-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalFaturamentoAberto(false)}
              disabled={salvandoFaturamento}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSalvarFaturamento}
              disabled={salvandoFaturamento}
              className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs"
            >
              {salvandoFaturamento ? 'Salvando...' : 'Confirmar Faturamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default MeuPainelPage
