import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { RoleRoute } from '@/components/RoleRoute'

// Pages
import Index from '@/pages/Index'
import Dashboard from '@/pages/Dashboard'
import ImportacaoPage from '@/pages/Importacao'
import FilaPage from '@/pages/Fila'
import AtendimentoPage from '@/pages/Atendimento'
import ClientesPage from '@/pages/Clientes'
import RelatoriosPage from '@/pages/Relatorios'
import ConfiguracoesPage from '@/pages/Configuracoes'
import MeuPainelPage from '@/pages/MeuPainel'
import RankingPage from '@/pages/Ranking'
import { ForgotPassword, ResetPassword, VerifyEmail } from '@/pages/AuthPages'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            {/* Public Auth Routes */}
            <Route path="/" element={<Index />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Rotas Operacionais Autorizadas */}
            {/* Operador: vê /meu-painel, /atendimento e agora /ranking (gamificação e posição pessoal) */}
            <Route
              path="/meu-painel"
              element={
                <RoleRoute allowedRoles={['operador', 'supervisor', 'admin']}>
                  <MeuPainelPage />
                </RoleRoute>
              }
            />
            <Route
              path="/atendimento"
              element={
                <RoleRoute allowedRoles={['operador', 'supervisor', 'admin']}>
                  <AtendimentoPage />
                </RoleRoute>
              }
            />
            <Route
              path="/atendimento/:clientId"
              element={
                <RoleRoute allowedRoles={['operador', 'supervisor', 'admin']}>
                  <AtendimentoPage />
                </RoleRoute>
              }
            />
            <Route
              path="/ranking"
              element={
                <RoleRoute allowedRoles={['operador', 'supervisor', 'admin']}>
                  <RankingPage />
                </RoleRoute>
              }
            />

            {/* Rotas restritas para Supervisor e Admin (Operador é bloqueado e redirecionado para /meu-painel) */}
            <Route
              path="/dashboard"
              element={
                <RoleRoute allowedRoles={['supervisor', 'admin']}>
                  <Dashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/fila"
              element={
                <RoleRoute allowedRoles={['supervisor', 'admin']}>
                  <FilaPage />
                </RoleRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <RoleRoute allowedRoles={['supervisor', 'admin']}>
                  <ClientesPage />
                </RoleRoute>
              }
            />
            <Route
              path="/relatorios"
              element={
                <RoleRoute allowedRoles={['supervisor', 'admin']}>
                  <RelatoriosPage />
                </RoleRoute>
              }
            />

            {/* Rotas exclusivas de Administrador (Operador é redirecionado para /meu-painel) */}
            <Route
              path="/importacao"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <ImportacaoPage />
                </RoleRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <RoleRoute allowedRoles={['admin']}>
                  <ConfiguracoesPage />
                </RoleRoute>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
