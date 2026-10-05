import React, { useState, useEffect, useRef, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  MessageSquare,
  Megaphone,
  Radio,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Send,
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
  ChevronRight,
  Sliders,
  X,
  Search,
  Check,
  Kanban,
  ExternalLink,
  ChevronDown,
  Clock,
  History,
  Tag,
  DollarSign,
  MoveRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { derivePresenceStatus, usePresence } from '@/hooks/usePresence'
import {
  fetchAtendimentoFunis,
  createAtendimentoFunil,
  updateAtendimentoFunil,
  deleteAtendimentoFunil,
  createAtendimentoFunilEtapa,
  updateAtendimentoFunilEtapa,
  deleteAtendimentoFunilEtapa,
  fetchAtendimentoFunilCards,
  createAtendimentoFunilCard,
  updateAtendimentoFunilCard,
  moverCardEtapa,
  deleteAtendimentoFunilCard,
  fetchKommoRecentActivity,
} from '@/services/hubAtendimento'
import { fetchUsers } from '@/services/api'
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
import type {
  AtendimentoFunil,
  AtendimentoFunilEtapa,
  AtendimentoFunilCard,
  KommoBridgeResponse,
  KommoBridgeItem,
  ChatConversa,
  ChatMensagem,
  ChatUnreadCountsResponse,
  User,
} from '@/types'

// Modelo unificado de Contato/Lead para a Barra Lateral Fixa
export interface ContatoHubItem {
  id: string
  tipo: 'kommo' | 'chat_dm' | 'chat_canal'
  nome: string
  subtitulo?: string
  telefone?: string
  email?: string
  canal?: string
  badge?: string
  unreadCount?: number
  isOnline?: boolean
  initials: string
  conversaRef?: ChatConversa
  kommoRef?: KommoBridgeItem
  userId?: string
}

export default function HubAtendimentoPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { presenceData } = usePresence({ pollStatus: true })

  // ==========================================
  // CONTROLE DA ABA ATIVA DO HUB (Conversa vs Funil)
  // ==========================================
  const [hubTab, setHubTab] = useState<'conversa' | 'funil'>('conversa')

  // ==========================================
  // ESTADOS: FUNIS E ETAPAS
  // ==========================================
  const [funis, setFunis] = useState<AtendimentoFunil[]>([])
  const [loadingFunis, setLoadingFunis] = useState(true)
  const [funilAtivoId, setFunilAtivoId] = useState<string>('')

  // Modais de Funil
  const [modalNovoFunilOpen, setModalNovoFunilOpen] = useState(false)
  const [nomeNovoFunil, setNomeNovoFunil] = useState('')
  const [descNovoFunil, setDescNovoFunil] = useState('')
  const [corNovoFunil, setCorNovoFunil] = useState('#253575')
  const [salvandoFunil, setSalvandoFunil] = useState(false)

  const [modalEditarFunilOpen, setModalEditarFunilOpen] = useState(false)
  const [funilEmEdicao, setFunilEmEdicao] = useState<AtendimentoFunil | null>(null)
  const [nomeEdicaoFunil, setNomeEdicaoFunil] = useState('')
  const [descEdicaoFunil, setDescEdicaoFunil] = useState('')
  const [corEdicaoFunil, setCorEdicaoFunil] = useState('#253575')

  // Modais de Etapa
  const [modalNovaEtapaOpen, setModalNovaEtapaOpen] = useState(false)
  const [nomeNovaEtapa, setNomeNovaEtapa] = useState('')
  const [tipoNovaEtapa, setTipoNovaEtapa] = useState<'normal' | 'sucesso' | 'perda'>('normal')
  const [corNovaEtapa, setCorNovaEtapa] = useState('#3b82f6')
  const [salvandoEtapa, setSalvandoEtapa] = useState(false)

  const [modalEditarEtapaOpen, setModalEditarEtapaOpen] = useState(false)
  const [etapaEmEdicao, setEtapaEmEdicao] = useState<AtendimentoFunilEtapa | null>(null)
  const [nomeEdicaoEtapa, setNomeEdicaoEtapa] = useState('')
  const [tipoEdicaoEtapa, setTipoEdicaoEtapa] = useState<'normal' | 'sucesso' | 'perda'>('normal')
  const [corEdicaoEtapa, setCorEdicaoEtapa] = useState('#3b82f6')

  // ==========================================
  // ESTADOS: CARDS DO PIPELINE / KANBAN
  // ==========================================
  const [cards, setCards] = useState<AtendimentoFunilCard[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [cardDestacadoId, setCardDestacadoId] = useState<string | null>(null)

  // Drag and drop HTML5 nativo simples e robusto
  const [cardArrastandoId, setCardArrastandoId] = useState<string | null>(null)
  const [colunaHoverId, setColunaHoverId] = useState<string | null>(null)

  // Modal Criar Card no Funil
  const [modalNovoCardOpen, setModalNovoCardOpen] = useState(false)
  const [etapaDestinoNovoCard, setEtapaDestinoNovoCard] = useState<string>('')
  const [novoCardTitulo, setNovoCardTitulo] = useState('')
  const [novoCardContatoNome, setNovoCardContatoNome] = useState('')
  const [novoCardTelefone, setNovoCardTelefone] = useState('')
  const [novoCardEmail, setNovoCardEmail] = useState('')
  const [novoCardValor, setNovoCardValor] = useState('')
  const [novoCardNotas, setNovoCardNotas] = useState('')
  const [salvandoCard, setSalvandoCard] = useState(false)

  // Modal Ver/Editar Card
  const [modalDetalhesCardOpen, setModalDetalhesCardOpen] = useState(false)
  const [cardEmDetalhes, setCardEmDetalhes] = useState<AtendimentoFunilCard | null>(null)

  // ==========================================
  // ESTADOS: BRIDGE KOMMO (SOMENTE LEITURA)
  // ==========================================
  const [kommoData, setKommoData] = useState<KommoBridgeResponse | null>(null)
  const [loadingKommo, setLoadingKommo] = useState(false)

  // ==========================================
  // ESTADOS: CONVERSAS / CHAT (ESTILO WHATSAPP)
  // ==========================================
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

  // ==========================================
  // ESTADOS: BARRA FIXA DE CONTATOS (ESTILO WHATSAPP)
  // ==========================================
  const [buscaContatoBarra, setBuscaContatoBarra] = useState('')
  const [filtroTipoContato, setFiltroTipoContato] = useState<'todos' | 'crm' | 'equipe'>('crm')
  const [contatoSelecionadoId, setContatoSelecionadoId] = useState<string | null>(null)
  const [todosUsuarios, setTodosUsuarios] = useState<User[]>([])

  // ==========================================
  // ESTADOS: MODO SUPERVISÃO DE CONVERSAS (EXCLUSIVO ADMIN)
  // ==========================================
  // Permite ao admin filtrar e ler conversas de qualquer vendedor em modo somente-leitura
  const [vendedorSupervisionadoId, setVendedorSupervisionadoId] = useState<string>('')
  const [conversasSupervisaoVendedor, setConversasSupervisaoVendedor] = useState<ChatConversa[]>([])
  const [loadingSupervisao, setLoadingSupervisao] = useState(false)

  // ==========================================
  // ESTADOS: MODAL DE AVISO DO ADMIN PRESERVADO
  // ==========================================
  const [modalAvisoOpen, setModalAvisoOpen] = useState(false)
  const [avisoTexto, setAvisoTexto] = useState('')
  const [avisoPedirAtualizacao, setAvisoPedirAtualizacao] = useState(false)
  const [enviandoAviso, setEnviandoAviso] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ==========================================
  // CARREGAMENTOS INICIAIS
  // ==========================================
  const carregarFunis = async () => {
    setLoadingFunis(true)
    try {
      const data = await fetchAtendimentoFunis()
      setFunis(data)
      if (data.length > 0 && !funilAtivoId) {
        setFunilAtivoId(data[0].id)
      }
    } catch (err) {
      console.error('Erro ao carregar funis de atendimento:', err)
      toast({
        title: 'Falha ao carregar funis',
        description: 'Verifique as permissões de administrador.',
        variant: 'destructive',
      })
    } finally {
      setLoadingFunis(false)
    }
  }

  const carregarCards = async (funilId: string) => {
    if (!funilId) return
    setLoadingCards(true)
    try {
      const data = await fetchAtendimentoFunilCards(funilId)
      setCards(data)
    } catch (err) {
      console.warn('Erro ao carregar cards do funil:', err)
    } finally {
      setLoadingCards(false)
    }
  }

  const carregarKommo = async () => {
    setLoadingKommo(true)
    try {
      const res = await fetchKommoRecentActivity()
      setKommoData(res)
    } catch (err) {
      console.error('Erro ao consultar bridge Kommo:', err)
    } finally {
      setLoadingKommo(false)
    }
  }

  const carregarMensagens = useCallback(async (conversaId: string) => {
    setLoadingMensagens(true)
    try {
      const res = await fetchMensagensConversa(conversaId, 1, 50)
      setMensagens(res.items)
      await marcarConversaLida(conversaId)
      // Atualiza badge de não lidas localmente
      setUnreadCounts((prev) => {
        const copy = { ...prev.by_conversation }
        const diff = copy[conversaId] || 0
        delete copy[conversaId]
        return {
          total_unread: Math.max(0, prev.total_unread - diff),
          by_conversation: copy,
        }
      })
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err)
    } finally {
      setLoadingMensagens(false)
    }
  }, [])

  // Ref da conversa ativa para uso dentro de callbacks e realtime sem invalidar hooks
  const activeConversaRef = useRef<ChatConversa | null>(null)
  activeConversaRef.current = activeConversa

  const carregarConversas = useCallback(
    async (selecionarPrimeiraSeNula = false) => {
      if (!user) return
      setLoadingConversas(true)
      try {
        const [list, usuariosList] = await Promise.all([
          fetchConversasUsuario(user.role || 'admin', user.regioes || [], user.id),
          fetchUsers().catch(() => [] as User[]),
        ])
        setConversas(list)
        if (usuariosList && usuariosList.length > 0) {
          setTodosUsuarios(usuariosList)
        }

        const unread = await fetchUnreadCounts()
        setUnreadCounts(unread)

        // Se solicitado ou não tiver conversa ativa, define a primeira (ex.: Canal Geral)
        if ((selecionarPrimeiraSeNula || !activeConversaRef.current) && list.length > 0) {
          const canalGeral = list.find((c) => c.tipo === 'geral') || list[0]
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
    // Chave de dependências estáveis para o usuário (evita recriação a cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.role, JSON.stringify(user?.regioes || []), carregarMensagens],
  )

  useEffect(() => {
    carregarFunis()
    carregarKommo()
  }, [user])

  // Carregamento inicial de conversas ao montar ou mudar o usuário autenticado
  useEffect(() => {
    if (user?.id) {
      carregarConversas(true)
    }
  }, [user?.id, carregarConversas])

  useEffect(() => {
    if (funilAtivoId) {
      carregarCards(funilAtivoId)
    }
  }, [funilAtivoId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // Assinatura Realtime (PocketBase) para mensagens e conversas — elimina necessidade de polling agressivo
  useEffect(() => {
    if (!user) return

    // 1. Assinar novas mensagens (chat_mensagens)
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
          // Mensagem em outra conversa: atualiza contadores de não lidas
          fetchUnreadCounts()
            .then(setUnreadCounts)
            .catch(() => {})
        }
      }
    })

    // 2. Assinar atualizações de conversas (chat_conversas)
    const unsubConversasPromise = pb.collection('chat_conversas').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') {
        const convAtualizada = e.record as unknown as ChatConversa
        // Atualiza a lista lateral com a última mensagem sem refetch completo
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

  // Polling leve e estável de fallback (a cada 30 segundos) com dependência exclusiva do ID da conversa ativa
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

  // Se o Kommo carregar e não tiver nenhum card no primeiro funil, sincronizar sementes visíveis automaticamente
  useEffect(() => {
    const semearCardsIniciaisKommo = async () => {
      if (
        loadingCards ||
        loadingFunis ||
        !funilAtivoId ||
        cards.length > 0 ||
        !kommoData?.items?.length
      ) {
        return
      }

      const funil = funis.find((f) => f.id === funilAtivoId)
      if (!funil?.etapas?.length) return

      const primeiraEtapa = funil.etapas[0]
      const segundaEtapa = funil.etapas[1] || primeiraEtapa
      const terceiraEtapa = funil.etapas[2] || segundaEtapa

      // Cria cards espelhados dos primeiros leads do Kommo para teste interativo
      const amostragem = kommoData.items.slice(0, 6)
      for (let i = 0; i < amostragem.length; i++) {
        const item = amostragem[i]
        const etapaAlvo =
          i === 0 ? primeiraEtapa : i === 1 ? segundaEtapa : i === 2 ? terceiraEtapa : primeiraEtapa
        try {
          await createAtendimentoFunilCard({
            funil: funilAtivoId,
            etapa: etapaAlvo.id,
            titulo: item.nome_lead || `Lead #${item.id}`,
            contato_nome: item.nome_contato,
            telefone: item.telefone,
            email: item.email,
            valor: item.valor,
            ordem: i + 1,
            origem: 'kommo_bridge',
            kommo_id: item.id,
            notas: `Lead importado do Bridge Kommo CRM (${item.pipeline_nome} · ${item.status_nome}). Modo somente-leitura.`,
          })
        } catch {
          /* ignore */
        }
      }
      await carregarCards(funilAtivoId)
    }

    semearCardsIniciaisKommo()
  }, [kommoData, funilAtivoId, cards.length, funis, loadingCards, loadingFunis])

  // ==========================================
  // FUNÇÕES DE FUNIS E ETAPAS
  // ==========================================
  const handleSalvarNovoFunil = async () => {
    if (!nomeNovoFunil.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }
    setSalvandoFunil(true)
    try {
      const novo = await createAtendimentoFunil({
        nome: nomeNovoFunil,
        descricao: descNovoFunil,
        cor_hex: corNovoFunil,
        ordem: funis.length + 1,
      })
      toast({ title: 'Funil criado com sucesso!' })
      setNomeNovoFunil('')
      setDescNovoFunil('')
      setModalNovoFunilOpen(false)
      await carregarFunis()
      setFunilAtivoId(novo.id)
    } catch (err) {
      toast({
        title: 'Erro ao criar funil',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvandoFunil(false)
    }
  }

  const handleSalvarEdicaoFunil = async () => {
    if (!funilEmEdicao || !nomeEdicaoFunil.trim()) return
    setSalvandoFunil(true)
    try {
      await updateAtendimentoFunil(funilEmEdicao.id, {
        nome: nomeEdicaoFunil,
        descricao: descEdicaoFunil,
        cor_hex: corEdicaoFunil,
      })
      toast({ title: 'Funil atualizado com sucesso!' })
      setModalEditarFunilOpen(false)
      setFunilEmEdicao(null)
      await carregarFunis()
    } catch (err) {
      toast({
        title: 'Erro ao atualizar funil',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvandoFunil(false)
    }
  }

  const handleExcluirFunil = async (funil: AtendimentoFunil) => {
    if (
      !confirm(`Tem certeza que deseja excluir o funil "${funil.nome}" e todas as suas etapas?`)
    ) {
      return
    }
    try {
      await deleteAtendimentoFunil(funil.id)
      toast({ title: 'Funil excluído com sucesso.' })
      await carregarFunis()
      const restantes = funis.filter((f) => f.id !== funil.id)
      if (restantes.length > 0) {
        setFunilAtivoId(restantes[0].id)
      } else {
        setFunilAtivoId('')
      }
    } catch (err) {
      toast({
        title: 'Erro ao excluir funil',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  const handleSalvarNovaEtapa = async () => {
    if (!funilAtivoId || !nomeNovaEtapa.trim()) {
      toast({ title: 'Nome da etapa é obrigatório', variant: 'destructive' })
      return
    }
    const funilAtual = funis.find((f) => f.id === funilAtivoId)
    const totalEtapas = funilAtual?.etapas?.length || 0

    setSalvandoEtapa(true)
    try {
      await createAtendimentoFunilEtapa({
        funilId: funilAtivoId,
        nome: nomeNovaEtapa,
        ordem: totalEtapas + 1,
        cor_hex: corNovaEtapa,
        tipo_desfecho: tipoNovaEtapa,
      })
      toast({ title: 'Etapa criada com sucesso!' })
      setNomeNovaEtapa('')
      setModalNovaEtapaOpen(false)
      await carregarFunis()
    } catch (err) {
      toast({
        title: 'Erro ao criar etapa',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvandoEtapa(false)
    }
  }

  const handleSalvarEdicaoEtapa = async () => {
    if (!etapaEmEdicao || !nomeEdicaoEtapa.trim()) return
    setSalvandoEtapa(true)
    try {
      await updateAtendimentoFunilEtapa(etapaEmEdicao.id, {
        nome: nomeEdicaoEtapa,
        cor_hex: corEdicaoEtapa,
        tipo_desfecho: tipoEdicaoEtapa,
      })
      toast({ title: 'Etapa atualizada com sucesso!' })
      setModalEditarEtapaOpen(false)
      setEtapaEmEdicao(null)
      await carregarFunis()
    } catch (err) {
      toast({
        title: 'Erro ao atualizar etapa',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvandoEtapa(false)
    }
  }

  const handleExcluirEtapa = async (etapa: AtendimentoFunilEtapa) => {
    if (!confirm(`Excluir a etapa "${etapa.nome}"?`)) return
    try {
      await deleteAtendimentoFunilEtapa(etapa.id)
      toast({ title: 'Etapa excluída.' })
      await carregarFunis()
    } catch (err) {
      toast({
        title: 'Erro ao excluir etapa',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  // ==========================================
  // FUNÇÕES DE CARDS DO PIPELINE / KANBAN
  // ==========================================
  const handleMudarEstagioCardDropdown = async (
    card: AtendimentoFunilCard,
    novaEtapaId: string,
  ) => {
    if (card.etapa === novaEtapaId) return
    const etapaObj = funilAtual?.etapas?.find((e) => e.id === novaEtapaId)
    try {
      // Otimista
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, etapa: novaEtapaId } : c)))
      await moverCardEtapa(card, novaEtapaId, etapaObj?.nome)
      toast({
        title: 'Estágio atualizado!',
        description: `Card movido para "${etapaObj?.nome || 'nova etapa'}".`,
      })
      if (funilAtivoId) {
        await carregarCards(funilAtivoId)
      }
    } catch (err) {
      toast({
        title: 'Erro ao mover card',
        description: String(err),
        variant: 'destructive',
      })
      if (funilAtivoId) carregarCards(funilAtivoId)
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setCardArrastandoId(cardId)
    e.dataTransfer.setData('text/plain', cardId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (colunaHoverId !== etapaId) {
      setColunaHoverId(etapaId)
    }
  }

  const handleDragLeave = (_e: React.DragEvent, etapaId: string) => {
    if (colunaHoverId === etapaId) {
      setColunaHoverId(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, destinoEtapaId: string) => {
    e.preventDefault()
    setColunaHoverId(null)
    const cardId = e.dataTransfer.getData('text/plain') || cardArrastandoId
    setCardArrastandoId(null)

    if (!cardId) return
    const card = cards.find((c) => c.id === cardId)
    if (!card || card.etapa === destinoEtapaId) return

    await handleMudarEstagioCardDropdown(card, destinoEtapaId)
  }

  const handleAbrirNovoCardModal = (etapaId?: string) => {
    const funil = funis.find((f) => f.id === funilAtivoId)
    const etapaInicial = etapaId || funil?.etapas?.[0]?.id || ''
    setEtapaDestinoNovoCard(etapaInicial)
    setNovoCardTitulo('')
    setNovoCardContatoNome('')
    setNovoCardTelefone('')
    setNovoCardEmail('')
    setNovoCardValor('')
    setNovoCardNotas('')
    setModalNovoCardOpen(true)
  }

  const handleSalvarNovoCard = async () => {
    if (!novoCardTitulo.trim() || !etapaDestinoNovoCard || !funilAtivoId) {
      toast({
        title: 'Título e etapa são obrigatórios',
        variant: 'destructive',
      })
      return
    }

    setSalvandoCard(true)
    try {
      await createAtendimentoFunilCard({
        funil: funilAtivoId,
        etapa: etapaDestinoNovoCard,
        titulo: novoCardTitulo.trim(),
        contato_nome: novoCardContatoNome.trim() || undefined,
        telefone: novoCardTelefone.trim() || undefined,
        email: novoCardEmail.trim() || undefined,
        valor: novoCardValor ? parseFloat(novoCardValor.replace(',', '.')) : undefined,
        notas: novoCardNotas.trim() || undefined,
        origem: 'manual',
      })

      toast({ title: 'Card adicionado ao funil!' })
      setModalNovoCardOpen(false)
      await carregarCards(funilAtivoId)
    } catch (err) {
      toast({
        title: 'Erro ao criar card',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSalvandoCard(false)
    }
  }

  const handleExcluirCard = async (card: AtendimentoFunilCard) => {
    if (!confirm(`Excluir o card "${card.titulo}"?`)) return
    try {
      await deleteAtendimentoFunilCard(card.id)
      toast({ title: 'Card removido do funil.' })
      setModalDetalhesCardOpen(false)
      setCardEmDetalhes(null)
      if (funilAtivoId) await carregarCards(funilAtivoId)
    } catch (err) {
      toast({
        title: 'Erro ao excluir card',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  // Adicionar contato da barra diretamente ao funil como card
  const handleAdicionarContatoAoFunil = async (contato: ContatoHubItem) => {
    if (!funilAtivoId || !funilAtual?.etapas?.length) {
      toast({ title: 'Nenhum funil ou etapa disponível', variant: 'destructive' })
      return
    }

    const primeiraEtapa = funilAtual.etapas[0]
    try {
      const cardCriado = await createAtendimentoFunilCard({
        funil: funilAtivoId,
        etapa: primeiraEtapa.id,
        titulo: contato.nome,
        contato_nome: contato.nome,
        telefone: contato.telefone,
        email: contato.email,
        origem: contato.tipo === 'kommo' ? 'kommo_bridge' : 'chat_interno',
        kommo_id: contato.kommoRef?.id,
        notas: `Lead adicionado ao funil a partir do contato da barra (${contato.canal || 'Guerra'}).`,
      })
      toast({
        title: 'Card criado no pipeline!',
        description: `Adicionado à etapa "${primeiraEtapa.nome}".`,
      })
      await carregarCards(funilAtivoId)
      setCardDestacadoId(cardCriado.id)
      setHubTab('funil')
    } catch (err) {
      toast({
        title: 'Falha ao vincular contato ao funil',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  // ==========================================
  // FUNÇÕES DE CHAT / WHATSAPP STYLE
  // ==========================================
  const handleSelecionarConversa = async (c: ChatConversa) => {
    setActiveConversa(c)
    setContatoSelecionadoId(c.id)
    await carregarMensagens(c.id)
  }

  const handleEnviarMensagem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!novoTextoMsg.trim() || !activeConversa || !user || enviandoMsg) return

    setEnviandoMsg(true)
    try {
      const msg = await enviarMensagemChat({
        conversaId: activeConversa.id,
        texto: novoTextoMsg,
        autorId: user.id,
        autorNome: user.name || 'Administrador',
        autorRole: user.role || 'admin',
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
      setHubTab('conversa')
    } catch (err) {
      toast({
        title: 'Erro ao iniciar conversa 1:1',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  // Disparar aviso geral admin
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
            version: '0.0.71',
            mensagem: avisoTexto.trim(),
            dispararChatAviso: false,
          })
        } catch {
          /* intentionally ignored */
        }
      }

      toast({
        title: 'Aviso publicado com sucesso!',
        description: 'Todos os colaboradores receberão o aviso no chat interno.',
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

  // Identificar se a conversa ativa está em modo de supervisão (admin lendo conversa de terceiro ou vendedor selecionado)
  const vendedorSupervisionadoObj = todosUsuarios.find((u) => u.id === vendedorSupervisionadoId)

  const isModoSupervisao = Boolean(
    user?.role === 'admin' &&
    (vendedorSupervisionadoId ||
      (activeConversa?.tipo === 'dm' &&
        Array.isArray(activeConversa.participantes) &&
        !activeConversa.participantes.includes(user.id))),
  )

  // Nome do vendedor supervisionado para o banner
  const nomeVendedorSupervisao =
    vendedorSupervisionadoObj?.name ||
    vendedorSupervisionadoObj?.email ||
    (activeConversa?.tipo === 'dm'
      ? activeConversa.titulo?.replace('&', 'e')
      : 'Vendedor Selecionado')

  // Formatação de DM para exibição estilo WhatsApp
  const getDmDisplay = (conv: ChatConversa) => {
    const parts = conv.titulo?.split('&').map((s) => s.trim()) || []
    const myName = (user?.name || user?.email || '').trim()
    // Se o admin não participa da conversa, mostra os participantes da DM
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

  const funilAtual = funis.find((f) => f.id === funilAtivoId)

  // ==========================================
  // MONTAGEM DAS LISTAS SEPARADAS: EXTERNOS (KOMMO CRM) E INTERNOS (EQUIPE)
  // Atendendo: "nessas 3 barrinhas, eu prefiro que separe o que é interno e o que é externo"
  // e visão de supervisão do admin para ler conversa de qualquer vendedor
  // ==========================================
  const contatosExternos: ContatoHubItem[] = []
  const contatosInternos: ContatoHubItem[] = []

  // 1. Contatos Externos (Kommo CRM — clientes e leads, badge azul #253575)
  if (kommoData?.items) {
    for (const item of kommoData.items) {
      contatosExternos.push({
        id: `kommo_${item.id}`,
        tipo: 'kommo',
        nome: item.nome_contato || item.nome_lead,
        subtitulo: `${item.nome_lead} • ${item.pipeline_nome} (${item.status_nome})`,
        telefone: item.telefone,
        email: item.email,
        canal: item.canal || 'Kommo CRM',
        badge: item.status_nome || 'Kommo',
        initials: (item.nome_contato || item.nome_lead || 'KM').slice(0, 2).toUpperCase(),
        kommoRef: item,
      })
    }
  }

  // 2. Contatos Internos (Equipe do sistema + canais de rota/Geral, badge esmeralda)
  // 2.1 Canais e DMs já existentes
  const userIdsComDm = new Set<string>()

  // Se o admin selecionou um vendedor para supervisão, filtramos as conversas pelo vendedor selecionado
  const conversasFiltradasPorSupervisao = conversas.filter((c) => {
    if (!vendedorSupervisionadoId) return true
    // Canais gerais/rota continuam acessíveis ou são filtrados se rota coincidir
    if (c.tipo === 'geral' || c.tipo === 'canal_rota') return true
    if (c.tipo === 'dm') {
      return Array.isArray(c.participantes) && c.participantes.includes(vendedorSupervisionadoId)
    }
    return true
  })

  for (const c of conversasFiltradasPorSupervisao) {
    const isDm = c.tipo === 'dm'
    const dmInfo = isDm ? getDmDisplay(c) : null
    const nome = isDm ? dmInfo?.name || 'DM' : c.titulo || 'Canal'
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
        (c.tipo === 'geral' ? 'Canal Geral de comunicados' : 'Canal por rota'),
      canal: isDm ? '1:1 Equipe' : 'Canal Interno',
      unreadCount: unread,
      badge: c.tipo === 'geral' ? 'Geral' : c.tipo === 'canal_rota' ? 'Rota' : 'Equipe',
      isOnline: isDm ? dmInfo?.isOnline : undefined,
      initials: isDm ? dmInfo?.initials || 'DM' : '#',
      conversaRef: c,
    })
  }

  // 2.2 Visão de equipe / supervisão do Admin: listar colaboradores da equipe mesmo sem DM iniciada
  // permitindo que o admin filtre e abra a conversa de qualquer vendedor/operador diretamente
  if (user?.role === 'admin' && todosUsuarios.length > 0) {
    for (const colab of todosUsuarios) {
      if (colab.id === user.id) continue
      // Se há um vendedor sob supervisão selecionado e não for ele, ignorar
      if (vendedorSupervisionadoId && colab.id !== vendedorSupervisionadoId) continue
      if (userIdsComDm.has(colab.id)) continue // Já possui DM na lista

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
              : 'Vendedor/Operador'

      contatosInternos.push({
        id: `colab_${colab.id}`,
        tipo: 'chat_dm',
        nome: colab.name || colab.email,
        subtitulo: `${roleLabel}${colab.regioes && colab.regioes.length > 0 ? ` • ${colab.regioes.join(', ')}` : ''}`,
        email: colab.email,
        telefone: colab.telefone,
        canal: 'Equipe Interna',
        badge: roleLabel,
        isOnline: presenceInfo.status === 'online',
        initials: (colab.name || colab.email || 'CL').slice(0, 2).toUpperCase(),
        userId: colab.id,
      })
    }
  }

  // Lista agregada unificada
  const contatosUnificados: ContatoHubItem[] = [...contatosExternos, ...contatosInternos]

  // Função auxiliar de busca textual
  const matchesBusca = (item: ContatoHubItem) => {
    if (!buscaContatoBarra.trim()) return true
    const term = buscaContatoBarra.toLowerCase()
    return (
      item.nome.toLowerCase().includes(term) ||
      (item.subtitulo && item.subtitulo.toLowerCase().includes(term)) ||
      (item.telefone && item.telefone.includes(term)) ||
      (item.email && item.email.toLowerCase().includes(term)) ||
      (item.canal && item.canal.toLowerCase().includes(term))
    )
  }

  const externosFiltrados = contatosExternos.filter(matchesBusca)
  const internosFiltrados = contatosInternos.filter(matchesBusca)

  // Filtragem conforme o botão ativo: 'todos', 'crm' (externos) ou 'equipe' (internos)
  const contatosFiltrados =
    filtroTipoContato === 'crm'
      ? externosFiltrados
      : filtroTipoContato === 'equipe'
        ? internosFiltrados
        : [...externosFiltrados, ...internosFiltrados]

  // Clicar em um contato da barra fixa estilo WhatsApp
  const handleSelecionarContatoBarra = async (contato: ContatoHubItem) => {
    setContatoSelecionadoId(contato.id)

    // Se for conversa já existente do chat, abre
    if (contato.conversaRef) {
      await handleSelecionarConversa(contato.conversaRef)
    } else if (contato.userId) {
      // É um vendedor/colaborador sem DM iniciada: admin abre ou cria na hora
      try {
        const conv = await getOrCreateDm(contato.userId)
        await carregarConversas()
        setActiveConversa(conv)
        setContatoSelecionadoId(conv.id)
        await carregarMensagens(conv.id)
        setHubTab('conversa')
      } catch (err) {
        toast({
          title: 'Erro ao abrir conversa com colaborador',
          description: String(err),
          variant: 'destructive',
        })
      }
    }

    // Vinculação Contato ↔ Card no Pipeline
    // Procura se já existe um card correspondente no Kanban
    const cardCorrespondente = cards.find(
      (c) =>
        (contato.kommoRef && c.kommo_id === contato.kommoRef.id) ||
        c.contato_nome?.toLowerCase() === contato.nome.toLowerCase() ||
        c.titulo.toLowerCase().includes(contato.nome.toLowerCase()),
    )

    if (cardCorrespondente) {
      setCardDestacadoId(cardCorrespondente.id)
    } else {
      setCardDestacadoId(null)
    }
  }

  // Clicar em um card do pipeline destaca o contato correspondente na barra esquerda
  const handleSelecionarCardPipeline = (card: AtendimentoFunilCard) => {
    setCardDestacadoId(card.id)

    // Achar contato correspondente na barra
    const contatoCorrespondente = contatosUnificados.find(
      (c) =>
        (card.kommo_id && c.kommoRef?.id === card.kommo_id) ||
        (card.contato_nome && c.nome.toLowerCase() === card.contato_nome.toLowerCase()) ||
        c.nome.toLowerCase() === card.titulo.toLowerCase(),
    )

    if (contatoCorrespondente) {
      setContatoSelecionadoId(contatoCorrespondente.id)
    }
  }

  return (
    <div className="space-y-5 pb-12">
      {/* =========================================================================
       * CABEÇALHO DO HUB DE ATENDIMENTO (V0.0.71 ADMIN-ONLY)
       * ========================================================================= */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs relative overflow-hidden">
        {/* Grafismo proprietário Grupo ABR */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#253575] flex">
          <div className="h-full w-40 bg-[#F18800] rounded-r-full" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-1">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Badge className="bg-[#253575] text-white hover:bg-[#253575] text-xs font-semibold px-2.5 py-0.5">
                v0.0.71 · Piloto
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium flex items-center gap-1"
              >
                <ShieldCheck className="h-3 w-3 text-amber-600" />
                Exclusivo Administrador (Thiago Almeida)
              </Badge>
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-800 text-[11px] font-semibold flex items-center gap-1"
              >
                <Radio className="h-3 w-3 text-blue-600" />
                Kommo CRM Somente-Leitura
              </Badge>
            </div>
            <h1 className="text-2xl font-black text-[#253575] tracking-tight flex items-center gap-2">
              Hub de Atendimento
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
              Central de atendimento conversacional com barra lateral fixa de contatos (estilo
              WhatsApp), painel de troca de mensagens em tempo real e funil pipeline com Kanban
              arrastável e vinculação automática com cards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                carregarFunis()
                if (funilAtivoId) carregarCards(funilAtivoId)
                carregarKommo()
                carregarConversas()
              }}
              disabled={loadingFunis || loadingCards}
              className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${
                  loadingFunis || loadingCards ? 'animate-spin' : ''
                }`}
              />
              Recarregar
            </Button>

            {/* Botão de Aviso Admin com pulso de atualização preservado */}
            <Button
              size="sm"
              onClick={() => setModalAvisoOpen(true)}
              className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs shadow-xs"
            >
              <Megaphone className="h-3.5 w-3.5 mr-1.5" />
              Enviar Aviso Geral
            </Button>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE AS DUAS ÁREAS DO HUB: CONVERSA VS FUNIL */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Tabs
            value={hubTab}
            onValueChange={(val) => setHubTab(val as 'conversa' | 'funil')}
            className="w-full sm:w-auto"
          >
            <TabsList className="bg-slate-100/90 p-1 border border-slate-200/70 h-10">
              <TabsTrigger
                value="conversa"
                className="flex items-center space-x-2 text-xs font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs px-4"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Tela de Conversa (Estilo WhatsApp)</span>
                {unreadCounts.total_unread > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCounts.total_unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="funil"
                className="flex items-center space-x-2 text-xs font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white data-[state=active]:shadow-xs px-4"
              >
                <Kanban className="h-4 w-4" />
                <span>Funil / Pipeline (Kanban)</span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 bg-white/20 text-inherit font-mono"
                >
                  {cards.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Seletor de Funil Ativo visível em ambas as abas para alternância rápida */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap hidden md:inline">
              Funil Ativo:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {funis.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFunilAtivoId(f.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    funilAtivoId === f.id
                      ? 'bg-[#253575] text-white border-[#253575] shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: f.cor_hex || '#253575' }}
                  />
                  <span>{f.nome}</span>
                </button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalNovoFunilOpen(true)}
                className="h-7 text-xs border-dashed text-slate-600 hover:text-[#253575] hover:bg-slate-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Novo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
       * CORPO PRINCIPAL COM BARRA DE CONTATOS FIXA À ESQUERDA (ESTILO WHATSAPP)
       * E ÁREA DINÂMICA À DIREITA (CONVERSA OU FUNIL/KANBAN)
       * ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* =======================================================================
         * BARRA LATERAL FIXA DE CONTATOS (ESTILO WHATSAPP WEB) — 4 COLS EM DESKTOP
         * "a barra que ficará sempre aberta, deve ser a dos contatos"
         * ======================================================================= */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="border-slate-200/90 shadow-sm flex flex-col h-[740px] overflow-hidden bg-slate-100/90">
            {/* Header da Barra de Contatos */}
            <div className="p-3.5 bg-slate-50/95 border-b border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-lg bg-[#253575] text-white flex items-center justify-center font-bold">
                    <UserIcon className="h-4 w-4 text-[#F18800]" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Contatos & Leads
                    </h2>
                    <p className="text-[10px] text-slate-400">Barra fixa estilo WhatsApp</p>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAbrirNovaDm}
                    className="h-7 px-2 text-xs text-[#253575] hover:bg-slate-200/60 font-semibold"
                    title="Nova DM com colaborador"
                  >
                    <Plus className="h-3.5 w-3.5 mr-0.5" />
                    DM
                  </Button>
                </div>
              </div>

              {/* Campo de Busca de Contatos */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Pesquisar contato, lead ou canal..."
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

              {/* Abas / Filtros de Separação Explícita: Externos (Kommo CRM) e Internos (Equipe / Canais) */}
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/60 rounded-xl">
                  {/* Aba EXTERNOS (Kommo CRM) — Badge azul #253575 dominante */}
                  <button
                    type="button"
                    onClick={() => setFiltroTipoContato('crm')}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filtroTipoContato === 'crm'
                        ? 'bg-[#253575] text-white shadow-xs'
                        : 'text-slate-600 hover:text-[#253575] hover:bg-white/60'
                    }`}
                    title="Contatos Externos (Clientes e Leads Kommo CRM)"
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        filtroTipoContato === 'crm' ? 'bg-[#F18800]' : 'bg-[#253575]'
                      }`}
                    />
                    <span className="truncate">Externos</span>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 h-4 font-mono font-bold shrink-0 ${
                        filtroTipoContato === 'crm'
                          ? 'bg-white/20 text-white'
                          : 'bg-[#253575] text-white'
                      }`}
                    >
                      {contatosExternos.length}
                    </Badge>
                  </button>

                  {/* Aba INTERNOS (Equipe + Canais) — Badge esmeralda */}
                  <button
                    type="button"
                    onClick={() => setFiltroTipoContato('equipe')}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filtroTipoContato === 'equipe'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-emerald-800 hover:bg-white/60'
                    }`}
                    title="Contatos Internos (Equipe do sistema, DMs 1:1 e Canais de Rota / Geral)"
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        filtroTipoContato === 'equipe' ? 'bg-emerald-300' : 'bg-emerald-600'
                      }`}
                    />
                    <span className="truncate">Internos</span>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 h-4 font-mono font-bold shrink-0 ${
                        filtroTipoContato === 'equipe'
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {contatosInternos.length}
                    </Badge>
                  </button>
                </div>

                {/* Subfiltro Rápido opcional para "Ver Todos Agrupados" */}
                <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
                  <span className="text-[10px] uppercase tracking-wider font-semibold">
                    {filtroTipoContato === 'crm'
                      ? 'Clientes & Leads Kommo'
                      : filtroTipoContato === 'equipe'
                        ? 'Equipe & Canais do Sistema'
                        : 'Lista Completa'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltroTipoContato((prev) => (prev === 'todos' ? 'crm' : 'todos'))
                    }
                    className={`text-[10px] font-semibold underline underline-offset-2 transition-colors ${
                      filtroTipoContato === 'todos'
                        ? 'text-[#253575] font-bold'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {filtroTipoContato === 'todos'
                      ? 'Voltar para Abas'
                      : `Ver Todos (${contatosUnificados.length})`}
                  </button>
                </div>
              </div>
            </div>

            {/* Lista com Rolagem dos Contatos / Leads com Agrupamento Visual */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-100/90">
              {loadingConversas || loadingKommo ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2 text-xs">
                  <RefreshCw className="h-4 w-4 animate-spin text-[#253575]" />
                  <span>Carregando contatos...</span>
                </div>
              ) : contatosFiltrados.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 space-y-1 bg-white/60 rounded-xl border border-dashed border-slate-300">
                  <p className="font-semibold text-slate-600">Nenhum contato encontrado.</p>
                  <p className="text-[11px] text-slate-400">Ajuste o filtro ou a busca acima.</p>
                </div>
              ) : (
                <>
                  {/* SEÇÃO: CONTATOS EXTERNOS (KOMMO CRM) — Clientes/Leads */}
                  {(filtroTipoContato === 'todos' || filtroTipoContato === 'crm') &&
                    externosFiltrados.length > 0 && (
                      <div className="space-y-1.5 pt-0.5 first:pt-0">
                        {filtroTipoContato === 'todos' && (
                          <div className="px-2.5 py-1 text-[10px] font-bold text-white bg-[#253575] rounded-lg flex items-center justify-between uppercase tracking-wider shadow-2xs">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-[#F18800]" />
                              Externos (Kommo CRM — Clientes / Leads)
                            </span>
                            <span className="font-mono bg-white/20 px-1.5 py-0.2 rounded text-white font-semibold">
                              {externosFiltrados.length}
                            </span>
                          </div>
                        )}
                        {externosFiltrados.map((contato) => {
                          const isSelected = contatoSelecionadoId === contato.id
                          const temCardVinculado = cards.some(
                            (c) =>
                              (contato.kommoRef && c.kommo_id === contato.kommoRef.id) ||
                              c.contato_nome?.toLowerCase() === contato.nome.toLowerCase() ||
                              c.titulo.toLowerCase().includes(contato.nome.toLowerCase()),
                          )

                          return (
                            <div
                              key={contato.id}
                              onClick={() => handleSelecionarContatoBarra(contato)}
                              className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group flex items-start space-x-2.5 border shadow-2xs ${
                                isSelected
                                  ? 'bg-[#253575] text-white border-[#253575] shadow-xs ring-2 ring-[#253575]/20'
                                  : 'bg-white text-slate-800 border-slate-200/90 hover:bg-blue-50/60 hover:border-blue-300 hover:shadow-xs'
                              }`}
                            >
                              <div className="relative shrink-0 mt-0.5">
                                <div
                                  className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                    isSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-[#253575]/10 text-[#253575] border border-[#253575]/20 font-black group-hover:bg-[#253575]/15'
                                  }`}
                                >
                                  {contato.initials}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isSelected
                                        ? 'text-white'
                                        : 'text-slate-900 group-hover:text-[#253575]'
                                    }`}
                                  >
                                    {contato.nome}
                                  </span>
                                  {/* Badge Azul #253575 dos contatos externos Kommo CRM */}
                                  <Badge
                                    className={`text-[9px] px-1.5 py-0 rounded font-semibold uppercase shrink-0 ${
                                      isSelected
                                        ? 'bg-white/25 text-white border-transparent'
                                        : 'bg-[#253575] text-white hover:bg-[#253575]'
                                    }`}
                                  >
                                    {contato.badge || 'Kommo'}
                                  </Badge>
                                </div>

                                <p
                                  className={`text-[11px] truncate mt-0.5 ${
                                    isSelected ? 'text-slate-200' : 'text-slate-500'
                                  }`}
                                >
                                  {contato.subtitulo ||
                                    contato.telefone ||
                                    'Sem telefone cadastrado'}
                                </p>

                                <div className="flex items-center justify-between gap-1 mt-1.5 text-[10px]">
                                  <span
                                    className={`font-medium ${
                                      isSelected ? 'text-slate-300' : 'text-slate-400'
                                    }`}
                                  >
                                    {contato.canal}
                                  </span>

                                  <div className="flex items-center space-x-1 shrink-0">
                                    {temCardVinculado ? (
                                      <Badge
                                        variant="outline"
                                        className={`text-[9px] px-1.5 py-0 h-4 border ${
                                          isSelected
                                            ? 'bg-emerald-400/20 text-emerald-200 border-emerald-300/40'
                                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold'
                                        }`}
                                      >
                                        Card no Funil ✓
                                      </Badge>
                                    ) : (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleAdicionarContatoAoFunil(contato)
                                        }}
                                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
                                          isSelected
                                            ? 'bg-white/20 text-white hover:bg-white/30'
                                            : 'bg-slate-100 text-[#253575] hover:bg-slate-200 border border-slate-200'
                                        }`}
                                        title="Criar card no pipeline deste contato externo"
                                      >
                                        + Funil
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                  {/* SEÇÃO: CONTATOS INTERNOS (EQUIPE + CANAIS) */}
                  {(filtroTipoContato === 'todos' || filtroTipoContato === 'equipe') &&
                    internosFiltrados.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {filtroTipoContato === 'todos' && (
                          <div className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-700 rounded-lg flex items-center justify-between uppercase tracking-wider shadow-2xs">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-300" />
                              Internos (Equipe Guerra & Canais)
                            </span>
                            <span className="font-mono bg-white/20 px-1.5 py-0.2 rounded text-white font-semibold">
                              {internosFiltrados.length}
                            </span>
                          </div>
                        )}
                        {internosFiltrados.map((contato) => {
                          const isSelected = contatoSelecionadoId === contato.id
                          const hasUnread = Boolean(contato.unreadCount && contato.unreadCount > 0)
                          return (
                            <div
                              key={contato.id}
                              onClick={() => handleSelecionarContatoBarra(contato)}
                              className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group flex items-start space-x-2.5 border shadow-2xs ${
                                isSelected
                                  ? 'bg-[#253575] text-white border-[#253575] shadow-xs ring-2 ring-[#253575]/20'
                                  : hasUnread
                                    ? 'bg-amber-50/80 text-slate-800 border-amber-300 hover:bg-amber-50 hover:border-amber-400 hover:shadow-xs'
                                    : 'bg-white text-slate-800 border-slate-200/90 hover:bg-emerald-50/50 hover:border-emerald-300 hover:shadow-xs'
                              }`}
                            >
                              <div className="relative shrink-0 mt-0.5">
                                <div
                                  className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                    isSelected
                                      ? 'bg-white/20 text-white'
                                      : hasUnread
                                        ? 'bg-[#F18800]/15 text-[#F18800] border border-[#F18800]/30 font-black'
                                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  }`}
                                >
                                  {contato.initials}
                                </div>
                                {contato.isOnline !== undefined && (
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ${
                                      isSelected ? 'ring-[#253575]' : 'ring-white'
                                    } ${contato.isOnline ? 'bg-emerald-400' : 'bg-slate-300'}`}
                                    title={contato.isOnline ? 'Online' : 'Offline'}
                                  />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isSelected
                                        ? 'text-white'
                                        : 'text-slate-900 group-hover:text-[#253575]'
                                    }`}
                                  >
                                    {contato.nome}
                                  </span>
                                  {hasUnread ? (
                                    <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                                      {contato.unreadCount}
                                    </span>
                                  ) : (
                                    /* Badge dos contatos internos */
                                    <Badge
                                      className={`text-[9px] px-1.5 py-0 rounded font-semibold uppercase shrink-0 ${
                                        isSelected
                                          ? 'bg-white/25 text-white border-transparent'
                                          : 'bg-emerald-600 text-white hover:bg-emerald-600'
                                      }`}
                                    >
                                      {contato.badge || 'Interno'}
                                    </Badge>
                                  )}
                                </div>

                                <p
                                  className={`text-[11px] truncate mt-0.5 ${
                                    isSelected
                                      ? 'text-slate-200'
                                      : hasUnread
                                        ? 'text-slate-700 font-medium'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {contato.subtitulo || 'Conversa interna'}
                                </p>

                                <div className="flex items-center justify-between gap-1 mt-1.5 text-[10px]">
                                  <span
                                    className={`font-medium ${
                                      isSelected
                                        ? 'text-slate-300'
                                        : hasUnread
                                          ? 'text-[#F18800] font-semibold'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {contato.canal}
                                  </span>

                                  {contato.userId && !contato.conversaRef && (
                                    <span
                                      className={`text-[9px] font-semibold ${
                                        isSelected ? 'text-amber-200' : 'text-emerald-800'
                                      }`}
                                    >
                                      {user?.role === 'admin' ? 'Supervisionar' : 'Iniciar DM'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                </>
              )}
            </div>

            {/* Rodapé da Barra com Status */}
            <div className="p-2.5 bg-slate-50/95 border-t border-slate-200/90 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
              <span>{contatosFiltrados.length} contatos visíveis</span>
              <span className="font-semibold text-slate-700">Barra Fixa</span>
            </div>
          </Card>
        </div>

        {/* =======================================================================
         * ÁREA DIREITA: TELA DE CONVERSA (WHATSAPP) OU PIPELINE (KANBAN) — 8 COLS
         * ======================================================================= */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {hubTab === 'conversa' ? (
            /* ===================================================================
             * ABA A: TELA DE CONVERSA ESTILO WHATSAPP WEB
             * =================================================================== */
            <Card className="border-slate-200/90 shadow-sm flex flex-col h-[740px] overflow-hidden bg-white">
              {/* Header da Conversa Ativa */}
              <CardHeader className="bg-[#142758] text-white py-3.5 px-4 shrink-0 relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#253575] flex">
                  <div className="h-full w-24 bg-[#F18800] rounded-r-full" />
                </div>

                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-[#253575] text-[#F18800] border border-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                      {activeConversa?.tipo === 'dm' ? (
                        getDmDisplay(activeConversa).initials
                      ) : activeConversa?.tipo === 'geral' ? (
                        <Megaphone className="h-4 w-4" />
                      ) : (
                        '#'
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h2 className="text-sm font-bold text-white truncate">
                          {activeConversa
                            ? activeConversa.tipo === 'dm'
                              ? getDmDisplay(activeConversa).name
                              : activeConversa.titulo
                            : 'Selecione uma conversa na barra lateral'}
                        </h2>
                        {activeConversa?.tipo === 'dm' && (
                          <span
                            className={`h-2 w-2 rounded-full ${
                              getDmDisplay(activeConversa).isOnline
                                ? 'bg-emerald-400'
                                : 'bg-slate-400'
                            }`}
                            title={getDmDisplay(activeConversa).isOnline ? 'Online' : 'Offline'}
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">
                        {activeConversa
                          ? activeConversa.tipo === 'geral'
                            ? 'Canal Geral de comunicados para toda a equipe'
                            : activeConversa.tipo === 'canal_rota'
                              ? `Canal de colaboração da rota ${activeConversa.regiao_nome}`
                              : 'Conversa direta e privada 1:1'
                          : 'Escolha um canal ou contato para iniciar o diálogo'}
                      </p>
                    </div>
                  </div>

                  {/* Ações da Conversa */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Botão de Ver Card Vinculado no Pipeline */}
                    {cards.some(
                      (c) =>
                        activeConversa &&
                        c.contato_nome?.toLowerCase() ===
                          getDmDisplay(activeConversa).name.toLowerCase(),
                    ) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const card = cards.find(
                            (c) =>
                              activeConversa &&
                              c.contato_nome?.toLowerCase() ===
                                getDmDisplay(activeConversa).name.toLowerCase(),
                          )
                          if (card) {
                            setCardDestacadoId(card.id)
                            setHubTab('funil')
                          }
                        }}
                        className="h-7.5 px-2.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-medium"
                      >
                        <Kanban className="h-3 w-3 mr-1" />
                        Ver no Funil
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModalAvisoOpen(true)}
                      className="h-7.5 px-2.5 text-xs bg-[#F18800] hover:bg-[#d97b00] text-white border-none font-bold shadow-xs"
                    >
                      <Megaphone className="h-3 w-3 mr-1" />
                      Aviso
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Área das Mensagens com Bolhas Estilo WhatsApp */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/20 bg-pattern">
                {loadingMensagens ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2 text-[#253575]" />
                    Carregando histórico da conversa...
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-semibold text-slate-600">
                      Nenhuma mensagem enviada nesta conversa.
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm text-center">
                      Envie um recado, diretriz operacional ou aviso oficial abaixo.
                    </p>
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const isMe = msg.autor === user?.id
                    const isAviso = msg.tipo === 'aviso'

                    if (isAviso) {
                      return (
                        <div
                          key={msg.id}
                          className="max-w-2xl mx-auto p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center space-x-1.5 text-amber-800 text-xs font-bold">
                            <Megaphone className="h-3.5 w-3.5 text-[#F18800]" />
                            <span>Aviso Oficial · {msg.autor_nome}</span>
                            <span className="text-[10px] text-amber-600 font-normal ml-auto font-mono">
                              {formatarDataHoraBrasilia(msg.created, {
                                formatoCurto: true,
                              }).split('às')[1] || ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">
                            {msg.texto}
                          </p>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center space-x-1 mb-0.5 text-[10px] text-slate-400 px-1">
                          <span className="font-semibold text-slate-600">
                            {isMe ? 'Você' : msg.autor_nome}
                          </span>
                          <span>•</span>
                          <span className="font-mono">
                            {formatarDataHoraBrasilia(msg.created, {
                              formatoCurto: true,
                            }).split('às')[1] || ''}
                          </span>
                        </div>

                        {/* Bolha de mensagem WhatsApp (verde suave para o emissor ou azul ABR / cinza para recebida) */}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap break-words ${
                            isMe
                              ? 'bg-[#253575] text-white rounded-tr-xs'
                              : 'bg-white text-slate-800 rounded-tl-xs border border-slate-200/80'
                          }`}
                        >
                          {msg.texto}
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Barra de Envio de Mensagem Estilo WhatsApp */}
              <form
                onSubmit={handleEnviarMensagem}
                className="p-3 border-t border-slate-200 bg-slate-50 flex items-center space-x-2"
              >
                <Input
                  placeholder={
                    activeConversa
                      ? `Digite sua mensagem para ${
                          activeConversa.tipo === 'dm'
                            ? getDmDisplay(activeConversa).name
                            : activeConversa.titulo
                        }...`
                      : 'Selecione uma conversa para enviar...'
                  }
                  value={novoTextoMsg}
                  onChange={(e) => setNovoTextoMsg(e.target.value)}
                  disabled={!activeConversa || enviandoMsg}
                  className="h-10 text-xs bg-white border-slate-300 shadow-2xs rounded-xl focus-visible:ring-[#253575]"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!novoTextoMsg.trim() || enviandoMsg || !activeConversa}
                  className="h-10 px-4 bg-[#253575] hover:bg-[#1a2752] text-white shrink-0 rounded-xl font-bold shadow-xs"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Enviar
                </Button>
              </form>
            </Card>
          ) : (
            /* ===================================================================
             * ABA B: TELA DE FUNIL ESTILO PIPELINE / KANBAN
             * "estilo pipeline com kanban automático, onde você pode arrastar com a mão
             * ou mudar o estágio do lead clicando em um menu dropdown"
             * =================================================================== */
            <div className="space-y-4">
              {/* Barra Superior do Kanban com Ações de Funil e Etapas */}
              <Card className="border-slate-200/90 shadow-sm bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: funilAtual?.cor_hex || '#253575' }}
                        />
                        <h2 className="text-base font-bold text-[#253575]">
                          {funilAtual ? funilAtual.nome : 'Nenhum Funil Selecionado'}
                        </h2>
                        {funilAtual && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {cards.length} cards cadastrados
                          </Badge>
                        )}
                      </div>
                      {funilAtual?.descricao && (
                        <p className="text-xs text-slate-500">{funilAtual.descricao}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAbrirNovoCardModal()}
                        className="bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs h-8 shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Adicionar Card
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNomeNovaEtapa('')
                          setTipoNovaEtapa('normal')
                          setCorNovaEtapa('#3b82f6')
                          setModalNovaEtapaOpen(true)
                        }}
                        className="text-xs h-8 border-slate-300 text-slate-700"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Nova Etapa
                      </Button>

                      {funilAtual && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs border-slate-300"
                            >
                              <Sliders className="h-3.5 w-3.5 mr-1" />
                              Opções do Funil
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setFunilEmEdicao(funilAtual)
                                setNomeEdicaoFunil(funilAtual.nome)
                                setDescEdicaoFunil(funilAtual.descricao || '')
                                setCorEdicaoFunil(funilAtual.cor_hex || '#253575')
                                setModalEditarFunilOpen(true)
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5 mr-2" />
                              Renomear / Editar Funil
                            </DropdownMenuItem>
                            {funis.length > 1 && (
                              <DropdownMenuItem
                                onClick={() => handleExcluirFunil(funilAtual)}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Excluir Funil
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PIPELINE KANBAN AUTOMÁTICO (COLUNAS = ETAPAS, CARDS = LEADS) */}
              <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-[580px]">
                {loadingFunis || loadingCards ? (
                  <div className="flex items-center justify-center w-full py-20 text-slate-400 text-xs">
                    <RefreshCw className="h-5 w-5 animate-spin mr-2 text-[#253575]" />
                    Carregando colunas e cards do pipeline...
                  </div>
                ) : !funilAtual || (funilAtual.etapas || []).length === 0 ? (
                  <div className="w-full bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500 space-y-2">
                    <Kanban className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="font-semibold text-sm">Este funil ainda não tem etapas.</p>
                    <p className="text-xs text-slate-400">
                      Clique em "Nova Etapa" para adicionar a primeira coluna do seu pipeline.
                    </p>
                  </div>
                ) : (
                  (funilAtual.etapas || []).map((etapa) => {
                    const cardsDaEtapa = cards.filter((c) => c.etapa === etapa.id)
                    const isHovered = colunaHoverId === etapa.id

                    return (
                      <div
                        key={etapa.id}
                        onDragOver={(e) => handleDragOver(e, etapa.id)}
                        onDragLeave={(e) => handleDragLeave(e, etapa.id)}
                        onDrop={(e) => handleDrop(e, etapa.id)}
                        className={`w-72 sm:w-80 shrink-0 bg-slate-100/90 rounded-2xl border flex flex-col max-h-[660px] transition-all ${
                          isHovered
                            ? 'border-[#253575] bg-blue-50/70 shadow-md ring-2 ring-[#253575]/20'
                            : 'border-slate-200/80 shadow-2xs'
                        }`}
                      >
                        {/* Cabeçalho da Coluna / Etapa */}
                        <div className="p-3 border-b border-slate-200/80 bg-white/70 rounded-t-2xl flex items-center justify-between">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: etapa.cor_hex || '#3b82f6' }}
                            />
                            <h3
                              className="text-xs font-bold text-slate-800 truncate"
                              title={etapa.nome}
                            >
                              {etapa.nome}
                            </h3>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-slate-200/80 text-slate-700 font-mono"
                            >
                              {cardsDaEtapa.length}
                            </Badge>
                          </div>

                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              onClick={() => handleAbrirNovoCardModal(etapa.id)}
                              className="p-1 text-slate-400 hover:text-[#253575] rounded hover:bg-slate-100"
                              title="Adicionar card nesta etapa"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100">
                                  <Sliders className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEtapaEmEdicao(etapa)
                                    setNomeEdicaoEtapa(etapa.nome)
                                    setCorEdicaoEtapa(etapa.cor_hex || '#3b82f6')
                                    setTipoEdicaoEtapa(etapa.tipo_desfecho || 'normal')
                                    setModalEditarEtapaOpen(true)
                                  }}
                                >
                                  <Edit2 className="h-3 w-3 mr-2" />
                                  Editar Etapa
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExcluirEtapa(etapa)}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3 mr-2" />
                                  Excluir Etapa
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Lista com rolagem de cards arrastáveis */}
                        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                          {cardsDaEtapa.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl bg-white/40">
                              Arraste um card aqui
                            </div>
                          ) : (
                            cardsDaEtapa.map((card) => {
                              const isDestacado = cardDestacadoId === card.id
                              const isArrastando = cardArrastandoId === card.id

                              return (
                                <div
                                  key={card.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, card.id)}
                                  onClick={() => handleSelecionarCardPipeline(card)}
                                  className={`p-3 rounded-xl border bg-white shadow-xs transition-all cursor-grab active:cursor-grabbing space-y-2 relative group hover:border-[#253575] hover:shadow-md ${
                                    isDestacado
                                      ? 'border-[#253575] ring-2 ring-[#253575]/40 bg-blue-50/50 shadow-sm'
                                      : 'border-slate-200/90'
                                  } ${isArrastando ? 'opacity-40' : 'opacity-100'}`}
                                >
                                  {/* Título e Ações Rápidas do Card */}
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-bold text-slate-900 leading-snug truncate">
                                        {card.titulo}
                                      </h4>
                                      {card.contato_nome && (
                                        <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                          <UserIcon className="h-3 w-3 text-slate-400" />
                                          <span>{card.contato_nome}</span>
                                        </p>
                                      )}
                                    </div>

                                    {/* MUDANÇA DE ESTÁGIO VIA DROPDOWN NO PRÓPRIO CARD (PEDIDO PELO USUÁRIO) */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-slate-400 hover:text-slate-800 p-1 rounded hover:bg-slate-100 shrink-0"
                                          title="Mover estágio do card"
                                        >
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuLabel className="text-xs font-bold text-[#253575]">
                                          Mover para Estágio:
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {(funilAtual?.etapas || []).map((etp) => (
                                          <DropdownMenuItem
                                            key={etp.id}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleMudarEstagioCardDropdown(card, etp.id)
                                            }}
                                            className="text-xs flex items-center justify-between"
                                          >
                                            <div className="flex items-center space-x-2">
                                              <span
                                                className="h-2 w-2 rounded-full"
                                                style={{
                                                  backgroundColor: etp.cor_hex || '#3b82f6',
                                                }}
                                              />
                                              <span>{etp.nome}</span>
                                            </div>
                                            {card.etapa === etp.id && (
                                              <Check className="h-3 w-3 text-emerald-600" />
                                            )}
                                          </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setCardEmDetalhes(card)
                                            setModalDetalhesCardOpen(true)
                                          }}
                                        >
                                          <History className="h-3 w-3 mr-2" />
                                          Ver Histórico & Detalhes
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleExcluirCard(card)
                                          }}
                                          className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                        >
                                          <Trash2 className="h-3 w-3 mr-2" />
                                          Excluir Card
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>

                                  {/* Metadados: Telefone, Origem, Valor */}
                                  {(card.telefone || card.valor) && (
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                      {card.telefone ? (
                                        <span className="flex items-center gap-1 font-mono text-slate-600 truncate">
                                          <Phone className="h-2.5 w-2.5 text-slate-400" />
                                          {card.telefone}
                                        </span>
                                      ) : (
                                        <span />
                                      )}

                                      {card.valor ? (
                                        <span className="font-semibold text-emerald-700 font-mono">
                                          R${' '}
                                          {card.valor.toLocaleString('pt-BR', {
                                            minimumFractionDigits: 2,
                                          })}
                                        </span>
                                      ) : null}
                                    </div>
                                  )}

                                  {/* Rodapé do Card: Carimbo de Atualização e Tag */}
                                  <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5">
                                    <span className="flex items-center gap-1 font-mono">
                                      <Clock className="h-2.5 w-2.5 text-slate-400" />
                                      {formatarDataHoraBrasilia(card.updated, {
                                        formatoCurto: true,
                                      })}
                                    </span>
                                    {card.origem === 'kommo_bridge' ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[8px] px-1 py-0 h-3.5 bg-blue-50 text-blue-800 border-blue-200"
                                      >
                                        Kommo
                                      </Badge>
                                    ) : (
                                      <span className="text-slate-400">Manual</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
       * MODAIS DO SISTEMA
       * ========================================================================= */}

      {/* Modal Criar Card Manual no Pipeline */}
      <Dialog open={modalNovoCardOpen} onOpenChange={setModalNovoCardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#F18800]" />
              <span>Novo Card no Pipeline</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Adicione um lead ou oportunidade ao funil "{funilAtual?.nome}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700">
                Título do Card / Oportunidade *
              </label>
              <Input
                placeholder="Ex: Cotação Estrutura Metálica — Lote 12"
                value={novoCardTitulo}
                onChange={(e) => setNovoCardTitulo(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700">Etapa Inicial *</label>
              <select
                value={etapaDestinoNovoCard}
                onChange={(e) => setEtapaDestinoNovoCard(e.target.value)}
                className="w-full mt-1 h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-hidden"
              >
                {(funilAtual?.etapas || []).map((etp) => (
                  <option key={etp.id} value={etp.id}>
                    {etp.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-slate-700">Nome do Contato</label>
                <Input
                  placeholder="Ex: Carlos Mendes"
                  value={novoCardContatoNome}
                  onChange={(e) => setNovoCardContatoNome(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Telefone / WhatsApp</label>
                <Input
                  placeholder="Ex: 35999887766"
                  value={novoCardTelefone}
                  onChange={(e) => setNovoCardTelefone(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-slate-700">E-mail</label>
                <Input
                  placeholder="Ex: contato@empresa.com"
                  value={novoCardEmail}
                  onChange={(e) => setNovoCardEmail(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Valor Estimado (R$)</label>
                <Input
                  placeholder="Ex: 15000"
                  value={novoCardValor}
                  onChange={(e) => setNovoCardValor(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Notas / Observações</label>
              <Textarea
                placeholder="Detalhes da negociação ou histórico..."
                value={novoCardNotas}
                onChange={(e) => setNovoCardNotas(e.target.value)}
                rows={2}
                className="mt-1 text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalNovoCardOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!novoCardTitulo.trim() || salvandoCard}
              onClick={handleSalvarNovoCard}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold"
            >
              {salvandoCard ? 'Salvando...' : 'Criar Card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico e Detalhes do Card */}
      <Dialog open={modalDetalhesCardOpen} onOpenChange={setModalDetalhesCardOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center gap-2">
              <History className="h-5 w-5 text-[#F18800]" />
              <span>Detalhes & Histórico do Card</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registro de movimentações e dados de contato.
            </DialogDescription>
          </DialogHeader>

          {cardEmDetalhes && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <h3 className="font-bold text-sm text-slate-900">{cardEmDetalhes.titulo}</h3>
                {cardEmDetalhes.contato_nome && (
                  <p className="text-slate-600">
                    <strong>Contato:</strong> {cardEmDetalhes.contato_nome}
                  </p>
                )}
                {cardEmDetalhes.telefone && (
                  <p className="text-slate-600 font-mono">
                    <strong>Telefone:</strong> {cardEmDetalhes.telefone}
                  </p>
                )}
                {cardEmDetalhes.notas && (
                  <p className="text-slate-500 italic mt-1 pt-1 border-t border-slate-200">
                    "{cardEmDetalhes.notas}"
                  </p>
                )}
              </div>

              {/* Linha do tempo de movimentação de estágios */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">
                  Carimbo de Data/Hora & Histórico de Estágios:
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100 border border-slate-200 rounded-lg p-2.5 bg-white">
                  {!cardEmDetalhes.historico_etapas ||
                  cardEmDetalhes.historico_etapas.length === 0 ? (
                    <p className="text-slate-400 text-[11px]">Nenhuma movimentação registrada.</p>
                  ) : (
                    cardEmDetalhes.historico_etapas.map((h, i) => (
                      <div
                        key={i}
                        className="pt-1.5 first:pt-0 flex items-center justify-between text-[11px]"
                      >
                        <div className="flex items-center space-x-1.5">
                          <MoveRight className="h-3 w-3 text-[#F18800]" />
                          <span className="font-semibold text-slate-800">
                            {h.para_etapa_nome || 'Estágio inicial'}
                          </span>
                        </div>
                        <div className="text-slate-400 font-mono text-[10px]">
                          {formatarDataHoraBrasilia(h.data, { formatoCurto: true })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalDetalhesCardOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Funil */}
      <Dialog open={modalNovoFunilOpen} onOpenChange={setModalNovoFunilOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#F18800]" />
              <span>Novo Funil de Atendimento</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre um novo fluxo operacional (ex: Reativação, Novo Cliente, Projeto Especial).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Nome do Funil *</label>
              <Input
                placeholder="Ex: Pós-Venda Estruturado"
                value={nomeNovoFunil}
                onChange={(e) => setNomeNovoFunil(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Descrição (opcional)</label>
              <Textarea
                placeholder="Breve explicação do objetivo deste funil..."
                value={descNovoFunil}
                onChange={(e) => setDescNovoFunil(e.target.value)}
                rows={2}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Cor de Identificação</label>
              <div className="flex items-center space-x-2 mt-1">
                {['#253575', '#F18800', '#142758', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'].map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCorNovoFunil(c)}
                      className={`h-6 w-6 rounded-full border-2 transition-transform ${
                        corNovoFunil === c ? 'scale-110 border-slate-900' : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ),
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalNovoFunilOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!nomeNovoFunil.trim() || salvandoFunil}
              onClick={handleSalvarNovoFunil}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold"
            >
              {salvandoFunil ? 'Salvando...' : 'Criar Funil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Funil */}
      <Dialog open={modalEditarFunilOpen} onOpenChange={setModalEditarFunilOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-[#F18800]" />
              <span>Editar Funil: {funilEmEdicao?.nome}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Nome do Funil *</label>
              <Input
                value={nomeEdicaoFunil}
                onChange={(e) => setNomeEdicaoFunil(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Descrição</label>
              <Textarea
                value={descEdicaoFunil}
                onChange={(e) => setDescEdicaoFunil(e.target.value)}
                rows={2}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Cor</label>
              <div className="flex items-center space-x-2 mt-1">
                {['#253575', '#F18800', '#142758', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'].map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCorEdicaoFunil(c)}
                      className={`h-6 w-6 rounded-full border-2 transition-transform ${
                        corEdicaoFunil === c ? 'scale-110 border-slate-900' : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ),
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalEditarFunilOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!nomeEdicaoFunil.trim() || salvandoFunil}
              onClick={handleSalvarEdicaoFunil}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold"
            >
              {salvandoFunil ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Etapa */}
      <Dialog open={modalNovaEtapaOpen} onOpenChange={setModalNovaEtapaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575]">Nova Etapa do Funil</DialogTitle>
            <DialogDescription className="text-xs">
              Adicione uma etapa para este funil de atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Nome da Etapa *</label>
              <Input
                placeholder="Ex: Proposta em Análise"
                value={nomeNovaEtapa}
                onChange={(e) => setNomeNovaEtapa(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Tipo de Desfecho</label>
              <select
                value={tipoNovaEtapa}
                onChange={(e) => setTipoNovaEtapa(e.target.value as 'normal' | 'sucesso' | 'perda')}
                className="w-full mt-1 h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-hidden"
              >
                <option value="normal">Normal (Em Andamento)</option>
                <option value="sucesso">Sucesso (Ganho / Reativado)</option>
                <option value="perda">Perda (Sem Interesse / Descartado)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Cor</label>
              <div className="flex items-center space-x-2 mt-1">
                {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCorNovaEtapa(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      corNovaEtapa === c ? 'scale-110 border-slate-900' : 'border-white'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalNovaEtapaOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!nomeNovaEtapa.trim() || salvandoEtapa}
              onClick={handleSalvarNovaEtapa}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold"
            >
              {salvandoEtapa ? 'Salvando...' : 'Adicionar Etapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Etapa */}
      <Dialog open={modalEditarEtapaOpen} onOpenChange={setModalEditarEtapaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575]">Editar Etapa</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Nome da Etapa *</label>
              <Input
                value={nomeEdicaoEtapa}
                onChange={(e) => setNomeEdicaoEtapa(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Tipo de Desfecho</label>
              <select
                value={tipoEdicaoEtapa}
                onChange={(e) =>
                  setTipoEdicaoEtapa(e.target.value as 'normal' | 'sucesso' | 'perda')
                }
                className="w-full mt-1 h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-800 shadow-xs focus:outline-hidden"
              >
                <option value="normal">Normal (Em Andamento)</option>
                <option value="sucesso">Sucesso (Ganho / Reativado)</option>
                <option value="perda">Perda (Sem Interesse / Descartado)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Cor</label>
              <div className="flex items-center space-x-2 mt-1">
                {['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCorEdicaoEtapa(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      corEdicaoEtapa === c ? 'scale-110 border-slate-900' : 'border-white'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalEditarEtapaOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!nomeEdicaoEtapa.trim() || salvandoEtapa}
              onClick={handleSalvarEdicaoEtapa}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold"
            >
              {salvandoEtapa ? 'Salvando...' : 'Salvar Etapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova DM (Colaboradores) */}
      <Dialog open={modalNovaDmOpen} onOpenChange={setModalNovaDmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-[#F18800]" />
              <span>Nova Conversa Direta (1:1)</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Escolha um membro da equipe para conversar em privado no chat interno.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, papel ou e-mail..."
                value={buscaColaborador}
                onChange={(e) => setBuscaColaborador(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {colaboradores
                .filter(
                  (c) =>
                    !buscaColaborador.trim() ||
                    (c.name || '').toLowerCase().includes(buscaColaborador.toLowerCase()) ||
                    (c.email || '').toLowerCase().includes(buscaColaborador.toLowerCase()) ||
                    (c.role || '').toLowerCase().includes(buscaColaborador.toLowerCase()),
                )
                .map((colab) => {
                  const otherItem = presenceData?.users
                    ? presenceData.users.find((it) => it.id === colab.id)
                    : null
                  const presenceInfo = derivePresenceStatus(otherItem?.last_seen || colab.last_seen)
                  const isOnline = presenceInfo.status === 'online'
                  return (
                    <button
                      key={colab.id}
                      onClick={() => handleIniciarDmCom(colab)}
                      className="w-full text-left p-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="relative">
                          <div className="h-7 w-7 rounded-full bg-[#253575] text-white flex items-center justify-center text-xs font-bold">
                            {(colab.name || colab.email || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {colab.name || colab.email}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase font-mono">
                            {colab.role || 'operador'}
                          </div>
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#253575] transition-colors" />
                    </button>
                  )
                })}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalNovaDmOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Aviso Geral Preservado */}
      <Dialog open={modalAvisoOpen} onOpenChange={setModalAvisoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#253575] flex items-center space-x-2">
              <Megaphone className="h-5 w-5 text-[#F18800]" />
              <span>Enviar Aviso em Destaque a Todos</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Dispara uma mensagem de aviso oficial no Canal Geral e no topo do chat para todos os
              operadores, líderes e supervisores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">Mensagem do Comunicado</label>
              <Textarea
                placeholder="Ex: Nova base liberada com foco na rota Varginha. Favor atualizar a página para refletir as melhorias."
                value={avisoTexto}
                onChange={(e) => setAvisoTexto(e.target.value)}
                rows={4}
                className="mt-1 text-xs resize-none"
              />
            </div>

            <div className="flex items-center space-x-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <input
                type="checkbox"
                id="hub-check-atualizacao"
                checked={avisoPedirAtualizacao}
                onChange={(e) => setAvisoPedirAtualizacao(e.target.checked)}
                className="h-4 w-4 rounded border-amber-300 text-[#F18800] focus:ring-[#F18800]"
              />
              <label
                htmlFor="hub-check-atualizacao"
                className="text-xs text-amber-900 cursor-pointer select-none leading-snug"
              >
                Solicitar que a equipe <strong>atualize a página</strong> (disparar pulso no banner
                de nova versão).
              </label>
            </div>
          </div>

          <DialogFooter>
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
              onClick={handleDispararAviso}
              className="bg-[#F18800] hover:bg-[#d97b00] text-white text-xs font-bold"
            >
              {enviandoAviso ? 'Publicando...' : 'Publicar Aviso Geral'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
