import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  Download,
  Filter,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  Building2,
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
  fetchClientesAtivosRemovidos,
} from '@/services/api'
import type {
  Cliente,
  Importacao,
  Regiao,
  PeriodoAtendimentoFiltro,
  MetricasAtivosRemovidos,
} from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'
import { ShieldCheck, Calendar, Search } from 'lucide-react'

import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function RelatoriosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])
  const [loading, setLoading] = useState(true)
  const [selectedRegiao, setSelectedRegiao] = useState<string>('todas')
  const [selectedPeriodo, setSelectedPeriodo] = useState<PeriodoAtendimentoFiltro>('total')
  const [ativosRemovidos, setAtivosRemovidos] = useState<MetricasAtivosRemovidos>({
    total: 0,
    breakdown: {},
    itens: [],
  })
  const [loadingAtivos, setLoadingAtivos] = useState(false)
  const [buscaAtivos, setBuscaAtivos] = useState('')
  const [filtroMotivoAtivos, setFiltroMotivoAtivos] = useState<string>('todos')

  useEffect(() => {
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadData()
      loadAtivosRemovidos()
    }
  }, [user])

  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadAtivosRemovidos()
    }
  }, [selectedRegiao, selectedPeriodo])

  const loadAtivosRemovidos = async () => {
    setLoadingAtivos(true)
    try {
      const res = await fetchClientesAtivosRemovidos({
        regiao: selectedRegiao !== 'todas' ? selectedRegiao : undefined,
        periodo: selectedPeriodo,
      })
      setAtivosRemovidos(res)
    } catch (err) {
      console.error('Erro ao carregar clientes ativos removidos:', err)
    } finally {
      setLoadingAtivos(false)
    }
  }

  if (user?.role === 'operador' || user?.role === 'lider') {
    return null
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [resC, resI, resRegioes] = await Promise.all([
        fetchClientes({ perPage: 250 }),
        fetchImportacoes(),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setClientes(resC.items)
      setImportacoes(resI)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = clientes.filter((c) => {
    if (selectedRegiao !== 'todas' && c.regiao !== selectedRegiao) return false
    return true
  })

  // Agrupamento de Motivos de Perda / Não Reativação
  const perdasPorMotivo: Record<string, number> = {}
  filtered.forEach((c) => {
    if (['compra_terceiros', 'nao_quer_negociar', 'sem_contato'].includes(c.estado)) {
      const label =
        c.estado === 'compra_terceiros'
          ? 'Comprando de Terceiros / Concorrente'
          : c.estado === 'nao_quer_negociar'
            ? 'Recusa Formal / Não Quer Negociar'
            : 'Sem Contato (Telefone Inválido ou Caixa)'
      perdasPorMotivo[label] = (perdasPorMotivo[label] || 0) + 1
    }
  })

  // Produtividade e Conversão por Região
  const regioesMetricas: Record<
    string,
    { total: number; reativados: number; valorTotal: number; toneladas: number }
  > = {}
  filtered.forEach((c) => {
    const reg = c.regiao || 'Sem Região'
    if (!regioesMetricas[reg]) {
      regioesMetricas[reg] = { total: 0, reativados: 0, valorTotal: 0, toneladas: 0 }
    }
    regioesMetricas[reg].total += 1
    if (c.estado === 'reativado') {
      regioesMetricas[reg].reativados += 1
      regioesMetricas[reg].valorTotal += c.valor_ultima_compra || 0
      regioesMetricas[reg].toneladas += c.toneladas_historico || 0
    }
  })

  // Divergências de Pedidos Reativados
  const divergencias = importacoes.flatMap((imp) => imp.divergencias_pedidos || [])

  // Exportar Relatório para CSV
  const handleExportCSV = () => {
    let csv =
      'Codigo;Nome;Regiao;Vendedor;Segmento;Dias_Sem_Faturar;Faixa;Score;Status;Valor_Recuperado\n'
    filtered.forEach((c) => {
      csv += `${c.codigo};${c.nome};${c.regiao};${c.vendedor || ''};${c.segmento || ''};${
        c.dias_sem_faturar || 0
      };${c.faixa};${c.score || 0};${c.estado};${c.estado === 'reativado' ? c.valor_ultima_compra || 0 : 0}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `relatorio_reativacao_guerra_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  // Filtragem local dos clientes ativos removidos
  const ativosRemovidosFiltrados = (ativosRemovidos.itens || []).filter((item) => {
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

  // Exportar especificamente a Auditoria de Clientes Ativos Removidos para CSV
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Relatórios e Auditoria da Operação
          </h2>
          <p className="text-xs text-slate-500">
            Métricas de conversão, conciliação e auditoria detalhada de clientes ativos removidos da
            base de inativos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de Período */}
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-md px-2 py-0.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <Select
              value={selectedPeriodo}
              onValueChange={(v) => setSelectedPeriodo(v as PeriodoAtendimentoFiltro)}
            >
              <SelectTrigger className="h-7 text-xs border-0 shadow-none px-1 w-32 focus:ring-0">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                <SelectItem value="total">Acumulado Total</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Região */}
          <Select value={selectedRegiao} onValueChange={setSelectedRegiao}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Região" />
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
          <Button
            onClick={handleExportCSV}
            size="sm"
            variant="outline"
            className="border-slate-300 text-slate-700 h-8 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar Geral CSV
          </Button>
        </div>
      </div>

      {/* Grid de Desempenho Regional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span>Desempenho por Território Regional</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Taxa de recuperação e valores faturados por região
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(regioesMetricas).map(([reg, item]) => {
                const taxa = item.total > 0 ? Math.round((item.reativados / item.total) * 100) : 0
                return (
                  <div
                    key={reg}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">{reg}</span>
                      <span className="font-mono text-emerald-600 font-semibold">
                        R$ {item.valorTotal.toLocaleString('pt-BR')} ({item.toneladas} ton)
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>
                        {item.reativados} de {item.total} clientes reativados
                      </span>
                      <span>Conversão: {taxa}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.max(taxa, item.reativados > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Motivos de Perda */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>Principais Motivos de Perda e Desistência</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Causas de insucesso apontadas durante o contato
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(perdasPorMotivo).length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                Nenhuma perda catalogada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(perdasPorMotivo).map(([motivo, count]) => (
                  <div
                    key={motivo}
                    className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-xs font-medium text-rose-900">{motivo}</span>
                    <Badge
                      variant="outline"
                      className="border-rose-400 text-rose-700 bg-white font-mono text-xs"
                    >
                      {count} clientes
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO PRINCIPAL: AUDITORIA DE CLIENTES ATIVOS REMOVIDOS DA BASE */}
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
                      Clientes Ativos Removidos da Base de Inativos
                    </CardTitle>
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs px-2 py-0.5">
                      {loadingAtivos ? '...' : `${ativosRemovidosFiltrados.length} listados`}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-600">
                    Registros identificados em atendimento como faturando regularmente (via CPF de
                    terceiro, CNPJ coligada ou acompanhamento de vendedor) e retirados da fila.
                  </CardDescription>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportAtivosRemovidosCSV}
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white h-8 text-xs font-semibold shadow-xs"
                disabled={loadingAtivos || ativosRemovidosFiltrados.length === 0}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Exportar Auditoria CSV ({ativosRemovidosFiltrados.length})
              </Button>
            </div>
          </div>

          {/* Cards Rápidos de Breakdown por Categoria nesta Seção */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3">
            {Object.entries(ativosRemovidos.breakdown || {}).map(([motivo, count]) => {
              const perc =
                ativosRemovidos.total > 0 ? Math.round((count / ativosRemovidos.total) * 100) : 0
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
                <strong className="text-slate-700">{ativosRemovidos.total}</strong>
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingAtivos ? (
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
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Auditoria e Divergências de Pedidos Reativados</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Validação cruzada dos números de pedido digitados pelo operador contra as planilhas
            reais importadas do ERP
          </CardDescription>
        </CardHeader>
        <CardContent>
          {divergencias.length === 0 ? (
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
                  {divergencias.map((div, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{div.codigo}</td>
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
