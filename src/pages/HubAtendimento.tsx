import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  RefreshCw,
  Search,
  X,
  Users,
  Megaphone,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { usePresence, derivePresenceStatus } from '@/hooks/usePresence'
import { pb } from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  fetchConversasUsuario,
  fetchMensagensConversa,
  enviarMensagemChat,
  marcarConversaLida,
  fetchUnreadCounts,
  fetchColaboradoresParaDm,
  getOrCreateDm,
  fetchCanalGeral,
} from '@/services/chat'
import { emitirAtualizacaoVersaoAdmin } from '@/services/version'
import { formatarDataHoraBrasilia } from '@/lib/expediente'
import { fetchUsers } from '@/services/api'
import type { ChatConversa, ChatMensagem, ChatUnreadCountsResponse, User } from '@/types'

export interface ContatoInternoItem {
  id: string
  tipo: 'chat_dm' | 'chat_canal'
  nome: string
  subtitulo?: string
  badge?: string
  unreadCount?: number
  isOnline?: boolean
  initials: string
  conversaRef?: ChatConversa
  userId?: string
}

export default function HubAtendimentoPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { presenceData } = usePresence({ pollStatus: true })

  const [conversas, setConversas] = useState<ChatConversa[]>([])
  const [loadingConversas, setLoadingConversas] = useState(false)
  const [activeConversa, setActiveConversa] = useState<ChatConversa | null>(null)
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([])
  const [loadingMensagens, setLoadingMensagens] = useState(false)
  const [novoTextoMsg, setNovoTextoMsg] = useState('')
  const [enviandoMsg, setEnviandoMsg] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<ChatUnreadCountsResponse>({
    total_unread: 0,
    by_conversation: {},
  })
  const [colaboradores, setColaboradores] = useState<User[]>([])
  const [modalNovaDmOpen, setModalNovaDmOpen] = useState(false)
  const [buscaColaborador, setBuscaColaborador] = useState('')
  const [buscaContatoBarra, setBuscaContatoBarra] = useState('')
  const [contatoSelecionadoId, setContatoSelecionadoId] = useState<string | null>(null)
  const [todosUsuarios, setTodosUsuarios] = useState<User[]>([])

  // Modal Aviso Geral
  const [modalAvisoOpen, setModalAvisoOpen] = useState(false)
  const [avisoTexto, setAvisoTexto] = useState('')
  const [avisoPedirAtualizacao, setAvisoPedirAtualizacao] = useState(false)
  const [enviandoAviso, setEnviandoAviso] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeConversaRef = useRef<ChatConversa | null>(null)
  activeConversaRef.current = activeConversa

  const carregarMensagens = useCallback(async (conversaId: string): Promise<ChatMensagem[]> => {
    setLoadingMensagens(true)
    try {
      const res = await fetchMensagensConversa(conversaId, 1, 50)
      setMensagens(res.items)
      await marcarConversaLida(conversaId)
      setUnreadCounts((prev) => {
        const copy = { ...prev.by_conversation }
        const diff = copy[conversaId] || 0
        delete copy[conversaId]
        return {
          total_unread: Math.max(0, prev.total_unread - diff),
          by_conversation: copy,
        }
      })
      return res.items
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err)
      return []
    } finally {
      setLoadingMensagens(false)
    }
  }, [])

  const carregarConversas = useCallback(
    async (selecionarPrimeiraSeNula = false) => {
      if (!user) return
      setLoadingConversas(true)
      try {
        const [list, usuariosList] = await Promise.all([
          fetchConversasUsuario(user.role || 'admin', user.regioes || [], user.id),
          fetchUsers().catch(() => [] as User[]),
        ])

        // Filtra estritamente apenas conversas internas
        const internas = list.filter(
          (c) => c.tipo === 'geral' || c.tipo === 'dm' || c.tipo === 'canal_geral',
        )
        setConversas(internas)

        if (usuariosList && usuariosList.length > 0) {
          setTodosUsuarios(usuariosList)
        }

        const unread = await fetchUnreadCounts()
        setUnreadCounts(unread)

        if ((selecionarPrimeiraSeNula || !activeConversaRef.current) && internas.length > 0) {
          const canalGeral = internas.find((c) => c.tipo === 'geral') || internas[0]
          setActiveConversa(canalGeral)
          setContatoSelecionadoId(canalGeral.id)
          await carregarMensagens(canalGeral.id)
        }
      } catch (err) {
        console.warn('Erro ao carregar conversas do chat:', err)
      } finally {
        setLoadingConversas(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.role, JSON.stringify(user?.regioes || []), carregarMensagens],
  )

  useEffect(() => {
    if (user?.id) {
      carregarConversas(true)
    }
  }, [user?.id, carregarConversas])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // Assinatura realtime no PocketBase
  useEffect(() => {
    if (!user) return

    const unsubMsgsPromise = pb.collection('chat_mensagens').subscribe('*', (e) => {
      if (e.action === 'create') {
        const novaMsg = e.record as unknown as ChatMensagem
        const atual = activeConversaRef.current
        if (atual && novaMsg.conversa === atual.id) {
          setMensagens((prev) => {
            if (prev.some((m) => m.id === novaMsg.id)) return prev
            return [...prev, novaMsg]
          })
          marcarConversaLida(atual.id).catch(() => {})
        } else {
          fetchUnreadCounts()
            .then(setUnreadCounts)
            .catch(() => {})
        }
      }
    })

    const unsubConversasPromise = pb.collection('chat_conversas').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') {
        const convAtualizada = e.record as unknown as ChatConversa
        if (convAtualizada.tipo !== 'dm' && convAtualizada.tipo !== 'geral') return

        setConversas((prev) => {
          const index = prev.findIndex((c) => c.id === convAtualizada.id)
          if (index >= 0) {
            const copy = [...prev]
            copy[index] = { ...copy[index], ...convAtualizada }
            return copy
          }
          return [convAtualizada, ...prev]
        })
        fetchUnreadCounts()
          .then(setUnreadCounts)
          .catch(() => {})
      }
    })

    return () => {
      unsubMsgsPromise.then((unsub) => unsub()).catch(() => {})
      unsubConversasPromise.then((unsub) => unsub()).catch(() => {})
    }
  }, [user])

  // Polling leve a cada 30 segundos
  const activeConversaId = activeConversa?.id
  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      fetchUnreadCounts()
        .then(setUnreadCounts)
        .catch(() => {})
      if (activeConversaId) {
        fetchMensagensConversa(activeConversaId, 1, 50)
          .then((res) => {
            setMensagens((prev) => {
              if (
                res.items.length !== prev.length ||
                (res.items.length > 0 &&
                  prev.length > 0 &&
                  res.items[res.items.length - 1].id !== prev[prev.length - 1].id)
              ) {
                return res.items
              }
              return prev
            })
          })
          .catch(() => {})
      }
    }, 30000)

    return () => clearInterval(timer)
  }, [user, activeConversaId])

  const handleSelecionarConversa = async (c: ChatConversa) => {
    setActiveConversa(c)
    setContatoSelecionadoId(c.id)
    await carregarMensagens(c.id)
  }

  const handleEnviarMensagem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!novoTextoMsg.trim() || !activeConversa || !user || enviandoMsg) return

    const textoParaEnviar = novoTextoMsg.trim()
    setEnviandoMsg(true)
    try {
      const msg = await enviarMensagemChat({
        conversaId: activeConversa.id,
        texto: textoParaEnviar,
        autorId: user.id,
        autorNome: user.name || 'Colaborador',
        autorRole: user.role || 'operador',
        tipo: 'normal',
      })
      setNovoTextoMsg('')
      setMensagens((prev) => [...prev, msg])
    } catch (err) {
      toast({
        title: 'Falha ao enviar mensagem',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setEnviandoMsg(false)
    }
  }

  const handleAbrirNovaDm = async () => {
    if (!user) return
    setModalNovaDmOpen(true)
    try {
      const lista = await fetchColaboradoresParaDm(user.id)
      setColaboradores(lista)
    } catch (err) {
      console.warn('Erro ao carregar colaboradores:', err)
    }
  }

  const handleIniciarDmCom = async (colab: User) => {
    setModalNovaDmOpen(false)
    try {
      const conv = await getOrCreateDm(colab.id)
      await carregarConversas()
      setActiveConversa(conv)
      setContatoSelecionadoId(conv.id)
      await carregarMensagens(conv.id)
    } catch (err) {
      toast({
        title: 'Erro ao iniciar conversa 1:1',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  const handleDispararAviso = async () => {
    if (!avisoTexto.trim() || !user || enviandoAviso) return
    setEnviandoAviso(true)
    try {
      let canalGeral = conversas.find((c) => c.tipo === 'geral')
      if (!canalGeral) {
        canalGeral = (await fetchCanalGeral()) || undefined
      }
      if (!canalGeral) {
        toast({ title: 'Canal Geral não encontrado', variant: 'destructive' })
        return
      }

      let textoFinal = avisoTexto.trim()
      if (avisoPedirAtualizacao && !textoFinal.toLowerCase().includes('atualiz')) {
        textoFinal = `[ATUALIZAÇÃO DE SISTEMA] ${textoFinal} (Por favor, clique em Atualizar Página ou pressione F5).`
      }

      await enviarMensagemChat({
        conversaId: canalGeral.id,
        texto: textoFinal,
        autorId: user.id,
        autorNome: user.name || 'Administrador',
        autorRole: 'admin',
        tipo: 'aviso',
      })

      if (avisoPedirAtualizacao) {
        try {
          await emitirAtualizacaoVersaoAdmin({
            version: '0.0.' + Math.floor(((Date.now() / 60000) % 1000) + 70),
            mensagem: avisoTexto.trim(),
            dispararChatAviso: false,
          })
        } catch {
          /* intentionally ignored */
        }
      }

      toast({
        title: 'Aviso publicado com sucesso!',
        description: 'Todos os colaboradores receberão o aviso no canal Geral.',
      })

      setAvisoTexto('')
      setAvisoPedirAtualizacao(false)
      setModalAvisoOpen(false)

      setActiveConversa(canalGeral)
      setContatoSelecionadoId(canalGeral.id)
      await carregarMensagens(canalGeral.id)
    } catch (err) {
      toast({
        title: 'Erro ao disparar aviso',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setEnviandoAviso(false)
    }
  }

  const getDmDisplay = (conv: ChatConversa) => {
    const parts = conv.titulo?.split('&').map((s) => s.trim()) || []
    const myName = (user?.name || user?.email || '').trim()
    const otherName =
      parts.find((p) => p !== myName) ||
      (parts.length > 1 ? `${parts[0]} e ${parts[1]}` : parts[0] || 'Colaborador')

    const otherId = (conv.participantes || []).find((id) => id !== user?.id)
    const otherItem =
      otherId && presenceData?.users ? presenceData.users.find((it) => it.id === otherId) : null
    const presenceInfo = otherItem ? derivePresenceStatus(otherItem.last_seen) : null
    const isOnline = presenceInfo?.status === 'online'

    return {
      name: otherName,
      initials: otherName.slice(0, 2).toUpperCase(),
      isOnline,
    }
  }

  // Montagem da lista estritamente interna (1:1 + Canal Geral)
  const contatosInternos: ContatoInternoItem[] = []
  const userIdsComDm = new Set<string>()

  const conversasFiltradasInternas = conversas.filter((c) => {
    if (c.tipo === 'geral') return true
    if (c.tipo === 'dm') return true
    return false
  })

  for (const c of conversasFiltradasInternas) {
    const isDm = c.tipo === 'dm'
    const dmInfo = isDm ? getDmDisplay(c) : null
    const nome = isDm ? dmInfo?.name || 'DM' : c.titulo || 'Geral & Anúncios'
    const unread = unreadCounts.by_conversation[c.id] || 0

    if (isDm && Array.isArray(c.participantes)) {
      c.participantes.forEach((p) => {
        if (p !== user?.id) userIdsComDm.add(p)
      })
    }

    contatosInternos.push({
      id: c.id,
      tipo: isDm ? 'chat_dm' : 'chat_canal',
      nome,
      subtitulo:
        c.ultima_mensagem_texto ||
        (c.tipo === 'geral' ? 'Avisos e comunicados gerais da empresa' : 'Conversa direta 1:1'),
      badge: c.tipo === 'geral' ? 'Canal Geral' : '1:1',
      unreadCount: unread,
      isOnline: isDm ? dmInfo?.isOnline : undefined,
      initials: isDm ? dmInfo?.initials || 'DM' : '📣',
      conversaRef: c,
    })
  }

  // Se admin, permite abrir conversa com qualquer colaborador mesmo sem DM iniciada
  if (user?.role === 'admin' && todosUsuarios.length > 0) {
    for (const colab of todosUsuarios) {
      if (colab.id === user.id) continue
      if (userIdsComDm.has(colab.id)) continue

      const otherItem = presenceData?.users
        ? presenceData.users.find((it) => it.id === colab.id)
        : null
      const presenceInfo = derivePresenceStatus(otherItem?.last_seen || colab.last_seen)
      const roleLabel =
        colab.role === 'admin'
          ? 'Admin'
          : colab.role === 'supervisor'
            ? 'Supervisor'
            : colab.role === 'lider'
              ? 'Líder'
              : 'Operador'

      contatosInternos.push({
        id: `colab_${colab.id}`,
        tipo: 'chat_dm',
        nome: colab.name || colab.email,
        subtitulo: `${roleLabel}${colab.regioes && colab.regioes.length > 0 ? ` • ${colab.regioes.join(', ')}` : ''}`,
        badge: roleLabel,
        isOnline: presenceInfo.status === 'online',
        initials: (colab.name || colab.email || 'CL').slice(0, 2).toUpperCase(),
        userId: colab.id,
      })
    }
  }

  const matchesBusca = (item: ContatoInternoItem) => {
    if (!buscaContatoBarra.trim()) return true
    const term = buscaContatoBarra.toLowerCase()
    return (
      item.nome.toLowerCase().includes(term) ||
      (item.subtitulo && item.subtitulo.toLowerCase().includes(term))
    )
  }

  const contatosFiltrados = contatosInternos.filter(matchesBusca)

  const handleSelecionarContato = async (contato: ContatoInternoItem) => {
    setContatoSelecionadoId(contato.id)
    if (contato.conversaRef) {
      await handleSelecionarConversa(contato.conversaRef)
    } else if (contato.userId) {
      try {
        const conv = await getOrCreateDm(contato.userId)
        await carregarConversas()
        setActiveConversa(conv)
        setContatoSelecionadoId(conv.id)
        await carregarMensagens(conv.id)
      } catch (err) {
        toast({
          title: 'Erro ao abrir conversa com colaborador',
          description: String(err),
          variant: 'destructive',
        })
      }
    }
  }

  const colaboradoresFiltradosModal = colaboradores.filter((c) => {
    if (!buscaColaborador.trim()) return true
    const term = buscaColaborador.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.role || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-5 pb-12">
      {/* Cabeçalho */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#253575] flex">
          <div className="h-full w-40 bg-[#F18800] rounded-r-full" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-1">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Badge className="bg-[#253575] text-white hover:bg-[#253575] text-xs font-semibold px-2.5 py-0.5">
                Comunicação Interna
              </Badge>
              <Badge
                variant="outline"
                className="border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium flex items-center gap-1"
              >
                <Users className="h-3 w-3 text-emerald-600" />
                Equipe Grupo ABR
              </Badge>
            </div>
            <h1 className="text-2xl font-black text-[#253575] tracking-tight flex items-center gap-2">
              CA - Comunicação Interna
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
              Canal oficial para comunicação direta entre colaboradores (1:1), comunicados da
              liderança e canal geral para alinhamento rápido da operação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregarConversas()}
              disabled={loadingConversas}
              className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${loadingConversas ? 'animate-spin' : ''}`}
              />
              Recarregar
            </Button>

            {user?.role === 'admin' && (
              <Button
                size="sm"
                onClick={() => setModalAvisoOpen(true)}
                className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs shadow-xs"
              >
                <Megaphone className="h-3.5 w-3.5 mr-1.5" />
                Enviar Aviso Geral
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Grid Principal: Lista lateral + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Barra lateral de conversas */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="border-slate-200/90 shadow-sm flex flex-col h-[740px] overflow-hidden bg-slate-100/90">
            <div className="p-3.5 bg-slate-50/95 border-b border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-lg bg-[#253575] text-white flex items-center justify-center font-bold">
                    <MessageSquare className="h-4 w-4 text-[#F18800]" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Conversas
                    </h2>
                    <p className="text-[10px] text-slate-400">Canal Geral e DMs 1:1</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAbrirNovaDm}
                  className="h-7 px-2 text-xs text-[#253575] hover:bg-slate-200/60 font-semibold"
                  title="Nova conversa 1:1"
                >
                  <Plus className="h-3.5 w-3.5 mr-0.5" />
                  Nova DM
                </Button>
              </div>

              {/* Busca */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Pesquisar colega ou comunicado..."
                  value={buscaContatoBarra}
                  onChange={(e) => setBuscaContatoBarra(e.target.value)}
                  className="h-8 pl-8 text-xs bg-white border-slate-200 shadow-2xs"
                />
                {buscaContatoBarra && (
                  <button
                    onClick={() => setBuscaContatoBarra('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista com scroll */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-slate-100/90">
              {loadingConversas ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2 text-xs">
                  <RefreshCw className="h-4 w-4 animate-spin text-[#253575]" />
                  <span>Carregando conversas...</span>
                </div>
              ) : contatosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 p-4 space-y-2">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="text-xs">Nenhuma conversa encontrada.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAbrirNovaDm}
                    className="h-7 text-xs text-[#253575]"
                  >
                    Iniciar nova DM
                  </Button>
                </div>
              ) : (
                contatosFiltrados.map((item) => {
                  const isSelected = contatoSelecionadoId === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelecionarContato(item)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all border flex items-center space-x-3 group relative ${
                        isSelected
                          ? 'bg-white border-[#253575] shadow-xs'
                          : 'bg-white/90 hover:bg-white border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs ${
                            item.tipo === 'chat_canal'
                              ? 'bg-[#253575] text-[#F18800]'
                              : 'bg-slate-800 text-white'
                          }`}
                        >
                          {item.initials}
                        </div>
                        {item.isOnline && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white"
                            title="Online agora"
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs truncate font-bold ${
                              isSelected ? 'text-[#253575]' : 'text-slate-900'
                            }`}
                          >
                            {item.nome}
                          </span>
                          {item.unreadCount && item.unreadCount > 0 ? (
                            <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                              {item.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-normal">
                          {item.subtitulo}
                        </p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Janela de Mensagens */}
        <div className="lg:col-span-8 xl:col-span-9">
          <Card className="border-slate-200/90 shadow-sm flex flex-col h-[740px] overflow-hidden bg-white">
            {activeConversa ? (
              <>
                {/* Header da Conversa */}
                <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        activeConversa.tipo === 'geral'
                          ? 'bg-[#253575] text-[#F18800]'
                          : 'bg-slate-800 text-white'
                      }`}
                    >
                      {activeConversa.tipo === 'geral'
                        ? '📣'
                        : getDmDisplay(activeConversa).initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h2 className="font-bold text-sm text-slate-900 truncate">
                          {activeConversa.tipo === 'geral'
                            ? activeConversa.titulo || 'Geral & Anúncios'
                            : getDmDisplay(activeConversa).name}
                        </h2>
                        {activeConversa.tipo === 'geral' ? (
                          <Badge className="bg-[#F18800] text-white text-[9px] px-1.5 py-0">
                            Canal Geral
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium">
                            Mensagem Direta (1:1)
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {activeConversa.tipo === 'geral'
                          ? 'Comunicados, avisos de versão e anúncios da diretoria.'
                          : 'Conversa privada entre colaboradores da equipe.'}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => carregarMensagens(activeConversa.id)}
                    disabled={loadingMensagens}
                    className="h-8 text-xs text-slate-500 hover:text-slate-700"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1 ${loadingMensagens ? 'animate-spin' : ''}`}
                    />
                    Atualizar
                  </Button>
                </div>

                {/* Área de Mensagens */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                  {loadingMensagens && mensagens.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                      <RefreshCw className="h-4 w-4 animate-spin text-[#253575] mr-2" />
                      Carregando mensagens...
                    </div>
                  ) : mensagens.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs space-y-2">
                      <MessageSquare className="h-8 w-8 text-slate-300" />
                      <p>Nenhuma mensagem ainda nesta conversa.</p>
                      <p className="text-[11px] text-slate-400">
                        Envie uma mensagem abaixo para começar.
                      </p>
                    </div>
                  ) : (
                    mensagens.map((msg) => {
                      const isMinha = msg.autor === user?.id
                      const isAviso = msg.tipo === 'aviso'

                      if (isAviso) {
                        return (
                          <div
                            key={msg.id}
                            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-3.5 text-xs text-slate-800 shadow-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#F18800] flex items-center gap-1.5">
                                <Megaphone className="h-4 w-4" />
                                Aviso Geral: {msg.autor_nome || 'Administração'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {formatarDataHoraBrasilia(msg.created, { formatoCurto: true })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.texto}</p>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMinha ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl p-3 text-xs shadow-2xs space-y-1 ${
                              isMinha
                                ? 'bg-[#253575] text-white rounded-br-xs'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                            }`}
                          >
                            {!isMinha && (
                              <div className="font-bold text-[11px] text-[#F18800] flex items-center justify-between gap-2">
                                <span>{msg.autor_nome || 'Colega'}</span>
                                {msg.autor_role && (
                                  <span className="text-[9px] uppercase font-mono text-slate-400">
                                    {msg.autor_role}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.texto}</p>
                            <div
                              className={`text-[9px] font-mono text-right flex items-center justify-end gap-1 ${
                                isMinha ? 'text-white/70' : 'text-slate-400'
                              }`}
                            >
                              <Clock className="h-2.5 w-2.5" />
                              <span>
                                {formatarDataHoraBrasilia(msg.created, {
                                  formatoCurto: true,
                                })
                                  .split('às')[1]
                                  ?.trim() || ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input de Envio */}
                <form
                  onSubmit={handleEnviarMensagem}
                  className="p-3 bg-white border-t border-slate-200 flex items-center space-x-2"
                >
                  <Input
                    placeholder="Digite sua mensagem interna..."
                    value={novoTextoMsg}
                    onChange={(e) => setNovoTextoMsg(e.target.value)}
                    disabled={enviandoMsg}
                    className="flex-1 text-xs h-9 bg-slate-50 border-slate-200"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={enviandoMsg || !novoTextoMsg.trim()}
                    className="bg-[#253575] hover:bg-[#1b2756] text-white h-9 px-4 font-bold text-xs"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Enviar
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 p-6 text-center">
                <MessageSquare className="h-10 w-10 text-slate-300" />
                <h3 className="font-bold text-slate-700 text-sm">Nenhuma conversa selecionada</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Selecione uma conversa na lista ao lado ou inicie uma nova DM com um colaborador.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal Nova DM */}
      <Dialog open={modalNovaDmOpen} onOpenChange={setModalNovaDmOpen}>
        <DialogContent className="max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-[#253575] flex items-center gap-2">
              <Users className="h-4 w-4 text-[#F18800]" />
              Iniciar Conversa Direta (1:1)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Selecione um membro da equipe para abrir uma conversa privada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail ou cargo..."
                value={buscaColaborador}
                onChange={(e) => setBuscaColaborador(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {colaboradoresFiltradosModal.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Nenhum colaborador encontrado.
                </div>
              ) : (
                colaboradoresFiltradosModal.map((colab) => (
                  <button
                    key={colab.id}
                    onClick={() => handleIniciarDmCom(colab)}
                    className="w-full text-left p-2.5 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {(colab.name || colab.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-slate-900 truncate">
                        {colab.name || colab.email}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <span className="capitalize">{colab.role || 'operador'}</span>
                        {colab.regioes && colab.regioes.length > 0 && (
                          <span>• {colab.regioes.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Aviso Geral (Admin Only) */}
      <Dialog open={modalAvisoOpen} onOpenChange={setModalAvisoOpen}>
        <DialogContent className="max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-[#253575] flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[#F18800]" />
              Enviar Aviso Geral para a Equipe
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              A mensagem será fixada em destaque no Canal Geral para todos os colaboradores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Mensagem do Comunicado</label>
              <textarea
                value={avisoTexto}
                onChange={(e) => setAvisoTexto(e.target.value)}
                placeholder="Ex: Pessoal, alinhamento às 14h sobre os leads de Varejo..."
                rows={4}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#253575] resize-none"
              />
            </div>

            <div className="flex items-center space-x-2 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              <input
                type="checkbox"
                id="check-aviso-pulso"
                checked={avisoPedirAtualizacao}
                onChange={(e) => setAvisoPedirAtualizacao(e.target.checked)}
                className="rounded border-amber-300 text-[#F18800] focus:ring-[#F18800] h-4 w-4"
              />
              <label
                htmlFor="check-aviso-pulso"
                className="text-xs text-amber-900 cursor-pointer select-none font-medium flex items-center gap-1"
              >
                <Radio className="h-3.5 w-3.5 text-[#F18800] animate-pulse" />
                <span>Emitir pulso de atualização (solicita F5/recarregar navegador)</span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalAvisoOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleDispararAviso}
                disabled={enviandoAviso || !avisoTexto.trim()}
                className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {enviandoAviso ? 'Publicando...' : 'Publicar Aviso'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
