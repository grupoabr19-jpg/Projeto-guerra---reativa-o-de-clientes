/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_sync_lead_messages.js
 *
 * Endpoint sob demanda para sincronização idempotente de mensagens reais do WhatsApp Kommo:
 * POST /backend/v1/kommo/sync-lead-messages
 *
 * Aceita:
 * - { "conversation_id": "..." } ou { "conversa_id": "..." }
 * - { "kommo_lead_id": "..." } ou { "lead_id": "..." }
 *
 * Utiliza o helper unificado (fetchKommoLeadMessagesUnified + upsertKommoMessagesIdempotent).
 * Dispara bot SDR caso haja nova mensagem incoming e o responsável seja o admin Thiago Almeida.
 */

routerAdd(
  'POST',
  '/backend/v1/kommo/sync-lead-messages',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const body = e.requestInfo().body || {}
      const conversaId = (body.conversation_id || body.conversa_id || '').toString().trim()
      const kommoLeadId = (body.kommo_lead_id || body.lead_id || '').toString().trim()

      if (!conversaId && !kommoLeadId) {
        return e.json(400, {
          error: 'Parâmetro conversation_id ou kommo_lead_id é obrigatório.',
        })
      }

      // Localizar conversa
      let conversa = null
      if (conversaId) {
        try {
          conversa = $app.findRecordById('chat_conversas', conversaId)
        } catch (_) {}
      }

      if (!conversa && kommoLeadId) {
        try {
          const list = $app.findRecordsByFilter(
            'chat_conversas',
            `kommo_lead_id = '${kommoLeadId}' && tipo = 'kommo_whatsapp'`,
            '-updated',
            1,
            0,
          )
          if (list && list.length > 0) {
            conversa = list[0]
          }
        } catch (_) {}
      }

      const effectiveLeadId = kommoLeadId || (conversa ? conversa.getString('kommo_lead_id') : '')
      if (!effectiveLeadId) {
        return e.json(400, {
          error: 'A conversa informada não possui kommo_lead_id vinculado.',
        })
      }

      // Localizar admin Thiago Almeida para fallback de atribuição
      let adminId = ''
      try {
        const adminRec = $app.findFirstRecordByData('users', 'email', 'thiago@grupoabr.com.br')
        if (adminRec) adminId = adminRec.id
      } catch (_) {
        adminId = authRecord.id
      }

      // Se a conversa ainda não existe no PocketBase, criar agora
      if (!conversa) {
        const convCol = $app.findCollectionByNameOrId('chat_conversas')
        conversa = new Record(convCol)
        conversa.set('tipo', 'kommo_whatsapp')
        conversa.set('titulo', `Lead #${effectiveLeadId} (WhatsApp SDR)`)
        conversa.set('participantes', [adminId || authRecord.id])
        conversa.set('kommo_lead_id', effectiveLeadId)
        conversa.set('kommo_phone', '35 99770-9232')
        conversa.set('kommo_phone_clean', '35997709232')
        conversa.set('responsavel_id', adminId || authRecord.id)
        conversa.set('status_sdr', 'novo_lead')
        conversa.set('total_mensagens', 0)
        $app.save(conversa)
      }

      const contactName = conversa.getString('titulo') || 'Cliente WhatsApp SDR'

      // Carregar funções do helper de mensagens com fallback seguro via require
      let fetchKommoLeadMessagesUnifiedFn =
        typeof fetchKommoLeadMessagesUnified !== 'undefined' ? fetchKommoLeadMessagesUnified : null
      let upsertKommoMessagesIdempotentFn =
        typeof upsertKommoMessagesIdempotent !== 'undefined' ? upsertKommoMessagesIdempotent : null

      if (!fetchKommoLeadMessagesUnifiedFn || !upsertKommoMessagesIdempotentFn) {
        try {
          const msgHelper = require(`${__hooks}/kommo_messages_helper.js`)
          if (msgHelper) {
            if (!fetchKommoLeadMessagesUnifiedFn && msgHelper.fetchKommoLeadMessagesUnified) {
              fetchKommoLeadMessagesUnifiedFn = msgHelper.fetchKommoLeadMessagesUnified
            }
            if (!upsertKommoMessagesIdempotentFn && msgHelper.upsertKommoMessagesIdempotent) {
              upsertKommoMessagesIdempotentFn = msgHelper.upsertKommoMessagesIdempotent
            }
          }
        } catch (reqErr) {
          console.log(
            '[kommo_sync_lead_messages] Aviso ao requerer kommo_messages_helper: ' + reqErr.message,
          )
        }
      }

      if (!fetchKommoLeadMessagesUnifiedFn || !upsertKommoMessagesIdempotentFn) {
        throw new Error(
          'Helper kommo_messages_helper não disponível no endpoint sync-lead-messages',
        )
      }

      // 1. Extração unificada de mensagens via talks / events / notes
      const mensagens = fetchKommoLeadMessagesUnifiedFn(effectiveLeadId, contactName)

      // 2. Gravação idempotente por id externo
      const novasGravadas = upsertKommoMessagesIdempotentFn(conversa, mensagens, adminId)

      // 3. Se gravou novas mensagens de entrada e a conversa está com o Admin, processar SDR bot
      if (novasGravadas > 0 && adminId && conversa.getString('responsavel_id') === adminId) {
        const ultimaMsg = mensagens[mensagens.length - 1]
        if (ultimaMsg && ultimaMsg.direcao === 'entrada') {
          // Checagem de expediente (seg-sex 7h-18h BRT)
          const dataAgora = new Date()
          const brtDate = new Date(dataAgora.getTime() - 3 * 60 * 60 * 1000)
          const brtDay = brtDate.getUTCDay()
          const brtHours = brtDate.getUTCHours()
          const brtMonth = brtDate.getUTCMonth() + 1
          const brtDayOfMonth = brtDate.getUTCDate()
          const mmdd =
            (brtMonth < 10 ? '0' : '') +
            brtMonth +
            '-' +
            (brtDayOfMonth < 10 ? '0' : '') +
            brtDayOfMonth

          const feriadosFixos = [
            '01-01',
            '04-21',
            '05-01',
            '09-07',
            '10-12',
            '11-02',
            '11-15',
            '11-20',
            '12-25',
            '03-03',
            '03-04',
            '04-18',
            '06-19',
            '02-16',
            '02-17',
            '04-03',
            '06-04',
          ]
          const ehFimDeSemana = brtDay === 0 || brtDay === 6
          const ehFeriado = feriadosFixos.indexOf(mmdd) !== -1
          const ehForaHorario = brtHours < 7 || brtHours >= 18
          const ehForaExpediente = ehFimDeSemana || ehFeriado || ehForaHorario

          // Bot config
          let botAtivo = true
          let botNome = 'SDR Virtual Grupo ABR'
          let msgForaExpedienteCustom = ''
          try {
            const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
            if (cfg) {
              const v = cfg.get('valor') || {}
              if (v.ativo === false) botAtivo = false
              if (v.nome_sdr) botNome = v.nome_sdr
              if (v.mensagem_fora_expediente) msgForaExpedienteCustom = v.mensagem_fora_expediente
            }
          } catch (_) {}

          if (botAtivo && ehForaExpediente) {
            const textoFora =
              msgForaExpedienteCustom ||
              'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!'
            const msgCol = $app.findCollectionByNameOrId('chat_mensagens')
            const foraMsg = new Record(msgCol)
            foraMsg.set('conversa', conversa.id)
            foraMsg.set('autor', adminId)
            foraMsg.set('autor_nome', `${botNome} (Fora de Expediente)`)
            foraMsg.set('autor_role', 'supervisor')
            foraMsg.set('texto', textoFora)
            foraMsg.set('tipo', 'normal')
            foraMsg.set('direcao', 'saida')
            foraMsg.set('kommo_status', 'enviada')
            foraMsg.set('kommo_message_id', `sdr_sync_fora_${Date.now()}`)
            $app.save(foraMsg)

            conversa.set('ultima_mensagem_texto', textoFora.slice(0, 97))
            conversa.set('ultimo_autor_nome', botNome)
            conversa.set('total_mensagens', (conversa.getInt('total_mensagens') || 0) + 1)
            $app.save(conversa)
          }
        }
      }

      // Retornar mensagens do banco atualizadas para a conversa
      const mensagensBanco = $app.findRecordsByFilter(
        'chat_mensagens',
        `conversa = '${conversa.id}'`,
        'created',
        100,
        0,
      )

      return e.json(200, {
        ok: true,
        conversa_id: conversa.id,
        kommo_lead_id: effectiveLeadId,
        total_encontradas: mensagens.length,
        novas_gravadas: novasGravadas,
        total_mensagens_banco: mensagensBanco.length,
        mensagens: mensagensBanco.map((m) => ({
          id: m.id,
          conversa: m.getString('conversa'),
          autor: m.getString('autor'),
          autor_nome: m.getString('autor_nome'),
          autor_role: m.getString('autor_role'),
          texto: m.getString('texto'),
          tipo: m.getString('tipo'),
          direcao: m.getString('direcao'),
          kommo_status: m.getString('kommo_status'),
          kommo_message_id: m.getString('kommo_message_id'),
          created: m.getString('created'),
        })),
      })
    } catch (err) {
      console.log('[kommo_sync_lead_messages] Erro: ' + err.message)
      return e.json(500, { error: 'Falha ao sincronizar mensagens: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
