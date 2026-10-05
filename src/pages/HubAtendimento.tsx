import React, { useState, useEffect, useRef } from 'react'
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  MessageSquare,
  Megaphone,
  Radio,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Send,
  User as UserIcon,
  Phone,
  Mail,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Filter,
  Eye,
  Sliders,
  X,
  Search,
  Check,
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
  fetchKommoRecentActivity,
} from '@/services/hubAtendimento'
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
  KommoBridgeResponse,
  ChatConversa,
  ChatMensagem,
  ChatUnreadCountsResponse,
  User,
} from '@/types'

export default function HubAtendimentoPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { presenceData } = usePresence({ pollStatus: true })

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
  // ESTADOS: BRIDGE KOMMO (SOMENTE LEITURA)
  // ==========================================
  const [kommoData, setKommoData] = useState<KommoBridgeResponse | null>(null)
  const [loadingKommo, setLoadingKommo] = useState(false)
  const [kommoSearch, setKommoSearch] = useState('')
  const [kommoFilterPipeline, setKommoFilterPipeline] = useState<string>('todos')

  // ==========================================
  // ESTADOS: CONVERSA INTERNA EMBUTIDA NO HUB
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
  const [buscaConversaHub, setBuscaConversaHub] = useState('')

  // ==========================================
  // ESTADOS: MODAL DE AVISO DO ADMIN PRESERVADO
  // ==========================================
  const [modalAvisoOpen, setModalAvisoOpen] = useState(false)
  const [avisoTexto, setAvisoTexto] = useState('')
  const [avisoPedirAtualizacao, setAvisoPedirAtualizacao] = useState(false)
  const [enviandoAviso, setEnviandoAviso] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ==========================================
  // CARREGAMENTO INICIAL
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

  const carregarConversas = async () => {
    if (!user) return
    setLoadingConversas(true)
    try {
      const list = await fetchConversasUsuario(user.role || 'admin', user.regioes || [], user.id)
      setConversas(list)

      const unread = await fetchUnreadCounts()
      setUnreadCounts(unread)

      // Selecionar canal Geral por padrão se nenhuma conversa estiver ativa
      if (!activeConversa && list.length > 0) {
        const canalGeral = list.find((c) => c.tipo === 'geral') || list[0]
        setActiveConversa(canalGeral)
        await carregarMensagens(canalGeral.id)
      }
    } catch (err) {
      console.warn('Erro ao carregar conversas do chat:', err)
    } finally {
      setLoadingConversas(false)
    }
  }

  const carregarMensagens = async (conversaId: string) => {
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
  }

  useEffect(() => {
    carregarFunis()
    carregarKommo()
    carregarConversas()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // Polling leve a cada 30s para atualizar contadores e bridge
  useEffect(() => {
    const timer = setInterval(() => {
      fetchUnreadCounts()
        .then(setUnreadCounts)
        .catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

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
  // FUNÇÕES DE CHAT / CONVERSA INTERNA NO HUB
  // ==========================================
  const handleSelecionarConversa = async (c: ChatConversa) => {
    setActiveConversa(c)
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
      await carregarMensagens(conv.id)
    } catch (err) {
      toast({
        title: 'Erro ao iniciar conversa 1:1',
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  // Enviar aviso broadcast oficial
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
        description: 'Todos os colaboradores receberão o aviso no chat interno.',
      })

      setAvisoTexto('')
      setAvisoPedirAtualizacao(false)
      setModalAvisoOpen(false)

      setActiveConversa(canalGeral)
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

  // Informações da DM ativa (exibição de nome e status)
  const getDmDisplay = (conv: ChatConversa) => {
    const parts = conv.titulo?.split('&').map((s) => s.trim()) || []
    const myName = (user?.name || user?.email || '').trim()
    const otherName = parts.find((p) => p !== myName) || parts[0] || 'Colaborador'

    // Encontrar ID do outro participante para ver se está online
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

  // Filtragem da lista do Kommo
  const kommoPipelinesDisponiveis = Array.from(
    new Set((kommoData?.items || []).map((i) => i.pipeline_nome)),
  ).filter(Boolean)

  const kommoFiltrados = (kommoData?.items || []).filter((item) => {
    const matchesSearch =
      !kommoSearch.trim() ||
      item.nome_lead.toLowerCase().includes(kommoSearch.toLowerCase()) ||
      item.nome_contato.toLowerCase().includes(kommoSearch.toLowerCase()) ||
      (item.telefone && item.telefone.includes(kommoSearch)) ||
      (item.email && item.email.toLowerCase().includes(kommoSearch.toLowerCase()))

    const matchesPipeline =
      kommoFilterPipeline === 'todos' || item.pipeline_nome === kommoFilterPipeline

    return matchesSearch && matchesPipeline
  })

  // Conversas filtradas no Hub
  const conversasFiltradasHub = conversas.filter((c) => {
    if (!buscaConversaHub.trim()) return true
    const term = buscaConversaHub.toLowerCase()
    return (
      (c.titulo || '').toLowerCase().includes(term) ||
      (c.ultimo_autor_nome || '').toLowerCase().includes(term) ||
      (c.ultima_mensagem_texto || '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6 pb-12">
      {/* =========================================================================
       * CABEÇALHO DO HUB DE ATENDIMENTO (EXCLUSIVO ADMIN)
       * ========================================================================= */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs relative overflow-hidden">
        {/* Grafismo proprietário Grupo ABR */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#253575] flex">
          <div className="h-full w-40 bg-[#F18800] rounded-r-full" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-1">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Badge className="bg-[#253575] text-white hover:bg-[#253575] text-xs font-semibold px-2.5 py-0.5">
                Fase 1 · Piloto
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium flex items-center gap-1"
              >
                <ShieldCheck className="h-3 w-3 text-amber-600" />
                Exclusivo Administrador (Thiago Almeida)
              </Badge>
            </div>
            <h1 className="text-2xl font-black text-[#253575] tracking-tight flex items-center gap-2">
              Hub de Atendimento Conversacional
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Ambiente de teste e validação de conceito para a nova central de atendimento do
              Projeto Guerra. Configure funis operacionais, teste a troca de mensagens com a equipe
              e acompanhe a atividade recente do bridge Kommo em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={carregarFunis}
              disabled={loadingFunis}
              className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingFunis ? 'animate-spin' : ''}`} />
              Recarregar
            </Button>

            {/* Botão de Aviso Admin Replicado no Hub */}
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
      </div>

      {/* =========================================================================
       * SEÇÃO 1: BARRA DE FUNIS E ETAPAS (HORIZONTAL NO TOPO DO HUB)
       * ========================================================================= */}
      <Card className="border-slate-200/90 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b border-slate-200/70 py-3.5 px-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-[#253575] text-white flex items-center justify-center font-bold">
                <Layers className="h-4 w-4 text-[#F18800]" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[#253575]">
                  Funis de Atendimento
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Defina os fluxos conversacionais e as etapas de avanço dos clientes
                </CardDescription>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => {
                setNomeNovoFunil('')
                setDescNovoFunil('')
                setCorNovoFunil('#253575')
                setModalNovoFunilOpen(true)
              }}
              className="bg-[#253575] hover:bg-[#1a2752] text-white text-xs font-semibold h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo Funil
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Barra Horizontal de Funis (Tabs/Pills) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
            {loadingFunis ? (
              <div className="flex items-center space-x-2 py-2 text-xs text-slate-500">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#253575]" />
                <span>Carregando funis...</span>
              </div>
            ) : funis.length === 0 ? (
              <div className="py-2 text-xs text-slate-400">
                Nenhum funil configurado. Clique em &quot;Novo Funil&quot; para começar.
              </div>
            ) : (
              funis.map((funil) => {
                const isSelected = funil.id === funilAtivoId
                return (
                  <div key={funil.id} className="relative group shrink-0">
                    <button
                      onClick={() => setFunilAtivoId(funil.id)}
                      className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        isSelected
                          ? 'bg-[#253575] text-white border-[#253575] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#253575]/40 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: funil.cor_hex || '#253575' }}
                      />
                      <span>{funil.nome}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 h-4 font-mono ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {funil.etapas?.length || 0}
                      </Badge>
                    </button>

                    {/* Ações rápidas no funil selecionado */}
                    {isSelected && (
                      <div className="absolute -top-2 -right-1 flex items-center space-x-0.5 opacity-90 hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setFunilEmEdicao(funil)
                            setNomeEdicaoFunil(funil.nome)
                            setDescEdicaoFunil(funil.descricao || '')
                            setCorEdicaoFunil(funil.cor_hex || '#253575')
                            setModalEditarFunilOpen(true)
                          }}
                          className="h-5 w-5 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-900 shadow-xs"
                          title="Renomear / Editar Funil"
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                        </button>
                        {funis.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExcluirFunil(funil)
                            }}
                            className="h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 shadow-xs"
                            title="Excluir Funil"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Painel de Etapas do Funil Selecionado */}
          {funilAtual && (
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Etapas do Funil &quot;{funilAtual.nome}&quot;
                    </h3>
                    {funilAtual.descricao && (
                      <span className="text-xs text-slate-500 hidden md:inline">
                        — {funilAtual.descricao}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNomeNovaEtapa('')
                    setTipoNovaEtapa('normal')
                    setCorNovaEtapa('#3b82f6')
                    setModalNovaEtapaOpen(true)
                  }}
                  className="h-7 text-xs border-[#253575]/30 text-[#253575] hover:bg-[#253575]/5 font-semibold"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova Etapa
                </Button>
              </div>

              {/* Lista visual de etapas conectadas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
                {(funilAtual.etapas || []).length === 0 ? (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-300">
                    Nenhuma etapa cadastrada neste funil. Clique em &quot;Nova Etapa&quot;.
                  </div>
                ) : (
                  (funilAtual.etapas || []).map((etapa, idx) => {
                    const isSucesso = etapa.tipo_desfecho === 'sucesso'
                    const isPerda = etapa.tipo_desfecho === 'perda'
                    return (
                      <div
                        key={etapa.id}
                        className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2 relative group hover:border-[#253575]/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: etapa.cor_hex || '#3b82f6' }}
                            />
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {idx + 1}. {etapa.nome}
                            </span>
                          </div>

                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 shrink-0">
                            <button
                              onClick={() => {
                                setEtapaEmEdicao(etapa)
                                setNomeEdicaoEtapa(etapa.nome)
                                setCorEdicaoEtapa(etapa.cor_hex || '#3b82f6')
                                setTipoEdicaoEtapa(etapa.tipo_desfecho || 'normal')
                                setModalEditarEtapaOpen(true)
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                              title="Editar Etapa"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleExcluirEtapa(etapa)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                              title="Excluir Etapa"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                          <span className="font-mono">Ordem #{etapa.ordem}</span>
                          {isSucesso ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[9px] px-1 py-0 h-4 border-none">
                              Sucesso
                            </Badge>
                          ) : isPerda ? (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[9px] px-1 py-0 h-4 border-none">
                              Perda
                            </Badge>
                          ) : (
                            <span className="text-slate-400">Em andamento</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =========================================================================
       * SEÇÃO 2: ÁREA DE DOIS PAINÉIS — CONVERSA INTERNA + BRIDGE KOMMO
       * ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =====================================================================
         * PAINEL ESQUERDO/CENTRAL: CONVERSA INTERNA DENTRO DO HUB (Lg: 7 cols)
         * ===================================================================== */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-slate-200/90 shadow-sm flex flex-col h-[640px] overflow-hidden">
            <CardHeader className="bg-[#142758] text-white py-3.5 px-4 shrink-0 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#253575] flex">
                <div className="h-full w-24 bg-[#F18800] rounded-r-full" />
              </div>

              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-[#253575] text-[#F18800] flex items-center justify-center font-bold">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-white truncate">
                        {activeConversa
                          ? activeConversa.tipo === 'dm'
                            ? getDmDisplay(activeConversa).name
                            : activeConversa.titulo
                          : 'Conversas do Hub'}
                      </h2>
                      {activeConversa?.tipo === 'dm' && (
                        <span
                          className={`h-2 w-2 rounded-full ${
                            getDmDisplay(activeConversa).isOnline
                              ? 'bg-emerald-400'
                              : 'bg-slate-400'
                          }`}
                          title={
                            getDmDisplay(activeConversa).isOnline
                              ? 'Colaborador Online'
                              : 'Colaborador Offline'
                          }
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 truncate">
                      {activeConversa
                        ? activeConversa.tipo === 'geral'
                          ? 'Canal Geral de comunicados e anúncios oficiais'
                          : activeConversa.tipo === 'canal_rota'
                            ? `Canal de colaboração da rota ${activeConversa.regiao_nome}`
                            : 'Mensagem direta 1:1 integrada à presença'
                        : 'Reutiliza infraestrutura existente sem duplicar coleções'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAbrirNovaDm}
                    className="h-7.5 px-2.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-medium"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Nova DM
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Layout Interno do Chat: Lista lateral de conversas + Área de mensagens */}
            <div className="flex-1 flex min-h-0 bg-slate-50/50">
              {/* Barra lateral interna de conversas (w-56) */}
              <div className="w-48 sm:w-56 border-r border-slate-200 bg-white flex flex-col shrink-0">
                <div className="p-2 border-b border-slate-100">
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
                    <Input
                      placeholder="Filtrar..."
                      value={buscaConversaHub}
                      onChange={(e) => setBuscaConversaHub(e.target.value)}
                      className="h-7 pl-6.5 text-[11px] bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1 space-y-0.5">
                  {loadingConversas ? (
                    <div className="p-3 text-center text-xs text-slate-400">Carregando...</div>
                  ) : conversasFiltradasHub.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">Nenhum canal.</div>
                  ) : (
                    conversasFiltradasHub.map((c) => {
                      const isAtiva = activeConversa?.id === c.id
                      const unread = unreadCounts.by_conversation[c.id] || 0
                      const isDm = c.tipo === 'dm'
                      const dmInfo = isDm ? getDmDisplay(c) : null

                      return (
                        <button
                          key={c.id}
                          onClick={() => handleSelecionarConversa(c)}
                          className={`w-full text-left p-2 rounded-lg transition-colors flex items-center space-x-2 ${
                            isAtiva
                              ? 'bg-[#253575] text-white shadow-xs font-semibold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <div
                              className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold ${
                                isAtiva
                                  ? 'bg-white/20 text-white'
                                  : 'bg-slate-100 text-[#253575] border border-slate-200'
                              }`}
                            >
                              {isDm ? (
                                dmInfo?.initials || 'DM'
                              ) : c.tipo === 'geral' ? (
                                <Megaphone className="h-3.5 w-3.5 text-[#F18800]" />
                              ) : (
                                '#'
                              )}
                            </div>
                            {isDm && (
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-white ${
                                  dmInfo?.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs truncate">
                                {isDm ? dmInfo?.name : c.titulo}
                              </span>
                              {unread > 0 && (
                                <span className="h-4 min-w-4 px-1 rounded-full bg-[#F18800] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Área Principal de Mensagens */}
              <div className="flex-1 flex flex-col min-w-0 bg-white">
                {/* Histórico com Scroll */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMensagens ? (
                    <div className="flex items-center justify-center h-full text-xs text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2 text-[#253575]" />
                      Carregando histórico...
                    </div>
                  ) : mensagens.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-1">
                      <MessageSquare className="h-8 w-8 text-slate-300" />
                      <p className="text-xs">Nenhuma mensagem nesta conversa ainda.</p>
                      <p className="text-[11px] text-slate-400">
                        Envie a primeira mensagem abaixo.
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
                            className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 shadow-2xs space-y-1"
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
                            <p className="text-xs text-slate-800 font-medium whitespace-pre-wrap">
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
                          <div className="flex items-center space-x-1 mb-0.5 text-[10px] text-slate-400">
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

                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap break-words ${
                              isMe
                                ? 'bg-[#253575] text-white rounded-tr-xs'
                                : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-200/80'
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

                {/* Input de Envio de Mensagem */}
                <form
                  onSubmit={handleEnviarMensagem}
                  className="p-2.5 border-t border-slate-200 bg-slate-50/80 flex items-center space-x-2"
                >
                  <Input
                    placeholder={
                      activeConversa
                        ? `Mensagem para ${
                            activeConversa.tipo === 'dm'
                              ? getDmDisplay(activeConversa).name
                              : activeConversa.titulo
                          }...`
                        : 'Selecione uma conversa...'
                    }
                    value={novoTextoMsg}
                    onChange={(e) => setNovoTextoMsg(e.target.value)}
                    disabled={!activeConversa || enviandoMsg}
                    className="h-9 text-xs bg-white border-slate-200"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!novoTextoMsg.trim() || enviandoMsg || !activeConversa}
                    className="h-9 px-3 bg-[#253575] hover:bg-[#1a2752] text-white shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          </Card>
        </div>

        {/* =====================================================================
         * PAINEL DIREITO: BRIDGE KOMMO CRM SOMENTE LEITURA (Lg: 5 cols)
         * ===================================================================== */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-slate-200/90 shadow-sm flex flex-col h-[640px] overflow-hidden">
            <CardHeader className="bg-slate-50/80 border-b border-slate-200/70 py-3.5 px-4 shrink-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <span>Bridge Kommo CRM</span>
                      </CardTitle>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={carregarKommo}
                    disabled={loadingKommo}
                    className="h-7 text-xs border-slate-300"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${loadingKommo ? 'animate-spin' : ''}`} />
                    Consultar
                  </Button>
                </div>

                {/* Selo Obrigatório de Somente Leitura Experimental */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-50/80 text-blue-900 text-[11px] font-semibold flex items-center gap-1 py-0.5 px-2"
                  >
                    <ShieldCheck className="h-3 w-3 text-blue-700" />
                    Somente leitura · Bridge Kommo (experimental)
                  </Badge>
                  {kommoData?.subdomain && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {kommoData.subdomain}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Filtros de busca dos leads do Kommo */}
            <div className="p-3 bg-white border-b border-slate-100 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filtrar por lead, contato ou telefone..."
                  value={kommoSearch}
                  onChange={(e) => setKommoSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
                />
              </div>

              {kommoPipelinesDisponiveis.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    onClick={() => setKommoFilterPipeline('todos')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                      kommoFilterPipeline === 'todos'
                        ? 'bg-[#253575] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todos ({kommoData?.items.length || 0})
                  </button>
                  {kommoPipelinesDisponiveis.map((pName) => {
                    const count = (kommoData?.items || []).filter(
                      (i) => i.pipeline_nome === pName,
                    ).length
                    return (
                      <button
                        key={pName}
                        onClick={() => setKommoFilterPipeline(pName)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 transition-colors ${
                          kommoFilterPipeline === pName
                            ? 'bg-[#253575] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {pName} ({count})
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Conteúdo / Lista de Atividade Recente */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50">
              {loadingKommo ? (
                <div className="flex flex-col items-center justify-center h-full text-xs text-slate-500 space-y-2 py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#253575]" />
                  <p>Lendo dados recentes do Kommo CRM...</p>
                  <p className="text-[10px] text-slate-400">Modo somente leitura ativado</p>
                </div>
              ) : !kommoData || !kommoData.ok ? (
                /* Exibição amigável em caso de erro / ausência de secrets */
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-slate-700">
                  <div className="flex items-center space-x-2 text-amber-800 font-bold text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Bridge Kommo Indisponível</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {kommoData?.message ||
                      'Não foi possível estabelecer contato com a API da Kommo. Verifique os secrets KOMMO_SUBDOMAIN e KOMMO_ACCESS_TOKEN no painel do backend.'}
                  </p>
                  <div className="text-[11px] bg-white/80 p-2.5 rounded border border-amber-200/70 text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">Status de Segurança:</p>
                    <p className="text-[10px]">
                      • Modo Somente Leitura: <strong>Ativo</strong> (nenhum dado é enviado à Kommo)
                    </p>
                    <p className="text-[10px]">
                      • Código de Retorno:{' '}
                      <code className="text-amber-800 font-mono">
                        {kommoData?.error_code || 'N/A'}
                      </code>
                    </p>
                  </div>
                </div>
              ) : kommoFiltrados.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                  Nenhum lead com atividade recente encontrado no filtro selecionado.
                </div>
              ) : (
                kommoFiltrados.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-2xs space-y-2 hover:border-[#253575]/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-[#253575] truncate">
                          {item.nome_contato}
                        </h4>
                        <p className="text-[11px] text-slate-600 truncate">{item.nome_lead}</p>
                      </div>

                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0 border"
                        style={{
                          backgroundColor: `${item.status_cor || '#64748b'}15`,
                          borderColor: `${item.status_cor || '#64748b'}40`,
                          color: item.status_cor || '#334155',
                        }}
                      >
                        {item.status_nome}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                      <div>
                        <span className="font-semibold text-slate-700">Funil:</span>{' '}
                        <span className="truncate">{item.pipeline_nome}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Canal:</span>{' '}
                        <span>{item.canal}</span>
                      </div>
                      {item.telefone && (
                        <div className="col-span-2 flex items-center space-x-1 text-slate-600">
                          <Phone className="h-2.5 w-2.5 text-slate-400" />
                          <span className="font-mono">{item.telefone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-50">
                      <span>
                        Última atividade:{' '}
                        {formatarDataHoraBrasilia(item.ultima_atividade, {
                          formatoCurto: true,
                        })}
                      </span>
                      {item.valor && item.valor > 0 ? (
                        <span className="font-semibold text-emerald-700 font-mono">
                          R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 bg-slate-100/70 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
              <span>Leitura de até 20 leads recentes</span>
              <span className="font-medium text-slate-600">
                Total visível: {kommoFiltrados.length}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* =========================================================================
       * MODAIS: FUNIL (CRIAR E EDITAR)
       * ========================================================================= */}
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

      {/* =========================================================================
       * MODAIS: ETAPAS (CRIAR E EDITAR)
       * ========================================================================= */}
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

      {/* =========================================================================
       * MODAL NOVA DM (COLABORADORES)
       * ========================================================================= */}
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

      {/* =========================================================================
       * MODAL AVISO GERAL (ADMIN BROADCAST PRESERVADO)
       * ========================================================================= */}
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
