routerAdd(
  'POST',
  '/backend/v1/kommo/test',
  (e) => {
    try {
      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          status: 'error',
          message:
            'Credenciais ausentes: configure KOMMO_SUBDOMAIN e KOMMO_ACCESS_TOKEN nas variáveis de ambiente do backend.',
          testedAt: new Date().toISOString(),
        })
      }

      // Leitura dos secrets de mapeamento para validação cruzada (SEM LOGAR VALORES DE SEGREDOS)
      const fieldOriginSecret = $os.getenv('KOMMO_FIELD_ORIGIN') || ''
      const fieldSegmentSecret = $os.getenv('KOMMO_FIELD_SEGMENT') || ''
      const fieldTempSecret = $os.getenv('KOMMO_FIELD_TEMPERATURE') || ''
      const pipelineExcluirSecret = $os.getenv('KOMMO_PIPELINE_EXCLUIR_LIDERANCAS') || ''
      const stageExcluirSecret = $os.getenv('KOMMO_STAGE_EXCLUIR_COMUNICACAO_INTERNA') || ''
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

      // Armazenar resultado detalhado para inspeção em configuracoes
      // 1. GET /api/v4/account
      const accRes = $http.send({
        url: `${baseUrl}/api/v4/account?with=amojo_id,version`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })

      if (accRes.statusCode < 200 || accRes.statusCode >= 300) {
        return e.json(200, {
          ok: false,
          status: 'error',
          statusCode: accRes.statusCode,
          message: `Falha na autenticação Kommo (HTTP ${accRes.statusCode}): Verifique se o token é válido ou se expirou.`,
          testedAt: new Date().toISOString(),
          errorBody: accRes.json || accRes.raw,
        })
      }

      const accData = accRes.json || {}

      // 2. GET /api/v4/leads/pipelines
      const pipRes = $http.send({
        url: `${baseUrl}/api/v4/leads/pipelines`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const pipelinesRaw = pipRes.json?._embedded?.pipelines || []
      const pipelines = pipelinesRaw.map((p) => {
        const stagesRaw = p._embedded?.statuses || []
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

      // 3. GET /api/v4/users
      const usersRes = $http.send({
        url: `${baseUrl}/api/v4/users?limit=250`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const usersRaw = usersRes.json?._embedded?.users || []
      const users = usersRaw.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        lang: u.lang,
        rights: {
          is_admin: u.rights?.is_admin,
          is_free: u.rights?.is_free,
          is_active: u.rights?.is_active,
          group_id: u.rights?.group_id,
          role_id: u.rights?.role_id,
        },
      }))

      // 4. GET /api/v4/contacts/custom_fields
      const contactFieldsRes = $http.send({
        url: `${baseUrl}/api/v4/contacts/custom_fields?limit=250`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const contactFieldsRaw = contactFieldsRes.json?._embedded?.custom_fields || []
      const contactFields = contactFieldsRaw.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        code: f.code,
        enums: (f.enums || []).slice(0, 10),
      }))

      // 5. GET /api/v4/leads/custom_fields
      const leadFieldsRes = $http.send({
        url: `${baseUrl}/api/v4/leads/custom_fields?limit=250`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const leadFieldsRaw = leadFieldsRes.json?._embedded?.custom_fields || []
      const leadFields = leadFieldsRaw.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        code: f.code,
        enums: (f.enums || []).slice(0, 10),
      }))

      // 6. GET /api/v4/companies (contagem estimada / limit 1)
      const compRes = $http.send({
        url: `${baseUrl}/api/v4/companies?limit=1`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const hasCompanies =
        (compRes.statusCode === 200 && compRes.json?._embedded?.companies?.length > 0) || false

      // 7. GET /api/v4/contacts (limit 1) para checagem rápida
      const contSampleRes = $http.send({
        url: `${baseUrl}/api/v4/contacts?limit=1`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const hasContacts =
        (contSampleRes.statusCode === 200 && contSampleRes.json?._embedded?.contacts?.length > 0) ||
        false

      // 8. GET /api/v4/leads (limit 1)
      const leadSampleRes = $http.send({
        url: `${baseUrl}/api/v4/leads?limit=1`,
        method: 'GET',
        headers: headers,
        timeout: 15,
      })
      const hasLeads =
        (leadSampleRes.statusCode === 200 && leadSampleRes.json?._embedded?.leads?.length > 0) ||
        false

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
          matchingStage:
            pipelines
              .flatMap((p) =>
                p.statuses.map((s) =>
                  Object.assign({}, s, { pipeline_id: p.id, pipeline_name: p.name }),
                ),
              )
              .find((s) => String(s.id) === String(statusIdComunSecret)) || null,
        },
      }

      // Procurar se existe um funil chamado "Reativação"
      const reativacaoPipeline = pipelines.find((p) => p.name.toLowerCase().includes('reativa'))

      const inspectionResult = {
        ok: true,
        status: 'connected',
        message: 'Conexão com a API do Kommo estabelecida com sucesso e dados inspecionados!',
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
          has_companies: hasCompanies,
          has_contacts: hasContacts,
          has_leads: hasLeads,
        },
        pipelines: pipelines,
        users: users,
        contact_fields: contactFields,
        lead_fields: leadFields,
        secretChecks: secretChecks,
        hasReativacaoPipeline: Boolean(reativacaoPipeline),
        reativacaoPipeline: reativacaoPipeline || null,
      }

      // Persistir o relatório de inspeção no registro de configuracoes 'kommo_config'
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

        let currentVal = {}
        const rawVal = configRec.get('valor')
        if (rawVal && typeof rawVal === 'object') {
          currentVal = rawVal
        } else if (typeof rawVal === 'string') {
          try {
            currentVal = JSON.parse(rawVal)
          } catch (_) {
            currentVal = {}
          }
        }

        const novoVal = Object.assign({}, currentVal, {
          funil_nome: currentVal.funil_nome || 'Reativação',
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
            users_summary: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
            contact_fields_count: contactFields.length,
            contact_fields: contactFields.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              code: f.code,
            })),
            lead_fields_count: leadFields.length,
            lead_fields: leadFields.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              code: f.code,
            })),
            secret_checks: secretChecks,
          },
        })

        // PocketBase JSON field aceita JSON string ou objeto válido não vazio
        configRec.set('valor', novoVal)
        $app.save(configRec)
      } catch (saveErr) {
        // Se falhar ao salvar no banco, não interrompe a resposta
        console.log('[kommo_test] Aviso ao salvar inspeção em configuracoes: ' + saveErr.message)
      }

      return e.json(200, inspectionResult)
    } catch (err) {
      return e.json(200, {
        ok: false,
        status: 'error',
        message: `Erro ao conectar com Kommo: ${err.message}`,
        testedAt: new Date().toISOString(),
      })
    }
  },
  // Público/interno para testes do backend ou frontend autenticado
)
