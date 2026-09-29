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
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { fetchInteracoesByOperador, fetchClientesReagendadosOperador } from '@/services/api'
import type { Interacao, Cliente } from '@/types'

export function MeuPainelPage() {
  const { user } = useAuth()
  const [periodo, setPeriodo] = useState<'hoje' | '7dias' | '30dias'>('hoje')
  const [loading, setLoading] = useState(true)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [reagendados, setReagendados] = useState<Cliente[]>([])

  useEffect(() => {
    if (user?.id) {
      loadData()
    }
  }, [user?.id])

  const loadData = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [listaInteracoes, listaReag] = await Promise.all([
        fetchInteracoesByOperador(user.id),
        fetchClientesReagendadosOperador(user.id),
      ])
      setInteracoes(listaInteracoes)
      setReagendados(listaReag)
    } catch (err) {
      console.error('Erro ao carregar dados do operador:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar interações por período
  const now = new Date()
  const hojeStr = now.toISOString().slice(0, 10)

  const interacoesFiltradas = interacoes.filter((it) => {
    if (!it.created) return false
    const d = new Date(it.created)
    if (periodo === 'hoje') {
      return it.created.slice(0, 10) === hojeStr
    }
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (periodo === '7dias') return diffDays <= 7
    if (periodo === '30dias') return diffDays <= 30
    return true
  })

  // Métricas do operador
  const totalLigacoes = interacoesFiltradas.filter(
    (i) => i.tipo === 'ligacao' || i.tipo === 'formulario' || i.desfecho,
  ).length

  const conversoes = interacoesFiltradas.filter(
    (i) =>
      i.desfecho === 'reativado_com_pedido' ||
      i.desfecho === 'reativado' ||
      i.desfecho === 'fechou_pedido' ||
      i.numero_pedido,
  ).length

  const clientesReagendadosNoPeriodo = interacoesFiltradas.filter(
    (i) => i.desfecho === 'reagendado' || Boolean(i.reagendado_para),
  ).length

  const taxaConversao = totalLigacoes > 0 ? Math.round((conversoes / totalLigacoes) * 100) : 0

  // Follow-ups do dia (reagendados para HOJE)
  const followUpsHoje = reagendados.filter((c) => {
    if (!c.reagendado_para) return false
    return c.reagendado_para.slice(0, 10) === hojeStr
  })

  // Forecast de reagendados (próximos 7 dias)
  const proximos7Dias = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const forecastReagendados = reagendados.filter((c) => {
    if (!c.reagendado_para) return false
    const d = new Date(c.reagendado_para)
    return d > now && d <= proximos7Dias
  })

  // Sequência / Streak (atendimentos nos últimos dias)
  const diasComAtendimento = new Set(interacoes.map((i) => i.created.slice(0, 10)))
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const ds = d.toISOString().slice(0, 10)
    if (diasComAtendimento.has(ds)) {
      streak++
    } else if (i > 0) {
      break
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner de Boas-vindas e Filtros de Período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Meu Painel de Ação</h1>
            <Badge className="bg-blue-600 text-white text-[10px] font-mono">Operador</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Olá, <strong className="text-slate-700">{user?.name || user?.email}</strong>. Acompanhe
            seus resultados diários, conversões e agenda de follow-ups.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Seletor de período */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setPeriodo('hoje')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                periodo === 'hoje'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriodo('7dias')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                periodo === '7dias'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriodo('30dias')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                periodo === '30dias'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Dias
            </button>
          </div>

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
              className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <PhoneCall className="h-3.5 w-3.5 mr-1.5" />
              Ir para Atendimento
            </Button>
          </Link>
        </div>
      </div>

      {/* Grid de Métricas Principais do Operador */}
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
            <span className="text-[11px] text-slate-400 mt-1 block">
              {periodo === 'hoje'
                ? 'realizadas hoje'
                : `nos últimos ${periodo === '7dias' ? '7' : '30'} dias`}
            </span>
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
                        className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white shrink-0"
                      >
                        <PhoneCall className="h-3 w-3 mr-1" />
                        Ligar Agora
                      </Button>
                    </Link>
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
                          {c.reagendado_para?.slice(11, 16) || 'Horário livre'}
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
                        {new Date(it.created).toLocaleString('pt-BR')}
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
    </div>
  )
}
export default MeuPainelPage
