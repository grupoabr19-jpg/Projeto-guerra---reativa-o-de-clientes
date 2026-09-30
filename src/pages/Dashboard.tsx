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
  CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  fetchClientes,
  fetchImportacoes,
  fetchRegioes,
  fetchMetricasAtendimentosDashboard,
} from '@/services/api'
import type {
  Cliente,
  Importacao,
  Regiao,
  PeriodoAtendimentoFiltro,
  MetricasAtendimentosDashboard,
  MetricasAtendimentoOperador,
} from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'

import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ExpedienteStatusBadge } from '@/components/ExpedienteStatusBadge'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])
  const [loading, setLoading] = useState(true)
  const [loadingAtendimentos, setLoadingAtendimentos] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<string>('todas')
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoAtendimentoFiltro>('hoje')
  const [metricasAtendimento, setMetricasAtendimento] =
    useState<MetricasAtendimentosDashboard | null>(null)

  // Ordenação da tabela por operador
  const [sortField, setSortField] = useState<
    'conversoes' | 'atendimentos' | 'taxaConversao' | 'pontosGamificacao'
  >('conversoes')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Operador selecionado para destaque/modal rápido
  const [selectedOperadorDetalhe, setSelectedOperadorDetalhe] =
    useState<MetricasAtendimentoOperador | null>(null)

  useEffect(() => {
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate(user.role === 'lider' ? '/equipe' : '/meu-painel', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadData()
    }
  }, [user])

  // Recarregar métricas de atendimento quando filtros mudam
  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadMetricasAtendimento()
    }
  }, [user, selectedRegion, selectedPeriodo])

  if (user?.role === 'operador' || user?.role === 'lider') {
    return null
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [resClientes, resImp, resRegioes] = await Promise.all([
        fetchClientes({ perPage: 200 }),
        fetchImportacoes(),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setClientes(resClientes.items)
      setImportacoes(resImp)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err) {
      console.error('Erro ao carregar métricas:', err)
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

  // Filtragem
  const filteredClientes = clientes.filter((c) => {
    if (selectedRegion !== 'todas' && c.regiao !== selectedRegion) return false
    return true
  })

  // KPIs
  const totalBase = filteredClientes.length
  const naFila = filteredClientes.filter(
    (c) => c.estado === 'na_base' || c.estado === 'reservado',
  ).length
  const reativados = filteredClientes.filter((c) => c.estado === 'reativado').length
  const taxaReativacao = totalBase > 0 ? Math.round((reativados / totalBase) * 100) : 0

  const valorRecuperado = filteredClientes
    .filter((c) => c.estado === 'reativado')
    .reduce((acc, c) => acc + (c.valor_ultima_compra || 0), 0)

  const toneladasRecuperadas = filteredClientes
    .filter((c) => c.estado === 'reativado')
    .reduce((acc, c) => acc + (c.toneladas_historico || 0), 0)

  // Distribuição por estado
  const estadosContagem = {
    na_base: filteredClientes.filter((c) => c.estado === 'na_base').length,
    em_atendimento: filteredClientes.filter(
      (c) => c.estado === 'em_atendimento' || c.estado === 'reservado',
    ).length,
    reagendado: filteredClientes.filter((c) => c.estado === 'reagendado').length,
    contatado: filteredClientes.filter((c) => c.estado === 'contatado').length,
    reativado: reativados,
    compra_terceiros: filteredClientes.filter((c) => c.estado === 'compra_terceiros').length,
    nao_quer_negociar: filteredClientes.filter((c) => c.estado === 'nao_quer_negociar').length,
    sem_contato: filteredClientes.filter((c) => c.estado === 'sem_contato').length,
  }

  // Agrupamento por região
  const regioesMap: Record<string, { total: number; scoreSum: number }> = {}
  filteredClientes.forEach((c) => {
    const r = c.regiao || 'Sem Região'
    if (!regioesMap[r]) regioesMap[r] = { total: 0, scoreSum: 0 }
    regioesMap[r].total += 1
    regioesMap[r].scoreSum += c.score || 0
  })

  const ativosRemovidosData = metricasAtendimento?.ativosRemovidos || {
    total: 0,
    breakdown: {},
    itens: [],
  }

  return (
    <div className="space-y-6">
      {/* Top Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Painel Executivo de Reativação
            </h2>
            <ExpedienteStatusBadge showHorarioAtual />
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
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setSelectedPeriodo('7dias')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                selectedPeriodo === '7dias'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setSelectedPeriodo('30dias')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                selectedPeriodo === '30dias'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              30 Dias
            </button>
            <button
              onClick={() => setSelectedPeriodo('total')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                selectedPeriodo === 'total'
                  ? 'bg-blue-600 text-white shadow-xs'
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadData()
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
            <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Headphones className="h-4 w-4" />
            </div>
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
          <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Total Atendimentos
                </span>
                <div className="p-1 rounded-md bg-blue-50 text-blue-600 shrink-0">
                  <Activity className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.totalAtendimentos || 0}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                desfecho ou andamento
              </span>
            </CardContent>
          </Card>

          {/* Ligações / Contatos Feitos */}
          <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Ligações Feitas
                </span>
                <div className="p-1 rounded-md bg-blue-50 text-blue-600 shrink-0">
                  <PhoneCall className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black text-blue-700 font-mono">
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
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Conversões
                </span>
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
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Taxa Conversão
                </span>
                <div className="p-1 rounded-md bg-purple-50 text-purple-600 shrink-0">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black text-purple-700 font-mono">
                {loadingAtendimentos ? '—' : `${metricasAtendimento?.gerais.taxaConversao || 0}%`}
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
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Reagendamentos
                </span>
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
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Follow-ups Hoje
                </span>
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
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Vendas Perdidas
                </span>
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

            <div className="flex items-center space-x-2 text-xs">
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
                className={`h-7 px-2.5 text-xs ${sortField === 'atendimentos' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'text-slate-600'}`}
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
              // Ordenar lista de operadores
              const sortedOperadores = [...metricasAtendimento.operadores].sort((a, b) => {
                const valA = a[sortField]
                const valB = b[sortField]
                if (sortAsc) {
                  return valA > valB ? 1 : valA < valB ? -1 : 0
                } else {
                  return valA < valB ? 1 : valA > valB ? -1 : 0
                }
              })

              // Somatórios para o totalizador
              const totalAtendimentos = sortedOperadores.reduce((acc, o) => acc + o.atendimentos, 0)
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
              const totalPontos = sortedOperadores.reduce((acc, o) => acc + o.pontosGamificacao, 0)
              const taxaMedia =
                totalLigacoes > 0 ? Math.round((totalConversoes / totalLigacoes) * 100) : 0

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
                                ? 'bg-blue-50/70 border-l-4 border-l-blue-600 font-medium'
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
                                      <span className="text-xs" title={op.tituloGamificacao.nome}>
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
                            <td className="py-2.5 px-3 text-center font-mono text-blue-700">
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
                          Total Geral ({sortedOperadores.length} operadores)
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          Todas as rotas filtradas
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
        <Card className="border-blue-200 bg-blue-50/40 shadow-xs animate-in fade-in duration-200">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Badge className="bg-blue-600 text-white text-[10px]">Operador Selecionado</Badge>
                <h4 className="font-bold text-sm text-slate-900">
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
                <span className="text-[10px] text-slate-400 block uppercase">Taxa Conversão</span>
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
      <div className="pt-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
          Métricas de Carteira e Recuperação da Base
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Inativos Base
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Users className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{totalBase}</div>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                Aguardando contato ou reconciliação
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Na Fila de Trabalho
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 tabular-nums">{naFila}</div>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                Clientes disponíveis para novo contato
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Clientes Reativados
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <UserCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 tabular-nums">{reativados}</div>
              <p className="text-[11px] text-emerald-600 mt-1 flex items-center font-medium">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                R$ {valorRecuperado.toLocaleString('pt-BR')} ({toneladasRecuperadas} ton)
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Taxa de Recuperação
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Percent className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600 tabular-nums">
                {taxaReativacao}%
              </div>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                Meta da operação: &ge; 18%
              </p>
            </CardContent>
          </Card>

          {/* NOVO CARD: Clientes Ativos Removidos da Base */}
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 shadow-sm hover:border-emerald-400 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div>
                <CardTitle className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Ativos Fora da Base</span>
                  <Badge className="bg-emerald-600 text-white text-[9px] px-1 py-0">Limpeza</Badge>
                </CardTitle>
                <span className="text-[10px] text-emerald-700 block">
                  Clientes ativos removidos da esteira
                </span>
              </div>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 shadow-2xs">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-emerald-700 tabular-nums font-mono">
                  {loadingAtendimentos ? '—' : ativosRemovidosData.total}
                </div>
                <Link
                  to="/relatorios"
                  className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 hover:underline flex items-center"
                >
                  Ver no Relatório &rarr;
                </Link>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {selectedPeriodo === 'hoje'
                  ? 'Removidos hoje'
                  : selectedPeriodo === '7dias'
                    ? 'Últimos 7 dias'
                    : selectedPeriodo === '30dias'
                      ? 'Últimos 30 dias'
                      : 'Acumulado total'}
                {selectedRegion !== 'todas' ? ` • ${selectedRegion}` : ' • Todas rotas'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

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
                    Cadastros que constavam na base de inativos mas continuam faturando (CPF/CNPJ
                    terceiro ou acompanhamento periódico do vendedor).
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
                    Últimas Remoções no Período (mostrando até 5 de {ativosRemovidosData.total}):
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
                        <span className="truncate max-w-[120px]">Por: {item.operador_nome}</span>
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
                  label: 'Reativados (Sucesso)',
                  count: estadosContagem.reativado,
                  color: 'bg-emerald-500',
                  barBg: 'bg-emerald-100',
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
              <p className="text-xs text-slate-400 py-6 text-center">Nenhuma região encontrada</p>
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
              Nenhuma planilha real subida ainda. A base iniciou com a amostra de teste e aguarda a
              importação do usuário.
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
                      <td className="py-2 px-3 font-medium text-slate-800">{imp.nome_arquivo}</td>
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
    </div>
  )
}
