import React, { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  Calendar,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  PhoneCall,
  PhoneForwarded,
  CalendarCheck,
  XCircle,
  Eye,
  EyeOff,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchReportsDailyEvolution } from '@/services/api'
import type { DailyEvolutionItem, ReportsDailyEvolutionResponse } from '@/types'

interface DailyEvolutionChartProps {
  selectedRegiao?: string
  selectedOperador?: string
}

interface SerieToggle {
  id: 'reativacoes' | 'contatos' | 'reagendamentos' | 'followUpsAgendados' | 'vendasPerdidas'
  label: string
  color: string
  strokeDasharray?: string
  visible: boolean
  descricao: string
}

const SERIES_CONFIG_PADRAO: SerieToggle[] = [
  {
    id: 'reativacoes',
    label: 'Reativações (Vendas)',
    color: '#10B981', // Verde esmeralda vivo para vitória / conversão
    visible: true,
    descricao: 'Atendimentos finalizados com desfecho Fechado / Pedido gerado',
  },
  {
    id: 'contatos',
    label: 'Contatos Efetivados',
    color: '#253575', // Azul dominante Grupo ABR
    visible: true,
    descricao: 'Atendimentos em que houve contato real com o cliente',
  },
  {
    id: 'reagendamentos',
    label: 'Reagendamentos',
    color: '#F18800', // Laranja ABR para alerta/ação futura
    visible: true,
    descricao: 'Contatos remarcados pelo cliente para data futura',
  },
  {
    id: 'followUpsAgendados',
    label: 'Follow-ups Agendados',
    color: '#8B5CF6', // Roxo vibrante para compromissos na agenda
    strokeDasharray: '4 4',
    visible: true,
    descricao: 'Compromissos agendados para serem retomados nesta data',
  },
  {
    id: 'vendasPerdidas',
    label: 'Vendas Perdidas',
    color: '#EF4444', // Vermelho para contraste com as reativações
    strokeDasharray: '3 3',
    visible: true,
    descricao: 'Desfecho de perda (compra em terceiros, recusa, restrição ou sem contato)',
  },
]

export const DailyEvolutionSection: React.FC<DailyEvolutionChartProps> = ({
  selectedRegiao,
  selectedOperador,
}) => {
  // Seletor de período do gráfico
  const [periodo, setPeriodo] = useState<
    'este_mes' | '7dias' | '30dias' | '90dias' | 'mes_especifico'
  >('este_mes')
  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })

  // Estado das séries (visibilidade)
  const [series, setSeries] = useState<SerieToggle[]>(SERIES_CONFIG_PADRAO)

  // Dados do backend
  const [dados, setDados] = useState<ReportsDailyEvolutionResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [erro, setErro] = useState<string | null>(null)

  // Gerar opções dos últimos 6 meses para o select de mês específico
  const opcoesMeses = useMemo(() => {
    const list: { valor: string; label: string }[] = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const nomeMes = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const label = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)
      list.push({ valor, label })
    }
    return list
  }, [])

  // Carregar dados da evolução
  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetchReportsDailyEvolution({
        regiao: selectedRegiao,
        operador: selectedOperador,
        periodo: periodo === 'mes_especifico' ? undefined : periodo,
        mes: periodo === 'mes_especifico' ? mesSelecionado : undefined,
      })
      setDados(res)
    } catch (err: any) {
      console.error('Falha ao carregar evolução diária:', err)
      setErro(err?.message || 'Falha ao buscar dados da evolução diária.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegiao, selectedOperador, periodo, mesSelecionado])

  // Alternar visibilidade de uma série individual
  const toggleSerie = (id: string) => {
    setSeries((prev) => prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)))
  }

  // Ativar / Desativar todas
  const alternarTodas = (ativar: boolean) => {
    setSeries((prev) => prev.map((s) => ({ ...s, visible: ativar })))
  }

  // Formatação do intervalo de data exibido
  const labelPeriodo = useMemo(() => {
    if (!dados?.dataInicio || !dados?.dataFim) return ''
    const [yI, mI, dI] = dados.dataInicio.split('-')
    const [yF, mF, dF] = dados.dataFim.split('-')
    return `${dI}/${mI}/${yI} até ${dF}/${mF}/${yF}`
  }, [dados])

  // Tooltip customizado multi-série elegante com identidade do Grupo ABR
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null

    const itemData = payload[0]?.payload as DailyEvolutionItem | undefined
    if (!itemData) return null

    // Formatar data em extenso
    const [y, m, d] = itemData.dia.split('-')
    const dataObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
    const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    return (
      <div className="bg-slate-900/95 text-white border border-slate-700/80 rounded-xl p-3.5 shadow-xl backdrop-blur-md text-xs min-w-[220px] max-w-[280px]">
        <div className="border-b border-slate-800 pb-2 mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 capitalize">
            {dataFormatada}
          </div>
          <div className="text-sm font-extrabold text-white flex items-center justify-between">
            <span>Dia {itemData.label}</span>
            <span className="text-[10px] text-slate-400 font-normal">
              {itemData.totalInteracoes} atend. total
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {series.map((s) => {
            if (!s.visible) return null
            const val = itemData[s.id] ?? 0
            return (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5 truncate">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-slate-300 truncate text-[11px]">{s.label}:</span>
                </div>
                <span className="font-mono font-bold text-white shrink-0 text-xs">{val}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="py-4 px-4 sm:px-6 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Título e Subtítulo */}
          <div className="flex items-start space-x-3">
            <div className="h-10 w-10 rounded-xl bg-[#253575] text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Evolução do Mês — Reativações e Atividade Diária
                </CardTitle>
                <Badge
                  variant="outline"
                  className="bg-[#253575]/10 text-[#253575] border-[#253575]/20 text-[10px] font-mono uppercase"
                >
                  Série Temporal Multi-Linha
                </Badge>
                {labelPeriodo && (
                  <Badge
                    variant="outline"
                    className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-mono hidden sm:inline-flex"
                  >
                    {labelPeriodo}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhe dia a dia o progresso das reativações fechadas em contraste com contatos
                realizados, reagendamentos, follow-ups e vendas perdidas.
              </p>
            </div>
          </div>

          {/* Controles de Período e Recarregar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de Período Rápido */}
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setPeriodo('este_mes')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  periodo === 'este_mes'
                    ? 'bg-white text-[#253575] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => setPeriodo('7dias')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  periodo === '7dias'
                    ? 'bg-white text-[#253575] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodo('30dias')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  periodo === '30dias'
                    ? 'bg-white text-[#253575] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                30 Dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodo('90dias')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  periodo === '90dias'
                    ? 'bg-white text-[#253575] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                90 Dias
              </button>
            </div>

            {/* Select de Escolha de Mês Específico */}
            <div className="w-[150px]">
              <Select
                value={periodo === 'mes_especifico' ? mesSelecionado : 'outro'}
                onValueChange={(val) => {
                  if (val && val !== 'outro') {
                    setMesSelecionado(val)
                    setPeriodo('mes_especifico')
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400 shrink-0" />
                  <SelectValue placeholder="Escolher mês..." />
                </SelectTrigger>
                <SelectContent>
                  {opcoesMeses.map((m) => (
                    <SelectItem key={m.valor} value={m.valor} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Botão de Atualizar */}
            <Button
              variant="outline"
              size="sm"
              onClick={carregarDados}
              disabled={loading}
              className="h-8 w-8 p-0 text-slate-600 hover:text-[#253575]"
              title="Atualizar gráfico de evolução"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Resumo dos Totais do Período no Cabeçalho */}
        {dados?.totais && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-slate-100">
            {/* Reativações */}
            <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                <span>Reativações</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              </div>
              <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                {dados.totais.reativacoes}
              </div>
            </div>

            {/* Contatos Feitos */}
            <div className="bg-[#253575]/5 border border-[#253575]/15 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-[#253575] text-[10px] font-bold uppercase tracking-wider">
                <span>Contatos</span>
                <PhoneCall className="h-3 w-3 text-[#253575]" />
              </div>
              <div className="text-lg font-black text-[#253575] font-mono mt-0.5">
                {dados.totais.contatos}
              </div>
            </div>

            {/* Reagendamentos */}
            <div className="bg-amber-50/70 border border-amber-200/60 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                <span>Reagendados</span>
                <PhoneForwarded className="h-3 w-3 text-amber-600" />
              </div>
              <div className="text-lg font-black text-amber-700 font-mono mt-0.5">
                {dados.totais.reagendamentos}
              </div>
            </div>

            {/* Follow-ups Agendados */}
            <div className="bg-purple-50/70 border border-purple-200/60 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-purple-800 text-[10px] font-bold uppercase tracking-wider">
                <span>Follow-ups Marcados</span>
                <CalendarCheck className="h-3 w-3 text-purple-600" />
              </div>
              <div className="text-lg font-black text-purple-700 font-mono mt-0.5">
                {dados.totais.followUpsAgendados}
              </div>
            </div>

            {/* Vendas Perdidas */}
            <div className="bg-rose-50/70 border border-rose-200/60 rounded-lg px-3 py-2 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-rose-800 text-[10px] font-bold uppercase tracking-wider">
                <span>Vendas Perdidas</span>
                <XCircle className="h-3 w-3 text-rose-600" />
              </div>
              <div className="text-lg font-black text-rose-700 font-mono mt-0.5">
                {dados.totais.vendasPerdidas}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Barra de Controle de Séries Interativa (Legenda Clicável com On/Off) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700 text-[11px]">Séries visíveis:</span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              (clique para ligar/desligar)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {series.map((s) => {
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSerie(s.id)}
                  title={s.descricao}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    s.visible
                      ? 'bg-white border-slate-300 text-slate-800 shadow-xs hover:border-slate-400'
                      : 'bg-slate-100/70 border-dashed border-slate-300/80 text-slate-400 opacity-60 hover:opacity-90'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: s.visible ? s.color : '#94A3B8',
                    }}
                  />
                  <span>{s.label}</span>
                  {s.visible ? (
                    <Eye className="h-3 w-3 text-slate-400 ml-0.5" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-slate-400 ml-0.5" />
                  )}
                </button>
              )
            })}

            {/* Ações Rápidas Todas / Nenhuma */}
            <div className="flex items-center space-x-1 ml-1 pl-1 border-l border-slate-200">
              <button
                type="button"
                onClick={() => alternarTodas(true)}
                className="text-[10px] text-[#253575] hover:underline px-1 py-0.5 font-semibold"
                title="Ativar todas as linhas"
              >
                Todas
              </button>
              <span className="text-slate-300 text-xs">/</span>
              <button
                type="button"
                onClick={() => alternarTodas(false)}
                className="text-[10px] text-slate-500 hover:underline px-1 py-0.5"
                title="Desativar todas"
              >
                Nenhuma
              </button>
            </div>
          </div>
        </div>

        {/* Estado de Carregamento / Erro / Gráfico Principal */}
        {loading ? (
          <div className="h-[340px] flex flex-col items-center justify-center space-y-2 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-[#253575]" />
            <span className="text-xs">Processando série temporal com fuso de Brasília...</span>
          </div>
        ) : erro ? (
          <div className="h-[340px] flex flex-col items-center justify-center space-y-2 text-rose-600 bg-rose-50/50 rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold">{erro}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={carregarDados}
              className="text-xs text-rose-700 border-rose-300 hover:bg-rose-100"
            >
              Tentar Novamente
            </Button>
          </div>
        ) : !dados || dados.serie.length === 0 ? (
          <div className="h-[340px] flex flex-col items-center justify-center text-slate-400 text-xs">
            Nenhum dado de atividade registrado no período selecionado.
          </div>
        ) : (
          <div className="w-full h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados.serie} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                  dy={5}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Linhas Renderizadas com base no estado de visibilidade */}
                {series.map((s) => {
                  if (!s.visible) return null
                  return (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={s.id === 'reativacoes' ? 3 : 2}
                      strokeDasharray={s.strokeDasharray}
                      dot={{ r: s.id === 'reativacoes' ? 3.5 : 2.5, fill: s.color }}
                      activeDot={{
                        r: s.id === 'reativacoes' ? 6 : 5,
                        stroke: '#fff',
                        strokeWidth: 2,
                      }}
                      connectNulls
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Rodapé Informativo / Legenda de Convenções */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-500">Regras de cálculo:</span>
            <span>Fuso oficial de Brasília (BRT, UTC-3)</span>
            <span>•</span>
            <span>Contatos = atendimentos com diálogo efetivo</span>
          </div>
          <div className="text-slate-400">
            Dica: passe o cursor sobre qualquer ponto para visualizar todos os números do dia.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
export default DailyEvolutionSection
