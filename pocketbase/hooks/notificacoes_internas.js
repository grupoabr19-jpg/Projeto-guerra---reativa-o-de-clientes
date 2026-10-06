/// <reference path="../pb_data/types.d.ts" />

/**
 * Motor de Notificações Internas Automáticas do Projeto Guerra.
 *
 * Funcionalidades:
 * 1. Follow-ups agendados: Lembretes no dia (de manhã) e de atraso (sem ação).
 * 2. Lembretes operacionais: Resumo diário matinal às 7h (números do dia anterior e follow-ups de hoje).
 * 3. Parabenizações de Ranking: Conquista de novo título/badge (1:1 + Canal Geral para marcos relevantes).
 * 4. Regras invioláveis:
 *    - Expediente estrito das 07:00 às 17:00 (Brasília / UTC-3), Segunda a Sexta.
 *    - NUNCA pop-ups; notificações chegam no CA (chat) com badges discretos e contadores em tempo real.
 *    - Kommo em SOMENTE-LEITURA: nenhuma notificação escreve no Kommo.
 *    - Deduplicação estrita via tabela `notificacoes_enviadas`.
 *    - Regra Skip Cloud: cada callback encapsula suas próprias funções auxiliares inline para evitar ReferenceError entre VMs.
 */

// 1. Endpoint sob demanda para processamento do ciclo de notificações (ou verificação pelo frontend / admin)
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
            try {
              return $app.findFirstRecordByData('users', 'email', 'thiago.almeida@grupoabr.com.br')
            } catch (_) {
              return null
            }
          }
        }
      }

      function getOrCreateSistemaDm(destinatarioId) {
        const sistemaUser = getOrCreateSistemaUser()
        if (!sistemaUser || !destinatarioId) return null

        const sistemaId = sistemaUser.id
        const pair = [sistemaId, destinatarioId].sort()
        const chaveDm = pair[0] + ':' + pair[1]

        const existing = $app.findRecordsByFilter(
          'chat_conversas',
          "tipo = 'dm' && chave_dm = '" + chaveDm + "'",
          '',
          1,
          0,
        )

        if (existing && existing.length > 0) {
          return existing[0]
        }

        let destNome = 'Colaborador'
        try {
          const destUser = $app.findRecordById('users', destinatarioId)
          if (destUser) destNome = (destUser.getString('name') || 'Colaborador').trim()
        } catch (_) {}

        const colConv = $app.findCollectionByNameOrId('chat_conversas')
        const novaConv = new Record(colConv)
        novaConv.set('tipo', 'dm')
        novaConv.set('titulo', 'Sistema & ' + destNome)
        novaConv.set('chave_dm', chaveDm)
        novaConv.set('participantes', [sistemaId, destinatarioId])
        novaConv.set('total_mensagens', 0)
        novaConv.set('ultima_mensagem_texto', 'Notificações do sistema ativadas.')
        novaConv.set('ultimo_autor_nome', 'Sistema')
        novaConv.set('ultima_mensagem_tipo', 'notificacao')
        novaConv.set('ultima_mensagem_data', new Date().toISOString())
        $app.save(novaConv)

        return novaConv
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

      function enviarNotificacao(params) {
        if (jaFoiEnviada(params.chaveDedupe)) return false
        const sistemaUser = getOrCreateSistemaUser()
        if (!sistemaUser) return false

        const conversa = getOrCreateSistemaDm(params.usuarioId)
        if (!conversa) return false

        const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
        const msg = new Record(colMsg)
        msg.set('conversa', conversa.id)
        msg.set('autor', sistemaUser.id)
        msg.set('autor_nome', 'Sistema Projeto Guerra')
        msg.set('autor_role', 'admin')
        msg.set('texto', params.texto)
        msg.set('tipo', 'notificacao')
        if (params.metadata) {
          msg.set('metadata', params.metadata)
        }
        $app.save(msg)

        conversa.set('ultima_mensagem_texto', params.texto.slice(0, 120))
        conversa.set('ultimo_autor_nome', 'Sistema')
        conversa.set('ultima_mensagem_tipo', 'notificacao')
        conversa.set('ultima_mensagem_data', new Date().toISOString())
        conversa.set('total_mensagens', (conversa.getInt('total_mensagens') || 0) + 1)
        $app.save(conversa)

        try {
          const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
          const reg = new Record(colNotif)
          reg.set('chave_dedupe', params.chaveDedupe)
          reg.set('tipo', params.tipo)
          reg.set('usuario', params.usuarioId)
          if (params.clienteId) reg.set('cliente_id', params.clienteId)
          reg.set('conversa', conversa.id)
          reg.set('mensagem_id', msg.id)
          if (params.metadata) reg.set('dados', params.metadata)
          $app.save(reg)
        } catch (_) {}

        return true
      }

      const bInfo = getBrasiliaDateParts()
      let followupsEnviados = 0
      let resumosEnviados = 0

      // Processar Follow-ups apenas no expediente (ou quando admin forçar)
      const userRole = authRecord.getString('role')
      if (bInfo.isExpediente || userRole === 'admin') {
        const hojeStr = bInfo.dateStr
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

          const opId = c.getString('reagendado_operador') || c.getString('operador')
          if (!opId) continue

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
              '📅 [LEMBRETE DE FOLLOW-UP]\n' +
              'Olá! Você tem um retorno agendado para HOJE às ' +
              horaReagStr +
              '.\n\n' +
              '• Cliente: ' +
              cliNome +
              (cliCodigo ? ' (' + cliCodigo + ')' : '') +
              '\n' +
              '• Região/Rota: ' +
              cliRegiao +
              '\n' +
              '• Segmento: ' +
              cliSegmento +
              '\n\n' +
              '👉 Acesse a aba Atendimento para abrir a ficha e realizar o contato.'

            const sent = enviarNotificacao({
              chaveDedupe: chaveHoje,
              tipo: 'followup_dia',
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
              '⚠️ [FOLLOW-UP PENDENTE / ATRASADO]\n' +
              'Atenção: o retorno deste cliente estava previsto para ' +
              pReag.day +
              '/' +
              pReag.month +
              ' e ainda está pendente de contato!\n\n' +
              '• Cliente: ' +
              cliNome +
              (cliCodigo ? ' (' + cliCodigo + ')' : '') +
              '\n' +
              '• Região/Rota: ' +
              cliRegiao +
              '\n' +
              '• Segmento: ' +
              cliSegmento +
              '\n\n' +
              '👉 Abra a ficha em Atendimento e atualize o status para não perder a oportunidade.'

            const sentAtraso = enviarNotificacao({
              chaveDedupe: chaveAtraso,
              tipo: 'followup_atrasado',
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

// 2. Endpoint para notificar conquista de título e ranking
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
            try {
              return $app.findFirstRecordByData('users', 'email', 'thiago.almeida@grupoabr.com.br')
            } catch (_) {
              return null
            }
          }
        }
      }

      function getOrCreateSistemaDm(destId) {
        const sistemaUser = getOrCreateSistemaUser()
        if (!sistemaUser || !destId) return null

        const pair = [sistemaUser.id, destId].sort()
        const chaveDm = pair[0] + ':' + pair[1]

        const existing = $app.findRecordsByFilter(
          'chat_conversas',
          "tipo = 'dm' && chave_dm = '" + chaveDm + "'",
          '',
          1,
          0,
        )

        if (existing && existing.length > 0) return existing[0]

        let destNome = 'Colaborador'
        try {
          const destUser = $app.findRecordById('users', destId)
          if (destUser) destNome = (destUser.getString('name') || 'Colaborador').trim()
        } catch (_) {}

        const colConv = $app.findCollectionByNameOrId('chat_conversas')
        const novaConv = new Record(colConv)
        novaConv.set('tipo', 'dm')
        novaConv.set('titulo', 'Sistema & ' + destNome)
        novaConv.set('chave_dm', chaveDm)
        novaConv.set('participantes', [sistemaUser.id, destId])
        novaConv.set('total_mensagens', 0)
        novaConv.set('ultima_mensagem_texto', 'Notificações do sistema ativadas.')
        novaConv.set('ultimo_autor_nome', 'Sistema')
        novaConv.set('ultima_mensagem_tipo', 'notificacao')
        novaConv.set('ultima_mensagem_data', new Date().toISOString())
        $app.save(novaConv)

        return novaConv
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

      function enviarMsg(conversa, texto, metadata, chaveDedupe, tipo) {
        if (jaFoiEnviada(chaveDedupe)) return false
        const sistemaUser = getOrCreateSistemaUser()
        if (!sistemaUser || !conversa) return false

        const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
        const msg = new Record(colMsg)
        msg.set('conversa', conversa.id)
        msg.set('autor', sistemaUser.id)
        msg.set('autor_nome', 'Sistema Projeto Guerra')
        msg.set('autor_role', 'admin')
        msg.set('texto', texto)
        msg.set('tipo', 'notificacao')
        if (metadata) msg.set('metadata', metadata)
        $app.save(msg)

        conversa.set('ultima_mensagem_texto', texto.slice(0, 120))
        conversa.set('ultimo_autor_nome', 'Sistema')
        conversa.set('ultima_mensagem_tipo', 'notificacao')
        conversa.set('ultima_mensagem_data', new Date().toISOString())
        conversa.set('total_mensagens', (conversa.getInt('total_mensagens') || 0) + 1)
        $app.save(conversa)

        try {
          const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
          const reg = new Record(colNotif)
          reg.set('chave_dedupe', chaveDedupe)
          reg.set('tipo', tipo)
          reg.set('usuario', usuarioId)
          reg.set('conversa', conversa.id)
          reg.set('mensagem_id', msg.id)
          if (metadata) reg.set('dados', metadata)
          $app.save(reg)
        } catch (_) {}

        return true
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

      // 1. Mensagem 1:1 para o colaborador
      const dmConv = getOrCreateSistemaDm(usuarioId)
      const texto1a1 =
        '🎉 [PARABÉNS! VOCÊ CONQUISTOU UM NOVO TÍTULO!]\n\n' +
        tituloEmoji +
        ' *' +
        tituloNome +
        '* (' +
        tituloNivel +
        ')\n' +
        '"' +
        tituloDesc +
        '"\n\n' +
        'Você alcançou ' +
        pontos +
        ' pontos na gamificação do Projeto Guerra! Continue focado nas reativações e mantendo o ritmo!'

      const sentDm = enviarMsg(
        dmConv,
        texto1a1,
        {
          tipo_evento: 'ranking_conquista',
          titulo_id: tituloId,
          titulo_nome: tituloNome,
          titulo_emoji: tituloEmoji,
          titulo_nivel: tituloNivel,
          pontos: pontos,
        },
        chave1a1,
        'ranking_conquista',
      )

      // 2. Canal Geral se marco relevante ou solicitado
      const nivelRelevante =
        tituloNivel === 'PRATA' ||
        tituloNivel === 'OURO' ||
        tituloNivel === 'PLATINA' ||
        tituloNivel === 'DIAMANTE'

      let sentGeral = false
      if (publicarGeral && (nivelRelevante || pontos >= 500)) {
        try {
          const geralRows = $app.findRecordsByFilter('chat_conversas', "tipo = 'geral'", '', 1, 0)
          if (geralRows && geralRows.length > 0) {
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

            sentGeral = enviarMsg(
              geralConv,
              textoGeral,
              {
                tipo_evento: 'ranking_subida_geral',
                usuario_id: usuarioId,
                usuario_nome: userNome,
                titulo_id: tituloId,
                titulo_nome: tituloNome,
                titulo_emoji: tituloEmoji,
                titulo_nivel: tituloNivel,
              },
              chaveGeral,
              'ranking_subida',
            )
          }
        } catch (_) {}
      }

      return e.json(200, { ok: true, sent_dm: sentDm, sent_geral: sentGeral })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)

// 3. Hook após registro de conquista de título: dispara notificação imediata
onRecordAfterCreateSuccess((e) => {
  try {
    const usuarioId = e.record.getString('usuario')
    const tituloId = e.record.getString('titulo')
    const pontos = e.record.getInt('pontos_no_momento') || 0

    if (!usuarioId || !tituloId) return

    function getOrCreateSistemaUser() {
      try {
        return $app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
      } catch (_) {
        try {
          return $app.findFirstRecordByData('users', 'email', 'thiago.almeida@grupoabr.com.br')
        } catch (_) {
          return null
        }
      }
    }

    function getOrCreateSistemaDm(destId) {
      const sistemaUser = getOrCreateSistemaUser()
      if (!sistemaUser || !destId) return null

      const pair = [sistemaUser.id, destId].sort()
      const chaveDm = pair[0] + ':' + pair[1]

      const existing = $app.findRecordsByFilter(
        'chat_conversas',
        "tipo = 'dm' && chave_dm = '" + chaveDm + "'",
        '',
        1,
        0,
      )

      if (existing && existing.length > 0) return existing[0]

      let destNome = 'Colaborador'
      try {
        const destUser = $app.findRecordById('users', destId)
        if (destUser) destNome = (destUser.getString('name') || 'Colaborador').trim()
      } catch (_) {}

      const colConv = $app.findCollectionByNameOrId('chat_conversas')
      const novaConv = new Record(colConv)
      novaConv.set('tipo', 'dm')
      novaConv.set('titulo', 'Sistema & ' + destNome)
      novaConv.set('chave_dm', chaveDm)
      novaConv.set('participantes', [sistemaUser.id, destId])
      novaConv.set('total_mensagens', 0)
      novaConv.set('ultima_mensagem_texto', 'Notificações do sistema ativadas.')
      novaConv.set('ultimo_autor_nome', 'Sistema')
      novaConv.set('ultima_mensagem_tipo', 'notificacao')
      novaConv.set('ultima_mensagem_data', new Date().toISOString())
      $app.save(novaConv)

      return novaConv
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

    const chave1a1 = 'ranking_conquista_1a1:' + usuarioId + ':' + tituloId
    if (jaFoiEnviada(chave1a1)) return

    const sistemaUser = getOrCreateSistemaUser()
    const userRec = $app.findRecordById('users', usuarioId)
    const tituloRec = $app.findRecordById('titulos_catalogo', tituloId)
    if (!sistemaUser || !userRec || !tituloRec) return

    const userNome = userRec.getString('name') || userRec.getString('email') || 'Colaborador'
    const tituloNome = tituloRec.getString('nome') || 'Novo Título'
    const tituloEmoji = tituloRec.getString('emoji') || '🏆'
    const tituloNivel = (tituloRec.getString('nivel') || 'bronze').toUpperCase()
    const tituloDesc = tituloRec.getString('descricao') || ''

    const dmConv = getOrCreateSistemaDm(usuarioId)
    if (!dmConv) return

    const texto1a1 =
      '🎉 [PARABÉNS! VOCÊ CONQUISTOU UM NOVO TÍTULO!]\n\n' +
      tituloEmoji +
      ' *' +
      tituloNome +
      '* (' +
      tituloNivel +
      ')\n' +
      '"' +
      tituloDesc +
      '"\n\n' +
      'Você alcançou ' +
      pontos +
      ' pontos na gamificação do Projeto Guerra! Continue focado nas reativações e mantendo o ritmo!'

    const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
    const msg = new Record(colMsg)
    msg.set('conversa', dmConv.id)
    msg.set('autor', sistemaUser.id)
    msg.set('autor_nome', 'Sistema Projeto Guerra')
    msg.set('autor_role', 'admin')
    msg.set('texto', texto1a1)
    msg.set('tipo', 'notificacao')
    msg.set('metadata', {
      tipo_evento: 'ranking_conquista',
      titulo_id: tituloId,
      titulo_nome: tituloNome,
      titulo_emoji: tituloEmoji,
      titulo_nivel: tituloNivel,
      pontos: pontos,
    })
    $app.save(msg)

    dmConv.set('ultima_mensagem_texto', texto1a1.slice(0, 120))
    dmConv.set('ultimo_autor_nome', 'Sistema')
    dmConv.set('ultima_mensagem_tipo', 'notificacao')
    dmConv.set('ultima_mensagem_data', new Date().toISOString())
    dmConv.set('total_mensagens', (dmConv.getInt('total_mensagens') || 0) + 1)
    $app.save(dmConv)

    try {
      const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
      const reg = new Record(colNotif)
      reg.set('chave_dedupe', chave1a1)
      reg.set('tipo', 'ranking_conquista')
      reg.set('usuario', usuarioId)
      reg.set('conversa', dmConv.id)
      reg.set('mensagem_id', msg.id)
      $app.save(reg)
    } catch (_) {}

    // Publicação no canal Geral para níveis ouro, platina, diamante ou >= 500 pts
    const nivelRelevante =
      tituloNivel === 'OURO' || tituloNivel === 'PLATINA' || tituloNivel === 'DIAMANTE'
    if (nivelRelevante || pontos >= 500) {
      const chaveGeral = 'ranking_conquista_geral:' + usuarioId + ':' + tituloId
      if (!jaFoiEnviada(chaveGeral)) {
        try {
          const geralRows = $app.findRecordsByFilter('chat_conversas', "tipo = 'geral'", '', 1, 0)
          if (geralRows && geralRows.length > 0) {
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

            try {
              const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
              const regG = new Record(colNotif)
              regG.set('chave_dedupe', chaveGeral)
              regG.set('tipo', 'ranking_subida')
              regG.set('usuario', usuarioId)
              regG.set('conversa', geralConv.id)
              regG.set('mensagem_id', msgG.id)
              $app.save(regG)
            } catch (_) {}
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

    function getOrCreateSistemaUser() {
      try {
        return $app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
      } catch (_) {
        try {
          return $app.findFirstRecordByData('users', 'email', 'thiago.almeida@grupoabr.com.br')
        } catch (_) {
          return null
        }
      }
    }

    function getOrCreateSistemaDm(destId) {
      const sistemaUser = getOrCreateSistemaUser()
      if (!sistemaUser || !destId) return null

      const pair = [sistemaUser.id, destId].sort()
      const chaveDm = pair[0] + ':' + pair[1]

      const existing = $app.findRecordsByFilter(
        'chat_conversas',
        "tipo = 'dm' && chave_dm = '" + chaveDm + "'",
        '',
        1,
        0,
      )

      if (existing && existing.length > 0) return existing[0]

      let destNome = 'Colaborador'
      try {
        const destUser = $app.findRecordById('users', destId)
        if (destUser) destNome = (destUser.getString('name') || 'Colaborador').trim()
      } catch (_) {}

      const colConv = $app.findCollectionByNameOrId('chat_conversas')
      const novaConv = new Record(colConv)
      novaConv.set('tipo', 'dm')
      novaConv.set('titulo', 'Sistema & ' + destNome)
      novaConv.set('chave_dm', chaveDm)
      novaConv.set('participantes', [sistemaUser.id, destId])
      novaConv.set('total_mensagens', 0)
      novaConv.set('ultima_mensagem_texto', 'Notificações do sistema ativadas.')
      novaConv.set('ultimo_autor_nome', 'Sistema')
      novaConv.set('ultima_mensagem_tipo', 'notificacao')
      novaConv.set('ultima_mensagem_data', new Date().toISOString())
      $app.save(novaConv)

      return novaConv
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

    function enviarNotificacao(params) {
      if (jaFoiEnviada(params.chaveDedupe)) return false
      const sistemaUser = getOrCreateSistemaUser()
      if (!sistemaUser) return false

      const conversa = getOrCreateSistemaDm(params.usuarioId)
      if (!conversa) return false

      const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
      const msg = new Record(colMsg)
      msg.set('conversa', conversa.id)
      msg.set('autor', sistemaUser.id)
      msg.set('autor_nome', 'Sistema Projeto Guerra')
      msg.set('autor_role', 'admin')
      msg.set('texto', params.texto)
      msg.set('tipo', 'notificacao')
      if (params.metadata) {
        msg.set('metadata', params.metadata)
      }
      $app.save(msg)

      conversa.set('ultima_mensagem_texto', params.texto.slice(0, 120))
      conversa.set('ultimo_autor_nome', 'Sistema')
      conversa.set('ultima_mensagem_tipo', 'notificacao')
      conversa.set('ultima_mensagem_data', new Date().toISOString())
      conversa.set('total_mensagens', (conversa.getInt('total_mensagens') || 0) + 1)
      $app.save(conversa)

      try {
        const colNotif = $app.findCollectionByNameOrId('notificacoes_enviadas')
        const reg = new Record(colNotif)
        reg.set('chave_dedupe', params.chaveDedupe)
        reg.set('tipo', params.tipo)
        reg.set('usuario', params.usuarioId)
        if (params.clienteId) reg.set('cliente_id', params.clienteId)
        reg.set('conversa', conversa.id)
        reg.set('mensagem_id', msg.id)
        if (params.metadata) reg.set('dados', params.metadata)
        $app.save(reg)
      } catch (_) {}

      return true
    }

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

      const opId = c.getString('reagendado_operador') || c.getString('operador')
      if (!opId) continue

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
          '📅 [LEMBRETE DE FOLLOW-UP]\n' +
          'Olá! Você tem um retorno agendado para HOJE às ' +
          horaReagStr +
          '.\n\n' +
          '• Cliente: ' +
          cliNome +
          (cliCodigo ? ' (' + cliCodigo + ')' : '') +
          '\n' +
          '• Região/Rota: ' +
          cliRegiao +
          '\n' +
          '• Segmento: ' +
          cliSegmento +
          '\n\n' +
          '👉 Acesse a aba Atendimento para abrir a ficha e realizar o contato.'

        enviarNotificacao({
          chaveDedupe: chaveHoje,
          tipo: 'followup_dia',
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
          '⚠️ [FOLLOW-UP PENDENTE / ATRASADO]\n' +
          'Atenção: o retorno deste cliente estava previsto para ' +
          rD +
          '/' +
          rM +
          ' e ainda está pendente de contato!\n\n' +
          '• Cliente: ' +
          cliNome +
          (cliCodigo ? ' (' + cliCodigo + ')' : '') +
          '\n' +
          '• Região/Rota: ' +
          cliRegiao +
          '\n' +
          '• Segmento: ' +
          cliSegmento +
          '\n\n' +
          '👉 Abra a ficha em Atendimento e atualize o status para não perder a oportunidade.'

        enviarNotificacao({
          chaveDedupe: chaveAtraso,
          tipo: 'followup_atrasado',
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

      const operadores = $app.findRecordsByFilter(
        'users',
        "role = 'operador' || role = 'lider'",
        'name',
        100,
        0,
      )

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
          '☀️ [BOM DIA, ' +
          opNome.toUpperCase() +
          '! — RESUMO OPERACIONAL]\n' +
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

        enviarNotificacao({
          chaveDedupe: chaveResumo,
          tipo: 'resumo_matinal',
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
