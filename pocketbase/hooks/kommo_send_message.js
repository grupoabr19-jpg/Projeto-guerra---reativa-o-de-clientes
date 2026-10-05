/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_send_message.js
 *
 * Envio de respostas do Hub de Atendimento para o Kommo CRM / WhatsApp:
 * Rota: POST /backend/v1/kommo/send-message
 *
 * Permissões:
 * - Apenas administradores autenticados (Thiago Almeida)
 *
 * Fluxo de Envio:
 * 1. Verifica flag de segurança (modo de escrita liberado)
 * 2. Valida conversa e telefone de destino
 * 3. Envia para a API da Kommo (tenta endpoint de Talk/Chat ou insere nota de serviço no Lead)
 * 4. Grava a mensagem em `chat_mensagens` local com direcao='saida', autor=admin, kommo_status='enviada'
 * 5. Registra auditoria completa em `eventos_log`
 * 6. Se falhar, retorna erro transparente com mensagem descritiva para a interface sem enganar o usuário.
 */

const {
  cleanPhoneNumber,
  getKommoConfig,
  getKommoHeaders,
  auditKommoAction,
  getAdminUser,
} = require(`${__hooks}/kommo_client.js`)

routerAdd(
  'POST',
  '/backend/v1/kommo/send-message',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error: 'Apenas administradores podem enviar respostas via Kommo WhatsApp.',
        })
      }

      const body = e.requestInfo().body || {}
      const conversaId = (body.conversaId || '').toString().trim()
      const texto = (body.texto || '').toString().trim()

      if (!conversaId) {
        return e.json(400, { error: 'conversaId é obrigatório.' })
      }
      if (!texto) {
        return e.json(400, { error: 'O texto da mensagem não pode ser vazio.' })
      }

      // 1. Carregar conversa
      let conversa = null
      try {
        conversa = $app.findRecordById('chat_conversas', conversaId)
      } catch (_) {
        return e.json(404, { error: 'Conversa não encontrada.' })
      }

      const cfg = getKommoConfig()

      if (cfg.isReadonly) {
        return e.json(403, {
          error:
            'O sistema está com o modo somente-leitura ativo. Nenhuma escrita ou mensagem pode ser enviada ao Kommo.',
          somente_leitura: true,
        })
      }

      if (!cfg.isConfigured) {
        return e.json(400, {
          error:
            'Credenciais do Kommo CRM não configuradas (KOMMO_SUBDOMAIN ou KOMMO_ACCESS_TOKEN ausentes).',
          configured: false,
        })
      }

      const headers = getKommoHeaders(cfg.accessToken)
      const leadId = conversa.getString('kommo_lead_id')
      const contactId = conversa.getString('kommo_contact_id')
      const chatId = conversa.getString('kommo_chat_id')
      const telefone = conversa.getString('kommo_phone')

      let envioSucesso = false
      let respostaKommo = null
      let endpointUtilizado = ''
      let kommoMessageId = ''
      let detalheErro = ''

      // Tentativa 1: Envio via Talks / Chats API se houver chatId
      if (chatId) {
        try {
          endpointUtilizado = `/api/v4/talks/${chatId}/messages`
          const talkRes = $http.send({
            url: `${cfg.baseUrl}${endpointUtilizado}`,
            method: 'POST',
            headers: headers,
            data: JSON.stringify({
              text: texto,
            }),
            timeout: 8,
          })
          if (talkRes && talkRes.statusCode >= 200 && talkRes.statusCode < 300) {
            envioSucesso = true
            respostaKommo = talkRes.json
            kommoMessageId = String(talkRes.json?.id || `talk_msg_${Date.now()}`)
          } else {
            detalheErro = `Tentativa Talk API falhou com HTTP ${talkRes ? talkRes.statusCode : 0}`
          }
        } catch (errTalk) {
          detalheErro = `Erro Talk API: ${errTalk.message}`
        }
      }

      // Tentativa 2: Adicionar nota de serviço / mensagem oficial no Lead ou Contato
      // Endpoint oficial da API v4: POST /api/v4/leads/{id}/notes ou /api/v4/contacts/{id}/notes
      if (!envioSucesso && leadId) {
        try {
          endpointUtilizado = `/api/v4/leads/${leadId}/notes`
          const notePayload = [
            {
              note_type: 'common',
              params: {
                text: `[Mensagem enviada via Hub de Atendimento pelo Admin Thiago Almeida]:\n${texto}`,
              },
            },
          ]
          const noteRes = $http.send({
            url: `${cfg.baseUrl}${endpointUtilizado}`,
            method: 'POST',
            headers: headers,
            data: JSON.stringify(notePayload),
            timeout: 8,
          })

          if (noteRes && noteRes.statusCode >= 200 && noteRes.statusCode < 300) {
            envioSucesso = true
            respostaKommo = noteRes.json
            const embedded = noteRes.json?._embedded?.notes || []
            if (embedded.length > 0 && embedded[0].id) {
              kommoMessageId = `kommo_note_${embedded[0].id}`
            } else {
              kommoMessageId = `kommo_note_${Date.now()}`
            }
          } else {
            const code = noteRes ? noteRes.statusCode : 0
            detalheErro = `API do Kommo respondeu com HTTP ${code} ao gravar nota de mensagem no Lead #${leadId}`
          }
        } catch (errNote) {
          detalheErro = `Erro de conexão ao enviar nota para Lead: ${errNote.message}`
        }
      }

      // Tentativa 3: Se não tem leadId mas tem contactId
      if (!envioSucesso && contactId) {
        try {
          endpointUtilizado = `/api/v4/contacts/${contactId}/notes`
          const contactNotePayload = [
            {
              note_type: 'common',
              params: {
                text: `[Mensagem WhatsApp enviada via Hub de Atendimento pelo Admin Thiago Almeida]:\n${texto}`,
              },
            },
          ]
          const contactNoteRes = $http.send({
            url: `${cfg.baseUrl}${endpointUtilizado}`,
            method: 'POST',
            headers: headers,
            data: JSON.stringify(contactNotePayload),
            timeout: 8,
          })

          if (
            contactNoteRes &&
            contactNoteRes.statusCode >= 200 &&
            contactNoteRes.statusCode < 300
          ) {
            envioSucesso = true
            respostaKommo = contactNoteRes.json
            kommoMessageId = `kommo_contact_note_${Date.now()}`
          } else {
            const code = contactNoteRes ? contactNoteRes.statusCode : 0
            detalheErro = `API do Kommo respondeu com HTTP ${code} no Contato #${contactId}`
          }
        } catch (errContact) {
          detalheErro = `Erro de conexão ao enviar nota para Contato: ${errContact.message}`
        }
      }

      // Se todas as tentativas falharam
      if (!envioSucesso) {
        auditKommoAction(
          'falha_envio_mensagem',
          {
            conversa_id: conversaId,
            lead_id: leadId,
            contact_id: contactId,
            telefone: telefone,
            texto: texto,
            erro: detalheErro || 'Não foi possível despachar mensagem para nenhum canal Kommo.',
          },
          authRecord.id,
        )

        return e.json(502, {
          ok: false,
          error:
            'Não foi possível enviar a mensagem para a API do Kommo CRM. ' +
            (detalheErro ||
              'Verifique se o lead/contato ainda existe e se o token possui permissão de escrita.'),
          detalhe: detalheErro,
        })
      }

      // Gravar mensagem local no chat_mensagens
      const msgCol = $app.findCollectionByNameOrId('chat_mensagens')
      const msg = new Record(msgCol)
      msg.set('conversa', conversaId)
      msg.set('autor', authRecord.id)
      msg.set('autor_nome', authRecord.getString('name') || 'Thiago Almeida (Admin)')
      msg.set('autor_role', 'admin')
      msg.set('texto', texto)
      msg.set('tipo', 'normal')
      msg.set('direcao', 'saida')
      msg.set('kommo_status', 'enviada')
      msg.set('kommo_message_id', kommoMessageId)
      $app.save(msg)

      // Atualizar dados da conversa
      conversa.set('ultima_mensagem_texto', texto.length > 100 ? texto.slice(0, 97) + '...' : texto)
      conversa.set('ultimo_autor_nome', authRecord.getString('name') || 'Thiago Almeida (Admin)')
      conversa.set('ultima_mensagem_tipo', 'normal')
      conversa.set('ultima_mensagem_data', new Date().toISOString())
      const total = conversa.getInt('total_mensagens') || 0
      conversa.set('total_mensagens', total + 1)
      $app.save(conversa)

      // Registrar auditoria de sucesso
      auditKommoAction(
        'mensagem_enviada',
        {
          conversa_id: conversaId,
          mensagem_id: msg.id,
          kommo_message_id: kommoMessageId,
          endpoint: endpointUtilizado,
          lead_id: leadId,
          contact_id: contactId,
          telefone: telefone,
          texto_preview: texto.slice(0, 80),
        },
        authRecord.id,
      )

      return e.json(200, {
        ok: true,
        message: 'Mensagem enviada com sucesso ao Kommo CRM.',
        endpoint_utilizado: endpointUtilizado,
        mensagem: {
          id: msg.id,
          conversa: msg.getString('conversa'),
          autor: msg.getString('autor'),
          autor_nome: msg.getString('autor_nome'),
          autor_role: msg.getString('autor_role'),
          texto: msg.getString('texto'),
          tipo: msg.getString('tipo'),
          direcao: msg.getString('direcao'),
          kommo_status: msg.getString('kommo_status'),
          kommo_message_id: msg.getString('kommo_message_id'),
          created: msg.getString('created'),
          updated: msg.getString('updated'),
        },
      })
    } catch (err) {
      console.log('[kommo_send_message] Erro interno: ' + err.message)
      return e.json(500, { error: 'Erro interno ao processar envio: ' + err.message })
    }
  },
  $apis.requireAuth(),
)
