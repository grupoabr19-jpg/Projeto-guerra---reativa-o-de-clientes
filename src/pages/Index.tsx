import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, KeyRound, Mail, ArrowRight, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/AuthContext'
import { LogoAbr } from '@/components/LogoAbr'

export default function Index() {
  const { login, user } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se já autenticado, vai para a tela adequada (operador vai direto para Meu Painel)
  React.useEffect(() => {
    if (user) {
      if (user.role === 'operador' || !user.role) {
        navigate('/meu-painel', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
      // O useEffect cuidará do redirecionamento
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'E-mail ou senha inválidos'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Preenchimento rápido para teste
  const fillSample = (roleEmail: string) => {
    setEmail(roleEmail)
    // Se for conta interna institucional da equipe @grupoabr.com.br, a senha é a padrão ABR@2026
    if (roleEmail.includes('@grupoabr.com.br')) {
      setPassword('ABR@2026')
    } else {
      setPassword('Skip@Pass')
    }
  }

  return (
    <div className="flex min-h-[90vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Hero com Logo Oficial Grupo ABR */}
        <div className="text-center space-y-3">
          <div className="inline-block relative">
            <LogoAbr
              className="h-20 w-20 rounded-2xl mx-auto shadow-xl shadow-[#253575]/25 ring-2 ring-[#253575]/20 object-contain bg-[#253575] p-1"
              alt="Grupo ABR — Seu parceiraço!"
            />
            {/* Grafismo curva de destaque */}
            <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-[#F18800] rounded-full ring-2 ring-white" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#253575]/10 text-[#253575] text-[11px] font-semibold tracking-wide uppercase mb-1">
              <span>Projeto Guerra</span>
              <span className="text-[#F18800]">•</span>
              <span>Grupo ABR</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#253575]">
              Sistema de Reativação de Clientes
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Estrutura para atender. Conhecimento para orientar. Agilidade para entregar.
            </p>
          </div>
        </div>

        {/* Login Card com Curva Proprietária no topo */}
        <Card className="border-slate-200/90 shadow-2xl shadow-[#253575]/10 overflow-hidden relative">
          {/* Faixa/Curva proprietária no topo do card */}
          <div className="h-1.5 w-full bg-[#253575] flex">
            <div className="h-full w-28 bg-[#F18800] rounded-r-full" />
          </div>

          <CardHeader className="space-y-1 pb-4 pt-5">
            <CardTitle className="text-lg font-bold text-[#253575]">Acessar Painel</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Entre com suas credenciais do Grupo ABR para gerenciar a fila ou supervisionar
              operações.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2 text-xs">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold text-[#253575]">
                  E-mail institucional (@grupoabr.com.br)
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#253575]/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@grupoabr.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 text-sm focus-visible:ring-[#253575]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-[#253575]">
                    Senha de acesso
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-[#253575] font-semibold hover:text-[#F18800] hover:underline transition-colors"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-[#253575]/60" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9 text-sm focus-visible:ring-[#253575]"
                  />
                </div>
              </div>

              <div className="bg-[#f4f6fa] border border-[#253575]/15 rounded-lg p-3 space-y-2 text-xs">
                <span className="font-semibold text-[#253575] block">Acessos de demonstração:</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-slate-300 hover:border-[#253575] hover:bg-white"
                    onClick={() => fillSample('thiago.almeida@grupoabr.com.br')}
                  >
                    Thiago (Admin)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-slate-300 hover:border-[#253575] hover:bg-white"
                    onClick={() => fillSample('pietra.leite@grupoabr.com.br')}
                  >
                    Pietra (Admin)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-slate-300 hover:border-[#253575] hover:bg-white"
                    onClick={() => fillSample('eder.bueno@grupoabr.com.br')}
                  >
                    Eder Bueno (Op)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-slate-300 hover:border-[#253575] hover:bg-white"
                    onClick={() => fillSample('priscila.faria@grupoabr.com.br')}
                  >
                    Priscila (Repesc.)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-slate-300 hover:border-[#253575] hover:bg-white"
                    onClick={() => fillSample('dyovana.silva@grupoabr.com.br')}
                  >
                    Dyovana (Jundiaí)
                  </Button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-2 pb-5">
              {/* CTA Oficial com Laranja ABR (#F18800) */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F18800] hover:bg-[#d97b00] text-white font-semibold text-sm shadow-md shadow-[#F18800]/25 h-11"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar no Sistema
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* System info */}
        <div className="text-center space-y-1 text-xs text-slate-500">
          <p className="font-medium text-[#253575]">Grupo ABR — Seu parceiraço!</p>
          <p className="text-[11px] text-slate-400">
            Protegido por Lock Atômico de Concorrência & Integração Kommo CRM
          </p>
        </div>
      </div>
    </div>
  )
}
