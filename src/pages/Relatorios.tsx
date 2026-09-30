import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  Download,
  Filter,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Calendar,
  Search,
  ShieldCheck,
  RefreshCw,
  PhoneCall,
  Activity,
  PhoneForwarded,
  Users,
  DollarSign,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  UserCheck,
  ArrowUpDown,
  FileQuestion,
  CreditCard,
  Clock,
  Truck,
  PhoneOff,
  Ban,
  Eye,
  SlidersHorizontal,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  fetchImportacoes,
  fetchRegioes,
  fetchMetricasAtendimentosDashboard,
  fetchRelatorioDiagnostico,
  fetchMetricasBaseKpis,
} from '@/services/api'
import type {
  Importacao,
  Regiao,
  PeriodoAtendimentoFiltro,
  MetricasAtivosRemovidos,
  MetricasAtendimentosDashboard,
  RelatorioDiagnosticoCompleto,
  DiagnosticoItemMotivo,
  MetricasBaseKpisResponse,
} from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ExpedienteStatusBadge } from '@/components/ExpedienteStatusBadge'

export default function RelatoriosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Determinar restrição de rota caso o usuário seja Líder de Rota
  const isLider = user?.role === 'lider'
  const rotaLider = isLider && user?.regioes && user.regioes.length > 0 ? user.regioes[0] : null

  // Filtros
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoAtendimentoFiltro>('total')
  const [selectedRegiao, setSelectedRegiao] = useState<string>(rotaLider || 'todas')
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])

  // Estados de dados
  const [baseKpis, setBaseKpis] = useState<MetricasBaseKpisResponse | null>(null)
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [metricasAtendimento, setMetricasAtendimento] =
    useState<MetricasAtendimentosDashboard | null>(null)
  const [diagnostico, setDiagnostico] = useState<RelatorioDiagnosticoCompleto | null>(null)

  // Loading states
  const [loadingGeral, setLoadingGeral] = useState(true)
  const [loadingAtendimentos, setLoadingAtendimentos] = useState(false)
  const [loadingDiagnostico, setLoadingDiagnostico] = useState(false)

  // Ordenação da tabela de operadores
  const [sortFieldOp, setSortFieldOp] = useState<'conversoes' | 'atendimentos' | 'taxaConversao'>(
    'conversoes',
  )
  const [sortAscOp, setSortAscOp] = useState(false)

  // Estados para Drill-down do Bloco 2 (Diagnóstico)
  const [motivoDrillDown, setMotivoDrillDown] = useState<DiagnosticoItemMotivo | null>(null)
  const [drillDownSearch, setDrillDownSearch] = useState('')

  // Estados da Auditoria de Ativos Removidos
  const [buscaAtivos, setBuscaAtivos] = useState('')
  const [filtroMotivoAtivos, setFiltroMotivoAtivos] = useState<string>('todos')

  // Redirecionamento de operador comum para o Meu Painel
  useEffect(() => {
    if (user && user.role === 'operador') {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  // Se for líder, força a rota do líder
  useEffect(() => {
    if (isLider && rotaLider) {
      setSelectedRegiao(rotaLider)
    }
  }, [isLider, rotaLider])

  // Estado de erro explícito
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  // Carga inicial de metadados (apenas lista de regiões e importações)
  useEffect(() => {
    if (user && user.role !== 'operador') {
      loadMetadata()
    }
  }, [user])

  // Recarrega relatórios quando filtros mudam
  useEffect(() => {
    if (user && user.role !== 'operador') {
      loadRelatorios()
    }
  }, [user, selectedPeriodo, selectedRegiao])

  if (user?.role === 'operador') {
    return null
  }

  const loadMetadata = async () => {
    try {
      const [resI, resRegioes] = await Promise.all([
        fetchImportacoes().catch(() => [] as Importacao[]),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setImportacoes(resI)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err) {
      console.warn('Erro ao carregar metadados auxiliares para relatórios:', err)
    }
  }

  const loadRelatorios = async () => {
    const regiaoParam = selectedRegiao !== 'todas' ? selectedRegiao : undefined
    setLoadingAtendimentos(true)
    setLoadingDiagnostico(true)
    setLoadingGeral(true)
    setErroCarregamento(null)

    const errosEncontrados: string[] = []

    // Executar chamadas com tratamento individual de erro para não derrubar o painel todo
    const promessaAtendimentos = fetchMetricasAtendimentosDashboard({
      periodo: selectedPeriodo,
      regiao: regiaoParam,
    }).catch((err) => {
      console.error('Falha em fetchMetricasAtendimentosDashboard:', err)
      errosEncontrados.push('Atividades de atendimento')
      return null
    })

    const promessaDiagnostico = fetchRelatorioDiagnostico({
      periodo: selectedPeriodo,
      regiao: regiaoParam,
    }).catch((err) => {
      console.error('Falha em fetchRelatorioDiagnostico:', err)
      errosEncontrados.push('Diagnóstico comercial')
      return null
    })

    const promessaBaseKpis = fetchMetricasBaseKpis({
      regiao: selectedRegiao,
    }).catch((err) => {
      console.error('Falha em fetchMetricasBaseKpis:', err)
      errosEncontrados.push('KPIs agregados da base')
      return null
    })

    try {
      const [dadosAtendimento, dadosDiagnostico, dadosBase] = await Promise.all([
        promessaAtendimentos,
        promessaDiagnostico,
        promessaBaseKpis,
      ])

      if (dadosAtendimento) setMetricasAtendimento(dadosAtendimento)
      if (dadosDiagnostico) setDiagnostico(dadosDiagnostico)
      if (dadosBase) setBaseKpis(dadosBase)

      if (errosEncontrados.length > 0) {
        setErroCarregamento(
          `Não foi possível carregar completamente os seguintes módulos: ${errosEncontrados.join(', ')}. Verifique a conexão com o servidor.`,
        )
      }
    } catch (err: any) {
      console.error('Erro ao processar relatórios gerenciais:', err)
      setErroCarregamento(err?.message || 'Não foi possível carregar as métricas dos relatórios.')
    } finally {
      setLoadingAtendimentos(false)
      setLoadingDiagnostico(false)
      setLoadingGeral(false)
    }
  }

  // Totais agregados no servidor
  const totalBase = baseKpis?.kpis.totalBase || 0
  const elegiveisNaFila = baseKpis?.kpis.naFila || 0

  // Clientes ativos removidos
  const ativosRemovidosData: MetricasAtivosRemovidos = metricasAtendimento?.ativosRemovidos || {
    total: 0,
    breakdown: {},
    itens: [],
  }

  const ativosRemovidosFiltrados = (ativosRemovidosData.itens || []).filter((item) => {
    if (filtroMotivoAtivos !== 'todos' && item.motivo_categoria !== filtroMotivoAtivos) {
      return false
    }
    if (buscaAtivos.trim()) {
      const q = buscaAtivos.toLowerCase()
      const matchCodigo = item.codigo.toLowerCase().includes(q)
      const matchNome = item.nome.toLowerCase().includes(q)
      const matchRegiao = item.regiao.toLowerCase().includes(q)
      const matchMotivo = item.motivo_completo.toLowerCase().includes(q)
      const matchOperador = item.operador_nome.toLowerCase().includes(q)
      if (!matchCodigo && !matchNome && !matchRegiao && !matchMotivo && !matchOperador) {
        return false
      }
    }
    return true
  })

  // Exportar Auditoria de Clientes Ativos Removidos para CSV
  const handleExportAtivosRemovidosCSV = () => {
    let csv =
      'Codigo;Cliente;Regiao;Motivo_Categoria;Motivo_Completo_Observacao;Operador;Data_Remocao\n'
    ativosRemovidosFiltrados.forEach((item) => {
      const obsLimpa = (item.motivo_completo || '').replace(/[\n\r;]/g, ' ')
      const dataFormatada = new Date(item.data_remocao).toLocaleString('pt-BR')
      csv += `"${item.codigo}";"${item.nome}";"${item.regiao}";"${item.motivo_categoria}";"${obsLimpa}";"${item.operador_nome}";"${dataFormatada}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `auditoria_ativos_removidos_${selectedPeriodo}_${selectedRegiao}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // Exportar Relatório de Diagnóstico Comercial (Bloco 2)
  const handleExportDiagnosticoCSV = () => {
    if (!diagnostico) return
    let csv =
      'Categoria_Diagnostico;Motivo;Ocorrencias;Percentual_Total;Hoje;Ultimos_7d;Ultimos_30d\n'
    diagnostico.rankingMotivos.forEach((m) => {
      csv += `"${m.categoria}";"${m.titulo}";${m.totalOcorrencias};"${m.percentual}%";${m.porPeriodo.hoje};${m.porPeriodo.ultimos7dias};${m.porPeriodo.ultimos30dias}\n`
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `diagnostico_motivos_nao_compra_${selectedPeriodo}_${selectedRegiao}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // Exportar Geral da Operação (amostra de auditoria)
  const handleExportGeralCSV = async () => {
    let csv =
      'Total_Base;Elegiveis_Fila;Reativados;Taxa_Recuperacao;Valor_Recuperado;Regiao_Filtro\n'
    csv += `${totalBase};${elegiveisNaFila};${baseKpis?.kpis.reativados || 0};"${baseKpis?.kpis.taxaReativacao || 0}%";${baseKpis?.kpis.valorRecuperado || 0};"${selectedRegiao}"\n`

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `relatorio_geral_operacao_${selectedPeriodo}_${selectedRegiao}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // Ícone dinâmico do motivo
  const renderIconMotivo = (iconName: string) => {
    switch (iconName) {
      case 'DollarSign':
        return <DollarSign className="h-4 w-4 text-emerald-600" />
      case 'XCircle':
        return <XCircle className="h-4 w-4 text-rose-600" />
      case 'CreditCard':
        return <CreditCard className="h-4 w-4 text-amber-600" />
      case 'Clock':
        return <Clock className="h-4 w-4 text-blue-600" />
      case 'Truck':
        return <Truck className="h-4 w-4 text-orange-600" />
      case 'AlertTriangle':
        return <AlertTriangle className="h-4 w-4 text-purple-600" />
      case 'Users':
        return <Users className="h-4 w-4 text-indigo-600" />
      case 'PhoneOff':
        return <PhoneOff className="h-4 w-4 text-slate-600" />
      case 'Ban':
        return <Ban className="h-4 w-4 text-zinc-700" />
      case 'ShieldCheck':
        return <ShieldCheck className="h-4 w-4 text-teal-600" />
      default:
        return <FileQuestion className="h-4 w-4 text-slate-500" />
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* BANNER DE ERRO COM BOTÃO DE TENTAR NOVAMENTE */}
      {erroCarregamento && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center space-x-3">
              <div className="p-2 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-900">
                  Não foi possível carregar as métricas
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">{erroCarregamento}</p>
              </div>
            </div>
            <Button
              onClick={loadRelatorios}
              size="sm"
              variant="default"
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* HEADER DA PÁGINA COM FILTROS E STATUS EXPEDIENTE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Relatório de Resultados & Diagnóstico Comercial
            </h1>
            <ExpedienteStatusBadge showHorarioAtual />
            {isLider && (
              <Badge className="bg-amber-600 text-white font-semibold text-xs">
                🚩 Visão da Rota: {rotaLider}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Visão estratégica para a gerência comercial: produtividade da equipe de atendimento,
            diagnóstico das causas de inatividade baseadas no formulário de qualificação e auditoria
            de base.
          </p>
        </div>

        {/* Barra de Filtros Principais */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Período */}
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

          {/* Região (desabilitada caso o usuário seja Líder da sua rota) */}
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-xs">
            <Filter className="h-3 w-3 text-slate-400" />
            <Select value={selectedRegiao} onValueChange={setSelectedRegiao} disabled={isLider}>
              <SelectTrigger className="h-7 text-xs border-0 shadow-none px-1 w-40 focus:ring-0">
                <SelectValue placeholder="Região" />
              </SelectTrigger>
              <SelectContent>
                {!isLider && <SelectItem value="todas">Todas as Regiões</SelectItem>}
                {regioesList.map((reg) => (
                  <SelectItem key={reg} value={reg}>
                    {reg}
                  </SelectItem>
                ))}
                {!isLider && <SelectItem value="Sem Região">Sem Região</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Botões de Ação */}
          <Button
            variant="outline"
            size="sm"
            onClick={loadRelatorios}
            disabled={loadingAtendimentos || loadingDiagnostico}
            className="h-8 text-xs text-slate-700 bg-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${
                loadingAtendimentos || loadingDiagnostico ? 'animate-spin' : ''
              }`}
            />
            Atualizar
          </Button>

          <Button
            onClick={handleExportGeralCSV}
            size="sm"
            variant="outline"
            className="h-8 text-xs text-slate-700 bg-white font-medium"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar Geral
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BLOCO 1 — MÉTRICAS DE ATENDIMENTO (ATIVIDADE DA EQUIPE COMERCIAL) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Bloco 1 — Atividade Comercial & Desempenho do Atendimento
                </h2>
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-mono uppercase"
                >
                  {selectedPeriodo === 'hoje'
                    ? 'Hoje (Brasília)'
                    : selectedPeriodo === '7dias'
                      ? 'Últimos 7 dias'
                      : selectedPeriodo === '30dias'
                        ? 'Últimos 30 dias'
                        : 'Histórico Total'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Métricas consolidadas de contatos, ligações, conversões, follow-ups e vendas
                perdidas (alinhadas com o Dashboard e Meu Painel).
              </p>
            </div>
          </div>
        </div>

        {/* Grid de 8 Cards KPIs de Atendimento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* 1. Clientes na Base */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Clientes na Base
                </span>
                <Users className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {loadingGeral ? '—' : totalBase}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">carteira inativa</span>
            </CardContent>
          </Card>

          {/* 2. Elegíveis na Fila */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Elegíveis Fila
                </span>
                <Layers className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              </div>
              <div className="text-xl font-black text-indigo-700 font-mono">
                {loadingGeral ? '—' : elegiveisNaFila}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">prontos p/ ligar</span>
            </CardContent>
          </Card>

          {/* 3. Atendimentos Realizados */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Atendimentos
                </span>
                <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.totalAtendimentos || 0}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">no período</span>
            </CardContent>
          </Card>

          {/* 4. Ligações Feitas */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Ligações
                </span>
                <PhoneCall className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              </div>
              <div className="text-xl font-black text-blue-700 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.ligacoesFeitas || 0}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">chamadas & forms</span>
            </CardContent>
          </Card>

          {/* 5. Conversões (Compra Efetivada) */}
          <Card className="border-slate-200 shadow-xs bg-emerald-50/30 border-emerald-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-emerald-800 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Conversões
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              </div>
              <div className="text-xl font-black text-emerald-600 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.conversoes || 0}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium block truncate">
                Taxa: {metricasAtendimento?.gerais.taxaConversao || 0}%
              </span>
            </CardContent>
          </Card>

          {/* 6. Reagendamentos */}
          <Card className="border-slate-200 shadow-xs bg-amber-50/30 border-amber-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-amber-800 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Reagendados
                </span>
                <PhoneForwarded className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              </div>
              <div className="text-xl font-black text-amber-600 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.reagendamentos || 0}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">retornos marcados</span>
            </CardContent>
          </Card>

          {/* 7. Follow-ups Hoje vs Pendentes */}
          <Card className="border-slate-200 shadow-xs bg-rose-50/30 border-rose-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-rose-800 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Follow-ups Hoje
                </span>
                <Calendar className="h-3.5 w-3.5 text-rose-600 shrink-0" />
              </div>
              <div className="text-xl font-black text-rose-600 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.followUpsHoje || 0}
              </div>
              <span className="text-[10px] text-rose-700 font-medium block truncate">
                Pendentes: {metricasAtendimento?.gerais.followUpsPendentes || 0}
              </span>
            </CardContent>
          </Card>

          {/* 8. Vendas Perdidas */}
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                  Vendas Perdidas
                </span>
                <XCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              </div>
              <div className="text-xl font-black text-slate-700 font-mono">
                {loadingAtendimentos ? '—' : metricasAtendimento?.gerais.vendasPerdidas || 0}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">terceiros/recusas</span>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Desempenho por Operador */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Visão Operacional por Operador de Vendas
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-slate-600 bg-white">
                  {metricasAtendimento?.operadores.length || 0} operadores
                </Badge>
              </div>

              {/* Ordenação */}
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-slate-400 text-[11px]">Ordenar:</span>
                <Button
                  variant={sortFieldOp === 'conversoes' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (sortFieldOp === 'conversoes') setSortAscOp(!sortAscOp)
                    else {
                      setSortFieldOp('conversoes')
                      setSortAscOp(false)
                    }
                  }}
                  className={`h-6 text-[11px] px-2 ${
                    sortFieldOp === 'conversoes'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  Conversões <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                </Button>
                <Button
                  variant={sortFieldOp === 'atendimentos' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (sortFieldOp === 'atendimentos') setSortAscOp(!sortAscOp)
                    else {
                      setSortFieldOp('atendimentos')
                      setSortAscOp(false)
                    }
                  }}
                  className={`h-6 text-[11px] px-2 ${
                    sortFieldOp === 'atendimentos'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  Atendimentos <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                </Button>
                <Button
                  variant={sortFieldOp === 'taxaConversao' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (sortFieldOp === 'taxaConversao') setSortAscOp(!sortAscOp)
                    else {
                      setSortFieldOp('taxaConversao')
                      setSortAscOp(false)
                    }
                  }}
                  className={`h-6 text-[11px] px-2 ${
                    sortFieldOp === 'taxaConversao'
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  Taxa % <ArrowUpDown className="h-3 w-3 ml-1 opacity-70" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingAtendimentos ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Carregando produtividade da equipe...
              </div>
            ) : !metricasAtendimento || metricasAtendimento.operadores.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum atendimento registrado no período selecionado.
              </div>
            ) : (
              (() => {
                const sortedOps = [...metricasAtendimento.operadores].sort((a, b) => {
                  const valA = a[sortFieldOp]
                  const valB = b[sortFieldOp]
                  return sortAscOp ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1
                })

                const totalAtendimentos = sortedOps.reduce((acc, o) => acc + o.atendimentos, 0)
                const totalLigacoes = sortedOps.reduce((acc, o) => acc + o.ligacoes, 0)
                const totalConversoes = sortedOps.reduce((acc, o) => acc + o.conversoes, 0)
                const totalReagendados = sortedOps.reduce((acc, o) => acc + o.reagendamentos, 0)
                const totalFollowUps = sortedOps.reduce((acc, o) => acc + o.followUpsHoje, 0)
                const totalPerdidas = sortedOps.reduce((acc, o) => acc + o.vendasPerdidas, 0)
                const taxaMediaGeral =
                  totalLigacoes > 0 ? Math.round((totalConversoes / totalLigacoes) * 100) : 0

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-4">Operador</th>
                          <th className="py-2.5 px-3">Rota / Região</th>
                          <th className="py-2.5 px-3 text-center">Atendimentos</th>
                          <th className="py-2.5 px-3 text-center">Ligações</th>
                          <th className="py-2.5 px-3 text-center text-emerald-700">Conversões</th>
                          <th className="py-2.5 px-3 text-center text-purple-700">Taxa %</th>
                          <th className="py-2.5 px-3 text-center text-amber-700">Reagendados</th>
                          <th className="py-2.5 px-3 text-center text-rose-700">Follow-up Hoje</th>
                          <th className="py-2.5 px-3 text-center text-slate-700">
                            Vendas Perdidas
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedOps.map((op, idx) => (
                          <tr
                            key={op.operadorId}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{op.operadorNome}</span>
                                {op.tituloGamificacao && (
                                  <span className="text-xs" title={op.tituloGamificacao.nome}>
                                    {op.tituloGamificacao.emoji}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 capitalize">
                                {op.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-[160px] truncate">
                              {op.regiao}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800">
                              {op.atendimentos}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-blue-700">
                              {op.ligacoes}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">
                              {op.conversoes > 0 ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-mono font-bold">
                                  {op.conversoes}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-semibold text-purple-700">
                              {op.taxaConversao}%
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                              {op.reagendamentos}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              {op.followUpsHoje > 0 ? (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs font-mono font-bold">
                                  {op.followUpsHoje}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                              {op.vendasPerdidas}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                        <tr>
                          <td className="py-2.5 px-4 uppercase tracking-wider text-[11px]">
                            Total ({sortedOps.length} operadores)
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {selectedRegiao === 'todas' ? 'Todas as Rotas' : selectedRegiao}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">{totalAtendimentos}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-blue-700">
                            {totalLigacoes}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-emerald-700">
                            <Badge className="bg-emerald-600 text-white font-mono font-bold">
                              {totalConversoes}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-purple-700">
                            {taxaMediaGeral}%
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                            {totalReagendados}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-rose-700">
                            {totalFollowUps}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                            {totalPerdidas}
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
      </section>

      {/* ========================================================================= */}
      {/* BLOCO 2 — DIAGNÓSTICO: "POR QUE O CLIENTE NÃO ESTÁ COMPRANDO?" */}
      {/* ========================================================================= */}
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Bloco 2 — Diagnóstico: "Por Que o Cliente Não Está Comprando?"
                </h2>
                <Badge className="bg-rose-600 text-white text-[10px]">
                  Inteligência das 17 Perguntas
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Mapeamento das respostas reais de qualificação do formulário (preço, concorrência,
                crédito, entrega, erros operacionais, ativo fora da base e perdas).
              </p>
            </div>
          </div>

          <Button
            onClick={handleExportDiagnosticoCSV}
            size="sm"
            variant="outline"
            className="border-slate-300 text-slate-700 h-8 text-xs font-semibold self-start sm:self-auto bg-white"
            disabled={loadingDiagnostico || !diagnostico || diagnostico.rankingMotivos.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar Diagnóstico CSV
          </Button>
        </div>

        {/* Resumo Rápido do Diagnóstico */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-slate-200 shadow-xs bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 block">
                  Total de Diagnósticos Registrados
                </span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {loadingDiagnostico ? '—' : diagnostico?.totalRespondidos || 0}
                </div>
                <span className="text-[10px] text-slate-400">
                  ocorrências mapeadas nas perguntas
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 block">
                  Clientes Diagnosticados
                </span>
                <div className="text-2xl font-black text-indigo-700 font-mono mt-0.5">
                  {loadingDiagnostico ? '—' : diagnostico?.totalClientesAnalisados || 0}
                </div>
                <span className="text-[10px] text-slate-400">carteira com causa identificada</span>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                <UserCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 block">
                  Principal Causa da Inatividade
                </span>
                <div className="text-base font-black text-rose-700 truncate max-w-[200px] mt-0.5">
                  {loadingDiagnostico
                    ? '—'
                    : diagnostico?.rankingMotivos[0]?.totalOcorrencias
                      ? diagnostico.rankingMotivos[0].titulo
                      : 'Sem causas ainda'}
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {diagnostico?.rankingMotivos[0]?.percentual || 0}% do volume diagnosticado
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RANKING DOS PRINCIPAIS MOTIVOS COM DRILL-DOWN E DISTRIBUIÇÃO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1 & 2: Cards de Ranking dos Motivos (com ação de clique para Drill-Down) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ranking de Causas Diagnosticadas (Clique no motivo para ver os clientes)
              </h3>
              <span className="text-[11px] text-slate-400">
                {diagnostico?.rankingMotivos.length || 0} categorias catalogadas
              </span>
            </div>

            {loadingDiagnostico ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Mapeando respostas das 17 perguntas e motivos de perda...
              </div>
            ) : !diagnostico ||
              diagnostico.rankingMotivos.every((m) => m.totalOcorrencias === 0) ? (
              <Card className="p-8 text-center text-xs text-slate-400 border-dashed">
                Nenhuma resposta de diagnóstico registrada ainda para os filtros selecionados.
              </Card>
            ) : (
              <div className="space-y-2.5">
                {diagnostico.rankingMotivos.map((motivo, idx) => {
                  const isTop = idx === 0 && motivo.totalOcorrencias > 0
                  const isSelected = motivoDrillDown?.id === motivo.id
                  return (
                    <div
                      key={motivo.id}
                      onClick={() => {
                        setMotivoDrillDown(motivo)
                        setDrillDownSearch('')
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-sm'
                          : isTop
                            ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400 hover:shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-3">
                          <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0 mt-0.5">
                            {renderIconMotivo(motivo.icone)}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs font-bold text-slate-400">
                                #{idx + 1}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900">{motivo.titulo}</h4>
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono ${motivo.corBadge}`}
                              >
                                {motivo.percentual}% do total
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">{motivo.descricao}</p>

                            {/* Tags de evolução temporal */}
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-mono text-slate-500">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                Hoje: <strong>{motivo.porPeriodo.hoje}</strong>
                              </span>
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                7 dias: <strong>{motivo.porPeriodo.ultimos7dias}</strong>
                              </span>
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                30 dias: <strong>{motivo.porPeriodo.ultimos30dias}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xl font-black text-slate-900 font-mono">
                            {motivo.totalOcorrencias}
                          </div>
                          <span className="text-[10px] text-blue-600 font-semibold flex items-center justify-end mt-1">
                            <Eye className="h-3 w-3 mr-1" />
                            Ver clientes
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso visual */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isTop ? 'bg-rose-500' : 'bg-blue-600'}`}
                          style={{
                            width: `${Math.max(motivo.percentual, motivo.totalOcorrencias > 0 ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Coluna 3: Distribuição por Região e por Vendedor de Origem */}
          <div className="space-y-4">
            {/* Distribuição por Região */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Distribuição por Região</span>
                </CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Ocorrências registradas por território
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5">
                {loadingDiagnostico ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Carregando regiões...
                  </div>
                ) : !diagnostico || Object.keys(diagnostico.distribuicaoPorRegiao).length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">Sem registros.</div>
                ) : (
                  Object.entries(diagnostico.distribuicaoPorRegiao).map(([reg, count]) => {
                    const perc =
                      diagnostico.totalRespondidos > 0
                        ? Math.round((count / diagnostico.totalRespondidos) * 100)
                        : 0
                    return (
                      <div key={reg} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">{reg}</span>
                          <span className="font-mono text-slate-600 font-bold">
                            {count} ({perc}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${perc}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Distribuição por Vendedor de Origem */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Users className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Vendedor de Origem da Carteira</span>
                </CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Concentração de inatividade por vendedor da rota
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 max-h-72 overflow-y-auto">
                {loadingDiagnostico ? (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Carregando vendedores...
                  </div>
                ) : !diagnostico ||
                  Object.keys(diagnostico.distribuicaoPorVendedorOrigem).length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400">Sem registros.</div>
                ) : (
                  Object.entries(diagnostico.distribuicaoPorVendedorOrigem)
                    .sort(([, a], [, b]) => b - a)
                    .map(([vendedor, count]) => (
                      <div
                        key={vendedor}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-200"
                      >
                        <span
                          className="font-medium text-slate-800 truncate max-w-[180px]"
                          title={vendedor}
                        >
                          {vendedor}
                        </span>
                        <Badge variant="outline" className="font-mono bg-white text-slate-700">
                          {count} ocorrências
                        </Badge>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* MODAL DE DRILL-DOWN: CLIENTES DO MOTIVO SELECIONADO NO BLOCO 2 */}
      {motivoDrillDown && (
        <Dialog
          open={Boolean(motivoDrillDown)}
          onOpenChange={(open) => !open && setMotivoDrillDown(null)}
        >
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-slate-100">
                    {renderIconMotivo(motivoDrillDown.icone)}
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold text-slate-900">
                      Drill-Down: {motivoDrillDown.titulo}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      {motivoDrillDown.descricao} •{' '}
                      <strong>{motivoDrillDown.clientes.length}</strong> clientes identificados
                      neste diagnóstico
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Barra de busca interna no modal */}
            <div className="pt-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por código, nome do cliente, vendedor ou operador..."
                  value={drillDownSearch}
                  onChange={(e) => setDrillDownSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Tabela de clientes no drill-down */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg mt-2">
              {(() => {
                const list = motivoDrillDown.clientes.filter((c) => {
                  if (!drillDownSearch.trim()) return true
                  const q = drillDownSearch.toLowerCase()
                  return (
                    c.codigo.toLowerCase().includes(q) ||
                    c.nome.toLowerCase().includes(q) ||
                    (c.vendedorOrigem || '').toLowerCase().includes(q) ||
                    c.operadorNome.toLowerCase().includes(q) ||
                    c.regiao.toLowerCase().includes(q) ||
                    c.respostaBruta.toLowerCase().includes(q)
                  )
                })

                if (list.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Nenhum cliente corresponde à busca informada.
                    </div>
                  )
                }

                return (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Código / Cliente</th>
                        <th className="py-2.5 px-3">Região & Vendedor</th>
                        <th className="py-2.5 px-3">Origem / Resposta no Form</th>
                        <th className="py-2.5 px-3">Operador</th>
                        <th className="py-2.5 px-3 text-right">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-blue-700 block">
                              {c.codigo}
                            </span>
                            <span className="font-medium text-slate-900 block">{c.nome}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <span className="font-medium block">{c.regiao}</span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[150px]">
                              {c.vendedorOrigem}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 max-w-xs">
                            <Badge variant="outline" className="text-[9px] mb-1">
                              {c.perguntaOrigem}
                            </Badge>
                            <p className="text-[11px] text-slate-800 font-medium">
                              {c.respostaBruta}
                            </p>
                            {c.observacao && (
                              <p className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-2">
                                Obs: {c.observacao}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                            {c.operadorNome}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            {new Date(c.dataRegistro).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO PRINCIPAL DE AUDITORIA: CLIENTES ATIVOS REMOVIDOS DA BASE */}
      {/* ========================================================================= */}
      <Card className="border-emerald-300/80 shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white border-b border-emerald-100 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <CardTitle className="text-base font-bold text-slate-900">
                      Auditoria: Clientes Ativos Removidos da Base de Inativos
                    </CardTitle>
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs px-2 py-0.5">
                      {loadingAtendimentos ? '...' : `${ativosRemovidosFiltrados.length} listados`}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-600">
                    Cadastros que continuam comprando por CPF de terceiro, CNPJ coligada ou
                    acompanhamento de vendedor, removidos permanentemente da base para proteger as
                    metas e não poluir a fila.
                  </CardDescription>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportAtivosRemovidosCSV}
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white h-8 text-xs font-semibold shadow-xs"
                disabled={loadingAtendimentos || ativosRemovidosFiltrados.length === 0}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Exportar Auditoria CSV ({ativosRemovidosFiltrados.length})
              </Button>
            </div>
          </div>

          {/* Cards Rápidos de Breakdown por Categoria nesta Seção */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3">
            {Object.entries(ativosRemovidosData.breakdown || {}).map(([motivo, count]) => {
              const perc =
                ativosRemovidosData.total > 0
                  ? Math.round((count / ativosRemovidosData.total) * 100)
                  : 0
              const isSelected = filtroMotivoAtivos === motivo
              return (
                <button
                  key={motivo}
                  type="button"
                  onClick={() => setFiltroMotivoAtivos(isSelected ? 'todos' : motivo)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 truncate" title={motivo}>
                      {motivo}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 ml-1">{count}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                    <span>{perc}% do total</span>
                    <span className="text-emerald-600 font-medium">
                      {isSelected ? 'Filtrado' : 'Filtrar'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Barra de Filtros Internos da Tabela */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-emerald-100/60 mt-1">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, código, região ou operador..."
                value={buscaAtivos}
                onChange={(e) => setBuscaAtivos(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
              {filtroMotivoAtivos !== 'todos' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFiltroMotivoAtivos('todos')}
                  className="h-7 text-xs text-slate-500 hover:text-slate-800 px-2"
                >
                  Limpar filtro ({filtroMotivoAtivos})
                </Button>
              )}
              <span className="text-[11px] text-slate-500">
                Mostrando{' '}
                <strong className="text-slate-700">{ativosRemovidosFiltrados.length}</strong> de{' '}
                <strong className="text-slate-700">{ativosRemovidosData.total}</strong>
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingAtendimentos ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Carregando registros de clientes ativos removidos...
            </div>
          ) : ativosRemovidosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Nenhum cliente ativo removido encontrado para os filtros selecionados (
              {selectedPeriodo === 'hoje'
                ? 'Hoje'
                : selectedPeriodo === '7dias'
                  ? '7 dias'
                  : selectedPeriodo === '30dias'
                    ? '30 dias'
                    : 'Total'}
              {selectedRegiao !== 'todas' ? ` • ${selectedRegiao}` : ''}).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Código</th>
                    <th className="py-3 px-3.5">Cliente</th>
                    <th className="py-3 px-3.5">Região</th>
                    <th className="py-3 px-3.5">Motivo da Ativação / Limpeza</th>
                    <th className="py-3 px-3.5">Observação / Detalhe</th>
                    <th className="py-3 px-3.5">Operador Responsável</th>
                    <th className="py-3 px-3.5 text-right">Data Remoção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ativosRemovidosFiltrados.map((item) => (
                    <tr key={item.id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {item.codigo}
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-slate-900">
                        <div className="font-semibold">{item.nome}</div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-slate-700 border-slate-300 text-[10px] whitespace-nowrap font-normal"
                        >
                          {item.regiao}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <Badge
                          className={`text-[10px] font-medium whitespace-nowrap ${
                            item.motivo_categoria === 'Compra por CPF de terceiro'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : item.motivo_categoria.includes('CNPJ')
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                : item.motivo_categoria.includes('Acompanhamento')
                                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {item.motivo_categoria}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 max-w-xs">
                        <span className="line-clamp-2" title={item.motivo_completo}>
                          {item.observacao || item.motivo_completo}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 whitespace-nowrap font-medium">
                        {item.operador_nome}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-500 whitespace-nowrap">
                        {new Date(item.data_remocao).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(item.data_remocao).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Relatório de Divergências de Pedidos Informados */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="py-3 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Auditoria e Divergências de Pedidos Reativados</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Validação cruzada dos números de pedido digitados pelo operador contra as planilhas
            reais importadas do ERP
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {importacoes.flatMap((imp) => imp.divergencias_pedidos || []).length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Nenhuma divergência registrada. Todos os pedidos confirmados foram validados com
              sucesso nas planilhas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Pedido Declarado pelo Operador</th>
                    <th className="py-2.5 px-3">Pedido Faturado no ERP</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importacoes
                    .flatMap((imp) => imp.divergencias_pedidos || [])
                    .map((div, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">
                          {div.codigo}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-medium">{div.nome}</td>
                        <td className="py-2 px-3 font-mono text-amber-700">{div.pedidoEsperado}</td>
                        <td className="py-2 px-3 font-mono text-rose-600 font-bold">
                          {div.pedidoPlanilha}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]"
                          >
                            Divergência
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
