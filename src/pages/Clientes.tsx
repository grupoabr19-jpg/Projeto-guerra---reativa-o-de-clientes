import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Search,
  Filter,
  Phone,
  Eye,
  Building2,
  Calendar,
  Lock,
  RotateCcw,
  Sparkles,
  ArrowRight,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  fetchClientes,
  updateCliente,
  fetchInteracoesByCliente,
  fetchRegioes,
} from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import type { Cliente, Interacao, Regiao } from '@/types'
import { TODAS_REGIOES_FILTRO } from '@/types'
import { toast } from '@/hooks/use-toast'

export default function ClientesPage() {
  const { user, hasRole, hasRegiaoAccess } = useAuth()
  const navigate = useNavigate()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...TODAS_REGIOES_FILTRO])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRegiao, setSelectedRegiao] = useState<string>('todas')
  const [selectedEstado, setSelectedEstado] = useState<string>('todos')
  const [selectedCategoria, setSelectedCategoria] = useState<string>('todas')

  // Paginação Real Server-Side
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  // Gaveta de Detalhes
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
  const [clientInteractions, setClientInteractions] = useState<Interacao[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  // Carregar lista de regiões na montagem inicial
  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      fetchRegioes()
        .then((resRegioes) => {
          if (resRegioes.length > 0) {
            setRegioesList(resRegioes.map((r) => r.nome))
          }
        })
        .catch(() => {})
    }
  }, [user])

  // Recarregar clientes no servidor sempre que filtros, busca ou página mudarem
  useEffect(() => {
    if (user && user.role !== 'operador' && user.role !== 'lider') {
      loadClientesServer()
    }
  }, [user, page, perPage, selectedRegiao, selectedEstado, selectedCategoria, searchTerm])

  if (user?.role === 'operador' || user?.role === 'lider') {
    return null
  }

  const loadClientesServer = async () => {
    setLoading(true)
    try {
      // Regiões permitidas para líderes / supervisores de rota específica
      let allowedRegioes: string[] | undefined = undefined
      if (user?.role === 'supervisor' && user.regioes && user.regioes.length > 0) {
        allowedRegioes = user.regioes
      }

      const res = await fetchClientes({
        page,
        perPage,
        searchTerm: searchTerm.trim() || undefined,
        regiao: selectedRegiao !== 'todas' ? selectedRegiao : undefined,
        estado: selectedEstado !== 'todos' ? selectedEstado : undefined,
        categoria: selectedCategoria !== 'todas' ? selectedCategoria : undefined,
        allowedRegioes,
      })

      setClientes(res.items)
      setTotalItems(res.totalItems)
      setTotalPages(res.totalPages || Math.ceil(res.totalItems / perPage) || 1)
    } catch (err) {
      console.error('Falha ao buscar clientes paginados:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar clientes',
        description: 'Não foi possível carregar a lista de clientes do servidor.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (val: string) => {
    setSearchTerm(val)
    setPage(1)
  }

  const handleRegiaoChange = (val: string) => {
    setSelectedRegiao(val)
    setPage(1)
  }

  const handleEstadoChange = (val: string) => {
    setSelectedEstado(val)
    setPage(1)
  }

  const handleCategoriaChange = (val: string) => {
    setSelectedCategoria(val)
    setPage(1)
  }

  const handleOpenDetails = async (client: Cliente) => {
    setSelectedClient(client)
    setLoadingDetails(true)
    try {
      const inter = await fetchInteracoesByCliente(client.id)
      setClientInteractions(inter)
    } catch (err) {
      console.error('Erro ao buscar histórico do cliente:', err)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Reversão de status pelo supervisor (ex: compra_terceiros para na_base)
  const handleReverterStatus = async (novoEstado: string) => {
    if (!selectedClient) return
    try {
      await updateCliente(selectedClient.id, {
        estado: novoEstado as any,
      })
      setSelectedClient({ ...selectedClient, estado: novoEstado as any })
      loadClientesServer()
      toast({
        title: 'Status atualizado',
        description: 'Status revertido pelo supervisor com sucesso.',
      })
    } catch (err) {
      console.error('Erro ao reverter status:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao reverter',
        description: 'Não foi possível alterar o status do cliente.',
      })
    }
  }

  // Clientes já vêm filtrados e paginados diretamente do servidor PocketBase
  const filtered = clientes

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Base de Clientes & Carteira
          </h2>
          <p className="text-xs text-slate-500">
            Consulta completa com governança por região e histórico unificado de interações.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadClientesServer} className="h-8 text-xs">
          Atualizar Lista
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar no servidor (código, nome, telefone, CPF/CNPJ)..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Região */}
          <Select value={selectedRegiao} onValueChange={handleRegiaoChange}>
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

          {/* Estado */}
          <Select value={selectedEstado} onValueChange={handleEstadoChange}>
            <SelectTrigger className="h-9 text-xs w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="na_base">Na Base</SelectItem>
              <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
              <SelectItem value="reativado">Reativado</SelectItem>
              <SelectItem value="reagendado">Reagendado</SelectItem>
              <SelectItem value="contatado">Contatado</SelectItem>
              <SelectItem value="compra_terceiros">Compra Terceiros</SelectItem>
              <SelectItem value="nao_quer_negociar">Não Quer Negociar</SelectItem>
              <SelectItem value="sem_contato">Sem Contato</SelectItem>
            </SelectContent>
          </Select>

          {/* Categoria de Base (Frentes 2, 3 e 4) */}
          <Select value={selectedCategoria} onValueChange={handleCategoriaChange}>
            <SelectTrigger className="h-9 text-xs w-52 border-[#253575]/30 bg-blue-50/20 font-medium text-slate-800">
              <SelectValue placeholder="Base / Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Bases</SelectItem>
              <SelectItem value="normal">🎯 Base Normal (Elegível Fila)</SelectItem>
              <SelectItem value="cliente_final">🛑 Base Cliente Final (Separada)</SelectItem>
              <SelectItem value="atacado_fora_mapa">📍 ATACADO — Fora do Mapa</SelectItem>
              <SelectItem value="sem_dono_equipe">⚠️ Vendedor sem dono na equipe</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clientes Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Users className="h-4 w-4 text-[#253575]" />
              <span>Clientes Cadastrados</span>
            </CardTitle>
            <div className="flex items-center space-x-3 text-xs text-slate-500 font-mono">
              <span>
                Total no servidor:{' '}
                <strong className="text-slate-800">{totalItems.toLocaleString('pt-BR')}</strong>
              </span>
              <span>•</span>
              <span>
                Página <strong>{page}</strong> de <strong>{Math.max(1, totalPages)}</strong>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Carregando carteira de clientes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Nenhum cliente atende aos filtros pesquisados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-3 px-3">Código</th>
                    <th className="py-3 px-3">Cliente / Razão Social</th>
                    <th className="py-3 px-3">Região</th>
                    <th className="py-3 px-3">Contato</th>
                    <th className="py-3 px-3">Último Faturamento</th>
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
                      <td className="py-3 px-3 text-slate-600 font-medium">{item.regiao}</td>
                      <td className="py-3 px-3 text-slate-600 font-mono">
                        {item.telefone || item.whatsapp || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {item.ultima_compra ? (
                          <div>
                            <div>{new Date(item.ultima_compra).toLocaleDateString('pt-BR')}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.dias_sem_faturar || 0} dias sem faturar
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono font-bold text-[#253575] bg-[#253575]/10 px-2 py-0.5 rounded border border-[#253575]/20">
                          {item.score ?? 0} pts
                        </span>{' '}
                      </td>
                      <td className="py-3 px-3 space-y-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono block w-fit"
                        >
                          {item.estado.replace('_', ' ')}
                        </Badge>
                        {item.estado === 'reativado' &&
                          item.standby_ate &&
                          new Date(item.standby_ate).getTime() > Date.now() && (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9px] block w-fit font-mono font-medium">
                              Standby até{' '}
                              {new Date(item.standby_ate).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </Badge>
                          )}
                        {item.base_categoria === 'cliente_final' && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] block w-fit">
                            Cliente Final
                          </Badge>
                        )}
                        {item.base_categoria === 'atacado_fora_mapa' && (
                          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[9px] block w-fit">
                            Fora do Mapa
                          </Badge>
                        )}
                        {item.sem_dono_equipe && (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[9px] block w-fit">
                            Sem dono equipe
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetails(item)}
                          className="h-7 text-xs text-slate-600"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Detalhes
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => navigate(`/atendimento/${item.id}`)}
                          className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white"
                        >
                          Atender
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação Server-Side */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-600">
            <div className="flex items-center space-x-2">
              <span>Registros por página:</span>
              <Select
                value={String(perPage)}
                onValueChange={(val) => {
                  setPerPage(Number(val))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="150">150</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-slate-400 pl-2">
                Mostrando {totalItems > 0 ? (page - 1) * perPage + 1 : 0} a{' '}
                {Math.min(page * perPage, totalItems)} de {totalItems.toLocaleString('pt-BR')}{' '}
                clientes
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-8 px-3 text-xs"
              >
                Anterior
              </Button>
              <div className="px-2 font-mono font-medium text-slate-700">
                {page} / {Math.max(1, totalPages)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-8 px-3 text-xs"
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gaveta Lateral de Detalhes do Cliente */}
      <Sheet
        open={Boolean(selectedClient)}
        onOpenChange={(open) => !open && setSelectedClient(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md p-6 overflow-y-auto space-y-6">
          {selectedClient && (
            <>
              <SheetHeader className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs font-bold text-[#253575] bg-[#253575]/10 border-[#253575]/20"
                  >
                    {selectedClient.codigo}
                  </Badge>{' '}
                  <Badge className="text-xs uppercase">
                    {selectedClient.estado.replace('_', ' ')}
                  </Badge>
                  {selectedClient.estado === 'reativado' &&
                    selectedClient.standby_ate &&
                    new Date(selectedClient.standby_ate).getTime() > Date.now() && (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-mono font-medium">
                        Em standby até{' '}
                        {new Date(selectedClient.standby_ate).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </Badge>
                    )}
                </div>
                <SheetTitle className="text-lg font-bold text-slate-900">
                  {selectedClient.nome}
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-500">
                  Ficha detalhada de compras e auditoria
                </SheetDescription>
              </SheetHeader>

              {/* Dados Gerais */}
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">CNPJ / CPF:</span>
                  <span className="font-mono font-medium">
                    {selectedClient.cpf_cnpj || 'Não informado'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Telefone / Whats:</span>
                  <span className="font-mono font-medium">
                    {selectedClient.telefone || selectedClient.whatsapp || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">E-mail:</span>
                  <span className="font-medium">{selectedClient.email || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Região & Vendedor:</span>
                  <span className="font-medium">
                    {selectedClient.regiao} — {selectedClient.vendedor || 'Sem vendedor'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Última Compra:</span>
                  <span className="font-medium">
                    {selectedClient.ultima_compra
                      ? new Date(selectedClient.ultima_compra).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                </div>
                {selectedClient.reativado_em && (
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Reativado em:</span>
                    <span className="font-medium">
                      {new Date(selectedClient.reativado_em).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                {selectedClient.standby_ate && (
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Standby de 60 dias até:</span>
                    <span className="font-mono font-medium text-amber-700">
                      {new Date(selectedClient.standby_ate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Valor Histórico / Toneladas:</span>
                  <span className="font-medium">
                    R$ {(selectedClient.valor_historico || 0).toLocaleString('pt-BR')} (
                    {selectedClient.toneladas_historico || 0} ton)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Kommo CRM Lead ID:</span>
                  <span className="font-mono">
                    {selectedClient.kommo_lead_id || 'Não vinculado ainda'}
                  </span>
                </div>
              </div>

              {/* Ações de Supervisor: Reverter Status */}
              {hasRole(['supervisor', 'admin']) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <div className="text-xs font-bold text-amber-900 flex items-center space-x-1">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    <span>Controle de Supervisor: Reverter Status</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReverterStatus('na_base')}
                      className="h-7 text-[11px] bg-white text-slate-700"
                    >
                      Voltar para "Na Base"
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReverterStatus('reativado')}
                      className="h-7 text-[11px] bg-white text-emerald-700"
                    >
                      Marcar Reativado
                    </Button>
                  </div>
                </div>
              )}

              {/* Histórico de Interações */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-slate-700">
                  Histórico de Contatos
                </h4>
                {loadingDetails ? (
                  <p className="text-xs text-slate-400">Carregando...</p>
                ) : clientInteractions.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhum registro anterior.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {clientInteractions.map((ci) => (
                      <div
                        key={ci.id}
                        className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="uppercase font-semibold text-slate-600">
                              {ci.tipo}
                            </span>
                            {ci.expand?.operador?.name ? (
                              <span className="text-slate-500 font-medium">
                                por {ci.expand.operador.name}
                              </span>
                            ) : ci.operador ? (
                              <span className="text-slate-400 italic">(Usuário removido)</span>
                            ) : null}
                          </div>
                          <span>{new Date(ci.created).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-slate-800">{ci.conteudo}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button
                  onClick={() => {
                    navigate(`/atendimento/${selectedClient.id}`)
                    setSelectedClient(null)
                  }}
                  className="w-full bg-[#F18800] hover:bg-[#d97b00] text-white text-xs font-semibold shadow-sm shadow-[#F18800]/25"
                >
                  Abrir Tela de Atendimento
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
