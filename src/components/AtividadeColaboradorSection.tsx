import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2,
  PhoneForwarded,
  CalendarCheck,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter,
  Users,
  MapPin,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchListasColaborador } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

interface AtividadeColaboradorSectionProps {
  regioesList?: string[]
  operadoresList?: string[]
  selectedRegiaoDefault?: string
}

export const AtividadeColaboradorSection: React.FC<AtividadeColaboradorSectionProps> = ({
  regioesList = [],
  operadoresList = [],
  selectedRegiaoDefault = 'todas',
}) => {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Aba ativa interna da atividade
  const [subAba, setSubAba] = useState<'reativados' | 'reagendados' | 'followups'>('reativados')

  // Filtros
  const [regiao, setRegiao] = useState<string>(selectedRegiaoDefault)
  const [operador, setOperador] = useState<string>('todos')
  const [busca, setBusca] = useState<string>('')

  // Estado dos dados
  const [loading, setLoading] = useState<boolean>(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<{
    scope: { role: string; userId: string; userName: string; regioes: string[] }
    totais: { reativados: number; reagendados: number; followups: number }
    reativados: Array<{
      id: string
      codigo: string
      nome: string
      cidade: string
      regiao: string
      vendedorOrigem: string
      operadorResponsavel: string
      pedido: string
      valor: number
      data: string
      dataFormatada: string
    }>
    reagendados: Array<{
      id: string
      codigo: string
      nome: string
      cidade: string
      regiao: string
      vendedorOrigem: string
      operadorResponsavel: string
      dataAtendimento: string
      dataAtendimentoFormatada: string
      reagendadoPara: string
      reagendadoParaFormatada: string
      motivo: string
    }>
    followups: Array<{
      id: string
      codigo: string
      nome: string
      cidade: string
      regiao: string
      vendedorOrigem: string
      telefone: string
      operadorResponsavel: string
      dataRetorno: string
      dataRetornoFormatada: string
      estado: string
    }>
  } | null>(null)

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetchListasColaborador({
        regiao: regiao !== 'todas' ? regiao : undefined,
        operador: operador !== 'todos' ? operador : undefined,
        tipo: 'todas',
        limit: 250,
      })
      setDados(res)
    } catch (err: any) {
      console.error('Falha ao buscar listas de atividade:', err)
      setErro(err?.message || 'Falha ao carregar listas do colaborador.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiao, operador])

  const abrirFichaCliente = (clienteId: string) => {
    if (!clienteId) return
    navigate(`/atendimento/${clienteId}`)
  }

  // Filtragem local por texto de busca (nome, código ou cidade)
  const q = busca.trim().toLowerCase()

  const reativadosFiltrados = (dados?.reativados || []).filter((item) => {
    if (!q) return true
    return (
      item.nome?.toLowerCase().includes(q) ||
      item.codigo?.toLowerCase().includes(q) ||
      item.cidade?.toLowerCase().includes(q) ||
      item.pedido?.toLowerCase().includes(q) ||
      item.operadorResponsavel?.toLowerCase().includes(q)
    )
  })

  const reagendadosFiltrados = (dados?.reagendados || []).filter((item) => {
    if (!q) return true
    return (
      item.nome?.toLowerCase().includes(q) ||
      item.codigo?.toLowerCase().includes(q) ||
      item.cidade?.toLowerCase().includes(q) ||
      item.motivo?.toLowerCase().includes(q) ||
      item.operadorResponsavel?.toLowerCase().includes(q)
    )
  })

  const followupsFiltrados = (dados?.followups || []).filter((item) => {
    if (!q) return true
    return (
      item.nome?.toLowerCase().includes(q) ||
      item.codigo?.toLowerCase().includes(q) ||
      item.cidade?.toLowerCase().includes(q) ||
      item.telefone?.toLowerCase().includes(q) ||
      item.operadorResponsavel?.toLowerCase().includes(q)
    )
  })

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  const roleDescricao = () => {
    const r = user?.role || 'operador'
    if (r === 'admin') return 'Visão Executiva Completa (todos os operadores e regiões)'
    if (r === 'supervisor') return 'Visão de Supervisão (todas as rotas e carteiras)'
    if (r === 'lider') return `Líder de Rota (${user?.regioes?.join(', ') || 'sua rota'})`
    return 'Seu Escopo Pessoal (suas reativações, reagendamentos e carteira)'
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="py-4 px-4 sm:px-6 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Atividade por Colaborador
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-[#253575]/10 text-[#253575] border-[#253575]/20 text-xs font-semibold"
              >
                {roleDescricao()}
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Listas detalhadas com acesso imediato à ficha completa do cliente. Clique em qualquer
              registro para abrir o atendimento.
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="h-8 text-xs text-slate-600 hover:text-[#253575] shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Listas
          </Button>
        </div>

        {/* 3 Cartões de seleção de lista com contadores */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
          {/* Card Reativados */}
          <div
            onClick={() => setSubAba('reativados')}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
              subAba === 'reativados'
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/30 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  subAba === 'reativados'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Reativados</div>
                <div className="text-[11px] text-slate-500">Com atendimento real</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-emerald-700 font-mono">
                {loading ? '…' : (dados?.totais.reativados ?? 0)}
              </span>
            </div>
          </div>

          {/* Card Reagendados */}
          <div
            onClick={() => setSubAba('reagendados')}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
              subAba === 'reagendados'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/30 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  subAba === 'reagendados'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <PhoneForwarded className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Reagendados</div>
                <div className="text-[11px] text-slate-500">Contatos remarcados</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-amber-700 font-mono">
                {loading ? '…' : (dados?.totais.reagendados ?? 0)}
              </span>
            </div>
          </div>

          {/* Card Follow-ups */}
          <div
            onClick={() => setSubAba('followups')}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
              subAba === 'followups'
                ? 'bg-purple-50/90 border-purple-300 ring-2 ring-purple-500/30 shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  subAba === 'followups'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-100 text-purple-700'
                }`}
              >
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Follow-ups</div>
                <div className="text-[11px] text-slate-500">Datas de retorno</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-purple-700 font-mono">
                {loading ? '…' : (dados?.totais.followups ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Barra de Busca e Filtros de Escopo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar por nome, código, cidade, pedido ou operador..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9 pl-9 text-xs bg-slate-50 border-slate-200 focus-visible:ring-1 focus-visible:ring-[#253575]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de Região (apenas se admin/supervisor ou líder com múltiplas) */}
            {(user?.role === 'admin' || user?.role === 'supervisor') && regioesList.length > 0 && (
              <div className="w-40">
                <Select value={regiao} onValueChange={setRegiao}>
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
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
            )}

            {/* Filtro de Operador (apenas admin/supervisor/líder) */}
            {(user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'lider') &&
              operadoresList.length > 0 && (
                <div className="w-44">
                  <Select value={operador} onValueChange={setOperador}>
                    <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
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
              )}
          </div>
        </div>

        {/* Estado de Erro */}
        {erro && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{erro}</span>
          </div>
        )}

        {/* Tabela da Aba Selecionada */}
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-2 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-[#253575]" />
            <span className="text-xs">Carregando lista do colaborador...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {/* ABA 1: REATIVADOS */}
            {subAba === 'reativados' && (
              <div>
                {reativadosFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    Nenhum cliente reativado encontrado no escopo selecionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Cidade / Rota</th>
                          <th className="py-2.5 px-3">Operador / Vendedor</th>
                          <th className="py-2.5 px-3">Pedido / Valor</th>
                          <th className="py-2.5 px-3">Data Reativação</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {reativadosFiltrados.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => abrirFichaCliente(item.id)}
                            className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 group-hover:text-[#253575] flex items-center space-x-1.5">
                                <span>{item.nome}</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Cód: {item.codigo || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-700 font-medium">{item.cidade || '—'}</div>
                              <div className="text-[11px] text-slate-500">
                                {item.regiao || 'Sem Região'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">
                                {item.operadorResponsavel || '—'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Origem: {item.vendedorOrigem || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-emerald-700 font-mono">
                                {formatCurrency(item.valor)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Pedido: {item.pedido || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-mono">
                              {item.dataFormatada || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirFichaCliente(item.id)
                                }}
                                className="h-7 px-2.5 text-xs text-[#253575] hover:text-[#1a2758] hover:bg-blue-50"
                              >
                                <span>Ver Ficha</span>
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ABA 2: REAGENDADOS */}
            {subAba === 'reagendados' && (
              <div>
                {reagendadosFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    Nenhum compromisso reagendado no escopo selecionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Cidade / Rota</th>
                          <th className="py-2.5 px-3">Operador / Vendedor</th>
                          <th className="py-2.5 px-3">Reagendado Para</th>
                          <th className="py-2.5 px-3">Motivo / Conteúdo</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {reagendadosFiltrados.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => abrirFichaCliente(item.id)}
                            className="hover:bg-amber-50/40 cursor-pointer transition-colors group"
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 group-hover:text-[#253575]">
                                {item.nome}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Cód: {item.codigo || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-700 font-medium">{item.cidade || '—'}</div>
                              <div className="text-[11px] text-slate-500">
                                {item.regiao || 'Sem Região'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">
                                {item.operadorResponsavel || '—'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Origem: {item.vendedorOrigem || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-800 border-amber-300 font-mono text-[11px]"
                              >
                                {item.reagendadoParaFormatada || item.reagendadoPara || '—'}
                              </Badge>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Atendido: {item.dataAtendimentoFormatada || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs">
                              <div className="text-slate-700 truncate font-medium">
                                {item.motivo || 'Reagendamento de contato'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirFichaCliente(item.id)
                                }}
                                className="h-7 px-2.5 text-xs text-[#253575] hover:text-[#1a2758] hover:bg-blue-50"
                              >
                                <span>Ver Ficha</span>
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: FOLLOW-UPS */}
            {subAba === 'followups' && (
              <div>
                {followupsFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    Nenhum follow-up programado no escopo selecionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Cidade / Rota</th>
                          <th className="py-2.5 px-3">Telefone / Contato</th>
                          <th className="py-2.5 px-3">Responsável</th>
                          <th className="py-2.5 px-3">Data de Retorno</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {followupsFiltrados.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => abrirFichaCliente(item.id)}
                            className="hover:bg-purple-50/40 cursor-pointer transition-colors group"
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900 group-hover:text-[#253575]">
                                {item.nome}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Cód: {item.codigo || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-700 font-medium">{item.cidade || '—'}</div>
                              <div className="text-[11px] text-slate-500">
                                {item.regiao || 'Sem Região'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {item.telefone || 'Sem telefone'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">
                                {item.operadorResponsavel || '—'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Carteira: {item.vendedorOrigem || '—'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge
                                variant="outline"
                                className="bg-purple-50 text-purple-800 border-purple-300 font-mono text-[11px]"
                              >
                                {item.dataRetornoFormatada || item.dataRetorno || '—'}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirFichaCliente(item.id)
                                }}
                                className="h-7 px-2.5 text-xs text-[#253575] hover:text-[#1a2758] hover:bg-blue-50"
                              >
                                <span>Ver Ficha</span>
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AtividadeColaboradorSection
