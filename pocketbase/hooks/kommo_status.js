routerAdd('GET', '/backend/v1/kommo/status', (e) => {
  try {
    const sub = $os.getenv('KOMMO_SUBDOMAIN') || ''
    const tok = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
    const clientId = $os.getenv('KOMMO_CLIENT_ID') || ''
    const clientSecret = $os.getenv('KOMMO_CLIENT_SECRET') || ''
    const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
    const fieldOrigin = $os.getenv('KOMMO_FIELD_ORIGIN') || ''
    const fieldSegment = $os.getenv('KOMMO_FIELD_SEGMENT') || ''
    const fieldTemperature = $os.getenv('KOMMO_FIELD_TEMPERATURE') || ''

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

    const inspecao = currentVal.inspecao || null
    const ultimoTesteOk = Boolean(currentVal.ultimo_teste_ok)
    const ultimoSync = currentVal.ultimo_sync || null

    return e.json(200, {
      configured: isConfigured,
      connected: ultimoTesteOk || Boolean(tok && sub),
      mode: 'readonly',
      mode_label: 'Somente Leitura (Cruzamento com Planilhas)',
      somente_leitura: true,
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
          ? 'Modo Somente Leitura ativo: dados do Kommo disponíveis para consulta e cruzamento com planilhas. Nenhuma alteração é gravada no CRM.'
          : isConfigured
            ? 'Secrets do Kommo detectados no backend. Clique em Testar Conexão para validar.'
            : 'Nenhum secret do Kommo configurado ainda (KOMMO_SUBDOMAIN, KOMMO_ACCESS_TOKEN).',
      inspecao: inspecao,
      ultimoSync: ultimoSync,
    })
  } catch (err) {
    return e.json(200, {
      configured: false,
      connected: false,
      mode: 'readonly',
      somente_leitura: true,
      subdomain: 'Não configurado',
      status: 'error',
      message: `Falha ao verificar status: ${err.message}`,
    })
  }
})
