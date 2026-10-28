import React, { useState, useEffect } from 'react'
import {
  Users,
  UserCheck,
  TrendingUp,
  Percent,
  Clock,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
  Building2,
  Calendar,
  PhoneCall,
  CheckCircle2,
  PhoneForwarded,
  XCircle,
  Trophy,
  ArrowUpDown,
  RefreshCw,
  Headphones,
  Award,
  UserX,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  PackageCheck,
  ShoppingBag,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchImportacoes,
  fetchRegioes,
  fetchMetricasAtendimentosDashboard,
  fetchMetricasBaseKpis,
} from '@/services/api'
import type {
  Importacao,
  Regiao,
  PeriodoAtendimentoFiltro,
  MetricasAtendimentosDashboard,
  MetricasAtendimentoOperador,
  MetricasBaseKpisResponse,
} from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'

import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ExpedienteStatusBadge } from '@/components/ExpedienteStatusBadge'
import { MetricasFichaAtendimentoSection } from '@/components/MetricasFichaAtendimentoSection'
import { DailyEvolutionSection } from '@/components/DailyEvolutionSection'
import { AtividadeColaboradorSection } from '@/components/AtividadeColaboradorSection'
import { ExportacaoRelatoriosSection } from '@/components/ExportacaoRelatoriosSection'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SEGMENTOS_OFICIAIS } from '@/lib/segmentos'
import { usePresence } from '@/hooks/usePresence'
import { calcularTaxaConversao } from '@/lib/conversao'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])
  const [loading, setLoading] = useState(true)
  const [loadingAtendimentos, setLoadingAtendimentos] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<string>('todas')
  const [selectedCategoria, setSelectedCategoria] = useState<string>('todas')
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoAtendimentoFiltro>('total')
  const [selectedSegmento, setSelectedSegmento] = useState<string>('todos')
  const [metricasAtendimento, setMetricasAtendimento] =
    useState<MetricasAtendimentosDashboard | null>(null)
  const [baseKpisData, setBaseKpisData] = useState<MetricasBaseKpisResponse | null>(null)
  const [erroBaseKpis, setErroBaseKpis] = useState<string | null>(null)

  // Presença online em tempo real para Admin e Supervisor
  const { presenceData } = usePresence({ pollStatus: true })

  // Ordenação da tabela por operador
  const [sortField, setSortField] = useState<
    'conversoes' | 'atendimentos' | 'taxaConversao' | 'pontosGamificacao'
  >('conversoes')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Operador selecionado para destaque/modal rápido
  const [selectedOperadorDetalhe, setSelectedOperadorDetalhe] =
    useState<MetricasAtendimentoOperador | null>(null)

  // Filtro para exibir apenas operadores atuando (com dados no período/escopo)
  const [apenasAtuando, setApenasAtuando] = useState<boolean>(true)

  useEffect(() => {
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate(user.role === 'lider' ? '/equipe' : '/meu-painel', { replace: true })
    }
  }, [user, navigate])

  // Recarregar dados de base quando a região ou a categoria mudam
  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadDataBase()
    }
  }, [user, selectedRegion, selectedCategoria])

  // Gerenciamento da aba ativa sincronizada com searchParams (?tab=visao_geral | evolucao | atividade | relatorios)
  const activeTab = searchParams.get('tab') || 'visao_geral'
  const setActiveTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'visao_geral') {
        next.delete('tab')
      } else {
        next.set('tab', tab)
      }
      return next
    })
  }

  // Lista de operadores para alimentar as abas Atividade e Relatórios
  const operadoresList = React.useMemo(() => {
    if (!metricasAtendimento?.operadores) return []
    return metricasAtendimento.operadores
      .map((op) => op.operadorNome)
      .filter((nome, index, self) => Boolean(nome) && self.indexOf(nome) === index)
      .sort((a, b) => a.localeCompare(b))
  }, [metricasAtendimento])

  // Recarregar métricas de atendimento quando filtros mudam
  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadMetricasAtendimento()
    }
  }, [user, selectedRegion, selectedPeriodo])

  if (user?.role === 'operador' || user?.role === 'lider') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const loadDataBase = async () => {
    setLoading(true)
    setErroBaseKpis(null)
    try {
      const [resKpis, resImp, resRegioes] = await Promise.all([
        fetchMetricasBaseKpis({ regiao: selectedRegion, baseCategoria: selectedCategoria }),
        fetchImportacoes().catch(() => [] as Importacao[]),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setBaseKpisData(resKpis)
      setImportacoes(resImp)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err: any) {
      console.error('Erro ao carregar métricas de base:', err)
      setErroBaseKpis(err?.message || 'Falha ao carregar KPIs da base')
    } finally {
      setLoading(false)
    }
  }

  const loadMetricasAtendimento = async () => {
    setLoadingAtendimentos(true)
    try {
      const dados = await fetchMetricasAtendimentosDashboard({
        periodo: selectedPeriodo,
        regiao: selectedRegion,
      })
      setMetricasAtendimento(dados)
    } catch (err) {
      console.error('Erro ao carregar métricas de atendimento:', err)
    } finally {
      setLoadingAtendimentos(false)
    }
  }

  // KPIs consolidados via agregação real no servidor (com suporte snake_case e camelCase)
  const totalBase = Number(
    baseKpisData?.kpis?.totalBase ??
      (baseKpisData?.kpis as any)?.total_base ??
      (baseKpisData as any)?.totalBase ??
      (baseKpisData as any)?.total_base ??
      0,
  )
  const naFila = Number(
    baseKpisData?.kpis?.naFila ??
      (baseKpisData?.kpis as any)?.na_fila ??
      (baseKpisData as any)?.naFila ??
      (baseKpisData as any)?.na_fila ??
      0,
  )
  // Reativações REAIS da equipe (atendimento por operador com pedido / confirmação)
  const reativados = Number(
    baseKpisData?.kpis?.reativadosReais ??
      baseKpisData?.kpis?.reativados ??
      (baseKpisData?.kpis as any)?.reativado ??
      0,
  )
  const taxaReativacao = Number(
    baseKpisData?.kpis?.taxaReativacaoFloat ??
      baseKpisData?.kpis?.taxaReativacao ??
      (baseKpisData?.kpis as any)?.taxa_reativacao ??
      0,
  )
  const valorRecuperado = Number(
    baseKpisData?.kpis?.valorRecuperado ?? (baseKpisData?.kpis as any)?.valor_recuperado ?? 0,
  )
  const toneladasRecuperadas = Number(
    baseKpisData?.kpis?.toneladasRecuperadas ??
      (baseKpisData?.kpis as any)?.toneladas_recuperadas ??
      0,
  )

  // Clientes com Faturamento Recente identificados no Cruzamento de Planilhas (sem atendimento de operador)
  const faturamentoCruzamentoCount = Number(
    baseKpisData?.kpis?.faturamentoRecenteCruzamento ??
      (baseKpisData?.kpis as any)?.faturamento_recente_cruzamento ??
      0,
  )
  const valorFaturamentoCruzamento = Number(
    baseKpisData?.kpis?.valorFaturamentoCruzamento ??
      (baseKpisData?.kpis as any)?.valor_faturamento_recente_cruzamento ??
      0,
  )
  const toneladasFaturamentoCruzamento = Number(
    baseKpisData?.kpis?.toneladasFaturamentoCruzamento ??
      (baseKpisData?.kpis as any)?.toneladas_faturamento_recente_cruzamento ??
      0,
  )

  const pedidosEmAbertoCount = Number(
    baseKpisData?.kpis?.pedidosEmAberto ?? (baseKpisData?.kpis as any)?.pedidos_em_aberto ?? 0,
  )
  const valorPedidosEmAberto = Number(
    baseKpisData?.kpis?.valorPedidosEmAberto ??
      (baseKpisData?.kpis as any)?.valor_pedidos_em_aberto ??
      0,
  )

  // Distribuição por estado via agregação real no servidor
  const estadosContagem = baseKpisData?.estadosContagem || {
    na_base: 0,
    em_atendimento: 0,
    reagendado: 0,
    contatado: 0,
    reativado: 0,
    compra_terceiros: 0,
    nao_quer_negociar: 0,
    restricao_financeira: 0,
    sem_contato: 0,
  }

  // Agrupamento por região da base inteira
  const regioesMap = baseKpisData?.regioesMap || {}

  const ativosRemovidosData = metricasAtendimento?.ativosRemovidos || {
    total: 0,
    breakdown: {},
    itens: [],
  }

  // Helpers de formatação para abreviação elegante de valores grandes com tooltip
  const formatCompactCurrency = (valor: number): string => {
    if (valor >= 1_000_000_000) {
      const val = valor / 1_000_000_000
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bi`
    }
    if (valor >= 1_000_000) {
      const val = valor / 1_000_000
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
    }
    if (valor >= 100_000) {
      const val = valor / 1_000
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`
    }
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatFullCurrency = (valor: number): string => {
    return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-6">
      {/* Abas Principais do Dashboard - Estilo ABR: Azul dominante #253575 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <TabsList className="bg-slate-100 p-1 border border-slate-200 rounded-xl h-auto flex flex-wrap sm:inline-flex">
            <TabsTrigger
              value="visao_geral"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 hover:text-slate-900"
            >
              <Activity className="h-4 w-4 mr-2" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger
              value="evolucao"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 hover:text-slate-900"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Evolução
            </TabsTrigger>
            <TabsTrigger
              value="atividade"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 hover:text-slate-900"
            >
              <Users className="h-4 w-4 mr-2" />
              Atividade
            </TabsTrigger>
            <TabsTrigger
              value="relatorios"
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 hover:text-slate-900"
            >
              <FileText className="h-4 w-4 mr-2" />
              Relatórios
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ========================================================================= */}
        {/* ABA 2 — EVOLUÇÃO DIÁRIA DO MÊS */}
        {/* ========================================================================= */}
        <TabsContent value="evolucao" className="mt-0 space-y-6 focus-visible:outline-hidden">
          <DailyEvolutionSection
            selectedRegiao={selectedRegion !== 'todas' ? selectedRegion : undefined}
          />
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 3 — ATIVIDADE POR COLABORADOR */}
        {/* ========================================================================= */}
        <TabsContent value="atividade" className="mt-0 space-y-6 focus-visible:outline-hidden">
          <AtividadeColaboradorSection
            regioesList={regioesList}
            operadoresList={operadoresList}
            selectedRegiaoDefault={selectedRegion}
          />
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 4 — EXPORTAÇÃO E FILTROS DE RELATÓRIOS */}
        {/* ========================================================================= */}
        <TabsContent value="relatorios" className="mt-0 space-y-6 focus-visible:outline-hidden">
          <ExportacaoRelatoriosSection
            regioesList={regioesList}
            operadoresList={operadoresList}
            selectedRegiaoDefault={selectedRegion}
          />
        </TabsContent>

        {/* ========================================================================= */}
        {/* ABA 1 — VISÃO GERAL (CONTEÚDO ATUAL DO DASHBOARD) */}
        {/* ========================================================================= */}
        <TabsContent value="visao_geral" className="mt-0 space-y-6 focus-visible:outline-hidden">
          {/* Top Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  Painel Executivo de Reativação
                </h2>
                <ExpedienteStatusBadge showHorarioAtual />

                {/* Contador discreto de usuários online agora (Admin / Supervisor) */}
                {presenceData && (user?.role === 'admin' || user?.role === 'supervisor') && (
                  <Link
                    to={user.role === 'admin' ? '/configuracoes' : '#'}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
                    title={`${presenceData.summary.online} de ${presenceData.summary.total} usuários conectados nos últimos 5 minutos`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>
                      <strong>{presenceData.summary.online}</strong>{' '}
                      {presenceData.summary.online === 1 ? 'usuário online' : 'usuários online'}{' '}
                      agora
                    </span>
                  </Link>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento de recuperação de carteira inativa e taxa de conversão.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Seletor de Período para Atendimentos */}
              <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
                <span className="text-[11px] text-slate-500 font-medium px-2 flex items-center">
                  <Calendar className="h-3 w-3 mr-1 text-slate-400" />
                  Período:
                </span>
                <button
                  onClick={() => setSelectedPeriodo('hoje')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    selectedPeriodo === 'hoje'
                      ? 'bg-[#253575] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => setSelectedPeriodo('7dias')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    selectedPeriodo === '7dias'
                      ? 'bg-[#253575] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  7 Dias
                </button>
                <button
                  onClick={() => setSelectedPeriodo('30dias')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    selectedPeriodo === '30dias'
                      ? 'bg-[#253575] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  30 Dias
                </button>
                <button
                  onClick={() => setSelectedPeriodo('total')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    selectedPeriodo === 'total'
                      ? 'bg-[#253575] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  Total
                </button>
              </div>

              <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500 font-medium">Região:</span>
                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent focus:ring-0 w-36">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Regiões</SelectItem>
                    {regioesList.map((reg) => (
                      <SelectItem key={reg} value={reg}>
                        {reg}
                      </SelectItem>
                    ))}
                    <SelectItem value="Sem Região">Sem Região</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Segmento */}
              <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Segmento:</span>
                <Select value={selectedSegmento} onValueChange={setSelectedSegmento}>
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent focus:ring-0 w-44 font-medium text-slate-800">
                    <SelectValue placeholder="Todos os Segmentos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Segmentos</SelectItem>
                    {SEGMENTOS_OFICIAIS.map((seg) => (
                      <SelectItem key={seg} value={seg}>
                        {seg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Categoria de Base */}
              <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Base:</span>
                <Select value={selectedCategoria} onValueChange={setSelectedCategoria}>
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent focus:ring-0 w-44 font-medium text-slate-800">
                    <SelectValue placeholder="Todas as Bases" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Bases</SelectItem>
                    <SelectItem value="normal">🎯 Base Normal</SelectItem>
                    <SelectItem value="cliente_final">🛑 Cliente Final</SelectItem>
                    <SelectItem value="atacado_fora_mapa">📍 ATACADO Fora do Mapa</SelectItem>
                    <SelectItem value="sem_dono">⚠️ Sem Dono (Equipe)</SelectItem>
                    <SelectItem value="repescagem">🔄 Repescagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadDataBase()
                  loadMetricasAtendimento()
                }}
                disabled={loading || loadingAtendimentos}
                className="h-8 text-xs text-slate-600"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1.5 ${
                    loading || loadingAtendimentos ? 'animate-spin' : ''
                  }`}
                />
                Atualizar
              </Button>
            </div>
          </div>

          {/* SEÇÃO DE ATENDIMENTOS: NÍVEL 1 — MÉTRICAS GERAIS DE ATENDIMENTO */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-[#253575] text-white flex items-center justify-center shadow-xs">
                  <Layers className="h-4 w-4" />
                </div>{' '}
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Métricas de Atendimento
                    </h3>
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-mono uppercase"
                    >
                      {selectedPeriodo === 'hoje'
                        ? 'Hoje'
                        : selectedPeriodo === '7dias'
                          ? 'Últimos 7 dias'
                          : selectedPeriodo === '30dias'
                            ? 'Últimos 30 dias'
                            : 'Histórico Total'}
                    </Badge>
                    {selectedRegion !== 'todas' && (
                      <Badge
                        variant="outline"
                        className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]"
                      >
                        {selectedRegion}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Consolidação geral e por operador em tempo real alinhada ao Meu Painel.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span>
                  Follow-ups pendentes acumulados:{' '}
                  <strong className="text-amber-700 font-mono">
                    {metricasAtendimento?.gerais.followUpsPendentes || 0}
                  </strong>
                </span>
              </div>
            </div>

            {/* Cards Nível 1 — 7 KPIs de Atendimento */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {/* Total Atendimentos Realizados */}
              <Card className="border-slate-200 shadow-xs hover:border-[#253575]/40 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Total Atendidos
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Total Atendidos"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-blue-200 mb-1">Total de Atendimentos:</p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Soma de todas as interações e fichas preenchidas no período (contatos,
                              reagendamentos, vendas e recusas).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-[#253575]/10 text-[#253575] shrink-0">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-[#253575] font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.totalAtendimentos || 0}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    desfecho ou andamento
                  </span>
                </CardContent>
              </Card>

              {/* Ligações / Contatos Feitos */}
              <Card className="border-slate-200 shadow-xs hover:border-[#253575]/40 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Ligações Feitas
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Ligações Feitas"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-blue-200 mb-1">
                              Ligações / Contatos Efetivos:
                            </p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Chamadas ativas realizadas pela equipe e formulários concluídos no
                              período. Serve como base para a taxa de conversão.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-[#253575]/10 text-[#253575] shrink-0">
                      <PhoneCall className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-[#253575] font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.ligacoesFeitas || 0}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    chamadas & formulários
                  </span>
                </CardContent>
              </Card>

              {/* Conversões */}
              <Card className="border-slate-200 shadow-xs hover:border-emerald-300 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Conversões
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-emerald-700 shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Conversões"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-emerald-400 mb-1">
                              Total de Conversões (Eventos):
                            </p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Conta cada atendimento/ficha fechado com sucesso (desfecho reativado
                              ou pedido) no período. Diferente do card &quot;Clientes
                              Reativados&quot; (21), que consolida clientes ÚNICOS.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.conversoes || 0}
                  </div>
                  <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block truncate">
                    reativados / compra
                  </span>
                </CardContent>
              </Card>

              {/* Taxa de Conversão Geral */}
              <Card className="border-slate-200 shadow-xs hover:border-purple-300 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Taxa Conversão
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-purple-700 shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Taxa de Conversão"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-purple-300 mb-1">
                              Taxa de Conversão da Equipe:
                            </p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Percentual de atendimentos convertidos em relação ao total de
                              ligações/chamadas realizadas (Conversões ÷ Ligações).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-purple-50 text-purple-600 shrink-0">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-purple-700 font-mono">
                    {loadingAtendimentos
                      ? '—'
                      : `${metricasAtendimento?.gerais.taxaConversao || 0}%`}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    conversoes / ligações
                  </span>
                </CardContent>
              </Card>

              {/* Reagendamentos */}
              <Card className="border-slate-200 shadow-xs hover:border-amber-300 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Reagendamentos
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-amber-700 shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Reagendamentos"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-amber-300 mb-1">Retornos Marcados:</p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Total de contatos em que o cliente solicitou retorno futuro ou
                              agendamento de proposta registrado pela equipe.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-amber-50 text-amber-600 shrink-0">
                      <PhoneForwarded className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-600 font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.reagendamentos || 0}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    retornos marcados
                  </span>
                </CardContent>
              </Card>

              {/* Follow-ups do Dia */}
              <Card className="border-slate-200 shadow-xs hover:border-rose-300 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Follow-ups Hoje
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-rose-700 shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Follow-ups de Hoje"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-rose-300 mb-1">
                              Follow-ups Agendados para Hoje:
                            </p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Contatos programados especificamente para a data de hoje (horário de
                              Brasília) aguardando retorno do operador.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-rose-50 text-rose-600 shrink-0">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-rose-600 font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.followUpsHoje || 0}
                  </div>
                  <span className="text-[10px] text-rose-700 font-medium mt-0.5 block truncate">
                    agendados p/ hoje
                  </span>
                </CardContent>
              </Card>

              {/* Vendas Perdidas */}
              <Card className="border-slate-200 shadow-xs hover:border-slate-400 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                        Vendas Perdidas
                      </span>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-slate-700 shrink-0 p-0.5 focus:outline-hidden"
                              aria-label="Informações sobre Vendas Perdidas"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                          >
                            <p className="font-bold text-slate-200 mb-1">
                              Vendas Perdidas e Recusas:
                            </p>
                            <p className="text-slate-200 text-[11px] leading-relaxed">
                              Atendimentos encerrados sem venda: compra de terceiros, sem interesse
                              em negociar, restrição financeira ou sem contato.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="p-1 rounded-md bg-slate-100 text-slate-600 shrink-0">
                      <XCircle className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-700 font-mono">
                    {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.vendasPerdidas || 0}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                    recusas / terceiros / s.c.
                  </span>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* SEÇÃO DE ATENDIMENTOS: NÍVEL 2 — MÉTRICAS POR OPERADOR (TABELA ORDENÁVEL COM TOTALIZADOR) */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Desempenho por Operador
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Métricas individuais consolidadas por operador na rota (
                      {selectedRegion === 'todas' ? 'Todas as Rotas' : selectedRegion})
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Controle discreto: Apenas quem atuou / Mostrar todos */}
                  <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                    <Switch
                      id="toggle-apenas-atuando"
                      checked={apenasAtuando}
                      onCheckedChange={setApenasAtuando}
                      className="data-[state=checked]:bg-emerald-600 h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                    />
                    <label
                      htmlFor="toggle-apenas-atuando"
                      className="text-xs font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap"
                    >
                      {apenasAtuando ? 'Apenas quem atuou' : 'Mostrar todos'}
                    </label>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-400">Ordenar por:</span>
                    <Button
                      variant={sortField === 'conversoes' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (sortField === 'conversoes') {
                          setSortAsc(!sortAsc)
                        } else {
                          setSortField('conversoes')
                          setSortAsc(false)
                        }
                      }}
                      className={`h-7 px-2.5 text-xs ${sortField === 'conversoes' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'text-slate-600'}`}
                    >
                      Conversões
                      <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                    </Button>
                    <Button
                      variant={sortField === 'atendimentos' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (sortField === 'atendimentos') {
                          setSortAsc(!sortAsc)
                        } else {
                          setSortField('atendimentos')
                          setSortAsc(false)
                        }
                      }}
                      className={`h-7 px-2.5 text-xs ${sortField === 'atendimentos' ? 'bg-[#253575] hover:bg-[#1e2b5e] text-white' : 'text-slate-600'}`}
                    >
                      Atendimentos
                      <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                    </Button>
                    <Button
                      variant={sortField === 'taxaConversao' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (sortField === 'taxaConversao') {
                          setSortAsc(!sortAsc)
                        } else {
                          setSortField('taxaConversao')
                          setSortAsc(false)
                        }
                      }}
                      className={`h-7 px-2.5 text-xs ${sortField === 'taxaConversao' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'text-slate-600'}`}
                    >
                      Taxa %
                      <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                    </Button>
                    <Button
                      variant={sortField === 'pontosGamificacao' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (sortField === 'pontosGamificacao') {
                          setSortAsc(!sortAsc)
                        } else {
                          setSortField('pontosGamificacao')
                          setSortAsc(false)
                        }
                      }}
                      className={`h-7 px-2.5 text-xs ${sortField === 'pontosGamificacao' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'text-slate-600'}`}
                    >
                      Pontos
                      <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAtendimentos ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                  Carregando métricas dos operadores...
                </div>
              ) : !metricasAtendimento || metricasAtendimento.operadores.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nenhum operador com atendimentos encontrado para o filtro selecionado.
                </div>
              ) : (
                (() => {
                  // Filtrar operadores: se apenasAtuando estiver ativo, filtrar apenas quem tem atividade real no período
                  // Apenas operadores e líderes de rota (administradores e supervisores já são excluídos do ranking)
                  const baseOperadores = metricasAtendimento.operadores.filter(
                    (op) => op.role === 'operador' || op.role === 'lider',
                  )
                  const operadoresFiltrados = apenasAtuando
                    ? baseOperadores.filter((op) => {
                        const temAtividade =
                          (op.atendimentos || 0) > 0 ||
                          (op.ligacoes || 0) > 0 ||
                          (op.conversoes || 0) > 0 ||
                          (op.reagendamentos || 0) > 0 ||
                          (op.followUpsHoje || 0) > 0 ||
                          (op.vendasPerdidas || 0) > 0 ||
                          (op.pontosGamificacao || 0) > 0
                        return temAtividade
                      })
                    : baseOperadores

                  if (operadoresFiltrados.length === 0) {
                    return (
                      <div className="py-12 px-4 text-center text-xs text-slate-500 space-y-2">
                        <p className="font-medium text-slate-700">
                          Nenhum operador com atividade registrada para o período selecionado.
                        </p>
                        <p className="text-slate-400">
                          Os operadores zerados estão ocultos por padrão.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setApenasAtuando(false)}
                          className="h-7 text-xs text-[#253575] border-[#253575]/30 hover:bg-[#253575]/5 mt-1"
                        >
                          Mostrar todos ({baseOperadores.length} operadores cadastrados)
                        </Button>
                      </div>
                    )
                  }

                  // Ordenar lista de operadores visíveis
                  const sortedOperadores = [...operadoresFiltrados].sort((a, b) => {
                    const valA = a[sortField]
                    const valB = b[sortField]
                    if (valA !== valB) {
                      if (sortAsc) {
                        return valA > valB ? 1 : -1
                      } else {
                        return valA < valB ? 1 : -1
                      }
                    }
                    // Desempates estáveis quando valores são iguais
                    if (b.conversoes !== a.conversoes) return b.conversoes - a.conversoes
                    if (b.atendimentos !== a.atendimentos) return b.atendimentos - a.atendimentos
                    if (b.pontosGamificacao !== a.pontosGamificacao)
                      return b.pontosGamificacao - a.pontosGamificacao
                    return a.operadorNome.localeCompare(b.operadorNome)
                  })

                  // Somatórios para o totalizador dos visíveis
                  const totalAtendimentos = sortedOperadores.reduce(
                    (acc, o) => acc + o.atendimentos,
                    0,
                  )
                  const totalLigacoes = sortedOperadores.reduce((acc, o) => acc + o.ligacoes, 0)
                  const totalConversoes = sortedOperadores.reduce((acc, o) => acc + o.conversoes, 0)
                  const totalReagendamentos = sortedOperadores.reduce(
                    (acc, o) => acc + o.reagendamentos,
                    0,
                  )
                  const totalFollowUpsHoje = sortedOperadores.reduce(
                    (acc, o) => acc + o.followUpsHoje,
                    0,
                  )
                  const totalPontos = sortedOperadores.reduce(
                    (acc, o) => acc + o.pontosGamificacao,
                    0,
                  )
                  const taxaMedia = calcularTaxaConversao(totalConversoes, totalLigacoes)

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4 font-semibold">Operador / Cargo</th>
                            <th className="py-3 px-4 font-semibold">Região / Rota</th>
                            <th className="py-3 px-3 text-center font-semibold">Atendimentos</th>
                            <th className="py-3 px-3 text-center font-semibold">Ligações</th>
                            <th className="py-3 px-3 text-center font-semibold text-emerald-700">
                              Conversões
                            </th>
                            <th className="py-3 px-3 text-center font-semibold text-amber-700">
                              Reagendados
                            </th>
                            <th className="py-3 px-3 text-center font-semibold text-rose-700">
                              Follow-ups Hoje
                            </th>
                            <th className="py-3 px-3 text-center font-semibold text-purple-700">
                              Taxa %
                            </th>
                            <th className="py-3 px-4 text-right font-semibold text-amber-700">
                              Pontos Gamificação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedOperadores.map((op, idx) => {
                            const isTop = idx === 0 && op.conversoes > 0
                            const isSelected = selectedOperadorDetalhe?.operadorId === op.operadorId
                            return (
                              <tr
                                key={op.operadorId}
                                onClick={() => setSelectedOperadorDetalhe(isSelected ? null : op)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-[#253575]/10 border-l-4 border-l-[#253575] font-medium'
                                    : isTop
                                      ? 'bg-amber-50/40 hover:bg-amber-50/80'
                                      : 'hover:bg-slate-50/80'
                                }`}
                              >
                                {/* Nome + Cargo */}
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center space-x-2">
                                    {isTop ? (
                                      <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                                    ) : (
                                      <span className="text-[11px] font-mono text-slate-400 w-4 text-right">
                                        #{idx + 1}
                                      </span>
                                    )}
                                    <div>
                                      <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                                        <span>{op.operadorNome}</span>
                                        {op.tituloGamificacao && (
                                          <span
                                            className="text-xs"
                                            title={op.tituloGamificacao.nome}
                                          >
                                            {op.tituloGamificacao.emoji}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                                        <span className="capitalize">{op.role}</span>
                                        <span>•</span>
                                        <span className="truncate max-w-[150px]">
                                          {op.operadorEmail}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Região */}
                                <td className="py-2.5 px-4 text-slate-600">
                                  <span className="inline-block max-w-[200px] truncate text-[11px] font-medium">
                                    {op.regiao}
                                  </span>
                                </td>

                                {/* Atendimentos Realizados */}
                                <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                                  {op.atendimentos}
                                </td>

                                {/* Ligações Feitas */}
                                <td className="py-2.5 px-3 text-center font-mono text-[#253575] font-semibold">
                                  {op.ligacoes}
                                </td>

                                {/* Conversões */}
                                <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">
                                  {op.conversoes > 0 ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-mono font-bold hover:bg-emerald-200">
                                      {op.conversoes}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400">0</span>
                                  )}
                                </td>

                                {/* Reagendamentos */}
                                <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                                  {op.reagendamentos}
                                </td>

                                {/* Follow-ups Hoje */}
                                <td className="py-2.5 px-3 text-center font-mono">
                                  {op.followUpsHoje > 0 ? (
                                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs font-mono font-bold">
                                      {op.followUpsHoje}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400">0</span>
                                  )}
                                </td>

                                {/* Taxa de Conversão */}
                                <td className="py-2.5 px-3 text-center font-mono font-semibold text-purple-700">
                                  {op.taxaConversao}%
                                </td>

                                {/* Pontos Gamificação */}
                                <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">
                                  <span className="bg-amber-50 px-2 py-0.5 rounded text-amber-800 border border-amber-200">
                                    {op.pontosGamificacao.toLocaleString('pt-BR')} pts
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>

                        {/* TOTALIZADOR NO FIM DA TABELA */}
                        <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                          <tr>
                            <td className="py-3 px-4 font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                              Total Geral ({sortedOperadores.length}{' '}
                              {sortedOperadores.length === 1 ? 'operador' : 'operadores'}
                              {apenasAtuando && baseOperadores.length !== sortedOperadores.length
                                ? ` atuando de ${baseOperadores.length}`
                                : ''}
                              )
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-[11px]">
                              {selectedRegion === 'todas' ? 'Todas as rotas' : selectedRegion}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-slate-900 text-sm">
                              {totalAtendimentos}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-blue-700 text-sm">
                              {totalLigacoes}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-emerald-700 text-sm">
                              <Badge className="bg-emerald-600 text-white font-mono font-black text-xs">
                                {totalConversoes}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-amber-700 text-sm">
                              {totalReagendamentos}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-rose-700 text-sm">
                              <Badge className="bg-rose-600 text-white font-mono font-black text-xs">
                                {totalFollowUpsHoje}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-purple-700 text-sm">
                              {taxaMedia}%
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-amber-800 text-sm">
                              {totalPontos.toLocaleString('pt-BR')} pts
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>

          {/* Destaque / Detalhe Rápido do Operador Clicado */}
          {selectedOperadorDetalhe && (
            <Card className="border-[#253575]/20 bg-[#253575]/5 shadow-xs animate-in fade-in duration-200">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-[#253575] text-white text-[10px]">
                      Operador Selecionado
                    </Badge>
                    <h4 className="font-bold text-sm text-[#253575]">
                      {selectedOperadorDetalhe.operadorNome}
                    </h4>
                    {selectedOperadorDetalhe.tituloGamificacao && (
                      <Badge
                        variant="outline"
                        className="bg-white border-amber-300 text-amber-800 text-xs"
                      >
                        {selectedOperadorDetalhe.tituloGamificacao.emoji}{' '}
                        {selectedOperadorDetalhe.tituloGamificacao.nome}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">
                    Regiões: <strong>{selectedOperadorDetalhe.regiao}</strong> • Email:{' '}
                    {selectedOperadorDetalhe.operadorEmail}
                  </p>
                </div>
                <div className="flex items-center space-x-3 text-xs font-mono">
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-center">
                    <span className="text-[10px] text-slate-400 block uppercase">Conversões</span>
                    <span className="font-black text-emerald-600 text-sm">
                      {selectedOperadorDetalhe.conversoes}
                    </span>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-center">
                    <span className="text-[10px] text-slate-400 block uppercase">
                      Taxa Conversão
                    </span>
                    <span className="font-black text-purple-700 text-sm">
                      {selectedOperadorDetalhe.taxaConversao}%
                    </span>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-center">
                    <span className="text-[10px] text-slate-400 block uppercase">Pontuação</span>
                    <span className="font-black text-amber-600 text-sm">
                      {selectedOperadorDetalhe.pontosGamificacao}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOperadorDetalhe(null)}
                    className="h-8 text-xs text-slate-500 hover:text-slate-800"
                  >
                    Fechar ✕
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SEÇÃO DA BASE DE CLIENTES E INATIVOS (KPIS ORIGINAIS DA CARTEIRA) */}
          <div className="pt-2 space-y-4">
            {erroBaseKpis && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center justify-between text-xs text-amber-900 shadow-2xs">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Não foi possível atualizar os KPIs da base ({erroBaseKpis}).</span>
                </div>
                <Button
                  onClick={loadDataBase}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Tentar novamente
                </Button>
              </div>
            )}

            {/* Cabeçalho da Seção */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-[#253575] text-white flex items-center justify-center shadow-xs">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#142758] uppercase tracking-wider">
                    Métricas de Carteira e Recuperação da Base
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Reativações reais da equipe separadas de faturamento recente do cruzamento
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  7 Indicadores
                </span>
              </div>
            </div>

            {/* Grid dos 7 Indicadores em Layout Arejado (4 colunas no desktop xl, 2 colunas sm/md, 1 mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* CARD 1: TOTAL INATIVOS BASE (Base) */}
              <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Total Inativos Base
                        </span>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Total Inativos Base"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-blue-200 mb-1">
                                Carteira Geral de Inativos:
                              </p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Total de clientes cadastrados sob acompanhamento (exclui apenas
                                cadastros já removidos como ativos fora da base).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Carteira geral sob acompanhamento
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-[#253575]/10 flex items-center justify-center text-[#253575] shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                      <Users className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                      {totalBase.toLocaleString('pt-BR')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      Aguardando contato ou reconciliação
                    </p>
                  </div>
                </div>

                {/* Rodapé Alinhado */}
                <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Base total cadastrada</span>
                  <span className="font-mono text-slate-400 text-[10px]">100%</span>
                </div>
              </Card>

              {/* CARD 2: NA FILA DE TRABALHO (Base) */}
              <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Na Fila de Trabalho
                        </span>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Na Fila de Trabalho"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-blue-200 mb-1">Esteira Disponível:</p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Clientes livres na esteira aguardando contato (estados
                                &quot;na_base&quot; e &quot;reservado&quot;), respeitando as regras
                                de carteira e rota de cada operador.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Esteira disponível para contato
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#253575] shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                      <Clock className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#253575] tabular-nums tracking-tight">
                      {naFila.toLocaleString('pt-BR')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      Clientes prontos para abordagem
                    </p>
                  </div>
                </div>

                {/* Rodapé Alinhado */}
                <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Disponíveis p/ operadores</span>
                  <span className="font-mono text-slate-500 font-semibold text-[11px]">
                    {totalBase > 0 ? `${Math.round((naFila / totalBase) * 100)}% da base` : '—'}
                  </span>
                </div>
              </Card>

              {/* CARD 3: CLIENTES REATIVADOS (Resultado Real da Equipe) */}
              <Card className="border-emerald-200/90 bg-emerald-50/20 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
                          Clientes Reativados
                        </span>
                        <Badge className="bg-emerald-700 text-white hover:bg-emerald-700 text-[10px] font-semibold px-1.5 py-0 rounded border-0 shrink-0">
                          Real Equipe
                        </Badge>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-emerald-700 hover:text-emerald-950 shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Clientes Reativados Real Equipe"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-emerald-400 mb-1">
                                Reativações Reais da Equipe (Clientes Únicos):
                              </p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Conta clientes ÚNICOS com ficha preenchida pela equipe e
                                pedido/confirmação (desfechos isentos excluídos; dedupe por
                                cliente). Valores e toneladas vêm das fichas da equipe.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-emerald-800 line-clamp-1 mt-0.5">
                        Atendidos c/ operador e pedido
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                      <UserCheck className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-emerald-800 tabular-nums tracking-tight">
                      {reativados.toLocaleString('pt-BR')}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-800 cursor-pointer hover:text-emerald-950">
                            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                            <span className="truncate">
                              {formatCompactCurrency(valorRecuperado)}
                            </span>
                            <span className="text-emerald-700 font-normal shrink-0">
                              ({toneladasRecuperadas.toLocaleString('pt-BR')} ton)
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg">
                          <p className="font-bold text-emerald-300">Reativações Reais da Equipe:</p>
                          <p className="font-mono text-emerald-400 font-bold text-sm mt-0.5">
                            {formatFullCurrency(valorRecuperado)}
                          </p>
                          <p className="text-slate-200 text-[11px] mt-0.5">
                            Volume: {toneladasRecuperadas.toLocaleString('pt-BR')} toneladas
                          </p>
                          <p className="text-blue-200 text-[10px] mt-1 pt-1 border-t border-blue-900/60">
                            Soma das fichas da equipe (dedupe por cliente)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Rodapé Alinhado */}
                <div className="px-4 py-2.5 bg-emerald-100/50 border-t border-emerald-200/70 flex items-center justify-between text-[11px] text-emerald-900">
                  <span className="font-medium">Conversões confirmadas</span>
                  <span className="font-semibold text-emerald-800 text-[11px]">
                    Sucesso comprovado
                  </span>
                </div>
              </Card>

              {/* CARD 4: TAXA DE RECUPERAÇÃO (Resultado) */}
              <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Taxa de Recuperação
                        </span>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Taxa de Recuperação"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-blue-200 mb-1">Eficiência da Base:</p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Percentual de clientes reativados pela equipe em relação ao total da
                                base inativa cadastrada (Reativados Reais ÷ Total Base).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Eficiência de reativação real
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#253575] shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                      <Percent className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                      {taxaReativacao.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      Meta operacional da esteira: &ge; 18%
                    </p>
                  </div>
                </div>

                {/* Rodapé Alinhado com Barra de Progresso Relativa à Meta */}
                <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">Meta: &ge; 18%</span>
                  <span
                    className={`font-semibold text-[11px] ${
                      taxaReativacao >= 18 ? 'text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {taxaReativacao >= 18 ? 'Meta Atingida' : 'Em andamento'}
                  </span>
                </div>
              </Card>

              {/* CARD 5: PEDIDOS EM ABERTO (Financeiro / Pendente) */}
              <Card className="border-amber-200/90 bg-white shadow-xs hover:shadow-md hover:border-amber-400 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                          Pedidos em Aberto
                        </span>
                        <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100 text-[10px] font-semibold px-1.5 py-0 rounded shrink-0">
                          Pendente
                        </Badge>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-amber-700 hover:text-amber-900 shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Pedidos em Aberto"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-amber-300 mb-1">
                                Pedidos Aguardando Faturamento:
                              </p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Clientes com pedido de reativação registrado pela equipe cuja nota
                                fiscal ainda não foi faturada no ERP.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Aguardando faturamento / emissão NF
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                      {pedidosEmAbertoCount}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="mt-1 text-[11px] font-semibold text-slate-700 cursor-pointer hover:text-slate-900 truncate">
                            {formatCompactCurrency(valorPedidosEmAberto)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg">
                          <p className="font-bold text-amber-300">Valor em Aberto:</p>
                          <p className="font-mono text-amber-400 font-bold text-sm mt-0.5">
                            {formatFullCurrency(valorPedidosEmAberto)}
                          </p>
                          <p className="text-slate-200 text-[11px] mt-0.5">
                            {pedidosEmAbertoCount}{' '}
                            {pedidosEmAbertoCount === 1
                              ? 'pedido aguardando'
                              : 'pedidos aguardando'}{' '}
                            emissão de NF
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Rodapé Alinhado com Link de Ação CTA em Laranja */}
                <div className="px-4 py-2.5 bg-amber-50/40 border-t border-amber-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 truncate">Reativações c/ pedido</span>
                  <Link
                    to="/clientes"
                    className="font-bold text-[#F18800] hover:text-[#d97706] hover:underline inline-flex items-center gap-0.5 shrink-0 transition-colors"
                  >
                    Listar &rarr;
                  </Link>
                </div>
              </Card>

              {/* CARD 6: FATURAMENTO RECENTE (Financeiro / Cruzamento) */}
              <Card className="border-amber-200/90 bg-white shadow-xs hover:shadow-md hover:border-amber-400 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                          Faturamento Recente
                        </span>
                        <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100 text-[10px] font-semibold px-1.5 py-0 rounded shrink-0">
                          Cruzamento
                        </Badge>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-amber-700 hover:text-amber-900 shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Faturamento Recente do Cruzamento"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-amber-300 mb-1">
                                Cruzamento Automático ERP:
                              </p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Clientes que faturaram no ERP sem ficha de atendimento vinculada à
                                equipe de reativação. Serve de insumo para reconciliação e limpeza
                                da base.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Identificados na base sem operador
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                      {faturamentoCruzamentoCount.toLocaleString('pt-BR')}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer hover:text-slate-900">
                            <span className="truncate">
                              {formatCompactCurrency(valorFaturamentoCruzamento)}
                            </span>
                            <span className="text-slate-500 font-normal shrink-0">
                              ({toneladasFaturamentoCruzamento.toLocaleString('pt-BR')} ton)
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg">
                          <p className="font-bold text-amber-300">
                            Faturamento Recente via Cruzamento:
                          </p>
                          <p className="font-mono text-amber-400 font-bold text-sm mt-0.5">
                            {formatFullCurrency(valorFaturamentoCruzamento)}
                          </p>
                          <p className="text-slate-200 text-[11px] mt-0.5">
                            Volume: {toneladasFaturamentoCruzamento.toLocaleString('pt-BR')}{' '}
                            toneladas
                          </p>
                          <p className="text-blue-200 text-[10px] mt-1 border-t border-blue-900/60 pt-1">
                            Insumo do ERP para exclusão/limpeza de base
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Rodapé Alinhado com Link de Ação CTA em Laranja */}
                <div className="px-4 py-2.5 bg-amber-50/40 border-t border-amber-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 truncate">Insumo para esteira</span>
                  <Link
                    to="/relatorios"
                    className="font-bold text-[#F18800] hover:text-[#d97706] hover:underline inline-flex items-center gap-0.5 shrink-0 transition-colors"
                  >
                    Limpar &rarr;
                  </Link>
                </div>
              </Card>

              {/* CARD 7: ATIVOS FORA DA BASE (Base / Limpeza) */}
              <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 min-h-[42px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                          Ativos Fora da Base
                        </span>
                        <Badge className="bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-100 text-[10px] font-semibold px-1.5 py-0 rounded shrink-0">
                          Limpeza
                        </Badge>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-[#253575] shrink-0 p-0.5 focus:outline-hidden"
                                aria-label="Informações sobre Ativos Fora da Base"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="bg-[#142758] text-white border-blue-900 text-xs p-2.5 max-w-xs shadow-xl rounded-lg"
                            >
                              <p className="font-bold text-blue-200 mb-1">Auditoria de Limpeza:</p>
                              <p className="text-slate-200 text-[11px] leading-relaxed">
                                Cadastros inativos removidos da esteira porque já compram por outro
                                CPF/CNPJ ou são acompanhados ativamente pelo vendedor de rota.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        Clientes ativos removidos da esteira
                      </span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Valor Principal Protagonista */}
                  <div className="mt-4">
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                      {loadingAtendimentos
                        ? '—'
                        : ativosRemovidosData.total.toLocaleString('pt-BR')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      {selectedPeriodo === 'hoje'
                        ? 'Removidos hoje'
                        : selectedPeriodo === '7dias'
                          ? 'Últimos 7 dias'
                          : selectedPeriodo === '30dias'
                            ? 'Últimos 30 dias'
                            : 'Acumulado total'}
                      {selectedRegion !== 'todas' ? ` • ${selectedRegion}` : ' • Todas rotas'}
                    </p>
                  </div>
                </div>

                {/* Rodapé Alinhado com Link de Ação CTA em Laranja */}
                <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 truncate">Auditoria de esteira</span>
                  <Link
                    to="/relatorios"
                    className="font-bold text-[#F18800] hover:text-[#d97706] hover:underline inline-flex items-center gap-0.5 shrink-0 transition-colors"
                  >
                    Ver no Relatório &rarr;
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          {/* SEÇÃO VISUAL: MÉTRICAS DA FICHA DE ATENDIMENTO */}
          <MetricasFichaAtendimentoSection
            selectedPeriodo={selectedPeriodo}
            selectedRegion={selectedRegion}
            selectedSegmento={selectedSegmento}
            selectedCategoria={selectedCategoria}
          />

          {/* BLOCO DE AUDITORIA: CLIENTES ATIVOS REMOVIDOS DA BASE COM BREAKDOWN POR MOTIVO */}
          <div className="space-y-3">
            <Card className="border-emerald-200/80 bg-white shadow-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-emerald-50/60 via-teal-50/30 to-white pb-3 border-b border-emerald-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <CardTitle className="text-sm font-bold text-slate-900">
                          Clientes Ativos Removidos da Base — Auditoria de Limpeza
                        </CardTitle>
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-xs">
                          {loadingAtendimentos ? '—' : ativosRemovidosData.total} registros
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-slate-500">
                        Cadastros que constavam na base de inativos mas continuam faturando
                        (CPF/CNPJ terceiro ou acompanhamento periódico do vendedor).
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-white text-slate-600 border-slate-300 text-[10px] font-mono"
                    >
                      {selectedPeriodo === 'hoje'
                        ? 'Filtro: Hoje'
                        : selectedPeriodo === '7dias'
                          ? 'Filtro: 7 Dias'
                          : selectedPeriodo === '30dias'
                            ? 'Filtro: 30 Dias'
                            : 'Filtro: Total'}
                    </Badge>
                    {selectedRegion !== 'todas' && (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                      >
                        {selectedRegion}
                      </Badge>
                    )}
                    <Link to="/relatorios">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                      >
                        Ver Tabela Completa em Relatórios
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Grid com o Breakdown por Motivo */}
                <div>
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2.5">
                    Breakdown por Motivo de Exclusão da Fila
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {Object.entries(ativosRemovidosData.breakdown).map(([motivo, count]) => {
                      const perc =
                        ativosRemovidosData.total > 0
                          ? Math.round((count / ativosRemovidosData.total) * 100)
                          : 0
                      return (
                        <div
                          key={motivo}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-emerald-50/40 transition-colors space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-800 leading-tight">
                              {motivo}
                            </span>
                            <Badge
                              variant="outline"
                              className="bg-white border-emerald-300 text-emerald-800 font-mono font-bold text-xs shrink-0"
                            >
                              {count}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Frequência:</span>
                            <span className="font-mono font-semibold text-slate-700">{perc}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${Math.max(perc, count > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Amostra rápida dos últimos clientes ativos removidos no filtro */}
                {ativosRemovidosData.itens.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        Últimas Remoções no Período (mostrando até 5 de {ativosRemovidosData.total}
                        ):
                      </span>
                      <Link
                        to="/relatorios"
                        className="text-emerald-700 hover:text-emerald-900 font-semibold text-[11px]"
                      >
                        Abrir auditoria detalhada &rarr;
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {ativosRemovidosData.itens.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs space-y-1 hover:border-emerald-300 transition-colors shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-blue-700">{item.codigo}</span>
                            <Badge
                              variant="outline"
                              className="text-[9px] bg-emerald-50 text-emerald-800 border-emerald-200"
                            >
                              {item.regiao}
                            </Badge>
                          </div>
                          <p className="font-semibold text-slate-800 truncate" title={item.nome}>
                            {item.nome}
                          </p>
                          <p
                            className="text-[11px] text-emerald-800 font-medium truncate"
                            title={item.motivo_completo}
                          >
                            {item.motivo_categoria}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                            <span className="truncate max-w-[120px]">
                              Por: {item.operador_nome}
                            </span>
                            <span className="font-mono">
                              {new Date(item.data_remocao).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Grid Charts & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Máquina de Estados / Funil */}
            <Card className="lg:col-span-2 border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span>Distribuição por Estágio do Funil de Reativação</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Visualização da esteira operacional de contatos e desfechos registrados
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    {
                      label: 'Na Base (Disponível)',
                      count: estadosContagem.na_base,
                      color: 'bg-blue-500',
                      barBg: 'bg-blue-100',
                    },
                    {
                      label: 'Em Atendimento / Reservado',
                      count: estadosContagem.em_atendimento,
                      color: 'bg-purple-500',
                      barBg: 'bg-purple-100',
                    },
                    {
                      label: 'Reagendados',
                      count: estadosContagem.reagendado,
                      color: 'bg-amber-500',
                      barBg: 'bg-amber-100',
                    },
                    {
                      label: 'Contatados (Follow-up)',
                      count: estadosContagem.contatado,
                      color: 'bg-cyan-500',
                      barBg: 'bg-cyan-100',
                    },
                    {
                      label: 'Reativações Reais (Equipe)',
                      count: estadosContagem.reativado,
                      color: 'bg-emerald-500',
                      barBg: 'bg-emerald-100',
                    },
                    {
                      label: 'Faturamento Recente (Cruzamento)',
                      count:
                        estadosContagem.reativado_cruzamento !== undefined
                          ? estadosContagem.reativado_cruzamento
                          : faturamentoCruzamentoCount,
                      color: 'bg-amber-500',
                      barBg: 'bg-amber-100',
                    },
                    {
                      label: 'Comprando Terceiros',
                      count: estadosContagem.compra_terceiros,
                      color: 'bg-rose-500',
                      barBg: 'bg-rose-100',
                    },
                    {
                      label: 'Não Quer Negociar (Quarentena)',
                      count: estadosContagem.nao_quer_negociar,
                      color: 'bg-slate-400',
                      barBg: 'bg-slate-200',
                    },
                    {
                      label: 'Restrição Financeira',
                      count: estadosContagem.restricao_financeira || 0,
                      color: 'bg-amber-600',
                      barBg: 'bg-amber-100',
                    },
                    {
                      label: 'Sem Contato (Esgotado)',
                      count: estadosContagem.sem_contato,
                      color: 'bg-orange-500',
                      barBg: 'bg-orange-100',
                    },
                  ].map((item) => {
                    const pct = totalBase > 0 ? Math.round((item.count / totalBase) * 100) : 0
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{item.label}</span>
                          <span className="text-slate-500 font-mono">
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className={`h-2.5 w-full rounded-full ${item.barBg} overflow-hidden`}>
                          <div
                            className={`h-full ${item.color} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(pct, item.count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Distribuição Regional */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                  <Building2 className="h-4 w-4 text-slate-600" />
                  <span>Desempenho por Região</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Volume e score médio da carteira
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.keys(regioesMap).length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Nenhuma região encontrada
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(regioesMap).map(([reg, data]) => {
                      const avgScore = data.total > 0 ? Math.round(data.scoreSum / data.total) : 0
                      return (
                        <div
                          key={reg}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-xs text-slate-800">{reg}</div>
                            <div className="text-[11px] text-slate-500">{data.total} clientes</div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                avgScore >= 75
                                  ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                                  : avgScore >= 60
                                    ? 'border-amber-500 text-amber-700 bg-amber-50'
                                    : 'border-slate-300 text-slate-700'
                              }`}
                            >
                              Score Médio: {avgScore}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Histórico Recente de Importações */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <span>Últimas Cargas de Planilhas e Reconciliações</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Registro das planilhas importadas para atualização de saldos
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {importacoes.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  Nenhuma planilha real subida ainda. A base iniciou com a amostra de teste e
                  aguarda a importação do usuário.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Arquivo</th>
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Total Linhas</th>
                        <th className="py-2.5 px-3">Novos / Atualizados</th>
                        <th className="py-2.5 px-3">Reconciliados</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importacoes.slice(0, 5).map((imp) => (
                        <tr key={imp.id} className="hover:bg-slate-50/80">
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {imp.nome_arquivo}
                          </td>
                          <td className="py-2 px-3 text-slate-500 font-mono">
                            {new Date(imp.created).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{imp.linhas_total}</td>
                          <td className="py-2 px-3 text-slate-600">
                            <span className="text-emerald-600 font-semibold">
                              {imp.linhas_importadas}
                            </span>{' '}
                            / <span className="text-blue-600">{imp.linhas_atualizadas}</span>
                          </td>
                          <td className="py-2 px-3 text-emerald-600 font-medium">
                            {imp.reconciliados_faturaram || 0} faturaram
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant="outline"
                              className={
                                imp.status === 'concluida'
                                  ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                                  : 'border-red-500 text-red-700 bg-red-50'
                              }
                            >
                              {imp.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
