import React, { useState, useEffect } from 'react'
import {
  Bot,
  Sparkles,
  Power,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Save,
  MessageSquare,
  Network,
  History,
  Info,
  PhoneCall,
  UserCheck,
  Building2,
  MapPin,
  HelpCircle,
  RefreshCw,
  Send,
  Sliders,
  Mic,
  Image as ImageIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchSdrBotConfig,
  saveSdrBotConfig,
  toggleSdrBot,
  testSdrBotSimulacao,
  fetchSdrTriagensLogs,
} from '@/services/sdrBot'
import type { SdrBotConfig, SdrTriagemLogItem, SdrSimulacaoResponse } from '@/types'

export default function TreinamentoSdrPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Estado geral de configuração
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [config, setConfig] = useState<SdrBotConfig>({
    ativo: true,
    nome_sdr: 'SDR Virtual Grupo ABR',
    saudacao:
      'Olá! Sou o assistente SDR do Grupo ABR, seu parceirAço em aço e soluções siderúrgicas. Como posso ajudar com sua obra, empresa ou indústria hoje?',
    tom: 'profissional, ágil e focado em fechamento',
    instrucoes:
      'Qualifique se é compra para obra própria/reforma (Varejo) ou empresa/indústria/revenda (Corporativo). Identifique cidade e produto. NUNCA prometa preço ou prazo fechado. Transfira rapidamente para o vendedor especialista da rota.',
    mensagem_fora_expediente:
      'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!',
    fallback_audio: 'Recebi seu áudio! Para eu te atender mais rápido, pode me enviar por texto?',
    fallback_imagem: 'Recebi sua imagem! Pode me descrever o que precisa por texto?',
    transcrever_audio_ativo: true,
    regras_rotas: {
      BRAGANÇA: {
        especialista: 'Leiz Torso',
        corporativo: 'Heloá Leite',
        externo: 'Alessandro Farias (Japa)',
      },
      JUNDIAÍ: {
        especialista: 'Josiane Lima',
        corporativo: 'Kaylane Silva',
        externo: 'Dyovana Silva',
      },
      VARGINHA: {
        especialista: 'Bruna Pereira',
        corporativo: 'Thais Oliveira',
        externo: 'Peterson Seixas',
      },
      'POUSO ALEGRE': {
        especialista: 'Rafaela Resende',
        corporativo: 'Camila Guimenti',
        externo: 'Paola Santos',
      },
      'POÇOS DE CALDAS': {
        especialista: 'Milena Vaz',
        corporativo: 'Camila Guimenti',
        externo: 'José Felipe',
      },
      ITAJUBÁ: {
        especialista: 'Gabriela Cunha',
        corporativo: 'Jéssica Santos',
        externo: 'Jennifer Silva',
      },
      EXTREMA: {
        especialista: 'Inayara Cunha',
        corporativo: 'Tainara Matilde',
        externo: 'Gustavo Araujo',
      },
      CAMBUÍ: {
        especialista: 'Edmila Melo',
        corporativo: 'Matheus Teixeira',
        externo: 'Juliano Pereira',
      },
    },
    regras_atacado_ddd: {
      '11,12,13': { operador_nome: 'Larissa Terra', ddds: ['11', '12', '13'] },
      '15,19': { operador_nome: 'Julio Melo', ddds: ['15', '19'] },
      '14,16,17,18': { operador_nome: 'Wilson Neto', ddds: ['14', '16', '17', '18'] },
    },
    fallback_admin: {
      nome: 'Thiago Almeida',
      role: 'admin',
    },
  })

  // Estado do Teste/Simulador
  const [simNome, setSimNome] = useState('João Construtor')
  const [simTelefone, setSimTelefone] = useState('(35) 99888-1122')
  const [simDocumento, setSimDocumento] = useState('12.345.678/0001-90')
  const [simMensagem, setSimMensagem] = useState(
    'Boa tarde! Preciso de cotação de 3 toneladas de vergalhão CA-50 de 10mm e telas soldadas para uma obra em Varginha. Vocês entregam aqui?',
  )
  const [simularForaExpediente, setSimularForaExpediente] = useState(false)
  const [simTipoMensagem, setSimTipoMensagem] = useState<'texto' | 'audio' | 'imagem'>('texto')
  const [testando, setTestando] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState<SdrSimulacaoResponse | null>(null)

  // Estado de Logs / Auditoria
  const [logs, setLogs] = useState<SdrTriagemLogItem[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [filtroApenasReais, setFiltroApenasReais] = useState(false)

  // Carregar configurações iniciais
  const carregarConfig = async () => {
    setLoadingConfig(true)
    try {
      const cfg = await fetchSdrBotConfig()
      if (cfg) {
        setConfig((prev) => ({
          ...prev,
          ...cfg,
          regras_rotas: cfg.regras_rotas || prev.regras_rotas,
          regras_atacado_ddd: cfg.regras_atacado_ddd || prev.regras_atacado_ddd,
        }))
      }
    } catch (err: any) {
      toast({
        title: 'Aviso',
        description: 'Usando parâmetros padrão do Bot SDR: ' + (err?.message || ''),
      })
    } finally {
      setLoadingConfig(false)
    }
  }

  // Carregar logs
  const carregarLogs = async () => {
    setLoadingLogs(true)
    try {
      const dados = await fetchSdrTriagensLogs({ limit: 50, reais: filtroApenasReais })
      setLogs(dados)
    } catch (err: any) {
      console.error('Erro ao carregar logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    carregarConfig()
    carregarLogs()
  }, [])

  useEffect(() => {
    carregarLogs()
  }, [filtroApenasReais])

  // Ligar/Desligar Bot
  const handleToggleBot = async () => {
    setTogglingBot(true)
    try {
      const res = await toggleSdrBot(!config.ativo)
      setConfig((prev) => ({ ...prev, ativo: res.ativo }))
      toast({
        title: res.ativo ? 'Bot SDR Ativado' : 'Bot SDR Pausado',
        description: res.message,
        className: res.ativo ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err?.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setTogglingBot(false)
    }
  }

  // Salvar Configuração
  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const saved = await saveSdrBotConfig(config)
      setConfig(saved)
      toast({
        title: 'Sucesso',
        description: 'Parâmetros e diretrizes do Bot SDR salvos com sucesso!',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Falha ao gravar configurações.',
        variant: 'destructive',
      })
    } finally {
      setSavingConfig(false)
    }
  }

  // Executar Simulação
  const handleExecutarSimulacao = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!simMensagem.trim() && !simTelefone.trim() && simTipoMensagem === 'texto') {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe ao menos a mensagem simulada do cliente.',
        variant: 'destructive',
      })
      return
    }

    setTestando(true)
    try {
      const res = await testSdrBotSimulacao({
        mensagem: simMensagem,
        telefone: simTelefone,
        documento: simDocumento,
        nomeCliente: simNome,
        fora_expediente: simularForaExpediente,
        tipo_mensagem: simTipoMensagem,
      })
      setResultadoTeste(res)
      toast({
        title: 'Simulação concluída',
        description: `Triado como ${res.decisao.classificacao} -> ${res.decisao.rota_destino}`,
      })
      // Atualiza logs para mostrar a nova simulação
      carregarLogs()
    } catch (err: any) {
      toast({
        title: 'Erro na simulação',
        description: err?.message || 'Falha ao processar simulação.',
        variant: 'destructive',
      })
    } finally {
      setTestando(false)
    }
  }

  // Atualizar campo de rota
  const handleRotaChange = (
    rotaNome: string,
    campo: 'especialista' | 'corporativo',
    valor: string,
  ) => {
    setConfig((prev) => ({
      ...prev,
      regras_rotas: {
        ...prev.regras_rotas,
        [rotaNome]: {
          ...(prev.regras_rotas[rotaNome] || { especialista: '', corporativo: '' }),
          [campo]: valor,
        },
      },
    }))
  }

  // Atualizar operador atacado
  const handleAtacadoChange = (chave: string, valor: string) => {
    setConfig((prev) => ({
      ...prev,
      regras_atacado_ddd: {
        ...prev.regras_atacado_ddd,
        [chave]: {
          ...(prev.regras_atacado_ddd[chave] || { ddds: [], operador_nome: '' }),
          operador_nome: valor,
        },
      },
    }))
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner de Identidade Visual Grupo ABR */}
      <div className="bg-[#142758] text-white p-6 rounded-2xl shadow-md border border-[#253575] relative overflow-hidden">
        {/* Curva Laranja ABR */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#253575]">
          <div className="h-full w-48 bg-[#F18800] rounded-r-full" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-[#F18800] hover:bg-[#d97700] text-white border-0 text-xs font-semibold px-2.5 py-0.5">
                Módulo SDR Oficial
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs font-mono font-medium border-white/20 text-white ${
                  config.ativo
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {config.ativo ? '● Ativo e Triando' : '○ Pausado (Admin assume)'}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Bot className="h-8 w-8 text-[#F18800]" />
              Treinamento do Bot SDR
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Agente de Inteligência Artificial nativo para triagem rápida, qualificação comercial e
              transferência automática de conversas na linha WhatsApp oficial{' '}
              <strong className="text-white">(35) 99770-9232</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#0c1836] p-3 rounded-xl border border-white/10 shrink-0">
            <div className="text-right">
              <div className="text-xs font-semibold text-white">Status do Bot SDR</div>
              <div className="text-[11px] text-slate-400">
                {config.ativo ? 'Triagem automática ligada' : 'Linha cai direto no admin'}
              </div>
            </div>
            <Button
              size="sm"
              disabled={togglingBot || loadingConfig}
              onClick={handleToggleBot}
              className={`font-semibold transition-all ${
                config.ativo
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-[#F18800] hover:bg-[#d97700] text-white shadow-md shadow-[#F18800]/20'
              }`}
            >
              <Power className="h-4 w-4 mr-1.5" />
              {config.ativo ? 'Desligar Bot' : 'Ligar Bot SDR'}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Principais */}
      <Tabs defaultValue="treinamento" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl border border-slate-200">
          <TabsTrigger
            value="treinamento"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white rounded-lg transition-all"
          >
            <Sliders className="h-4 w-4" />
            <span>Comportamento & Prompt</span>
          </TabsTrigger>
          <TabsTrigger
            value="regras"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white rounded-lg transition-all"
          >
            <Network className="h-4 w-4" />
            <span>Regras de Roteamento</span>
          </TabsTrigger>
          <TabsTrigger
            value="teste"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white rounded-lg transition-all"
          >
            <Sparkles className="h-4 w-4 text-[#F18800]" />
            <span>Área de Teste (Simulador)</span>
          </TabsTrigger>
          <TabsTrigger
            value="auditoria"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-[#253575] data-[state=active]:text-white rounded-lg transition-all"
          >
            <History className="h-4 w-4" />
            <span>Histórico & Auditoria</span>
            {logs.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-slate-200 text-slate-700"
              >
                {logs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 1. ABA COMPORTAMENTO E PROMPT */}
        <TabsContent value="treinamento" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-[#253575] flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-[#F18800]" />
                        Identidade e Diálogo do SDR
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Configure o papel e como o SDR se apresenta para clientes que chamam na
                        linha WhatsApp oficial.
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-[#253575]/20 text-[#253575] bg-[#253575]/5 text-xs"
                    >
                      Skip Cloud Agent
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="nome_sdr" className="text-xs font-semibold text-slate-700">
                        Nome do Assistente SDR
                      </Label>
                      <Input
                        id="nome_sdr"
                        value={config.nome_sdr}
                        onChange={(e) => setConfig({ ...config, nome_sdr: e.target.value })}
                        placeholder="Ex: SDR Virtual Grupo ABR"
                        className="text-sm font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tom" className="text-xs font-semibold text-slate-700">
                        Tom de Voz Comercial
                      </Label>
                      <Input
                        id="tom"
                        value={config.tom}
                        onChange={(e) => setConfig({ ...config, tom: e.target.value })}
                        placeholder="Ex: profissional, ágil e focado em fechamento"
                        className="text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="saudacao" className="text-xs font-semibold text-slate-700">
                      Mensagem Inicial / Saudação Padrão
                    </Label>
                    <Textarea
                      id="saudacao"
                      rows={3}
                      value={config.saudacao}
                      onChange={(e) => setConfig({ ...config, saudacao: e.target.value })}
                      placeholder="Mensagem disparada na primeira interação com o cliente..."
                      className="text-sm leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500">
                      Mensagem de acolhimento rápida confirmando ser a linha do Grupo ABR ("Seu
                      parceirAço!").
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="instrucoes"
                      className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                    >
                      <span>Instruções & Regras de Conduta do SDR (Prompt de Treinamento)</span>
                      <span className="text-[10px] text-emerald-600 font-mono">
                        Modo Seguro Ativo
                      </span>
                    </Label>
                    <Textarea
                      id="instrucoes"
                      rows={5}
                      value={config.instrucoes}
                      onChange={(e) => setConfig({ ...config, instrucoes: e.target.value })}
                      placeholder="Diretrizes do que o bot pode e não pode falar..."
                      className="text-sm leading-relaxed font-sans"
                    />
                    <div className="bg-amber-50 border border-amber-200/70 p-3 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Regra inegociável de conformidade:</strong> O bot SDR foi programado
                        para nunca prometer preço fechado nem prazo sem validação do vendedor
                        especialista. Sua missão prioritária é qualificar o tipo (obra própria vs
                        empresa/indústria) e a cidade de entrega, repassando o lead de imediato.
                      </div>
                    </div>
                  </div>

                  {/* Mensagem Fora de Expediente (editável pelo Admin) */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="mensagem_fora_expediente"
                        className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                      >
                        <Clock className="h-4 w-4 text-[#253575]" />
                        <span>Mensagem de Resposta Fora do Expediente</span>
                      </Label>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-slate-100 text-slate-600 font-mono"
                      >
                        Após 18h, fins de semana e feriados
                      </Badge>
                    </div>
                    <Textarea
                      id="mensagem_fora_expediente"
                      rows={3}
                      value={config.mensagem_fora_expediente || ''}
                      onChange={(e) =>
                        setConfig({ ...config, mensagem_fora_expediente: e.target.value })
                      }
                      placeholder="Ex: Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h..."
                      className="text-sm leading-relaxed"
                    />
                    <p className="text-[11px] text-slate-500">
                      Disparada automaticamente para contatos que chegam após as 18h, aos fins de
                      semana ou feriados. A triagem é retida para acolhimento no próximo dia útil e
                      vendedores <strong>não</strong> recebem transferências à noite/fim de semana.
                    </p>
                  </div>

                  {/* Fallback de Áudio e Imagem/Mídia */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-[#253575] uppercase tracking-wider flex items-center gap-1.5">
                          <Mic className="h-4 w-4 text-[#F18800]" />
                          Suporte a Áudio & Mídias WhatsApp
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Respostas cordiais automáticas quando clientes enviam mensagens de voz,
                          fotos ou documentos.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                        <Label
                          htmlFor="transcrever_audio_switch"
                          className="text-[11px] font-semibold text-slate-700 cursor-pointer"
                        >
                          Tentar Transcrição AI
                        </Label>
                        <Switch
                          id="transcrever_audio_switch"
                          checked={config.transcrever_audio_ativo !== false}
                          onCheckedChange={(checked) =>
                            setConfig({ ...config, transcrever_audio_ativo: checked })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Fallback Áudio */}
                      <div className="space-y-1.5 p-3.5 bg-amber-50/40 rounded-xl border border-amber-200/60">
                        <Label
                          htmlFor="fallback_audio"
                          className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                        >
                          <Mic className="h-4 w-4 text-amber-600" />
                          <span>Fallback para Áudio / Mensagem de Voz</span>
                        </Label>
                        <Textarea
                          id="fallback_audio"
                          rows={3}
                          value={config.fallback_audio || ''}
                          onChange={(e) => setConfig({ ...config, fallback_audio: e.target.value })}
                          placeholder="Recebi seu áudio! Para eu te atender mais rápido, pode me enviar por texto?"
                          className="text-xs leading-relaxed bg-white"
                        />
                        <p className="text-[10px] text-slate-500">
                          Enviado quando o cliente manda áudio e a transcrição falhar ou o endpoint
                          não estiver disponível.
                        </p>
                      </div>

                      {/* Fallback Imagem */}
                      <div className="space-y-1.5 p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/60">
                        <Label
                          htmlFor="fallback_imagem"
                          className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"
                        >
                          <ImageIcon className="h-4 w-4 text-[#253575]" />
                          <span>Fallback para Imagem / Foto / Anexo</span>
                        </Label>
                        <Textarea
                          id="fallback_imagem"
                          rows={3}
                          value={config.fallback_imagem || ''}
                          onChange={(e) =>
                            setConfig({ ...config, fallback_imagem: e.target.value })
                          }
                          placeholder="Recebi sua imagem! Pode me descrever o que precisa por texto?"
                          className="text-xs leading-relaxed bg-white"
                        />
                        <p className="text-[10px] text-slate-500">
                          Enviado quando o cliente manda foto de projeto, planta ou material sem
                          descrição por texto.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                      className="bg-[#253575] hover:bg-[#1b2756] text-white font-semibold text-sm shadow-sm"
                    >
                      <Save className="h-4 w-4 mr-1.5" />
                      {savingConfig ? 'Gravando Alterações...' : 'Salvar Treinamento do SDR'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Coluna Lateral: Resumo das Diretrizes */}
            <div className="space-y-6">
              <Card className="border-slate-200 shadow-sm bg-gradient-to-b from-white to-slate-50">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="text-sm font-bold text-[#253575] flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-[#F18800]" />
                    Como o SDR Opera na Linha
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800">1. Identificação Rápida:</strong> Cruza o
                      número ou documento do lead com a base mestre de clientes do Grupo ABR.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800">2. Triagem Comercial:</strong> Separa obra
                      própria/reforma (Varejo - VARE) de empresas, indústrias, construtoras e
                      revendas (Corporativo - VCORP).
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800">3. Roteamento Geográfico:</strong> Mapeia
                      para uma das 8 rotas do Varejo, canal Atacado por DDD ou admin Thiago Almeida.
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800">4. Transferência no Kommo:</strong>{' '}
                      Atualiza o responsável no CRM e grava uma nota com o resumo da triagem.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <CardTitle className="text-sm font-bold text-[#253575] flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-[#253575]" />
                    Expediente & Horário Comercial
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2 text-xs text-slate-600">
                  <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-slate-700">
                    <div className="font-semibold text-[#253575]">
                      Atendimento Comercial WhatsApp:
                    </div>
                    <div className="text-slate-600 font-medium">
                      Segunda a Sexta, das 07:00 às 18:00
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200/50 text-[11px] text-amber-900">
                    <strong>Regra Fora do Expediente:</strong> Contatos após as 18h, aos fins de
                    semana ou feriados nacionais recebem resposta automática cordial imediata e têm
                    a triagem/transferência agendada para o próximo dia útil às 7h. Vendedores não
                    são acionados fora de horário.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 2. ABA REGRAS DE ROTEAMENTO */}
        <TabsContent value="regras" className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold text-[#253575] flex items-center gap-2">
                    <Network className="h-5 w-5 text-[#F18800]" />
                    Mapeamento das 8 Rotas do Varejo (VARE vs VCORP)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Define para qual vendedor especialista ou corporativo o bot SDR transfere os
                    leads após a qualificação.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="bg-[#253575] hover:bg-[#1b2756] text-white text-xs font-semibold shrink-0"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Salvar Mapeamentos
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(config.regras_rotas || {}).map(([rotaNome, regra]) => (
                  <div
                    key={rotaNome}
                    className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs hover:border-[#253575]/40 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-bold text-sm text-[#253575] flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-[#F18800]" />
                        {rotaNome}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-mono px-1.5 py-0"
                      >
                        Rota Oficial
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 block">
                          Especialista Varejo (VARE)
                        </Label>
                        <Input
                          value={regra.especialista}
                          onChange={(e) =>
                            handleRotaChange(rotaNome, 'especialista', e.target.value)
                          }
                          className="h-8 text-xs font-medium mt-1"
                          placeholder="Nome do especialista"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600 block">
                          Corporativo (VCORP)
                        </Label>
                        <Input
                          value={regra.corporativo}
                          onChange={(e) =>
                            handleRotaChange(rotaNome, 'corporativo', e.target.value)
                          }
                          className="h-8 text-xs font-medium mt-1"
                          placeholder="Nome corporativo"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mapeamento de Atacado por DDD */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-slate-200 shadow-sm md:col-span-2">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#F18800]" />
                  Regras de Atacado por DDD Telefônico
                </CardTitle>
                <CardDescription className="text-xs">
                  Quando o cliente não pertence a uma das 8 rotas e possui DDD paulista, é
                  transferido para a equipe de Atacado.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">DDDs 11, 12, 13</span>
                      <Badge className="bg-blue-100 text-[#253575] hover:bg-blue-200 border-0 text-[10px]">
                        Grande SP / Litoral
                      </Badge>
                    </div>
                    <Label className="text-[11px] text-slate-500">Operador Responsável</Label>
                    <Input
                      value={
                        config.regras_atacado_ddd['11,12,13']?.operador_nome || 'Larissa Terra'
                      }
                      onChange={(e) => handleAtacadoChange('11,12,13', e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">DDDs 15, 19</span>
                      <Badge className="bg-blue-100 text-[#253575] hover:bg-blue-200 border-0 text-[10px]">
                        Campinas / Sorocaba
                      </Badge>
                    </div>
                    <Label className="text-[11px] text-slate-500">Operador Responsável</Label>
                    <Input
                      value={config.regras_atacado_ddd['15,19']?.operador_nome || 'Julio Melo'}
                      onChange={(e) => handleAtacadoChange('15,19', e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">DDDs 14, 16, 17, 18</span>
                      <Badge className="bg-blue-100 text-[#253575] hover:bg-blue-200 border-0 text-[10px]">
                        Interior SP Oeste/Norte
                      </Badge>
                    </div>
                    <Label className="text-[11px] text-slate-500">Operador Responsável</Label>
                    <Input
                      value={
                        config.regras_atacado_ddd['14,16,17,18']?.operador_nome || 'Wilson Neto'
                      }
                      onChange={(e) => handleAtacadoChange('14,16,17,18', e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-[#F18800]" />
                  Fallback de Segurança
                </CardTitle>
                <CardDescription className="text-xs">
                  Destino quando o lead não se encaixa em nenhuma rota nem DDD.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-3 text-xs text-slate-700">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60">
                  <div className="font-bold text-[#253575] text-sm">Thiago Almeida (Admin)</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Leads sem rota clara ou sem cadastro prévio permanecem com o Administrador no
                    Hub de Atendimento para redirecionamento manual.
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Garante que nenhum contato comercial de entrada seja perdido ou fique sem
                  acolhimento.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. ABA ÁREA DE TESTE (SIMULADOR) */}
        <TabsContent value="teste" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Simulador de Entrada do Cliente */}
            <div className="lg:col-span-5 space-y-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
                  <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#F18800]" />
                    Simular Contato de Cliente (WhatsApp)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Teste em tempo real como o SDR conversa e decide a rota <strong>
                      SEM
                    </strong>{' '}
                    impactar clientes reais ou o Kommo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-3.5">
                  <form onSubmit={handleExecutarSimulacao} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="sim_nome" className="text-xs font-semibold text-slate-700">
                          Nome / Razão Social
                        </Label>
                        <Input
                          id="sim_nome"
                          value={simNome}
                          onChange={(e) => setSimNome(e.target.value)}
                          placeholder="Ex: Construtora Aliança"
                          className="text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sim_tel" className="text-xs font-semibold text-slate-700">
                          Telefone / WhatsApp
                        </Label>
                        <Input
                          id="sim_tel"
                          value={simTelefone}
                          onChange={(e) => setSimTelefone(e.target.value)}
                          placeholder="(35) 99888-1122"
                          className="text-xs mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="sim_doc" className="text-xs font-semibold text-slate-700">
                        CNPJ ou CPF (Opcional - teste de cruzamento com base)
                      </Label>
                      <Input
                        id="sim_doc"
                        value={simDocumento}
                        onChange={(e) => setSimDocumento(e.target.value)}
                        placeholder="Ex: 12.345.678/0001-90"
                        className="text-xs mt-1"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sim_msg" className="text-xs font-semibold text-slate-700">
                          Mensagem / Conteúdo do Cliente
                        </Label>
                        {/* Seletor de Tipo de Mídia */}
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={simTipoMensagem === 'texto' ? 'default' : 'ghost'}
                            className={`h-6 text-[10px] px-2 py-0 ${
                              simTipoMensagem === 'texto'
                                ? 'bg-[#253575] text-white'
                                : 'text-slate-600'
                            }`}
                            onClick={() => setSimTipoMensagem('texto')}
                          >
                            Texto
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={simTipoMensagem === 'audio' ? 'default' : 'ghost'}
                            className={`h-6 text-[10px] px-2 py-0 flex items-center gap-1 ${
                              simTipoMensagem === 'audio'
                                ? 'bg-amber-600 text-white'
                                : 'text-slate-600'
                            }`}
                            onClick={() => setSimTipoMensagem('audio')}
                          >
                            <Mic className="h-3 w-3" />
                            Áudio
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={simTipoMensagem === 'imagem' ? 'default' : 'ghost'}
                            className={`h-6 text-[10px] px-2 py-0 flex items-center gap-1 ${
                              simTipoMensagem === 'imagem'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600'
                            }`}
                            onClick={() => setSimTipoMensagem('imagem')}
                          >
                            <ImageIcon className="h-3 w-3" />
                            Imagem
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        id="sim_msg"
                        rows={4}
                        value={simMensagem}
                        onChange={(e) => setSimMensagem(e.target.value)}
                        placeholder={
                          simTipoMensagem === 'audio'
                            ? 'Deixe em branco para testar áudio sem texto prévio (ativa transcrição ou fallback garantido)...'
                            : simTipoMensagem === 'imagem'
                              ? 'Deixe em branco para testar foto sem legenda (ativa fallback para imagem)...'
                              : 'Ex: Olá, gostaria de saber se vocês têm telha galvalume para entrega em Pouso Alegre...'
                        }
                        className="text-xs leading-relaxed mt-1"
                      />
                      {simTipoMensagem !== 'texto' && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Modo <strong>{simTipoMensagem.toUpperCase()}</strong> ativo. Se a mensagem
                          for enviada vazia, o bot executará o fluxo de mídia/fallback.
                        </p>
                      )}
                    </div>

                    {/* Botões de Exemplos Rápidos */}
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Cenários de Teste Rápidos:
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 py-0 border-slate-300 hover:bg-slate-100"
                          onClick={() => {
                            setSimTipoMensagem('texto')
                            setSimNome('Marcos da Silva')
                            setSimTelefone('(35) 99123-4567')
                            setSimDocumento('')
                            setSimMensagem(
                              'Preciso de 20 barras de ferro 3/8 para a laje da minha casa em Cambuí. Tem pronta entrega?',
                            )
                          }}
                        >
                          🏠 Varejo Cambuí
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 py-0 border-slate-300 hover:bg-slate-100"
                          onClick={() => {
                            setSimTipoMensagem('texto')
                            setSimNome('Estruturas Metálicas Forte CNPJ 00.123.456/0001-00')
                            setSimTelefone('(11) 98765-4321')
                            setSimDocumento('00.123.456/0001-00')
                            setSimMensagem(
                              'Somos indústria de estruturas em Bragança. Compramos 15 toneladas de perfis I e vigas todo mês. Quero falar com vendedor corporativo.',
                            )
                          }}
                        >
                          🏭 Corporativo Bragança
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 py-0 border-slate-300 hover:bg-slate-100"
                          onClick={() => {
                            setSimTipoMensagem('texto')
                            setSimNome('Depósito São Carlos')
                            setSimTelefone('(16) 99777-8899')
                            setSimDocumento('')
                            setSimMensagem(
                              'Boa tarde! Sou revendedor de aço em Araraquara (DDD 16). Gostaria da tabela para atacado de vergalhões.',
                            )
                          }}
                        >
                          📦 Atacado DDD 16
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 py-0 border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-amber-900"
                          onClick={() => {
                            setSimTipoMensagem('audio')
                            setSimNome('Sebastião Pedreiro')
                            setSimTelefone('(35) 99876-5432')
                            setSimDocumento('')
                            setSimMensagem('')
                          }}
                        >
                          🎙️ Áudio de Pedreiro
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2 py-0 border-blue-300 bg-blue-50/50 hover:bg-blue-100 text-blue-900"
                          onClick={() => {
                            setSimTipoMensagem('imagem')
                            setSimNome('Engenharia Sul de Minas')
                            setSimTelefone('(35) 99111-2233')
                            setSimDocumento('')
                            setSimMensagem('')
                          }}
                        >
                          🖼️ Foto de Projeto / Planta
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-7 text-[11px] px-2 py-0 border-amber-300 ${
                            simularForaExpediente
                              ? 'bg-amber-100 text-amber-900 border-amber-400 font-bold'
                              : 'bg-amber-50/60 text-amber-800 hover:bg-amber-100'
                          }`}
                          onClick={() => {
                            setSimTipoMensagem('texto')
                            setSimNome('Carlos Ferreira (Noite)')
                            setSimTelefone('(35) 99199-0011')
                            setSimDocumento('')
                            setSimMensagem(
                              'Boa noite! Preciso de orçamento de treliças e barras de aço urgente.',
                            )
                            setSimularForaExpediente(true)
                          }}
                        >
                          🌙 Testar Fora do Expediente
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="chk_fora_exp"
                        checked={simularForaExpediente}
                        onChange={(e) => setSimularForaExpediente(e.target.checked)}
                        className="rounded border-slate-300 text-[#253575] focus:ring-[#253575] h-4 w-4"
                      />
                      <label
                        htmlFor="chk_fora_exp"
                        className="text-xs text-slate-700 cursor-pointer select-none"
                      >
                        Simular chegada fora de expediente (após 18h / fim de semana / feriado)
                      </label>
                    </div>

                    <Button
                      type="submit"
                      disabled={testando}
                      className="w-full bg-[#F18800] hover:bg-[#d97700] text-white font-bold text-sm shadow-md shadow-[#F18800]/20"
                    >
                      <Play className="h-4 w-4 mr-1.5" />
                      {testando ? 'Simulando com Agente AI...' : 'Executar Simulação de Triagem'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Resultado da Triagem e Decisão do Bot */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-slate-200 shadow-sm h-full flex flex-col">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        Decisão da Triagem & Roteamento
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Veja o raciocínio comercial do SDR, a classificação adotada e para quem o
                        lead seria transferido.
                      </CardDescription>
                    </div>
                    {resultadoTeste && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs">
                        Triagem Concluída
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  {resultadoTeste ? (
                    <div className="space-y-4">
                      {/* Box 1: Resposta do Agente */}
                      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#253575] flex items-center gap-1.5">
                            <Bot className="h-4 w-4 text-[#F18800]" />
                            Resposta Conversacional do SDR Virtual:
                          </span>
                          <div className="flex items-center gap-1.5">
                            {resultadoTeste.origem_midia &&
                              resultadoTeste.origem_midia !== 'texto' && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-semibold ${
                                    resultadoTeste.origem_midia === 'audio'
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-blue-100 text-blue-900 border-blue-300'
                                  }`}
                                >
                                  {resultadoTeste.origem_midia === 'audio' ? 'Áudio' : 'Imagem'}
                                  {resultadoTeste.origem_midia === 'audio' &&
                                    (resultadoTeste.transcricao_sucesso
                                      ? ' (transcrito)'
                                      : ' (fallback ativo)')}
                                </Badge>
                              )}
                            <span className="text-[10px] font-mono text-slate-500">
                              Skip Cloud AI Agent
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                          {resultadoTeste.resposta_sdr}
                        </p>
                      </div>

                      {/* Box 2: Diagnóstico e Decisão */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[11px] font-medium text-slate-500 block">
                            Classificação Comercial
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              className={`text-xs font-bold ${
                                resultadoTeste.decisao.classificacao === 'VARE'
                                  ? 'bg-blue-600 text-white'
                                  : resultadoTeste.decisao.classificacao === 'VCORP'
                                    ? 'bg-purple-600 text-white'
                                    : resultadoTeste.decisao.classificacao === 'ATACADO'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-slate-600 text-white'
                              }`}
                            >
                              {resultadoTeste.decisao.classificacao}
                            </Badge>
                            <span className="text-xs font-semibold text-slate-700">
                              {resultadoTeste.decisao.classificacao === 'VARE' &&
                                'Varejo (Obra própria/reforma)'}
                              {resultadoTeste.decisao.classificacao === 'VCORP' &&
                                'Corporativo (Empresa/Indústria)'}
                              {resultadoTeste.decisao.classificacao === 'ATACADO' &&
                                'Canal Atacado por DDD'}
                              {resultadoTeste.decisao.classificacao === 'SEM_ROTA' &&
                                'Sem rota definida'}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg border border-slate-200 bg-white">
                          <span className="text-[11px] font-medium text-slate-500 block">
                            Rota / Região de Destino
                          </span>
                          <div className="flex items-center gap-1.5 mt-1 text-xs font-bold text-[#253575]">
                            <MapPin className="h-4 w-4 text-[#F18800]" />
                            {resultadoTeste.decisao.rota_destino}
                          </div>
                        </div>
                      </div>

                      {/* Box 3: Destinatário da Transferência */}
                      <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1.5">
                        <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                          Vendedor Responsável Escolhido:
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                            {resultadoTeste.decisao.operador_destino_nome}
                          </div>
                          {resultadoTeste.decisao.kommo_user_id ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-white border-emerald-300 text-emerald-700 font-mono"
                            >
                              Kommo ID #{resultadoTeste.decisao.kommo_user_id}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-white border-slate-300 text-slate-500 font-mono"
                            >
                              Sem Kommo ID direto
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 pt-1 border-t border-emerald-100">
                          <strong>Regra aplicada:</strong> {resultadoTeste.decisao.regra_aplicada}
                        </div>
                        <div className="text-xs text-slate-600">
                          <strong>Motivo:</strong> {resultadoTeste.decisao.motivo_decisao}
                        </div>
                      </div>

                      {/* Box 4: Preview da Nota no CRM */}
                      {resultadoTeste.decisao.nota_kommo_preview && (
                        <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1 font-mono">
                          <div className="font-semibold text-slate-600 text-[11px]">
                            Preview da Nota no Kommo Lead:
                          </div>
                          <div className="text-slate-800 text-[11px]">
                            {resultadoTeste.decisao.nota_kommo_preview}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-xl">
                      <Sparkles className="h-8 w-8 text-slate-300" />
                      <div className="font-semibold text-sm text-slate-600">
                        Nenhuma simulação executada ainda
                      </div>
                      <p className="text-xs max-w-sm">
                        Preencha o formulário ao lado ou escolha um dos cenários rápidos e clique em
                        "Executar Simulação" para testar o raciocínio do SDR.
                      </p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Ambiente seguro de laboratório</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResultadoTeste(null)}
                      disabled={!resultadoTeste}
                      className="h-7 text-xs text-slate-500 hover:text-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Limpar Resultado
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 4. ABA HISTÓRICO & AUDITORIA */}
        <TabsContent value="auditoria" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                    <History className="h-5 w-5 text-[#F18800]" />
                    Registro de Triagens do SDR (Auditoria Comercial)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Histórico de decisões, classificação de leads, operadores atribuídos e notas
                    sincronizadas com o Kommo.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                    <Switch
                      id="filtro_reais"
                      checked={filtroApenasReais}
                      onCheckedChange={setFiltroApenasReais}
                    />
                    <Label
                      htmlFor="filtro_reais"
                      className="text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Apenas Reais
                    </Label>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={carregarLogs}
                    disabled={loadingLogs}
                    className="text-xs h-8"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1.5 ${loadingLogs ? 'animate-spin' : ''}`}
                    />
                    Atualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLogs ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Carregando histórico de auditoria...
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                  <div className="font-semibold text-slate-600">
                    Nenhuma triagem registrada ainda
                  </div>
                  <p>
                    As triagens automáticas da linha WhatsApp e as simulações de teste aparecerão
                    aqui.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Data / Hora</th>
                        <th className="py-3 px-4">Origem / Canal</th>
                        <th className="py-3 px-4">Cliente / Contato</th>
                        <th className="py-3 px-4">Classificação</th>
                        <th className="py-3 px-4">Rota / Região</th>
                        <th className="py-3 px-4">Destino (Operador)</th>
                        <th className="py-3 px-4">Regra Decisória</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                            {new Date(log.created).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {log.conversa_resumo?.toLowerCase().includes('[origem: áudio') ||
                            log.classificacao === 'MIDIA_AUDIO' ? (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] flex items-center gap-1 w-fit">
                                <Mic className="h-3 w-3 text-amber-700" />
                                Áudio
                              </Badge>
                            ) : log.conversa_resumo?.toLowerCase().includes('[origem: imagem') ||
                              log.classificacao === 'MIDIA_IMAGEM' ? (
                              <Badge className="bg-blue-100 text-blue-900 border-blue-300 text-[10px] flex items-center gap-1 w-fit">
                                <ImageIcon className="h-3 w-3 text-blue-700" />
                                Imagem
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-slate-600 bg-slate-50 text-[10px] flex items-center gap-1 w-fit"
                              >
                                <MessageSquare className="h-3 w-3 text-slate-400" />
                                Texto
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{log.cliente_nome}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {log.telefone}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              className={`text-[10px] font-bold ${
                                log.classificacao === 'VARE'
                                  ? 'bg-blue-600 text-white'
                                  : log.classificacao === 'VCORP'
                                    ? 'bg-purple-600 text-white'
                                    : log.classificacao === 'ATACADO'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-slate-600 text-white'
                              }`}
                            >
                              {log.classificacao}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-medium text-[#253575]">
                            {log.rota_destino}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                              {log.operador_nome}
                            </div>
                            {log.kommo_user_id && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                Kommo #{log.kommo_user_id}
                              </div>
                            )}
                          </td>
                          <td
                            className="py-3 px-4 max-w-xs truncate text-slate-600"
                            title={log.motivo_decisao}
                          >
                            <span className="font-semibold text-slate-800">
                              {log.regra_aplicada}
                            </span>
                            <div className="truncate text-[11px] text-slate-500">
                              {log.motivo_decisao}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {log.eh_simulacao ? (
                              <Badge
                                variant="outline"
                                className="bg-slate-100 text-slate-700 text-[10px] border-slate-300"
                              >
                                Simulação
                              </Badge>
                            ) : log.status_transferencia === 'sucesso' ? (
                              <Badge className="bg-emerald-600 text-white text-[10px]">
                                Transferido
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-amber-400 text-amber-700 text-[10px]"
                              >
                                {log.status_transferencia || 'Pendente'}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
