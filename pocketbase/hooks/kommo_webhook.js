/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_webhook.js
 *
 * Endpoint público para recepção de webhooks do Kommo CRM.
 * URL: POST /backend/v1/kommo/webhook
 *
 * Processa mensagens e leads novos da linha SDR (35 99770-9232) e
 * os injeta no Hub de Atendimento em tempo real.
 * Aciona o Skip Cloud AI Agent 'sdr-triagem-bot' para triagem automática
 * e executa transferência inteligente para o vendedor responsável
 * (VARE vs VCORP / 8 rotas + Atacado por DDD ou carteira da base local).
 */

routerAdd('POST', '/backend/v1/kommo/webhook', (e) => {
  try {
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

    const auditAction = (action, details, userId) => {
      try {
        console.log(`[kommo_webhook] [AUDIT] ${action}: ` + JSON.stringify(details))
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        if (userId) ev.set('usuario', userId)
        ev.set('acao', `kommo_${action}`)
        ev.set('detalhes', {
          action: action,
          ...details,
          timestamp: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (err) {
        console.log('[kommo_webhook] Falha ao registrar log de auditoria: ' + err.message)
      }
    }

    let adminRecord = null
    try {
      adminRecord = $app.findFirstRecordByData('users', 'role', 'admin')
    } catch (_) {}
    const adminId = adminRecord ? adminRecord.id : ''

    const rawBody = e.requestInfo().body || {}
    console.log(
      '[kommo_webhook] Recebido payload de webhook: ' + JSON.stringify(rawBody).slice(0, 300),
    )

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

      let clienteRecord = null
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
          if (cliRecs && cliRecs.length > 0) {
            clienteRecord = cliRecs[0]
            clienteId = clienteRecord.id
          }
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
        if (clienteId && !conversa.get('cliente_id')) {
          conversa.set('cliente_id', clienteId)
          mudou = true
        }
        if (mudou) $app.save(conversa)
      }

      return { conversa, clienteRecord }
    }

    // Helper para transferir conversa para vendedor responsável
    const processarTransferenciaVendedor = (conversa, clienteRecord, textoMensagem) => {
      try {
        // Verificar se o Bot SDR está ativo nas configurações
        let sdrAtivo = true
        let sdrNome = 'SDR Virtual Grupo ABR'
        try {
          const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
          if (cfg) {
            const v = cfg.get('valor') || {}
            if (v.ativo === false) sdrAtivo = false
            if (v.nome_sdr) sdrNome = v.nome_sdr
          }
        } catch (_) {}

        if (!sdrAtivo) {
          console.log('[kommo_webhook] Bot SDR pausado. Conversa mantida com Admin.')
          return
        }

        let vendedorAlvo = null
        let motivoTransferencia = ''
        let regraAplicada = ''
        let classificacao = 'SEM_ROTA'
        let rotaDestino = ''

        // 1. Se cliente já existe na base, identificar carteira e vendedor
        if (clienteRecord) {
          const vendedorBase = (clienteRecord.getString('vendedor') || '').trim()
          const tipoVendedor = (clienteRecord.getString('tipo_vendedor') || '').toUpperCase()
          const regiaoCliente = (clienteRecord.getString('regiao') || '').trim()

          if (regiaoCliente.toUpperCase() === 'ATACADO') {
            classificacao = 'ATACADO'
            rotaDestino = 'ATACADO'
            const ddd = clienteRecord.getString('ddd_telefone') || ''
            let nomeAlvoAtacado = ''
            if (['11', '12', '13'].includes(ddd)) nomeAlvoAtacado = 'Larissa Terra'
            else if (['15', '19'].includes(ddd)) nomeAlvoAtacado = 'Julio Melo'
            else if (['14', '16', '17', '18'].includes(ddd)) nomeAlvoAtacado = 'Wilson Neto'

            if (nomeAlvoAtacado) {
              try {
                const atacadoUsers = $app.findRecordsByFilter(
                  'users',
                  `name ~ '${nomeAlvoAtacado.split(' ')[0]}' && (role = 'operador' || role = 'lider')`,
                  '-created',
                  1,
                )
                if (atacadoUsers && atacadoUsers.length > 0) {
                  vendedorAlvo = atacadoUsers[0]
                  motivoTransferencia = `Fila ATACADO (DDD ${ddd})`
                  regraAplicada = 'Base Clientes -> Região ATACADO'
                }
              } catch (_) {}
            }
          } else if (vendedorBase) {
            let nomeLimpo = vendedorBase
            const pfxList = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ']
            for (let px = 0; px < pfxList.length; px++) {
              if (nomeLimpo.startsWith(pfxList[px])) {
                nomeLimpo = nomeLimpo.slice(pfxList[px].length).trim()
                break
              }
            }

            classificacao =
              vendedorBase.startsWith('VCORP') || tipoVendedor === 'CORPORATIVO' ? 'VCORP' : 'VARE'
            rotaDestino = regiaoCliente || 'Geral'

            try {
              const userMatches = $app.findRecordsByFilter(
                'users',
                `name ~ '${nomeLimpo}' && (role = 'operador' || role = 'lider')`,
                '-created',
                1,
              )
              if (userMatches && userMatches.length > 0) {
                vendedorAlvo = userMatches[0]
                motivoTransferencia = `Carteira prévia (${classificacao} - ${vendedorBase} / Rota: ${rotaDestino})`
                regraAplicada = 'Base Clientes -> Carteira Prévia'
              }
            } catch (_) {}
          }
        }

        // 2. Se não tem cliente na base, analisar DDD e texto para rota
        if (!vendedorAlvo) {
          const cleanPhone = conversa.getString('kommo_phone_clean') || ''
          let ddd = ''
          if (cleanPhone.length >= 10) {
            let s = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone
            ddd = s.slice(0, 2)
          }

          const txt = (textoMensagem || '').toLowerCase()
          const mapaRotas = [
            {
              rota: 'BRAGANÇA',
              cidades: [
                'bragança',
                'braganca',
                'atibaia',
                'piracaia',
                'nazaré',
                'vargem',
                'mairiporã',
              ],
            },
            {
              rota: 'JUNDIAÍ',
              cidades: [
                'jundiaí',
                'jundiai',
                'itatiba',
                'jarinu',
                'várzea paulista',
                'campo limpo',
                'itupeva',
              ],
            },
            {
              rota: 'VARGINHA',
              cidades: ['varginha', 'três pontas', 'três corações', 'elói mendes', 'paraguaçu'],
            },
            {
              rota: 'POUSO ALEGRE',
              cidades: ['pouso alegre', 'jacutinga', 'borda da mata', 'bueno brandão', 'caxambu'],
            },
            {
              rota: 'POÇOS DE CALDAS',
              cidades: [
                'poços de caldas',
                'pocos de caldas',
                'alfenas',
                'machado',
                'caldas',
                'ouro fino',
              ],
            },
            {
              rota: 'ITAJUBÁ',
              cidades: ['itajubá', 'itajuba', 'santa rita', 'pedralva', 'maria da fé'],
            },
            {
              rota: 'EXTREMA',
              cidades: ['extrema', 'toledo', 'munhoz', 'pedra bela', 'socorro', 'serra negra'],
            },
            {
              rota: 'CAMBUÍ',
              cidades: ['cambuí', 'cambui', 'bom repouso', 'estiva', 'camanducaia', 'monte verde'],
            },
          ]

          let rotaEncontrada = null
          for (let r = 0; r < mapaRotas.length; r++) {
            if (mapaRotas[r].cidades.some((c) => txt.includes(c))) {
              rotaEncontrada = mapaRotas[r].rota
              break
            }
          }

          if (rotaEncontrada) {
            rotaDestino = rotaEncontrada
            const isVcorp = [
              'empresa',
              'cnpj',
              'indústria',
              'revenda',
              'construtora',
              'serralheria',
              'tonelada',
            ].some((k) => txt.includes(k))
            classificacao = isVcorp ? 'VCORP' : 'VARE'

            try {
              const regRecs = $app.findRecordsByFilter(
                'regioes',
                `nome = '${rotaDestino}'`,
                '-created',
                1,
              )
              if (regRecs && regRecs.length > 0) {
                const targetName = isVcorp
                  ? regRecs[0].getString('corporativo') || regRecs[0].getString('especialista')
                  : regRecs[0].getString('especialista') || regRecs[0].getString('vendedor_externo')
                if (targetName) {
                  const uRecs = $app.findRecordsByFilter(
                    'users',
                    `name ~ '${targetName.trim().split(' ')[0]}'`,
                    '-created',
                    1,
                  )
                  if (uRecs && uRecs.length > 0) {
                    vendedorAlvo = uRecs[0]
                    motivoTransferencia = `Detecção Geográfica (Rota ${rotaDestino} - ${classificacao})`
                    regraAplicada = `Rota ${rotaDestino}`
                  }
                }
              }
            } catch (_) {}
          } else if (ddd && ['11', '12', '13', '14', '15', '16', '17', '18', '19'].includes(ddd)) {
            classificacao = 'ATACADO'
            rotaDestino = 'ATACADO'
            let nomeAlvo = ''
            if (['11', '12', '13'].includes(ddd)) nomeAlvo = 'Larissa Terra'
            else if (['15', '19'].includes(ddd)) nomeAlvo = 'Julio Melo'
            else nomeAlvo = 'Wilson Neto'

            try {
              const uRecs = $app.findRecordsByFilter(
                'users',
                `name ~ '${nomeAlvo.split(' ')[0]}'`,
                '-created',
                1,
              )
              if (uRecs && uRecs.length > 0) {
                vendedorAlvo = uRecs[0]
                motivoTransferencia = `Fila ATACADO (DDD ${ddd})`
                regraAplicada = 'DDD ATACADO'
              }
            } catch (_) {}
          }
        }

        // Se identificou vendedor alvo diferente do responsável atual
        if (vendedorAlvo && vendedorAlvo.id !== conversa.getString('responsavel_id')) {
          conversa.set('responsavel_id', vendedorAlvo.id)
          const parts = conversa.get('participantes') || []
          if (!parts.includes(vendedorAlvo.id)) {
            parts.push(vendedorAlvo.id)
            conversa.set('participantes', parts)
          }
          $app.save(conversa)

          // Registrar mensagem/aviso de transferência no chat
          const avisoTransferencia = `[SDR Triagem] Transferido para ${vendedorAlvo.getString('name')} — ${motivoTransferencia}`
          const m = new Record(msgCol)
          m.set('conversa', conversa.id)
          m.set('autor', adminId || vendedorAlvo.id)
          m.set('autor_nome', `${sdrNome} (Triagem)`)
          m.set('autor_role', 'supervisor')
          m.set('texto', avisoTransferencia)
          m.set('tipo', 'aviso')
          m.set('direcao', 'saida')
          m.set('kommo_status', 'enviada')
          m.set('kommo_message_id', `transfer_${Date.now()}`)
          $app.save(m)

          const kommoUserIdAlvo = vendedorAlvo.getString('kommo_user_id') || ''
          const leadId = conversa.getString('kommo_lead_id')
          const notaKommoTexto = `[SDR Triagem Grupo ABR]: Transferido para ${vendedorAlvo.getString('name')}. Regra: ${regraAplicada}. Motivo: ${motivoTransferencia}.`

          // Registrar auditoria na coleção sdr_triagens_log
          try {
            const triCol = $app.findCollectionByNameOrId('sdr_triagens_log')
            const triRec = new Record(triCol)
            triRec.set('cliente_nome', conversa.getString('titulo') || 'Cliente WhatsApp SDR')
            triRec.set('telefone', conversa.getString('kommo_phone'))
            triRec.set('telefone_limpo', conversa.getString('kommo_phone_clean'))
            triRec.set('canal', 'WhatsApp SDR (35) 99770-9232')
            triRec.set('classificacao', classificacao)
            triRec.set('regiao_nome', rotaDestino)
            triRec.set('rota_destino', rotaDestino)
            triRec.set('operador_destino', vendedorAlvo.id)
            triRec.set('operador_nome', vendedorAlvo.getString('name'))
            triRec.set('kommo_user_id', kommoUserIdAlvo)
            triRec.set('kommo_lead_id', leadId)
            triRec.set('conversa', conversa.id)
            triRec.set('motivo_decisao', motivoTransferencia)
            triRec.set('regra_aplicada', regraAplicada)
            triRec.set('status_transferencia', 'sucesso')
            triRec.set('nota_kommo', notaKommoTexto)
            triRec.set('conversa_resumo', textoMensagem || '')
            triRec.set('eh_simulacao', false)
            $app.save(triRec)
          } catch (trLogErr) {
            console.log('[kommo_webhook] Falha ao registrar sdr_triagens_log: ' + trLogErr.message)
          }

          // Se lead existe no Kommo, atualizar responsável e/ou nota
          if (leadId) {
            try {
              const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
              const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
              const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
              const baseUrl = apiBaseUrlSecret
                ? apiBaseUrlSecret.endsWith('/')
                  ? apiBaseUrlSecret.slice(0, -1)
                  : apiBaseUrlSecret
                : `https://${subdomain}.kommo.com`

              if (subdomain && accessToken) {
                const headers = {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                }

                // 1. Inserir nota de auditoria da triagem no Lead Kommo
                $http.send({
                  url: `${baseUrl}/api/v4/leads/${leadId}/notes`,
                  method: 'POST',
                  headers: headers,
                  data: JSON.stringify([
                    {
                      note_type: 'common',
                      params: { text: notaKommoTexto },
                    },
                  ]),
                  timeout: 5,
                })

                // 2. Se houver kommo_user_id vinculado, atualizar responsible_user_id do Lead no Kommo
                if (kommoUserIdAlvo) {
                  $http.send({
                    url: `${baseUrl}/api/v4/leads/${leadId}`,
                    method: 'PATCH',
                    headers: headers,
                    data: JSON.stringify({
                      responsible_user_id: parseInt(kommoUserIdAlvo, 10),
                    }),
                    timeout: 5,
                  })
                }
              }
            } catch (kLeadErr) {
              console.log('[kommo_webhook] Aviso ao sincronizar lead no Kommo: ' + kLeadErr.message)
            }
          }

          auditAction(
            'conversa_transferida_sdr',
            {
              conversa_id: conversa.id,
              vendedor_id: vendedorAlvo.id,
              vendedor_nome: vendedorAlvo.getString('name'),
              kommo_user_id: kommoUserIdAlvo,
              motivo: motivoTransferencia,
            },
            adminId,
          )
        }
      } catch (trErr) {
        console.log('[kommo_webhook] Aviso na transferência: ' + trErr.message)
      }
    }

    // Helper inline para registrar mensagem e acionar IA SDR se couber
    const registrarMensagem = (conversa, texto, autorNome, msgId, clienteRecord) => {
      if (!conversa || !conversa.id || !texto) return
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
      m.set('conversa', conversa.id)
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
        conversa.set('ultima_mensagem_texto', texto.slice(0, 97))
        conversa.set('ultimo_autor_nome', autorNome || 'Cliente (WhatsApp SDR)')
        conversa.set('ultima_mensagem_tipo', 'normal')
        conversa.set('ultima_mensagem_data', new Date().toISOString())
        const tot = conversa.getInt('total_mensagens') || 0
        conversa.set('total_mensagens', tot + 1)
        $app.save(conversa)
      } catch (_) {}

      // Executar transferência se aplicável
      processarTransferenciaVendedor(conversa, clienteRecord, texto)

      // Se a conversa ainda estiver sob o admin e for mensagem recente de entrada,
      // aciona o Skip Cloud AI Agent nativo 'sdr-triagem-bot' para responder e qualificar
      if (adminId && conversa.getString('responsavel_id') === adminId) {
        // Checar se o bot está ativo e ler saudação/instruções das configurações
        let botAtivo = true
        let botPromptExtra = ''
        let botNome = 'SDR Virtual Grupo ABR'
        try {
          const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
          if (cfg) {
            const v = cfg.get('valor') || {}
            if (v.ativo === false) botAtivo = false
            if (v.nome_sdr) botNome = v.nome_sdr
            if (v.instrucoes) botPromptExtra = ` Diretrizes do Admin: ${v.instrucoes}`
          }
        } catch (_) {}

        if (!botAtivo) {
          console.log('[kommo_webhook] Bot SDR inativo. Resposta IA pulada.')
          return
        }

        try {
          const agentRes = $ai.agent('sdr-triagem-bot').chat({
            user_id: adminId,
            message: `O cliente WhatsApp ${autorNome || ''} enviou: "${texto}". Faça a triagem rápida de soluções siderúrgicas do Grupo ABR como ${botNome}. Qualifique se é Varejo ou Corporativo e a cidade/local de entrega.${botPromptExtra}`,
          })

          const aiReply = agentRes && agentRes.content ? agentRes.content.trim() : ''
          if (aiReply) {
            // Registrar resposta do agente no chat local
            const botMsg = new Record(msgCol)
            botMsg.set('conversa', conversa.id)
            botMsg.set('autor', adminId)
            botMsg.set('autor_nome', 'SDR Virtual Grupo ABR (IA)')
            botMsg.set('autor_role', 'supervisor')
            botMsg.set('texto', aiReply)
            botMsg.set('tipo', 'normal')
            botMsg.set('direcao', 'saida')
            botMsg.set('kommo_status', 'enviada')
            botMsg.set('kommo_message_id', `sdr_ai_${Date.now()}`)
            $app.save(botMsg)

            conversa.set('ultima_mensagem_texto', aiReply.slice(0, 97))
            conversa.set('ultimo_autor_nome', 'SDR Virtual Grupo ABR')
            conversa.set('ultima_mensagem_tipo', 'normal')
            conversa.set('ultima_mensagem_data', new Date().toISOString())
            const totBot = conversa.getInt('total_mensagens') || 0
            conversa.set('total_mensagens', totBot + 1)
            $app.save(conversa)

            // Tentar enviar a resposta do bot para o Kommo CRM (Talks / Notes)
            try {
              const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
              const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
              const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
              const baseUrl = apiBaseUrlSecret
                ? apiBaseUrlSecret.endsWith('/')
                  ? apiBaseUrlSecret.slice(0, -1)
                  : apiBaseUrlSecret
                : `https://${subdomain}.kommo.com`

              if (subdomain && accessToken) {
                const headers = {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                }
                const chatId = conversa.getString('kommo_chat_id')
                const leadId = conversa.getString('kommo_lead_id')
                if (chatId) {
                  $http.send({
                    url: `${baseUrl}/api/v4/talks/${chatId}/messages`,
                    method: 'POST',
                    headers: headers,
                    data: JSON.stringify({ text: aiReply }),
                    timeout: 5,
                  })
                } else if (leadId) {
                  $http.send({
                    url: `${baseUrl}/api/v4/leads/${leadId}/notes`,
                    method: 'POST',
                    headers: headers,
                    data: JSON.stringify([
                      {
                        note_type: 'common',
                        params: { text: `[Resposta SDR Virtual Grupo ABR]:\n${aiReply}` },
                      },
                    ]),
                    timeout: 5,
                  })
                }
              }
            } catch (kErr) {
              console.log('[kommo_webhook] Falha no envio externo da resposta IA: ' + kErr.message)
            }
          }
        } catch (aiErr) {
          console.log('[kommo_webhook] IA SDR ignorada/fallback: ' + aiErr.message)
        }
      }
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
        const { conversa, clienteRecord } = obterOuCriarConversa(
          phone || KOMMO_SDR_PHONE_TARGET,
          contactName,
          '',
          lead.id,
          '',
        )
        registrarMensagem(
          conversa,
          `[Lead Kommo] ${lead.name || 'Lead SDR'} (Etapa: ${lead.status_id || 'Entrada'})`,
          contactName || 'Kommo SDR',
          `webhook_lead_${lead.id}_${Date.now()}`,
          clienteRecord,
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

    // Caso 3: Mensagens de chat (message[add] ou talk)
    const msgPayload = rawBody.message || rawBody.talk || {}
    const addedMsgs = msgPayload.add || []
    const msgsArray = Array.isArray(addedMsgs) ? addedMsgs : Object.values(addedMsgs)

    for (let m = 0; m < msgsArray.length; m++) {
      const item = msgsArray[m]
      const text = item.text || item.message || ''
      const phone = item.phone || item.contact_phone || ''
      const senderName = item.sender_name || item.name || 'Cliente WhatsApp SDR'
      if (text) {
        const { conversa, clienteRecord } = obterOuCriarConversa(
          phone || KOMMO_SDR_PHONE_TARGET,
          senderName,
          '',
          '',
          item.chat_id || item.talk_id || '',
        )
        registrarMensagem(
          conversa,
          text,
          senderName,
          item.id ? String(item.id) : `webhook_msg_${Date.now()}`,
          clienteRecord,
        )
        eventosProcessados++
      }
    }

    auditAction(
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
