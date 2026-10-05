/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook do Bridge Kommo CRM — Somente Leitura (Experimental).
 *
 * Escopo exclusivo para o Administrador do sistema avaliar a integração conversacional e leads recentes.
 *
 * Regras estritas:
 * 1. SOMENTE-LEITURA: nenhuma requisição de POST, PATCH, PUT ou DELETE é enviada ao Kommo.
 * 2. Segurança: Apenas usuários autenticados com role 'admin' têm permissão de acesso.
 * 3. Tolerância a falhas: Se os secrets não estiverem configurados ou a API do Kommo responder com erro/timeout,
 *    o endpoint retorna status estruturado sem lançar 500 para permitir que a interface mostre um painel informativo amigável.
 * 4. Cache/performance: Timeout curto de 6s para chamadas externas.
 */

routerAdd(
  'GET',
  '/backend/v1/kommo/recent-activity',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error:
            'Acesso negado. A aba e o bridge Kommo são exclusivos para o perfil Administrador nesta Fase 1.',
        })
      }

      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          configured: false,
          error_code: 'MISSING_CREDENTIALS',
          message:
            'Credenciais do Kommo CRM (KOMMO_SUBDOMAIN ou KOMMO_ACCESS_TOKEN) não configuradas no backend.',
          items: [],
          total: 0,
        })
      }

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${subdomain}.kommo.com`

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      // 1. Obter mapa de pipelines/funis para traduzir pipeline_id e status_id para nomes legíveis
      const pipelineMap = {}
      const statusMap = {}
      try {
        const pipRes = $http.send({
          url: `${baseUrl}/api/v4/leads/pipelines`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        if (pipRes && pipRes.statusCode >= 200 && pipRes.statusCode < 300) {
          const rawPips = pipRes.json?._embedded?.pipelines || []
          for (let p = 0; p < rawPips.length; p++) {
            const pip = rawPips[p]
            pipelineMap[String(pip.id)] = pip.name || `Funil #${pip.id}`
            const rawStatuses = pip._embedded?.statuses || []
            for (let s = 0; s < rawStatuses.length; s++) {
              const st = rawStatuses[s]
              statusMap[`${pip.id}_${st.id}`] = {
                name: st.name || `Status #${st.id}`,
                color: st.color || '#64748b',
              }
            }
          }
        }
      } catch (pipErr) {
        console.log('[kommo_bridge] Aviso ao carregar pipelines: ' + pipErr.message)
      }

      // 2. Buscar últimos leads com atividade recente (ordenados por updated_at desc, limite 20)
      let leads = []
      try {
        const leadsRes = $http.send({
          url: `${baseUrl}/api/v4/leads?order[updated_at]=desc&limit=20&with=contacts`,
          method: 'GET',
          headers: headers,
          timeout: 6,
        })

        if (!leadsRes || leadsRes.statusCode < 200 || leadsRes.statusCode >= 300) {
          const code = leadsRes ? leadsRes.statusCode : 0
          return e.json(200, {
            ok: false,
            configured: true,
            error_code: `HTTP_${code}`,
            message: `Falha ao consultar leads recentes no Kommo CRM (HTTP ${code}). Verifique se o token de acesso continua válido.`,
            items: [],
            total: 0,
          })
        }

        leads = leadsRes.json?._embedded?.leads || []
      } catch (httpErr) {
        return e.json(200, {
          ok: false,
          configured: true,
          error_code: 'TIMEOUT_OR_NETWORK',
          message: `Tempo limite ou erro de conexão com a API do Kommo CRM: ${httpErr.message}`,
          items: [],
          total: 0,
        })
      }

      // 3. Para os contatos vinculados, coletar IDs para obter dados de contato se necessário
      const contactIds = []
      for (let i = 0; i < leads.length; i++) {
        const l = leads[i]
        const embeddedContacts = l._embedded?.contacts || []
        if (embeddedContacts.length > 0 && embeddedContacts[0].id) {
          contactIds.push(embeddedContacts[0].id)
        }
      }

      const contactsMap = {}
      if (contactIds.length > 0) {
        try {
          // Busca em lote de contatos (máx 20 ids)
          const filterQuery = contactIds.map((id) => `filter[id][]=${id}`).join('&')
          const contactsRes = $http.send({
            url: `${baseUrl}/api/v4/contacts?${filterQuery}&limit=50`,
            method: 'GET',
            headers: headers,
            timeout: 5,
          })
          if (contactsRes && contactsRes.statusCode >= 200 && contactsRes.statusCode < 300) {
            const rawContacts = contactsRes.json?._embedded?.contacts || []
            for (let c = 0; c < rawContacts.length; c++) {
              const item = rawContacts[c]
              contactsMap[String(item.id)] = item
            }
          }
        } catch (cErr) {
          console.log('[kommo_bridge] Aviso ao carregar detalhes de contatos: ' + cErr.message)
        }
      }

      // 3.1 Carregar lista de usuários do Kommo para cache e cruzamento de responsáveis (somente leitura)
      let kommoUsersList = []
      try {
        const uRes = $http.send({
          url: `${baseUrl}/api/v4/users?limit=100`,
          method: 'GET',
          headers: headers,
          timeout: 5,
        })
        if (uRes && uRes.statusCode >= 200 && uRes.statusCode < 300) {
          const rawUsers = uRes.json?._embedded?.users || []
          kommoUsersList = rawUsers.map((u) => ({
            id: String(u.id),
            name: u.name || '',
            email: u.email || '',
          }))
        }
      } catch (uErr) {
        console.log('[kommo_bridge] Aviso ao carregar usuários: ' + uErr.message)
      }

      // 4. Formatar lista normalizada para a interface
      const items = leads.map((l) => {
        const lId = String(l.id)
        const pId = String(l.pipeline_id || '')
        const sId = String(l.status_id || '')
        const pipelineName = pipelineMap[pId] || (pId ? `Funil ${pId}` : 'Geral')
        const statusInfo = statusMap[`${pId}_${sId}`] || {
          name: sId ? `Etapa ${sId}` : 'Ativo',
          color: '#64748b',
        }

        let contactName = ''
        let contactPhone = ''
        let contactEmail = ''

        const firstContactRef = l._embedded?.contacts && l._embedded.contacts[0]
        if (firstContactRef && contactsMap[String(firstContactRef.id)]) {
          const fullContact = contactsMap[String(firstContactRef.id)]
          contactName = fullContact.name || ''
          const customFields = fullContact.custom_fields_values || []
          for (let f = 0; f < customFields.length; f++) {
            const fld = customFields[f]
            if (fld.field_code === 'PHONE' && fld.values && fld.values[0]) {
              contactPhone = fld.values[0].value || ''
            }
            if (fld.field_code === 'EMAIL' && fld.values && fld.values[0]) {
              contactEmail = fld.values[0].value || ''
            }
          }
        }

        // Determinar canal aparente
        let canal = 'Kommo CRM'
        if (contactPhone) {
          canal = 'WhatsApp / Telefone'
        } else if (contactEmail) {
          canal = 'E-mail'
        }

        const updatedAtIso = l.updated_at
          ? new Date(l.updated_at * 1000).toISOString()
          : new Date().toISOString()

        return {
          id: lId,
          nome_lead: l.name || `Lead #${lId}`,
          nome_contato: contactName || l.name || 'Contato não identificado',
          canal: canal,
          telefone: contactPhone,
          email: contactEmail,
          valor: l.price || 0,
          pipeline_id: pId,
          pipeline_nome: pipelineName,
          status_id: sId,
          status_nome: statusInfo.name,
          status_cor: statusInfo.color,
          ultima_atividade: updatedAtIso,
          criado_em: l.created_at ? new Date(l.created_at * 1000).toISOString() : updatedAtIso,
        }
      })

      return e.json(200, {
        ok: true,
        configured: true,
        somente_leitura: true,
        subdomain: `${subdomain}.kommo.com`,
        items: items,
        total: items.length,
        kommo_users: kommoUsersList,
        consultado_em: new Date().toISOString(),
      })
    } catch (err) {
      console.log('[kommo_bridge] Erro interno: ' + err.message)
      return e.json(200, {
        ok: false,
        configured: false,
        error_code: 'INTERNAL_ERROR',
        message: `Erro interno no bridge Kommo: ${err.message}`,
        items: [],
        total: 0,
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * GET /backend/v1/kommo/users
 * Retorna os usuários cadastrados na Kommo (somente leitura).
 * Exclusivo para administradores.
 */
routerAdd(
  'GET',
  '/backend/v1/kommo/users',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, { error: 'Acesso restrito a administradores.' })
      }

      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          configured: false,
          users: [],
          message: 'Credenciais do Kommo não configuradas.',
        })
      }

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${subdomain}.kommo.com`

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      const uRes = $http.send({
        url: `${baseUrl}/api/v4/users?limit=250`,
        method: 'GET',
        headers: headers,
        timeout: 6,
      })

      if (!uRes || uRes.statusCode < 200 || uRes.statusCode >= 300) {
        return e.json(200, {
          ok: false,
          configured: true,
          users: [],
          message: `Falha ao obter usuários da Kommo (HTTP ${uRes ? uRes.statusCode : 0}).`,
        })
      }

      const rawUsers = uRes.json?._embedded?.users || []
      const kommoUsers = rawUsers.map((u) => ({
        id: String(u.id),
        name: u.name || '',
        email: u.email || '',
      }))

      return e.json(200, {
        ok: true,
        configured: true,
        users: kommoUsers,
        total: kommoUsers.length,
      })
    } catch (err) {
      console.log('[kommo_bridge] Erro ao listar usuarios: ' + err.message)
      return e.json(200, {
        ok: false,
        configured: false,
        users: [],
        message: 'Erro interno ao consultar Kommo: ' + err.message,
      })
    }
  },
  $apis.requireAuth(),
)

/**
 * POST /backend/v1/kommo/link-user
 * Vincula ou desvincula um usuário do sistema local com um usuário do Kommo.
 * Body: { userId: string, kommoUserId?: string, kommoUserNome?: string }
 * Exclusivo para administradores. Salva apenas no banco do Projeto Guerra (Kommo é somente-leitura).
 */
routerAdd(
  'POST',
  '/backend/v1/kommo/link-user',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, { error: 'Apenas administradores podem vincular identidades Kommo.' })
      }

      const body = e.requestInfo().body || {}
      const userId = (body.userId || '').toString().trim()
      const kommoUserId = (body.kommoUserId !== undefined ? body.kommoUserId : '').toString().trim()
      const kommoUserNome = (body.kommoUserNome !== undefined ? body.kommoUserNome : '')
        .toString()
        .trim()

      if (!userId) {
        return e.json(400, { error: 'userId é obrigatório.' })
      }

      let targetUser = null
      try {
        targetUser = $app.findRecordById('users', userId)
      } catch (_) {
        return e.json(404, { error: 'Usuário não encontrado.' })
      }

      targetUser.set('kommo_user_id', kommoUserId)
      targetUser.set('kommo_user_nome', kommoUserNome)
      $app.save(targetUser)

      // Registrar auditoria em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', kommoUserId ? 'kommo_usuario_vinculado' : 'kommo_usuario_desvinculado')
        ev.set('detalhes', {
          target_user_id: userId,
          target_user_name: targetUser.getString('name'),
          kommo_user_id: kommoUserId,
          kommo_user_nome: kommoUserNome,
          executado_por: authRecord.getString('name') || authRecord.id,
          executado_em: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: kommoUserId
          ? 'Vínculo Kommo salvo com sucesso.'
          : 'Vínculo Kommo removido com sucesso.',
        user: {
          id: targetUser.id,
          name: targetUser.getString('name'),
          email: targetUser.getString('email'),
          kommo_user_id: targetUser.getString('kommo_user_id'),
          kommo_user_nome: targetUser.getString('kommo_user_nome'),
        },
      })
    } catch (err) {
      console.log('[kommo_bridge] Erro ao vincular usuario: ' + err.message)
      return e.json(500, { error: 'Falha ao salvar vínculo: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
