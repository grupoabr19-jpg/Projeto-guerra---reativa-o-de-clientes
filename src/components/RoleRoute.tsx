import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'

interface RoleRouteProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
  fallbackPath?: string
}

/**
 * Guarda de rota baseada em papéis (roles).
 * - Se o usuário não estiver autenticado, redireciona para a raiz "/"
 * - Se for operador tentando acessar uma rota não permitida, redireciona estritamente para "/meu-painel"
 * - Para outros papéis sem permissão, redireciona para o fallbackPath (padrão: "/dashboard")
 */
export function RoleRoute({ children, allowedRoles, fallbackPath }: RoleRouteProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  const role = user.role || 'operador'

  if (!allowedRoles.includes(role)) {
    // Regra estrita de negócio do Projeto Guerra:
    // Operador e Líder de rota tentando acessar rotas administrativas proibidas caem em /meu-painel
    const destination =
      role === 'operador' || role === 'lider' ? '/meu-painel' : fallbackPath || '/dashboard'
    return <Navigate to={destination} replace />
  }

  return <>{children}</>
}
