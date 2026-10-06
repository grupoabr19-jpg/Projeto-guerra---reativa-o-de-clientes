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

          // Cruzar responsible_user_id do Kommo com usuário do sistema
          let leadRespKommoId = lead.responsible_user_id ? String(lead.responsible_user_id) : ''
          let vendedorVinculado = null
          if (leadRespKommoId) {
            try {
              const matched = $app.findRecordsByFilter(
                'users',
                `kommo_user_id = '${leadRespKommoId}'`,
                '-created',
                1,
              )
              if (matched && matched.length > 0) vendedorVinculado = matched[0]
            } catch (_) {}
          }

          let targetResponsavelId = adminId
          let targetStatusSdr = 'novo_lead'
          let targetTransferidoEm = ''

          if (
            vendedorVinculado &&
            vendedorVinculado.id !== adminId &&
            (vendedorVinculado.getString('role') === 'operador' ||
              vendedorVinculado.getString('role') === 'lider')
          ) {
            targetResponsavelId = vendedorVinculado.id
            targetStatusSdr = 'transferido'
            targetTransferidoEm = new Date().toISOString()
          }

          if (!conversa) {
            conversa = new Record(convCol)
            conversa.set('tipo', 'kommo_whatsapp')
            conversa.set('titulo', tituloFinal)
            const parts = [adminId]
            if (targetResponsavelId && !parts.includes(targetResponsavelId))
              parts.push(targetResponsavelId)
            conversa.set('participantes', parts)
            conversa.set('kommo_phone', contactPhone || KOMMO_SDR_PHONE_TARGET)
            conversa.set('kommo_phone_clean', cleanPhone || KOMMO_SDR_PHONE_TARGET)
            conversa.set('kommo_contact_id', String(contactId))
            conversa.set('kommo_lead_id', String(lead.id))
            conversa.set('cliente_id', clienteId)
            conversa.set('responsavel_id', targetResponsavelId)
            conversa.set('status_sdr', targetStatusSdr)
            if (targetTransferidoEm) conversa.set('transferido_em', targetTransferidoEm)
            conversa.set('total_mensagens', 0)
            $app.save(conversa)
          } else {
            let changed = false
            if (clienteId && !conversa.getString('cliente_id')) {
              conversa.set('cliente_id', clienteId)
              changed = true
            }
            if (
              vendedorVinculado &&
              vendedorVinculado.id !== conversa.getString('responsavel_id')
            ) {
              conversa.set('responsavel_id', vendedorVinculado.id)
              conversa.set('status_sdr', 'transferido')
              if (!conversa.getString('transferido_em'))
                conversa.set('transferido_em', new Date().toISOString())
              const curParts = conversa.get('participantes') || []
              if (!curParts.includes(vendedorVinculado.id)) {
                curParts.push(vendedorVinculado.id)
                conversa.set('participantes', curParts)
              }
              changed = true
            }
            if (!conversa.getString('status_sdr')) {
              conversa.set(
                'status_sdr',
                conversa.getString('responsavel_id') &&
                  conversa.getString('responsavel_id') !== adminId
                  ? 'transferido'
                  : 'novo_lead',
              )
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
                const noteText = (note.params?.text || note.params?.message || '').trim()
                const noteType = note.note_type || ''
                const isAttachment = noteType === 'attachment'
                const fileName = (note.params?.file_name || note.params?.name || '').toLowerCase()

                let isAudioNote = false
                let isImageNote = false

                if (isAttachment) {
                  if (
                    fileName.endsWith('.ogg') ||
                    fileName.endsWith('.mp3') ||
                    fileName.endsWith('.wav') ||
                    fileName.endsWith('.m4a') ||
                    fileName.endsWith('.aac')
                  ) {
                    isAudioNote = true
                  } else if (
                    fileName.endsWith('.jpg') ||
                    fileName.endsWith('.jpeg') ||
                    fileName.endsWith('.png') ||
                    fileName.endsWith('.webp') ||
                    fileName.endsWith('.gif')
                  ) {
                    isImageNote = true
                  }
                }

                if (!noteText && !isAttachment) continue

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
                  const textoSalvar =
                    noteText ||
                    (isAudioNote
                      ? '🎙️ [Áudio recebido]'
                      : isImageNote
                        ? '🖼️ [Imagem recebida]'
                        : '📎 [Arquivo recebido]')
                  const msg = new Record(msgCol)
                  msg.set('conversa', conversa.id)
                  msg.set('autor', adminId)
                  msg.set('autor_nome', contactName || 'Cliente SDR')
                  msg.set('autor_role', 'operador')
                  msg.set('texto', textoSalvar)
                  msg.set('tipo', 'normal')
                  msg.set('direcao', 'entrada')
                  msg.set('kommo_status', 'recebida')
                  msg.set('kommo_message_id', msgId)
                  $app.save(msg)

                  conversa.set('ultima_mensagem_texto', textoSalvar.slice(0, 97))
                  conversa.set('ultimo_autor_nome', contactName || 'Cliente SDR')
                  conversa.set('ultima_mensagem_tipo', 'normal')
                  conversa.set('ultima_mensagem_data', new Date().toISOString())
                  const tot = conversa.getInt('total_mensagens') || 0
                  conversa.set('total_mensagens', tot + 1)

                  // Checar re-superfície
                  if (conversa.getString('status_sdr') === 'transferido') {
                    const respId = conversa.getString('responsavel_id')
                    let horasSemResp = 999
                    try {
                      const msgsResp = $app.findRecordsByFilter(
                        'chat_mensagens',
                        `conversa = '${conversa.id}' && autor = '${respId}' && direcao = 'saida'`,
                        '-created',
                        1,
                      )
                      if (msgsResp && msgsResp.length > 0) {
                        const lastDate = new Date(msgsResp[0].getString('created'))
                        horasSemResp = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60)
                      } else {
                        const transDate = conversa.getString('transferido_em')
                          ? new Date(conversa.getString('transferido_em'))
                          : new Date(conversa.getString('created'))
                        horasSemResp = (Date.now() - transDate.getTime()) / (1000 * 60 * 60)
                      }
                    } catch (_) {}

                    if (horasSemResp >= 24) {
                      conversa.set('status_sdr', 're_superficie')
                    }
                  }

                  $app.save(conversa)

                  totalProcessadas++

                  // Acionamento do Bot SDR se a conversa estiver com o Admin
                  if (adminId && conversa.getString('responsavel_id') === adminId) {
                    try {
                      let botAtivo = true
                      let botNome = 'SDR Virtual Grupo ABR'
                      let botPromptExtra = ''
                      let msgForaExpedienteCustom = ''
                      try {
                        const cfg = $app.findFirstRecordByData(
                          'configuracoes',
                          'chave',
                          'sdr_bot_config',
                        )
                        if (cfg) {
                          const v = cfg.get('valor') || {}
                          if (v.ativo === false) botAtivo = false
                          if (v.nome_sdr) botNome = v.nome_sdr
                          if (v.instrucoes) botPromptExtra = ` Diretrizes do Admin: ${v.instrucoes}`
                          if (v.mensagem_fora_expediente)
                            msgForaExpedienteCustom = v.mensagem_fora_expediente
                        }
                      } catch (_) {}

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

                      if (ehForaExpediente) {
                        if (botAtivo) {
                          const textoFora =
                            msgForaExpedienteCustom ||
                            'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!'

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
                          conversa.set(
                            'total_mensagens',
                            (conversa.getInt('total_mensagens') || 0) + 1,
                          )
                          $app.save(conversa)

                          try {
                            const triCol = $app.findCollectionByNameOrId('sdr_triagens_log')
                            const triRec = new Record(triCol)
                            triRec.set('cliente_nome', contactName || 'Cliente WhatsApp SDR')
                            triRec.set('telefone', conversa.getString('kommo_phone'))
                            triRec.set('telefone_limpo', conversa.getString('kommo_phone_clean'))
                            triRec.set('canal', 'WhatsApp SDR (35) 99770-9232')
                            triRec.set('classificacao', 'FORA_EXPEDIENTE')
                            triRec.set('regiao_nome', 'Aguardando Expediente')
                            triRec.set('rota_destino', 'MATRIZ / ADMIN')
                            triRec.set('operador_destino', adminId)
                            triRec.set('operador_nome', 'Thiago Almeida (Admin)')
                            triRec.set('conversa', conversa.id)
                            triRec.set(
                              'motivo_decisao',
                              'Mensagem sincronizada manualmente fora do expediente comercial (7h às 18h).',
                            )
                            triRec.set('regra_aplicada', 'Fora de Expediente')
                            triRec.set('status_transferencia', 'agendado_proximo_expediente')
                            triRec.set('nota_kommo', '[SDR Grupo ABR]: Contato fora do expediente.')
                            triRec.set(
                              'conversa_resumo',
                              `Cliente: ${textoSalvar}\nBot: ${textoFora}`,
                            )
                            triRec.set('eh_simulacao', false)
                            $app.save(triRec)
                          } catch (_) {}
                        }
                      } else if (botAtivo) {
                        const isAudio =
                          textoSalvar.includes('[Áudio recebido]') ||
                          textoSalvar.toLowerCase().startsWith('[áudio]')
                        const isImage =
                          textoSalvar.includes('[Imagem recebida]') ||
                          textoSalvar.toLowerCase().startsWith('[imagem]')

                        if (isAudio || isImage) {
                          let fallbackAudioConfig =
                            'Recebi seu áudio! Para eu te atender mais rápido, pode me enviar por texto?'
                          let fallbackImagemConfig =
                            'Recebi sua imagem! Pode me descrever o que precisa por texto?'
                          try {
                            const cRec = $app.findFirstRecordByData(
                              'configuracoes',
                              'chave',
                              'sdr_bot_config',
                            )
                            if (cRec) {
                              const cv = cRec.get('valor') || {}
                              if (cv.fallback_audio) fallbackAudioConfig = cv.fallback_audio
                              if (cv.fallback_imagem) fallbackImagemConfig = cv.fallback_imagem
                            }
                          } catch (_) {}

                          const fallbackTexto = isAudio ? fallbackAudioConfig : fallbackImagemConfig
                          const rotulo = isAudio ? 'Áudio' : 'Imagem'

                          const botMsg = new Record(msgCol)
                          botMsg.set('conversa', conversa.id)
                          botMsg.set('autor', adminId)
                          botMsg.set('autor_nome', `${botNome} (${rotulo})`)
                          botMsg.set('autor_role', 'supervisor')
                          botMsg.set('texto', fallbackTexto)
                          botMsg.set('tipo', 'normal')
                          botMsg.set('direcao', 'saida')
                          botMsg.set('kommo_status', 'enviada')
                          botMsg.set('kommo_message_id', `sdr_sync_fallback_${Date.now()}`)
                          $app.save(botMsg)

                          conversa.set('ultima_mensagem_texto', fallbackTexto.slice(0, 97))
                          conversa.set('ultimo_autor_nome', botNome)
                          conversa.set(
                            'total_mensagens',
                            (conversa.getInt('total_mensagens') || 0) + 1,
                          )
                          $app.save(conversa)

                          try {
                            const triCol = $app.findCollectionByNameOrId('sdr_triagens_log')
                            const triRec = new Record(triCol)
                            triRec.set('cliente_nome', contactName || 'Cliente WhatsApp SDR')
                            triRec.set('telefone', conversa.getString('kommo_phone'))
                            triRec.set('telefone_limpo', conversa.getString('kommo_phone_clean'))
                            triRec.set('canal', 'WhatsApp SDR (35) 99770-9232')
                            triRec.set('classificacao', isAudio ? 'MIDIA_AUDIO' : 'MIDIA_IMAGEM')
                            triRec.set('regiao_nome', 'MATRIZ / ADMIN')
                            triRec.set('rota_destino', 'MATRIZ / ADMIN')
                            triRec.set('operador_destino', adminId)
                            triRec.set('operador_nome', 'Thiago Almeida (Admin)')
                            triRec.set('conversa', conversa.id)
                            triRec.set(
                              'motivo_decisao',
                              `${rotulo} recebido do cliente (sync manual). Respondido com fallback garantido.`,
                            )
                            triRec.set('regra_aplicada', `Fallback Garantido de ${rotulo}`)
                            triRec.set('status_transferencia', 'aguardando_texto_cliente')
                            triRec.set(
                              'nota_kommo',
                              `[SDR Grupo ABR]: Respondido com fallback de ${rotulo.toLowerCase()}.`,
                            )
                            triRec.set(
                              'conversa_resumo',
                              `[ORIGEM: ${rotulo.toUpperCase()}]\nCliente: <${rotulo.toLowerCase()}>\nBot: ${fallbackTexto}`,
                            )
                            triRec.set('eh_simulacao', false)
                            $app.save(triRec)
                          } catch (_) {}
                        } else {
                          try {
                            const agentRes = $ai.agent('sdr-triagem-bot').chat({
                              user_id: adminId,
                              message: `O cliente WhatsApp ${contactName || ''} enviou: "${textoSalvar}". Faça a triagem rápida de soluções siderúrgicas do Grupo ABR como ${botNome}. Qualifique se é Varejo ou Corporativo e a cidade/local de entrega.${botPromptExtra}`,
                            })
                            const aiReply =
                              agentRes && agentRes.content ? agentRes.content.trim() : ''
                            if (aiReply) {
                              const botMsg = new Record(msgCol)
                              botMsg.set('conversa', conversa.id)
                              botMsg.set('autor', adminId)
                              botMsg.set('autor_nome', `${botNome} (IA)`)
                              botMsg.set('autor_role', 'supervisor')
                              botMsg.set('texto', aiReply)
                              botMsg.set('tipo', 'normal')
                              botMsg.set('direcao', 'saida')
                              botMsg.set('kommo_status', 'enviada')
                              botMsg.set('kommo_message_id', `sdr_sync_ai_${Date.now()}`)
                              $app.save(botMsg)

                              conversa.set('ultima_mensagem_texto', aiReply.slice(0, 97))
                              conversa.set('ultimo_autor_nome', botNome)
                              conversa.set(
                                'total_mensagens',
                                (conversa.getInt('total_mensagens') || 0) + 1,
                              )
                              $app.save(conversa)
                            }
                          } catch (sdrAiErr) {
                            console.log('[kommo_sync] SDR AI fallback: ' + sdrAiErr.message)
                          }
                        }
                      }
                    } catch (sdrErr) {
                      console.log('[kommo_sync] Erro ao disparar SDR: ' + sdrErr.message)
                    }
                  }
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
