routerAdd(
  'GET',
  '/backend/v1/kommo/status',
  (e) => {
    try {
      const sub = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const tok = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const clientId = $os.getenv('KOMMO_CLIENT_ID') || ''
      const clientSecret = $os.getenv('KOMMO_CLIENT_SECRET') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
      const fieldOrigin = $os.getenv('KOMMO_FIELD_ORIGIN') || ''
      const fieldSegment = $os.getenv('KOMMO_FIELD_SEGMENT') || ''
      const fieldTemperature = $os.getenv('KOMMO_FIELD_TEMPERATURE') || ''

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${sub}.kommo.com`

      let currentVal = {}
      try {
        const currentCfg = $app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
        if (currentCfg) {
          const raw = currentCfg.get('valor')
          if (raw && typeof raw === 'object') {
            currentVal = raw
          } else if (typeof raw === 'string') {
            try {
              currentVal = JSON.parse(raw)
            } catch (_) {
              currentVal = {}
            }
          }
        }
      } catch (_) {}

      const isConfigured = Boolean(sub && (tok || (clientId && clientSecret)))

      // Buscar status do último teste salvo em configuracoes (sem disparar chamadas HTTP externas durante o polling de status)
      const inspecao = currentVal.inspecao || null
      const ultimoTesteOk = Boolean(currentVal.ultimo_teste_ok)
      const ultimoSync = currentVal.ultimo_sync || null

      return e.json(200, {
        configured: isConfigured,
        connected: ultimoTesteOk || Boolean(tok && sub),
        subdomain: sub ? `${sub}.kommo.com` : 'Não configurado',
        hasAccessToken: Boolean(tok),
        hasOAuth: Boolean(clientId && clientSecret),
        hasCustomFieldSecrets: Boolean(fieldOrigin || fieldSegment || fieldTemperature),
        status:
          ultimoTesteOk || (tok && sub)
            ? 'connected'
            : isConfigured
              ? 'configured'
              : 'missing_secrets',
        message:
          ultimoTesteOk || (tok && sub)
            ? 'Conexão ativa com a API do Kommo. Token e credenciais configurados no backend.'
            : isConfigured
              ? 'Secrets do Kommo detectados no backend. Clique em Testar Conexão para validar.'
              : 'Nenhum secret do Kommo configurado ainda (KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN ou KOMMO_CLIENT_ID / KOMMO_CLIENT_SECRET).',
        inspecao: inspecao,
        ultimoSync: ultimoSync,
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  // Sem requireAuth estrito para permitir que polling no frontend ou healthcheck funcione suavemente
)
