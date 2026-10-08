import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  FileText,
  DollarSign,
  Scale,
  PieChart as PieChartIcon,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Building2,
  TrendingUp,
} from 'lucide-react'
import { fetchMetricasRespostasFormulario } from '@/services/api'
import type { MetricasRespostasFormularioResponse } from '@/types'

interface MetricasFichaAtendimentoSectionProps {
  selectedPeriodo: string
  selectedRegion: string
  selectedSegmento: string
  selectedCategoria?: string
}

const DESFECHOS_LABEL_MAP: Record<string, { label: string; cor: string; bg: string }> = {
  reativado: { label: 'Reativado com Sucesso', cor: 'text-emerald-700', bg: 'bg-emerald-500' },
  reagendado: { label: 'Reagendado / Follow-up', cor: 'text-blue-700', bg: 'bg-blue-500' },
  contatado: { label: 'Contatado (Em Andamento)', cor: 'text-indigo-700', bg: 'bg-indigo-500' },
  em_atendimento: { label: 'Em Atendimento', cor: 'text-sky-700', bg: 'bg-sky-500' },
  compra_terceiros: {
    label: 'Compra de Terceiros / Outro Fornecedor',
    cor: 'text-amber-700',
    bg: 'bg-amber-500',
  },
  nao_quer_negociar: {
    label: 'Não Quer Negociar / Encerrou Atividades',
    cor: 'text-slate-700',
    bg: 'bg-slate-500',
  },
  restricao_financeira: {
    label: 'Restrição Financeira (Crédito Bloqueado / Sem Limite)',
    cor: 'text-red-700',
    bg: 'bg-red-500',
  },
  sem_contato: { label: 'Sem Contato / Não Atende', cor: 'text-rose-700', bg: 'bg-rose-500' },
  nao_informado: { label: 'Não Informado / Outro', cor: 'text-slate-500', bg: 'bg-slate-400' },
}

function formatCompactCurrencyPtBr(value: number): string {
  if (value === 0) return 'R$ 0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    const v = value / 1_000_000_000
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bi`
  }
  if (abs >= 1_000_000) {
    const v = value / 1_000_000
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
  }
  if (abs >= 1_000) {
    const v = value / 1_000
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`
  }
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatFullCurrencyPtBr(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumberPtBr(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export const MetricasFichaAtendimentoSection: React.FC<MetricasFichaAtendimentoSectionProps> = ({
  selectedPeriodo,
  selectedRegion,
  selectedSegmento,
  selectedCategoria,
}) => {
  const [loading, setLoading] = useState<boolean>(true)
  const [data, setData] = useState<MetricasRespostasFormularioResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchMetricasRespostasFormulario({
        periodo: selectedPeriodo,
        regiao: selectedRegion,
        segmento: selectedSegmento,
        baseCategoria: selectedCategoria,
      })
      setData(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar métricas'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [selectedPeriodo, selectedRegion, selectedSegmento, selectedCategoria])

  useEffect(() => {
    loadData()
  }, [loadData])

  const kpis = data?.kpis || {
    somaValorPotencial: 0,
    mediaValorPotencial: 0,
    countComValor: 0,
    somaToneladas: 0,
    mediaToneladas: 0,
    countComToneladas: 0,
  }

  const q3 = data?.q3Orcamento || {
    sim: 0,
    nao: 0,
    naoRespondido: 0,
    taxaSim: 0,
    taxaNao: 0,
    totalValido: 0,
  }

  const totalRegistros = data?.totalRegistros || 0
  const q7Items = data?.q7Concorrencia || []
  const q8Items = data?.q8Ocorrencia || []
  const q10Items = data?.q10AcaoCorretiva || []
  const desfechoItems = data?.desfechos || []

  const maxQ7 = q7Items.length > 0 ? Math.max(...q7Items.map((i) => i.count), 1) : 1
  const maxQ8 = q8Items.length > 0 ? Math.max(...q8Items.map((i) => i.count), 1) : 1
  const maxQ10 = q10Items.length > 0 ? Math.max(...q10Items.map((i) => i.count), 1) : 1
  const totalDesfechos = desfechoItems.reduce((acc, curr) => acc + curr.count, 0) || 1

  return (
    <div className="space-y-4 pt-2">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-[#253575] text-white flex items-center justify-center shadow-xs">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans">
                Métricas da Ficha de Atendimento
              </h3>
              <Badge
                variant="outline"
                className="bg-blue-50 text-[#253575] border-blue-200 text-[10px] font-mono uppercase"
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
              {selectedSegmento !== 'todos' && (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]"
                >
                  {selectedSegmento}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Análise qualitativa e quantitativa das respostas consolidadas nas fichas de
              atendimento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Fichas filtradas:{' '}
            <strong className="text-[#253575] font-mono">
              {loading ? '—' : totalRegistros.toLocaleString('pt-BR')}
            </strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
            title="Atualizar métricas da ficha"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            className="h-6 text-[11px] bg-white text-red-700 border-red-300 hover:bg-red-50"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Grid de 4 Cards de KPIs de Ficha: Padrão Identidade ABR (grid responsivo 4/3/2/1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: SOMA DO VALOR POTENCIAL (Q15) */}
        <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2 min-h-[42px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Soma Valor Potencial
                  </span>
                  <Badge className="bg-blue-100 text-[#253575] hover:bg-blue-100 text-[10px] font-semibold px-1.5 py-0 rounded border-0 shrink-0">
                    Q15
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  Potencial mapeado nas fichas
                </span>
              </div>
              <div className="h-8 w-8 rounded-lg bg-[#253575]/10 flex items-center justify-center text-[#253575] shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>

            {/* Valor Principal Protagonista */}
            <div className="mt-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-3xl font-extrabold text-[#253575] tabular-nums tracking-tight cursor-pointer">
                      {loading ? '—' : formatCompactCurrencyPtBr(kpis.somaValorPotencial)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-900 text-white text-xs p-2 max-w-xs shadow-lg">
                    <p className="font-bold">Valor Potencial Acumulado:</p>
                    <p className="font-mono text-emerald-400">
                      {formatFullCurrencyPtBr(kpis.somaValorPotencial)}
                    </p>
                    <p className="text-slate-300 text-[11px] mt-0.5">
                      Baseado em {kpis.countComValor} respostas com valor informado
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                {kpis.countComValor} atendimento(s) com valor
              </p>
            </div>
          </div>

          {/* Rodapé Alinhado */}
          <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Média por ficha orçada</span>
            <span className="font-mono text-[#253575] font-semibold text-[11px]">
              {formatCompactCurrencyPtBr(kpis.mediaValorPotencial)}
            </span>
          </div>
        </Card>

        {/* CARD 2: MÉDIA DO VALOR POTENCIAL (Q15) */}
        <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2 min-h-[42px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Ticket Médio Potencial
                  </span>
                  <Badge className="bg-blue-100 text-[#253575] hover:bg-blue-100 text-[10px] font-semibold px-1.5 py-0 rounded border-0 shrink-0">
                    Q15 Médio
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  Média por oportunidade
                </span>
              </div>
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#253575] shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight cursor-pointer">
                      {loading ? '—' : formatCompactCurrencyPtBr(kpis.mediaValorPotencial)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-900 text-white text-xs p-2 max-w-xs shadow-lg">
                    <p className="font-bold">Média do Valor Potencial:</p>
                    <p className="font-mono text-blue-300">
                      {formatFullCurrencyPtBr(kpis.mediaValorPotencial)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                Estimativa média de retomada
              </p>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Amostra válida</span>
            <span className="font-mono text-slate-600 font-semibold text-[11px]">
              {kpis.countComValor} fichas
            </span>
          </div>
        </Card>

        {/* CARD 3: SOMA DE TONELADAS (Q16) */}
        <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2 min-h-[42px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Volume Potencial
                  </span>
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-[10px] font-semibold px-1.5 py-0 rounded border-0 shrink-0">
                    Q16
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  Soma em toneladas (Aço)
                </span>
              </div>
              <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 shrink-0 group-hover:bg-[#253575] group-hover:text-white transition-colors">
                <Scale className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-3xl font-extrabold text-[#142758] tabular-nums tracking-tight">
                {loading ? '—' : `${formatNumberPtBr(kpis.somaToneladas, 1)} ton`}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                {kpis.countComToneladas} atendimento(s) com peso
              </p>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Média por ficha com peso</span>
            <span className="font-mono text-slate-700 font-semibold text-[11px]">
              {formatNumberPtBr(kpis.mediaToneladas, 2)} ton
            </span>
          </div>
        </Card>

        {/* CARD 4: TAXA DE ORÇAMENTO (Q3) */}
        <Card className="border-slate-200/90 bg-white shadow-xs hover:shadow-md hover:border-[#253575]/40 transition-all flex flex-col justify-between rounded-xl overflow-hidden group">
          <div className="p-4 pb-3">
            <div className="flex items-start justify-between gap-2 min-h-[42px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Taxa de Orçamento
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] font-semibold px-1.5 py-0 rounded border-0 shrink-0">
                    Q3
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  Fez orçamento no contato?
                </span>
              </div>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <PieChartIcon className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-3xl font-extrabold text-[#253575] tabular-nums tracking-tight">
                {loading ? '—' : `${q3.taxaSim}%`}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Sim: {q3.sim}
                </span>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <XCircle className="h-3 w-3" /> Não: {q3.nao}
                </span>
              </div>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Taxa Não: {q3.taxaNao}%</span>
            <span className="font-mono text-slate-400 text-[10px]">
              {q3.totalValido} declarados
            </span>
          </div>
        </Card>
      </div>

      {/* BLOCO DE DISTRIBUIÇÃO DAS RESPOSTAS: 3 PERGUNTAS ESTRATÉGICAS + DESFECHOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Q7: Concorrência */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-blue-50 text-[#253575] flex items-center justify-center">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Q7 — Concorrência Mapeada
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Onde o cliente tem cotado ou comprado aço
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 font-mono">
                {q7Items.length} concorrentes
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-500 mb-2" />
                Carregando distribuição de concorrência...
              </div>
            ) : q7Items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhuma resposta de concorrência registrada para os filtros selecionados.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {q7Items.slice(0, 8).map((item) => {
                  const pct = Math.round((item.count / maxQ7) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className="font-medium text-slate-700 truncate max-w-[70%]"
                          title={item.label}
                        >
                          {item.label}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold text-[11px]">
                          {item.count}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({Math.round((item.count / (totalRegistros || 1)) * 100)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#253575] rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Q8: Ocorrência / Motivo de Inatividade */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <AlertCircle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Q8 — Histórico de Ocorrências
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Problemas ou motivos que levaram ao distanciamento
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 font-mono">
                {q8Items.length} motivos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-amber-500 mb-2" />
                Carregando histórico de ocorrências...
              </div>
            ) : q8Items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhuma ocorrência registrada para os filtros selecionados.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {q8Items.slice(0, 8).map((item) => {
                  const pct = Math.round((item.count / maxQ8) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className="font-medium text-slate-700 truncate max-w-[70%]"
                          title={item.label}
                        >
                          {item.label}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold text-[11px]">
                          {item.count}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({Math.round((item.count / (totalRegistros || 1)) * 100)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Q10: Ação Corretiva Realizada */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Q10 — Ações Corretivas Aplicadas
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Propostas e ações adotadas para reversão do quadro
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 font-mono">
                {q10Items.length} ações
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-emerald-500 mb-2" />
                Carregando ações corretivas...
              </div>
            ) : q10Items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhuma ação corretiva registrada para os filtros selecionados.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {q10Items.slice(0, 8).map((item) => {
                  const pct = Math.round((item.count / maxQ10) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className="font-medium text-slate-700 truncate max-w-[70%]"
                          title={item.label}
                        >
                          {item.label}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold text-[11px]">
                          {item.count}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({Math.round((item.count / (totalRegistros || 1)) * 100)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motivo de Desfecho / Encerramento */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <HelpCircle className="h-3.5 w-3.5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Desfecho do Atendimento
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Status e motivo final de encerramento da ficha
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-600 font-mono">
                {desfechoItems.length} desfechos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-indigo-500 mb-2" />
                Carregando desfechos...
              </div>
            ) : desfechoItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum desfecho registrado para os filtros selecionados.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {desfechoItems.map((item) => {
                  const meta = DESFECHOS_LABEL_MAP[item.label] || {
                    label: item.label.replace(/_/g, ' '),
                    cor: 'text-slate-700',
                    bg: 'bg-[#253575]',
                  }
                  const pct = Math.round((item.count / totalDesfechos) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-medium ${meta.cor} truncate max-w-[70%]`}
                          title={meta.label}
                        >
                          {meta.label}
                        </span>
                        <span className="font-mono text-slate-500 font-semibold text-[11px]">
                          {item.count}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${meta.bg} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
