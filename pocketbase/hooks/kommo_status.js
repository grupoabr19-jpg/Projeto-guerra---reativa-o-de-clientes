/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_status.js
 *
 * Diagnóstico de conexão e status do Kommo CRM:
 * GET /backend/v1/kommo/status
 *
 * Exclusivo para administradores.
 */

routerAdd(
  'GET',
  '/backend/v1/kommo/status',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }
      if (authRecord.getString('role') !== 'admin') {
        return e.json(403, { error: 'Acesso restrito ao administrador.' })
      }

      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
      const isReadonly = true // Modo somente leitura restaurado

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : subdomain
          ? `https://${subdomain}.kommo.com`
          : ''

      const isConfigured = Boolean(subdomain && accessToken)
      let pingOk = false
      let pingLatencyMs = 0
      let pingError = ''

      if (isConfigured) {
        const start = Date.now()
        try {
          const res = $http.send({
            url: `${baseUrl}/api/v4/account`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 5,
          })
          pingLatencyMs = Date.now() - start
          if (res && res.statusCode >= 200 && res.statusCode < 300) {
            pingOk = true
          } else {
            pingError = `HTTP ${res ? res.statusCode : 0}`
          }
        } catch (httpErr) {
          pingError = httpErr.message
        }
      }

      return e.json(200, {
        ok: true,
        configured: isConfigured,
        somente_leitura: true,
        escrita_habilitada: false,
        subdomain: subdomain,
        ping_ok: pingOk,
        ping_latency_ms: pingLatencyMs,
        ping_error: pingError,
        checado_em: new Date().toISOString(),
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
