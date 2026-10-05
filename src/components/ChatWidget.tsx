import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare,
  X,
  Send,
  Search,
  Megaphone,
  Hash,
  User as UserIcon,
  ChevronLeft,
  RefreshCw,
  Plus,
  Radio,
  CheckCircle2,
  Clock,
  Sparkles,
  Shield,
  Layers,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { derivePresenceStatus } from '@/hooks/usePresence'
import { formatarDataHoraBrasilia } from '@/lib/expediente'
import {
  fetchConversasUsuario,
  fetchMensagensConversa,
  enviarMensagemChat,
  getOrCreateDm,
  marcarConversaLida,
  fetchUnreadCounts,
  fetchColaboradoresParaDm,
  fetchCanalGeral,
} from '@/services/chat'
import type { ChatConversa, ChatMensagem, ChatUnreadCountsResponse, User } from '@/types'

export function ChatWidget() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isSupervisorOrAdmin = user?.role === 'admin' || user?.role === 'supervisor'

  // Estado do painel
  const [isOpen, setIsOpen] = useState(false)
  const [activeConversa, setActiveConversa] = useState<ChatConversa | null>(null)
  const [conversas, setConversas] = useState<ChatConversa[]>([])
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([])
  const [unreadCounts, setUnreadCounts] = useState<ChatUnreadCountsResponse>({
    total_unread: 0,
    by_conversation: {},
  })

  // Mensageria
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [loadingConversas, setLoadingConversas] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)

  // Filtros de busca
  const [buscaConversa, setBuscaConversa] = useState('')
  const [modalNovaDmOpen, setModalNovaDmOpen] = useState(false)
  const [colaboradores, setColaboradores] = useState<User[]>([])
  const [buscaColaborador, setBuscaColaborador] = useState('')

  // Modal Aviso Broadcast (Admin Only)
  const [modalAvisoOpen, setModalAvisoOpen] = useState(false)
  const [avisoTexto, setAvisoTexto] = useState('')
  const [enviandoAviso, setEnviandoAviso] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)

  // Scroll suave para a última mensagem
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }
  }, [])

  // Carregar lista de conversas
  const loadConversas = useCallback(async () => {
    if (!user) return
    try {
      setLoadingConversas(true)
      const list = await fetchConversasUsuario(user.role || 'operador', user.regioes || [], user.id)
      setConversas(list)
    } catch (err) {
      console.warn('Erro ao carregar conversas do chat:', err)
    } finally {
      setLoadingConversas(false)
    }
  }, [user])

  // Atualizar contadores de não-lidas
  const refreshUnread = useCallback(async () => {
    if (!user) return
    const unread = await fetchUnreadCounts()
    setUnreadCounts(unread)
  }, [user])

  // Polling / carregamento inicial de conversas e não lidas
  useEffect(() => {
    if (!user) return
    loadConversas()
    refreshUnread()

    // Atualização de badge a cada 25 segundos se o painel estiver fechado
    const interval = setInterval(() => {
      refreshUnread()
    }, 25000)

    return () => clearInterval(interval)
  }, [user, loadConversas, refreshUnread])

  // Carregar mensagens da conversa ativa
  const loadMensagens = useCallback(
    async (conversaId: string, reset = true) => {
      try {
        setLoadingMsgs(true)
        const targetPage = reset ? 1 : page + 1
        const res = await fetchMensagensConversa(conversaId, targetPage, 30)

        if (reset) {
          setMensagens(res.items)
          setPage(1)
          setTimeout(() => scrollToBottom(false), 50)
        } else {
          // Prepend páginas mais antigas
          setMensagens((prev) => [...res.items, ...prev])
          setPage(targetPage)
        }
        setTotalPages(res.totalPages)
        setHasMoreMsgs(targetPage < res.totalPages)

        // Marcar como lido
        marcarConversaLida(conversaId)
        setUnreadCounts((prev) => {
          const countForThis = prev.by_conversation[conversaId] || 0
          const newTotal = Math.max(0, prev.total_unread - countForThis)
          const newBy = { ...prev.by_conversation }
          delete newBy[conversaId]
          return { total_unread: newTotal, by_conversation: newBy }
        })
      } catch (err) {
        console.warn('Erro ao carregar mensagens:', err)
      } finally {
        setLoadingMsgs(false)
      }
    },
    [page, scrollToBottom],
  )

  // Ao selecionar conversa
  const handleSelectConversa = (conv: ChatConversa) => {
    setActiveConversa(conv)
    loadMensagens(conv.id, true)
  }

  // Realtime subscription: escutar novas mensagens na conversa aberta e na lista de conversas
  useEffect(() => {
    if (!user) return

    // Assinar mudanças nas mensagens
    const unsubscribeMsgsPromise = pb.collection('chat_mensagens').subscribe('*', (e) => {
      if (e.action === 'create') {
        const newMsg = e.record as unknown as ChatMensagem
        // Se a conversa aberta for a mesma da nova mensagem
        if (activeConversa && newMsg.conversa === activeConversa.id) {
          setMensagens((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          setTimeout(() => scrollToBottom(true), 60)
          marcarConversaLida(activeConversa.id)
        } else {
          // Nova mensagem em outra conversa -> recalcula badge
          refreshUnread()
        }
      }
    })

    // Assinar mudanças nas conversas (atualização de último texto)
    const unsubscribeConversasPromise = pb.collection('chat_conversas').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') {
        loadConversas()
      }
    })

    return () => {
      unsubscribeMsgsPromise.then((unsub) => unsub()).catch(() => {})
      unsubscribeConversasPromise.then((unsub) => unsub()).catch(() => {})
    }
  }, [user, activeConversa, loadConversas, refreshUnread, scrollToBottom])

  // Enviar mensagem
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim() || !activeConversa || !user || sending) return

    const texto = inputText.trim()
    setInputText('')
    setSending(true)

    try {
      const nova = await enviarMensagemChat({
        conversaId: activeConversa.id,
        texto,
        autorId: user.id,
        autorNome: user.name || user.email || 'Colaborador',
        autorRole: user.role || 'operador',
        tipo: 'normal',
      })

      setMensagens((prev) => {
        if (prev.some((m) => m.id === nova.id)) return prev
        return [...prev, nova]
      })
      setTimeout(() => scrollToBottom(true), 50)
    } catch (err) {
      console.error('Falha ao enviar mensagem:', err)
      // Restaura o texto em caso de falha
      setInputText(texto)
    } finally {
      setSending(false)
    }
  }

  // Enviar aviso broadcast exclusivo do admin
  const handleSendAvisoBroadcast = async () => {
    if (!avisoTexto.trim() || !user || !isAdmin || enviandoAviso) return
    setEnviandoAviso(true)
    try {
      // Obter ou assegurar canal Geral
      let canalGeral = conversas.find((c) => c.tipo === 'geral')
      if (!canalGeral) {
        canalGeral = await fetchCanalGeral()
      }
      if (!canalGeral) {
        alert('Canal Geral não encontrado para broadcast.')
        return
      }

      const msgAviso = await enviarMensagemChat({
        conversaId: canalGeral.id,
        texto: avisoTexto.trim(),
        autorId: user.id,
        autorNome: user.name || 'Administrador',
        autorRole: 'admin',
        tipo: 'aviso',
      })

      setAvisoTexto('')
      setModalAvisoOpen(false)
      // Abre direto o canal geral com o aviso
      setActiveConversa(canalGeral)
      setMensagens((prev) => [...prev, msgAviso])
      loadMensagens(canalGeral.id, true)
    } catch (err) {
      console.error('Falha ao enviar aviso broadcast:', err)
      alert('Falha ao enviar aviso. Tente novamente.')
    } finally {
      setEnviandoAviso(false)
    }
  }

  // Iniciar nova DM a partir da busca de colaborador
  const handleOpenNovaDm = async () => {
    if (!user) return
    setModalNovaDmOpen(true)
    try {
      const lista = await fetchColaboradoresParaDm(user.id)
      setColaboradores(lista)
    } catch (err) {
      console.warn('Erro ao carregar colaboradores:', err)
    }
  }

  const handleStartDmWithUser = async (targetUser: User) => {
    setModalNovaDmOpen(false)
    try {
      setLoadingConversas(true)
      const conv = await getOrCreateDm(targetUser.id)
      await loadConversas()
      setActiveConversa(conv)
      loadMensagens(conv.id, true)
    } catch (err) {
      console.error('Erro ao iniciar DM:', err)
    } finally {
      setLoadingConversas(false)
    }
  }

  // Separar conversas por seções:
  // 1. Geral (Canal oficial de avisos)
  // 2. Canais de Rota (da região do usuário)
  // 3. DMs (1:1)
  const canalGeral = conversas.find((c) => c.tipo === 'geral')
  const canaisRota = conversas.filter((c) => c.tipo === 'canal_rota')
  const conversasDm = conversas.filter((c) => c.tipo === 'dm')

  // Filtrar pela busca
  const filtrarPorTermo = (list: ChatConversa[]) => {
    if (!buscaConversa.trim()) return list
    const term = buscaConversa.toLowerCase()
    return list.filter((c) => {
      const t = (c.titulo || '').toLowerCase()
      const r = (c.regiao_nome || '').toLowerCase()
      const u = (c.ultimo_autor_nome || '').toLowerCase()
      const m = (c.ultima_mensagem_texto || '').toLowerCase()
      return t.includes(term) || r.includes(term) || u.includes(term) || m.includes(term)
    })
  }

  const canaisRotaFiltrados = filtrarPorTermo(canaisRota)
  const dmsFiltradas = filtrarPorTermo(conversasDm)

  // Colaboradores filtrados no modal de nova DM
  const colaboradoresFiltrados = colaboradores.filter((c) => {
    if (!buscaColaborador.trim()) return true
    const term = buscaColaborador.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.role || '').toLowerCase().includes(term)
    )
  })

  // Resolver nome de exibição de DM
  const getDmDisplayInfo = (conv: ChatConversa) => {
    const parts = conv.titulo?.split('&').map((s) => s.trim()) || []
    const myName = (user?.name || user?.email || '').trim()
    let otherName = parts.find((p) => p !== myName) || parts[0] || 'Colaborador'
    return {
      name: otherName,
      initials: otherName.slice(0, 2).toUpperCase(),
    }
  }

  return (
    <>
      {/* BOTÃO FLUTUANTE (FAB) — Canto inferior direito */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                setIsOpen((prev) => !prev)
                if (!isOpen) {
                  refreshUnread()
                  loadConversas()
                }
              }}
              aria-label="Abrir Chat Interno"
              className={`relative flex items-center justify-center h-13 w-13 rounded-full shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-hidden ${
                isOpen
                  ? 'bg-slate-800 text-white hover:bg-slate-900 ring-2 ring-slate-700'
                  : 'bg-[#253575] text-white hover:bg-[#1e2b60] ring-4 ring-[#253575]/20 shadow-blue-950/30'
              }`}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <>
                  <MessageSquare className="h-6 w-6" />
                  {/* Badge discreto com contador de mensagens não lidas */}
                  {unreadCounts.total_unread > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F18800] px-1.5 text-[11px] font-black text-white shadow-md ring-2 ring-white animate-in zoom-in-50">
                      {unreadCounts.total_unread > 99 ? '99+' : unreadCounts.total_unread}
                    </span>
                  )}
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            className="text-xs bg-[#142758] text-white border-none shadow-md"
          >
            {unreadCounts.total_unread > 0
              ? `${unreadCounts.total_unread} nova(s) mensagem(ns) no chat`
              : 'Chat Interno — Guerra'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* PAINEL COMPACTO (POPOVER / DRAWER) */}
      {isOpen && (
        <div className="fixed bottom-20 right-5 z-40 w-[92vw] sm:w-[400px] h-[75vh] max-h-[640px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* HEADER DO CHAT — Grafismo e Identidade Visual Grupo ABR */}
          <div className="bg-[#142758] text-white p-3.5 relative flex items-center justify-between shadow-md shrink-0">
            {/* Faixa curva laranja sutil proprietária */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#253575] flex">
              <div className="h-full w-28 bg-[#F18800] rounded-r-full" />
            </div>

            <div className="flex items-center space-x-2.5 min-w-0">
              {activeConversa ? (
                <button
                  onClick={() => setActiveConversa(null)}
                  className="p-1 -ml-1 text-slate-300 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                  title="Voltar à lista"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <div className="h-7 w-7 rounded-lg bg-[#253575] flex items-center justify-center text-[#F18800] font-bold shadow-xs">
                  <MessageSquare className="h-4 w-4" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                    {activeConversa
                      ? activeConversa.tipo === 'dm'
                        ? getDmDisplayInfo(activeConversa).name
                        : activeConversa.titulo
                      : 'Chat Interno da Equipe'}
                  </h3>
                  {activeConversa?.tipo === 'geral' && (
                    <Badge className="bg-[#F18800] text-white text-[9px] px-1 py-0 h-4">
                      Todos
                    </Badge>
                  )}
                  {activeConversa?.tipo === 'canal_rota' && (
                    <Badge className="bg-[#253575] border border-blue-400/40 text-blue-100 text-[9px] px-1 py-0 h-4">
                      Rota
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-slate-300 truncate">
                  {activeConversa
                    ? activeConversa.tipo === 'dm'
                      ? 'Conversa direta 1:1'
                      : activeConversa.tipo === 'canal_rota'
                        ? `Colaboradores da rota ${activeConversa.regiao_nome}`
                        : 'Avisos, comunicados e comunicados gerais'
                    : '1:1 • Rotas • Geral • Grupo ABR'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Botão de Enviar Aviso a Todos (Admin Only) */}
              {isAdmin && !activeConversa && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setModalAvisoOpen(true)}
                      className="px-2 py-1 rounded bg-[#F18800] hover:bg-[#d97b00] text-white text-[11px] font-bold flex items-center space-x-1 shadow-xs transition-colors"
                    >
                      <Megaphone className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Aviso</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Enviar aviso ou recado em destaque para toda a equipe
                  </TooltipContent>
                </Tooltip>
              )}

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                title="Fechar chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CORPO DO PAINEL: LISTA DE CONVERSAS OU CHAT ATIVO */}
          {!activeConversa ? (
            /* =========================================================================
             * TELA 1: LISTA DE CONVERSAS
             * ========================================================================= */
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/70">
              {/* Barra de Busca e Ações Rápidas */}
              <div className="p-2.5 bg-white border-b border-slate-200/80 space-y-2 shrink-0">
                <div className="flex items-center space-x-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Buscar canal ou conversa..."
                      value={buscaConversa}
                      onChange={(e) => setBuscaConversa(e.target.value)}
                      className="h-7.5 pl-8 text-xs bg-slate-50 border-slate-200"
                    />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleOpenNovaDm}
                        className="h-7.5 px-2.5 text-xs text-[#253575] border-[#253575]/30 hover:bg-[#253575]/5 font-semibold shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        <span>Nova DM</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Conversar em privado com qualquer colaborador
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Lista com Scroll */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-2">
                {/* 1. CANAL GERAL (TOPO FIXO) */}
                {canalGeral && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                      Canal Oficial
                    </span>
                    <button
                      onClick={() => handleSelectConversa(canalGeral)}
                      className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-blue-50/80 to-white hover:from-blue-100/80 hover:to-blue-50/50 border border-blue-200/80 transition-all flex items-start space-x-2.5 group shadow-xs"
                    >
                      <div className="h-9 w-9 rounded-lg bg-[#253575] text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                        <Megaphone className="h-4 w-4 text-[#F18800]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {canalGeral.titulo || 'Geral & Anúncios'}
                          </span>
                          {unreadCounts.by_conversation[canalGeral.id] ? (
                            <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center">
                              {unreadCounts.by_conversation[canalGeral.id]}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {canalGeral.ultima_mensagem_data
                                ? formatarDataHoraBrasilia(canalGeral.ultima_mensagem_data, {
                                    formatoCurto: true,
                                  }).split('às')[1] || 'Hoje'
                                : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 truncate mt-0.5 font-normal">
                          {canalGeral.ultima_mensagem_texto || 'Avisos da diretoria e comunicados.'}
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {/* 2. CANAIS POR ROTA */}
                {canaisRotaFiltrados.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block">
                      Canais por Rota ({canaisRotaFiltrados.length})
                    </span>
                    <div className="space-y-1">
                      {canaisRotaFiltrados.map((cr) => {
                        const unread = unreadCounts.by_conversation[cr.id] || 0
                        return (
                          <button
                            key={cr.id}
                            onClick={() => handleSelectConversa(cr)}
                            className="w-full text-left p-2 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200/70 transition-colors flex items-center space-x-2.5"
                          >
                            <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                              <Hash className="h-4 w-4 text-[#253575]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-slate-800 truncate">
                                  {cr.titulo}
                                </span>
                                {unread > 0 && (
                                  <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center">
                                    {unread}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">
                                {cr.ultima_mensagem_texto || 'Canal aberto'}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 3. CONVERSAS 1:1 (DMs) */}
                <div className="space-y-1 pt-2">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Mensagens Diretas ({dmsFiltradas.length})
                    </span>
                  </div>

                  {dmsFiltradas.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                      <p>Nenhuma conversa 1:1 iniciada.</p>
                      <button
                        onClick={handleOpenNovaDm}
                        className="text-xs text-[#253575] font-semibold hover:underline"
                      >
                        + Iniciar mensagem com colega
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dmsFiltradas.map((dm) => {
                        const { name, initials } = getDmDisplayInfo(dm)
                        const unread = unreadCounts.by_conversation[dm.id] || 0

                        return (
                          <button
                            key={dm.id}
                            onClick={() => handleSelectConversa(dm)}
                            className="w-full text-left p-2 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200/70 transition-colors flex items-center space-x-2.5"
                          >
                            <div className="relative shrink-0">
                              <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                                {initials}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-slate-900 truncate">
                                  {name}
                                </span>
                                {unread > 0 ? (
                                  <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center">
                                    {unread}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {dm.ultima_mensagem_data
                                      ? formatarDataHoraBrasilia(dm.ultima_mensagem_data, {
                                          formatoCurto: true,
                                        }).split('às')[1] || ''
                                      : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">
                                {dm.ultima_mensagem_texto || 'Conversa iniciada'}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* =========================================================================
             * TELA 2: VISÃO DA CONVERSA ABERTA (CHAT LINEAR COM ROLAGEM)
             * ========================================================================= */
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
              {/* Botão carregar mensagens anteriores */}
              {hasMoreMsgs && (
                <div className="p-1.5 bg-slate-100 text-center border-b border-slate-200 shrink-0">
                  <button
                    onClick={() => loadMensagens(activeConversa.id, false)}
                    disabled={loadingMsgs}
                    className="text-[11px] text-[#253575] hover:underline font-semibold"
                  >
                    {loadingMsgs ? 'Carregando anteriores...' : '↑ Carregar mensagens anteriores'}
                  </button>
                </div>
              )}

              {/* Mensagens com scroll linear */}
              <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
                {loadingMsgs && mensagens.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto text-[#253575]" />
                    <p>Carregando histórico do chat...</p>
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                    <MessageSquare className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600">Nenhuma mensagem ainda.</p>
                    <p className="text-[11px]">Envie a primeira mensagem para iniciar!</p>
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const isMe = msg.autor === user?.id
                    const isAviso = msg.tipo === 'aviso'
                    const hora = msg.created
                      ? formatarDataHoraBrasilia(msg.created, { formatoCurto: true }).split(
                          'às',
                        )[1] || ''
                      : ''

                    // MENSAGEM DE AVISO (BROADCAST / DESTAQUE ADMIN)
                    if (isAviso) {
                      return (
                        <div
                          key={msg.id}
                          className="my-3 p-3 rounded-xl bg-gradient-to-r from-[#253575] to-[#142758] text-white border-2 border-[#F18800] shadow-md space-y-1 animate-in zoom-in-95"
                        >
                          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/20">
                            <div className="flex items-center space-x-1.5 font-bold text-amber-300">
                              <Megaphone className="h-4 w-4 text-[#F18800] animate-pulse" />
                              <span className="uppercase tracking-wide text-[10px]">
                                Aviso Oficial da Administração
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-300 font-mono">{hora}</span>
                          </div>
                          <p className="text-xs text-white leading-relaxed whitespace-pre-wrap font-medium pt-1">
                            {msg.texto}
                          </p>
                          <div className="text-[10px] text-slate-300 text-right pt-0.5">
                            Emitido por: {msg.autor_nome || 'Diretoria'}
                          </div>
                        </div>
                      )
                    }

                    // MENSAGEM PADRÃO (MINHA OU DE COLEGA)
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        {!isMe && (
                          <div className="flex items-center space-x-1 text-[10px] text-slate-500 mb-0.5 ml-1">
                            <span className="font-bold text-slate-700">{msg.autor_nome}</span>
                            {msg.autor_role && (
                              <span className="text-[9px] uppercase px-1 py-0 rounded bg-slate-200 text-slate-700 font-mono">
                                {msg.autor_role}
                              </span>
                            )}
                          </div>
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-xs relative break-words ${
                            isMe
                              ? 'bg-[#253575] text-white rounded-tr-xs'
                              : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.texto}</p>
                          <span
                            className={`block text-[9px] mt-1 font-mono text-right ${
                              isMe ? 'text-blue-200' : 'text-slate-400'
                            }`}
                          >
                            {hora}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* INPUT DE ENVIO COMPACTO */}
              <form
                onSubmit={handleSend}
                className="p-2 bg-white border-t border-slate-200 shrink-0 flex items-center space-x-1.5"
              >
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escreva uma mensagem..."
                  className="h-8.5 text-xs bg-slate-50 focus:bg-white"
                  disabled={sending}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!inputText.trim() || sending}
                  className="h-8.5 px-3 bg-[#F18800] hover:bg-[#d97b00] text-white shadow-xs font-semibold shrink-0"
                >
                  {sending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: NOVA DM — ESCOLHER COLABORADOR */}
      <Dialog open={modalNovaDmOpen} onOpenChange={setModalNovaDmOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-sm font-bold flex items-center space-x-2 text-slate-900">
              <UserIcon className="h-4 w-4 text-[#253575]" />
              <span>Iniciar Conversa Privada (1:1)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha um colaborador da equipe comercial ou liderança para conversar
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail ou cargo..."
                value={buscaColaborador}
                onChange={(e) => setBuscaColaborador(e.target.value)}
                className="h-8.5 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[360px] pr-1">
            {colaboradoresFiltrados.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum colaborador encontrado.
              </div>
            ) : (
              colaboradoresFiltrados.map((colab) => {
                const presence = derivePresenceStatus(colab.last_seen)
                return (
                  <button
                    key={colab.id}
                    onClick={() => handleStartDmWithUser(colab)}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div className="relative shrink-0">
                        <div className="h-8 w-8 rounded-full bg-[#253575] text-white flex items-center justify-center font-bold text-xs">
                          {colab.name ? colab.name.slice(0, 2).toUpperCase() : 'CO'}
                        </div>
                        {/* Indicador de presença integrado */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${presence.dotClass}`}
                          title={presence.tooltip}
                        />
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-xs text-slate-900 block truncate">
                          {colab.name}
                        </span>
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400">
                          <span className="uppercase font-mono">{colab.role}</span>
                          {colab.regioes && colab.regioes.length > 0 && (
                            <span>• {colab.regioes.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${presence.badgeBgClass}`}
                    >
                      {presence.status === 'online'
                        ? 'Online'
                        : presence.status === 'today'
                          ? 'Hoje'
                          : 'Offline'}
                    </Badge>
                  </button>
                )
              })
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalNovaDmOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ENVIAR AVISO PARA TODOS (ADMIN EXCLUSIVO) */}
      {isAdmin && (
        <Dialog open={modalAvisoOpen} onOpenChange={setModalAvisoOpen}>
          <DialogContent className="max-w-md p-4">
            <DialogHeader className="pb-2 border-b">
              <DialogTitle className="text-sm font-bold flex items-center space-x-2 text-slate-900">
                <Megaphone className="h-4 w-4 text-[#F18800]" />
                <span>Enviar Aviso em Destaque a Todos</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Essa mensagem será fixada com destaque visual no Canal Geral para toda a equipe.
                Ideal para avisos de relogue, atualização do sistema ou comunicados urgentes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-[#F18800] shrink-0" />
                <span>
                  O aviso aparecerá com fundo institucional azul e badge exclusivo no chat de todos
                  os operadores, supervisores e líderes.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Texto do Comunicado</label>
                <Textarea
                  placeholder="Ex: Pessoal, acabamos de atualizar as regras da fila. Por favor, deem F5 ou façam relogue no sistema..."
                  value={avisoTexto}
                  onChange={(e) => setAvisoTexto(e.target.value)}
                  rows={4}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t">
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
                disabled={!avisoTexto.trim() || enviandoAviso}
                onClick={handleSendAvisoBroadcast}
                className="bg-[#F18800] hover:bg-[#d97b00] text-white text-xs font-bold"
              >
                {enviandoAviso ? 'Disparando...' : 'Publicar Aviso Geral'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
