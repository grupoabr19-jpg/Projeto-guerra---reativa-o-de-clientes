import React, { useState, useEffect } from 'react'
import {
  Settings,
  Sliders,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Users,
  Shield,
  Key,
  Database,
  ExternalLink,
  Plus,
  Save,
  Trophy,
  Award,
} from 'lucide-react'
import {
  fetchPesosGamificacao,
  updatePesosGamificacao,
  PESOS_GAMIFICACAO_PADRAO,
} from '@/services/gamificacao'
import type { PesosGamificacao } from '@/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  checkKommoStatus,
  testKommoConnection,
  fetchConfiguracoes,
  updateConfiguracao,
  fetchRegioes,
  updateRegiao,
} from '@/services/api'
import pb from '@/lib/pocketbase/client'
import type { User, Configuracao, Regiao } from '@/types'
import { REGIOES_PADRAO } from '@/types'
import { MapPin, Info, Edit2, Check, AlertCircle } from 'lucide-react'
import { BasesReferenciaTab } from '@/components/BasesReferenciaTab'

import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ConfiguracoesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [kommoStatus, setKommoStatus] = useState<{
    configured: boolean
    subdomain: string
    status: string
    message: string
  } | null>(null)
  const [testingKommo, setTestingKommo] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    status: string
    message: string
    account?: string
    testedAt: string
  } | null>(null)

  // Pesos do Score
  const [pesos, setPesos] = useState({
    recencia: 30,
    frequencia: 25,
    ticket_tonelagem: 20,
    segmento: 10,
    tentativas_penalidade: 15,
  })

  // Pesos da Gamificação
  const [pesosGamificacao, setPesosGamificacao] =
    useState<PesosGamificacao>(PESOS_GAMIFICACAO_PADRAO)
  const [savingGamificacao, setSavingGamificacao] = useState(false)

  // Motor da Fila
  const [motorFila, setMotorFila] = useState({
    modo_criterio: 'modo_c',
    bonus_faixa_90: 20,
    timeout_lock_minutos: 30,
    limite_sem_contato: 3,
    prazo_quarentena_dias: 90,
  })

  // Regiões
  const [regioes, setRegioes] = useState<Regiao[]>([])
  const [loadingRegioes, setLoadingRegioes] = useState(false)
  const [editingRegiao, setEditingRegiao] = useState<Regiao | null>(null)
  const [savingRegiao, setSavingRegiao] = useState(false)

  // Usuários
  const [usersList, setUsersList] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Novo Usuário Form
  const [novoEmail, setNovoEmail] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoRole, setNovoRole] = useState<'operador' | 'supervisor' | 'admin'>('operador')
  const [novasRegioesSelected, setNovasRegioesSelected] = useState<string[]>(['POÇOS DE CALDAS'])
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  // Edição de Regiões de Usuário existente
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editUserRegioes, setEditUserRegioes] = useState<string[]>([])
  const [savingUserRegioes, setSavingUserRegioes] = useState(false)

  const [savingConfig, setSavingConfig] = useState(false)

  // Aba ativa nas Configurações
  const [activeTab, setActiveTab] = useState('bases')

  useEffect(() => {
    if (user && user.role === 'operador') {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (user && user.role !== 'operador') {
      loadSettings()
      loadUsers()
      loadRegioesData()
    }
  }, [user])

  if (user?.role === 'operador') {
    return null
  }

  const loadSettings = async () => {
    try {
      const status = await checkKommoStatus()
      setKommoStatus(status)

      const configs = await fetchConfiguracoes()
      const pesosCfg = configs.find((c) => c.chave === 'pesos_score')
      if (pesosCfg?.valor) {
        setPesos(pesosCfg.valor as any)
      }

      const motorCfg = configs.find((c) => c.chave === 'motor_fila')
      if (motorCfg?.valor) {
        setMotorFila(motorCfg.valor as any)
      }

      const pesosGam = await fetchPesosGamificacao()
      setPesosGamificacao(pesosGam)
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
    }
  }

  const loadRegioesData = async () => {
    setLoadingRegioes(true)
    try {
      const data = await fetchRegioes()
      setRegioes(data)
    } catch (err) {
      console.error('Erro ao carregar regiões:', err)
    } finally {
      setLoadingRegioes(false)
    }
  }

  const loadUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await pb.collection('users').getFullList<User>({ sort: 'name' })
      setUsersList(res)
    } catch (err) {
      console.error('Erro ao buscar usuários:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleTestKommo = async () => {
    setTestingKommo(true)
    setTestResult(null)
    try {
      const res = await testKommoConnection()
      setTestResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão com Kommo'
      setTestResult({
        ok: false,
        status: 'error',
        message: msg,
        testedAt: new Date().toISOString(),
      })
    } finally {
      setTestingKommo(false)
    }
  }

  const handleSaveScoreWeights = async () => {
    setSavingConfig(true)
    try {
      await updateConfiguracao('pesos_score', pesos)
      await updateConfiguracao('motor_fila', motorFila)
      alert('Configurações do Motor de Fila e Pesos salvas com sucesso!')
    } catch (err) {
      console.error('Falha ao salvar configurações:', err)
      alert('Erro ao salvar configurações.')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSavePesosGamificacao = async () => {
    setSavingGamificacao(true)
    try {
      await updatePesosGamificacao(pesosGamificacao)
      alert('Pesos de pontuação da Gamificação salvos com sucesso!')
    } catch (err) {
      console.error('Falha ao salvar pesos de gamificação:', err)
      alert('Erro ao salvar pesos da gamificação.')
    } finally {
      setSavingGamificacao(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoEmail || !novoNome) return

    setIsCreatingUser(true)
    try {
      await pb.collection('users').create({
        email: novoEmail,
        password: 'Skip@Pass',
        passwordConfirm: 'Skip@Pass',
        name: novoNome,
        role: novoRole,
        regioes: novasRegioesSelected,
        emailVisibility: true,
      })

      setNovoEmail('')
      setNovoNome('')
      setNovasRegioesSelected(['POÇOS DE CALDAS'])
      loadUsers()
      alert('Usuário criado com sucesso! Senha inicial: Skip@Pass')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar usuário'
      alert(`Erro: ${msg}`)
    } finally {
      setIsCreatingUser(false)
    }
  }

  const toggleRegiaoNovoUser = (regName: string) => {
    setNovasRegioesSelected((prev) =>
      prev.includes(regName) ? prev.filter((r) => r !== regName) : [...prev, regName],
    )
  }

  const toggleRegiaoEditUser = (regName: string) => {
    setEditUserRegioes((prev) =>
      prev.includes(regName) ? prev.filter((r) => r !== regName) : [...prev, regName],
    )
  }

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u)
    setEditUserRegioes(u.regioes || [])
  }

  const handleSaveUserRegioes = async () => {
    if (!editingUser) return
    setSavingUserRegioes(true)
    try {
      await pb.collection('users').update(editingUser.id, {
        regioes: editUserRegioes,
      })
      alert(`Regiões de ${editingUser.name} atualizadas!`)
      setEditingUser(null)
      loadUsers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao atualizar regiões do usuário'
      alert(`Erro: ${msg}`)
    } finally {
      setSavingUserRegioes(false)
    }
  }

  const handleSaveRegiao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRegiao) return
    setSavingRegiao(true)
    try {
      await updateRegiao(editingRegiao.id, {
        nome: editingRegiao.nome,
        vendedor_externo: editingRegiao.vendedor_externo,
        especialista: editingRegiao.especialista,
        corporativo: editingRegiao.corporativo,
        construcao_civil: editingRegiao.construcao_civil,
        cidades_rota: editingRegiao.cidades_rota,
        municipios_potenciais: editingRegiao.municipios_potenciais,
        observacao: editingRegiao.observacao,
        ativo: editingRegiao.ativo,
      })
      alert(`Região ${editingRegiao.nome} salva com sucesso!`)
      setEditingRegiao(null)
      loadRegioesData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar região'
      alert(`Erro: ${msg}`)
    } finally {
      setSavingRegiao(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Configurações do Sistema
        </h2>
        <p className="text-xs text-slate-500">
          Integração Kommo CRM, pesos do motor de fila, questionário de qualificação e gestão de
          operadores.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="bases" className="text-xs font-medium flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <span>Bases de Referência</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-700">
              Admin
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="regioes" className="text-xs font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span>Regiões & Equipes Varejo</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="text-xs font-medium flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>Usuários & Atribuição de Regiões</span>
          </TabsTrigger>
          <TabsTrigger value="kommo" className="text-xs font-medium flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" />
            <span>Integração Kommo CRM</span>
          </TabsTrigger>
          <TabsTrigger value="motor" className="text-xs font-medium flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5" />
            <span>Pesos & Motor de Fila</span>
          </TabsTrigger>
          <TabsTrigger
            value="gamificacao"
            className="text-xs font-medium flex items-center gap-1.5"
          >
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            <span>Pontuação da Gamificação</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB NOVO: BASES DE REFERÊNCIA */}
        <TabsContent value="bases" className="space-y-4">
          <BasesReferenciaTab />
        </TabsContent>

        {/* TAB 0: REGIÕES & EQUIPES VAREJO */}
        <TabsContent value="regioes" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <span>Regiões de Atendimento, Rotas e Equipes do Varejo</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Estrutura oficial de cobertura comercial do atacado/varejo: cadastro de novos
                    vendedores externos, especialistas e corporativo
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-blue-400 text-blue-700 bg-blue-50 text-[11px] font-mono"
                >
                  8 Regiões Oficiais
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Observação oficial obrigatória */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2.5">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-semibold">Nota da Operação: </strong>
                  &ldquo;as cidades do atacado são uma referência comercial das principais praças de
                  cada DDD; a cobertura de cada DDD é mais ampla.&rdquo;
                </div>
              </div>

              {/* Tabela de Regiões e Equipes */}
              {loadingRegioes ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Carregando regiões e rotas...
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Região</th>
                        <th className="py-2.5 px-3">Vendedor Externo</th>
                        <th className="py-2.5 px-3">Especialista</th>
                        <th className="py-2.5 px-3">Corporativo</th>
                        <th className="py-2.5 px-3">Construção Civil</th>
                        <th className="py-2.5 px-3">Cidades da Rota</th>
                        <th className="py-2.5 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {regioes.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900">{r.nome}</span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-blue-700 font-mono">
                            {r.vendedor_externo || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-mono">
                            {r.especialista || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-mono">
                            {r.corporativo || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {r.construcao_civil ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono border-indigo-400 text-indigo-700 bg-indigo-50"
                              >
                                {r.construcao_civil}
                              </Badge>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs">
                            <div
                              className="text-[11px] text-slate-600 truncate"
                              title={(r.cidades_rota || []).join(', ')}
                            >
                              {(r.cidades_rota || []).join(', ')}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {(r.cidades_rota || []).length} cidades na rota
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingRegiao(r)}
                              className="h-7 text-xs text-blue-600 hover:text-blue-700"
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Informação sobre Construção Civil ARIANE */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Construção Civil (ARIANE): </strong>
                  Consta registrada na região de Cambuí por padrão conforme o layout original das
                  colunas, mas com atribuição regional pendente de confirmação. Você pode clicar em
                  &ldquo;Editar&rdquo; em qualquer região para realocar ou atualizar a vendedora.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 1: KOMMO CRM */}
        <TabsContent value="kommo" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                    <Key className="h-4 w-4 text-blue-600" />
                    <span>Status da Conexão com Kommo CRM</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Conexão segura via backend secrets (OAuth 2.0 / Long-lived Token)
                  </CardDescription>
                </div>

                <div>
                  {kommoStatus?.configured ? (
                    <Badge className="bg-emerald-600 text-white font-semibold flex items-center space-x-1">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                      <span>Secrets Configurados</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-700 bg-amber-50"
                    >
                      Aguardando Secrets
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Subdomínio Kommo:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {kommoStatus?.subdomain || 'Não configurado'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Origem das Credenciais:</span>
                  <span className="text-slate-700 font-mono">
                    Secrets do Backend (KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Taxa Limite API:</span>
                  <span className="text-slate-700 font-mono">
                    Até 7 requisições/segundo com buffer de debounce
                  </span>
                </div>
              </div>

              {testResult && (
                <Alert
                  className={
                    testResult.ok
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  )}
                  <AlertTitle className="text-xs font-bold">
                    {testResult.ok
                      ? 'Teste de Conexão Bem-Sucedido!'
                      : 'Falha na Conexão com a API'}
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {testResult.message}
                    {testResult.account && ` (Conta: ${testResult.account})`}
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-xs text-slate-500 bg-blue-50/70 p-3 rounded-lg border border-blue-200">
                <strong>Instruções de Integração:</strong> Os dados de autenticação da sua conta
                Kommo são lidos exclusivamente das variáveis seguras de ambiente do backend. Assim
                que você fornecer o seu <code>KOMMO_SUBDOMAIN</code> e o token{' '}
                <code>KOMMO_ACCESS_TOKEN</code> no painel do Skip Cloud, o status acima ficará verde
                automaticamente e a sincronização bidirecional de contatos, notas e tarefas será
                ativada.
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-100 pt-4">
              <span className="text-[11px] text-slate-400">
                Última checagem: {new Date().toLocaleTimeString('pt-BR')}
              </span>
              <Button
                onClick={handleTestKommo}
                disabled={testingKommo}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs"
              >
                {testingKommo ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Testando Conexão...
                  </>
                ) : (
                  'Testar Conexão com Kommo'
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 2: MOTOR DE FILA & PESOS */}
        <TabsContent value="motor" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                <Sliders className="h-4 w-4 text-blue-600" />
                <span>Pesos do Score e Regras de Priorização da Fila</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Ajuste os parâmetros matemáticos de ordenação dos contatos entregues aos operadores
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Modo de Ordenação */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-800">
                  Critério de Entrega da Fila Regional (Supervisor)
                </Label>
                <Select
                  value={motorFila.modo_criterio}
                  onValueChange={(val) => setMotorFila({ ...motorFila, modo_criterio: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modo_c">
                      Modo C — Score Ponderado com Bônus para Faixa 90+ dias (Recomendado)
                    </SelectItem>
                    <SelectItem value="modo_b">Modo B — Maior Score Puro de Recuperação</SelectItem>
                    <SelectItem value="modo_a">
                      Modo A — Maior Tempo sem Faturar (Mais Antigo Primeiro)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grid de Pesos do Score */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Recência (Inatividade)
                  </Label>
                  <Input
                    type="number"
                    value={pesos.recencia}
                    onChange={(e) =>
                      setPesos({ ...pesos, recencia: parseInt(e.target.value, 10) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: 30%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Frequência Histórica</Label>
                  <Input
                    type="number"
                    value={pesos.frequencia}
                    onChange={(e) =>
                      setPesos({ ...pesos, frequencia: parseInt(e.target.value, 10) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: 25%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Ticket / Tonelagem Média
                  </Label>
                  <Input
                    type="number"
                    value={pesos.ticket_tonelagem}
                    onChange={(e) =>
                      setPesos({ ...pesos, ticket_tonelagem: parseInt(e.target.value, 10) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: 20%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Segmento Estratégico</Label>
                  <Input
                    type="number"
                    value={pesos.segmento}
                    onChange={(e) =>
                      setPesos({ ...pesos, segmento: parseInt(e.target.value, 10) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: 10%</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Penalidade por Tentativas
                  </Label>
                  <Input
                    type="number"
                    value={pesos.tentativas_penalidade}
                    onChange={(e) =>
                      setPesos({
                        ...pesos,
                        tentativas_penalidade: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: 15% (desconto)</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Bônus Faixa 90+ Dias</Label>
                  <Input
                    type="number"
                    value={motorFila.bonus_faixa_90}
                    onChange={(e) =>
                      setMotorFila({
                        ...motorFila,
                        bonus_faixa_90: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">+20 pontos no Modo C</span>
                </div>
              </div>

              {/* Timeouts e Prazos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Timeout do Lock (Minutos)
                  </Label>
                  <Input
                    type="number"
                    value={motorFila.timeout_lock_minutos}
                    onChange={(e) =>
                      setMotorFila({
                        ...motorFila,
                        timeout_lock_minutos: parseInt(e.target.value, 10) || 30,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Libera cliente após abandono</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Limite de Tentativas "Sem Contato"
                  </Label>
                  <Input
                    type="number"
                    value={motorFila.limite_sem_contato}
                    onChange={(e) =>
                      setMotorFila({
                        ...motorFila,
                        limite_sem_contato: parseInt(e.target.value, 10) || 3,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Marca fone como inválido</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Quarentena Recusa (Dias)
                  </Label>
                  <Input
                    type="number"
                    value={motorFila.prazo_quarentena_dias}
                    onChange={(e) =>
                      setMotorFila({
                        ...motorFila,
                        prazo_quarentena_dias: parseInt(e.target.value, 10) || 90,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Prazo fora da fila</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-100 pt-4">
              <Button
                onClick={handleSaveScoreWeights}
                disabled={savingConfig}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingConfig ? 'Salvando...' : 'Salvar Pesos e Parâmetros'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 4: GAMIFICAÇÃO & PONTUAÇÃO */}
        <TabsContent value="gamificacao" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span>Pesos de Pontuação e Recompensas da Gamificação</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Configure quantos pontos os operadores recebem por cada ação registrada no
                    sistema
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-800 bg-amber-50 text-[11px] font-mono"
                >
                  100 Títulos no Catálogo
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2.5">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  Os pontos são somados on-the-fly para todos os operadores e supervisores,
                  refletindo diretamente no pódio e nos degraus de títulos da tela de{' '}
                  <strong>Ranking</strong>.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Reativação com Pedido (Conversão)
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.conversao_reativacao}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        conversao_reativacao: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono font-bold text-emerald-600"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: +150 pts (maior valor)</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Ficha de 17 Perguntas Preenchida
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.atendimento_formulario}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        atendimento_formulario: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono font-bold text-blue-600"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: +25 pts por formulário</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Reagendamento Qualificado
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.reagendamento_qualificado}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        reagendamento_qualificado: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono font-bold text-amber-600"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: +20 pts</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Ligação Realizada / Contato
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.atendimento_ligacao}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        atendimento_ligacao: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: +10 pts</span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Venda Perdida com Motivo
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.venda_perdida_com_motivo}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        venda_perdida_com_motivo: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400">
                    Padrão: +5 pts (alimenta inteligência)
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Pontos por Tonelada Faturada
                  </Label>
                  <Input
                    type="number"
                    value={pesosGamificacao.pontos_por_tonelada}
                    onChange={(e) =>
                      setPesosGamificacao({
                        ...pesosGamificacao,
                        pontos_por_tonelada: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono font-bold text-purple-600"
                  />
                  <span className="text-[10px] text-slate-400">Padrão: +5 pts por ton</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-100 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPesosGamificacao({ ...PESOS_GAMIFICACAO_PADRAO })}
                className="text-xs text-slate-600"
              >
                Restaurar Padrões
              </Button>
              <Button
                onClick={handleSavePesosGamificacao}
                disabled={savingGamificacao}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingGamificacao ? 'Salvando...' : 'Salvar Pesos da Gamificação'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 3: USUÁRIOS E PERMISSÕES */}
        <TabsContent value="usuarios" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span>Gestão de Operadores e Supervisores</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Atribuição de papéis (operador, supervisor, admin) e governança por região
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Card de Atalhos Rápidos para o Administrador */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs">
                <div>
                  <span className="font-semibold text-blue-900 block">Atribuição de Regiões</span>
                  <p className="text-slate-500 text-[11px]">
                    Defina abaixo ou clique em &ldquo;Editar Regiões&rdquo; em qualquer colaborador
                    da tabela.
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-blue-900 block">Vendedores e Equipes</span>
                  <p className="text-slate-500 text-[11px]">
                    Alocação por praça/rota na aba &ldquo;Regiões & Equipes Varejo&rdquo;.
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-blue-900 block">Upload de Base do ERP</span>
                  <p className="text-slate-500 text-[11px]">
                    Disponível no menu lateral &ldquo;Importação&rdquo; e na aba &ldquo;Bases de
                    Referência&rdquo;.
                  </p>
                </div>
              </div>

              {/* Formulário Novo Usuário */}
              <form
                onSubmit={handleCreateUser}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Cadastrar Novo Membro da Equipe / Vendedor
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Nome Completo</Label>
                    <Input
                      placeholder="Ex: João Silva"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">E-mail</Label>
                    <Input
                      type="email"
                      placeholder="joao@empresa.com.br"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Perfil de Acesso</Label>
                    <Select value={novoRole} onValueChange={(val: any) => setNovoRole(val)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operador">Operador (Atendimento)</SelectItem>
                        <SelectItem value="supervisor">Supervisor (Fila & Relatórios)</SelectItem>
                        <SelectItem value="admin">Administrador (Total)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2 md:col-span-4">
                    <Label className="text-xs text-slate-600">
                      Regiões Autorizadas (Selecione uma ou mais das 8 regiões oficiais)
                    </Label>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {REGIOES_PADRAO.map((r) => {
                        const isSelected = novasRegioesSelected.includes(r)
                        return (
                          <button
                            type="button"
                            key={r}
                            onClick={() => toggleRegiaoNovoUser(r)}
                            className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected && <Check className="inline h-3 w-3 mr-1" />}
                            {r}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    disabled={isCreatingUser}
                    size="sm"
                    className="bg-slate-900 text-white text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {isCreatingUser ? 'Criando...' : 'Adicionar Usuário'}
                  </Button>
                </div>
              </form>

              {/* Tabela de Usuários */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Nome</th>
                      <th className="py-2.5 px-3">E-mail</th>
                      <th className="py-2.5 px-3">Perfil</th>
                      <th className="py-2.5 px-3">Regiões Autorizadas</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{u.name}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">{u.email}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="uppercase font-mono text-[10px]">
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {u.regioes && u.regioes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.regioes.map((r) => (
                                <Badge
                                  key={r}
                                  variant="secondary"
                                  className="text-[10px] font-mono bg-slate-100 text-slate-700"
                                >
                                  {r}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Todas / Sem restrição</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditUser(u)}
                            className="h-7 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Editar Regiões
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL / DIALOG DE EDIÇÃO DE REGIÃO */}
      {editingRegiao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <MapPin className="h-4 w-4 text-blue-600" />
                <span>Editar Região: {editingRegiao.nome}</span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingRegiao(null)}
                className="h-7 text-xs text-slate-500"
              >
                Fechar
              </Button>
            </div>

            <form onSubmit={handleSaveRegiao} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Nome da Região</Label>
                  <Input
                    value={editingRegiao.nome}
                    onChange={(e) =>
                      setEditingRegiao({ ...editingRegiao, nome: e.target.value.toUpperCase() })
                    }
                    className="h-8 text-xs font-bold"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Vendedor Externo</Label>
                  <Input
                    value={editingRegiao.vendedor_externo || ''}
                    onChange={(e) =>
                      setEditingRegiao({
                        ...editingRegiao,
                        vendedor_externo: e.target.value.toUpperCase(),
                      })
                    }
                    className="h-8 text-xs font-mono font-semibold"
                    placeholder="Ex: ALESSANDRO"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Especialista</Label>
                  <Input
                    value={editingRegiao.especialista || ''}
                    onChange={(e) =>
                      setEditingRegiao({
                        ...editingRegiao,
                        especialista: e.target.value.toUpperCase(),
                      })
                    }
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: LEIZ"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">
                    Corporativo (ind trans / ind man)
                  </Label>
                  <Input
                    value={editingRegiao.corporativo || ''}
                    onChange={(e) =>
                      setEditingRegiao({
                        ...editingRegiao,
                        corporativo: e.target.value.toUpperCase(),
                      })
                    }
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: HELOA"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs text-slate-700">
                    Construção Civil (ex: ARIANE — deixe em branco se não aplicável nesta região)
                  </Label>
                  <Input
                    value={editingRegiao.construcao_civil || ''}
                    onChange={(e) =>
                      setEditingRegiao({
                        ...editingRegiao,
                        construcao_civil: e.target.value.toUpperCase(),
                      })
                    }
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: ARIANE"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-700">
                  Cidades da Rota (separadas por vírgula)
                </Label>
                <textarea
                  value={(editingRegiao.cidades_rota || []).join(', ')}
                  onChange={(e) =>
                    setEditingRegiao({
                      ...editingRegiao,
                      cidades_rota: e.target.value
                        .split(',')
                        .map((c) => c.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                  rows={3}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-700">
                  Municípios Potenciais (expansão até 100km e limítrofes)
                </Label>
                <textarea
                  value={editingRegiao.municipios_potenciais || ''}
                  onChange={(e) =>
                    setEditingRegiao({
                      ...editingRegiao,
                      municipios_potenciais: e.target.value.toUpperCase(),
                    })
                  }
                  rows={4}
                  className="w-full rounded-md border border-slate-300 p-2 text-[11px] font-mono text-slate-700"
                />
                <span className="text-[10px] text-slate-400">
                  Dica: mantenha o marcador &ldquo;— LIMÍTROFE —&rdquo; para cidades limítrofes
                  entre rotas.
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingRegiao(null)}
                  className="text-xs h-8"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingRegiao}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-medium"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {savingRegiao ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE REGIÕES DO USUÁRIO */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Regiões Autorizadas — {editingUser.name}
              </h3>
              <p className="text-xs text-slate-500">
                {editingUser.email} ({editingUser.role})
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-700">Selecione as regiões de atuação:</Label>
              <div className="grid grid-cols-2 gap-2">
                {REGIOES_PADRAO.map((r) => {
                  const isSelected = editUserRegioes.includes(r)
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => toggleRegiaoEditUser(r)}
                      className={`p-2 text-xs rounded-lg border text-left font-medium transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{r}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditUserRegioes([...REGIOES_PADRAO])}
                className="text-[11px] text-slate-600"
              >
                Marcar Todas
              </Button>
              <div className="space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                  className="text-xs h-8"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveUserRegioes}
                  disabled={savingUserRegioes}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-medium"
                >
                  {savingUserRegioes ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
