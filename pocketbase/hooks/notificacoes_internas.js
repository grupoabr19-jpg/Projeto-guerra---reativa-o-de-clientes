/// <reference path="../pb_data/types.d.ts" />

/**
 * Motor de Notificações Internas Automáticas do Projeto Guerra.
 *
 * MUDANÇA ARQUITETURAL (v0.0.92):
 * Notificações 1:1 privadas do Sistema (follow-ups, resumo matinal, parabenização individual)
 * NÃO criam mais conversas no chat (CA)! Elas são salvas diretamente na coleção `notificacoes_enviadas`
 * e alimentam o novo PAINEL EFÊMERO DE NOTIFICAÇÕES (estilo escondidinho: você lê, clica ou descarta e ela SOME).
 *
 * O Canal Geral (chat coletivo) continua recebendo anúncios oficiais do admin e celebrações
 * de conquistas de ranking a partir de nível PRATA, como canal de comunicação real.
 *
 * Regras mantidas:
 * - Expediente estrito das 07:00 às 17:00 (Brasília), Segunda a Sexta.
 * - Destinatários de rotina operacional são estritamente operadores e líderes.
 * - Deduplicação rigorosa por chave_dedupe (uma vez cada).
 * - Sem pop-up, Kommo 100% somente-leitura.
 */

// 1. Endpoint sob demanda para processamento do ciclo de notificações
routerAdd(
  'POST',
  '/backend/v1/notificacoes/processar-ciclo',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      function getBrasiliaDateParts(d) {
        const dateObj = d ? new Date(d) : new Date()
        const utcMs = dateObj.getTime()
        const brtMs = utcMs - 3 * 60 * 60 * 1000
        const brtDate = new Date(brtMs)

        const y = brtDate.getUTCFullYear()
        const m = String(brtDate.getUTCMonth() + 1).padStart(2, '0')
        const day = String(brtDate.getUTCDate()).padStart(2, '0')
        const hour = brtDate.getUTCHours()
        const minute = brtDate.getUTCMinutes()
        const dayOfWeek = brtDate.getUTCDay()

        return {
          year: y,
          month: m,
          day: day,
          hour: hour,
          minute: minute,
          dayOfWeek: dayOfWeek,
          dateStr: y + '-' + m + '-' + day,
          isExpediente: dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 7 && hour < 17,
        }
      }

      function jaFoiEnviada(chaveDedupe) {
        try {
          const rows = $app.findRecordsByFilter(
            'notificacoes_enviadas',
            "chave_dedupe = '" + chaveDedupe + "'",
            '',
            1,
            0,
          )
          return Boolean(rows && rows.length > 0)
        } catch (_) {
          return false
        }
      }

      function extrairDdd(clienteRec) {
        const dddGravado = (clienteRec.getString('ddd_telefone') || '').trim()
        if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
        const telRaw = (
          clienteRec.getString('telefone') ||
          clienteRec.getString('whatsapp') ||
          ''
        ).replace(/\D/g, '')
        if (!telRaw) return ''
        let s = telRaw
        if (s.startsWith('0')) s = s.slice(1)
        if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
        return s.slice(0, 2)
      }

      function normalizarTexto(txt) {
        return (txt || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
      }

      function carregarOperadoresELideres() {
        try {
          return $app.findRecordsByFilter(
            'users',
            "role = 'operador' || role = 'lider'",
            'name',
            200,
            0,
          )
        } catch (_) {
          return []
        }
      }

      function resolverOperadorResponsavel(c, equipeOperadores) {
        if (!equipeOperadores || equipeOperadores.length === 0) return null

        const opDiretoId = c.getString('reagendado_operador') || c.getString('operador')
        if (opDiretoId) {
          const matchDireto = equipeOperadores.find((u) => u.id === opDiretoId)
          if (matchDireto) return matchDireto
        }

        const vRaw = c.getString('vendedor') || ''
        if (vRaw) {
          let vNorm = normalizarTexto(vRaw)
          const pfxList = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ', 'VARC - ']
          for (let p = 0; p < pfxList.length; p++) {
            const pfxNorm = normalizarTexto(pfxList[p])
            if (vNorm.startsWith(pfxNorm)) {
              vNorm = vNorm.slice(pfxNorm.length).trim()
              break
            }
          }

          for (let i = 0; i < equipeOperadores.length; i++) {
            const u = equipeOperadores[i]
            const uNome = normalizarTexto(u.getString('name'))
            if (uNome && (uNome === vNorm || uNome.includes(vNorm) || vNorm.includes(uNome))) {
              return u
            }
          }

          const primeiroNomeV = vNorm.split(' ')[0]
          if (primeiroNomeV && primeiroNomeV.length >= 3) {
            for (let i = 0; i < equipeOperadores.length; i++) {
              const u = equipeOperadores[i]
              const uPrimeiroNome = normalizarTexto(u.getString('name')).split(' ')[0]
              if (uPrimeiroNome === primeiroNomeV) {
                return u
              }
            }
          }
        }

        const regiaoNorm = normalizarTexto(c.getString('regiao'))
        if (regiaoNorm === 'ATACADO') {
          const ddd = extrairDdd(c)
          let alvoNome = ''
          if (['11', '12', '13'].includes(ddd)) {
            alvoNome = 'LARISSA TERRA'
          } else if (['15', '19'].includes(ddd)) {
            alvoNome = 'JULIO MELO'
          } else if (['14', '16', '17', '18'].includes(ddd)) {
            alvoNome = 'WILSON NETO'
          }

          if (alvoNome) {
            const opAtacado = equipeOperadores.find((u) =>
              normalizarTexto(u.getString('name')).includes(alvoNome),
            )
            if (opAtacado) return opAtacado
          }
        }

        return null
      }

      function enviarNotificacaoEfemera(params) {
        if (!params.usuarioId) return false
        if (jaFoiEnviada(params.chaveDedupe)) return false

        try {
          const destRec = $app.findRecordById('users', params.usuarioId)
          if (!destRec) return false
          const role = destRec.getString('role')
          if (role !== 'operador' && role !== 'lider') {
            return false
          }
        } catch (_) {
          return false
        }

        try {
          const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
          const reg = new Record(colNotif)
          reg.set('chave_dedupe', params.chaveDedupe)
          reg.set('tipo', params.tipo)
          reg.set('usuario', params.usuarioId)
          if (params.clienteId) reg.set('cliente_id', params.clienteId)
          reg.set('titulo', params.titulo || 'Notificação do Sistema')
          reg.set('texto', params.texto || '')
          reg.set('lida', false)
          reg.set('descartada', false)
          if (params.metadata) reg.set('dados', params.metadata)
          $app.save(reg)
          return true
        } catch (saveErr) {
          console.log(
            '[notificacoes_internas] Falha ao salvar notificação efêmera: ' + saveErr.message,
          )
          return false
        }
      }

      const bInfo = getBrasiliaDateParts()
      let followupsEnviados = 0
      let resumosEnviados = 0

      const userRole = authRecord.getString('role')
      if (bInfo.isExpediente || userRole === 'admin') {
        const hojeStr = bInfo.dateStr
        const equipeOperadores = carregarOperadoresELideres()

        const clientes = $app.findRecordsByFilter(
          'clientes',
          "reagendado_para != '' && (estado = 'reagendado' || estado = 'na_base' || estado = 'contatado')",
          '-reagendado_para',
          300,
          0,
        )

        for (let i = 0; i < clientes.length; i++) {
          const c = clientes[i]
          const reagPara = c.getString('reagendado_para')
          if (!reagPara) continue

          const operadorDest = resolverOperadorResponsavel(c, equipeOperadores)
          if (!operadorDest) continue
          const opId = operadorDest.id

          const pReag = getBrasiliaDateParts(reagPara)
          const reagDateStr = pReag.dateStr
          const cliId = c.id
          const cliNome = c.getString('nome') || 'Cliente'
          const cliCodigo = c.getString('codigo') || ''
          const cliRegiao = c.getString('regiao') || 'Geral'
          const cliSegmento = c.getString('segmento') || 'Comercial'
          const horaReagStr =
            String(pReag.hour).padStart(2, '0') + ':' + String(pReag.minute).padStart(2, '0')

          if (reagDateStr === hojeStr) {
            const chaveHoje = 'followup_dia:' + cliId + ':' + opId + ':' + hojeStr
            const textoHoje =
              'Olá! Você tem um retorno agendado para HOJE às ' +
              horaReagStr +
              '.\n• Cliente: ' +
              cliNome +
              (cliCodigo ? ' (' + cliCodigo + ')' : '') +
              '\n• Região/Rota: ' +
              cliRegiao +
              '\n• Segmento: ' +
              cliSegmento

            const sent = enviarNotificacaoEfemera({
              chaveDedupe: chaveHoje,
              tipo: 'followup_dia',
              titulo: '📅 Lembrete de Follow-up (Hoje às ' + horaReagStr + ')',
              usuarioId: opId,
              clienteId: cliId,
              texto: textoHoje,
              metadata: {
                tipo_evento: 'followup_dia',
                cliente_id: cliId,
                cliente_codigo: cliCodigo,
                cliente_nome: cliNome,
                regiao: cliRegiao,
                horario: horaReagStr,
                data_agendada: reagDateStr,
              },
            })
            if (sent) followupsEnviados++
          } else if (reagDateStr < hojeStr) {
            const chaveAtraso = 'followup_atrasado:' + cliId + ':' + opId + ':' + hojeStr
            const textoAtraso =
              'Atenção: o retorno deste cliente estava previsto para ' +
              pReag.day +
              '/' +
              pReag.month +
              ' e ainda está pendente de contato!\n• Cliente: ' +
              cliNome +
              (cliCodigo ? ' (' + cliCodigo + ')' : '') +
              '\n• Região/Rota: ' +
              cliRegiao +
              '\n• Segmento: ' +
              cliSegmento

            const sentAtraso = enviarNotificacaoEfemera({
              chaveDedupe: chaveAtraso,
              tipo: 'followup_atrasado',
              titulo: '⚠️ Follow-up Pendente / Atrasado',
              usuarioId: opId,
              clienteId: cliId,
              texto: textoAtraso,
              metadata: {
                tipo_evento: 'followup_atrasado',
                cliente_id: cliId,
                cliente_codigo: cliCodigo,
                cliente_nome: cliNome,
                regiao: cliRegiao,
                data_original: reagDateStr,
              },
            })
            if (sentAtraso) followupsEnviados++
          }
        }
      }

      return e.json(200, {
        ok: true,
        expediente: bInfo.isExpediente,
        followups_enviados: followupsEnviados,
        resumos_enviados: resumosEnviados,
        executado_em: new Date().toISOString(),
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)

// 2. Endpoint para parabenizar conquista de ranking
routerAdd(
  'POST',
  '/backend/v1/notificacoes/parabenizar-conquista',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const body = e.requestInfo().body || {}
      let usuarioId = body.usuario_id || authRecord.id
      const tituloId = body.titulo_id
      const pontos = body.pontos || 0
      const publicarGeral = body.publicar_geral !== false

      if (authRecord.getString('role') !== 'admin' && usuarioId !== authRecord.id) {
        usuarioId = authRecord.id
      }

      if (!tituloId) {
        return e.json(400, { error: 'titulo_id é obrigatório' })
      }

      function jaFoiEnviada(chaveDedupe) {
        try {
          const rows = $app.findRecordsByFilter(
            'notificacoes_enviadas',
            "chave_dedupe = '" + chaveDedupe + "'",
            '',
            1,
            0,
          )
          return Boolean(rows && rows.length > 0)
        } catch (_) {
          return false
        }
      }

      function getOrCreateSistemaUser() {
        try {
          return $app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
        } catch (_) {
          try {
            const colUsers = $app.findCollectionByNameOrId('_pb_users_auth_')
            const newUser = new Record(colUsers)
            newUser.setEmail('sistema@grupoabr.com.br')
            newUser.setPassword('Skip@Pass987!')
            newUser.setVerified(true)
            newUser.set('name', 'Sistema Projeto Guerra')
            newUser.set('role', 'admin')
            $app.save(newUser)
            return newUser
          } catch (_) {
            return null
          }
        }
      }

      const userRec = $app.findRecordById('users', usuarioId)
      const tituloRec = $app.findRecordById('titulos_catalogo', tituloId)
      if (!userRec || !tituloRec) {
        return e.json(404, { error: 'Usuário ou título não encontrado' })
      }

      const userNome = userRec.getString('name') || userRec.getString('email') || 'Colaborador'
      const tituloNome = tituloRec.getString('nome') || 'Novo Título'
      const tituloEmoji = tituloRec.getString('emoji') || '🏆'
      const tituloNivel = (tituloRec.getString('nivel') || 'bronze').toUpperCase()
      const tituloDesc = tituloRec.getString('descricao') || ''

      const chave1a1 = 'ranking_conquista_1a1:' + usuarioId + ':' + tituloId
      const chaveGeral = 'ranking_conquista_geral:' + usuarioId + ':' + tituloId

      // 1. Notificação Efêmera privada para o colaborador (SEM criar conversa no chat!)
      let sentDm = false
      if (!jaFoiEnviada(chave1a1)) {
        try {
          const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
          const reg = new Record(colNotif)
          reg.set('chave_dedupe', chave1a1)
          reg.set('tipo', 'ranking_conquista')
          reg.set('usuario', usuarioId)
          reg.set('titulo', '🎉 Parabéns! Você conquistou um novo título!')
          reg.set(
            'texto',
            `${tituloEmoji} ${tituloNome} (${tituloNivel})\n"${tituloDesc}"\nVocê alcançou ${pontos} pontos na gamificação do Projeto Guerra!`,
          )
          reg.set('lida', false)
          reg.set('descartada', false)
          reg.set('dados', {
            tipo_evento: 'ranking_conquista',
            titulo_id: tituloId,
            titulo_nome: tituloNome,
            titulo_emoji: tituloEmoji,
            titulo_nivel: tituloNivel,
            pontos: pontos,
          })
          $app.save(reg)
          sentDm = true
        } catch (_) {}
      }

      // 2. Canal Geral se marco relevante ou solicitado (Prata, Ouro, Platina, Diamante)
      const nivelRelevante =
        tituloNivel === 'PRATA' ||
        tituloNivel === 'OURO' ||
        tituloNivel === 'PLATINA' ||
        tituloNivel === 'DIAMANTE'

      let sentGeral = false
      if (publicarGeral && (nivelRelevante || pontos >= 500)) {
        if (!jaFoiEnviada(chaveGeral)) {
          try {
            const geralRows = $app.findRecordsByFilter('chat_conversas', "tipo = 'geral'", '', 1, 0)
            const sistemaUser = getOrCreateSistemaUser()
            if (geralRows && geralRows.length > 0 && sistemaUser) {
              const geralConv = geralRows[0]
              const textoGeral =
                '🏆 [CELEBRAÇÃO DE CONQUISTA NO RANKING]\n\n' +
                'Atenção equipe! O colaborador *' +
                userNome +
                '* acaba de conquistar o título ' +
                tituloEmoji +
                ' *' +
                tituloNome +
                '* (' +
                tituloNivel +
                ') com ' +
                pontos +
                ' pontos!\n\n' +
                'Parabéns pela dedicação e pelo resultado no Projeto Guerra! 👏🚀'

              const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
              const msgG = new Record(colMsg)
              msgG.set('conversa', geralConv.id)
              msgG.set('autor', sistemaUser.id)
              msgG.set('autor_nome', 'Sistema Projeto Guerra')
              msgG.set('autor_role', 'admin')
              msgG.set('texto', textoGeral)
              msgG.set('tipo', 'notificacao')
              msgG.set('metadata', {
                tipo_evento: 'ranking_subida_geral',
                usuario_id: usuarioId,
                usuario_nome: userNome,
                titulo_id: tituloId,
                titulo_nome: tituloNome,
                titulo_emoji: tituloEmoji,
                titulo_nivel: tituloNivel,
              })
              $app.save(msgG)

              geralConv.set('ultima_mensagem_texto', textoGeral.slice(0, 120))
              geralConv.set('ultimo_autor_nome', 'Sistema')
              geralConv.set('ultima_mensagem_tipo', 'notificacao')
              geralConv.set('ultima_mensagem_data', new Date().toISOString())
              geralConv.set('total_mensagens', (geralConv.getInt('total_mensagens') || 0) + 1)
              $app.save(geralConv)

              const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
              const regG = new Record(colNotif)
              regG.set('chave_dedupe', chaveGeral)
              regG.set('tipo', 'ranking_subida')
              regG.set('usuario', usuarioId)
              regG.set('conversa', geralConv.id)
              regG.set('mensagem_id', msgG.id)
              $app.save(regG)

              sentGeral = true
            }
          } catch (_) {}
        }
      }

      return e.json(200, { ok: true, sent_dm: sentDm, sent_geral: sentGeral })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)

// 3. Hook após registro de conquista de título
onRecordAfterCreateSuccess((e) => {
  try {
    const usuarioId = e.record.getString('usuario')
    const tituloId = e.record.getString('titulo')
    const pontos = e.record.getInt('pontos_no_momento') || 0

    if (!usuarioId || !tituloId) return

    function jaFoiEnviada(chaveDedupe) {
      try {
        const rows = $app.findRecordsByFilter(
          'notificacoes_enviadas',
          "chave_dedupe = '" + chaveDedupe + "'",
          '',
          1,
          0,
        )
        return Boolean(rows && rows.length > 0)
      } catch (_) {
        return false
      }
    }

    function getOrCreateSistemaUser() {
      try {
        return $app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
      } catch (_) {
        try {
          const colUsers = $app.findCollectionByNameOrId('_pb_users_auth_')
          const newUser = new Record(colUsers)
          newUser.setEmail('sistema@grupoabr.com.br')
          newUser.setPassword('Skip@Pass987!')
          newUser.setVerified(true)
          newUser.set('name', 'Sistema Projeto Guerra')
          newUser.set('role', 'admin')
          $app.save(newUser)
          return newUser
        } catch (_) {
          return null
        }
      }
    }

    const chave1a1 = 'ranking_conquista_1a1:' + usuarioId + ':' + tituloId
    if (jaFoiEnviada(chave1a1)) return

    const userRec = $app.findRecordById('users', usuarioId)
    const tituloRec = $app.findRecordById('titulos_catalogo', tituloId)
    if (!userRec || !tituloRec) return

    const userNome = userRec.getString('name') || userRec.getString('email') || 'Colaborador'
    const tituloNome = tituloRec.getString('nome') || 'Novo Título'
    const tituloEmoji = tituloRec.getString('emoji') || '🏆'
    const tituloNivel = (tituloRec.getString('nivel') || 'bronze').toUpperCase()
    const tituloDesc = tituloRec.getString('descricao') || ''

    // Notificação efêmera privada
    try {
      const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
      const reg = new Record(colNotif)
      reg.set('chave_dedupe', chave1a1)
      reg.set('tipo', 'ranking_conquista')
      reg.set('usuario', usuarioId)
      reg.set('titulo', '🎉 Parabéns! Você conquistou um novo título!')
      reg.set(
        'texto',
        `${tituloEmoji} ${tituloNome} (${tituloNivel})\n"${tituloDesc}"\nVocê alcançou ${pontos} pontos na gamificação do Projeto Guerra!`,
      )
      reg.set('lida', false)
      reg.set('descartada', false)
      reg.set('dados', {
        tipo_evento: 'ranking_conquista',
        titulo_id: tituloId,
        titulo_nome: tituloNome,
        titulo_emoji: tituloEmoji,
        titulo_nivel: tituloNivel,
        pontos: pontos,
      })
      $app.save(reg)
    } catch (_) {}

    // Canal Geral para níveis relevantes
    const nivelRelevante =
      tituloNivel === 'PRATA' ||
      tituloNivel === 'OURO' ||
      tituloNivel === 'PLATINA' ||
      tituloNivel === 'DIAMANTE'

    if (nivelRelevante || pontos >= 500) {
      const chaveGeral = 'ranking_conquista_geral:' + usuarioId + ':' + tituloId
      if (!jaFoiEnviada(chaveGeral)) {
        try {
          const geralRows = $app.findRecordsByFilter('chat_conversas', "tipo = 'geral'", '', 1, 0)
          const sistemaUser = getOrCreateSistemaUser()
          if (geralRows && geralRows.length > 0 && sistemaUser) {
            const geralConv = geralRows[0]
            const textoGeral =
              '🏆 [CELEBRAÇÃO DE CONQUISTA NO RANKING]\n\n' +
              'Atenção equipe! O colaborador *' +
              userNome +
              '* acaba de conquistar o título ' +
              tituloEmoji +
              ' *' +
              tituloNome +
              '* (' +
              tituloNivel +
              ') com ' +
              pontos +
              ' pontos!\n\n' +
              'Parabéns pela dedicação e pelo resultado no Projeto Guerra! 👏🚀'

            const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
            const msgG = new Record(colMsg)
            msgG.set('conversa', geralConv.id)
            msgG.set('autor', sistemaUser.id)
            msgG.set('autor_nome', 'Sistema Projeto Guerra')
            msgG.set('autor_role', 'admin')
            msgG.set('texto', textoGeral)
            msgG.set('tipo', 'notificacao')
            msgG.set('metadata', {
              tipo_evento: 'ranking_subida_geral',
              usuario_id: usuarioId,
              usuario_nome: userNome,
              titulo_id: tituloId,
              titulo_nome: tituloNome,
              titulo_emoji: tituloEmoji,
              titulo_nivel: tituloNivel,
            })
            $app.save(msgG)

            geralConv.set('ultima_mensagem_texto', textoGeral.slice(0, 120))
            geralConv.set('ultimo_autor_nome', 'Sistema')
            geralConv.set('ultima_mensagem_tipo', 'notificacao')
            geralConv.set('ultima_mensagem_data', new Date().toISOString())
            geralConv.set('total_mensagens', (geralConv.getInt('total_mensagens') || 0) + 1)
            $app.save(geralConv)

            const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
            const regG = new Record(colNotif)
            regG.set('chave_dedupe', chaveGeral)
            regG.set('tipo', 'ranking_subida')
            regG.set('usuario', usuarioId)
            regG.set('conversa', geralConv.id)
            regG.set('mensagem_id', msgG.id)
            $app.save(regG)
          }
        } catch (_) {}
      }
    }
  } catch (hookErr) {
    console.log('[notificacoes_internas] Erro ao disparar hook de conquista: ' + hookErr.message)
  }
}, 'conquistas_usuarios')

// 4. Cron de notificações periódicas (a cada 15 min no expediente)
cronAdd('crons_notificacoes_operacionais', '*/15 * * * *', () => {
  try {
    const dateObj = new Date()
    const utcMs = dateObj.getTime()
    const brtMs = utcMs - 3 * 60 * 60 * 1000
    const brtDate = new Date(brtMs)

    const y = brtDate.getUTCFullYear()
    const m = String(brtDate.getUTCMonth() + 1).padStart(2, '0')
    const day = String(brtDate.getUTCDate()).padStart(2, '0')
    const hour = brtDate.getUTCHours()
    const dayOfWeek = brtDate.getUTCDay()
    const dateStr = y + '-' + m + '-' + day

    // Expediente: Segunda a Sexta, das 07:00 às 17:00
    const isExpediente = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 7 && hour < 17
    if (!isExpediente) return

    function jaFoiEnviada(chaveDedupe) {
      try {
        const rows = $app.findRecordsByFilter(
          'notificacoes_enviadas',
          "chave_dedupe = '" + chaveDedupe + "'",
          '',
          1,
          0,
        )
        return Boolean(rows && rows.length > 0)
      } catch (_) {
        return false
      }
    }

    function extrairDdd(clienteRec) {
      const dddGravado = (clienteRec.getString('ddd_telefone') || '').trim()
      if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
      const telRaw = (
        clienteRec.getString('telefone') ||
        clienteRec.getString('whatsapp') ||
        ''
      ).replace(/\D/g, '')
      if (!telRaw) return ''
      let s = telRaw
      if (s.startsWith('0')) s = s.slice(1)
      if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
      return s.slice(0, 2)
    }

    function normalizarTexto(txt) {
      return (txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function carregarOperadoresELideres() {
      try {
        return $app.findRecordsByFilter(
          'users',
          "role = 'operador' || role = 'lider'",
          'name',
          200,
          0,
        )
      } catch (_) {
        return []
      }
    }

    function resolverOperadorResponsavel(c, equipeOperadores) {
      if (!equipeOperadores || equipeOperadores.length === 0) return null

      const opDiretoId = c.getString('reagendado_operador') || c.getString('operador')
      if (opDiretoId) {
        const matchDireto = equipeOperadores.find((u) => u.id === opDiretoId)
        if (matchDireto) return matchDireto
      }

      const vRaw = c.getString('vendedor') || ''
      if (vRaw) {
        let vNorm = normalizarTexto(vRaw)
        const pfxList = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ', 'VARC - ']
        for (let p = 0; p < pfxList.length; p++) {
          const pfxNorm = normalizarTexto(pfxList[p])
          if (vNorm.startsWith(pfxNorm)) {
            vNorm = vNorm.slice(pfxNorm.length).trim()
            break
          }
        }

        for (let i = 0; i < equipeOperadores.length; i++) {
          const u = equipeOperadores[i]
          const uNome = normalizarTexto(u.getString('name'))
          if (uNome && (uNome === vNorm || uNome.includes(vNorm) || vNorm.includes(uNome))) {
            return u
          }
        }

        const primeiroNomeV = vNorm.split(' ')[0]
        if (primeiroNomeV && primeiroNomeV.length >= 3) {
          for (let i = 0; i < equipeOperadores.length; i++) {
            const u = equipeOperadores[i]
            const uPrimeiroNome = normalizarTexto(u.getString('name')).split(' ')[0]
            if (uPrimeiroNome === primeiroNomeV) {
              return u
            }
          }
        }
      }

      const regiaoNorm = normalizarTexto(c.getString('regiao'))
      if (regiaoNorm === 'ATACADO') {
        const ddd = extrairDdd(c)
        let alvoNome = ''
        if (['11', '12', '13'].includes(ddd)) {
          alvoNome = 'LARISSA TERRA'
        } else if (['15', '19'].includes(ddd)) {
          alvoNome = 'JULIO MELO'
        } else if (['14', '16', '17', '18'].includes(ddd)) {
          alvoNome = 'WILSON NETO'
        }

        if (alvoNome) {
          const opAtacado = equipeOperadores.find((u) =>
            normalizarTexto(u.getString('name')).includes(alvoNome),
          )
          if (opAtacado) return opAtacado
        }
      }

      return null
    }

    function enviarNotificacaoEfemera(params) {
      if (!params.usuarioId) return false
      if (jaFoiEnviada(params.chaveDedupe)) return false

      try {
        const destRec = $app.findRecordById('users', params.usuarioId)
        if (!destRec) return false
        const role = destRec.getString('role')
        if (role !== 'operador' && role !== 'lider') {
          return false
        }
      } catch (_) {
        return false
      }

      try {
        const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
        const reg = new Record(colNotif)
        reg.set('chave_dedupe', params.chaveDedupe)
        reg.set('tipo', params.tipo)
        reg.set('usuario', params.usuarioId)
        if (params.clienteId) reg.set('cliente_id', params.clienteId)
        reg.set('titulo', params.titulo || 'Notificação do Sistema')
        reg.set('texto', params.texto || '')
        reg.set('lida', false)
        reg.set('descartada', false)
        if (params.metadata) reg.set('dados', params.metadata)
        $app.save(reg)
        return true
      } catch (saveErr) {
        console.log('[notificacoes_internas] Falha no cron ao salvar: ' + saveErr.message)
        return false
      }
    }

    const equipeOperadores = carregarOperadoresELideres()

    // A. Follow-ups
    const clientes = $app.findRecordsByFilter(
      'clientes',
      "reagendado_para != '' && (estado = 'reagendado' || estado = 'na_base' || estado = 'contatado')",
      '-reagendado_para',
      300,
      0,
    )

    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]
      const reagPara = c.getString('reagendado_para')
      if (!reagPara) continue

      const operadorDest = resolverOperadorResponsavel(c, equipeOperadores)
      if (!operadorDest) continue
      const opId = operadorDest.id

      const dParsed = new Date(reagPara)
      const dParsedBrtMs = dParsed.getTime() - 3 * 60 * 60 * 1000
      const dBrt = new Date(dParsedBrtMs)
      const rY = dBrt.getUTCFullYear()
      const rM = String(dBrt.getUTCMonth() + 1).padStart(2, '0')
      const rD = String(dBrt.getUTCDate()).padStart(2, '0')
      const rH = String(dBrt.getUTCHours()).padStart(2, '0')
      const rMin = String(dBrt.getUTCMinutes()).padStart(2, '0')
      const reagDateStr = rY + '-' + rM + '-' + rD
      const horaReagStr = rH + ':' + rMin

      const cliId = c.id
      const cliNome = c.getString('nome') || 'Cliente'
      const cliCodigo = c.getString('codigo') || ''
      const cliRegiao = c.getString('regiao') || 'Geral'
      const cliSegmento = c.getString('segmento') || 'Comercial'

      if (reagDateStr === dateStr) {
        const chaveHoje = 'followup_dia:' + cliId + ':' + opId + ':' + dateStr
        const textoHoje =
          'Olá! Você tem um retorno agendado para HOJE às ' +
          horaReagStr +
          '.\n• Cliente: ' +
          cliNome +
          (cliCodigo ? ' (' + cliCodigo + ')' : '') +
          '\n• Região/Rota: ' +
          cliRegiao +
          '\n• Segmento: ' +
          cliSegmento

        enviarNotificacaoEfemera({
          chaveDedupe: chaveHoje,
          tipo: 'followup_dia',
          titulo: '📅 Lembrete de Follow-up (Hoje às ' + horaReagStr + ')',
          usuarioId: opId,
          clienteId: cliId,
          texto: textoHoje,
          metadata: {
            tipo_evento: 'followup_dia',
            cliente_id: cliId,
            cliente_codigo: cliCodigo,
            cliente_nome: cliNome,
            regiao: cliRegiao,
            horario: horaReagStr,
            data_agendada: reagDateStr,
          },
        })
      } else if (reagDateStr < dateStr && hour >= 8) {
        const chaveAtraso = 'followup_atrasado:' + cliId + ':' + opId + ':' + dateStr
        const textoAtraso =
          'Atenção: o retorno deste cliente estava previsto para ' +
          rD +
          '/' +
          rM +
          ' e ainda está pendente de contato!\n• Cliente: ' +
          cliNome +
          (cliCodigo ? ' (' + cliCodigo + ')' : '') +
          '\n• Região/Rota: ' +
          cliRegiao +
          '\n• Segmento: ' +
          cliSegmento

        enviarNotificacaoEfemera({
          chaveDedupe: chaveAtraso,
          tipo: 'followup_atrasado',
          titulo: '⚠️ Follow-up Pendente / Atrasado',
          usuarioId: opId,
          clienteId: cliId,
          texto: textoAtraso,
          metadata: {
            tipo_evento: 'followup_atrasado',
            cliente_id: cliId,
            cliente_codigo: cliCodigo,
            cliente_nome: cliNome,
            regiao: cliRegiao,
            data_original: reagDateStr,
          },
        })
      }
    }

    // B. Resumo Matinal às 7h
    if (hour === 7) {
      const diasSub = dayOfWeek === 1 ? 3 : 1
      const ontemDate = new Date(dateObj.getTime() - diasSub * 24 * 60 * 60 * 1000)
      const ontemBrt = new Date(ontemDate.getTime() - 3 * 60 * 60 * 1000)
      const oY = ontemBrt.getUTCFullYear()
      const oM = String(ontemBrt.getUTCMonth() + 1).padStart(2, '0')
      const oD = String(ontemBrt.getUTCDate()).padStart(2, '0')
      const ontemStr = oY + '-' + oM + '-' + oD

      const operadores = equipeOperadores

      for (let j = 0; j < operadores.length; j++) {
        const op = operadores[j]
        const opId = op.id
        const chaveResumo = 'resumo_matinal:' + opId + ':' + dateStr
        if (jaFoiEnviada(chaveResumo)) continue

        const opNome = (op.getString('name') || 'Vendedor').split(' ')[0]
        let atendimentosOntem = 0
        let conversoesOntem = 0

        try {
          const interacoes = $app.findRecordsByFilter(
            'interacoes',
            "operador = '" + opId + "'",
            '-created',
            200,
            0,
          )
          for (let k = 0; k < interacoes.length; k++) {
            const it = interacoes[k]
            const itBrt = new Date(new Date(it.getString('created')).getTime() - 3 * 60 * 60 * 1000)
            const itDateStr =
              itBrt.getUTCFullYear() +
              '-' +
              String(itBrt.getUTCMonth() + 1).padStart(2, '0') +
              '-' +
              String(itBrt.getUTCDate()).padStart(2, '0')
            if (itDateStr === ontemStr) {
              atendimentosOntem++
              const desfecho = it.getString('desfecho')
              const numPedido = it.getString('numero_pedido')
              if (
                desfecho === 'reativado' ||
                desfecho === 'reativado_com_pedido' ||
                desfecho === 'fechou_pedido' ||
                numPedido
              ) {
                conversoesOntem++
              }
            }
          }
        } catch (_) {}

        let followupsHoje = 0
        try {
          const flws = $app.findRecordsByFilter(
            'clientes',
            "(reagendado_operador = '" +
              opId +
              "' || operador = '" +
              opId +
              "') && (estado = 'reagendado' || estado = 'na_base')",
            '',
            100,
            0,
          )
          for (let f = 0; f < flws.length; f++) {
            const rDate = flws[f].getString('reagendado_para')
            if (rDate) {
              const rBrt = new Date(new Date(rDate).getTime() - 3 * 60 * 60 * 1000)
              const rDateStr =
                rBrt.getUTCFullYear() +
                '-' +
                String(rBrt.getUTCMonth() + 1).padStart(2, '0') +
                '-' +
                String(rBrt.getUTCDate()).padStart(2, '0')
              if (rDateStr === dateStr) followupsHoje++
            }
          }
        } catch (_) {}

        const textoResumo =
          'Início de expediente no Projeto Guerra Grupo ABR.\n\n' +
          '📊 Seus números do dia anterior (' +
          oD +
          '/' +
          oM +
          '):\n' +
          '• Atendimentos realizados: ' +
          atendimentosOntem +
          '\n' +
          '• Clientes reativados/pedidos: ' +
          conversoesOntem +
          '\n\n' +
          '🎯 Hoje você tem ' +
          followupsHoje +
          ' retorno(s) de follow-up na sua carteira.\n' +
          'Bom trabalho e ótimas negociações!'

        enviarNotificacaoEfemera({
          chaveDedupe: chaveResumo,
          tipo: 'resumo_matinal',
          titulo: '☀️ Bom dia, ' + opNome + '! — Resumo Operacional',
          usuarioId: opId,
          texto: textoResumo,
          metadata: {
            tipo_evento: 'resumo_matinal',
            data_referencia: ontemStr,
            atendimentos_ontem: atendimentosOntem,
            conversoes_ontem: conversoesOntem,
            followups_hoje: followupsHoje,
          },
        })
      }
    }
  } catch (cronErr) {
    console.log('[crons_notificacoes_operacionais] Erro: ' + cronErr.message)
  }
})
