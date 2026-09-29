import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'

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

            {/* Authenticated Operational Routes */}
            <Route path="/meu-painel" element={<MeuPainelPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/importacao" element={<ImportacaoPage />} />
            <Route path="/fila" element={<FilaPage />} />
            <Route path="/atendimento" element={<AtendimentoPage />} />
            <Route path="/atendimento/:clientId" element={<AtendimentoPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/relatorios" element={<RelatoriosPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
