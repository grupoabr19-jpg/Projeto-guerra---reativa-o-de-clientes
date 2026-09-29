routerAdd(
  'GET',
  '/backend/v1/kommo/status',
  (e) => {
    try {
      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const clientId = $os.getenv('KOMMO_CLIENT_ID') || ''
      const clientSecret = $os.getenv('KOMMO_CLIENT_SECRET') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''

      const isConfigured = Boolean(subdomain && (accessToken || (clientId && clientSecret)))

      return e.json(200, {
        configured: isConfigured,
        subdomain: subdomain ? `${subdomain}.kommo.com` : 'Não configurado',
        hasAccessToken: Boolean(accessToken),
        hasOAuth: Boolean(clientId && clientSecret),
        status: isConfigured ? 'configured' : 'missing_secrets',
        message: isConfigured
          ? 'Secrets do Kommo detectados no backend.'
          : 'Nenhum secret do Kommo configurado ainda (KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN ou KOMMO_CLIENT_ID / KOMMO_CLIENT_SECRET).',
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
