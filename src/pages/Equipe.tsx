import React, { useState, useEffect } from 'react'
import {
  Users,
  Activity,
  PhoneCall,
  CheckCircle2,
  PhoneForwarded,
  Calendar,
  XCircle,
  TrendingUp,
  RefreshCw,
  Trophy,
  ArrowUpDown,
  Mail,
  Shield,
  Flag,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { calcularTaxaConversao } from '@/lib/conversao'
import { fetchMetricasAtendimentosDashboard } from '@/services/api'
import type {
  MetricasAtendimentosDashboard,
  MetricasAtendimentoOperador,
  PeriodoAtendimentoFiltro,
} from '@/types'

export default function EquipePage() {
  const { user } = useAuth()
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoAtendimentoFiltro>('hoje')
  const [metricas, setMetricas] = useState<MetricasAtendimentosDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOperadorDetalhe, setSelectedOperadorDetalhe] =
    useState<MetricasAtendimentoOperador | null>(null)

  // Ordenação da tabela por operador
  const [sortField, setSortField] = useState<keyof MetricasAtendimentoOperador>('conversoes')
  const [sortAsc, setSortAsc] = useState<boolean>(false)

  // Determinar a rota oficial do líder (ou primeira atribuída)
  const rotaLider = user?.regioes && user.regioes.length > 0 ? user.regioes[0] : 'Minha Rota'

  const carregarMetricasRota = async () => {
    setLoading(true)
    try {
      // O líder só visualiza a PRÓPRIA rota
      const dados = await fetchMetricasAtendimentosDashboard({
        periodo: selectedPeriodo,
        regiao: rotaLider !== 'Minha Rota' ? rotaLider : undefined,
      })
      setMetricas(dados)
    } catch (err) {
      console.error('Erro ao carregar métricas da equipe da rota:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarMetricasRota()
    // Polling a cada 60s para acompanhar o time em tempo real
    const interval = setInterval(carregarMetricasRota, 60000)
    return () => clearInterval(interval)
  }, [selectedPeriodo, rotaLider])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header com Identificação da Rota do Líder */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Badge className="bg-amber-600 text-white text-xs font-semibold px-2 py-0.5">
              <Flag className="h-3 w-3 mr-1" />
              Líder de Rota
            </Badge>
            <Badge variant="outline" className="text-xs border-slate-300 text-slate-700 font-mono">
              Rota: {rotaLider}
            </Badge>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Gestão da Equipe — Rota {rotaLider}
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl">
            Acompanhamento em tempo real das métricas operacionais, atendimentos e conversões dos
            vendedores e operadores da sua região.
          </p>
        </div>

        {/* Filtro de Período e Atualizar */}
        <div className="flex items-center space-x-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Período de Análise
            </span>
            <Select
              value={selectedPeriodo}
              onValueChange={(val: PeriodoAtendimentoFiltro) => setSelectedPeriodo(val)}
            >
              <SelectTrigger className="h-8 text-xs w-40 bg-white border-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje" className="text-xs">
                  📅 Hoje
                </SelectItem>
                <SelectItem value="7dias" className="text-xs">
                  📊 Últimos 7 dias
                </SelectItem>
                <SelectItem value="30dias" className="text-xs">
                  📈 Últimos 30 dias
                </SelectItem>
                <SelectItem value="total" className="text-xs">
                  ⭐ Histórico Total
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarMetricasRota}
            disabled={loading}
            className="h-8 text-xs text-slate-600 mt-3.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* SEÇÃO 1: MÉTRICAS GERAIS CONSOLIDADAS DA ROTA */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center space-x-2">
            <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Métricas Consolidadas da Rota ({rotaLider})
              </h3>
              <p className="text-[11px] text-slate-500">
                Total agregado de todos os colaboradores vinculados a esta rota.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Follow-ups pendentes:{' '}
            <strong className="text-amber-700 font-mono">
              {metricas?.gerais.followUpsPendentes || 0}
            </strong>
          </div>
        </div>

        {/* 7 KPIs da Rota */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Total Atendimentos */}
          <Card className="border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Atendimentos
                </span>
                <div className="p-1 rounded-md bg-blue-50 text-blue-600 shrink-0">
                  <Activity className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {loading ? '—' : metricas?.gerais.totalAtendimentos || 0}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                contatos na rota
              </span>
            </CardContent>
          </Card>

          {/* Ligações Feitas */}
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
                {loading ? '—' : metricas?.gerais.ligacoesFeitas || 0}
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
                {loading ? '—' : metricas?.gerais.conversoes || 0}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block truncate">
                reativados com pedido
              </span>
            </CardContent>
          </Card>

          {/* Taxa de Conversão */}
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
                {loading ? '—' : `${metricas?.gerais.taxaConversao || 0}%`}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                conversões / ligações
              </span>
            </CardContent>
          </Card>

          {/* Reagendamentos */}
          <Card className="border-slate-200 shadow-xs hover:border-amber-300 transition-colors">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                  Reagendados
                </span>
                <div className="p-1 rounded-md bg-amber-50 text-amber-600 shrink-0">
                  <PhoneForwarded className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 font-mono">
                {loading ? '—' : metricas?.gerais.reagendamentos || 0}
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
                {loading ? '—' : metricas?.gerais.followUpsHoje || 0}
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
                {loading ? '—' : metricas?.gerais.vendasPerdidas || 0}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                recusas / terceiros
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SEÇÃO 2: DETALHAMENTO POR COLABORADOR DA ROTA (TABELA COM TOTALIZADOR) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Desempenho por Colaborador da Rota
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Uma linha por vendedor/operador da região {rotaLider} (visão restrita e
                  somente-leitura)
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
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
              Carregando métricas dos colaboradores da rota...
            </div>
          ) : !metricas || metricas.operadores.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Nenhum colaborador com atendimentos encontrado na região {rotaLider}.
            </div>
          ) : (
            (() => {
              const sorted = [...metricas.operadores].sort((a, b) => {
                const valA = a[sortField]
                const valB = b[sortField]
                if (sortAsc) {
                  return valA > valB ? 1 : valA < valB ? -1 : 0
                }
                return valA < valB ? 1 : valA > valB ? -1 : 0
              })

              const totalAtendimentos = sorted.reduce((acc, o) => acc + o.atendimentos, 0)
              const totalLigacoes = sorted.reduce((acc, o) => acc + o.ligacoes, 0)
              const totalConversoes = sorted.reduce((acc, o) => acc + o.conversoes, 0)
              const totalReagendamentos = sorted.reduce((acc, o) => acc + o.reagendamentos, 0)
              const totalFollowUps = sorted.reduce((acc, o) => acc + o.followUpsHoje, 0)
              const totalVendasPerdidas = sorted.reduce((acc, o) => acc + o.vendasPerdidas, 0)
              const totalPontos = sorted.reduce((acc, o) => acc + o.pontosGamificacao, 0)
              const taxaMedia = calcularTaxaConversao(totalConversoes, totalLigacoes)

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Colaborador / Função</th>
                        <th className="py-3 px-4 font-semibold">Região</th>
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
                        <th className="py-3 px-3 text-center font-semibold text-slate-600">
                          Vendas Perdidas
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
                      {sorted.map((op, idx) => {
                        const isTop = idx === 0 && op.conversoes > 0
                        const isSelected = selectedOperadorDetalhe?.operadorId === op.operadorId
                        const isMe = op.operadorId === user?.id

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
                            <td className="py-2.5 px-4">
                              <div className="flex items-center space-x-2">
                                {isTop ? (
                                  <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                    {op.operadorNome
                                      ? op.operadorNome.slice(0, 2).toUpperCase()
                                      : 'OP'}
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                    <span>{op.operadorNome}</span>
                                    {isMe && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200"
                                      >
                                        Você (Líder)
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {op.role === 'lider'
                                      ? 'Líder de Rota'
                                      : op.role === 'supervisor'
                                        ? 'Supervisor'
                                        : 'Vendedor / Operador'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                              {op.regiao}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-800">
                              {op.atendimentos}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-medium text-blue-700">
                              {op.ligacoes}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">
                              {op.conversoes}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-medium text-amber-600">
                              {op.reagendamentos}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-medium text-rose-600">
                              {op.followUpsHoje}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                              {op.vendasPerdidas}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-purple-700">
                              {op.taxaConversao}%
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {op.tituloGamificacao && (
                                  <span
                                    title={op.tituloGamificacao.nome}
                                    className="text-sm cursor-help"
                                  >
                                    {op.tituloGamificacao.emoji}
                                  </span>
                                )}
                                <span className="font-bold text-amber-600 font-mono">
                                  {op.pontosGamificacao}
                                </span>
                                <span className="text-[10px] text-slate-400">pts</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                      <tr>
                        <td className="py-3 px-4">TOTAL DA ROTA ({sorted.length} colaboradores)</td>
                        <td className="py-3 px-4 text-[11px] text-slate-500 font-mono">
                          {rotaLider}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">{totalAtendimentos}</td>
                        <td className="py-3 px-3 text-center font-mono text-blue-800">
                          {totalLigacoes}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-emerald-700">
                          {totalConversoes}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-amber-700">
                          {totalReagendamentos}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-rose-700">
                          {totalFollowUps}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-700">
                          {totalVendasPerdidas}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-purple-800">
                          {taxaMedia}%
                        </td>
                        <td className="py-3 px-4 text-right text-amber-700 font-mono">
                          {totalPontos} pts
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

      {/* MODAL DETALHE DO COLABORADOR SE CLICADO */}
      {selectedOperadorDetalhe && (
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm animate-in fade-in duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-slate-800">
                  Ficha do Colaborador: {selectedOperadorDetalhe.operadorNome}
                </CardTitle>
                <Badge variant="outline" className="text-xs bg-white text-slate-700">
                  {selectedOperadorDetalhe.regiao}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedOperadorDetalhe(null)}
                className="h-7 text-xs text-slate-500 hover:text-slate-800"
              >
                Fechar Ficha
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-3 rounded-lg border border-blue-100">
                <span className="text-slate-500 block text-[11px]">E-mail Corporativo</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {selectedOperadorDetalhe.operadorEmail || 'Não informado'}
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-100">
                <span className="text-slate-500 block text-[11px]">Conversões / Fechamentos</span>
                <span className="font-bold text-emerald-600 text-base font-mono">
                  {selectedOperadorDetalhe.conversoes}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {selectedOperadorDetalhe.taxaConversao}% de conversão
                </span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-100">
                <span className="text-slate-500 block text-[11px]">Follow-ups do Dia</span>
                <span className="font-bold text-rose-600 text-base font-mono">
                  {selectedOperadorDetalhe.followUpsHoje}
                </span>
                <span className="text-[10px] text-slate-400 block">reagendamentos para hoje</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-blue-100">
                <span className="text-slate-500 block text-[11px]">Gamificação & Título</span>
                <span className="font-bold text-amber-600 text-base font-mono flex items-center gap-1">
                  {selectedOperadorDetalhe.tituloGamificacao?.emoji}{' '}
                  {selectedOperadorDetalhe.pontosGamificacao} pts
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {selectedOperadorDetalhe.tituloGamificacao?.nome || 'Iniciante'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
