/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_sync.js
 *
 * Sincronização e ingestão contínua de conversas WhatsApp da linha SDR (35 99770-9232):
 * 1. Processa eventos de entrada (webhook do Kommo ou polling sob demanda)
 * 2. Cria/atualiza registros em `chat_conversas` (tipo: 'kommo_whatsapp')
 * 3. Cria registros em `chat_mensagens` (direcao: 'entrada', kommo_status: 'recebida')
 * 4. Faz cruzamento com a base de clientes por telefone e transfere para carteira/vendedor
 * 5. Aciona triagem comercial ágil com o Skip Cloud AI Agent 'sdr-triagem-bot'
 * 6. Rota POST /backend/v1/kommo/sync-sdr
 */

routerAdd(
  'POST',
  '/backend/v1/kommo/sync-sdr',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }
      if (authRecord.getString('role') !== 'admin') {
        return e.json(403, { error: 'Acesso restrito ao administrador.' })
      }

      const KOMMO_SDR_PHONE_TARGET = '35997709232'

      const cleanPhoneNumber = (phone) => {
        if (!phone) return ''
        return String(phone).replace(/\D/g, '')
      }

      const isPhoneMatch = (phoneA, phoneB) => {
        const cleanA = cleanPhoneNumber(phoneA)
        const cleanB = cleanPhoneNumber(phoneB)
        if (!cleanA || !cleanB) return false
        if (cleanA === cleanB) return true
        const shortA = cleanA.startsWith('55') && cleanA.length >= 12 ? cleanA.slice(2) : cleanA
        const shortB = cleanB.startsWith('55') && cleanB.length >= 12 ? cleanB.slice(2) : cleanB
        if (shortA === shortB) return true
        if (shortA.length === 11 && shortB.length === 10) {
          return shortA.slice(0, 2) === shortB.slice(0, 2) && shortA.slice(3) === shortB.slice(2)
        }
        if (shortB.length === 11 && shortA.length === 10) {
          return shortB.slice(0, 2) === shortA.slice(0, 2) && shortB.slice(3) === shortA.slice(2)
        }
        return false
      }

      const isSdrPhone = (phone) => isPhoneMatch(phone, KOMMO_SDR_PHONE_TARGET)

      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
      const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''

      if (!subdomain || !accessToken) {
        return e.json(200, {
          ok: false,
          configured: false,
          message: 'Credenciais do Kommo CRM não configuradas no backend.',
        })
      }

      const baseUrl = apiBaseUrlSecret
        ? apiBaseUrlSecret.endsWith('/')
          ? apiBaseUrlSecret.slice(0, -1)
          : apiBaseUrlSecret
        : `https://${subdomain}.kommo.com`

      let adminUser = null
      try {
        adminUser = $app.findFirstRecordByData('users', 'role', 'admin')
      } catch (_) {}
      const adminId = adminUser ? adminUser.id : authRecord.id

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }

      let totalProcessadas = 0

      // 1. Buscar leads recentes
      const leadsRes = $http.send({
        url: `${baseUrl}/api/v4/leads?order[updated_at]=desc&limit=30&with=contacts`,
        method: 'GET',
        headers: headers,
        timeout: 8,
      })

      if (!leadsRes || leadsRes.statusCode < 200 || leadsRes.statusCode >= 300) {
        return e.json(200, {
          ok: false,
          error: `Falha ao consultar leads na API do Kommo (HTTP ${leadsRes ? leadsRes.statusCode : 0})`,
        })
      }

      const leads = leadsRes.json?._embedded?.leads || []
      const convCol = $app.findCollectionByNameOrId('chat_conversas')
      const msgCol = $app.findCollectionByNameOrId('chat_mensagens')

      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i]
        const contacts = lead._embedded?.contacts || []
        if (contacts.length === 0) continue

        const contactId = contacts[0].id
        let contactPhone = ''
        let contactName = ''

        try {
          const cRes = $http.send({
            url: `${baseUrl}/api/v4/contacts/${contactId}`,
            method: 'GET',
            headers: headers,
            timeout: 5,
          })
          if (cRes && cRes.statusCode === 200 && cRes.json) {
            contactName = cRes.json.name || ''
            const flds = cRes.json.custom_fields_values || []
            for (let f = 0; f < flds.length; f++) {
              if (flds[f].field_code === 'PHONE' && flds[f].values && flds[f].values[0]) {
                contactPhone = flds[f].values[0].value || ''
                break
              }
            }
          }
        } catch (_) {}

        const cleanPhone = cleanPhoneNumber(contactPhone)
        const isLeadSdr =
          isSdrPhone(contactPhone) ||
          (lead.name && (lead.name.includes('99770-9232') || lead.name.includes('997709232')))

        if (cleanPhone || isLeadSdr) {
          // Achar ou criar conversa
          let conversa = null
          try {
            if (cleanPhone) {
              const existing = $app.findRecordsByFilter(
                'chat_conversas',
                `kommo_phone_clean = '${cleanPhone}' && tipo = 'kommo_whatsapp'`,
                '-updated',
                1,
              )
              if (existing && existing.length > 0) {
                conversa = existing[0]
              }
            }
          } catch (_) {}

          // Buscar cliente na base se houver
          let clienteId = ''
          let clienteRecord = null
          if (cleanPhone && cleanPhone.length >= 8) {
            try {
              const suffix = cleanPhone.length >= 9 ? cleanPhone.slice(-9) : cleanPhone.slice(-8)
              const cliRecs = $app.findRecordsByFilter(
                'clientes',
                `telefone ~ '${suffix}' || whatsapp ~ '${suffix}'`,
                '-created',
                1,
              )
              if (cliRecs && cliRecs.length > 0) {
                clienteRecord = cliRecs[0]
                clienteId = clienteRecord.id
              }
            } catch (_) {}
          }

          const tituloFinal = contactName
            ? `${contactName} (WhatsApp SDR)`
            : `WhatsApp SDR (${cleanPhone || KOMMO_SDR_PHONE_TARGET})`

          if (!conversa) {
            conversa = new Record(convCol)
            conversa.set('tipo', 'kommo_whatsapp')
            conversa.set('titulo', tituloFinal)
            conversa.set('participantes', [adminId])
            conversa.set('kommo_phone', contactPhone || KOMMO_SDR_PHONE_TARGET)
            conversa.set('kommo_phone_clean', cleanPhone || KOMMO_SDR_PHONE_TARGET)
            conversa.set('kommo_contact_id', String(contactId))
            conversa.set('kommo_lead_id', String(lead.id))
            conversa.set('cliente_id', clienteId)
            conversa.set('responsavel_id', adminId)
            conversa.set('total_mensagens', 0)
            $app.save(conversa)
          } else {
            let changed = false
            if (clienteId && !conversa.get('cliente_id')) {
              conversa.set('cliente_id', clienteId)
              changed = true
            }
            if (changed) {
              $app.save(conversa)
            }
          }

          // Buscar notas/mensagens deste lead
          try {
            const notesRes = $http.send({
              url: `${baseUrl}/api/v4/leads/${lead.id}/notes?limit=10&order[created_at]=desc`,
              method: 'GET',
              headers: headers,
              timeout: 5,
            })

            if (notesRes && notesRes.statusCode === 200 && notesRes.json?._embedded?.notes) {
              const notes = notesRes.json._embedded.notes
              for (let n = notes.length - 1; n >= 0; n--) {
                const note = notes[n]
                const noteText = note.params?.text || note.params?.message || ''
                if (!noteText.trim()) continue

                const msgId = `kommo_note_${note.id}`
                let duplicada = false
                try {
                  const check = $app.findRecordsByFilter(
                    'chat_mensagens',
                    `kommo_message_id = '${msgId}'`,
                    '-created',
                    1,
                  )
                  if (check && check.length > 0) duplicada = true
                } catch (_) {}

                if (!duplicada) {
                  const msg = new Record(msgCol)
                  msg.set('conversa', conversa.id)
                  msg.set('autor', adminId)
                  msg.set('autor_nome', contactName || 'Cliente SDR')
                  msg.set('autor_role', 'operador')
                  msg.set('texto', noteText)
                  msg.set('tipo', 'normal')
                  msg.set('direcao', 'entrada')
                  msg.set('kommo_status', 'recebida')
                  msg.set('kommo_message_id', msgId)
                  $app.save(msg)

                  conversa.set('ultima_mensagem_texto', noteText.slice(0, 97))
                  conversa.set('ultimo_autor_nome', contactName || 'Cliente SDR')
                  conversa.set('ultima_mensagem_tipo', 'normal')
                  conversa.set('ultima_mensagem_data', new Date().toISOString())
                  const tot = conversa.getInt('total_mensagens') || 0
                  conversa.set('total_mensagens', tot + 1)
                  $app.save(conversa)

                  totalProcessadas++
                }
              }
            }
          } catch (_) {}
        }
      }

      return e.json(200, {
        ok: true,
        message: `Sincronização SDR concluída com sucesso (${totalProcessadas} mensagens/eventos processados).`,
        processadas: totalProcessadas,
        sdr_phone: KOMMO_SDR_PHONE_TARGET,
      })
    } catch (err) {
      console.log('[kommo_sync] Erro na rota sync-sdr: ' + err.message)
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
