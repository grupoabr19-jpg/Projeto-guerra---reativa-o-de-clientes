import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Phone,
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
} from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import type { Cliente, Interacao, ClienteEstado } from '@/types'

export default function AtendimentoPage() {
  const { clientId } = useParams<{ clientId?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [loading, setLoading] = useState(true)

  // Questionário de 17 Perguntas (Etapas 1..17)
  const [currentStep, setCurrentStep] = useState(1)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [anexosFiles, setAnexosFiles] = useState<File[]>([])

  // Desfecho Unificado (Q14 e Q17 foram unificados pelo usuário)
  const [desfechoFinal, setDesfechoFinal] = useState<ClienteEstado | ''>('')
  const [motivoDesfecho, setMotivoDesfecho] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [reagendarData, setReagendarData] = useState('')
  const [numeroPedido, setNumeroPedido] = useState('')
  const [duplicadoCodigo, setDuplicadoCodigo] = useState('')
  const [isFinalizing, setIsFinalizing] = useState(false)

  // Timeline nova nota
  const [novaNota, setNovaNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  useEffect(() => {
    if (clientId) {
      loadCliente(clientId)
    } else {
      setLoading(false)
    }
  }, [clientId])

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

  // Devolver cliente à fila e liberar lock
  const handleReleaseLock = async () => {
    if (!cliente) return
    const confirm = window.confirm(
      'Deseja realmente abandonar o atendimento deste cliente? O progresso será salvo como rascunho e o cliente voltará para a fila.',
    )
    if (!confirm) return

    try {
      await releaseQueueLock(cliente.id, answers)
      navigate('/fila')
    } catch (err) {
      console.error('Erro ao liberar cliente:', err)
      navigate('/fila')
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
        updatePayload.reagendado_para = new Date(reagendarData).toISOString()
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
      }

      await updateCliente(cliente.id, updatePayload)

      // 3. Registrar interação de encerramento
      await createInteracao({
        cliente: cliente.id,
        operador: user.id,
        tipo: 'formulario',
        desfecho: desfechoFinal,
        motivo: motivoDesfecho,
        conteudo: `Atendimento finalizado com desfecho: ${desfechoFinal.toUpperCase()}.\nObservações: ${observacoes || 'Nenhuma'}${
          numeroPedido ? `\nPedido: ${numeroPedido}` : ''
        }`,
        reagendado_para: reagendarData ? new Date(reagendarData).toISOString() : undefined,
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
      navigate('/fila')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar atendimento'
      alert(`Erro: ${msg}`)
    } finally {
      setIsFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-xs text-slate-400">
        Carregando painel de atendimento...
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="py-20 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">Nenhum cliente selecionado</h3>
        <p className="text-xs text-slate-500">
          Acesse a Fila de Atendimento e selecione um cliente ou clique em "Novo Contato da Fila".
        </p>
        <Button onClick={() => navigate('/fila')} className="bg-blue-600 hover:bg-blue-700 text-xs">
          Ir para a Fila
        </Button>
      </div>
    )
  }

  const cleanPhone = (cliente.telefone || cliente.whatsapp || '').replace(/\D/g, '')

  return (
    <div className="space-y-6">
      {/* Top Header Card com Dados do Cliente e Ações de Contato */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/fila')}
                className="h-7 px-2 text-slate-500 -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Fila
              </Button>
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
            </div>
            <h2 className="text-lg font-bold text-slate-900">{cliente.nome}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>
                <strong>Região:</strong> {cliente.regiao}
              </span>
              <span>•</span>
              <span>
                <strong>Vendedor:</strong> {cliente.vendedor || 'Não informado'}
              </span>
              <span>•</span>
              <span>
                <strong>Segmento:</strong> {cliente.segmento || 'Não informado'}
              </span>
              <span>•</span>
              <span className="font-semibold text-slate-700">Score: {cliente.score} pts</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReleaseLock}
              className="h-8 text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 border-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Abandonar / Devolver à Fila
            </Button>
          </div>
        </div>

        {/* Action Buttons: Ligar, WhatsApp, Email */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {cleanPhone && (
            <>
              <a href={`tel:${cleanPhone}`} onClick={() => handleRegisterContact('ligacao')}>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-medium"
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
                  className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs font-medium"
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Abrir WhatsApp
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
                    unificado
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
                      <SelectItem value="Sim, demanda reduzida">Sim, demanda reduzida</SelectItem>
                      <SelectItem value="Em recuperação judicial">
                        Em recuperação judicial
                      </SelectItem>
                      <SelectItem value="Encerrou as atividades">Encerrou as atividades</SelectItem>
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
                    O cliente aceita receber uma contraproposta ou cotação especial de reativação?
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
                      <Label className="text-xs font-bold text-amber-900">
                        Data e Horário de Retorno Prioritário
                      </Label>
                      <Input
                        type="datetime-local"
                        value={reagendarData}
                        onChange={(e) => setReagendarData(e.target.value)}
                        className="bg-white text-xs"
                      />
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
                    Notas finais que serão gravadas na timeline e sincronizadas com a API do Kommo:
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
                        <span className="font-semibold text-slate-700 uppercase">{item.tipo}</span>
                        <span className="text-slate-400 font-mono">
                          {new Date(item.created).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 whitespace-pre-wrap">{item.conteudo}</p>
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
    </div>
  )
}
