/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_messages_helper.js
 *
 * Helper compartilhado para extração de mensagens REAIS do WhatsApp Kommo CRM.
 * Estratégia em ordem de prioridade conforme especificação:
 * 1. GET /api/v4/talks?filter[entity_type]=lead&filter[entity_id][]={lead_id}
 *    -> Se encontrar talk: GET /api/v4/talks/{talk_id}/messages?limit=250
 * 2. Fallback: GET /api/v4/events?filter[entity]=lead&filter[entity_id]={lead_id}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message
 * 3. Fallback adicional de notas/anexos: GET /api/v4/leads/{lead_id}/notes?limit=30
 *
 * Cada mensagem normalizada possui:
 * - idExterno: ex. "kommo_talk_msg_{id}" ou "kommo_ev_{id}" ou "kommo_note_{id}"
 * - autorNome: nome de quem enviou ou 'Cliente WhatsApp SDR'
 * - texto: conteúdo textual ou representação amigável de anexo/áudio/imagem
 * - direcao: 'entrada' (cliente) ou 'saida' (equipe/bot/admin)
 * - timestamp: ISO string da criação da mensagem
 * - isMedia: boolean
 * - mediaType: 'audio' | 'imagem' | 'arquivo' | null
 * - mediaUrl: string
 */

function getKommoApiConfig() {
  const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
  const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
  const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
  const baseUrl = apiBaseUrlSecret
    ? apiBaseUrlSecret.endsWith('/')
      ? apiBaseUrlSecret.slice(0, -1)
      : apiBaseUrlSecret
    : `https://${subdomain}.kommo.com`

  return {
    subdomain: subdomain,
    accessToken: accessToken,
    baseUrl: baseUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }
}

/**
 * Busca e normaliza todas as mensagens REAIS do lead no Kommo.
 * Retorna array ordenado cronologicamente (mais antigas primeiro).
 */
function fetchKommoLeadMessagesUnified(leadId, contactNameFallback) {
  if (!leadId) return []
  const cfg = getKommoApiConfig()
  if (!cfg.accessToken) return []

  const leadIdStr = String(leadId).trim()
  const fallbackNome = contactNameFallback || 'Cliente WhatsApp SDR'
  const mensagensNormalizadas = []
  const seenExternalIds = {}

  // -------------------------------------------------------------
  // 1. TALKS API (WhatsApp direto do Kommo)
  // -------------------------------------------------------------
  let talkIds = []
  try {
    const talksRes = $http.send({
      url: `${cfg.baseUrl}/api/v4/talks?filter[entity_type]=lead&filter[entity_id][]=${leadIdStr}`,
      method: 'GET',
      headers: cfg.headers,
      timeout: 6,
    })

    if (talksRes && talksRes.statusCode >= 200 && talksRes.statusCode < 300) {
      const talks = talksRes.json?._embedded?.talks || []
      for (let t = 0; t < talks.length; t++) {
        const item = talks[t]
        const tid = item.talk_id || item.id
        if (tid && !talkIds.includes(tid)) {
          talkIds.push(tid)
        }
      }
    }
  } catch (talkErr) {
    console.log(
      '[kommo_messages_helper] Erro ao buscar talks do lead ' + leadIdStr + ': ' + talkErr.message,
    )
  }

  // Para cada talk encontrada, buscar até 250 mensagens
  for (let i = 0; i < talkIds.length; i++) {
    const currentTalkId = talkIds[i]
    try {
      const msgRes = $http.send({
        url: `${cfg.baseUrl}/api/v4/talks/${currentTalkId}/messages?limit=250`,
        method: 'GET',
        headers: cfg.headers,
        timeout: 8,
      })

      if (msgRes && msgRes.statusCode >= 200 && msgRes.statusCode < 300) {
        // A API de talks pode retornar array direto ou em _embedded.messages
        const rawList =
          msgRes.json?._embedded?.messages || (Array.isArray(msgRes.json) ? msgRes.json : []) || []

        for (let m = 0; m < rawList.length; m++) {
          const raw = rawList[m]
          const msgId = raw.id || raw.message_id || `talk_${currentTalkId}_${m}`
          const extId = `kommo_talk_msg_${msgId}`
          if (seenExternalIds[extId]) continue
          seenExternalIds[extId] = true

          // Direção
          // Kommo talks: 'incoming' / 'outgoing', ou origin / is_outgoing / author_type
          let direcao = 'entrada'
          const authorType = (raw.author_type || raw.type || '').toLowerCase()
          const isOutgoing =
            raw.direction === 'outgoing' ||
            raw.is_outgoing === true ||
            authorType === 'user' ||
            authorType === 'outgoing' ||
            authorType === 'manager' ||
            authorType === 'bot'
          if (isOutgoing) {
            direcao = 'saida'
          }

          // Conteúdo e mídia
          let texto = (raw.text || raw.message || '').trim()
          let isAudio = false
          let isImage = false
          let mediaUrl = ''

          const media = raw.media || raw.attachment || raw.file || null
          if (media) {
            mediaUrl = media.url || media.link || ''
            const mType = (media.type || raw.media_type || '').toLowerCase()
            if (mType.includes('audio') || mType.includes('voice')) isAudio = true
            else if (
              mType.includes('image') ||
              mType.includes('picture') ||
              mType.includes('photo')
            )
              isImage = true
          }

          if (!texto) {
            if (isAudio) texto = '🎙️ [Áudio recebido]'
            else if (isImage) texto = '🖼️ [Imagem recebida]'
            else if (media) texto = '📎 [Arquivo recebido]'
          }

          if (!texto && !media) continue

          // Timestamp
          let timestamp = new Date().toISOString()
          const rawTime = raw.created_at || raw.updated_at || raw.time
          if (rawTime) {
            timestamp =
              typeof rawTime === 'number'
                ? new Date(rawTime * 1000).toISOString()
                : new Date(rawTime).toISOString()
          }

          // Autor
          let autorNome =
            direcao === 'entrada'
              ? raw.author_name || raw.sender_name || fallbackNome
              : raw.author_name || 'Equipe / SDR'

          mensagensNormalizadas.push({
            idExterno: extId,
            autorNome: autorNome,
            texto: texto,
            direcao: direcao,
            timestamp: timestamp,
            isMedia: isAudio || isImage || Boolean(media),
            mediaType: isAudio ? 'audio' : isImage ? 'imagem' : media ? 'arquivo' : null,
            mediaUrl: mediaUrl,
            origem: 'kommo_talks',
          })
        }
      }
    } catch (msgErr) {
      console.log(
        '[kommo_messages_helper] Erro ao buscar mensagens da talk ' +
          currentTalkId +
          ': ' +
          msgErr.message,
      )
    }
  }

  // -------------------------------------------------------------
  // 2. EVENTS API (Fallback se talks vier vazia ou complementar)
  // -------------------------------------------------------------
  if (mensagensNormalizadas.length === 0) {
    try {
      const eventsRes = $http.send({
        url: `${cfg.baseUrl}/api/v4/events?filter[entity]=lead&filter[entity_id]=${leadIdStr}&filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message&limit=100`,
        method: 'GET',
        headers: cfg.headers,
        timeout: 6,
      })

      if (eventsRes && eventsRes.statusCode >= 200 && eventsRes.statusCode < 300) {
        const events = eventsRes.json?._embedded?.events || []
        for (let e = 0; e < events.length; e++) {
          const ev = events[e]
          const evId = ev.id || `${leadIdStr}_${e}`
          const extId = `kommo_ev_${evId}`
          if (seenExternalIds[extId]) continue
          seenExternalIds[extId] = true

          const evType = (ev.type || '').toLowerCase()
          const direcao = evType.includes('outgoing') ? 'saida' : 'entrada'

          // Extrair texto do evento
          let texto = ''
          const valAfter = ev.value_after || []
          if (Array.isArray(valAfter) && valAfter.length > 0) {
            texto = valAfter[0].message?.text || valAfter[0].text || ''
          }
          if (!texto && ev.params) {
            texto = ev.params.text || ev.params.message || ''
          }

          if (!texto) {
            texto = direcao === 'entrada' ? '💬 [Mensagem de WhatsApp]' : '💬 [Mensagem enviada]'
          }

          let timestamp = new Date().toISOString()
          if (ev.created_at) {
            timestamp =
              typeof ev.created_at === 'number'
                ? new Date(ev.created_at * 1000).toISOString()
                : new Date(ev.created_at).toISOString()
          }

          mensagensNormalizadas.push({
            idExterno: extId,
            autorNome: direcao === 'entrada' ? fallbackNome : 'Equipe / SDR',
            texto: texto.trim(),
            direcao: direcao,
            timestamp: timestamp,
            isMedia: false,
            mediaType: null,
            mediaUrl: '',
            origem: 'kommo_events',
          })
        }
      }
    } catch (evErr) {
      console.log(
        '[kommo_messages_helper] Erro ao buscar events do lead ' + leadIdStr + ': ' + evErr.message,
      )
    }
  }

  // -------------------------------------------------------------
  // 3. LEAD NOTES (Fallback final ou mensagens históricas de notas)
  // -------------------------------------------------------------
  if (mensagensNormalizadas.length === 0) {
    try {
      const notesRes = $http.send({
        url: `${cfg.baseUrl}/api/v4/leads/${leadIdStr}/notes?limit=30&order[created_at]=asc`,
        method: 'GET',
        headers: cfg.headers,
        timeout: 5,
      })

      if (notesRes && notesRes.statusCode >= 200 && notesRes.statusCode < 300) {
        const notes = notesRes.json?._embedded?.notes || []
        for (let n = 0; n < notes.length; n++) {
          const note = notes[n]
          const noteText = (note.params?.text || note.params?.message || '').trim()
          const noteType = note.note_type || ''
          const isAttachment = noteType === 'attachment'
          const fileName = (note.params?.file_name || note.params?.name || '').toLowerCase()

          let isAudio = false
          let isImage = false
          if (isAttachment) {
            if (
              fileName.endsWith('.ogg') ||
              fileName.endsWith('.mp3') ||
              fileName.endsWith('.wav') ||
              fileName.endsWith('.m4a') ||
              fileName.endsWith('.aac')
            ) {
              isAudio = true
            } else if (
              fileName.endsWith('.jpg') ||
              fileName.endsWith('.jpeg') ||
              fileName.endsWith('.png') ||
              fileName.endsWith('.webp') ||
              fileName.endsWith('.gif')
            ) {
              isImage = true
            }
          }

          if (!noteText && !isAttachment) continue

          const extId = `kommo_note_${note.id}`
          if (seenExternalIds[extId]) continue
          seenExternalIds[extId] = true

          // Identificar se a nota é de saída da equipe/admin
          let direcao = 'entrada'
          if (
            noteText.startsWith('[Resposta SDR') ||
            noteText.startsWith('[Mensagem enviada') ||
            noteText.startsWith('[SDR Grupo ABR') ||
            noteText.startsWith('[SDR Triagem')
          ) {
            direcao = 'saida'
          }

          const textoSalvar =
            noteText ||
            (isAudio
              ? '🎙️ [Áudio recebido]'
              : isImage
                ? '🖼️ [Imagem recebida]'
                : '📎 [Arquivo recebido]')

          let timestamp = new Date().toISOString()
          if (note.created_at) {
            timestamp =
              typeof note.created_at === 'number'
                ? new Date(note.created_at * 1000).toISOString()
                : new Date(note.created_at).toISOString()
          }

          mensagensNormalizadas.push({
            idExterno: extId,
            autorNome: direcao === 'entrada' ? fallbackNome : 'Equipe / SDR',
            texto: textoSalvar,
            direcao: direcao,
            timestamp: timestamp,
            isMedia: isAudio || isImage || isAttachment,
            mediaType: isAudio ? 'audio' : isImage ? 'imagem' : isAttachment ? 'arquivo' : null,
            mediaUrl: '',
            origem: 'kommo_notes',
          })
        }
      }
    } catch (notesErr) {
      console.log(
        '[kommo_messages_helper] Erro ao buscar notes do lead ' +
          leadIdStr +
          ': ' +
          notesErr.message,
      )
    }
  }

  // Ordenar mensagens do mais antigo para o mais recente pelo timestamp
  mensagensNormalizadas.sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  })

  return mensagensNormalizadas
}

/**
 * Salva mensagens normalizadas de forma IDEMPOTENTE na coleção `chat_mensagens`
 * usando `kommo_message_id`. Nunca duplica registros existentes.
 * Atualiza o resumo da conversa (total_mensagens, ultima_mensagem_texto, etc).
 * Retorna o número de novas mensagens gravadas.
 */
function upsertKommoMessagesIdempotent(conversa, mensagens, adminIdFallback) {
  if (!conversa || !conversa.id || !mensagens || mensagens.length === 0) {
    return 0
  }

  const msgCol = $app.findCollectionByNameOrId('chat_mensagens')
  let novasGravadas = 0
  let ultimaMsgProcessada = null

  for (let i = 0; i < mensagens.length; i++) {
    const item = mensagens[i]
    if (!item.idExterno) continue

    // Checagem de idempotência
    let existe = false
    try {
      const check = $app.findRecordsByFilter(
        'chat_mensagens',
        `kommo_message_id = '${item.idExterno}'`,
        '-created',
        1,
        0,
      )
      if (check && check.length > 0) {
        existe = true
      }
    } catch (_) {}

    if (existe) continue

    // Determinar autor e role
    let autorId = adminIdFallback || conversa.getString('responsavel_id') || ''
    let autorRole = 'operador'
    if (item.direcao === 'saida') {
      autorId = conversa.getString('responsavel_id') || adminIdFallback || ''
      autorRole = 'admin'
    }

    const rec = new Record(msgCol)
    rec.set('conversa', conversa.id)
    rec.set('autor', autorId)
    rec.set('autor_nome', item.autorNome || 'WhatsApp SDR')
    rec.set('autor_role', autorRole)
    rec.set('texto', item.texto)
    rec.set('tipo', 'normal')
    rec.set('direcao', item.direcao)
    rec.set('kommo_status', item.direcao === 'saida' ? 'enviada' : 'recebida')
    rec.set('kommo_message_id', item.idExterno)

    if (item.timestamp) {
      try {
        rec.set('created', item.timestamp)
      } catch (_) {}
    }

    $app.save(rec)
    novasGravadas++
    ultimaMsgProcessada = item
  }

  // Atualizar resumo da conversa se houve novas mensagens
  if (novasGravadas > 0 && ultimaMsgProcessada) {
    const totalAtual = conversa.getInt('total_mensagens') || 0
    conversa.set('total_mensagens', totalAtual + novasGravadas)
    conversa.set('ultima_mensagem_texto', ultimaMsgProcessada.texto.slice(0, 97))
    conversa.set('ultimo_autor_nome', ultimaMsgProcessada.autorNome)
    conversa.set('ultima_mensagem_tipo', 'normal')
    conversa.set('ultima_mensagem_data', ultimaMsgProcessada.timestamp || new Date().toISOString())

    // Regra de re-superfície: conversa transferida onde cliente enviou mensagem sem resposta há +24h
    if (
      conversa.getString('status_sdr') === 'transferido' &&
      ultimaMsgProcessada.direcao === 'entrada'
    ) {
      const respId = conversa.getString('responsavel_id')
      let horasSemResp = 999
      try {
        const msgsResp = $app.findRecordsByFilter(
          'chat_mensagens',
          `conversa = '${conversa.id}' && autor = '${respId}' && direcao = 'saida'`,
          '-created',
          1,
          0,
        )
        if (msgsResp && msgsResp.length > 0) {
          const dt = new Date(msgsResp[0].getString('created'))
          horasSemResp = (Date.now() - dt.getTime()) / (1000 * 60 * 60)
        } else {
          const transDt = conversa.getString('transferido_em')
            ? new Date(conversa.getString('transferido_em'))
            : new Date(conversa.getString('created'))
          horasSemResp = (Date.now() - transDt.getTime()) / (1000 * 60 * 60)
        }
      } catch (_) {}

      if (horasSemResp >= 24) {
        conversa.set('status_sdr', 're_superficie')
      }
    }

    $app.save(conversa)
  }

  return novasGravadas
}

// Exportação CommonJS compatível com require(`${__hooks}/kommo_messages_helper.js`)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getKommoApiConfig: getKommoApiConfig,
    fetchKommoLeadMessagesUnified: fetchKommoLeadMessagesUnified,
    upsertKommoMessagesIdempotent: upsertKommoMessagesIdempotent,
  }
}
