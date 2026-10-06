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
  Bell,
  Calendar,
  AlertTriangle,
  Trophy,
  ArrowRight,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { derivePresenceStatus } from '@/hooks/usePresence'
import { formatarDataHoraBrasilia } from '@/lib/expediente'
import { emitirAtualizacaoVersaoAdmin } from '@/services/version'
import { Checkbox } from '@/components/ui/checkbox'
import {
  fetchConversasUsuario,
  fetchMensagensConversa,
  enviarMensagemChat,
  apagarMensagemChat,
  apagarConversaChat,
  marcarConversaLida,
  fetchUnreadCounts,
  fetchColaboradoresParaDm,
  getOrCreateDm,
  fetchCanalGeral,
  processarCicloNotificacoes,
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
  const [avisoPedirAtualizacao, setAvisoPedirAtualizacao] = useState(false)
  const [enviandoAviso, setEnviandoAviso] = useState(false)

  // Diálogo discreto para exclusão de mensagens e conversas
  const [mensagemParaExcluir, setMensagemParaExcluir] = useState<ChatMensagem | null>(null)
  const [excluindoMsg, setExcluindoMsg] = useState(false)
  const [conversaParaExcluir, setConversaParaExcluir] = useState<ChatConversa | null>(null)
  const [excluindoConversa, setExcluindoConversa] = useState(false)

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

  const processCicloAndReload = useCallback(async () => {
    try {
      await processarCicloNotificacoes()
    } catch {
      /* intentionally ignored */
    }
    refreshUnread()
    loadConversas()
  }, [refreshUnread, loadConversas])

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
      } else if (e.action === 'delete') {
        const deletedId = e.record.id
        setMensagens((prev) => prev.filter((m) => m.id !== deletedId))
        refreshUnread()
        loadConversas()
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

      let textoFinal = avisoTexto.trim()
      if (avisoPedirAtualizacao && !textoFinal.toLowerCase().includes('atualiz')) {
        textoFinal = `[ATUALIZAÇÃO DE SISTEMA] ${textoFinal} (Por favor, clique em Atualizar Página ou pressione F5).`
      }

      const msgAviso = await enviarMensagemChat({
        conversaId: canalGeral.id,
        texto: textoFinal,
        autorId: user.id,
        autorNome: user.name || 'Administrador',
        autorRole: 'admin',
        tipo: 'aviso',
      })

      // Se marcou pedir atualização, também emite o pulso no backend para disparar o banner em todos os navegadores
      if (avisoPedirAtualizacao) {
        try {
          await emitirAtualizacaoVersaoAdmin({
            version: '0.0.' + Math.floor(((Date.now() / 60000) % 1000) + 70),
            mensagem: avisoTexto.trim(),
            dispararChatAviso: false,
          })
        } catch (versionErr) {
          console.warn('Falha ao disparar pulso no backend:', versionErr)
        }
      }

      setAvisoTexto('')
      setAvisoPedirAtualizacao(false)
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

  // Permissão para apagar mensagem no widget flutuante
  const podeApagarMensagem = (msg: ChatMensagem) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (msg.autor === user.id) return true

    // Caso a mensagem seja do Sistema (notificação/follow-up/alerta)
    const isSistema =
      msg.tipo === 'notificacao' ||
      msg.autor_nome === 'Sistema Projeto Guerra' ||
      Boolean(msg.metadata?.tipo_evento)

    if (isSistema && activeConversa?.tipo === 'dm') {
      const parts = activeConversa.participantes || []
      if (parts.includes(user.id)) return true
    }

    return false
  }

  // Permissão para apagar a conversa inteira no widget
  const podeApagarConversa = (conv: ChatConversa | null | undefined): boolean => {
    if (!user || !conv) return false
    if (conv.tipo === 'geral') return false
    if (user.role === 'admin') return true
    if (conv.tipo === 'dm' || conv.tipo === 'kommo_whatsapp') {
      const parts = conv.participantes || []
      return parts.includes(user.id) || conv.responsavel_id === user.id
    }
    return false
  }

  // Executar exclusão confirmada de conversa no widget
  const handleConfirmarExclusaoConversa = async () => {
    if (!conversaParaExcluir) return
    const convId = conversaParaExcluir.id
    setExcluindoConversa(true)
    try {
      await apagarConversaChat(convId)
      if (activeConversa?.id === convId) {
        setActiveConversa(null)
        setMensagens([])
      }
      setConversaParaExcluir(null)
      await loadConversas()
      await refreshUnread()
    } catch (err) {
      console.error('Falha ao apagar conversa:', err)
    } finally {
      setExcluindoConversa(false)
    }
  }

  // Executar exclusão confirmada de mensagem
  const handleConfirmarExclusaoMensagem = async () => {
    if (!mensagemParaExcluir) return
    const msgId = mensagemParaExcluir.id
    setExcluindoMsg(true)
    try {
      await apagarMensagemChat(msgId)
      setMensagens((prev) => prev.filter((m) => m.id !== msgId))
      setMensagemParaExcluir(null)
      await loadConversas()
      await refreshUnread()
    } catch (err) {
      console.error('Falha ao apagar mensagem:', err)
    } finally {
      setExcluindoMsg(false)
    }
  }

  // Separar conversas por seções:
  // 1. Geral (Canal oficial de avisos)
  // 2. DMs (1:1 entre colaboradores reais)
  // Nota: Notificações do Sistema agora residem exclusivamente no painel efêmero (sininho da topbar)
  const canalGeral = conversas.find((c) => c.tipo === 'geral')
  const conversasDm = conversas.filter((c) => {
    if (c.tipo !== 'dm') return false
    const titulo = (c.titulo || '').toLowerCase()
    return (
      !titulo.startsWith('sistema &') &&
      !titulo.endsWith('& sistema') &&
      !titulo.includes('sistema projeto guerra')
    )
  })

  // Filtrar pela busca
  const filtrarPorTermo = (list: ChatConversa[]) => {
    if (!buscaConversa.trim()) return list
    const term = buscaConversa.toLowerCase()
    return list.filter((c) => {
      const t = (c.titulo || '').toLowerCase()
      const u = (c.ultimo_autor_nome || '').toLowerCase()
      const m = (c.ultima_mensagem_texto || '').toLowerCase()
      return t.includes(term) || u.includes(term) || m.includes(term)
    })
  }

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
                  processCicloAndReload()
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
                </div>
                <p className="text-[10px] text-slate-300 truncate">
                  {activeConversa
                    ? activeConversa.tipo === 'dm'
                      ? 'Conversa direta 1:1'
                      : 'Avisos, comunicados e comunicados gerais'
                    : '1:1 • Geral & Anúncios • Grupo ABR'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {/* Botão discreto de apagar conversa no header */}
              {activeConversa && podeApagarConversa(activeConversa) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setConversaParaExcluir(activeConversa)}
                      className="p-1.5 text-slate-300 hover:text-rose-400 rounded-md hover:bg-white/10 transition-colors"
                      title="Apagar conversa inteira"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Excluir conversa e mensagens
                  </TooltipContent>
                </Tooltip>
              )}

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
                      <div className="flex items-center space-x-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={processCicloAndReload}
                              disabled={loadingConversas}
                              className="h-7.5 w-7.5 p-0 text-slate-600 hover:text-[#253575] hover:bg-slate-100"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${loadingConversas ? 'animate-spin' : ''}`}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            Recarregar conversas e checar lembretes operacionais
                          </TooltipContent>
                        </Tooltip>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleOpenNovaDm}
                          className="h-7.5 px-2.5 text-xs text-[#253575] border-[#253575]/30 hover:bg-[#253575]/5 font-semibold shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          <span>Nova DM</span>
                        </Button>
                      </div>
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

                {/* 2. CONVERSAS 1:1 (DMs) */}
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
                          <div
                            key={dm.id}
                            className="w-full text-left p-2 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200/70 transition-colors flex items-center space-x-2.5 group"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectConversa(dm)}
                              className="flex items-center space-x-2.5 flex-1 min-w-0 text-left focus:outline-hidden"
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

                            {podeApagarConversa(dm) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConversaParaExcluir(dm)
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all shrink-0"
                                title="Apagar conversa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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
                {/* Banner dinâmico de boas-vindas no Canal Geral baseado no usuário logado */}
                {activeConversa.tipo === 'geral' && (
                  <div className="my-2 p-3.5 rounded-2xl bg-gradient-to-br from-white via-slate-50 to-blue-50/40 border border-[#253575]/20 shadow-xs space-y-1.5 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200/70">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-xs text-[#253575]">
                          {user?.name || 'Colaborador'}
                        </span>
                        {user?.role && (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-bold bg-[#253575]/10 text-[#253575]">
                            {user.role}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Boas-vindas</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-sans pt-0.5">
                      Bem-vindo{user?.name ? `, ${user.name}` : ''} ao chat interno do Projeto
                      Guerra! Aqui você pode trocar mensagens 1:1 com colegas da equipe, acompanhar
                      avisos oficiais e conferir novidades da operação.
                    </p>
                  </div>
                )}

                {loadingMsgs && mensagens.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto text-[#253575]" />
                    <p>Carregando histórico do chat...</p>
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                    <MessageSquare className="h-6 w-6 mx-auto text-slate-300" />
                    <p className="font-semibold text-slate-600">Nenhuma mensagem recente.</p>
                    <p className="text-[11px]">
                      Envie uma mensagem abaixo para interagir no canal!
                    </p>
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
                      const msgTextoLower = (msg.texto || '').toLowerCase()
                      const temGatilhoAtualizar =
                        msgTextoLower.includes('atualiz') ||
                        msgTextoLower.includes('relog') ||
                        msgTextoLower.includes('f5') ||
                        msgTextoLower.includes('versão') ||
                        msgTextoLower.includes('versao')

                      return (
                        <div
                          key={msg.id}
                          className="my-3 p-3 rounded-xl bg-gradient-to-r from-[#253575] to-[#142758] text-white border-2 border-[#F18800] shadow-md space-y-2 animate-in zoom-in-95"
                        >
                          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/20">
                            <div className="flex items-center space-x-1.5 font-bold text-amber-300">
                              <Megaphone className="h-4 w-4 text-[#F18800] animate-pulse" />
                              <span className="uppercase tracking-wide text-[10px]">
                                Aviso Oficial da Administração
                              </span>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] text-slate-300 font-mono">{hora}</span>
                              {podeApagarMensagem(msg) && (
                                <button
                                  type="button"
                                  onClick={() => setMensagemParaExcluir(msg)}
                                  className="text-slate-300 hover:text-rose-400 transition-colors p-0.5 rounded"
                                  title="Apagar aviso"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-white leading-relaxed whitespace-pre-wrap font-medium pt-1">
                            {msg.texto}
                          </p>
                          {temGatilhoAtualizar && (
                            <div className="pt-1">
                              <Button
                                size="sm"
                                onClick={() => window.location.reload()}
                                className="w-full h-7 bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm"
                              >
                                <RefreshCw className="h-3 w-3" />
                                <span>Recarregar Página Agora</span>
                              </Button>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-300 text-right pt-0.5">
                            Emitido por: {msg.autor_nome || 'Diretoria'}
                          </div>
                        </div>
                      )
                    }

                    // MENSAGEM DE NOTIFICAÇÃO DO SISTEMA / FOLLOW-UP / RANKING
                    const isNotificacao =
                      msg.tipo === 'notificacao' ||
                      msg.autor_nome === 'Sistema Projeto Guerra' ||
                      Boolean(msg.metadata?.tipo_evento)

                    if (isNotificacao) {
                      const evtTipo = msg.metadata?.tipo_evento
                      const isFollowup = evtTipo === 'followup_dia'
                      const isAtraso = evtTipo === 'followup_atrasado'
                      const isRanking =
                        evtTipo === 'ranking_conquista' || evtTipo === 'ranking_subida_geral'
                      const isResumo = evtTipo === 'resumo_matinal'

                      return (
                        <div
                          key={msg.id}
                          className={`my-2 p-2.5 rounded-xl border text-xs shadow-xs space-y-1.5 ${
                            isAtraso
                              ? 'bg-rose-50/95 border-rose-300 text-rose-950'
                              : isRanking
                                ? 'bg-amber-50/95 border-amber-300 text-amber-950'
                                : isFollowup
                                  ? 'bg-blue-50/95 border-blue-300 text-blue-950'
                                  : 'bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-200/70 font-semibold">
                            <span className="flex items-center gap-1">
                              {isRanking ? (
                                <Trophy className="h-3.5 w-3.5 text-amber-600" />
                              ) : isAtraso ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                              ) : isFollowup ? (
                                <Calendar className="h-3.5 w-3.5 text-[#253575]" />
                              ) : (
                                <Bell className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              <span>
                                {isRanking
                                  ? 'Conquista / Ranking'
                                  : isAtraso
                                    ? 'Follow-up Atrasado'
                                    : isFollowup
                                      ? 'Follow-up de Hoje'
                                      : isResumo
                                        ? 'Resumo 7h'
                                        : 'Notificação do Sistema'}
                              </span>
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-slate-400 font-mono">{hora}</span>
                              {podeApagarMensagem(msg) && (
                                <button
                                  type="button"
                                  onClick={() => setMensagemParaExcluir(msg)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                                  title="Descartar esta notificação"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="whitespace-pre-wrap leading-relaxed text-[11px]">
                            {msg.texto}
                          </p>

                          {(isFollowup || isAtraso || msg.metadata?.cliente_id) && (
                            <div className="pt-1 border-t border-slate-200/60 flex justify-end">
                              <Link
                                to="/atendimento"
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#253575] hover:text-[#F18800]"
                              >
                                <span>Abrir Atendimento</span>
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            </div>
                          )}

                          {isRanking && (
                            <div className="pt-1 border-t border-amber-200/60 flex justify-end">
                              <Link
                                to="/ranking"
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F18800] hover:text-[#d97b00]"
                              >
                                <span>Ver Ranking</span>
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            </div>
                          )}
                        </div>
                      )
                    }

                    // MENSAGEM PADRÃO (MINHA OU DE COLEGA)
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
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
                        <div className="relative max-w-[85%]">
                          <div
                            className={`rounded-2xl px-3 py-2 text-xs shadow-xs relative break-words ${
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

                          {/* Botão discreto para apagar mensagem */}
                          {podeApagarMensagem(msg) && (
                            <button
                              type="button"
                              onClick={() => setMensagemParaExcluir(msg)}
                              className={`absolute top-1 ${
                                isMe
                                  ? '-left-6 text-slate-400 hover:text-rose-600'
                                  : '-right-6 text-slate-400 hover:text-rose-600'
                              } opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-100`}
                              title="Apagar mensagem"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
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

              {/* Checkbox de Pedir Atualização de Página / Relogue */}
              <div className="flex items-start space-x-2 pt-1 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <Checkbox
                  id="check-pedir-atualizacao"
                  checked={avisoPedirAtualizacao}
                  onCheckedChange={(c) => setAvisoPedirAtualizacao(Boolean(c))}
                  className="mt-0.5 border-[#253575] data-[state=checked]:bg-[#F18800] data-[state=checked]:border-[#F18800]"
                />
                <label
                  htmlFor="check-pedir-atualizacao"
                  className="text-xs text-slate-700 cursor-pointer leading-tight select-none"
                >
                  <strong className="text-[#253575] block font-semibold">
                    Pedir atualização da página / relogue
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    Dispara o pulso de atualização na tela de todos os usuários logados e exibe o
                    botão direto de recarregar.
                  </span>
                </label>
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

      {/* AlertDialog de Confirmação Discreta de Exclusão de Mensagem */}
      <AlertDialog
        open={Boolean(mensagemParaExcluir)}
        onOpenChange={(open) => {
          if (!open) setMensagemParaExcluir(null)
        }}
      >
        <AlertDialogContent className="bg-white border-slate-200 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>Apagar esta mensagem?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              A mensagem será removida permanentemente do banco de dados e deixará de aparecer no
              histórico desta conversa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={excluindoMsg} className="text-xs h-8">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusaoMensagem}
              disabled={excluindoMsg}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 font-semibold"
            >
              {excluindoMsg ? 'Apagando...' : 'Sim, apagar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação Discreta de Exclusão de Conversa Inteira */}
      <AlertDialog
        open={Boolean(conversaParaExcluir)}
        onOpenChange={(open) => {
          if (!open) setConversaParaExcluir(null)
        }}
      >
        <AlertDialogContent className="bg-white border-slate-200 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>Excluir esta conversa?</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              A conversa inteira e todas as suas mensagens serão excluídas permanentemente do chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={excluindoConversa} className="text-xs h-8">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarExclusaoConversa}
              disabled={excluindoConversa}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 font-semibold"
            >
              {excluindoConversa ? 'Excluindo...' : 'Sim, excluir conversa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
