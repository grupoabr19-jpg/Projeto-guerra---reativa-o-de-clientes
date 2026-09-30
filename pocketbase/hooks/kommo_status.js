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

      let currentCfg = null
      let currentVal = {}
      try {
        currentCfg = $app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
        if (currentCfg) currentVal = currentCfg.get('valor') || {}
      } catch (_) {}

      // Executa verificação se houver secrets e ainda não tiver inspecionado com sucesso
      if (sub && tok && !currentVal.inspecao) {
        try {
          const accRes = $http.send({
            url: `${baseUrl}/api/v4/account?with=amojo_id,version`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const pipRes = $http.send({
            url: `${baseUrl}/api/v4/leads/pipelines`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const usersRes = $http.send({
            url: `${baseUrl}/api/v4/users?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const contactFieldsRes = $http.send({
            url: `${baseUrl}/api/v4/contacts/custom_fields?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const leadFieldsRes = $http.send({
            url: `${baseUrl}/api/v4/leads/custom_fields?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const compRes = $http.send({
            url: `${baseUrl}/api/v4/companies?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const contactsCountRes = $http.send({
            url: `${baseUrl}/api/v4/contacts?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const leadsCountRes = $http.send({
            url: `${baseUrl}/api/v4/leads?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const accData = accRes.json || {}
          const pipelines = (pipRes.json?._embedded?.pipelines || []).map((p) => ({
            id: p.id,
            name: p.name,
            is_main: p.is_main,
            sort: p.sort,
            statuses: (p._embedded?.statuses || []).map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              sort: s.sort,
            })),
          }))
          const users = (usersRes.json?._embedded?.users || []).map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            is_active: u.rights?.is_active,
          }))
          const contactFields = (contactFieldsRes.json?._embedded?.custom_fields || []).map(
            (f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              code: f.code,
            }),
          )
          const leadFields = (leadFieldsRes.json?._embedded?.custom_fields || []).map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            code: f.code,
          }))
          const reativacaoPipeline = pipelines.find((p) => p.name.toLowerCase().includes('reativa'))

          if (currentCfg) {
            currentVal = Object.assign({}, currentVal, {
              ultimo_teste_ok: accRes.statusCode >= 200 && accRes.statusCode < 300,
              ultimo_sync: new Date().toISOString(),
              inspecao: {
                http_status: accRes.statusCode,
                account_id: accData.id,
                account_name: accData.name,
                subdomain: accData.subdomain,
                country: accData.country,
                currency: accData.currency,
                created_at: accData.created_at,
                pipelines_count: pipelines.length,
                pipelines: pipelines,
                users_count: users.length,
                users: users,
                contact_fields_count: contactFields.length,
                contact_fields: contactFields,
                lead_fields_count: leadFields.length,
                lead_fields: leadFields,
                has_companies:
                  (compRes.statusCode === 200 && compRes.json?._embedded?.companies?.length > 0) ||
                  false,
                has_contacts:
                  (contactsCountRes.statusCode === 200 &&
                    contactsCountRes.json?._embedded?.contacts?.length > 0) ||
                  false,
                has_leads:
                  (leadsCountRes.statusCode === 200 &&
                    leadsCountRes.json?._embedded?.leads?.length > 0) ||
                  false,
                has_reativacao_pipeline: Boolean(reativacaoPipeline),
                reativacao_pipeline: reativacaoPipeline || null,
                secret_checks: {
                  field_origin: $os.getenv('KOMMO_FIELD_ORIGIN') || '',
                  field_segment: $os.getenv('KOMMO_FIELD_SEGMENT') || '',
                  field_temperature: $os.getenv('KOMMO_FIELD_TEMPERATURE') || '',
                  pipeline_excluir_liderancas:
                    $os.getenv('KOMMO_PIPELINE_EXCLUIR_LIDERANCAS') || '',
                  stage_excluir_comunicacao:
                    $os.getenv('KOMMO_STAGE_EXCLUIR_COMUNICACAO_INTERNA') || '',
                  status_id_comunicacao_interna:
                    $os.getenv('KOMMO_STATUS_ID_COMUNICACAO_INTERNA') || '',
                },
              },
            })
            currentCfg.set('valor', currentVal)
            $app.save(currentCfg)
          }
        } catch (eInspecao) {
          console.error('Falha ao rodar inspeção automática:', eInspecao.message)
        }
      }

      const isConfigured = Boolean(sub && (tok || (clientId && clientSecret)))

      // Buscar status do último teste em configuracoes
      let inspecao = currentVal.inspecao || null
      let ultimoTesteOk = Boolean(currentVal.ultimo_teste_ok)
      let ultimoSync = currentVal.ultimo_sync || null
      if (!inspecao) {
        try {
          const configRec = $app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
          if (configRec) {
            const val = configRec.get('valor') || {}
            inspecao = val.inspecao || null
            ultimoTesteOk = Boolean(val.ultimo_teste_ok)
            ultimoSync = val.ultimo_sync || null
          }
        } catch (_) {}
      }

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
