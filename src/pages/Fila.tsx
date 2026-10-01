import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListOrdered,
  Play,
  Lock,
  Search,
  Filter,
  Phone,
  Sparkles,
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { fetchClientes, reserveNextQueueClient, updateCliente, fetchRegioes } from '@/services/api'
import type { Cliente, Regiao } from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'

export default function FilaPage() {
  const { user, hasRole, hasRegiaoAccess } = useAuth()
  const navigate = useNavigate()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])
  const [loading, setLoading] = useState(true)
  const [reserving, setReserving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRegiao, setSelectedRegiao] = useState<string>('todas')
  const [filterFaixa, setFilterFaixa] = useState<string>('todas')

  useEffect(() => {
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadQueue()
    }
  }, [user])

  if (user?.role === 'operador' || user?.role === 'lider') {
    return null
  }

  const loadQueue = async () => {
    setLoading(true)
    try {
      const [res, resRegioes] = await Promise.all([
        fetchClientes({ perPage: 100, sort: '-score' }),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setClientes(res.items)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err) {
      console.error('Erro ao buscar fila:', err)
    } finally {
      setLoading(false)
    }
  }

  // Puxar Novo Contato com Lock Atômico
  const handleNovoContato = async () => {
    setReserving(true)
    try {
      const res = await reserveNextQueueClient()
      if (res.cliente) {
        // Redireciona imediatamente para a tela de atendimento do cliente bloqueado
        navigate(`/atendimento/${res.cliente.id}`)
      } else {
        alert(res.message || 'Nenhum cliente disponível na fila no momento.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao reservar cliente'
      alert(`Erro: ${msg}`)
    } finally {
      setReserving(false)
    }
  }

  // Filtragem local
  const filtered = clientes.filter((c) => {
    // Permissão de região: operador só enxerga as suas
    if (!hasRegiaoAccess(c.regiao)) return false

    if (selectedRegiao !== 'todas' && c.regiao !== selectedRegiao) return false
    if (filterFaixa !== 'todas' && c.faixa !== filterFaixa) return false

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchCod = c.codigo.toLowerCase().includes(term)
      const matchNome = c.nome.toLowerCase().includes(term)
      const matchTel = c.telefone?.includes(term) || c.whatsapp?.includes(term)
      if (!matchCod && !matchNome && !matchTel) return false
    }

    return true
  })

  // Priorização pelo supervisor (+20 no score)
  const handleBoostScore = async (cliente: Cliente) => {
    try {
      await updateCliente(cliente.id, {
        score: Math.min(100, (cliente.score || 0) + 20),
      })
      loadQueue()
    } catch (err) {
      console.error('Erro ao priorizar:', err)
    }
  }

  const getFaixaBadge = (faixa: string, dias?: number) => {
    if (faixa === '90_plus') {
      return (
        <Badge variant="outline" className="border-rose-400 text-rose-700 bg-rose-50 text-[10px]">
          90+ dias ({dias || 90}d)
        </Badge>
      )
    }
    if (faixa === '60_89') {
      return (
        <Badge
          variant="outline"
          className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]"
        >
          60-89 dias ({dias || 60}d)
        </Badge>
      )
    }
    return (
      <Badge
        variant="outline"
        className="border-emerald-400 text-emerald-700 bg-emerald-50 text-[10px]"
      >
        Recente
      </Badge>
    )
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'reservado':
      case 'em_atendimento':
        return (
          <Badge className="bg-purple-600 text-white text-[10px]">
            <Lock className="h-3 w-3 mr-1" />
            Em Atendimento
          </Badge>
        )
      case 'reagendado':
        return <Badge className="bg-amber-600 text-white text-[10px]">Reagendado</Badge>
      case 'reativado':
        return <Badge className="bg-emerald-600 text-white text-[10px]">Reativado</Badge>
      case 'sem_contato':
        return <Badge className="bg-slate-500 text-white text-[10px]">Sem Contato</Badge>
      default:
        return (
          <Badge
            variant="outline"
            className="border-[#253575]/30 text-[#253575] bg-[#253575]/10 text-[10px] font-semibold"
          >
            Na Fila
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Header Card com Azul Petróleo / Azul ABR e Curva Laranja */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#142758] via-[#1d2d66] to-[#253575] rounded-2xl p-6 text-white shadow-xl shadow-[#142758]/20 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-white/10">
        {/* Grafismo curva sutil de fundo */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#F18800]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 h-1.5 w-full bg-[#142758]">
          <div className="h-full w-36 bg-[#F18800] rounded-r-full" />
        </div>

        <div className="space-y-1.5 max-w-xl relative z-10 pt-1">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs uppercase font-bold tracking-wider text-orange-300">
              Motor de Fila & Lock Atômico
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Fila Dinâmica de Atendimento
          </h2>
          <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed">
            Clique no botão ao lado para retirar atomicamente o próximo contato prioritário
            (Reagendados do dia ou maior score regional) sem concorrência com outros operadores.
          </p>
        </div>

        <div className="shrink-0 flex items-center space-x-3 relative z-10">
          <Button
            size="lg"
            onClick={handleNovoContato}
            disabled={reserving}
            className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold px-6 py-6 text-sm shadow-lg shadow-[#F18800]/30 active:scale-95 transition-all"
          >
            {reserving ? (
              <>
                <Clock className="mr-2 h-5 w-5 animate-spin" />
                Bloqueando Contato...
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5 fill-current" />
                Novo Contato da Fila
              </>
            )}
          </Button>
        </div>
      </div>
      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por código, nome ou fone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Região */}
          <Select value={selectedRegiao} onValueChange={setSelectedRegiao}>
            <SelectTrigger className="h-9 text-xs w-44">
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

          {/* Faixa */}
          <Select value={filterFaixa} onValueChange={setFilterFaixa}>
            <SelectTrigger className="h-9 text-xs w-36">
              <SelectValue placeholder="Faixa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Faixas</SelectItem>
              <SelectItem value="90_plus">90+ dias sem faturar</SelectItem>
              <SelectItem value="60_89">60-89 dias</SelectItem>
              <SelectItem value="recente">Recente (&lt; 60d)</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={loadQueue} className="h-9 text-xs">
            Atualizar
          </Button>
        </div>
      </div>

      {/* Queue Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                <ListOrdered className="h-4 w-4 text-[#253575]" />
                <span>Posições da Fila Regional</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Ordenada por Score de Recuperação e Regras de Priorização
              </CardDescription>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {filtered.length} contatos disponíveis
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Carregando posições da fila...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Nenhum cliente aguardando na fila com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-3 px-3">Código</th>
                    <th className="py-3 px-3">Cliente / Razão Social</th>
                    <th className="py-3 px-3">Região & Vendedor</th>
                    <th className="py-3 px-3">Inatividade</th>
                    <th className="py-3 px-3 text-center">Score</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {item.codigo}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 max-w-[220px] truncate">
                        <div>{item.nome}</div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {item.segmento || 'Segmento não informado'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <div className="font-medium text-slate-700">{item.regiao}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.vendedor || 'Sem vendedor'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {getFaixaBadge(item.faixa, item.dias_sem_faturar)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-[#253575]/10 text-[#253575] border border-[#253575]/20">
                          {item.score || 0} pts
                        </div>
                      </td>
                      <td className="py-3 px-3">{getEstadoBadge(item.estado)}</td>
                      <td className="py-3 px-3 text-right space-x-2">
                        {/* Supervisor pode impulsionar */}
                        {hasRole(['supervisor', 'admin']) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleBoostScore(item)}
                            title="Aumentar prioridade (+20 pts)"
                            className="h-7 text-[11px] text-slate-600 hover:text-amber-600"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1" />
                            +20
                          </Button>
                        )}

                        <Button
                          size="sm"
                          onClick={() => navigate(`/atendimento/${item.id}`)}
                          className="h-7 text-xs bg-[#253575] hover:bg-[#1e2b5e] text-white font-medium shadow-xs"
                        >
                          Iniciar
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
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
