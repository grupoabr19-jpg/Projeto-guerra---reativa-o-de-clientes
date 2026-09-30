import React, { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { isDentroDoExpediente, getBrasiliaParts } from '@/lib/expediente'

interface ExpedienteStatusBadgeProps {
  className?: string
  showHorarioAtual?: boolean
}

export function ExpedienteStatusBadge({
  className = '',
  showHorarioAtual = false,
}: ExpedienteStatusBadgeProps) {
  const [dentro, setDentro] = useState<boolean>(() => isDentroDoExpediente())
  const [horaStr, setHoraStr] = useState<string>(() => {
    const p = getBrasiliaParts()
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setDentro(isDentroDoExpediente())
      const p = getBrasiliaParts()
      setHoraStr(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)
    }, 15000) // atualiza a cada 15 segundos

    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      title="Expediente oficial da equipe: Segunda a Sexta, das 07:00 às 17:00 (Horário de Brasília)"
    >
      <Badge
        variant="outline"
        className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 transition-colors ${
          dentro
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            dentro ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
          }`}
        />
        <Clock className="h-3 w-3 text-current opacity-70" />
        <span>{dentro ? 'Dentro do expediente' : 'Fora do expediente (7h–17h)'}</span>
        {showHorarioAtual && (
          <span className="font-mono text-[10px] text-slate-500 pl-1 border-l border-slate-200">
            {horaStr} BRT
          </span>
        )}
      </Badge>
    </div>
  )
}
