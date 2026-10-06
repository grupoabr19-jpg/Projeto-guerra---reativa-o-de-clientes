import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Calendar,
  AlertTriangle,
  Trophy,
  Sun,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import {
  fetchNotificacoesEfemeras,
  marcarNotificacaoLida,
  descartarNotificacao,
  limparTodasNotificacoes,
} from '@/services/chat'
import type { NotificacaoSistema } from '@/types'
import { formatarDataHoraBrasilia } from '@/lib/expediente'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

/**
 * NotificacoesDropdown — Painel Efêmero de Notificações do Sistema ("Estilo Escondidinho").
 *
 * Características solicitadas pelo usuário:
 * 1. Fica discreto na topbar com um sininho e badge laranja de não lidas (nunca pop-up!).
 * 2. Ao clicar, abre um dropdown limpo e compacto com as notificações operacionais
 *    (follow-ups de hoje, atrasados, resumo 7h, parabenizações de ranking, cliente devolvido, etc.).
 * 3. Ao ler/clicar (ou ao clicar em "Abrir Ficha" / "Ver Atendimento"), a notificação SOME da lista.
 * 4. Botão "Limpar todas" para descartar em bloco.
 * 5. Conexão Realtime com a coleção `notificacoes_enviadas`.
 */
export function NotificacoesDropdown() {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [notificacoes, setNotificacoes] = useState<NotificacaoSistema[]>([])
  const [loading, setLoading] = useState(false)
  const [limpando, setLimpando] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const carregarNotificacoes = useCallback(async () => {
    if (!user) return
    try {
      const items = await fetchNotificacoesEfemeras(user.id)
      setNotificacoes(items)
    } catch (err) {
      console.warn('Erro ao carregar notificações efêmeras:', err)
    }
  }, [user])

  useEffect(() => {
    carregarNotificacoes()
  }, [carregarNotificacoes])

  // Realtime subscription na coleção notificacoes_enviadas
  useEffect(() => {
    if (!user) return

    let unsub: (() => void) | null = null

    pb.collection('notificacoes_enviadas')
      .subscribe('*', (e) => {
        const record = e.record as unknown as NotificacaoSistema
        // Se a notificação for para o usuário atual
        if (record.usuario === user.id) {
          if (e.action === 'create') {
            if (!record.descartada) {
              setNotificacoes((prev) => [record, ...prev.filter((n) => n.id !== record.id)])
            }
          } else if (e.action === 'update') {
            if (record.descartada) {
              setNotificacoes((prev) => prev.filter((n) => n.id !== record.id))
            } else {
              setNotificacoes((prev) => [record, ...prev.filter((n) => n.id !== record.id)])
            }
          } else if (e.action === 'delete') {
            setNotificacoes((prev) => prev.filter((n) => n.id !== record.id))
          }
        }
      })
      .then((u) => {
        unsub = u
      })
      .catch((err) => {
        console.warn('Falha ao subscrever notificações efêmeras:', err)
      })

    return () => {
      if (unsub) unsub()
    }
  }, [user])

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Descartar notificação individual (some da lista)
  const handleDescartar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    setNotificacoes((prev) => prev.filter((n) => n.id !== id))
    await descartarNotificacao(id)
  }

  // Marcar como lida e descartar ao interagir
  const handleItemClick = async (notif: NotificacaoSistema) => {
    setNotificacoes((prev) => prev.filter((n) => n.id !== notif.id))
    await marcarNotificacaoLida(notif.id, true)
  }

  // Limpar todas
  const handleLimparTodas = async () => {
    if (!user || limpando || notificacoes.length === 0) return
    setLimpando(true)
    setNotificacoes([])
    try {
      await limparTodasNotificacoes(user.id)
    } finally {
      setLimpando(false)
    }
  }

  const naoLidasCount = notificacoes.filter((n) => !n.lida).length

  // Helper de ícone e cor por categoria
  const getCategoriaInfo = (notif: NotificacaoSistema) => {
    const tipo = notif.tipo
    const dados = notif.dados as Record<string, unknown> | undefined

    if (tipo === 'followup_dia') {
      return {
        icon: Calendar,
        bg: 'bg-blue-500/10 text-[#253575]',
        border: 'border-blue-200',
        badge: 'Follow-up Hoje',
        badgeBg: 'bg-blue-100 text-[#253575]',
      }
    }
    if (tipo === 'followup_atrasado') {
      return {
        icon: AlertTriangle,
        bg: 'bg-rose-500/10 text-rose-600',
        border: 'border-rose-200',
        badge: 'Atrasado',
        badgeBg: 'bg-rose-100 text-rose-700 font-bold',
      }
    }
    if (tipo === 'ranking_conquista' || tipo === 'ranking_subida') {
      return {
        icon: Trophy,
        bg: 'bg-amber-500/10 text-amber-600',
        border: 'border-amber-200',
        badge: 'Conquista',
        badgeBg: 'bg-amber-100 text-amber-700',
      }
    }
    if (tipo === 'resumo_matinal') {
      return {
        icon: Sun,
        bg: 'bg-amber-500/10 text-amber-600',
        border: 'border-amber-200',
        badge: 'Resumo 7h',
        badgeBg: 'bg-amber-100 text-amber-800',
      }
    }
    return {
      icon: Bell,
      bg: 'bg-slate-500/10 text-slate-700',
      border: 'border-slate-200',
      badge: 'Sistema',
      badgeBg: 'bg-slate-100 text-slate-700',
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              setIsOpen((prev) => !prev)
              if (!isOpen) carregarNotificacoes()
            }}
            className="relative p-2 text-slate-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors focus:outline-hidden"
            aria-label="Notificações do Sistema"
          >
            <Bell className="h-5 w-5" />
            {notificacoes.length > 0 && (
              <span className="absolute 1 top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F18800] px-1 text-[10px] font-black text-white shadow-xs ring-2 ring-[#253575]">
                {notificacoes.length > 99 ? '99+' : notificacoes.length}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs bg-[#142758] text-white">
          {notificacoes.length > 0
            ? `${notificacoes.length} notificação(ões) do Sistema (estilo efêmero)`
            : 'Nenhuma nova notificação'}
        </TooltipContent>
      </Tooltip>

      {/* DROPDOWN / PAINEL EFÊMERO */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[80vh] bg-white rounded-xl shadow-2xl border border-slate-200/90 z-50 flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Topo do painel */}
          <div className="bg-[#142758] text-white p-3 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <div className="h-6 w-6 rounded-md bg-[#253575] flex items-center justify-center text-[#F18800]">
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white leading-none">
                  Notificações do Sistema
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5">
                  Lê e some • Foco na sua rotina diária
                </p>
              </div>
            </div>

            {notificacoes.length > 0 && (
              <button
                onClick={handleLimparTodas}
                disabled={limpando}
                className="text-[11px] font-medium text-amber-300 hover:text-white hover:underline transition-colors flex items-center space-x-1"
              >
                <CheckCheck className="h-3 w-3" />
                <span>{limpando ? 'Limpando...' : 'Limpar todas'}</span>
              </button>
            )}
          </div>

          {/* Lista com rolagem */}
          <div className="overflow-y-auto max-h-[420px] p-2 space-y-2 divide-y divide-slate-100">
            {notificacoes.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="font-semibold text-slate-700">Tudo em dia!</p>
                <p className="text-[11px] text-slate-500 max-w-[220px] mx-auto">
                  Nenhum follow-up pendente ou notificação acumulada no momento.
                </p>
              </div>
            ) : (
              notificacoes.map((item) => {
                const info = getCategoriaInfo(item)
                const IconComponent = info.icon
                const dados = (item.dados || {}) as Record<string, unknown>
                const cliId = item.cliente_id || (dados.cliente_id as string | undefined)

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="p-2.5 rounded-lg bg-slate-50/60 hover:bg-slate-100/90 border border-slate-200/60 transition-all cursor-pointer group space-y-1.5 pt-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <div
                          className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${info.bg}`}
                        >
                          <IconComponent className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md text-slate-700 bg-white border border-slate-200 shrink-0">
                          {info.badge}
                        </span>
                        <h4 className="font-bold text-xs text-slate-900 truncate">
                          {item.titulo || 'Aviso Operacional'}
                        </h4>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span className="text-[9px] text-slate-400 font-mono">
                          {formatarDataHoraBrasilia(item.created, { formatoCurto: true }).split(
                            'às',
                          )[1] || ''}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => handleDescartar(e, item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Marcar como lida e sumir"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-[10px]">
                            Dispensar notificação
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug whitespace-pre-wrap font-sans">
                      {item.texto}
                    </p>

                    {/* Ações contextuais de clique rápido */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 text-[10px]">
                      <span className="text-slate-400 italic text-[9px]">
                        Clique para dispensar
                      </span>
                      {cliId ? (
                        <Link
                          to={`/atendimento?cliente=${cliId}`}
                          onClick={() => {
                            setIsOpen(false)
                            handleItemClick(item)
                          }}
                          className="inline-flex items-center space-x-1 font-bold text-[#253575] hover:text-[#F18800] transition-colors"
                        >
                          <span>Abrir Atendimento</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      ) : item.tipo === 'ranking_conquista' || item.tipo === 'ranking_subida' ? (
                        <Link
                          to="/ranking"
                          onClick={() => {
                            setIsOpen(false)
                            handleItemClick(item)
                          }}
                          className="inline-flex items-center space-x-1 font-bold text-[#F18800] hover:text-[#d97b00] transition-colors"
                        >
                          <span>Ver Ranking</span>
                          <ChevronRight className="h-2.5 w-2.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
