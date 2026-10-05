/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_status.js
 *
 * Diagnóstico de conexão e status do Kommo CRM:
 * GET /backend/v1/kommo/status
 *
 * Exclusivo para administradores.
 * Informa:
 * - Credenciais configuradas (sim/não)
 * - Modo somente-leitura (desativado / ativado)
 * - Telefone monitorado da linha SDR ((35) 99770-9232)
 * - Teste de ping contra a API do Kommo
 * - URL do Webhook a ser colada no Kommo
 */

const { getKommoConfig, getKommoHeaders, KOMMO_SDR_PHONE_TARGET } = require(
  `${__hooks}/kommo_client.js`,
)

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

      const cfg = getKommoConfig()
      let pingOk = false
      let pingLatencyMs = 0
      let pingError = ''

      if (cfg.isConfigured) {
        const start = Date.now()
        try {
          const res = $http.send({
            url: `${cfg.baseUrl}/api/v4/account`,
            method: 'GET',
            headers: getKommoHeaders(cfg.accessToken),
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

      // Descobrir total de conversas WhatsApp SDR locais
      let totalConversasSdr = 0
      try {
        const total = $app.countRecords('chat_conversas', "tipo = 'kommo_whatsapp'")
        totalConversasSdr = total
      } catch (_) {}

      return e.json(200, {
        ok: true,
        configured: cfg.isConfigured,
        somente_leitura: cfg.isReadonly,
        escrita_habilitada: !cfg.isReadonly,
        subdomain: cfg.subdomain,
        sdr_phone: KOMMO_SDR_PHONE_TARGET,
        sdr_phone_formatted: '(35) 99770-9232',
        webhook_endpoint: '/backend/v1/kommo/webhook',
        ping_ok: pingOk,
        ping_latency_ms: pingLatencyMs,
        ping_error: pingError,
        total_conversas_sdr: totalConversasSdr,
        checado_em: new Date().toISOString(),
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
