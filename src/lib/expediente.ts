/**
 * Utilitários de Expediente e Fuso Horário de Brasília (America/Sao_Paulo).
 *
 * Regras da equipe:
 * - Expediente: 07:00 às 17:00 (horário de Brasília)
 * - Dias de expediente: Segunda a Sexta-feira (dias úteis)
 * - Fuso oficial: America/Sao_Paulo
 */

export const FUSO_HORARIO_BRASILIA = 'America/Sao_Paulo'
export const EXPEDIENTE_HORA_INICIO = 7
export const EXPEDIENTE_HORA_FIM = 17

export interface BrasiliaDateTimeParts {
  year: number
  month: number // 1..12
  day: number // 1..31
  hour: number // 0..23
  minute: number // 0..59
  second: number // 0..59
  dayOfWeek: number // 0 (Dom) .. 6 (Sab)
}

/**
 * Retorna as partes de uma data decompostas segundo o fuso America/Sao_Paulo.
 */
export function getBrasiliaParts(date: Date = new Date()): BrasiliaDateTimeParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_HORARIO_BRASILIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })

  const parts = dtf.formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) {
    map[p.type] = p.value
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? 0,
  }
}

/**
 * Retorna a data no formato 'YYYY-MM-DD' segundo o horário de Brasília.
 */
export function getBrasiliaDateStr(date: Date = new Date()): string {
  const p = getBrasiliaParts(date)
  const y = p.year
  const m = String(p.month).padStart(2, '0')
  const d = String(p.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Constrói uma data ISO precisa correspondente a (ano, mês, dia, hora, minuto)
 * em America/Sao_Paulo.
 */
export function createBrasiliaDate(
  year: number,
  month: number, // 1..12
  day: number,
  hour: number,
  minute = 0,
): Date {
  // Cria em UTC primeiro e compensa a diferença do fuso America/Sao_Paulo
  // No horário padrão de Brasília o offset é UTC-3.
  // Usamos aproximação iterativa exata com Intl para evitar qualquer desvio de DST ou histórico:
  const baseUtc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0, 0))
  const parts = getBrasiliaParts(baseUtc)
  const hourDiff = hour - parts.hour
  const dayDiff = day - parts.day
  const correctedMs = baseUtc.getTime() + (dayDiff * 24 + hourDiff) * 60 * 60 * 1000
  return new Date(correctedMs)
}

/**
 * Informa se um determinado momento cai dentro do expediente (Seg-Sex, 07:00 às 17:00 BRT).
 */
export function isDentroDoExpediente(date: Date = new Date()): boolean {
  const p = getBrasiliaParts(date)
  // Fim de semana (0=Dom, 6=Sáb)
  if (p.dayOfWeek === 0 || p.dayOfWeek === 6) {
    return false
  }
  // Antes das 7:00
  if (p.hour < EXPEDIENTE_HORA_INICIO) {
    return false
  }
  // A partir das 17:00 (17:00 em ponto encerra o expediente)
  if (p.hour >= EXPEDIENTE_HORA_FIM) {
    return false
  }
  return true
}

/**
 * Ajusta qualquer data/hora para o primeiro momento útil dentro do expediente:
 * - Se já estiver dentro do expediente (Seg-Sex, 7h-17h BRT), mantém intacto.
 * - Se for dia útil antes das 7h: ajusta para o mesmo dia às 7h00.
 * - Se for dia útil a partir das 17h: ajusta para o próximo dia útil às 7h00.
 * - Se for sábado ou domingo: ajusta para a próxima segunda-feira às 7h00.
 */
export function ajustarParaExpediente(date: Date): {
  dataAjustada: Date
  foiAjustado: boolean
  motivoAjuste?: string
} {
  const p = getBrasiliaParts(date)

  // Caso 1: Fim de semana
  if (p.dayOfWeek === 0 || p.dayOfWeek === 6) {
    const diasParaSegunda = p.dayOfWeek === 6 ? 2 : 1
    const proximaSegunda = new Date(date.getTime() + diasParaSegunda * 24 * 60 * 60 * 1000)
    const pSeg = getBrasiliaParts(proximaSegunda)
    const ajustada = createBrasiliaDate(pSeg.year, pSeg.month, pSeg.day, EXPEDIENTE_HORA_INICIO, 0)
    return {
      dataAjustada: ajustada,
      foiAjustado: true,
      motivoAjuste:
        'Data caía no fim de semana. Ajustada para a próxima segunda-feira às 07:00 (início do expediente).',
    }
  }

  // Caso 2: Dia útil antes das 7:00
  if (p.hour < EXPEDIENTE_HORA_INICIO) {
    const ajustada = createBrasiliaDate(p.year, p.month, p.day, EXPEDIENTE_HORA_INICIO, 0)
    return {
      dataAjustada: ajustada,
      foiAjustado: true,
      motivoAjuste:
        'Horário anterior às 07:00. Ajustado para o início do expediente de hoje às 07:00.',
    }
  }

  // Caso 3: Dia útil a partir das 17:00
  if (p.hour >= EXPEDIENTE_HORA_FIM) {
    // Se hoje é sexta (5), próximo dia útil é segunda (+3 dias)
    const diasAdicionar = p.dayOfWeek === 5 ? 3 : 1
    const proxDia = new Date(date.getTime() + diasAdicionar * 24 * 60 * 60 * 1000)
    const pProx = getBrasiliaParts(proxDia)
    const ajustada = createBrasiliaDate(
      pProx.year,
      pProx.month,
      pProx.day,
      EXPEDIENTE_HORA_INICIO,
      0,
    )
    return {
      dataAjustada: ajustada,
      foiAjustado: true,
      motivoAjuste: `Horário após às 17:00. Ajustado para o próximo dia útil às 07:00.`,
    }
  }

  // Já está dentro do expediente
  return {
    dataAjustada: date,
    foiAjustado: false,
  }
}

/**
 * Retorna uma sugestão padrão de data/hora de reagendamento para input HTML datetime-local:
 * - Se agora estiver no expediente, sugere o momento atual + 2 horas (ou 16:30 se passar de 17h)
 * - Se estiver fora do expediente, sugere o próximo início de expediente (07:00)
 * Formato retornado: 'YYYY-MM-DDTHH:mm'
 */
export function getSugestaoReagendamentoHtml(): string {
  const agora = new Date()
  const p = getBrasiliaParts(agora)

  let targetDate: Date
  if (isDentroDoExpediente(agora)) {
    // Adiciona 2 horas
    const daqui2h = new Date(agora.getTime() + 2 * 60 * 60 * 1000)
    const p2 = getBrasiliaParts(daqui2h)
    if (p2.hour >= EXPEDIENTE_HORA_FIM) {
      // Limita a 16:30 de hoje
      targetDate = createBrasiliaDate(p.year, p.month, p.day, 16, 30)
    } else {
      targetDate = daqui2h
    }
  } else {
    // Próximo início de expediente
    targetDate = ajustarParaExpediente(agora).dataAjustada
  }

  const pFinal = getBrasiliaParts(targetDate)
  const y = pFinal.year
  const m = String(pFinal.month).padStart(2, '0')
  const d = String(pFinal.day).padStart(2, '0')
  const hh = String(pFinal.hour).padStart(2, '0')
  const mm = String(pFinal.minute).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}`
}

/**
 * Formata uma data para exibição em português com horário de Brasília.
 */
export function formatarDataHoraBrasilia(
  dateInput?: string | Date | null,
  opcoes?: { incluirHora?: boolean; formatoCurto?: boolean },
): string {
  if (!dateInput) return '—'
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return '—'

  const incluirHora = opcoes?.incluirHora !== false
  const p = getBrasiliaParts(date)
  const d = String(p.day).padStart(2, '0')
  const m = String(p.month).padStart(2, '0')
  const y = p.year
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')

  if (opcoes?.formatoCurto) {
    return incluirHora ? `${d}/${m} às ${hh}:${mm}` : `${d}/${m}`
  }

  return incluirHora ? `${d}/${m}/${y} às ${hh}:${mm}` : `${d}/${m}/${y}`
}
