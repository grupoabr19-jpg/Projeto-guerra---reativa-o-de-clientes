/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0072_sanear_conversas_sistema_e_permitir_excluir.js
 *
 * 1. Define regra de exclusão (deleteRule) na coleção chat_conversas:
 *    - Admin pode apagar qualquer conversa (exceto canal Geral);
 *    - Colaborador pode apagar/descartar suas conversas 1:1 onde é participante (exceto geral);
 *    - Ninguém pode apagar o canal Geral & Anúncios nem conversas alheias.
 *
 * 2. Saneia a base existente:
 *    - Localiza ou cria a conta técnica 'sistema@grupoabr.com.br';
 *    - Localiza todas as conversas do tipo 'dm' que envolvem o usuário Sistema;
 *    - Agrupa por colaborador parceiro;
 *    - Para cada colaborador:
 *      * Se houver conversas do Sistema, elege 1 conversa única (a que tiver mais mensagens ou a mais recente);
 *      * Move todas as mensagens de conversas duplicadas para a conversa principal;
 *      * Apaga as conversas duplicadas e suas leituras orfãs;
 *      * Recalcula total_mensagens, ultima_mensagem_texto, ultima_mensagem_data, etc. da conversa única;
 *      * Garante que chave_dm esteja no formato padronizado pair[0]:pair[1];
 *      * Se a conversa única tiver 0 mensagens, remove-a para não poluir a barra lateral, ou mantém limpa com título 'Sistema & Nome';
 *      * Se houver mensagens na conversa única, ajusta a prévia da última mensagem real (em vez de "Conversa iniciada.").
 */
migrate(
  (app) => {
    // 1. Atualizar regras de exclusão de chat_conversas
    const conversasCol = app.findCollectionByNameOrId('chat_conversas')
    // deleteRule:
    // admin pode deletar qualquer conversa que NÃO seja tipo geral
    // ou participante de dm/kommo_whatsapp pode deletar sua conversa
    conversasCol.deleteRule =
      "@request.auth.id != '' && tipo != 'geral' && (@request.auth.role = 'admin' || (tipo = 'dm' && participantes ~ @request.auth.id) || (tipo = 'kommo_whatsapp' && (participantes ~ @request.auth.id || responsavel_id = @request.auth.id)))"
    app.save(conversasCol)

    // 2. Garantir usuário Sistema
    let sistemaUser = null
    try {
      sistemaUser = app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
    } catch (_) {
      try {
        const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
        sistemaUser = new Record(usersCol)
        sistemaUser.setEmail('sistema@grupoabr.com.br')
        sistemaUser.setPassword('Skip@Pass987!')
        sistemaUser.setVerified(true)
        sistemaUser.set('name', 'Sistema Projeto Guerra')
        sistemaUser.set('role', 'admin')
        app.save(sistemaUser)
      } catch (err) {
        console.log('[0072_migration] Erro ao criar conta do sistema: ' + err.message)
      }
    }

    if (!sistemaUser) {
      console.log('[0072_migration] Usuário do sistema não encontrado/criado. Abortando merge.')
      return
    }

    const sistemaId = sistemaUser.id

    // 3. Buscar todas as conversas do tipo DM
    const dms = app.findRecordsByFilter('chat_conversas', "tipo = 'dm'", '-updated', 1000, 0)
    console.log('[0072_migration] Total de DMs encontradas: ' + dms.length)

    // Agrupar conversas do Sistema por ID do colaborador destinatário
    const dmsPorColaborador = {}

    for (let i = 0; i < dms.length; i++) {
      const conv = dms[i]
      let parts = []
      try {
        parts = conv.getStringSlice('participantes') || []
      } catch (_) {}

      const titulo = conv.getString('titulo') || ''
      const isSistemaConv =
        parts.includes(sistemaId) || titulo.startsWith('Sistema &') || titulo.endsWith('& Sistema')

      if (!isSistemaConv) continue

      // Identificar o colaborador parceiro
      const outroId = parts.find((p) => p !== sistemaId)
      if (!outroId) {
        // Conversa sem colaborador identificado — verificar se tem mensagens
        const msgs = app.findRecordsByFilter('chat_mensagens', `conversa = '${conv.id}'`, '', 1, 0)
        if (!msgs || msgs.length === 0) {
          try {
            app.delete(conv)
            console.log(
              '[0072_migration] Removida conversa órfã do sistema sem parceiro: ' + conv.id,
            )
          } catch (_) {}
        }
        continue
      }

      if (!dmsPorColaborador[outroId]) {
        dmsPorColaborador[outroId] = []
      }
      dmsPorColaborador[outroId].push(conv)
    }

    // Processar cada colaborador que possui conversas do Sistema
    const colabIds = Object.keys(dmsPorColaborador)
    console.log('[0072_migration] Colaboradores com conversas do sistema: ' + colabIds.length)

    for (let c = 0; c < colabIds.length; c++) {
      const colabId = colabIds[c]
      const listaConvs = dmsPorColaborador[colabId]

      let colabNome = 'Colaborador'
      try {
        const uRec = app.findRecordById('users', colabId)
        if (uRec)
          colabNome = (uRec.getString('name') || uRec.getString('email') || 'Colaborador').trim()
      } catch (_) {}

      // Padronizar chave_dm
      const pair = [sistemaId, colabId].sort()
      const chaveDmPadrao = pair[0] + ':' + pair[1]

      // Avaliar mensagens em cada conversa para eleger a primária
      const convsComContagem = []
      for (let k = 0; k < listaConvs.length; k++) {
        const conv = listaConvs[k]
        let count = 0
        try {
          const msgs = app.findRecordsByFilter(
            'chat_mensagens',
            `conversa = '${conv.id}'`,
            '-created',
            500,
            0,
          )
          count = msgs.length
        } catch (_) {}
        convsComContagem.push({ conv, count })
      }

      // Ordenar: primeiro as que têm mais mensagens, depois as criadas mais recentemente
      convsComContagem.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return (b.conv.getString('created') || '').localeCompare(a.conv.getString('created') || '')
      })

      const totalMensagensTodas = convsComContagem.reduce((acc, curr) => acc + curr.count, 0)

      if (totalMensagensTodas === 0) {
        // Todas estão vazias ("Conversa iniciada." sem mensagens)
        // O usuário reportou: remover conversas vazias/duplicadas para que a barra lateral fique limpa
        // Deixamos apenas UMA conversa vazia bem estruturada com chave_dm padronizada, ou removemos todas
        // O prompt pede: "Se uma conversa duplicada estiver vazia ('Conversa iniciada.' sem mensagens), simplesmente removê-la."
        // Mantemos 1 única conversa limpa ou apagamos todas? Prompt:
        // "REgra desejada: DEVE existir exatamente UMA conversa 1:1 entre Sistema e cada colaborador... Se uma conversa duplicada estiver vazia, simplesmente removê-la."
        // Então deixamos exatamente 1 conversa para o colaborador e apagamos as demais.
        const primaria = convsComContagem[0].conv
        primaria.set('chave_dm', chaveDmPadrao)
        primaria.set('participantes', [sistemaId, colabId])
        primaria.set('titulo', 'Sistema & ' + colabNome)
        primaria.set('total_mensagens', 0)
        primaria.set('ultima_mensagem_texto', 'Notificações automáticas do Sistema.')
        primaria.set('ultimo_autor_nome', 'Sistema')
        primaria.set('ultima_mensagem_tipo', 'notificacao')
        primaria.set('ultima_mensagem_data', new Date().toISOString())
        app.save(primaria)

        for (let k = 1; k < convsComContagem.length; k++) {
          try {
            app.delete(convsComContagem[k].conv)
            console.log(
              '[0072_migration] Deletada conversa vazia duplicada: ' + convsComContagem[k].conv.id,
            )
          } catch (delErr) {
            console.log('[0072_migration] Erro ao deletar vazia: ' + delErr.message)
          }
        }
        continue
      }

      // Caso tenha mensagens: eleger a primária e migrar as mensagens das outras para ela
      const primaria = convsComContagem[0].conv
      primaria.set('chave_dm', chaveDmPadrao)
      primaria.set('participantes', [sistemaId, colabId])
      primaria.set('titulo', 'Sistema & ' + colabNome)

      for (let k = 1; k < convsComContagem.length; k++) {
        const duplicada = convsComContagem[k].conv
        try {
          const msgsDuplicadas = app.findRecordsByFilter(
            'chat_mensagens',
            `conversa = '${duplicada.id}'`,
            '',
            500,
            0,
          )
          for (let m = 0; m < msgsDuplicadas.length; m++) {
            const msg = msgsDuplicadas[m]
            msg.set('conversa', primaria.id)
            app.save(msg)
          }

          // Atualizar notificações enviadas apontando para a conversa primária
          const notifsDuplicadas = app.findRecordsByFilter(
            'notificacoes_enviadas',
            `conversa = '${duplicada.id}'`,
            '',
            500,
            0,
          )
          for (let n = 0; n < notifsDuplicadas.length; n++) {
            const notif = notifsDuplicadas[n]
            notif.set('conversa', primaria.id)
            app.save(notif)
          }

          // Deletar leituras da duplicada
          const leiturasDuplicadas = app.findRecordsByFilter(
            'chat_leituras',
            `conversa = '${duplicada.id}'`,
            '',
            100,
            0,
          )
          for (let l = 0; l < leiturasDuplicadas.length; l++) {
            app.delete(leiturasDuplicadas[l])
          }

          // Deletar a conversa duplicada
          app.delete(duplicada)
          console.log(
            '[0072_migration] Conversa duplicada ' +
              duplicada.id +
              ' fundida com sucesso na primária ' +
              primaria.id,
          )
        } catch (mergeErr) {
          console.log('[0072_migration] Erro ao fundir duplicada: ' + mergeErr.message)
        }
      }

      // Recalcular última mensagem e total_mensagens da conversa primária
      try {
        const todasMsgsPrimaria = app.findRecordsByFilter(
          'chat_mensagens',
          `conversa = '${primaria.id}'`,
          '-created',
          500,
          0,
        )

        primaria.set('total_mensagens', todasMsgsPrimaria.length)
        if (todasMsgsPrimaria.length > 0) {
          const ultima = todasMsgsPrimaria[0]
          const txt = ultima.getString('texto') || ''
          const resumo = txt.length > 120 ? txt.slice(0, 117) + '...' : txt
          primaria.set('ultima_mensagem_texto', resumo)
          primaria.set('ultimo_autor_nome', ultima.getString('autor_nome') || 'Sistema')
          primaria.set('ultima_mensagem_tipo', ultima.getString('tipo') || 'notificacao')
          primaria.set(
            'ultima_mensagem_data',
            ultima.getString('created') || new Date().toISOString(),
          )
        } else {
          primaria.set('ultima_mensagem_texto', 'Notificações automáticas do Sistema.')
          primaria.set('ultimo_autor_nome', 'Sistema')
          primaria.set('ultima_mensagem_tipo', 'notificacao')
          primaria.set('ultima_mensagem_data', new Date().toISOString())
        }
        app.save(primaria)
        console.log(
          '[0072_migration] Conversa primária consolidada para colab ' +
            colabNome +
            ' com ' +
            todasMsgsPrimaria.length +
            ' mensagens.',
        )
      } catch (recalcErr) {
        console.log('[0072_migration] Erro ao recalcular primária: ' + recalcErr.message)
      }
    }
  },
  (app) => {
    // Reverter deleteRule de chat_conversas para a regra anterior
    try {
      const conversasCol = app.findCollectionByNameOrId('chat_conversas')
      conversasCol.deleteRule = null
      app.save(conversasCol)
    } catch (_) {}
  },
)
