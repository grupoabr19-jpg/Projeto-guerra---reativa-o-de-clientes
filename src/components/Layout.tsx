import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
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
  MessagesSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/AuthContext'
import { checkKommoStatus, testKommoConnection } from '@/services/api'
import { fetchUnreadCounts } from '@/services/chat'
import pb from '@/lib/pocketbase/client'
import { ExpedienteStatusBadge } from '@/components/ExpedienteStatusBadge'
import { LogoAbr } from '@/components/LogoAbr'
import { usePresence } from '@/hooks/usePresence'
import { ChatWidget } from '@/components/ChatWidget'
import { UpdateBanner } from '@/components/UpdateBanner'
import { NotificacoesDropdown } from '@/components/NotificacoesDropdown'

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [kommoStatus, setKommoStatus] = useState<{
    configured: boolean
    connected: boolean
    subdomain: string
    status: string
    message: string
  } | null>(null)
  const [isCheckingKommo, setIsCheckingKommo] = useState(false)

  // Presença online em tempo real: batimento de quem está logado + contagem para admin e supervisor
  const { presenceData } = usePresence({ pollStatus: true })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [hubUnreadCount, setHubUnreadCount] = useState<number>(0)

  // Barra lateral esquerda retrátil (persistida em localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('guerra_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('guerra_sidebar_collapsed', String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

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
        connected: false,
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

  // Contagem dinâmica de mensagens não lidas para o CA - Comunicação Interna (para todos os usuários autenticados)
  useEffect(() => {
    if (!user) return

    const carregarUnread = async () => {
      try {
        const data = await fetchUnreadCounts()
        setHubUnreadCount(data.total_unread || 0)
      } catch {
        /* intentionally ignored */
      }
    }

    carregarUnread()
    const timer = setInterval(carregarUnread, 20000)

    // Inscrição realtime na coleção chat_mensagens para atualizar badge sem recarregar tela
    const unsubPromise = pb.collection('chat_mensagens').subscribe('*', () => {
      carregarUnread()
    })

    return () => {
      clearInterval(timer)
      unsubPromise.then((unsub) => unsub()).catch(() => {})
    }
  }, [user])

  if (!user && isPublicAuthPage) {
    return (
      <main className="min-h-screen bg-[#f4f6fa] flex flex-col justify-center relative overflow-hidden">
        {/* Grafismo proprietário: faixa/curva sutil institucional */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#253575]">
          <div className="h-full w-48 bg-[#F18800] rounded-r-full" />
        </div>
        <Outlet />
      </main>
    )
  }

  if (!user) {
    return null
  }

  // Definição de permissões de menu:
  // "CA - Comunicação Interna" é padrão para todos os perfis autenticados (sem selo Admin).
  // Operador vê: "Meu Painel", "Atendimento", "CA - Comunicação Interna" e "Ranking".
  // Líder de Rota vê: "Meu Painel", "Atendimento", "Equipe", "CA - Comunicação Interna" e "Ranking".
  // Supervisor e Admin mantêm seus acessos ampliados, com "CA - Comunicação Interna" para todos.

  const isLider = user.role === 'lider'
  const isOperador = user.role === 'operador' || !user.role

  const comunicacaoInternaItem = {
    title: 'CA - Comunicação Interna',
    href: '/ca-comunicacao-interna',
    icon: MessagesSquare,
    badgeCount: hubUnreadCount > 0 ? hubUnreadCount : undefined,
  }

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
        comunicacaoInternaItem,
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
          comunicacaoInternaItem,
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
          comunicacaoInternaItem,
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
          ...(hasRole(['supervisor', 'admin', 'lider'])
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
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const isCollapsed = !isMobile && sidebarCollapsed

    return (
      <div className="flex flex-col h-full bg-[#142758] text-white relative transition-all duration-300">
        {/* Detalhe superior da curva/grafismo laranja ABR */}
        <div className="h-1 w-full bg-[#253575] flex">
          <div className="h-full w-24 bg-[#F18800] rounded-r-full" />
        </div>

        {/* Brand Header com Logo Oficial */}
        <div
          className={`p-3.5 border-b border-[#253575]/80 flex items-center bg-[#112048] ${
            isCollapsed ? 'justify-center' : 'justify-between space-x-3'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative shrink-0">
              <LogoAbr
                className="h-9 w-9 rounded-lg object-contain shadow-md ring-1 ring-white/15 bg-[#253575]"
                alt="Grupo ABR — Seu parceiraço!"
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-sm tracking-tight text-white leading-tight">
                    GRUPO ABR
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[#F18800] bg-[#F18800]/15 px-1.5 py-0.2 rounded">
                    Guerra
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 truncate font-medium mt-0.5">
                  Sistema de Reativação
                </p>
              </div>
            )}
          </div>

          {/* Botão de colapsar sidebar no desktop */}
          {!isMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-[#F18800]" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isCollapsed ? 'Expandir barra lateral' : 'Recolher para apenas ícones'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Nav List */}
        <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {!isCollapsed && (
            <div className="text-[10px] uppercase font-bold text-slate-300/80 px-3 pb-2 tracking-wider">
              Menu Operacional
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.href ||
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href))

            const navLinkElement = (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`group flex items-center rounded-lg text-sm font-medium transition-all relative ${
                  isCollapsed ? 'justify-center p-2.5' : 'space-x-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-[#253575] text-white shadow-sm font-semibold'
                    : 'text-slate-200 hover:text-white hover:bg-white/10'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#F18800] rounded-r-full" />
                )}
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                    isActive ? 'text-[#F18800]' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!isCollapsed && <span className="truncate flex-1">{item.title}</span>}
                {'badgeCount' in item &&
                  typeof item.badgeCount === 'number' &&
                  item.badgeCount > 0 && (
                    <span
                      className={`h-5 min-w-5 px-1.5 rounded-full bg-[#F18800] text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-xs ${
                        isCollapsed ? 'absolute -top-1 -right-1 ring-2 ring-[#142758]' : ''
                      }`}
                      title={`${item.badgeCount} mensagens não lidas`}
                    >
                      {item.badgeCount > 99 ? '99+' : item.badgeCount}
                    </span>
                  )}
                {!isCollapsed && 'badgeText' in item && Boolean(item.badgeText) && (
                  <span className="text-[10px] uppercase font-bold text-[#F18800] bg-[#F18800]/15 border border-[#F18800]/30 px-1.5 py-0.2 rounded shrink-0">
                    {String(item.badgeText)}
                  </span>
                )}
              </NavLink>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{navLinkElement}</TooltipTrigger>
                  <TooltipContent side="right" className="font-semibold text-xs">
                    {item.title}
                    {'badgeCount' in item &&
                      typeof item.badgeCount === 'number' &&
                      item.badgeCount > 0 &&
                      ` (${item.badgeCount} não lidas)`}
                    {'badgeText' in item &&
                      Boolean(item.badgeText) &&
                      ` (${String(item.badgeText)})`}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return navLinkElement
          })}
        </div>

        {/* Curva ABR decorativa discreta no rodapé */}
        {!isCollapsed && (
          <div className="px-4 py-2 text-[10px] text-slate-300/80 flex items-center justify-between border-t border-[#253575]/60 bg-[#0f1d42]">
            <span className="truncate">Seu parceiraço! 2026–2027</span>
            <div className="w-6 h-1 rounded-full bg-[#F18800]" />
          </div>
        )}

        {/* User Info & Footer */}
        <div className="p-2.5 border-t border-[#253575] bg-[#0c1836]">
          <div
            className={`flex items-center ${
              isCollapsed ? 'justify-center flex-col gap-2' : 'justify-between'
            }`}
          >
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="relative shrink-0">
                <div className="h-8 w-8 rounded-full bg-[#253575] border border-white/20 flex items-center justify-center font-bold text-xs text-white">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : 'ABR'}
                </div>
                {/* Bolinha de status online do próprio usuário */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0c1836]"
                  title="Você está online"
                />
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                    <span>{user.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <Badge
                      variant="outline"
                      className={
                        user.role === 'lider'
                          ? 'text-[10px] px-1.5 py-0 h-4 border-[#F18800] bg-[#F18800]/20 text-orange-200 font-semibold flex items-center gap-1'
                          : 'text-[10px] px-1.5 py-0 h-4 border-[#253575] bg-[#142758] text-slate-200 uppercase font-mono'
                      }
                    >
                      {user.role === 'lider' ? '🚩 Líder de Rota' : user.role}
                    </Badge>
                    <span className="text-[10px] text-emerald-400 font-medium font-mono">
                      • Online
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="h-8 w-8 text-slate-300 hover:text-white hover:bg-red-500/20 shrink-0"
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
  }

  return (
    <div className="flex min-h-screen bg-[#f4f6fa] antialiased font-sans text-slate-800">
      {/* Desktop Fixed Sidebar (retrátil com largura 18 no modo colapsado e 64 no expandido) */}
      <aside
        className={`hidden lg:block border-r border-[#142758]/30 shrink-0 fixed inset-y-0 left-0 z-30 shadow-lg shadow-[#142758]/10 transition-all duration-300 ${
          sidebarCollapsed ? 'w-18' : 'w-64'
        }`}
      >
        <SidebarContent isMobile={false} />
      </aside>

      {/* Main Container */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          sidebarCollapsed ? 'lg:pl-18' : 'lg:pl-64'
        }`}
      >
        {/* Pulso de Atualização do Navegador: Banner discreto e fixo (Padrão ABR) */}
        <UpdateBanner />

        {/* Top Header com detalhe de borda institucional */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 h-16 flex items-center justify-between px-4 sm:px-6 shadow-sm">
          <div className="flex items-center space-x-3">
            {/* Mobile hamburger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-[#253575]">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 border-r-0">
                <SidebarContent isMobile={true} />
              </SheetContent>
            </Sheet>

            <div className="flex items-center space-x-2.5">
              <div className="h-5 w-1 bg-[#F18800] rounded-full hidden sm:block" />
              <span className="font-bold text-[#253575] text-base tracking-tight">
                {navItems.find((n) => location.pathname.startsWith(n.href))?.title ||
                  'Projeto Guerra'}
              </span>
              {user.regioes && user.regioes.length > 0 && (
                <Badge
                  variant="secondary"
                  className="hidden sm:inline-flex text-xs bg-[#253575]/10 text-[#253575] border border-[#253575]/20 font-medium"
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

            {/* Indicador de status do Expediente */}
            <ExpedienteStatusBadge showHorarioAtual className="hidden sm:inline-flex" />

            {/* Sininho discreto com Painel Efêmero de Notificações do Sistema (Lê e Some) */}
            <NotificacoesDropdown />

            {/* Contador discreto no Header para Admin / Supervisor */}
            {(user.role === 'admin' || user.role === 'supervisor') && presenceData && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={user.role === 'admin' ? '/configuracoes' : '/dashboard'}
                    className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-semibold">{presenceData.summary.online}</span>
                    <span className="text-[11px] text-emerald-700 hidden lg:inline">online</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-semibold text-slate-800">
                    {presenceData.summary.online} de {presenceData.summary.total} usuários online
                    agora
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {presenceData.summary.today} estiveram ativos hoje •{' '}
                    {presenceData.summary.offline} desconectados
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>

        {/* Chat Interno: Botão flutuante (FAB) e mini-painel popover/drawer para todos os usuários autenticados */}
        <ChatWidget />
      </div>
    </div>
  )
}
