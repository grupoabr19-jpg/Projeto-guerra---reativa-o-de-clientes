import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileSpreadsheet,
  ListOrdered,
  Headphones,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  RefreshCw,
  Activity,
  Trophy,
  Flag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/AuthContext'
import { checkKommoStatus, testKommoConnection } from '@/services/api'

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [kommoStatus, setKommoStatus] = useState<{
    configured: boolean
    connected?: boolean
    subdomain: string
    status: string
    message: string
  } | null>(null)
  const [isCheckingKommo, setIsCheckingKommo] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isPublicAuthPage = [
    '/',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/confirm-email-change',
  ].includes(location.pathname)

  useEffect(() => {
    if (!user && !isPublicAuthPage) {
      navigate('/')
    }
  }, [user, isPublicAuthPage, navigate])

  const refreshKommo = async () => {
    if (!user) return
    setIsCheckingKommo(true)
    try {
      const status = await checkKommoStatus()
      setKommoStatus(status)
    } catch {
      setKommoStatus({
        configured: false,
        subdomain: '',
        status: 'error',
        message: 'Falha ao checar status do Kommo',
      })
    } finally {
      setIsCheckingKommo(false)
    }
  }

  useEffect(() => {
    if (user) {
      refreshKommo()
      // Não dispara testKommoConnection() automaticamente a cada montagem para evitar chamadas externas pesadas
      const interval = setInterval(refreshKommo, 120000)
      return () => clearInterval(interval)
    }
  }, [user])

  if (!user && isPublicAuthPage) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col justify-center">
        <Outlet />
      </main>
    )
  }

  if (!user) {
    return null
  }

  // Definição estrita de permissões de menu:
  // Operador vê SOMENTE: "Meu Painel", "Atendimento" e "Ranking".
  // Líder de Rota vê: "Meu Painel", "Atendimento", "Equipe" (novo) e "Ranking".
  // NÃO vê outras rotas, NÃO vê Importação, NÃO vê Configurações, NÃO vê a fila geral nem a lista de Clientes.
  // Supervisor e Admin mantêm seus acessos ampliados.

  const isLider = user.role === 'lider'
  const isOperador = user.role === 'operador' || !user.role

  const navItems = isOperador
    ? [
        {
          title: 'Meu Painel',
          href: '/meu-painel',
          icon: Activity,
        },
        {
          title: 'Atendimento',
          href: '/atendimento',
          icon: Headphones,
        },
        {
          title: 'Ranking',
          href: '/ranking',
          icon: Trophy,
        },
      ]
    : isLider
      ? [
          {
            title: 'Meu Painel',
            href: '/meu-painel',
            icon: Activity,
          },
          {
            title: 'Atendimento',
            href: '/atendimento',
            icon: Headphones,
          },
          {
            title: 'Equipe',
            href: '/equipe',
            icon: Flag,
          },
          {
            title: 'Ranking',
            href: '/ranking',
            icon: Trophy,
          },
        ]
      : [
          ...(hasRole(['supervisor', 'admin'])
            ? [
                {
                  title: 'Dashboard',
                  href: '/dashboard',
                  icon: LayoutDashboard,
                },
              ]
            : []),
          ...(hasRole('admin')
            ? [
                {
                  title: 'Importação',
                  href: '/importacao',
                  icon: FileSpreadsheet,
                },
              ]
            : []),
          {
            title: 'Fila de Atendimento',
            href: '/fila',
            icon: ListOrdered,
          },
          {
            title: 'Atendimento',
            href: '/atendimento',
            icon: Headphones,
          },
          {
            title: 'Clientes',
            href: '/clientes',
            icon: Users,
          },
          {
            title: 'Ranking',
            href: '/ranking',
            icon: Trophy,
          },
          ...(hasRole(['supervisor', 'admin'])
            ? [
                {
                  title: 'Relatórios',
                  href: '/relatorios',
                  icon: BarChart3,
                },
              ]
            : []),
          ...(hasRole('admin')
            ? [
                {
                  title: 'Configurações',
                  href: '/configuracoes',
                  icon: Settings,
                },
              ]
            : []),
        ]

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold tracking-tight shadow-md shadow-blue-500/20">
            PG
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white uppercase">Projeto Guerra</h1>
            <p className="text-[11px] text-slate-400">Reativação de Clientes</p>
          </div>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="text-[10px] uppercase font-semibold text-slate-400 px-3 pb-2 tracking-wider">
          Menu Operacional
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            location.pathname === item.href ||
            (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </NavLink>
          )
        })}
      </div>

      {/* User Info & Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center font-semibold text-xs text-slate-200">
              {user.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-slate-200 truncate">{user.name}</div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <Badge
                  variant="outline"
                  className={
                    user.role === 'lider'
                      ? 'text-[10px] px-1.5 py-0 h-4 border-amber-600 bg-amber-950/40 text-amber-300 font-semibold flex items-center gap-1'
                      : 'text-[10px] px-1.5 py-0 h-4 border-slate-700 text-slate-400 uppercase font-mono'
                  }
                >
                  {user.role === 'lider' ? '🚩 Líder de Rota' : user.role}
                </Badge>
              </div>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair do sistema</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50 antialiased font-sans">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 border-r border-slate-200 shrink-0 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-3">
            {/* Mobile hamburger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-slate-600">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-800 text-base">
                {navItems.find((n) => location.pathname.startsWith(n.href))?.title ||
                  'Projeto Guerra'}
              </span>
              {user.regioes && user.regioes.length > 0 && (
                <Badge
                  variant="secondary"
                  className="hidden sm:inline-flex text-xs bg-slate-100 text-slate-600"
                >
                  Regiões: {user.regioes.join(', ')}
                </Badge>
              )}
            </div>
          </div>

          {/* Right Header Status Bar */}
          <div className="flex items-center space-x-3">
            {/* Kommo CRM Status indicator */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  onClick={refreshKommo}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors text-xs"
                >
                  <span className="font-medium text-slate-600">Kommo CRM:</span>
                  {isCheckingKommo ? (
                    <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                  ) : kommoStatus?.connected ? (
                    <span className="flex items-center text-emerald-600 font-semibold space-x-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Conectado</span>
                    </span>
                  ) : kommoStatus?.configured ? (
                    <span className="flex items-center text-blue-600 font-medium space-x-1">
                      <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      <span>Secrets OK</span>
                    </span>
                  ) : (
                    <span className="flex items-center text-amber-600 font-medium space-x-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      <span>Aguardando Secrets</span>
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {kommoStatus?.message ||
                  'Clique para verificar status da integração com a API do Kommo.'}
              </TooltipContent>
            </Tooltip>

            {/* Fuso / Expediente Info */}
            <div className="hidden md:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
              <span>Expediente: 08h às 18h (BRT)</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
