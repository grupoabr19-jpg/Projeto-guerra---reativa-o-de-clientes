import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Phone,
  PhoneCall,
  MessageSquare,
  Mail,
  Lock,
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
  transferClienteOperador,
  fetchUsers,
} from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import type { Cliente, Interacao, ClienteEstado, User } from '@/types'
import { SEGMENTOS_OFICIAIS } from '@/lib/segmentos'
import {
  ajustarParaExpediente,
  getSugestaoReagendamentoHtml,
  formatarDataHoraBrasilia,
} from '@/lib/expediente'

export default function AtendimentoPage() {
  const { clientId } = useParams<{ clientId?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros da nova experiência do Operador
  const [filtroSegmento, setFiltroSegmento] = useState<string>('todos')
  const [filtroOrdenacao, setFiltroOrdenacao] = useState<'score' | 'antigos' | 'novos'>('score')
  const [reservandoNovo, setReservandoNovo] = useState(false)
  const [showQuestionarioModal, setShowQuestionarioModal] = useState(false)

  // Questionário de 17 Perguntas (Etapas 1..17)
  const [currentStep, setCurrentStep] = useState(1)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [anexosFiles, setAnexosFiles] = useState<File[]>([])

  // Desfecho Unificado (Q14 e Q17 foram unificados pelo usuário)
  const [desfechoFinal, setDesfechoFinal] = useState<ClienteEstado | ''>('')
  const [motivoDesfecho, setMotivoDesfecho] = useState('')
  const [motivoAtivoForaBase, setMotivoAtivoForaBase] = useState('compra por CPF de terceiro')
  const [obsAtivoForaBase, setObsAtivoForaBase] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [reagendarData, setReagendarData] = useState('')
  const [avisoAjusteExpediente, setAvisoAjusteExpediente] = useState<string | null>(null)
  const [numeroPedido, setNumeroPedido] = useState('')
  const [duplicadoCodigo, setDuplicadoCodigo] = useState('')
  const [isFinalizing, setIsFinalizing] = useState(false)

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

  const checkExistingLockOrIdle = async () => {
    setLoading(true)
    try {
      // Se o operador já possuir um cliente em atendimento ou reservado, o backend retorna com ja_reservado = true
      const res = await reserveNextQueueClient({
        segmento: filtroSegmento === 'todos' ? undefined : filtroSegmento,
        ordenacao: filtroOrdenacao,
      })
      if (res.cliente) {
        setCliente(res.cliente)
        loadCliente(res.cliente.id)
      } else {
        setCliente(null)
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
        // Distingue fila vazia de erro de forma clara e amigável
        toast({
          variant: 'default',
          title: 'Nenhum cliente elegível na sua fila',
          description:
            res.message ||
            'Não encontramos nenhum cliente elegível disponível na sua rota no momento. Tente trocar os filtros ou tente novamente mais tarde.',
        })
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

      // Se o cliente estiver com status 'na_base' ou 'reservado', mudar para 'em_atendimento'
      if (c.estado !== 'em_atendimento' && user) {
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
      alert('Selecione o operador de destino.')
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

  // Devolver cliente à fila e liberar lock
  const handleReleaseLock = async () => {
    if (!cliente) return
    const confirm = window.confirm(
      'Deseja realmente abandonar o atendimento deste cliente? O progresso será salvo como rascunho e o cliente voltará para a fila.',
    )
    if (!confirm) return

    try {
      await releaseQueueLock(cliente.id, answers)
      setCliente(null)
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
      alert('Por favor, selecione o desfecho final do atendimento.')
      return
    }

    if (desfechoFinal === 'reagendado' && !reagendarData) {
      alert('Informe a data e horário para reagendamento.')
      return
    }

    if (desfechoFinal === 'reativado' && !numeroPedido) {
      const confirmSemPedido = window.confirm(
        'Nenhum número de pedido/registro informado. Deseja continuar sem vincular pedido para reconciliação?',
      )
      if (!confirmSemPedido) return
    }

    if (desfechoFinal === 'ativo_fora_base' && !motivoAtivoForaBase.trim()) {
      alert('Informe o motivo obrigatório para a saída do cliente ativo da base.')
      return
    }

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

      await saveRespostasFormulario({
        cliente: cliente.id,
        operador: user.id,
        respostas: answers,
        desfecho: desfechoFinal,
        valor_potencial: valorPotencial,
        toneladas_potencial: toneladasPotencial,
      })

      // 2. Determinar novos campos no Cliente
      const updatePayload: Partial<Cliente> = {
        estado: desfechoFinal,
        lock_timestamp: undefined, // remove o lock
      }

      // Regras específicas da Máquina de Estados:
      if (desfechoFinal === 'reativado') {
        updatePayload.pedido_reativacao = numeroPedido
        updatePayload.pedido_confirmado = false // aguarda confirmação na próxima importação
        updatePayload.quarentena_ate = undefined
      } else if (desfechoFinal === 'reagendado') {
        const rawDate = new Date(reagendarData)
        const ajuste = ajustarParaExpediente(rawDate)
        updatePayload.reagendado_para = ajuste.dataAjustada.toISOString()
        updatePayload.reagendado_operador = user.id
      } else if (desfechoFinal === 'sem_contato') {
        const currentTentativas = (cliente.tentativas_sem_contato || 0) + 1
        updatePayload.tentativas_sem_contato = currentTentativas
        if (currentTentativas >= 3) {
          updatePayload.telefone_invalido = true
        }
      } else if (desfechoFinal === 'nao_quer_negociar') {
        // Quarentena de 90 dias configurável
        const quarentena = new Date()
        quarentena.setDate(quarentena.getDate() + 90)
        updatePayload.quarentena_ate = quarentena.toISOString()
      } else if (desfechoFinal === 'duplicado') {
        updatePayload.duplicado_de_codigo = duplicadoCodigo
      } else if (desfechoFinal === 'ativo_fora_base') {
        // Regra da Frente 2: Cliente Ativo — Fora da Base de Inativos
        // Marcação permanente no banco para nunca mais voltar para a fila de inativos
        updatePayload.ativo_fora_base = true
        updatePayload.motivo_ativo_fora_base = `${motivoAtivoForaBase}${obsAtivoForaBase ? ` — ${obsAtivoForaBase}` : ''}`
        updatePayload.operador = undefined
        updatePayload.lock_timestamp = undefined
        updatePayload.quarentena_ate = undefined
      }

      await updateCliente(cliente.id, updatePayload)

      // 3. Registrar interação de encerramento
      await createInteracao({
        cliente: cliente.id,
        operador: user.id,
        tipo: 'formulario',
        desfecho: desfechoFinal,
        motivo:
          desfechoFinal === 'ativo_fora_base'
            ? `${motivoAtivoForaBase}${obsAtivoForaBase ? ` — ${obsAtivoForaBase}` : ''}`
            : motivoDesfecho,
        conteudo:
          desfechoFinal === 'ativo_fora_base'
            ? `Atendimento finalizado: CLIENTE ATIVO — FORA DA BASE DE INATIVOS.\nMotivo: ${motivoAtivoForaBase}\nObservação do operador: ${obsAtivoForaBase || 'Nenhuma'}\n(Cliente removido permanentemente da base de inativos e protegido contra reimportações/recálculo)`
            : `Atendimento finalizado com desfecho: ${desfechoFinal.toUpperCase()}.\nObservações: ${observacoes || 'Nenhuma'}${
                numeroPedido ? `\nPedido: ${numeroPedido}` : ''
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

      alert('Atendimento registrado e sincronizado com sucesso!')
      setCliente(null)
      setShowQuestionarioModal(false)
      navigate(user?.role === 'operador' || user?.role === 'lider' ? '/meu-painel' : '/fila')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar atendimento'
      alert(`Erro: ${msg}`)
    } finally {
      setIsFinalizing(false)
    }
  }

  const cleanPhone = cliente ? (cliente.telefone || cliente.whatsapp || '').replace(/\D/g, '') : ''

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Topo do Atendimento: Barra de Filtros e Botão Novo Atendimento (Exigência do Pedido 3c) */}
      <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-slate-50 via-white to-blue-50/30">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Dropdown de Segmentos reais */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                Filtrar por Segmento
              </span>
              <Select value={filtroSegmento} onValueChange={(val) => setFiltroSegmento(val)}>
                <SelectTrigger className="h-8 text-xs w-48 bg-white border-slate-300">
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
                    ⭐ Maior Score Primeiro
                  </SelectItem>
                  <SelectItem value="antigos" className="text-xs">
                    ⏳ Mais Antigos (+ dias sem faturar)
                  </SelectItem>
                  <SelectItem value="novos" className="text-xs">
                    ✨ Mais Novos (menos dias sem faturar)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botão Novo Atendimento */}
          <div className="flex items-center space-x-2 pt-2 md:pt-0">
            <Button
              size="sm"
              onClick={handlePuxarNovoAtendimento}
              disabled={reservandoNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 shadow-sm"
            >
              <PhoneCall className={`h-4 w-4 mr-2 ${reservandoNovo ? 'animate-bounce' : ''}`} />
              {reservandoNovo ? 'Reservando Contato...' : 'Novo Atendimento'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Se não houver cliente selecionado */}
      {!cliente ? (
        <Card className="border-dashed border-2 border-slate-200 text-center p-12 bg-slate-50/50">
          <CardContent className="space-y-3 flex flex-col items-center justify-center p-0">
            <div className="h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
              <PhoneCall className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Pronto para Iniciar Contatos</h3>
            <p className="text-xs text-slate-500 max-w-md">
              {user?.regioes?.includes('REPESCAGEM')
                ? 'Operador da fila transversal Repescagem: o sistema buscará clientes com 90+ dias sem faturar de qualquer região, exceto os contatados pelo vendedor original da rota.'
                : 'Selecione o segmento desejado e a ordenação acima e clique no botão "Novo Atendimento". O sistema reservará atomicamente o melhor cliente da sua rota já com o cadastro pré-preenchido.'}
            </p>
            <Button
              onClick={handlePuxarNovoAtendimento}
              disabled={reservandoNovo}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold mt-2"
            >
              <PhoneCall className="h-3.5 w-3.5 mr-1.5" />
              {user?.regioes?.includes('REPESCAGEM')
                ? 'Puxar Próximo Cliente Repescagem (90+ dias)'
                : 'Puxar Próximo Cliente da Minha Rota'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ficha Completa do Cliente Pré-Preenchida + Gatilhos de Fechamento (Pedido 1b e 3c) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border-blue-200"
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
                  onClick={() => setShowQuestionarioModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Confirmar Atendimento (17 Perguntas)
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
                        Questionário padronizado de 17 itens com regras condicionais e desfecho
                        unificado. Clique em <strong>Confirmar Atendimento</strong> no topo para
                        expandir ou responda diretamente abaixo.
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-blue-600">
                        Pergunta {currentStep} de 17
                      </span>
                      <Progress value={(currentStep / 17) * 100} className="w-24 h-1.5 mt-1" />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Renderização da pergunta atual baseada no currentStep */}
                  {currentStep === 1 && (
                    <div className="space-y-3">
                      <Badge variant="secondary" className="text-xs">
                        Q1 — Pré-preenchida
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Confirmação do Código Cadastral do Cliente
                      </h3>
                      <p className="text-xs text-slate-500">
                        O código do cliente foi validado da planilha e é a chave única no sistema.
                      </p>
                      <Input
                        value={String(answers.q1 || cliente.codigo)}
                        readOnly
                        className="bg-slate-50 font-mono"
                      />
                    </div>
                  )}

                  {currentStep === 2 && (
                    <div className="space-y-3">
                      <Badge variant="secondary" className="text-xs">
                        Q2 — Pré-preenchida
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Razão Social e Nome Fantasia
                      </h3>
                      <Input
                        value={String(answers.q2 || cliente.nome)}
                        readOnly
                        className="bg-slate-50 font-medium"
                      />
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q3 — Situação Operacional
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        O cliente continua ativo no mercado e com demanda operacional regular?
                      </h3>
                      <Select
                        value={String(answers.q3 || '')}
                        onValueChange={(val) => setAnswers({ ...answers, q3: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status no mercado..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sim, operando normalmente">
                            Sim, operando normalmente
                          </SelectItem>
                          <SelectItem value="Sim, demanda reduzida">
                            Sim, demanda reduzida
                          </SelectItem>
                          <SelectItem value="Em recuperação judicial">
                            Em recuperação judicial
                          </SelectItem>
                          <SelectItem value="Encerrou as atividades">
                            Encerrou as atividades
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {currentStep === 4 && (
                    <div className="space-y-3">
                      <Badge variant="secondary" className="text-xs">
                        Q4 — Pré-preenchida
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Região e Vendedor Atribuído
                      </h3>
                      <Input
                        value={String(
                          answers.q4 || `${cliente.regiao} — Vendedor: ${cliente.vendedor}`,
                        )}
                        readOnly
                        className="bg-slate-50"
                      />
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
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
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
                        </SelectContent>
                      </Select>
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
                      <Input
                        placeholder="Nome do concorrente ou canal..."
                        value={String(answers.q7 || '')}
                        onChange={(e) => setAnswers({ ...answers, q7: e.target.value })}
                      />
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
                      <Textarea
                        placeholder="Descreva o problema ocorrido..."
                        value={String(answers.q8 || '')}
                        onChange={(e) => setAnswers({ ...answers, q8: e.target.value })}
                        rows={3}
                      />
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
                          <SelectItem value="Outro problema operacional">
                            Outro problema operacional
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Input
                        placeholder="Ex: Bonificação em próximo lote, visita técnica, troca de prazo..."
                        value={String(answers.q10 || '')}
                        onChange={(e) => setAnswers({ ...answers, q10: e.target.value })}
                      />
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
                        </SelectContent>
                      </Select>
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
                        </SelectContent>
                      </Select>
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
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                          <Label className="text-xs font-bold text-emerald-900">
                            Número do Pedido / Registro Faturado (Validação na próxima planilha)
                          </Label>
                          <Input
                            placeholder="Ex: PED-2025-998"
                            value={numeroPedido}
                            onChange={(e) => setNumeroPedido(e.target.value)}
                            className="bg-white text-xs"
                          />
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
                                <SelectItem
                                  value="outro motivo de cliente ativo"
                                  className="text-xs"
                                >
                                  Outro motivo (especificar abaixo)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">
                              Observações Complementares / Detalhes (Livre)
                            </Label>
                            <Textarea
                              placeholder="Descreva detalhes: qual terceiro compra, qual vendedor acompanha, etc..."
                              value={obsAtivoForaBase}
                              onChange={(e) => setObsAtivoForaBase(e.target.value)}
                              rows={2}
                              className="text-xs bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q15 = Numérico (R$) */}
                  {currentStep === 15 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q15 — Campo Numérico: Valor Potencial (R$)
                      </Badge>
                      <h3 className="text-base font-semibold text-slate-800">
                        Valor monetário estimado da recuperação / cotação
                      </h3>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={answers.q15 !== undefined ? String(answers.q15) : ''}
                          onChange={(e) => setAnswers({ ...answers, q15: e.target.value })}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  )}

                  {/* Q16 = Numérico (Toneladas) */}
                  {currentStep === 16 && (
                    <div className="space-y-3">
                      <Badge variant="outline" className="text-xs text-blue-600">
                        Q16 — Campo Numérico: Volume em Toneladas
                      </Badge>
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
                          onChange={(e) => setAnswers({ ...answers, q16: e.target.value })}
                          className="pl-9"
                        />
                      </div>
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
                    onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                    disabled={currentStep === 1}
                    className="text-xs"
                  >
                    Anterior
                  </Button>

                  <div className="flex items-center space-x-2">
                    {currentStep < 17 ? (
                      <Button
                        size="sm"
                        onClick={() => setCurrentStep((prev) => Math.min(17, prev + 1))}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        Próxima Pergunta
                      </Button>
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

          {/* Modal / Dialog de Confirmação do Atendimento (17 Perguntas) quando o operador clica em "Confirmar Atendimento" */}
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
                    <span>Progresso das 17 Perguntas</span>
                    <span className="font-mono font-bold text-blue-600">
                      {Math.round((currentStep / 17) * 100)}%
                    </span>
                  </div>
                  <Progress value={(currentStep / 17) * 100} className="h-2 bg-slate-100" />

                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600">
                      O formulário de 17 perguntas está ativo na página logo abaixo. Você pode
                      continuar respondendo passo a passo com a pré-seleção dos dados da planilha.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                      disabled={currentStep === 1}
                      className="text-xs"
                    >
                      Pergunta Anterior
                    </Button>
                    {currentStep < 17 ? (
                      <Button
                        size="sm"
                        onClick={() => setCurrentStep((prev) => Math.min(17, prev + 1))}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      >
                        Próxima Pergunta ({currentStep + 1}/17)
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
