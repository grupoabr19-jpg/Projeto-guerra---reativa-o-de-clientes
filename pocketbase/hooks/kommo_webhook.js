/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_webhook.js
 *
 * Endpoint público para recepção de webhooks do Kommo CRM.
 * URL: POST /backend/v1/kommo/webhook
 *
 * O Kommo envia notificações no formato application/x-www-form-urlencoded ou application/json
 * para eventos como:
 * - leads[add], leads[update], leads[status]
 * - contacts[add], contacts[update]
 * - message[add]
 *
 * Este webhook processa mensagens e leads novos da linha SDR (35 99770-9232) e
 * os injeta no Hub de Atendimento em tempo real vinculados à conta do Admin Thiago Almeida.
 */

routerAdd('POST', '/backend/v1/kommo/webhook', (e) => {
  try {
    const {
      cleanPhoneNumber,
      isSdrPhone,
      KOMMO_SDR_PHONE_TARGET,
      auditKommoAction,
      getAdminUser,
    } = require(`${__hooks}/kommo_client.js`)

    const rawBody = e.requestInfo().body || {}
    console.log(
      '[kommo_webhook] Recebido payload de webhook: ' + JSON.stringify(rawBody).slice(0, 300),
    )

    const admin = getAdminUser()
    const adminId = admin ? admin.id : ''

    const convCol = $app.findCollectionByNameOrId('chat_conversas')
    const msgCol = $app.findCollectionByNameOrId('chat_mensagens')

    let eventosProcessados = 0

    // Helper inline para obter ou criar conversa
    const obterOuCriarConversa = (telefone, nomeContato, contactId, leadId, chatId) => {
      const cleanPhone = cleanPhoneNumber(telefone)
      let conversa = null

      if (cleanPhone) {
        try {
          const existing = $app.findRecordsByFilter(
            'chat_conversas',
            `kommo_phone_clean = '${cleanPhone}' && tipo = 'kommo_whatsapp'`,
            '-updated',
            1,
          )
          if (existing && existing.length > 0) conversa = existing[0]
        } catch (_) {}
      }

      if (!conversa && chatId) {
        try {
          const existingChat = $app.findRecordsByFilter(
            'chat_conversas',
            `kommo_chat_id = '${chatId}'`,
            '-updated',
            1,
          )
          if (existingChat && existingChat.length > 0) conversa = existingChat[0]
        } catch (_) {}
      }

      let clienteId = ''
      if (cleanPhone && cleanPhone.length >= 8) {
        try {
          const suffix = cleanPhone.length >= 9 ? cleanPhone.slice(-9) : cleanPhone.slice(-8)
          const cliRecs = $app.findRecordsByFilter(
            'clientes',
            `telefone ~ '${suffix}' || whatsapp ~ '${suffix}'`,
            '-created',
            1,
          )
          if (cliRecs && cliRecs.length > 0) clienteId = cliRecs[0].id
        } catch (_) {}
      }

      const tituloFinal = nomeContato
        ? `${nomeContato} (WhatsApp SDR)`
        : `WhatsApp SDR (${cleanPhone || KOMMO_SDR_PHONE_TARGET})`

      if (!conversa) {
        conversa = new Record(convCol)
        conversa.set('tipo', 'kommo_whatsapp')
        conversa.set('titulo', tituloFinal)
        conversa.set('participantes', adminId ? [adminId] : [])
        conversa.set('kommo_phone', telefone || KOMMO_SDR_PHONE_TARGET)
        conversa.set('kommo_phone_clean', cleanPhone || KOMMO_SDR_PHONE_TARGET)
        conversa.set('kommo_contact_id', contactId ? String(contactId) : '')
        conversa.set('kommo_lead_id', leadId ? String(leadId) : '')
        conversa.set('kommo_chat_id', chatId ? String(chatId) : '')
        conversa.set('cliente_id', clienteId)
        conversa.set('responsavel_id', adminId || '')
        conversa.set('total_mensagens', 0)
        $app.save(conversa)
      } else {
        let mudou = false
        if (adminId && conversa.get('responsavel_id') !== adminId) {
          conversa.set('responsavel_id', adminId)
          mudou = true
        }
        if (clienteId && !conversa.get('cliente_id')) {
          conversa.set('cliente_id', clienteId)
          mudou = true
        }
        if (mudou) $app.save(conversa)
      }

      return conversa
    }

    // Helper inline para registrar mensagem
    const registrarMensagem = (convId, texto, autorNome, msgId) => {
      if (!convId || !texto) return
      if (msgId) {
        try {
          const dup = $app.findRecordsByFilter(
            'chat_mensagens',
            `kommo_message_id = '${msgId}'`,
            '-created',
            1,
          )
          if (dup && dup.length > 0) return
        } catch (_) {}
      }

      const m = new Record(msgCol)
      m.set('conversa', convId)
      m.set('autor', adminId || '')
      m.set('autor_nome', autorNome || 'Cliente (WhatsApp SDR)')
      m.set('autor_role', 'operador')
      m.set('texto', texto)
      m.set('tipo', 'normal')
      m.set('direcao', 'entrada')
      m.set('kommo_status', 'recebida')
      m.set('kommo_message_id', msgId || '')
      $app.save(m)

      try {
        const c = $app.findRecordById('chat_conversas', convId)
        c.set('ultima_mensagem_texto', texto.slice(0, 97))
        c.set('ultimo_autor_nome', autorNome || 'Cliente (WhatsApp SDR)')
        c.set('ultima_mensagem_tipo', 'normal')
        c.set('ultima_mensagem_data', new Date().toISOString())
        const tot = c.getInt('total_mensagens') || 0
        c.set('total_mensagens', tot + 1)
        $app.save(c)
      } catch (_) {}
    }

    // Caso 1: leads adicionados ou atualizados
    const leadsPayload = rawBody.leads || {}
    const addedLeads = leadsPayload.add || leadsPayload.update || leadsPayload.status || []
    const leadsArray = Array.isArray(addedLeads) ? addedLeads : Object.values(addedLeads)

    for (let i = 0; i < leadsArray.length; i++) {
      const lead = leadsArray[i]
      if (!lead || !lead.id) continue

      let phone = ''
      const contactName = lead.name || ''
      const customFields = lead.custom_fields || []
      for (let f = 0; f < customFields.length; f++) {
        const cf = customFields[f]
        if (
          cf.code === 'PHONE' ||
          cf.id === 82749 ||
          (cf.name && cf.name.toLowerCase().includes('fone'))
        ) {
          const vals = cf.values || []
          if (vals.length > 0) phone = vals[0].value || vals[0]
        }
      }

      const isSdrMatch =
        isSdrPhone(phone) ||
        (lead.name && (lead.name.includes('997709232') || lead.name.includes('99770-9232')))

      if (phone || isSdrMatch) {
        const conv = obterOuCriarConversa(
          phone || KOMMO_SDR_PHONE_TARGET,
          contactName,
          '',
          lead.id,
          '',
        )
        registrarMensagem(
          conv.id,
          `[Lead Kommo] ${lead.name || 'Lead SDR'} (Etapa: ${lead.status_id || 'Entrada'})`,
          contactName || 'Kommo SDR',
          `webhook_lead_${lead.id}_${Date.now()}`,
        )
        eventosProcessados++
      }
    }

    // Caso 2: contatos adicionados ou atualizados
    const contactsPayload = rawBody.contacts || {}
    const addedContacts = contactsPayload.add || contactsPayload.update || []
    const contactsArray = Array.isArray(addedContacts)
      ? addedContacts
      : Object.values(addedContacts)

    for (let j = 0; j < contactsArray.length; j++) {
      const ct = contactsArray[j]
      if (!ct || !ct.id) continue

      let contactPhone = ''
      const customFields = ct.custom_fields || []
      for (let f = 0; f < customFields.length; f++) {
        const cf = customFields[f]
        if (cf.code === 'PHONE' || (cf.name && cf.name.toLowerCase().includes('fone'))) {
          const vals = cf.values || []
          if (vals.length > 0) contactPhone = vals[0].value || vals[0]
        }
      }

      if (contactPhone || isSdrPhone(contactPhone)) {
        obterOuCriarConversa(contactPhone || KOMMO_SDR_PHONE_TARGET, ct.name, ct.id, '', '')
        eventosProcessados++
      }
    }

    // Caso 3: Mensagens de chat (message[add])
    const msgPayload = rawBody.message || rawBody.talk || {}
    const addedMsgs = msgPayload.add || []
    const msgsArray = Array.isArray(addedMsgs) ? addedMsgs : Object.values(addedMsgs)

    for (let m = 0; m < msgsArray.length; m++) {
      const item = msgsArray[m]
      const text = item.text || item.message || ''
      const phone = item.phone || item.contact_phone || ''
      const senderName = item.sender_name || item.name || 'Cliente WhatsApp SDR'
      if (text) {
        const conv = obterOuCriarConversa(
          phone || KOMMO_SDR_PHONE_TARGET,
          senderName,
          '',
          '',
          item.chat_id || item.talk_id || '',
        )
        registrarMensagem(
          conv.id,
          text,
          senderName,
          item.id ? String(item.id) : `webhook_msg_${Date.now()}`,
        )
        eventosProcessados++
      }
    }

    auditKommoAction(
      'webhook_processado',
      {
        eventos: eventosProcessados,
        tipo_payload: Object.keys(rawBody),
      },
      adminId,
    )

    return e.json(200, {
      ok: true,
      recebido: true,
      processados: eventosProcessados,
    })
  } catch (err) {
    console.log('[kommo_webhook] Erro ao processar webhook: ' + err.message)
    return e.json(200, { ok: false, error: err.message })
  }
})
