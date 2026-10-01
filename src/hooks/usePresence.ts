import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { sendPresenceHeartbeat, fetchPresenceStatus } from '@/services/api'
import type { PresenceStatusResponse, PresenceStatusType } from '@/types'
import { formatarDataHoraBrasilia, getBrasiliaMidnight } from '@/lib/expediente'

const HEARTBEAT_INTERVAL_MS = 60 * 1000 // 60 segundos
const STATUS_POLL_INTERVAL_MS = 30 * 1000 // 30 segundos para admin/supervisor quando ativo

/**
 * Calcula o status derivado localmente a partir de um last_seen (ISO string ou Date).
 * Regras:
 * - 🟢 Online: last_seen nos últimos 5 minutos
 * - 🟡 Esteve on hoje: last_seen entre 00:00 de Brasília de hoje e 5 minutos atrás
 * - ⚪ Desconectado: anterior a hoje de Brasília ou ausente
 */
export function derivePresenceStatus(lastSeenInput?: string | Date | null): {
  status: PresenceStatusType
  label: string
  colorClass: string
  dotClass: string
  borderClass: string
  badgeBgClass: string
  lastSeenFormatted: string
  tooltip: string
} {
  if (!lastSeenInput) {
    return {
      status: 'offline',
      label: 'Desconectado',
      colorClass: 'text-slate-400',
      dotClass: 'bg-slate-300 ring-slate-200',
      borderClass: 'border-slate-200',
      badgeBgClass: 'bg-slate-50 text-slate-600 border-slate-200',
      lastSeenFormatted: 'Nunca visto',
      tooltip: 'Usuário nunca registrou atividade recente no sistema',
    }
  }

  const date = typeof lastSeenInput === 'string' ? new Date(lastSeenInput) : lastSeenInput
  const timeMs = date.getTime()
  if (isNaN(timeMs)) {
    return {
      status: 'offline',
      label: 'Desconectado',
      colorClass: 'text-slate-400',
      dotClass: 'bg-slate-300 ring-slate-200',
      borderClass: 'border-slate-200',
      badgeBgClass: 'bg-slate-50 text-slate-600 border-slate-200',
      lastSeenFormatted: 'Data inválida',
      tooltip: 'Sem registro de data válido',
    }
  }

  const nowMs = Date.now()
  const diffMs = nowMs - timeMs
  const FIVE_MIN_MS = 5 * 60 * 1000
  const midnightBrtMs = getBrasiliaMidnight(new Date()).getTime()

  const formattedTime = formatarDataHoraBrasilia(date, { incluirHora: true })
  const formattedHourOnly =
    formatarDataHoraBrasilia(date, { incluirHora: true, formatoCurto: true })
      .split('às')[1]
      ?.trim() || ''

  if (diffMs <= FIVE_MIN_MS && diffMs >= -60000) {
    return {
      status: 'online',
      label: 'Online',
      colorClass: 'text-emerald-700 font-semibold',
      dotClass: 'bg-emerald-500 ring-emerald-200 animate-pulse',
      borderClass: 'border-emerald-200',
      badgeBgClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      lastSeenFormatted: formattedTime,
      tooltip: `Online agora (visto por último em ${formattedTime})`,
    }
  }

  if (timeMs >= midnightBrtMs) {
    return {
      status: 'today',
      label: formattedHourOnly ? `Esteve on hoje às ${formattedHourOnly}` : 'Esteve on hoje',
      colorClass: 'text-amber-700 font-medium',
      dotClass: 'bg-amber-400 ring-amber-200',
      borderClass: 'border-amber-200',
      badgeBgClass: 'bg-amber-50 text-amber-800 border-amber-300',
      lastSeenFormatted: formattedTime,
      tooltip: `Esteve conectado hoje (visto por último em ${formattedTime})`,
    }
  }

  return {
    status: 'offline',
    label: 'Desconectado',
    colorClass: 'text-slate-500',
    dotClass: 'bg-slate-300 ring-slate-200',
    borderClass: 'border-slate-200',
    badgeBgClass: 'bg-slate-50 text-slate-600 border-slate-200',
    lastSeenFormatted: formattedTime,
    tooltip: `Desconectado (visto por último em ${formattedTime})`,
  }
}

/**
 * Hook para gerenciar o batimento contínuo de presença do usuário logado
 * e permitir que admin/supervisor consultem a presença de todos.
 */
export function usePresence(options?: { pollStatus?: boolean }) {
  const { user } = useAuth()
  const [presenceData, setPresenceData] = useState<PresenceStatusResponse | null>(null)
  const [loadingPresence, setLoadingPresence] = useState(false)
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<Date | null>(null)
  const pollStatus = Boolean(
    options?.pollStatus && (user?.role === 'admin' || user?.role === 'supervisor'),
  )

  const heartbeatRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)

  // Disparo do heartbeat
  const triggerHeartbeat = useCallback(async () => {
    if (!user) return
    const res = await sendPresenceHeartbeat()
    if (res.ok) {
      setLastHeartbeatAt(new Date())
    }
  }, [user])

  // Busca do status da equipe
  const refreshPresenceStatus = useCallback(async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) return
    setLoadingPresence(true)
    try {
      const data = await fetchPresenceStatus()
      setPresenceData(data)
    } catch (err) {
      console.warn('Falha ao carregar status de presença:', err)
    } finally {
      setLoadingPresence(false)
    }
  }, [user])

  // 1. Loop de Heartbeat enquanto autenticado
  useEffect(() => {
    if (!user) return

    // Imediato ao montar/logar
    triggerHeartbeat()

    // Intervalo de ~60 segundos
    heartbeatRef.current = window.setInterval(() => {
      // Disparar somente se a aba estiver ativa ou periodicamente
      triggerHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)

    // Opcional: disparar também quando o usuário foca na aba após inatividade
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, triggerHeartbeat])

  // 2. Loop de polling de presença para admin/supervisor se solicitado
  useEffect(() => {
    if (!pollStatus) return

    refreshPresenceStatus()

    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshPresenceStatus()
      }
    }, STATUS_POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollStatus, refreshPresenceStatus])

  return {
    presenceData,
    loadingPresence,
    lastHeartbeatAt,
    triggerHeartbeat,
    refreshPresenceStatus,
  }
}
