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
} from '@/services/api'
import pb from '@/lib/pocketbase/client'
import type { User, Configuracao } from '@/types'

export default function ConfiguracoesPage() {
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

  // Motor da Fila
  const [motorFila, setMotorFila] = useState({
    modo_criterio: 'modo_c',
    bonus_faixa_90: 20,
    timeout_lock_minutos: 30,
    limite_sem_contato: 3,
    prazo_quarentena_dias: 90,
  })

  // Usuários
  const [usersList, setUsersList] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Novo Usuário Form
  const [novoEmail, setNovoEmail] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoRole, setNovoRole] = useState<'operador' | 'supervisor' | 'admin'>('operador')
  const [novasRegioes, setNovasRegioes] = useState('Sudeste')
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    loadSettings()
    loadUsers()
  }, [])

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
    } catch (err) {
      console.error('Erro ao carregar configurações:', err)
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
        regioes: novasRegioes.split(',').map((r) => r.trim()),
        emailVisibility: true,
      })

      setNovoEmail('')
      setNovoNome('')
      loadUsers()
      alert('Usuário criado com sucesso! Senha inicial: Skip@Pass')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar usuário'
      alert(`Erro: ${msg}`)
    } finally {
      setIsCreatingUser(false)
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

      <Tabs defaultValue="kommo" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="kommo" className="text-xs font-medium">
            Integração Kommo CRM
          </TabsTrigger>
          <TabsTrigger value="motor" className="text-xs font-medium">
            Pesos & Motor de Fila
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="text-xs font-medium">
            Usuários & Regiões
          </TabsTrigger>
        </TabsList>

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
              {/* Formulário Novo Usuário */}
              <form
                onSubmit={handleCreateUser}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
              >
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Cadastrar Novo Membro da Equipe
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
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">
                      Regiões (Separadas por vírgula)
                    </Label>
                    <Input
                      placeholder="Ex: Sudeste, Sul"
                      value={novasRegioes}
                      onChange={(e) => setNovasRegioes(e.target.value)}
                      className="h-8 text-xs"
                    />
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
                          {u.regioes && u.regioes.length > 0
                            ? u.regioes.join(', ')
                            : 'Todas / Geral'}
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
    </div>
  )
}
