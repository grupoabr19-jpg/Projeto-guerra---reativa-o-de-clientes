import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Phone,
  PhoneCall,
  MessageSquare,
  Mail,
  Lock,
  LockOpen,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  HelpCircle,
  FileText,
  Calendar,
  Building2,
  DollarSign,
  Package,
  Layers,
  History,
  RotateCcw,
  Sparkles,
  Users,
  Search,
  Loader2,
  X,
  AlertCircle,
  Headphones,
  Pencil,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  fetchClienteById,
  updateCliente,
  createInteracao,
  fetchInteracoesByCliente,
  saveRespostasFormulario,
  releaseQueueLock,
  syncKommoLead,
  reserveNextQueueClient,
  searchClientesCarteira,
  reserveSpecificQueueClient,
  destravarClienteStandby,
  editarAtendimentoFechadoAdmin,
  fetchUltimaRespostaFormulario,
  type ReserveSpecificError,
  transferClienteOperador,
  fetchUsers,
  type ClienteBuscaCarteiraItem,
} from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
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
import type { Cliente, Interacao, ClienteEstado, User } from '@/types'
import { SEGMENTOS_OFICIAIS } from '@/lib/segmentos'
import {
  OPCOES_Q3_ORCAMENTO,
  OPCOES_Q7_CONCORRENCIA,
  OPCOES_Q8_OCORRENCIA,
  OPCOES_Q10_ACAO_CORRETIVA,
} from '@/lib/perguntasFicha'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ajustarParaExpediente,
  getSugestaoReagendamentoHtml,
  formatarDataHoraBrasilia,
} from '@/lib/expediente'
import { useVersion } from '@/contexts/VersionContext'

export default function AtendimentoPage() {
  const { clientId } = useParams<{ clientId?: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { setAtendimentoAtivo } = useVersion()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [loading, setLoading] = useState(true)

  // Modo de Edição de Atendimento Fechado (Exclusivo Admin)
  const [modoEdicaoAdmin, setModoEdicaoAdmin] = useState(false)
  const [showConfirmEditarFechado, setShowConfirmEditarFechado] = useState(false)
  const [showModalMotivoEdicao, setShowModalMotivoEdicao] = useState(false)
  const [motivoEdicaoAdmin, setMotivoEdicaoAdmin] = useState('')
  const [salvandoEdicaoAdmin, setSalvandoEdicaoAdmin] = useState(false)

  // Filtros da nova experiência do Operador
  const [filtroSegmento, setFiltroSegmento] = useState<string>('todos')
  const [filtroOrdenacao, setFiltroOrdenacao] = useState<'score' | 'antigos' | 'novos'>('score')
  const [reservandoNovo, setReservandoNovo] = useState(false)
  const [showQuestionarioModal, setShowQuestionarioModal] = useState(false)
  const [avisoSegmentoZerado, setAvisoSegmentoZerado] = useState<{
    segmento: string
    totalCarteiraSemFiltro: number
  } | null>(null)

  // Busca por nome na carteira do operador
  const [termoBuscaCarteira, setTermoBuscaCarteira] = useState('')
  const [resultadosBuscaCarteira, setResultadosBuscaCarteira] = useState<
    ClienteBuscaCarteiraItem[]
  >([])
  const [buscandoCarteira, setBuscandoCarteira] = useState(false)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [selecionandoClienteBusca, setSelecionandoClienteBusca] = useState<string | null>(null)

  // Questionário de Perguntas — Etapas visíveis: Q3 (3), Q5..Q13 (5..13), Q14..Q17 (14..17).
  // Q1, Q2 e Q4 são pré-preenchidas e puladas na navegação para não duplicar o card de gatilhos.
  // Regra Q3 ("Fez orçamento?"): Q15 e Q16 só existem no fluxo se Q3="Sim". Se Q3="Não", Q15 e Q16 são puladas e ocultadas.
  const [currentStep, setCurrentStep] = useState(3)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [anexosFiles, setAnexosFiles] = useState<File[]>([])

  // Aviso de validação métricas (balãozinho amigável Q15/Q16)
  const [avisoValidacaoMetrica, setAvisoValidacaoMetrica] = useState<{
    campo: 'q15' | 'q16'
    mensagem: string
  } | null>(null)

  // Desfecho Unificado (Q14 e Q17 foram unificados pelo usuário)
  const [desfechoFinal, setDesfechoFinal] = useState<ClienteEstado | ''>('')
  const [motivoDesfecho, setMotivoDesfecho] = useState('')
  const [motivoAtivoForaBase, setMotivoAtivoForaBase] = useState('compra por CPF de terceiro')
  const [obsAtivoForaBase, setObsAtivoForaBase] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [reagendarData, setReagendarData] = useState('')
  const [avisoAjusteExpediente, setAvisoAjusteExpediente] = useState<string | null>(null)
  const [numeroPedido, setNumeroPedido] = useState('')
  const [houvePedidoFechado, setHouvePedidoFechado] = useState<'sim' | 'nao' | ''>('')
  const [valorPedidoFechado, setValorPedidoFechado] = useState('')
  const [previsaoFaturamento, setPrevisaoFaturamento] = useState('')
  const [observacoesPedido, setObservacoesPedido] = useState('')
  const [duplicadoCodigo, setDuplicadoCodigo] = useState('')
  const [isFinalizing, setIsFinalizing] = useState(false)

  // Diálogos shadcn de confirmação
  const [showConfirmAbandonar, setShowConfirmAbandonar] = useState(false)
  const [showConfirmReativarSemPedido, setShowConfirmReativarSemPedido] = useState(false)
  const [showConfirmDestravarStandby, setShowConfirmDestravarStandby] = useState(false)
  const [clienteParaDestravar, setClienteParaDestravar] = useState<{
    id: string
    nome: string
    codigo: string
    standbyAte?: string
  } | null>(null)
  const [destravandoStandby, setDestravandoStandby] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Timeline nova nota
  const [novaNota, setNovaNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  // Atribuição / Transferência de cliente para colega da mesma região
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [operadoresRegiao, setOperadoresRegiao] = useState<User[]>([])
  const [selectedDestinoOp, setSelectedDestinoOp] = useState('')
  const [motivoTransferencia, setMotivoTransferencia] = useState('')
  const [transferindo, setTransferindo] = useState(false)

  useEffect(() => {
    if (clientId) {
      loadCliente(clientId)
    } else {
      // Se não tem clientId na URL, tenta puxar se o operador já tem cliente com lock ativo
      checkExistingLockOrIdle()
    }
  }, [clientId])

  // Notificar o VersionContext sobre o status de atendimento ativo para nunca interromper com auto-reload
  useEffect(() => {
    const isAtivo = Boolean(cliente && cliente.id)
    setAtendimentoAtivo(isAtivo)
    return () => {
      setAtendimentoAtivo(false)
    }
  }, [cliente, setAtendimentoAtivo])

  // Debounce para busca de clientes por nome na carteira do operador
  useEffect(() => {
    const termo = termoBuscaCarteira.trim()
    if (termo.length < 3) {
      setResultadosBuscaCarteira([])
      setBuscandoCarteira(false)
      return
    }

    setBuscandoCarteira(true)
    const timer = setTimeout(async () => {
      try {
        const res = await searchClientesCarteira(termo)
        setResultadosBuscaCarteira(res.items || [])
        setBuscaAberta(true)
      } catch (err: unknown) {
        console.error('Erro na busca de clientes da carteira:', err)
        setResultadosBuscaCarteira([])
      } finally {
        setBuscandoCarteira(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [termoBuscaCarteira])

  // Selecionar um cliente encontrado na busca e abrir ficha com lock de 30 min
  const handleSelecionarClienteBusca = async (item: ClienteBuscaCarteiraItem) => {
    setSelecionandoClienteBusca(item.id)
    try {
      const res = await reserveSpecificQueueClient(item.id)
      if (res.cliente) {
        setTermoBuscaCarteira('')
        setResultadosBuscaCarteira([])
        setBuscaAberta(false)
        await loadCliente(res.cliente.id)
        navigate(`/atendimento/${res.cliente.id}`, { replace: true })
        toast({
          title: 'Cliente aberto da carteira',
          description: `${item.nome} (${item.codigo}) aberto com lock ativo para atendimento.`,
        })
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      const reserveErr = err as ReserveSpecificError
      const isStandby =
        reserveErr?.isStandby ||
        rawMsg.toLowerCase().includes('standby') ||
        rawMsg.toLowerCase().includes('reativado recentemente')

      if (isStandby && user?.role === 'admin') {
        // Para admin: prepara o modal de confirmação para destravar imediatamente
        setClienteParaDestravar({
          id: reserveErr?.clienteId || item.id,
          nome: reserveErr?.clienteNome || item.nome,
          codigo: reserveErr?.clienteCodigo || item.codigo,
          standbyAte: reserveErr?.standbyAte,
        })
        setShowConfirmDestravarStandby(true)
      }

      toast({
        variant: 'destructive',
        title: 'Não foi possível abrir o cliente',
        description:
          user?.role === 'admin' && isStandby
            ? `${rawMsg} Como Administrador, você pode usar a opção "Destravar cliente" abaixo.`
            : rawMsg || 'Falha ao reservar o cliente para atendimento.',
      })
    } finally {
      setSelecionandoClienteBusca(null)
    }
  }

  // Ação exclusiva de Admin: Destravar cliente em standby
  const handleConfirmDestravarStandby = async () => {
    const alvo =
      clienteParaDestravar ||
      (cliente ? { id: cliente.id, nome: cliente.nome, codigo: cliente.codigo } : null)
    if (!alvo) return
    setDestravandoStandby(true)
    try {
      const res = await destravarClienteStandby(
        alvo.id,
        `Destrave de standby manual realizado pelo administrador ${user?.name || user?.email || 'admin'}.`,
      )
      toast({
        title: 'Cliente destravado!',
        description:
          res.message || `${alvo.nome} foi liberado do standby e pode ser atendido normalmente.`,
      })
      setShowConfirmDestravarStandby(false)
      setClienteParaDestravar(null)

      // Se o cliente atual for o destravado, recarrega
      if (cliente && cliente.id === alvo.id) {
        await loadCliente(alvo.id)
      } else {
        // Tenta abrir o cliente imediatamente
        try {
          const resReserve = await reserveSpecificQueueClient(alvo.id)
          if (resReserve.cliente) {
            setTermoBuscaCarteira('')
            setResultadosBuscaCarteira([])
            setBuscaAberta(false)
            await loadCliente(resReserve.cliente.id)
            navigate(`/atendimento/${resReserve.cliente.id}`, { replace: true })
          }
        } catch (_) {
          // Se não conseguir auto-abrir, apenas recarrega busca
          if (termoBuscaCarteira.trim().length >= 3) {
            const reSearch = await searchClientesCarteira(termoBuscaCarteira.trim())
            setResultadosBuscaCarteira(reSearch.items || [])
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao destravar cliente em standby'
      toast({
        variant: 'destructive',
        title: 'Erro ao destravar',
        description: msg,
      })
    } finally {
      setDestravandoStandby(false)
    }
  }

  const checkExistingLockOrIdle = async () => {
    setLoading(true)
    try {
      // Se o operador já possuir um cliente em atendimento ou reservado, o backend retorna com ja_reservado = true
      const res = await reserveNextQueueClient({
        segmento: filtroSegmento === 'todos' ? undefined : filtroSegmento,
        ordenacao: filtroOrdenacao,
      })
      if (res.cliente) {
        setAvisoSegmentoZerado(null)
        setCliente(res.cliente)
        loadCliente(res.cliente.id)
      } else {
        setCliente(null)
        if (res.segmento_zerado && filtroSegmento !== 'todos') {
          setAvisoSegmentoZerado({
            segmento: filtroSegmento,
            totalCarteiraSemFiltro: res.total_carteira_sem_filtro || 0,
          })
        } else {
          setAvisoSegmentoZerado(null)
        }
      }
    } catch (_) {
      setCliente(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePuxarNovoAtendimento = async () => {
    setReservandoNovo(true)
    try {
      const res = await reserveNextQueueClient({
        segmento: filtroSegmento === 'todos' ? undefined : filtroSegmento,
        ordenacao: filtroOrdenacao,
      })
      if (res.cliente) {
        setAvisoSegmentoZerado(null)
        await loadCliente(res.cliente.id)
        navigate(`/atendimento/${res.cliente.id}`, { replace: true })
        if (res.ja_reservado) {
          toast({
            title: 'Atendimento retomado',
            description:
              res.message || 'Você já possuía este contato em andamento. Atendimento reaberto.',
          })
        } else {
          toast({
            title: 'Cliente reservado',
            description: res.message || 'Novo contato reservado com sucesso.',
          })
        }
      } else {
        // Distingue carteira esgotada real de filtro de segmento ativo que zerou a busca
        if (res.segmento_zerado && filtroSegmento !== 'todos') {
          setAvisoSegmentoZerado({
            segmento: filtroSegmento,
            totalCarteiraSemFiltro: res.total_carteira_sem_filtro || 0,
          })
          toast({
            variant: 'default',
            title: 'Filtro de segmento sem resultados',
            description:
              res.message ||
              `Nenhum cliente disponível no segmento selecionado. Selecione 'Todos os Segmentos' para acessar os ${res.total_carteira_sem_filtro || 0} clientes da sua carteira.`,
          })
        } else {
          setAvisoSegmentoZerado(null)
          toast({
            variant: res.carteira_esgotada ? 'destructive' : 'default',
            title: res.carteira_esgotada
              ? 'Carteira esgotada'
              : 'Nenhum cliente elegível na sua fila',
            description:
              res.message ||
              (res.segunda_passada_executada
                ? 'Após busca completa e verificação ampliada da rota, nenhum cliente elegível foi localizado no momento.'
                : 'Não encontramos nenhum cliente elegível disponível na sua rota no momento. Tente trocar os filtros ou tente novamente mais tarde.'),
          })
        }
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err)
      const isServer500 =
        rawMsg.includes('500') || rawMsg.toLowerCase().includes('internal server error')
      const isAuthError = rawMsg.toLowerCase().includes('autentica') || rawMsg.includes('401')

      toast({
        variant: 'destructive',
        title: isAuthError
          ? 'Sessão expirada'
          : isServer500
            ? 'Erro no servidor'
            : 'Atenção na reserva',
        description: isAuthError
          ? 'Sua sessão expirou. Por favor, recarregue a página ou faça login novamente.'
          : isServer500
            ? 'Ocorreu uma instabilidade no servidor ao reservar o cliente. O erro foi reportado; por favor, tente novamente em instantes.'
            : rawMsg || 'Não foi possível reservar um cliente neste momento.',
      })
    } finally {
      setReservandoNovo(false)
    }
  }

  const loadCliente = async (id: string) => {
    setLoading(true)
    try {
      const c = await fetchClienteById(id)
      setCliente(c)

      // Se o cliente for aberto em modo_edicao_admin ou já estiver fechado, NÃO mudar para 'em_atendimento'
      const estadosConcluidos = [
        'reativado',
        'reagendado',
        'sem_contato',
        'venda_perdida',
        'compra_terceiros',
        'nao_quer_negociar',
        'restricao_financeira',
        'duplicado',
        'ativo_fora_base',
      ]
      const cAny = c as unknown as Record<string, unknown>
      const desfechoExtra = typeof cAny.desfecho === 'string' ? cAny.desfecho : ''
      const jaTemDesfechoConcluido =
        estadosConcluidos.includes(c.estado) ||
        Boolean(desfechoExtra && estadosConcluidos.includes(desfechoExtra))

      const isFechado =
        jaTemDesfechoConcluido ||
        (c.estado !== 'em_atendimento' && c.estado !== 'na_base' && c.estado !== 'reservado')

      if (!isFechado && c.estado !== 'em_atendimento' && user) {
        await updateCliente(c.id, {
          estado: 'em_atendimento',
          operador: user.id,
          lock_timestamp: new Date().toISOString(),
        })
      }

      // Preenchimento automático de Q1, Q2 e Q4 conforme regra do desenho
      setAnswers((prev) => ({
        ...prev,
        q1: c.codigo,
        q2: c.nome,
        q4: `${c.regiao} — Vendedor: ${c.vendedor || 'Não atribuído'}`,
        ...((c.rascunho_respostas as Record<string, string | number>) || {}),
      }))

      // Carregar histórico
      const timeline = await fetchInteracoesByCliente(c.id)
      setInteracoes(timeline)

      // Sync reserva com Kommo
      syncKommoLead({
        cliente_id: c.id,
        action: 'reserve',
      }).catch((e) => console.log('Kommo sync reserva silenciosa:', e))
    } catch (err) {
      console.error('Falha ao carregar cliente:', err)
    } finally {
      setLoading(false)
    }
  }

  // Normalizador auxiliar para comparar regiões/rotas ignorando acentos e variações
  const normalizarNomeRegiao = (r?: string) => {
    let s = (r || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()
    if (s === 'BRAGANCA PAULISTA' || s === 'BRAGANCA') return 'BRAGANCA'
    if (s === 'POCOS DE CALDAS' || s === 'POCOS CALDAS' || s === 'POCOS') {
      return 'POCOS DE CALDAS'
    }
    if (s === 'CAMBUI' || s === 'MICRO-REGIAO' || s === 'MICRO REGIAO' || s === 'MICROREGIAO') {
      return 'CAMBUI'
    }
    if (s === 'JUNDIAI') return 'JUNDIAI'
    if (s === 'ITAJUBA') return 'ITAJUBA'
    if (s === 'POUSO ALEGRE') return 'POUSO ALEGRE'
    if (s === 'VARGINHA') return 'VARGINHA'
    if (s === 'EXTREMA') return 'EXTREMA'
    if (s === 'ATACADO') return 'ATACADO'
    return s
  }

  // Detectar parâmetro modo=edicao_admin na URL
  useEffect(() => {
    const modo = searchParams.get('modo')
    if (modo === 'edicao_admin' && user?.role === 'admin' && cliente && !modoEdicaoAdmin) {
      const isFechado =
        cliente.estado !== 'em_atendimento' &&
        cliente.estado !== 'na_base' &&
        cliente.estado !== 'reservado'
      if (isFechado) {
        setModoEdicaoAdmin(true)
        const cliAny = cliente as unknown as Record<string, unknown>
        const desfechoOuEstado = (cliAny.desfecho as string) || cliente.estado
        if (desfechoOuEstado) {
          setDesfechoFinal(desfechoOuEstado as ClienteEstado)
        }
        if (cliAny.observacoes) {
          setObservacoes(cliAny.observacoes as string)
        }
        // Puxar última resposta do formulário para carregar campos adicionais (valor, toneladas) se houver
        fetchUltimaRespostaFormulario(cliente.id).then((rf) => {
          if (rf) {
            setAnswers((prev) => ({
              ...prev,
              ...(rf.respostas as Record<string, string | number>),
              ...(rf.valor_potencial !== undefined ? { q15: rf.valor_potencial } : {}),
              ...(rf.toneladas_potencial !== undefined ? { q16: rf.toneladas_potencial } : {}),
            }))
          }
        })
      }
    }
  }, [searchParams, user, cliente, modoEdicaoAdmin])

  // Desempacotar perguntas com "Outros: <texto>" quando cliente carrega
  useEffect(() => {
    if (!cliente) return
    const chaves = ['q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q12', 'q13']
    const rascunho = (cliente.rascunho_respostas as Record<string, string | number>) || {}
    const updates: Record<string, string | number> = {}
    chaves.forEach((key) => {
      const val = String(answers[key] ?? rascunho[key] ?? '')
      if (val.startsWith('Outros: ') || val.startsWith('Outros - ')) {
        const textoLivre = val.replace(/^Outros[:\s-]+/, '').trim()
        updates[key] = 'Outros'
        updates[`${key}_outros`] = textoLivre
      }
    })
    if (Object.keys(updates).length > 0) {
      setAnswers((prev) => ({ ...prev, ...updates }))
    }
  }, [cliente?.id])

  // Manipulador exclusivo de Q3 ("Fez orçamento?"):
  // Quando muda para "Não", limpa os valores de Q15 e Q16 do estado para nunca gravar dado órfão
  const handleQ3Change = (val: string) => {
    setAnswers((prev) => {
      const updated: Record<string, string | number> = { ...prev, q3: val }
      if (val === 'Não') {
        delete updated.q15
        delete updated.q16
      }
      return updated
    })
    if (val === 'Não') {
      setAvisoValidacaoMetrica(null)
      // Se estava em step 15 ou 16 e mudou para Não, pula para 17
      if (currentStep === 15 || currentStep === 16) {
        setCurrentStep(17)
      }
    }
  }

  // Salvar Edição de Atendimento Fechado pelo Administrador
  const handleSalvarEdicaoAdmin = async () => {
    if (!cliente || !user) return
    if (!desfechoFinal) {
      toast({
        variant: 'destructive',
        title: 'Desfecho obrigatório',
        description: 'Selecione o desfecho do atendimento.',
      })
      return
    }
    if (!motivoEdicaoAdmin.trim()) {
      setShowModalMotivoEdicao(true)
      return
    }

    setSalvandoEdicaoAdmin(true)
    try {
      // Validação frontend de Q15 e Q16:
      // SOMENTE exigidas quando Q3 = "Sim". Se Q3 = "Não", Q15 e Q16 ficam ocultas e vazias (isenta também sem_contato e duplicado).
      const q3Val = answers.q3 !== undefined && answers.q3 !== null ? String(answers.q3).trim() : ''
      const fezOrcamento = q3Val === 'Sim'

      if (
        fezOrcamento &&
        desfechoFinal !== 'sem_contato' &&
        desfechoFinal !== 'duplicado' &&
        desfechoFinal !== 'restricao_financeira'
      ) {
        const rawValor = answers.q15 !== undefined ? String(answers.q15).trim() : ''
        const rawPeso = answers.q16 !== undefined ? String(answers.q16).trim() : ''
        const numValor = parseFloat(rawValor.replace(/[^\d.,]/g, '').replace(',', '.'))
        const numPeso = parseFloat(rawPeso.replace(/[^\d.,]/g, '').replace(',', '.'))

        if (rawValor === '' || isNaN(numValor) || numValor < 0) {
          setCurrentStep(15)
          setAvisoValidacaoMetrica({
            campo: 'q15',
            mensagem:
              'O preenchimento do Valor Potencial (Q15) é imprescindível para termos um bom retorno das métricas.',
          })
          toast({
            variant: 'destructive',
            title: 'Campo obrigatório',
            description:
              'O preenchimento do Valor Potencial (Q15) é imprescindível para termos um bom retorno das métricas.',
          })
          setIsFinalizing(false)
          return
        }

        if (rawPeso === '' || isNaN(numPeso) || numPeso < 0) {
          setCurrentStep(16)
          setAvisoValidacaoMetrica({
            campo: 'q16',
            mensagem:
              'O preenchimento do Volume em Toneladas (Q16) é imprescindível para termos um bom retorno das métricas.',
          })
          toast({
            variant: 'destructive',
            title: 'Campo obrigatório',
            description:
              'O preenchimento do Volume em Toneladas (Q16) é imprescindível para termos um bom retorno das métricas.',
          })
          setIsFinalizing(false)
          return
        }
      }

      // Se Q3 for "Não", campos de valor e peso são gravados vazios (undefined/null, NUNCA zero)
      let valorPotencial: number | undefined = undefined
      let toneladasPotencial: number | undefined = undefined

      if (fezOrcamento) {
        valorPotencial =
          parseFloat(
            String(answers.q15 || '')
              .replace(/[^\d.,]/g, '')
              .replace(',', '.'),
          ) || undefined
        toneladasPotencial =
          parseFloat(
            String(answers.q16 || '')
              .replace(/[^\d.,]/g, '')
              .replace(',', '.'),
          ) || undefined
      }

      // Consolidar respostas com "Outros: <texto>" (Q3 agora é Sim/Não sem 'Outros')
      const chavesOutros = ['q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q12', 'q13']
      const respostasConsolidadas: Record<string, unknown> = { ...answers }
      if (!fezOrcamento) {
        delete respostasConsolidadas.q15
        delete respostasConsolidadas.q16
      }
      chavesOutros.forEach((key) => {
        if (answers[key] === 'Outros') {
          const texto = String(answers[`${key}_outros`] || '').trim()
          respostasConsolidadas[key] = texto ? `Outros: ${texto}` : 'Outros'
        }
      })

      const res = await editarAtendimentoFechadoAdmin({
        cliente_id: cliente.id,
        respostas: respostasConsolidadas,
        desfecho: desfechoFinal,
        observacoes: observacoes,
        motivo_edicao: motivoEdicaoAdmin.trim(),
        valor_potencial: valorPotencial,
        toneladas_potencial: toneladasPotencial,
      })

      toast({
        title: 'Edição salva com sucesso!',
        description: res.message || 'Ficha do atendimento atualizada pelo administrador.',
      })

      setShowModalMotivoEdicao(false)
      setModoEdicaoAdmin(false)
      setMotivoEdicaoAdmin('')

      // Recarregar cliente e timeline
      const c = await fetchClienteById(cliente.id)
      setCliente(c)
      const tl = await fetchInteracoesByCliente(cliente.id)
      setInteracoes(tl)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar edição do atendimento'
      toast({
        variant: 'destructive',
        title: 'Erro na edição',
        description: msg,
      })
    } finally {
      setSalvandoEdicaoAdmin(false)
    }
  }

  // Carregar colegas da MESMA região/rota para o dropdown de transferência
  const handleOpenTransferModal = async () => {
    if (!cliente) return
    try {
      const allUsers = await fetchUsers()

      // Regiões do operador logado
      const regioesLogadoNorm = (user?.regioes || []).map(normalizarNomeRegiao).filter(Boolean)
      const regiaoClienteNorm = normalizarNomeRegiao(cliente.regiao)

      // Regiões de referência da rota: se o operador logado tiver regiões, usamos as dele (e também a do cliente se bater)
      const regioesRotaRef = new Set<string>()
      if (regioesLogadoNorm.length > 0) {
        regioesLogadoNorm.forEach((r) => regioesRotaRef.add(r))
      }
      if (regiaoClienteNorm && regiaoClienteNorm !== 'SEM REGIAO') {
        regioesRotaRef.add(regiaoClienteNorm)
      }

      // Filtrar APENAS colegas de rota:
      // 1. Papel operador, líder ou supervisor (exclui admins sem região ou admins globais)
      // 2. Não ser o próprio usuário
      // 3. Ter pelo menos uma região na rota de referência
      const colegas = allUsers.filter((u) => {
        if (u.id === user?.id) return false
        // Excluir admins do dropdown de destino (regra: colegas de rota de vendas)
        if (u.role !== 'operador' && u.role !== 'lider' && u.role !== 'supervisor') {
          return false
        }
        const regioesUserNorm = (u.regioes || []).map(normalizarNomeRegiao).filter(Boolean)
        if (regioesUserNorm.length === 0) return false

        // Deve pertencer à mesma rota/região
        return regioesUserNorm.some((r) => regioesRotaRef.has(r))
      })

      setOperadoresRegiao(colegas)
      setSelectedDestinoOp(colegas.length > 0 ? colegas[0].id : '')
      setMotivoTransferencia(
        `Cliente da carteira de ${cliente.regiao || 'rota'} — repasse para colega de rota`,
      )
      setShowTransferModal(true)
    } catch (err) {
      console.error('Erro ao buscar operadores da região:', err)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar a lista de operadores da região.',
      })
    }
  }

  // Confirmar a transferência / atribuição de cliente para colega da mesma região
  const handleConfirmTransfer = async () => {
    if (!cliente || !selectedDestinoOp) {
      toast({
        variant: 'destructive',
        title: 'Operador obrigatório',
        description: 'Selecione o operador de destino.',
      })
      return
    }

    setTransferindo(true)
    try {
      const destinoUser = operadoresRegiao.find((u) => u.id === selectedDestinoOp)
      const destinoNome = destinoUser?.name || destinoUser?.email || 'Colega'

      await transferClienteOperador({
        cliente_id: cliente.id,
        destino_operador_id: selectedDestinoOp,
        motivo: motivoTransferencia || 'Transferência entre vendedores da mesma região',
        rascunho_respostas: answers,
      })

      toast({
        title: 'Cliente atribuído com sucesso!',
        description: `O cadastro foi repassado para ${destinoNome} e será o PRIMEIRO a cair nos follow-ups dele.`,
      })

      setShowTransferModal(false)
      setCliente(null)
      navigate(user?.role === 'operador' || user?.role === 'lider' ? '/meu-painel' : '/fila')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao transferir cliente'
      toast({
        variant: 'destructive',
        title: 'Erro na transferência',
        description: msg,
      })
    } finally {
      setTransferindo(false)
    }
  }

  // Devolver cliente à fila e liberar lock (abrir diálogo shadcn)
  const handleReleaseLock = () => {
    if (!cliente) return
    if (cliente.operador && user && cliente.operador !== user.id && user.role !== 'admin') {
      toast({
        variant: 'destructive',
        title: 'Operação não permitida',
        description: 'Não é possível devolver cliente reservado por outro operador.',
      })
      return
    }
    setShowConfirmAbandonar(true)
  }

  const handleConfirmReleaseLock = async () => {
    if (!cliente) return
    setShowConfirmAbandonar(false)
    try {
      await releaseQueueLock(cliente.id, answers)
      setCliente(null)
      toast({
        title: 'Atendimento liberado',
        description: 'O contato retornou à fila e o rascunho foi salvo.',
      })
      navigate(user?.role === 'operador' || user?.role === 'lider' ? '/meu-painel' : '/fila')
    } catch (err) {
      console.error('Erro ao liberar cliente:', err)
      setCliente(null)
      navigate(user?.role === 'operador' || user?.role === 'lider' ? '/meu-painel' : '/fila')
    }
  }

  // Regra condicional Q8, Q9 e Q10:
  // Se Q9 = "Nenhum erro ocorrido", Q8 e Q10 se pulam/preenchem sozinhas
  const handleQ9Change = (val: string) => {
    if (val === 'Nenhum erro ocorrido') {
      setAnswers((prev) => ({
        ...prev,
        q9: val,
        q8: 'Nenhum erro relatado no histórico recente',
        q10: 'Sem necessidade de ação reparatória',
      }))
    } else {
      setAnswers((prev) => ({ ...prev, q9: val }))
    }
  }

  // Registrar contato na timeline (Ligar, Whats, Email)
  const handleRegisterContact = async (tipo: 'ligacao' | 'whatsapp' | 'email') => {
    if (!cliente || !user) return
    try {
      await createInteracao({
        cliente: cliente.id,
        operador: user.id,
        tipo,
        conteudo: `Tentativa de contato via ${tipo.toUpperCase()} às ${new Date().toLocaleTimeString('pt-BR')}`,
      })
      const timeline = await fetchInteracoesByCliente(cliente.id)
      setInteracoes(timeline)
    } catch (err) {
      console.error('Erro ao registrar contato:', err)
    }
  }

  // Adicionar nota rápida
  const handleAddNota = async () => {
    if (!cliente || !user || !novaNota.trim()) return
    setSavingNota(true)
    try {
      await createInteracao({
        cliente: cliente.id,
        operador: user.id,
        tipo: 'nota',
        conteudo: novaNota.trim(),
      })
      setNovaNota('')
      const timeline = await fetchInteracoesByCliente(cliente.id)
      setInteracoes(timeline)
    } catch (err) {
      console.error('Erro ao salvar nota:', err)
    } finally {
      setSavingNota(false)
    }
  }

  // Finalização do Atendimento com a Máquina de Estados completa
  const handleFinalizeAtendimento = async () => {
    if (!cliente || !user || !desfechoFinal) {
      toast({
        variant: 'destructive',
        title: 'Desfecho obrigatório',
        description: 'Por favor, selecione o desfecho final do atendimento.',
      })
      return
    }

    // Se estiver em modo de edição de atendimento fechado pelo admin:
    if (modoEdicaoAdmin && user?.role === 'admin') {
      setShowModalMotivoEdicao(true)
      return
    }

    if (desfechoFinal === 'reagendado' && !reagendarData) {
      toast({
        variant: 'destructive',
        title: 'Data obrigatória',
        description: 'Informe a data e horário para reagendamento.',
      })
      return
    }

    // Validação preventiva de duplicidade: se o cliente já foi reativado recentemente (< 30 dias) ou está em standby
    if (desfechoFinal === 'reativado') {
      const agora = new Date()
      const agoraMs = agora.getTime()
      let emStandby = false
      if (cliente.standby_ate) {
        const stDate = new Date(cliente.standby_ate)
        if (!isNaN(stDate.getTime()) && stDate.getTime() > agoraMs) {
          emStandby = true
        }
      }

      let reativadoRecentemente = false
      let reativadoDataFormatada = ''
      if (cliente.reativado_em) {
        const reatDate = new Date(cliente.reativado_em)
        if (!isNaN(reatDate.getTime())) {
          const diffDias = (agoraMs - reatDate.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDias >= 0 && diffDias < 30) {
            reativadoRecentemente = true
          }
          const dia = String(reatDate.getDate()).padStart(2, '0')
          const mes = String(reatDate.getMonth() + 1).padStart(2, '0')
          reativadoDataFormatada = `${dia}/${mes}`
        }
      }

      if ((emStandby || reativadoRecentemente) && user.role !== 'admin') {
        const dataStr = reativadoDataFormatada || 'data recente'
        toast({
          variant: 'destructive',
          title: 'Reativação duplicada bloqueada',
          description: `Cliente já reativado em ${dataStr} — reativação duplicada bloqueada. Este cliente está protegido pelo período de standby de 60 dias.`,
        })
        return
      }

      if (!houvePedidoFechado) {
        toast({
          variant: 'destructive',
          title: 'Pergunta obrigatória',
          description: 'Informe se houve pedido fechado (Sim ou Não).',
        })
        return
      }

      if (houvePedidoFechado === 'sim' && !numeroPedido.trim()) {
        toast({
          variant: 'destructive',
          title: 'Número do pedido obrigatório',
          description: 'Para reativação com pedido fechado, preencha o número do pedido.',
        })
        return
      }

      if (houvePedidoFechado === 'nao') {
        setShowConfirmReativarSemPedido(true)
        return
      }
    }

    if (desfechoFinal === 'ativo_fora_base' && !motivoAtivoForaBase.trim()) {
      toast({
        variant: 'destructive',
        title: 'Motivo obrigatório',
        description: 'Informe o motivo obrigatório para a saída do cliente ativo da base.',
      })
      return
    }

    await executeFinalize()
  }

  const executeFinalize = async () => {
    if (!cliente || !user || !desfechoFinal) return

    setIsFinalizing(true)
    try {
      // 1. Gravar dados das respostas
      const valorPotencial =
        parseFloat(
          String(answers.q15 || 0)
            .replace(/[^\d.,]/g, '')
            .replace(',', '.'),
        ) || 0
      const toneladasPotencial =
        parseFloat(
          String(answers.q16 || 0)
            .replace(/[^\d.,]/g, '')
            .replace(',', '.'),
        ) || 0

      // Consolidar respostas com "Outros: <texto>"
      const chavesOutros = ['q3', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q12', 'q13']
      const respostasConsolidadas: Record<string, unknown> = { ...answers }
      chavesOutros.forEach((key) => {
        if (answers[key] === 'Outros') {
          const texto = String(answers[`${key}_outros`] || '').trim()
          respostasConsolidadas[key] = texto ? `Outros: ${texto}` : 'Outros'
        }
      })

      await saveRespostasFormulario({
        cliente: cliente.id,
        operador: user.id,
        respostas: respostasConsolidadas,
        desfecho: desfechoFinal,
        valor_potencial: valorPotencial,
        toneladas_potencial: toneladasPotencial,
      })

      // 2. Determinar novos campos no Cliente
      // Valores reais aceitos pelo PocketBase para zerar campos: string vazia ''
      const updatePayload: Partial<Cliente> = {
        estado: desfechoFinal,
        lock_timestamp: '', // remove o lock atomicamente no PocketBase
        operador: '', // padrão: desvincula operador ao concluir
      }

      // Regra de higienização de reagendamento:
      // Se o desfecho for 'reagendado', preenche nova data e operador.
      // Se for QUALQUER OUTRO desfecho, limpa explicitamente reagendado_para e reagendado_operador!
      if (desfechoFinal !== 'reagendado') {
        updatePayload.reagendado_para = ''
        updatePayload.reagendado_operador = ''
      }

      // Regras específicas da Máquina de Estados:
      if (desfechoFinal === 'reativado') {
        const agora = new Date()
        const standbyDate = new Date(agora.getTime() + 60 * 24 * 60 * 60 * 1000)
        updatePayload.pedido_reativacao = numeroPedido
        updatePayload.pedido_confirmado = false // aguarda confirmação na próxima importação
        updatePayload.reativado_em = agora.toISOString()
        updatePayload.standby_ate = standbyDate.toISOString()

        if (houvePedidoFechado === 'sim') {
          // Novo fluxo de pedido fechado pendente de faturamento:
          // Cliente continua na base sob responsabilidade do operador para edição/complementação
          updatePayload.pedido_em_aberto = true
          updatePayload.status_faturamento = 'pendente'
          updatePayload.operador_reativacao = user.id
          updatePayload.operador = user.id // mantém o operador vinculado para achar e editar
        } else {
          updatePayload.pedido_em_aberto = false
          updatePayload.status_faturamento = 'nenhum'
          updatePayload.operador = ''
        }

        updatePayload.lock_timestamp = ''
        updatePayload.quarentena_ate = ''
      } else if (desfechoFinal === 'reagendado') {
        const rawDate = new Date(reagendarData)
        const ajuste = ajustarParaExpediente(rawDate)
        updatePayload.reagendado_para = ajuste.dataAjustada.toISOString()
        updatePayload.reagendado_operador = user.id
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
      } else if (desfechoFinal === 'sem_contato') {
        const currentTentativas = (cliente.tentativas_sem_contato || 0) + 1
        updatePayload.tentativas_sem_contato = currentTentativas
        if (currentTentativas >= 3) {
          updatePayload.telefone_invalido = true
        }
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
      } else if (desfechoFinal === 'nao_quer_negociar') {
        // Quarentena de 90 dias configurável
        const quarentena = new Date()
        quarentena.setDate(quarentena.getDate() + 90)
        updatePayload.quarentena_ate = quarentena.toISOString()
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
      } else if (desfechoFinal === 'restricao_financeira') {
        // Desfecho fechado sem compra: cliente sai da esteira, lock liberado, sem quarentena e sem operador
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
        updatePayload.quarentena_ate = ''
      } else if (desfechoFinal === 'duplicado') {
        updatePayload.duplicado_de_codigo = duplicadoCodigo
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
      } else if (desfechoFinal === 'ativo_fora_base') {
        // Regra da Frente 2: Cliente Ativo — Fora da Base de Inativos
        // Marcação permanente no banco para nunca mais voltar para a fila de inativos
        const isClienteFinal = motivoAtivoForaBase === 'cliente_final'
        const textoMotivoEfetivo = isClienteFinal
          ? 'Cliente final — Fez uma compra pra uso pessoal e não comprou mais'
          : motivoAtivoForaBase

        updatePayload.ativo_fora_base = true
        updatePayload.motivo_ativo_fora_base = `${textoMotivoEfetivo}${obsAtivoForaBase ? ` — ${obsAtivoForaBase}` : ''}`
        if (isClienteFinal) {
          // Regra da Frente 4: desfecho 'cliente_final' migra para a Base Cliente Final
          updatePayload.base_categoria = 'cliente_final'
        }
        updatePayload.operador = ''
        updatePayload.lock_timestamp = ''
        updatePayload.quarentena_ate = ''
      }

      // Resiliência no update do cliente com retry em caso de falha de rede/concorrência
      let updateSucesso = false
      let updateErrorMsg = ''
      try {
        await updateCliente(cliente.id, updatePayload)
        updateSucesso = true
      } catch (errFirstUpdate) {
        console.warn(
          'Primeira tentativa de updateCliente falhou, tentando retry...',
          errFirstUpdate,
        )
        try {
          await new Promise((resolve) => setTimeout(resolve, 600))
          await updateCliente(cliente.id, updatePayload)
          updateSucesso = true
        } catch (errRetryUpdate: unknown) {
          updateErrorMsg =
            errRetryUpdate instanceof Error ? errRetryUpdate.message : String(errRetryUpdate)
          console.error('Segunda tentativa de updateCliente falhou:', errRetryUpdate)
        }
      }

      // Se ambas as tentativas de update do cliente falharem, interromper antes de navegar
      if (!updateSucesso) {
        throw new Error(
          'Falha de comunicação ao atualizar o status do cliente. Por favor, clique novamente em Confirmar para tentar gravar.' +
            (updateErrorMsg ? ` Detalhe: ${updateErrorMsg}` : ''),
        )
      }

      const textoMotivoFinalizacao =
        desfechoFinal === 'ativo_fora_base'
          ? motivoAtivoForaBase === 'cliente_final'
            ? 'Cliente final — Fez uma compra pra uso pessoal e não comprou mais'
            : motivoAtivoForaBase
          : motivoDesfecho

      // 3. Registrar interação de encerramento
      await createInteracao({
        cliente: cliente.id,
        operador: user.id,
        tipo: 'formulario',
        desfecho: desfechoFinal,
        motivo:
          desfechoFinal === 'ativo_fora_base'
            ? `${textoMotivoFinalizacao}${obsAtivoForaBase ? ` — ${obsAtivoForaBase}` : ''}`
            : motivoDesfecho,
        conteudo:
          desfechoFinal === 'ativo_fora_base'
            ? `Atendimento finalizado: CLIENTE ATIVO — FORA DA BASE DE INATIVOS.\nMotivo: ${textoMotivoFinalizacao}\nObservação do operador: ${obsAtivoForaBase || 'Nenhuma'}\n(Cliente removido permanentemente da base de inativos e protegido contra reimportações/recálculo)`
            : desfechoFinal === 'restricao_financeira'
              ? `Atendimento finalizado com desfecho: RESTRIÇÃO FINANCEIRA.\nObservações: ${observacoes || 'Nenhuma'}`
              : `Atendimento finalizado com desfecho: ${desfechoFinal.toUpperCase()}.\nObservações: ${observacoes || 'Nenhuma'}${
                  numeroPedido ? `\nPedido: ${numeroPedido}` : ''
                }${
                  desfechoFinal === 'reativado' && houvePedidoFechado === 'sim'
                    ? `\n[PEDIDO EM ABERTO REGISTRADO]${valorPedidoFechado ? `\nValor Estimado: R$ ${valorPedidoFechado}` : ''}${previsaoFaturamento ? `\nPrevisão de Faturamento: ${previsaoFaturamento}` : ''}${observacoesPedido ? `\nObs Pedido: ${observacoesPedido}` : ''}`
                    : ''
                }`,
        reagendado_para: reagendarData
          ? ajustarParaExpediente(new Date(reagendarData)).dataAjustada.toISOString()
          : undefined,
        numero_pedido: numeroPedido,
        estado_anterior: cliente.estado,
        estado_novo: desfechoFinal,
      })

      // 4. Sincronizar com Kommo CRM (cria lead/move etapa, grava nota e follow-up se houver)
      syncKommoLead({
        cliente_id: cliente.id,
        action: 'finalize',
        desfecho: desfechoFinal,
        observacoes: observacoes,
      }).catch((e) => console.log('Kommo sync finalização silenciosa:', e))

      toast({
        title: 'Atendimento concluído!',
        description: 'Atendimento registrado e sincronizado com sucesso.',
      })
      // Limpeza completa do estado local do cliente antes de navegar
      setCliente(null)
      setShowQuestionarioModal(false)
      navigate(user?.role === 'operador' || user?.role === 'lider' ? '/meu-painel' : '/fila')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar atendimento'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar atendimento',
        description: msg,
      })
    } finally {
      setIsFinalizing(false)
    }
  }

  const cleanPhone = cliente ? (cliente.telefone || cliente.whatsapp || '').replace(/\D/g, '') : ''

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho de Atendimento com identidade institucional e navegação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold text-slate-400">Operação</span>
            <span className="text-slate-300">/</span>
            <span className="text-[11px] font-bold text-[#F18800]">Atendimento</span>
          </div>
          <h1 className="text-lg font-black text-[#253575] tracking-tight flex items-center gap-2">
            <Headphones className="h-5 w-5 text-[#F18800]" />
            <span>Atendimento · Fila e Ficha Operacional</span>
          </h1>
          <p className="text-xs text-slate-500">
            Fila de atendimento de clientes 60–89 e 90+ dias, com lock atômico, qualificação das 17
            perguntas e máquina de estados.
          </p>
        </div>
      </div>

      {/* Topo do Atendimento: Barra de Filtros, Busca por Nome na Carteira e Botão Novo Atendimento */}
      <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Dropdown de Segmentos reais */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  Filtrar por Segmento
                </span>
                <Select
                  value={filtroSegmento}
                  onValueChange={(val) => {
                    setFiltroSegmento(val)
                    if (val === 'todos') {
                      setAvisoSegmentoZerado(null)
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-44 bg-white border-slate-300">
                    <SelectValue placeholder="Todos os Segmentos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos" className="text-xs">
                      Todos os Segmentos ({SEGMENTOS_OFICIAIS.length})
                    </SelectItem>
                    {SEGMENTOS_OFICIAIS.map((seg) => (
                      <SelectItem key={seg} value={seg} className="text-xs">
                        {seg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ordenação: Score, Mais Antigos, Mais Novos */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                  Critério de Ordenação
                </span>
                <Select
                  value={filtroOrdenacao}
                  onValueChange={(val: 'score' | 'antigos' | 'novos') => setFiltroOrdenacao(val)}
                >
                  <SelectTrigger className="h-8 text-xs w-44 bg-white border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score" className="text-xs">
                      ⭐ Padrão (60–89d / Score)
                    </SelectItem>
                    <SelectItem value="antigos" className="text-xs">
                      ⏳ Mais Antigos (90+ dias)
                    </SelectItem>
                    <SelectItem value="novos" className="text-xs">
                      ✨ Mais Novos (menos dias)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Campo de Busca por Nome na Carteira do Operador + Botão Novo Atendimento */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1 lg:max-w-2xl justify-end">
              <div className="relative flex-1 min-w-[260px] space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="busca-carteira-input"
                    className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <Search className="h-3 w-3 text-[#253575]" />
                    <span>Buscar na Minha Carteira</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">(mín. 3 letras)</span>
                </div>
                <div className="relative">
                  <Input
                    id="busca-carteira-input"
                    type="text"
                    placeholder="Buscar cliente por nome ou código..."
                    value={termoBuscaCarteira}
                    onChange={(e) => {
                      setTermoBuscaCarteira(e.target.value)
                      if (!buscaAberta) setBuscaAberta(true)
                    }}
                    onFocus={() => {
                      if (termoBuscaCarteira.trim().length >= 3) setBuscaAberta(true)
                    }}
                    className="h-9 text-xs pl-8 pr-8 bg-white border-slate-300 focus-visible:ring-[#253575] focus-visible:border-[#253575]"
                  />
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
                  {buscandoCarteira ? (
                    <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin absolute right-2.5 top-3" />
                  ) : termoBuscaCarteira ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTermoBuscaCarteira('')
                        setResultadosBuscaCarteira([])
                        setBuscaAberta(false)
                      }}
                      className="text-slate-400 hover:text-slate-600 absolute right-2.5 top-2.5"
                      aria-label="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                {/* Dropdown com os Resultados da Busca Server-Side */}
                {buscaAberta && termoBuscaCarteira.trim().length >= 3 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95">
                    <div className="bg-[#253575] text-white px-3 py-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Users className="h-3.5 w-3.5 text-[#F18800]" />
                        <span>Clientes na sua Carteira ({resultadosBuscaCarteira.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBuscaAberta(false)}
                        className="text-white/70 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {buscandoCarteira ? (
                        <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#253575]" />
                          <p>Buscando na sua carteira...</p>
                        </div>
                      ) : resultadosBuscaCarteira.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 space-y-1">
                          <AlertCircle className="h-5 w-5 text-amber-500 mx-auto" />
                          <p className="font-semibold text-slate-700">
                            Nenhum cliente encontrado na sua carteira
                          </p>
                          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                            Verifique se o nome está correto ou se o cliente pertence à sua rota/DDD
                            de atendimento.
                          </p>
                        </div>
                      ) : (
                        resultadosBuscaCarteira.map((item) => {
                          const isItemStandby = Boolean(
                            item.em_standby ||
                            (item.standby_ate &&
                              new Date(item.standby_ate).getTime() > Date.now()) ||
                            item.estado === 'reativado',
                          )

                          return (
                            <div
                              key={item.id}
                              className={`p-3 transition-colors flex items-center justify-between gap-3 text-left group ${
                                isItemStandby
                                  ? 'bg-amber-50/40 border-l-2 border-amber-400'
                                  : 'hover:bg-blue-50/60'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px] font-bold text-[#253575] bg-[#253575]/10 border-[#253575]/20 px-1.5 py-0"
                                  >
                                    {item.codigo}
                                  </Badge>
                                  <span className="font-bold text-xs text-slate-900 truncate">
                                    {item.nome}
                                  </span>
                                  {item.pedido_em_aberto ? (
                                    <Badge className="bg-amber-500 text-white border-none text-[10px] font-bold shadow-xs">
                                      ⏳ Aguardando Faturamento
                                    </Badge>
                                  ) : isItemStandby ? (
                                    <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-medium">
                                      Em standby — bloqueado
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                  <span>
                                    <strong>Região:</strong> {item.regiao}
                                  </span>
                                  <span>•</span>
                                  <span
                                    className={
                                      item.faixa === '90_plus'
                                        ? 'text-rose-600 font-semibold'
                                        : 'text-amber-700 font-semibold'
                                    }
                                  >
                                    {item.dias_sem_faturar
                                      ? `${item.dias_sem_faturar} dias sem faturar`
                                      : 'Inativo'}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    <strong>Último contato/compra:</strong> {item.ultimo_contato}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {user?.role === 'admin' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setClienteParaDestravar({
                                        id: item.id,
                                        nome: item.nome,
                                        codigo: item.codigo,
                                        standbyAte: item.standby_ate,
                                      })
                                      setShowConfirmDestravarStandby(true)
                                    }}
                                    className="text-amber-700 border-amber-300 hover:bg-amber-50 text-[11px] h-8 px-2.5 font-medium"
                                    title="Destravar cliente em standby (admin)"
                                  >
                                    <LockOpen className="h-3.5 w-3.5 mr-1 text-amber-600" />
                                    Destravar
                                  </Button>
                                )}
                                {item.pedido_em_aberto ? (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      navigate('/meu-painel')
                                    }}
                                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold h-8 px-3 shadow-xs"
                                    title="Ver e complementar faturamento no Meu Painel"
                                  >
                                    Complementar Faturamento
                                  </Button>
                                ) : isItemStandby && user?.role !== 'admin' ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[11px] h-8 px-2.5 font-medium text-amber-800 bg-amber-50 border-amber-200"
                                    title="Cliente em período de standby de 60 dias"
                                  >
                                    Bloqueado
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleSelecionarClienteBusca(item)}
                                    disabled={selecionandoClienteBusca === item.id}
                                    className="bg-[#253575] hover:bg-[#1d2b5e] text-white text-xs font-semibold h-8 px-3 shadow-xs"
                                  >
                                    {selecionandoClienteBusca === item.id ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                        Abrindo...
                                      </>
                                    ) : (
                                      <>
                                        <PhoneCall className="h-3.5 w-3.5 mr-1" />
                                        Atender
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
                      <span>
                        💡 Encontrou um cliente que já atende semanalmente? Abra-o e feche com{' '}
                        <strong>"Cliente Ativo — Fora da Base"</strong>.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão Novo Atendimento (Puxar próximo da fila) */}
              <Button
                size="sm"
                onClick={handlePuxarNovoAtendimento}
                disabled={reservandoNovo}
                className="bg-[#F18800] hover:bg-[#d97b00] text-white font-semibold text-xs h-9 px-4 shadow-sm shadow-[#F18800]/25 shrink-0"
              >
                <PhoneCall className={`h-4 w-4 mr-1.5 ${reservandoNovo ? 'animate-bounce' : ''}`} />
                {reservandoNovo ? 'Reservando...' : 'Próximo da Fila'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AlertDialog de Destrave de Standby quando nenhum cliente estiver carregado na ficha (Exclusivo Admin) */}
      {!cliente && (
        <AlertDialog
          open={showConfirmDestravarStandby}
          onOpenChange={setShowConfirmDestravarStandby}
        >
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <div className="flex items-center space-x-2 text-amber-600">
                <LockOpen className="h-5 w-5" />
                <AlertDialogTitle>Destravar Cliente em Standby?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-xs text-slate-600 space-y-2 pt-2">
                <p>
                  O cliente <strong className="text-slate-900">{clienteParaDestravar?.nome}</strong>{' '}
                  (<span className="font-mono">{clienteParaDestravar?.codigo}</span>) está sob o
                  período de blindagem de 60 dias fora da fila.
                </p>
                <p className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-md">
                  Como <strong>Administrador</strong>, você pode zerar essa restrição imediatamente.
                  O cliente voltará a ficar liberado para atendimento normal e reaparecerá na
                  esteira da carteira do vendedor original.
                </p>
                <p className="text-[11px] text-slate-400">
                  Esta ação será registrada nos registros de auditoria do sistema com o seu usuário.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={destravandoStandby} className="text-xs">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmDestravarStandby()
                }}
                disabled={destravandoStandby}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
              >
                {destravandoStandby ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Destravando...
                  </>
                ) : (
                  <>
                    <LockOpen className="h-3.5 w-3.5 mr-1.5" />
                    Confirmar Destrave
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Se não houver cliente selecionado */}
      {!cliente ? (
        <Card className="border-dashed border-2 border-slate-200 text-center p-12 bg-slate-50/50">
          <CardContent className="space-y-4 flex flex-col items-center justify-center p-0">
            <div className="h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
              <PhoneCall className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Pronto para Iniciar Contatos</h3>

            {avisoSegmentoZerado ? (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-4 max-w-lg text-left shadow-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Nenhum cliente disponível no segmento selecionado</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Sua carteira possui{' '}
                  <strong>{avisoSegmentoZerado.totalCarteiraSemFiltro} clientes elegíveis</strong>{' '}
                  disponíveis, mas nenhum deles pertence ao segmento{' '}
                  <em>"{avisoSegmentoZerado.segmento}"</em>.
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFiltroSegmento('todos')
                      setAvisoSegmentoZerado(null)
                    }}
                    className="bg-white hover:bg-amber-100 text-amber-950 border-amber-300 font-semibold text-xs h-8 px-3"
                  >
                    Selecionar "Todos os Segmentos" ({avisoSegmentoZerado.totalCarteiraSemFiltro}{' '}
                    clientes)
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 max-w-md">
                {user?.regioes?.includes('REPESCAGEM')
                  ? 'Operador da fila transversal Repescagem: o sistema buscará clientes com 90+ dias sem faturar de qualquer região, exceto os contatados pelo vendedor original da rota. Ou busque um cliente pelo nome acima.'
                  : 'Puxe o próximo cliente da sua fila pelo botão laranja ou use a barra de busca acima para localizar um cliente específico da sua carteira (ex.: clientes que você já atende semanalmente) para abrir a ficha e eliminá-los da base via "Cliente Ativo — Fora da Base".'}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <Button
                onClick={handlePuxarNovoAtendimento}
                disabled={reservandoNovo}
                className="bg-[#F18800] hover:bg-[#d97b00] text-white text-xs font-semibold shadow-sm shadow-[#F18800]/25"
              >
                <PhoneCall className="h-3.5 w-3.5 mr-1.5" />
                {user?.regioes?.includes('REPESCAGEM')
                  ? 'Puxar Próximo Repescagem (90+ dias)'
                  : 'Puxar Próximo da Minha Rota'}
              </Button>
              {avisoSegmentoZerado && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFiltroSegmento('todos')
                    setAvisoSegmentoZerado(null)
                  }}
                  className="text-xs border-slate-300"
                >
                  Limpar filtro de segmento
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Alerta de Modo Edição de Atendimento Fechado Ativo */}
          {modoEdicaoAdmin && (
            <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-400/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500 text-[#142758] rounded-lg">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                    <span>Modo de Edição de Atendimento Concluído Ativo</span>
                    <Badge className="bg-amber-600 text-white text-[10px]">Exclusivo Admin</Badge>
                  </h4>
                  <p className="text-xs text-amber-900/80">
                    Você está editando a ficha e as respostas de um cliente com atendimento já
                    fechado. O status de standby/fora da base <strong>NÃO</strong> será alterado.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModoEdicaoAdmin(false)}
                  className="text-xs border-amber-300 text-amber-950 hover:bg-amber-100"
                >
                  Cancelar Edição
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowModalMotivoEdicao(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Salvar Alterações
                </Button>
              </div>
            </div>
          )}

          {/* Ficha Completa do Cliente Pré-Preenchida + Gatilhos de Fechamento (Pedido 1b e 3c) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs font-bold text-[#253575] bg-[#253575]/10 border-[#253575]/20"
                  >
                    {cliente.codigo}
                  </Badge>
                  <Badge className="bg-purple-600 text-white text-[10px]">
                    <Lock className="h-3 w-3 mr-1" />
                    Lock Atômico Ativo
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      cliente.faixa === '90_plus'
                        ? 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'
                        : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                    }
                  >
                    {cliente.dias_sem_faturar
                      ? `${cliente.dias_sem_faturar} dias sem faturar`
                      : 'Inativo'}
                  </Badge>
                  {cliente.standby_ate && new Date(cliente.standby_ate).getTime() > Date.now() && (
                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-mono">
                      Em Standby até {new Date(cliente.standby_ate).toLocaleDateString('pt-BR')}
                    </Badge>
                  )}
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{cliente.nome}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    <strong>Região:</strong> {cliente.regiao}
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Vendedor Carteira:</strong> {cliente.vendedor || 'Não informado'}
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Segmento:</strong> {cliente.segmento || 'Não informado'}
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Score: {cliente.score} pts</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Se o cliente estiver com atendimento fechado e o usuário for Admin: Botão de Edição de Atendimento Fechado */}
                {user?.role === 'admin' &&
                  cliente.estado !== 'em_atendimento' &&
                  cliente.estado !== 'na_base' &&
                  cliente.estado !== 'reservado' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (modoEdicaoAdmin) {
                          // Se já estiver em modo edição, aciona o modal para salvar
                          setShowModalMotivoEdicao(true)
                        } else {
                          setShowConfirmEditarFechado(true)
                        }
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-[#142758] font-bold text-xs h-9 px-3.5 shadow-sm border border-amber-400"
                      title="Editar atendimento concluído (exclusivo admin)"
                    >
                      <Pencil className="h-4 w-4 mr-1.5" />
                      {modoEdicaoAdmin
                        ? 'Salvar Edição do Atendimento'
                        : 'Editar atendimento fechado'}
                    </Button>
                  )}

                {/* Se o cliente estiver em standby ativo e o usuário logado for Admin: Botão de Destrave Direto */}
                {user?.role === 'admin' &&
                  cliente.standby_ate &&
                  new Date(cliente.standby_ate).getTime() > Date.now() && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setClienteParaDestravar({
                          id: cliente.id,
                          nome: cliente.nome,
                          codigo: cliente.codigo,
                          standbyAte: cliente.standby_ate,
                        })
                        setShowConfirmDestravarStandby(true)
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-3.5 shadow-sm"
                      title="Destravar cliente em standby (exclusivo admin)"
                    >
                      <LockOpen className="h-4 w-4 mr-1.5" />
                      Destravar cliente
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenTransferModal}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold text-xs h-9 px-3.5 shadow-xs"
                  title="Atribuir este cliente a um colega da mesma região"
                >
                  <Users className="h-4 w-4 mr-1.5 text-indigo-600" />
                  Atribuir cliente para...
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (modoEdicaoAdmin) {
                      setShowModalMotivoEdicao(true)
                    } else {
                      setShowQuestionarioModal(true)
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {modoEdicaoAdmin ? 'Salvar Edição' : 'Confirmar Atendimento'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReleaseLock}
                  className="h-9 text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 border-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Abandonar / Devolver
                </Button>
              </div>
            </div>

            {/* Ações de Contato: Telefone, WhatsApp, Email */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {cleanPhone && (
                <>
                  <a href={`tel:${cleanPhone}`} onClick={() => handleRegisterContact('ligacao')}>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-semibold shadow-xs"
                    >
                      <Phone className="h-3.5 w-3.5 mr-1.5" />
                      Ligar ({cliente.telefone || cliente.whatsapp})
                    </Button>
                  </a>

                  <a
                    href={`https://wa.me/55${cleanPhone}?text=Ol%C3%A1%2C%20falo%20com%20o%20respons%C3%A1vel%20da%20${encodeURIComponent(
                      cliente.nome,
                    )}%3F`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleRegisterContact('whatsapp')}
                  >
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs font-semibold shadow-xs"
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Conversar no WhatsApp
                    </Button>
                  </a>
                </>
              )}

              {cliente.email && (
                <a href={`mailto:${cliente.email}`} onClick={() => handleRegisterContact('email')}>
                  <Button variant="outline" size="sm" className="h-8 text-xs text-slate-700">
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Enviar E-mail ({cliente.email})
                  </Button>
                </a>
              )}
            </div>

            {/* CARD DE GATILHOS DE FECHAMENTO — DADOS CRUZADOS COM MARGEM E GESTÃO DA PRODUÇÃO (Pedido 1b) */}
            <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Gatilhos de Fechamento (Cruzamento Margem & Gestão da Produção)
                </h4>
                <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px]">
                  Inteligência de Abordagem
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                {/* Último Faturamento */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Último Faturamento</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {cliente.ultimo_faturamento_data
                      ? new Date(cliente.ultimo_faturamento_data).toLocaleDateString('pt-BR')
                      : cliente.ultima_compra
                        ? new Date(cliente.ultima_compra).toLocaleDateString('pt-BR')
                        : '—'}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {cliente.dias_sem_faturar ? `${cliente.dias_sem_faturar} dias atrás` : ''}
                  </span>
                </div>

                {/* Faturamento 12M R$ */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Fat 12M R$</span>
                  <span className="font-bold text-slate-800 text-xs font-mono">
                    R${' '}
                    {(
                      cliente.fat_12m_reais ||
                      cliente.valor_historico ||
                      cliente.valor_ultima_compra ||
                      0
                    ).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] text-slate-400 block">volume anual</span>
                </div>

                {/* Tonelagem / Peso NF */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Peso NF / Tonelagem</span>
                  <span className="font-bold text-slate-800 text-xs font-mono">
                    {(cliente.peso_nf_tonelagem || cliente.toneladas_historico || 0).toLocaleString(
                      'pt-BR',
                    )}{' '}
                    ton
                  </span>
                  <span className="text-[10px] text-slate-400 block">capacidade</span>
                </div>

                {/* Último Pedido */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Último Pedido</span>
                  <span className="font-bold text-indigo-700 text-xs font-mono">
                    {cliente.ultimo_pedido_numero || cliente.pedido_reativacao || '—'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {cliente.ultimo_pedido_data
                      ? new Date(cliente.ultimo_pedido_data).toLocaleDateString('pt-BR')
                      : 'histórico ERP'}
                  </span>
                </div>

                {/* Margem Média % */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Margem Média</span>
                  <span className="font-bold text-emerald-600 text-xs font-mono">
                    {cliente.margem_media_perc !== undefined &&
                    cliente.margem_media_perc !== null &&
                    cliente.margem_media_perc > 0
                      ? `${cliente.margem_media_perc}%`
                      : 'Tabela Padrão'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">rentabilidade</span>
                </div>

                {/* Frequência & Canal */}
                <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">Canal & Freq. 12M</span>
                  <span className="font-bold text-slate-800 text-xs uppercase">
                    {cliente.canal || 'VAREJO'}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {cliente.frequencia_compras_12m || cliente.compras_count || 1} pedidos/ano
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulário de Qualificação de 17 Perguntas e Desfecho */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span>Formulário de Qualificação e Reativação</span>
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Questionário padronizado com regras condicionais e desfecho unificado (dados
                        cadastrais pré-preenchidos). Clique em{' '}
                        <strong>Confirmar Atendimento</strong> no topo para expandir ou responda
                        diretamente abaixo.
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-blue-600">
                        Passo {Math.round((Math.max(0, currentStep - 2) / 14) * 100)}% (Q
                        {currentStep})
                      </span>
                      <Progress
                        value={(Math.max(0, currentStep - 2) / 14) * 100}
                        className="w-24 h-1.5 mt-1"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Renderização da pergunta atual baseada no currentStep (Q1, Q2 e Q4 pré-preenchidas e omitidas do fluxo visível) */}
                  {currentStep === 3 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs text-blue-600">
                          Q3 — Fez orçamento?
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          {answers.q3 === 'Sim' ? 'Habilita Valor (Q15) e Peso (Q16)' : 'Sim / Não'}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800">Fez orçamento?</h3>
                      <Select value={String(answers.q3 || '')} onValueChange={handleQ3Change}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione Sim ou Não..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_Q3_ORCAMENTO.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-slate-500">
                        {answers.q3 === 'Sim'
                          ? 'Ao responder "Sim", será obrigatório informar o Valor Potencial (Q15) e Volume em Toneladas (Q16).'
                          : answers.q3 === 'Não'
                            ? 'Ao responder "Não", as perguntas de valor e peso ficam desabilitadas/ocultas.'
                            : 'Escolha Sim para abrir os campos de valor e peso, ou Não para pular.'}
                      </p>
                    </div>
                  )}

                  {currentStep === 5 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q5 — Motivo da Inatividade
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Qual foi o principal fator para a interrupção das compras?
                      </h3>
                      <Select
                        value={String(answers.q5 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q5: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o motivo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Preço ou Condições de Pagamento">
                            Preço ou Condições de Pagamento
                          </SelectItem>
                          <SelectItem value="Atrasos recorrentes no frete">
                            Atrasos recorrentes no frete
                          </SelectItem>
                          <SelectItem value="Problemas de qualidade no material">
                            Problemas de qualidade no material
                          </SelectItem>
                          <SelectItem value="Mudança de fornecedor por relacionamento">
                            Mudança de fornecedor por relacionamento
                          </SelectItem>
                          <SelectItem value="Queda de produção interna">
                            Queda de produção interna
                          </SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {answers.q5 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva o motivo da inatividade..."
                            value={String(answers.q5_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q5_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q5_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 6 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q6 — Sensibilidade a Preço
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Qual o grau de sensibilidade a preço e margem do cliente?
                      </h3>
                      <Select
                        value={String(answers.q6 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q6: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a sensibilidade..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Muito alta (decide por centavos no quilo)">
                            Muito alta (decide por centavos no quilo)
                          </SelectItem>
                          <SelectItem value="Média (avalia custo-benefício e prazo de entrega)">
                            Média (avalia custo-benefício e prazo de entrega)
                          </SelectItem>
                          <SelectItem value="Baixa (prioriza pontualidade e especificação técnica)">
                            Baixa (prioriza pontualidade e especificação técnica)
                          </SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {answers.q6 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva a sensibilidade a preço do cliente..."
                            value={String(answers.q6_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q6_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q6_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 7 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q7 — Concorrência
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Está comprando de qual concorrente ou canal alternativo atualmente?
                      </h3>
                      <Select
                        value={String(answers.q7 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q7: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o concorrente ou canal..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_Q7_CONCORRENCIA.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {answers.q7 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva o concorrente ou canal alternativo..."
                            value={String(answers.q7_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q7_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q7_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q8, Q9 e Q10 com Lógica Condicional: Se Q9 = "Nenhum erro ocorrido", Q8 e Q10 se pulam/preenchem sozinhas */}
                  {currentStep === 8 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs text-blue-600">
                          Q8 — Detalhamento da Ocorrência
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          Pula se Q9 = 'Nenhum erro ocorrido'
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800">
                        Houve falha operacional, lote defeituoso ou divergência em faturamentos
                        passados?
                      </h3>
                      <Select
                        value={String(answers.q8 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q8: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a ocorrência reportada..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_Q8_OCORRENCIA.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {answers.q8 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva o problema ou ocorrência..."
                            value={String(answers.q8_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q8_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q8_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 9 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q9 — Tipo de Erro Ocorrido (Gatilho Condicional)
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Classifique a ocorrência principal reportada:
                      </h3>
                      <Select value={String(answers.q9 || '')} onValueChange={handleQ9Change}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Nenhum erro ocorrido">
                            Nenhum erro ocorrido (preenche Q8 e Q10 automaticamente)
                          </SelectItem>
                          <SelectItem value="Atraso crítico na entrega">
                            Atraso crítico na entrega
                          </SelectItem>
                          <SelectItem value="Especificação/qualidade divergente">
                            Especificação/qualidade divergente
                          </SelectItem>
                          <SelectItem value="Erro em nota fiscal / boleto">
                            Erro em nota fiscal / boleto
                          </SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {answers.q9 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva o tipo de problema operacional ocorrido..."
                            value={String(answers.q9_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q9_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q9_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 10 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs text-blue-600">
                          Q10 — Ação Corretiva
                        </Badge>
                        <span className="text-[11px] text-slate-400">
                          Pula se Q9 = 'Nenhum erro ocorrido'
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800">
                        Qual ação reparatória é necessária para restabelecer a confiança comercial?
                      </h3>
                      <Select
                        value={String(answers.q10 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q10: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a ação reparatória..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_Q10_ACAO_CORRETIVA.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {answers.q10 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Ex: Bonificação em próximo lote, visita técnica, troca de prazo..."
                            value={String(answers.q10_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q10_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q10_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q11 = Anexos opcionais (só se houver reclamação), até 5 arquivos × 10 MB */}
                  {currentStep === 11 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q11 — Anexos Comprobatórios (Opcional)
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Anexos e comprovantes de reclamação técnica ou comercial
                      </h3>
                      <p className="text-xs text-slate-500">
                        Envie até 5 arquivos de até 10 MB cada (laudos, fotos de material ou notas).
                      </p>
                      <Input
                        type="file"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setAnexosFiles(Array.from(e.target.files).slice(0, 5))
                          }
                        }}
                      />
                      {anexosFiles.length > 0 && (
                        <div className="text-xs text-slate-600">
                          {anexosFiles.length} arquivo(s) selecionado(s):{' '}
                          {anexosFiles.map((f) => f.name).join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 12 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q12 — Disposição para Retorno
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        O cliente aceita receber uma contraproposta ou cotação especial de
                        reativação?
                      </h3>
                      <Select
                        value={String(answers.q12 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q12: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sim, enviar cotação de imediato">
                            Sim, enviar cotação de imediato
                          </SelectItem>
                          <SelectItem value="Sim, reagendar para início do próximo mês">
                            Sim, reagendar para início do próximo mês
                          </SelectItem>
                          <SelectItem value="Em processo de reavaliação de compras">
                            Em processo de reavaliação de compras
                          </SelectItem>
                          <SelectItem value="Recusou formalmente qualquer negociação">
                            Recusou formalmente qualquer negociação
                          </SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {answers.q12 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva a disposição de retorno do cliente..."
                            value={String(answers.q12_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q12_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q12_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentStep === 13 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q13 — Canal Preferencial de Contato
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Por qual meio o responsável prefere trocar pedidos e mensagens?
                      </h3>
                      <Select
                        value={String(answers.q13 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q13: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o canal..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WhatsApp">WhatsApp Direto</SelectItem>
                          <SelectItem value="E-mail">E-mail Corporativo</SelectItem>
                          <SelectItem value="Telefone / Ligação">Telefone / Ligação</SelectItem>
                          <SelectItem value="Visita de Representante">
                            Visita de Representante
                          </SelectItem>
                          <SelectItem value="Outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                      {answers.q13 === 'Outros' && (
                        <div className="mt-2 space-y-1.5 p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                          <Label className="text-xs font-semibold text-amber-950">
                            Especifique os detalhes para &apos;Outros&apos;: *
                          </Label>
                          <Input
                            placeholder="Descreva o canal preferencial..."
                            value={String(answers.q13_outros || '')}
                            onChange={(e) => setAnswers({ ...answers, q13_outros: e.target.value })}
                            className="bg-white text-xs"
                          />
                          {!answers.q13_outros && (
                            <p className="text-[11px] text-amber-800 font-medium">
                              ⚠️ Por favor, preencha o detalhamento do campo Outros.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q14 e Q17 foram UNIFICADOS em um único campo de desfecho conforme pedido expresso do usuário */}
                  {currentStep === 14 && (
                    <div className="space-y-4">
                      <Badge className="bg-blue-600 text-white text-xs">
                        Q14 & Q17 — Desfecho Unificado do Atendimento (Máquina de Estados)
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Selecione o desfecho formal deste contato:
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[
                          {
                            id: 'reativado',
                            label: 'Reativado (Pedido Fechado)',
                            color: 'border-emerald-500 bg-emerald-50/70 text-emerald-900',
                          },
                          {
                            id: 'reagendado',
                            label: 'Reagendado (Definir Data)',
                            color: 'border-amber-500 bg-amber-50/70 text-amber-900',
                          },
                          {
                            id: 'contatado',
                            label: 'Contatado (Ciclo 30 dias)',
                            color: 'border-cyan-500 bg-cyan-50/70 text-cyan-900',
                          },
                          {
                            id: 'sem_contato',
                            label: 'Sem Contato (Não Atendeu / Caixa)',
                            color: 'border-slate-400 bg-slate-50 text-slate-800',
                          },
                          {
                            id: 'compra_terceiros',
                            label: 'Comprando de Terceiros / Revenda',
                            color: 'border-rose-400 bg-rose-50 text-rose-900',
                          },
                          {
                            id: 'nao_quer_negociar',
                            label: 'Não Quer Negociar (Quarentena 90d)',
                            color: 'border-slate-400 bg-slate-100 text-slate-900',
                          },
                          {
                            id: 'restricao_financeira',
                            label: 'Restrição Financeira (Crédito Bloqueado / Sem Limite)',
                            color: 'border-amber-500 bg-amber-50 text-amber-950',
                          },
                          {
                            id: 'duplicado',
                            label: 'Registro Duplicado no ERP',
                            color: 'border-purple-400 bg-purple-50 text-purple-900',
                          },
                          {
                            id: 'ativo_fora_base',
                            label: 'Cliente Ativo — Fora da Base de Inativos',
                            color:
                              'border-emerald-600 bg-emerald-100/90 text-emerald-950 font-bold',
                          },
                        ].map((btn) => (
                          <div
                            key={btn.id}
                            onClick={() => setDesfechoFinal(btn.id as ClienteEstado)}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${btn.color} ${
                              desfechoFinal === btn.id
                                ? 'ring-2 ring-blue-600 shadow-md font-bold'
                                : 'opacity-85 hover:opacity-100'
                            }`}
                          >
                            <div className="text-xs font-semibold">{btn.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Campos específicos dependendo do desfecho */}
                      {desfechoFinal === 'reativado' && (
                        <div className="p-4 bg-emerald-50/80 border-2 border-emerald-300 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span>Houve pedido fechado? *</span>
                            </Label>
                            <span className="text-[10px] text-emerald-800 font-semibold uppercase tracking-wider bg-emerald-200/60 px-2 py-0.5 rounded">
                              Obrigatório
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setHouvePedidoFechado('sim')}
                              className={`p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-center ${
                                houvePedidoFechado === 'sim'
                                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                  : 'border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100/50'
                              }`}
                            >
                              ✓ Sim, houve pedido
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHouvePedidoFechado('nao')
                                setNumeroPedido('')
                                setValorPedidoFechado('')
                                setPrevisaoFaturamento('')
                                setObservacoesPedido('')
                              }}
                              className={`p-2.5 rounded-lg border-2 text-xs font-bold transition-all text-center ${
                                houvePedidoFechado === 'nao'
                                  ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              ✕ Não houve pedido
                            </button>
                          </div>

                          {houvePedidoFechado === 'sim' && (
                            <div className="pt-2 border-t border-emerald-200 space-y-3 animate-in fade-in-50">
                              <div className="space-y-1">
                                <Label className="text-xs font-bold text-emerald-950">
                                  Número do Pedido *
                                </Label>
                                <Input
                                  placeholder="Ex: 221872 ou PED-2026-99"
                                  value={numeroPedido}
                                  onChange={(e) => setNumeroPedido(e.target.value)}
                                  className="bg-white text-xs border-emerald-300 focus-visible:ring-emerald-500"
                                />
                                <p className="text-[10px] text-emerald-700">
                                  O cliente permanecerá na base com status &quot;Aguardando
                                  Faturamento&quot; sob sua responsabilidade até a complementação da
                                  nota/fatura.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-slate-700">
                                    Valor do Pedido (R$)
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Ex: 3500.00"
                                    value={valorPedidoFechado}
                                    onChange={(e) => setValorPedidoFechado(e.target.value)}
                                    className="bg-white text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-slate-700">
                                    Previsão de Faturamento (Opcional)
                                  </Label>
                                  <Input
                                    type="date"
                                    value={previsaoFaturamento}
                                    onChange={(e) => setPrevisaoFaturamento(e.target.value)}
                                    className="bg-white text-xs"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">
                                  Observações do Pedido (Opcional)
                                </Label>
                                <Textarea
                                  placeholder="Condições de pagamento combinadas, prazo de entrega, itens principais..."
                                  value={observacoesPedido}
                                  onChange={(e) => setObservacoesPedido(e.target.value)}
                                  rows={2}
                                  className="text-xs bg-white"
                                />
                              </div>
                            </div>
                          )}

                          {houvePedidoFechado === 'nao' && (
                            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                              ⚠️ Você marcou que <strong>não houve pedido fechado</strong>. A
                              reativação sem pedido exige confirmação e não criará pendência de
                              faturamento.
                            </div>
                          )}
                        </div>
                      )}

                      {desfechoFinal === 'reagendado' && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-amber-900">
                              Data e Horário de Retorno Prioritário (Expediente: 07h às 17h)
                            </Label>
                            <span className="text-[10px] text-amber-700 font-medium">
                              Seg a Sex • Fuso Brasília
                            </span>
                          </div>
                          <Input
                            type="datetime-local"
                            value={reagendarData}
                            onChange={(e) => {
                              const val = e.target.value
                              setReagendarData(val)
                              if (val) {
                                const parsed = new Date(val)
                                const ajuste = ajustarParaExpediente(parsed)
                                if (ajuste.foiAjustado) {
                                  setAvisoAjusteExpediente(
                                    `Atenção: ${ajuste.motivoAjuste} Ao confirmar, o agendamento será registrado para ${formatarDataHoraBrasilia(
                                      ajuste.dataAjustada,
                                    )}.`,
                                  )
                                } else {
                                  setAvisoAjusteExpediente(null)
                                }
                              } else {
                                setAvisoAjusteExpediente(null)
                              }
                            }}
                            className="bg-white text-xs"
                          />
                          {avisoAjusteExpediente && (
                            <div className="p-2 rounded bg-amber-100 border border-amber-300 text-[11px] text-amber-900">
                              {avisoAjusteExpediente}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const sugestao = getSugestaoReagendamentoHtml()
                                setReagendarData(sugestao)
                                setAvisoAjusteExpediente(null)
                              }}
                              className="text-[11px] h-7 bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                            >
                              Sugerir próximo horário útil (07h–17h)
                            </Button>
                          </div>
                        </div>
                      )}

                      {desfechoFinal === 'duplicado' && (
                        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                          <Label className="text-xs font-bold text-purple-900">
                            Código do Cliente Principal (Para unificação)
                          </Label>
                          <Input
                            placeholder="Ex: C001021"
                            value={duplicadoCodigo}
                            onChange={(e) => setDuplicadoCodigo(e.target.value)}
                            className="bg-white text-xs"
                          />
                        </div>
                      )}

                      {/* Campos específicos para Cliente Ativo — Fora da Base de Inativos */}
                      {desfechoFinal === 'ativo_fora_base' && (
                        <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl space-y-3">
                          <div className="flex items-center space-x-2 text-emerald-900">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <Label className="text-xs font-bold">
                              Remoção Definitiva da Base de Inativos (Cliente Ativo)
                            </Label>
                          </div>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">
                            Este cliente sairá da base de inativos permanentemente e NÃO voltará
                            para a fila (nem na rotina da meia-noite, nem nas importações de
                            planilhas, nem na Repescagem).
                          </p>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">
                              Motivo da Remoção (Obrigatório) *
                            </Label>
                            <Select
                              value={motivoAtivoForaBase}
                              onValueChange={(val) => setMotivoAtivoForaBase(val)}
                            >
                              <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="compra por CPF de terceiro" className="text-xs">
                                  Compra por CPF de terceiro
                                </SelectItem>
                                <SelectItem value="compra por CNPJ de terceiro" className="text-xs">
                                  Compra por CNPJ de terceiro / coligada
                                </SelectItem>
                                <SelectItem
                                  value="acompanhamento periódico do vendedor"
                                  className="text-xs"
                                >
                                  Acompanhamento periódico do vendedor (em negociação contínua)
                                </SelectItem>
                                <SelectItem
                                  value="cliente ativo faturando por outro cadastro"
                                  className="text-xs"
                                >
                                  Cliente ativo faturando por outro cadastro/filial
                                </SelectItem>
                                <SelectItem value="cliente_final" className="text-xs">
                                  Cliente final — Fez uma compra pra uso pessoal e não comprou mais
                                </SelectItem>
                                <SelectItem
                                  value="outro motivo de cliente ativo"
                                  className="text-xs"
                                >
                                  Outros (especificar abaixo)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">
                              {motivoAtivoForaBase === 'outro motivo de cliente ativo' ? (
                                <span className="text-amber-950 font-bold">
                                  Especifique os detalhes para &apos;Outros&apos;: *
                                </span>
                              ) : (
                                'Observações Complementares / Detalhes (Livre)'
                              )}
                            </Label>
                            <Textarea
                              placeholder="Descreva detalhes: qual terceiro compra, qual vendedor acompanha, etc..."
                              value={obsAtivoForaBase}
                              onChange={(e) => setObsAtivoForaBase(e.target.value)}
                              rows={2}
                              className="text-xs bg-white"
                            />
                            {motivoAtivoForaBase === 'outro motivo de cliente ativo' &&
                              !obsAtivoForaBase.trim() && (
                                <p className="text-[11px] text-amber-800 font-medium">
                                  ⚠️ Por favor, preencha o detalhamento do campo Outros.
                                </p>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q15 = Numérico (R$) */}
                  {currentStep === 15 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs text-blue-600">
                          Q15 — Campo Numérico: Valor Potencial (R$)
                        </Badge>
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                          Obrigatório para métricas
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800">
                        Valor monetário estimado da recuperação / cotação
                      </h3>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={answers.q15 !== undefined ? String(answers.q15) : ''}
                          onChange={(e) => {
                            setAnswers({ ...answers, q15: e.target.value })
                            if (avisoValidacaoMetrica?.campo === 'q15') {
                              setAvisoValidacaoMetrica(null)
                            }
                          }}
                          className={`pl-9 ${avisoValidacaoMetrica?.campo === 'q15' ? 'border-amber-500 ring-2 ring-amber-300' : ''}`}
                        />
                      </div>
                      {avisoValidacaoMetrica?.campo === 'q15' && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-900">
                            <strong className="font-semibold block mb-0.5">Aviso importante</strong>
                            {avisoValidacaoMetrica.mensagem}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q16 = Numérico (Toneladas) */}
                  {currentStep === 16 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs text-blue-600">
                          Q16 — Campo Numérico: Volume em Toneladas
                        </Badge>
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                          Obrigatório para métricas
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-800">
                        Volume físico estimado de entrega (toneladas)
                      </h3>
                      <div className="relative">
                        <Package className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={answers.q16 !== undefined ? String(answers.q16) : ''}
                          onChange={(e) => {
                            setAnswers({ ...answers, q16: e.target.value })
                            if (avisoValidacaoMetrica?.campo === 'q16') {
                              setAvisoValidacaoMetrica(null)
                            }
                          }}
                          className={`pl-9 ${avisoValidacaoMetrica?.campo === 'q16' ? 'border-amber-500 ring-2 ring-amber-300' : ''}`}
                        />
                      </div>
                      {avisoValidacaoMetrica?.campo === 'q16' && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-900">
                            <strong className="font-semibold block mb-0.5">Aviso importante</strong>
                            {avisoValidacaoMetrica.mensagem}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q17 = Observações Gerais e Conclusão */}
                  {currentStep === 17 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q17 — Observações Operacionais e Resumo para o Kommo
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Notas finais que serão gravadas na timeline e sincronizadas com a API do
                        Kommo:
                      </h3>
                      <Textarea
                        placeholder="Detalhes adicionais da conversa com o cliente..."
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={4}
                      />
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between border-t border-slate-100 p-4 bg-slate-50/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const fezOrcamento = answers.q3 === 'Sim'
                      setCurrentStep((prev) => {
                        if (prev <= 3) return 3
                        if (prev === 5) return 3 // pula Q4
                        if (prev === 17 && !fezOrcamento) return 14 // se não fez orçamento, pula Q16 e Q15 voltando
                        return prev - 1
                      })
                    }}
                    disabled={currentStep <= 3}
                    className="text-xs"
                  >
                    Anterior
                  </Button>

                  <div className="flex items-center space-x-2">
                    {currentStep < 17 ? (
                      <Popover
                        open={
                          (currentStep === 15 && avisoValidacaoMetrica?.campo === 'q15') ||
                          (currentStep === 16 && avisoValidacaoMetrica?.campo === 'q16')
                        }
                        onOpenChange={(open) => {
                          if (!open) setAvisoValidacaoMetrica(null)
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => {
                              const fezOrcamento = answers.q3 === 'Sim'

                              // Validação de avanço para Q15 e Q16 (somente quando Q3 = Sim)
                              if (
                                fezOrcamento &&
                                desfechoFinal !== 'sem_contato' &&
                                desfechoFinal !== 'duplicado' &&
                                desfechoFinal !== 'restricao_financeira'
                              ) {
                                if (currentStep === 15) {
                                  const rawVal =
                                    answers.q15 !== undefined ? String(answers.q15).trim() : ''
                                  const num = parseFloat(
                                    rawVal.replace(/[^\d.,]/g, '').replace(',', '.'),
                                  )
                                  if (rawVal === '' || isNaN(num) || num < 0) {
                                    setAvisoValidacaoMetrica({
                                      campo: 'q15',
                                      mensagem:
                                        'O preenchimento do Valor Potencial (Q15) é imprescindível para termos um bom retorno das métricas.',
                                    })
                                    return
                                  }
                                }
                                if (currentStep === 16) {
                                  const rawPeso =
                                    answers.q16 !== undefined ? String(answers.q16).trim() : ''
                                  const num = parseFloat(
                                    rawPeso.replace(/[^\d.,]/g, '').replace(',', '.'),
                                  )
                                  if (rawPeso === '' || isNaN(num) || num < 0) {
                                    setAvisoValidacaoMetrica({
                                      campo: 'q16',
                                      mensagem:
                                        'O preenchimento do Volume em Toneladas (Q16) é imprescindível para termos um bom retorno das métricas.',
                                    })
                                    return
                                  }
                                }
                              }

                              setAvisoValidacaoMetrica(null)
                              setCurrentStep((prev) => {
                                if (prev === 3) return 5 // pula Q4
                                if (prev === 14) {
                                  // Se fez orçamento, vai para Q15; senão, pula direto para Q17
                                  return fezOrcamento ? 15 : 17
                                }
                                return Math.min(17, prev + 1)
                              })
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                          >
                            Próxima Pergunta
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          align="end"
                          className="w-80 p-3 bg-amber-50 border-amber-300 text-amber-950 shadow-lg text-xs"
                        >
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="font-bold text-amber-900">Preenchimento Necessário</p>
                              <p className="text-[11px] text-amber-800">
                                {avisoValidacaoMetrica?.mensagem}
                              </p>
                              <p className="text-[10px] text-amber-700 italic pt-1">
                                Preencha o valor acima para prosseguir à próxima etapa.
                              </p>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleFinalizeAtendimento}
                        disabled={isFinalizing || !desfechoFinal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                      >
                        {isFinalizing ? 'Finalizando e Sincronizando...' : 'Concluir Atendimento'}
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            </div>

            {/* Timeline e Histórico de Interações */}
            <div className="space-y-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                    <History className="h-4 w-4 text-slate-600" />
                    <span>Linha do Tempo de Contatos</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Auditoria e histórico de tentativas anteriores
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Adicionar nota rápida */}
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Anotação rápida deste contato..."
                      value={novaNota}
                      onChange={(e) => setNovaNota(e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddNota}
                      disabled={savingNota || !novaNota.trim()}
                      className="w-full text-xs bg-slate-800 text-white h-7"
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Salvar Nota na Timeline
                    </Button>
                  </div>

                  {/* Lista cronológica */}
                  <div className="border-t border-slate-100 pt-3 space-y-3 max-h-96 overflow-y-auto pr-1">
                    {interacoes.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">
                        Nenhum histórico registrado ainda.
                      </p>
                    ) : (
                      interacoes.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-700 uppercase">
                                {item.tipo}
                              </span>
                              {item.expand?.operador?.name ? (
                                <span className="text-slate-500 font-medium">
                                  por {item.expand.operador.name}
                                </span>
                              ) : item.operador ? (
                                <span className="text-slate-400 italic">(Usuário removido)</span>
                              ) : null}
                            </div>
                            <span className="text-slate-400 font-mono">
                              {new Date(item.created).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 whitespace-pre-wrap">
                            {item.conteudo}
                          </p>
                          {item.desfecho && (
                            <div className="pt-1">
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-white border-slate-300"
                              >
                                Desfecho: {item.desfecho}
                              </Badge>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Modal de Atribuição / Transferência de Cliente entre Operadores da Mesma Região */}
          {showTransferModal && cliente && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-indigo-900 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-indigo-300" />
                    <div>
                      <h3 className="font-bold text-sm">Atribuir Cliente para Colega</h3>
                      <p className="text-[11px] text-indigo-200">
                        Região: <strong className="text-white">{cliente.regiao}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTransferModal(false)}
                    className="text-indigo-200 hover:text-white text-xs px-2 py-1 rounded bg-indigo-800"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">
                      {cliente.codigo} • {cliente.nome}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      O cliente será transferido e agendado com <strong>PRIORIDADE MÁXIMA</strong>{' '}
                      para o colega selecionado, sendo o primeiro cadastro a cair na fila dele.
                    </p>
                  </div>

                  {(!user?.regioes || user.regioes.length === 0) && user?.role !== 'admin' ? (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
                      <p className="font-bold">Sua conta não possui região/rota atribuída</p>
                      <p>
                        Para atribuir clientes a colegas de rota, é necessário ter ao menos uma
                        região vinculada ao seu usuário. Solicite ao administrador do sistema a
                        atribuição da sua região em{' '}
                        <strong>Configurações &gt; Gestão de Acessos</strong>.
                      </p>
                    </div>
                  ) : operadoresRegiao.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                      <p className="font-bold">Nenhum colega da mesma rota encontrado</p>
                      <p>
                        Não há outros operadores, líderes ou supervisores cadastrados para a região{' '}
                        <strong>{cliente.regiao || user?.regioes?.join(', ') || 'da rota'}</strong>.
                        A reatribuição só é permitida entre colegas da mesma região.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-800">
                          Atribuir cliente para colega da mesma região/rota:
                        </Label>
                        <Select
                          value={selectedDestinoOp}
                          onValueChange={(val) => setSelectedDestinoOp(val)}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white border-slate-300">
                            <SelectValue placeholder="Selecione o colega da região..." />
                          </SelectTrigger>
                          <SelectContent>
                            {operadoresRegiao.map((op) => (
                              <SelectItem key={op.id} value={op.id} className="text-xs">
                                {op.name || op.email} (
                                {op.role === 'lider'
                                  ? 'Líder'
                                  : op.role === 'supervisor'
                                    ? 'Supervisor'
                                    : 'Operador'}{' '}
                                — {op.regioes?.join(', ')})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">
                          Motivo do repasse / Observação interna:
                        </Label>
                        <Textarea
                          value={motivoTransferencia}
                          onChange={(e) => setMotivoTransferencia(e.target.value)}
                          placeholder="Ex: Cliente da carteira de especialista / colega responsável pela praça..."
                          rows={3}
                          className="text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTransferModal(false)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmTransfer}
                    disabled={
                      transferindo ||
                      operadoresRegiao.length === 0 ||
                      !selectedDestinoOp ||
                      ((!user?.regioes || user.regioes.length === 0) && user?.role !== 'admin')
                    }
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                  >
                    {transferindo ? 'Atribuindo...' : 'Confirmar Atribuição'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* AlertDialog de Destrave de Standby (Exclusivo Perfil Admin) */}
          <AlertDialog
            open={showConfirmDestravarStandby}
            onOpenChange={setShowConfirmDestravarStandby}
          >
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <div className="flex items-center space-x-2 text-amber-600">
                  <LockOpen className="h-5 w-5" />
                  <AlertDialogTitle>Destravar Cliente em Standby?</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-xs text-slate-600 space-y-2 pt-2">
                  <p>
                    O cliente{' '}
                    <strong className="text-slate-900">
                      {clienteParaDestravar?.nome || cliente?.nome}
                    </strong>{' '}
                    (
                    <span className="font-mono">
                      {clienteParaDestravar?.codigo || cliente?.codigo}
                    </span>
                    ) está sob o período de blindagem de 60 dias fora da fila.
                  </p>
                  <p className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-md">
                    Como <strong>Administrador</strong>, você pode zerar essa restrição
                    imediatamente. O cliente voltará a ficar liberado para atendimento normal e
                    reaparecerá na esteira da carteira do vendedor original.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Esta ação será registrada nos registros de auditoria do sistema com o seu
                    usuário.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={destravandoStandby} className="text-xs">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    handleConfirmDestravarStandby()
                  }}
                  disabled={destravandoStandby}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {destravandoStandby ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Destravando...
                    </>
                  ) : (
                    <>
                      <LockOpen className="h-3.5 w-3.5 mr-1.5" />
                      Confirmar Destrave
                    </>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* AlertDialog de Confirmação de Abandono / Devolução de Cliente à Fila */}
          <AlertDialog open={showConfirmAbandonar} onOpenChange={setShowConfirmAbandonar}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <div className="flex items-center space-x-2 text-rose-600">
                  <RotateCcw className="h-5 w-5" />
                  <AlertDialogTitle>Abandonar e Devolver à Fila?</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-xs text-slate-600 space-y-2 pt-2">
                  <p>
                    Tem certeza de que deseja liberar o cliente{' '}
                    <strong className="text-slate-900">{cliente?.nome}</strong> (
                    <span className="font-mono">{cliente?.codigo}</span>)?
                  </p>
                  <p className="bg-rose-50 border border-rose-200 text-rose-900 p-2.5 rounded-md">
                    O lock atômico será desfeito, o rascunho preenchido será preservado e o contato
                    ficará imediatamente disponível para a fila da equipe.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Esta ação será registrada no histórico de eventos e na linha do tempo.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    handleConfirmReleaseLock()
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Sim, Devolver à Fila
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* AlertDialog de Confirmação de Abertura de Edição de Atendimento Fechado (Exclusivo Admin) */}
          <AlertDialog open={showConfirmEditarFechado} onOpenChange={setShowConfirmEditarFechado}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <div className="flex items-center space-x-2 text-amber-600">
                  <Pencil className="h-5 w-5" />
                  <AlertDialogTitle>Editar Atendimento Fechado?</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-xs text-slate-600 space-y-2 pt-2">
                  <p>
                    Você está prestes a editar a ficha de um atendimento já concluído de{' '}
                    <strong className="text-slate-900">{cliente?.nome}</strong> (
                    <span className="font-mono">{cliente?.codigo}</span>).
                  </p>
                  <p className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-md">
                    Esta ação manterá o status de standby/fora da base e registrará a auditoria com
                    o seu usuário.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    A blindagem e os prazos originais permanecerão intactos.
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setShowConfirmEditarFechado(false)
                    setModoEdicaoAdmin(true)
                    const cliAny = cliente as unknown as Record<string, unknown>
                    const desfechoOuEstado = (cliAny?.desfecho as string) || cliente?.estado
                    if (desfechoOuEstado) {
                      setDesfechoFinal(desfechoOuEstado as ClienteEstado)
                    }
                    if (cliAny?.observacoes && !observacoes) {
                      setObservacoes(cliAny.observacoes as string)
                    }
                    toast({
                      title: 'Modo de edição habilitado',
                      description: 'Altere as respostas da ficha ou o desfecho e clique em Salvar.',
                    })
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Habilitar Edição
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Modal para Informar o Motivo Obrigatório da Edição Admin antes de Salvar */}
          {showModalMotivoEdicao && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-[#142758] text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Pencil className="h-5 w-5 text-amber-400" />
                    <div>
                      <h3 className="font-bold text-sm">Salvar Edição do Atendimento</h3>
                      <p className="text-[11px] text-slate-300">
                        Auditoria Obrigatória de Administrador
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowModalMotivoEdicao(false)}
                    disabled={salvandoEdicaoAdmin}
                    className="text-slate-300 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">
                      {cliente.codigo} • {cliente.nome}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Desfecho selecionado:{' '}
                      <strong className="text-slate-900">{desfechoFinal.toUpperCase()}</strong>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-800">
                      Motivo da edição (Obrigatório para a auditoria): *
                    </Label>
                    <Textarea
                      placeholder="Ex: Correção das respostas da qualificação a pedido do vendedor..."
                      value={motivoEdicaoAdmin}
                      onChange={(e) => setMotivoEdicaoAdmin(e.target.value)}
                      rows={3}
                      className="text-xs"
                    />
                    {!motivoEdicaoAdmin.trim() && (
                      <p className="text-[11px] text-amber-700">
                        Informe o motivo da alteração para constar na timeline e no log.
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowModalMotivoEdicao(false)}
                    disabled={salvandoEdicaoAdmin}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSalvarEdicaoAdmin}
                    disabled={salvandoEdicaoAdmin || !motivoEdicaoAdmin.trim()}
                    className="bg-[#253575] hover:bg-[#1d2b5e] text-white text-xs font-semibold"
                  >
                    {salvandoEdicaoAdmin ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Salvando auditoria...
                      </>
                    ) : (
                      'Confirmar e Gravar Edição'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal / Dialog de Confirmação do Atendimento quando o operador clica em "Confirmar Atendimento" */}
          {showQuestionarioModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-blue-400" />
                    <div>
                      <h3 className="font-bold text-sm">Formulário de Qualificação do Cliente</h3>
                      <p className="text-[11px] text-slate-300">
                        {cliente.codigo} • {cliente.nome} (Pergunta {currentStep} de 17)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowQuestionarioModal(false)}
                    className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
                  >
                    Minimizar ✕
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b">
                    <span>Progresso do Atendimento</span>
                    <span className="font-mono font-bold text-blue-600">
                      {Math.round((Math.max(0, currentStep - 2) / 14) * 100)}% (Q{currentStep})
                    </span>
                  </div>
                  <Progress
                    value={(Math.max(0, currentStep - 2) / 14) * 100}
                    className="h-2 bg-slate-100"
                  />

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600">
                      O formulário de qualificação está ativo na página logo abaixo. Você pode
                      continuar respondendo passo a passo com a pré-seleção dos dados cadastrais já
                      preenchida.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const fezOrcamento = answers.q3 === 'Sim'
                        setCurrentStep((prev) => {
                          if (prev <= 3) return 3
                          if (prev === 5) return 3
                          if (prev === 17 && !fezOrcamento) return 14
                          return prev - 1
                        })
                      }}
                      disabled={currentStep <= 3}
                      className="text-xs"
                    >
                      Pergunta Anterior
                    </Button>
                    {currentStep < 17 ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          const fezOrcamento = answers.q3 === 'Sim'
                          if (
                            fezOrcamento &&
                            desfechoFinal !== 'sem_contato' &&
                            desfechoFinal !== 'duplicado' &&
                            desfechoFinal !== 'restricao_financeira'
                          ) {
                            if (currentStep === 15) {
                              const rawVal =
                                answers.q15 !== undefined ? String(answers.q15).trim() : ''
                              const num = parseFloat(
                                rawVal.replace(/[^\d.,]/g, '').replace(',', '.'),
                              )
                              if (rawVal === '' || isNaN(num) || num < 0) {
                                toast({
                                  variant: 'destructive',
                                  title: 'Campo obrigatório',
                                  description:
                                    'O preenchimento do Valor Potencial (Q15) é imprescindível para termos um bom retorno das métricas.',
                                })
                                return
                              }
                            }
                            if (currentStep === 16) {
                              const rawPeso =
                                answers.q16 !== undefined ? String(answers.q16).trim() : ''
                              const num = parseFloat(
                                rawPeso.replace(/[^\d.,]/g, '').replace(',', '.'),
                              )
                              if (rawPeso === '' || isNaN(num) || num < 0) {
                                toast({
                                  variant: 'destructive',
                                  title: 'Campo obrigatório',
                                  description:
                                    'O preenchimento do Volume em Toneladas (Q16) é imprescindível para termos um bom retorno das métricas.',
                                })
                                return
                              }
                            }
                          }
                          setCurrentStep((prev) => {
                            if (prev === 3) return 5
                            if (prev === 14) {
                              return fezOrcamento ? 15 : 17
                            }
                            return Math.min(17, prev + 1)
                          })
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        Próxima Pergunta (
                        {currentStep === 3
                          ? 5
                          : currentStep === 14 && answers.q3 !== 'Sim'
                            ? 17
                            : currentStep + 1}
                        /17)
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setShowQuestionarioModal(false)
                          handleFinalizeAtendimento()
                        }}
                        disabled={isFinalizing || !desfechoFinal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                      >
                        {isFinalizing ? 'Finalizando...' : 'Concluir Atendimento'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-100 border-t border-slate-200 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowQuestionarioModal(false)}
                    className="text-xs text-slate-600"
                  >
                    Voltar à Ficha Completa
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
