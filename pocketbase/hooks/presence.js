/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook de presença e heartbeat do sistema Projeto Guerra.
 *
 * Endpoints:
 * - POST /backend/v1/presence/heartbeat : Atualiza last_seen do usuário autenticado
 *   (idempotente, sem spam de log, suporta chamadas a cada ~60s)
 * - GET  /backend/v1/presence/status    : Retorna lista de usuários com status derivado
 *   (🟢 Online, 🟡 Esteve on hoje, ⚪ Desconectado), acessível somente por admin e supervisor
 */

// 1. Heartbeat — Qualquer usuário autenticado
routerAdd(
  'POST',
  '/backend/v1/presence/heartbeat',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const nowIso = new Date().toISOString()
      // Atualização direta e rápida via SQL para não disparar hooks desnecessários nem spam
      $app
        .db()
        .newQuery('UPDATE users SET last_seen = {:now} WHERE id = {:id}')
        .bind({
          now: nowIso,
          id: authRecord.id,
        })
        .execute()

      return e.json(200, {
        ok: true,
        last_seen: nowIso,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha no heartbeat: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)

// 2. Leitura do status de presença — Exclusivo Admin / Supervisor
routerAdd(
  'GET',
  '/backend/v1/presence/status',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const role = authRecord.getString('role')
      if (role !== 'admin' && role !== 'supervisor') {
        return e.json(403, {
          error: 'Acesso restrito a administradores e supervisores',
        })
      }

      // Buscar todos os usuários do sistema
      const records = $app.findRecordsByFilter('users', '', 'name', 500, 0)

      const now = new Date()
      const nowMs = now.getTime()
      const FIVE_MIN_MS = 5 * 60 * 1000

      // Calcular meia-noite de hoje no horário de Brasília (UTC-3)
      // Brasilia = UTC - 3h (180 min)
      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const nowBrasiliaMs = nowMs + brasiliaOffsetMs
      const dBrasilia = new Date(nowBrasiliaMs)

      // Início do dia em Brasília expresso em UTC absoluto
      const y = dBrasilia.getUTCFullYear()
      const m = dBrasilia.getUTCMonth()
      const d = dBrasilia.getUTCDate()
      const midnightBrasiliaUtcMs = Date.UTC(y, m, d, 3, 0, 0, 0) // 00:00 BRT = 03:00 UTC

      const usersPresence = []
      let onlineCount = 0
      let todayCount = 0
      let offlineCount = 0

      for (let i = 0; i < records.length; i++) {
        const u = records[i]
        const id = u.id
        const name = (u.getString('name') || '').trim() || (u.getString('email') || '').trim()
        const email = u.getString('email') || ''
        const userRole = u.getString('role') || 'operador'

        let regioes = []
        try {
          const slice = u.getStringSlice('regioes')
          if (slice && slice.length > 0) {
            regioes = slice
          } else {
            const raw = u.getString('regioes')
            if (raw && raw.trim().startsWith('[')) {
              regioes = JSON.parse(raw)
            } else {
              const rawGet = u.get('regioes')
              if (Array.isArray(rawGet)) {
                regioes = rawGet
              }
            }
          }
        } catch (_) {}

        // Obter last_seen como string ISO ou date
        const lastSeenRaw = u.getString('last_seen')
        let status = 'offline' // 'online' | 'today' | 'offline'
        let statusLabel = 'Desconectado'
        let lastSeenIso = null

        if (lastSeenRaw && lastSeenRaw.trim() !== '') {
          lastSeenIso = lastSeenRaw
          const lastSeenDate = new Date(lastSeenRaw)
          const lastSeenMs = lastSeenDate.getTime()

          if (!isNaN(lastSeenMs)) {
            if (nowMs - lastSeenMs <= FIVE_MIN_MS) {
              status = 'online'
              statusLabel = 'Online'
              onlineCount++
            } else if (lastSeenMs >= midnightBrasiliaUtcMs) {
              status = 'today'
              statusLabel = 'Esteve on hoje'
              todayCount++
            } else {
              status = 'offline'
              statusLabel = 'Desconectado'
              offlineCount++
            }
          } else {
            offlineCount++
          }
        } else {
          offlineCount++
        }

        usersPresence.push({
          id: id,
          name: name,
          email: email,
          role: userRole,
          regioes: regioes,
          last_seen: lastSeenIso,
          status: status,
          status_label: statusLabel,
        })
      }

      // Ordenar por prioridade de presença: online primeiro, depois today, depois offline
      const statusOrder = { online: 0, today: 1, offline: 2 }
      usersPresence.sort((a, b) => {
        const orderDiff = statusOrder[a.status] - statusOrder[b.status]
        if (orderDiff !== 0) return orderDiff
        return a.name.localeCompare(b.name)
      })

      return e.json(200, {
        summary: {
          total: records.length,
          online: onlineCount,
          today: todayCount,
          offline: offlineCount,
        },
        users: usersPresence,
        checked_at: now.toISOString(),
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha ao consultar presença: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
