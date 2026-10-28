import React, { useState } from 'react'
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
import {
  Download,
  FileSpreadsheet,
  Calendar,
  Filter,
  User,
  CheckCircle2,
  PhoneCall,
  PhoneForwarded,
  CalendarCheck,
  XCircle,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { exportarRelatoriosCsv } from '@/services/api'
import { toast } from '@/hooks/use-toast'

interface ExportacaoRelatoriosSectionProps {
  regioesList: string[]
  operadoresList?: string[]
  selectedRegiaoDefault?: string
}

export const ExportacaoRelatoriosSection: React.FC<ExportacaoRelatoriosSectionProps> = ({
  regioesList,
  operadoresList = [],
  selectedRegiaoDefault = 'todas',
}) => {
  const [tipo, setTipo] = useState<
    'reativados' | 'contatos' | 'reagendados' | 'followups' | 'vendas_perdidas' | 'resumo_diario'
  >('reativados')
  const [regiao, setRegiao] = useState<string>(selectedRegiaoDefault)
  const [operador, setOperador] = useState<string>('todos')
  const [periodoPredefinido, setPeriodoPredefinido] = useState<
    'hoje' | '7dias' | '30dias' | 'este_mes' | 'mes_anterior' | 'personalizado'
  >('este_mes')

  const [dataInicio, setDataInicio] = useState<string>(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  })
  const [dataFim, setDataFim] = useState<string>(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
    return `${y}-${m}-${String(lastDay).padStart(2, '0')}`
  })

  const [exportando, setExportando] = useState<boolean>(false)

  const aplicarPredefinido = (
    opcao: 'hoje' | '7dias' | '30dias' | 'este_mes' | 'mes_anterior' | 'personalizado',
  ) => {
    setPeriodoPredefinido(opcao)
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()

    const formatYmd = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    if (opcao === 'hoje') {
      const hoje = formatYmd(now)
      setDataInicio(hoje)
      setDataFim(hoje)
    } else if (opcao === '7dias') {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
      setDataInicio(formatYmd(start))
      setDataFim(formatYmd(now))
    } else if (opcao === '30dias') {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
      setDataInicio(formatYmd(start))
      setDataFim(formatYmd(now))
    } else if (opcao === 'este_mes') {
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0)
      setDataInicio(formatYmd(start))
      setDataFim(formatYmd(end))
    } else if (opcao === 'mes_anterior') {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0)
      setDataInicio(formatYmd(start))
      setDataFim(formatYmd(end))
    }
  }

  const handleExportar = async () => {
    setExportando(true)
    try {
      const res = await exportarRelatoriosCsv({
        tipo,
        periodoInicio: dataInicio,
        periodoFim: dataFim,
        regiao: regiao !== 'todas' ? regiao : undefined,
        operador: operador !== 'todos' ? operador : undefined,
      })

      // Download direto no navegador
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', res.filename || `relatorio_${tipo}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'Exportação Concluída',
        description: `Arquivo ${res.filename} baixado com sucesso.`,
      })
    } catch (err: any) {
      console.error('Erro na exportação:', err)
      toast({
        title: 'Falha na Exportação',
        description: err?.message || 'Não foi possível gerar o arquivo CSV.',
        variant: 'destructive',
      })
    } finally {
      setExportando(false)
    }
  }

  const cardsOpcoes = [
    {
      id: 'reativados' as const,
      titulo: 'Clientes Reativados',
      desc: 'Lista de clientes reativados com pedido, valor, operador e data',
      icon: CheckCircle2,
      cor: 'text-emerald-600',
      bgCor: 'bg-emerald-50 border-emerald-200',
    },
    {
      id: 'contatos' as const,
      titulo: 'Contatos Realizados',
      desc: 'Histórico completo de interações, ligações e formulários da esteira',
      icon: PhoneCall,
      cor: 'text-[#253575]',
      bgCor: 'bg-blue-50 border-blue-200',
    },
    {
      id: 'reagendados' as const,
      titulo: 'Clientes Reagendados',
      desc: 'Compromissos agendados e retornos registrados pelos operadores',
      icon: PhoneForwarded,
      cor: 'text-amber-600',
      bgCor: 'bg-amber-50 border-amber-200',
    },
    {
      id: 'followups' as const,
      titulo: 'Follow-ups Programados',
      desc: 'Clientes com data futura de retorno para acompanhamento',
      icon: CalendarCheck,
      cor: 'text-purple-600',
      bgCor: 'bg-purple-50 border-purple-200',
    },
    {
      id: 'vendas_perdidas' as const,
      titulo: 'Vendas Perdidas',
      desc: 'Desfechos de compra em concorrente, sem interesse ou restrição',
      icon: XCircle,
      cor: 'text-rose-600',
      bgCor: 'bg-rose-50 border-rose-200',
    },
    {
      id: 'resumo_diario' as const,
      titulo: 'Resumo Diário Consolidado',
      desc: 'Totais agrupados dia a dia para análise de evolução e fechamentos',
      icon: BarChart3,
      cor: 'text-indigo-600',
      bgCor: 'bg-indigo-50 border-indigo-200',
    },
  ]

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="py-4 px-4 sm:px-6 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Central de Relatórios e Exportação CSV
              </CardTitle>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                Compatível com Excel (BOM / sep=;)
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Exporte dados oficiais da operação para auditoria, apresentações ou cruzamentos externos.
            </CardDescription>
          </div>

          <Button
            onClick={handleExportar}
            disabled={exportando}
            className="bg-[#253575] hover:bg-[#1a2758] text-white shadow-sm h-9 px-4 text-xs font-semibold"
          >
            {exportando ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                Gerando CSV...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-2" />
                Exportar CSV ({cardsOpcoes.find((c) => c.id === tipo)?.titulo})
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Escolha do Tipo de Relatório */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            1. Selecione o Tipo de Relatório
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cardsOpcoes.map((op) => {
              const Icon = op.icon
              const isSelected = tipo === op.id
              return (
                <div
                  key={op.id}
                  onClick={() => setTipo(op.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 ${
                    isSelected
                      ? `${op.bgCor} ring-2 ring-[#253575] shadow-xs`
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 bg-white'
                  }`}
                >
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-white shadow-2xs' : 'bg-slate-100'
                    }`}
                  >
                    <Icon className={`h-4.5 w-4.5 ${op.cor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 leading-tight">{op.titulo}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{op.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Filtros de Período e Escopo */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            2. Filtros do Relatório
          </label>

          {/* Atalhos rápidos de período */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium mr-1 flex items-center">
              <Calendar className="h-3 w-3 mr-1 text-slate-400" />
              Período:
            </span>
            <button
              type="button"
              onClick={() => aplicarPredefinido('este_mes')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                periodoPredefinido === 'este_mes'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => aplicarPredefinido('hoje')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                periodoPredefinido === 'hoje'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => aplicarPredefinido('7dias')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                periodoPredefinido === '7dias'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              type="button"
              onClick={() => aplicarPredefinido('30dias')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                periodoPredefinido === '30dias'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Últimos 30 dias
            </button>
            <button
              type="button"
              onClick={() => aplicarPredefinido('mes_anterior')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                periodoPredefinido === 'mes_anterior'
                  ? 'bg-[#253575] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Mês Anterior
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            {/* Data Início */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Data Inicial</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value)
                  setPeriodoPredefinido('personalizado')
                }}
                className="w-full h-8 text-xs px-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#253575]"
              />
            </div>

            {/* Data Fim */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Data Final</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value)
                  setPeriodoPredefinido('personalizado')
                }}
                className="w-full h-8 text-xs px-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#253575]"
              />
            </div>

            {/* Região */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Região / Rota</label>
              <Select value={regiao} onValueChange={setRegiao}>
                <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                  <SelectValue placeholder="Todas as Regiões" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Regiões</SelectItem>
                  {regioesList.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value="Sem Região">Sem Região</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Operador */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600">Operador</label>
              <Select value={operador} onValueChange={setOperador}>
                <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                  <SelectValue placeholder="Todos os Operadores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Operadores</SelectItem>
                  {operadoresList.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Resumo da Exportação e Botão de Ação */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Pronto para exportar:{' '}
                <span className="text-[#253575]">{cardsOpcoes.find((c) => c.id === tipo)?.titulo}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Período: {dataInicio || 'Início'} até {dataFim || 'Fim'} • Região: {regiao} • Operador:{' '}
                {operador}
              </div>
            </div>
          </div>

          <Button
            onClick={handleExportar}
            disabled={exportando}
            className="bg-[#253575] hover:bg-[#1a2758] text-white shadow-sm h-8 px-4 text-xs font-semibold shrink-0"
          >
            {exportando ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Baixando...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Baixar Arquivo CSV
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default ExportacaoRelatoriosSection
