import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Mail, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
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
import pb from '@/lib/pocketbase/client'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await pb.collection('users').requestPasswordReset(email)
      setSent(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao solicitar recuperação'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl shadow-slate-200/50">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold text-slate-800">
            Recuperação de Senha
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Informe seu e-mail institucional para receber o link seguro de redefinição.
          </CardDescription>
        </CardHeader>
        {sent ? (
          <CardContent className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs space-y-2 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
              <p className="font-semibold">Instruções enviadas com sucesso!</p>
              <p className="text-slate-600">
                Verifique sua caixa de entrada no e-mail informado ({email}).
              </p>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  E-mail institucional
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white text-xs"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  'Enviar Link de Redefinição'
                )}
              </Button>
            </CardFooter>
          </form>
        )}
        <div className="p-4 pt-0 text-center">
          <Link
            to="/"
            className="text-xs text-blue-600 hover:underline flex items-center justify-center"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Voltar para o Login
          </Link>
        </div>
      </Card>
    </div>
  )
}

export function ResetPassword() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (t) setToken(t)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('As senhas digitadas não conferem.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, confirm)
      setDone(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao redefinir senha'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-800">Criar Nova Senha</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Digite a nova senha para sua conta
          </CardDescription>
        </CardHeader>
        {done ? (
          <CardContent className="space-y-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
            <p className="text-xs font-semibold text-emerald-800">Senha alterada com sucesso!</p>
            <Link to="/" className="inline-block">
              <Button size="sm" className="bg-blue-600 text-white text-xs">
                Ir para o Login
              </Button>
            </Link>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
              {!token && (
                <div className="space-y-1">
                  <Label className="text-xs">Token de Confirmação</Label>
                  <Input value={token} onChange={(e) => setToken(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Nova Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirme a Nova Senha</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white text-xs"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  'Confirmar Nova Senha'
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}

export function VerifyEmail() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      pb.collection('users')
        .confirmVerification(token)
        .then(() => setStatus('success'))
        .catch(() => setStatus('error'))
    } else {
      setStatus('error')
    }
  }, [])

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center p-6 space-y-4">
        {status === 'loading' && <p className="text-xs text-slate-500">Verificando e-mail...</p>}
        {status === 'success' && (
          <div className="space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">E-mail verificado com sucesso!</h3>
            <Link to="/">
              <Button size="sm" className="bg-blue-600 text-white text-xs mt-2">
                Acessar Login
              </Button>
            </Link>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-red-600">Token de verificação inválido ou expirado.</p>
            <Link to="/">
              <Button variant="outline" size="sm" className="text-xs">
                Voltar
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}
