routerAdd(
  'POST',
  '/backend/v1/kommo/test',
  (e) => {
    const authRecord = e.auth
    if (!authRecord || !authRecord.id) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }
    const userRole = authRecord.getString('role')
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      return e.json(403, { error: 'Acesso restrito ao administrador ou supervisor.' })
    }

    try {
      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          status: 'error',
          mode: 'readonly',
          message:
            'Credenciais ausentes: configure KOMMO_SUBDOMAIN e KOMMO_ACCESS_TOKEN nas variáveis de ambiente do backend.',
          testedAt: new Date().toISOString(),
        })
      }

      // Leitura dos secrets de mapeamento para validação cruzada
      const fieldOriginSecret = $os.getenv('KOMMO_FIELD_ORIGIN') || ''
      const fieldSegmentSecret = $os.getenv('KOMMO_FIELD_SEGMENT') || ''
      const fieldTempSecret = $os.getenv('KOMMO_FIELD_TEMPERATURE') || ''
      const pipelineExcluirSecret = $os.getenv('KOMMO_PIPELINE_EXCLUIR_LIDERANCAS') || ''
      const statusIdComunSecret = $os.getenv('KOMMO_STATUS_ID_COMUNICACAO_INTERNA') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${subdomain}.kommo.com`

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      // Teste otimizado e seguro:
      // Executa apenas chamadas essenciais com timeout curto (6 segundos) para nunca ultrapassar o timeout do gateway do servidor
      // 1. GET /api/v4/account
      let accRes
      try {
        accRes = $http.send({
          url: `${baseUrl}/api/v4/account?with=amojo_id,version`,
          method: 'GET',
          headers: headers,
          timeout: 6,
        })
      } catch (httpErr) {
        return e.json(200, {
          ok: false,
          status: 'timeout',
          mode: 'readonly',
          message: `Tempo limite esgotado ao contatar Kommo (${baseUrl}): ${httpErr.message}`,
          testedAt: new Date().toISOString(),
        })
      }

      if (!accRes || accRes.statusCode < 200 || accRes.statusCode >= 300) {
        const code = accRes ? accRes.statusCode : 0
        return e.json(200, {
          ok: false,
          status: 'error',
          mode: 'readonly',
          statusCode: code,
          message: `Falha na autenticação Kommo (HTTP ${code}): Verifique se o token de acesso (KOMMO_ACCESS_TOKEN) expirou ou se o subdomínio '${subdomain}' está correto.`,
          testedAt: new Date().toISOString(),
          errorBody: accRes ? accRes.json || accRes.raw : null,
        })
      }

      const accData = accRes.json || {}

      // 2. GET /api/v4/leads/pipelines (com timeout de 5 segundos)
      let pipelines = []
      try {
        const pipRes = $http.send({
          url: `${baseUrl}/api/v4/leads/pipelines`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        const pipelinesRaw =
          (pipRes && pipRes.json && pipRes.json._embedded && pipRes.json._embedded.pipelines) || []
        pipelines = pipelinesRaw.map((p) => {
          const stagesRaw = (p && p._embedded && p._embedded.statuses) || []
          return {
            id: p.id,
            name: p.name,
            is_main: p.is_main,
            sort: p.sort,
            statuses: stagesRaw.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              sort: s.sort,
            })),
          }
        })
      } catch (_) {}

      // 3. GET /api/v4/users (timeout 5s)
      let users = []
      try {
        const usersRes = $http.send({
          url: `${baseUrl}/api/v4/users?limit=50`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        const usersRaw =
          (usersRes && usersRes.json && usersRes.json._embedded && usersRes.json._embedded.users) ||
          []
        users = usersRaw.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }))
      } catch (_) {}

      // 4. GET /api/v4/contacts/custom_fields
      let contactFields = []
      try {
        const contactFieldsRes = $http.send({
          url: `${baseUrl}/api/v4/contacts/custom_fields?limit=50`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        const contactFieldsRaw =
          (contactFieldsRes &&
            contactFieldsRes.json &&
            contactFieldsRes.json._embedded &&
            contactFieldsRes.json._embedded.custom_fields) ||
          []
        contactFields = contactFieldsRaw.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          code: f.code,
        }))
      } catch (_) {}

      // 5. GET /api/v4/leads/custom_fields
      let leadFields = []
      try {
        const leadFieldsRes = $http.send({
          url: `${baseUrl}/api/v4/leads/custom_fields?limit=50`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        const leadFieldsRaw =
          (leadFieldsRes &&
            leadFieldsRes.json &&
            leadFieldsRes.json._embedded &&
            leadFieldsRes.json._embedded.custom_fields) ||
          []
        leadFields = leadFieldsRaw.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          code: f.code,
        }))
      } catch (_) {}

      // Análise cruzada dos secrets configurados vs objetos encontrados no Kommo
      const allFields = contactFields.concat(leadFields)
      const secretChecks = {
        subdomain: {
          configuredValue: subdomain,
          accountMatches: accData.subdomain === subdomain,
        },
        fieldOrigin: {
          secretValue: fieldOriginSecret,
          foundInKommo: allFields.some(
            (f) => String(f.id) === String(fieldOriginSecret) || f.code === fieldOriginSecret,
          ),
          matchingField:
            allFields.find(
              (f) => String(f.id) === String(fieldOriginSecret) || f.code === fieldOriginSecret,
            ) || null,
        },
        fieldSegment: {
          secretValue: fieldSegmentSecret,
          foundInKommo: allFields.some(
            (f) => String(f.id) === String(fieldSegmentSecret) || f.code === fieldSegmentSecret,
          ),
          matchingField:
            allFields.find(
              (f) => String(f.id) === String(fieldSegmentSecret) || f.code === fieldSegmentSecret,
            ) || null,
        },
        fieldTemperature: {
          secretValue: fieldTempSecret,
          foundInKommo: allFields.some(
            (f) => String(f.id) === String(fieldTempSecret) || f.code === fieldTempSecret,
          ),
          matchingField:
            allFields.find(
              (f) => String(f.id) === String(fieldTempSecret) || f.code === fieldTempSecret,
            ) || null,
        },
        pipelineExcluirLiderancas: {
          secretValue: pipelineExcluirSecret,
          foundInKommo: pipelines.some((p) => String(p.id) === String(pipelineExcluirSecret)),
          matchingPipeline:
            pipelines.find((p) => String(p.id) === String(pipelineExcluirSecret)) || null,
        },
        statusIdComunicacaoInterna: {
          secretValue: statusIdComunSecret,
          foundInKommo: pipelines.some((p) =>
            p.statuses.some((s) => String(s.id) === String(statusIdComunSecret)),
          ),
        },
      }

      // Procurar se existe um funil chamado "Reativação"
      const reativacaoPipeline = pipelines.find((p) => p.name.toLowerCase().includes('reativa'))

      const inspectionResult = {
        ok: true,
        status: 'connected',
        mode: 'readonly',
        mode_label: 'Somente Leitura (Consulta e Cruzamento)',
        message:
          'Conexão estabelecida com sucesso! Modo Somente Leitura ativo para cruzamento de dados sem upload.',
        testedAt: new Date().toISOString(),
        account: {
          id: accData.id,
          name: accData.name,
          subdomain: accData.subdomain,
          country: accData.country,
          currency: accData.currency,
          created_at: accData.created_at,
          current_user_id: accData.current_user_id,
        },
        stats: {
          total_pipelines: pipelines.length,
          total_users: users.length,
          total_contact_fields: contactFields.length,
          total_lead_fields: leadFields.length,
          has_companies: true,
          has_contacts: true,
          has_leads: true,
        },
        pipelines: pipelines,
        users: users,
        contact_fields: contactFields,
        lead_fields: leadFields,
        secretChecks: secretChecks,
        hasReativacaoPipeline: Boolean(reativacaoPipeline),
        reativacaoPipeline: reativacaoPipeline || null,
      }

      // Persistir com segurança o relatório de inspeção no registro 'kommo_config'
      try {
        let configRec = null
        try {
          configRec = $app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
        } catch (_) {}

        if (!configRec) {
          const colCfg = $app.findCollectionByNameOrId('configuracoes')
          configRec = new Record(colCfg)
          configRec.set('chave', 'kommo_config')
          configRec.set('descricao', 'Status e mapeamentos da integração Kommo CRM')
        }

        const currentVal = configRec.get('valor') || {}
        const novoVal = Object.assign({}, currentVal, {
          funil_nome: 'Reativação',
          modo: 'readonly',
          somente_leitura: true,
          ultimo_teste_ok: true,
          ultimo_sync: new Date().toISOString(),
          inspecao: {
            account_name: accData.name,
            account_id: accData.id,
            subdomain: accData.subdomain,
            tested_at: inspectionResult.testedAt,
            has_reativacao_pipeline: Boolean(reativacaoPipeline),
            pipelines: pipelines.map((p) => ({
              id: p.id,
              name: p.name,
              is_main: p.is_main,
              stages_count: p.statuses.length,
              statuses: p.statuses,
            })),
            users_count: users.length,
            contact_fields_count: contactFields.length,
            lead_fields_count: leadFields.length,
            secret_checks: secretChecks,
          },
        })

        configRec.set('valor', novoVal)
        $app.save(configRec)
      } catch (saveErr) {
        console.log('[kommo_test] Aviso ao salvar kommo_config: ' + saveErr.message)
      }

      return e.json(200, inspectionResult)
    } catch (err) {
      return e.json(200, {
        ok: false,
        status: 'error',
        mode: 'readonly',
        message: `Erro ao conectar com Kommo: ${err.message}`,
        testedAt: new Date().toISOString(),
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/kommo/inspect-lead',
  (e) => {
    const authRecord = e.auth
    if (!authRecord || !authRecord.id) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }
    const userRole = authRecord.getString('role')
    if (userRole !== 'admin' && userRole !== 'supervisor') {
      return e.json(403, { error: 'Acesso restrito ao administrador ou supervisor.' })
    }

    try {
      const leadId = e.request.url.query().get('lead_id') || '9121415'
      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${subdomain}.kommo.com`

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      // 1. Lead details
      let leadData = null
      try {
        const res = $http.send({
          url: `${baseUrl}/api/v4/leads/${leadId}?with=contacts`,
          method: 'GET',
          headers: headers,
          timeout: 6,
        })
        leadData = res.json || null
      } catch (err) {
        leadData = { error: String(err.message) }
      }

      // 2. Talks
      let talksData = null
      try {
        const res = $http.send({
          url: `${baseUrl}/api/v4/talks?filter[entity_type]=lead&filter[entity_id][]=${leadId}`,
          method: 'GET',
          headers: headers,
          timeout: 6,
        })
        talksData = res.json || { statusCode: res.statusCode, raw: res.raw }
        console.log('[inspect-lead] talksData: ' + JSON.stringify(talksData).slice(0, 500))
      } catch (err) {
        talksData = { error: String(err.message) }
        console.log('[inspect-lead] talks error: ' + err.message)
      }

      // 2b. If talk found, fetch messages
      let talkMessages = null
      const rawTalk =
        (talksData &&
          talksData._embedded &&
          talksData._embedded.talks &&
          talksData._embedded.talks[0]) ||
        null
      const talkId = rawTalk ? rawTalk.talk_id || rawTalk.id : null
      if (talkId) {
        try {
          const msgRes = $http.send({
            url: `${baseUrl}/api/v4/talks/${talkId}/messages?limit=25`,
            method: 'GET',
            headers: headers,
            timeout: 6,
          })
          talkMessages = msgRes.json || { statusCode: msgRes.statusCode, raw: msgRes.raw }
          console.log(
            '[inspect-lead ' +
              leadId +
              ' talkId=' +
              talkId +
              '] msgRes status=' +
              (msgRes ? msgRes.statusCode : 0) +
              ' json=' +
              JSON.stringify(talkMessages).slice(0, 500),
          )
        } catch (err) {
          talkMessages = { error: String(err.message) }
        }
      }

      // 3. Events
      let eventsData = null
      try {
        const res = $http.send({
          url: `${baseUrl}/api/v4/events?filter[entity]=lead&filter[entity_id]=${leadId}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message`,
          method: 'GET',
          headers: headers,
          timeout: 6,
        })
        eventsData = res.json || { statusCode: res.statusCode, raw: res.raw }
      } catch (err) {
        eventsData = { error: String(err.message) }
      }

      // 4. Contact events if lead has contacts
      let contactEvents = null
      const contactId =
        (leadData &&
          leadData._embedded &&
          leadData._embedded.contacts &&
          leadData._embedded.contacts[0] &&
          leadData._embedded.contacts[0].id) ||
        null
      if (contactId) {
        try {
          const res = $http.send({
            url: `${baseUrl}/api/v4/events?filter[entity]=contact&filter[entity_id]=${contactId}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message`,
            method: 'GET',
            headers: headers,
            timeout: 6,
          })
          contactEvents = res.json || { statusCode: res.statusCode, raw: res.raw }
        } catch (err) {
          contactEvents = { error: String(err.message) }
        }
      }

      console.log('[inspect-lead] events: ' + JSON.stringify(eventsData).slice(0, 500))
      return e.json(200, {
        lead_id: leadId,
        lead: leadData ? { id: leadData.id, name: leadData.name } : null,
        talks: talksData,
        talk_messages: talkMessages,
        events: eventsData,
        contact_events: contactEvents,
      })
    } catch (err) {
      return e.json(500, { error: String(err.message) })
    }
  },
  $apis.requireAuth(),
)
