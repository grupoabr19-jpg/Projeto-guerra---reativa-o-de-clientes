/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0070:
 * 1. Cria a conta técnica oficial do Sistema (sistema@grupoabr.com.br, role: 'admin')
 *    para envio de notificações e avisos internos sem recair sobre o usuário Thiago Almeida.
 * 2. Saneamento das conversas de notificação geradas indevidamente:
 *    - Conversas de notificações automáticas (ex.: "Sistema & ...") que continham o Thiago
 *      têm o Thiago substituído pelo usuário Sistema nos participantes e na chave_dm.
 *    - Mensagens com tipo='notificacao' e autor_nome contendo 'Sistema' passam a ter autor=sistemaUser.id.
 *    - Na conversa pessoal 'rgrcstcn9twvltz' (Thiago Almeida & Camila Guimenti), a mensagem de notificação
 *      é movida para a conversa exclusiva do Sistema com a Camila Guimenti, restaurando o título, tipo e
 *      contadores da conversa pessoal do Thiago.
 *    - Leituras e contadores do Thiago são higienizados para remover os lembretes indevidos.
 */

migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const thiagoId = '8ug71b12p1ect6u'

    // 1. Garantir conta do usuário Sistema
    let sistemaUser = null
    try {
      sistemaUser = app.findAuthRecordByEmail('_pb_users_auth_', 'sistema@grupoabr.com.br')
    } catch (_) {
      try {
        sistemaUser = app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
      } catch (_) {}
    }

    if (!sistemaUser) {
      const newUser = new Record(usersCol)
      newUser.setEmail('sistema@grupoabr.com.br')
      newUser.setPassword('Skip@Pass987!')
      newUser.setVerified(true)
      newUser.set('name', 'Sistema Projeto Guerra')
      newUser.set('role', 'admin')
      newUser.set('regioes', [
        'BRAGANÇA',
        'JUNDIAÍ',
        'VARGINHA',
        'POUSO ALEGRE',
        'POÇOS DE CALDAS',
        'ITAJUBÁ',
        'EXTREMA',
        'CAMBUÍ',
        'ATACADO',
        'REPESCAGEM',
      ])
      app.save(newUser)
      sistemaUser = newUser
    }

    const sistemaId = sistemaUser.id

    // 2. Tratar especificamente a conversa híbrida entre Thiago e Camila (rgrcstcn9twvltz)
    // onde havia mensagens manuais do Thiago e da Camila, e caiu 1 mensagem de notificação.
    try {
      const convCamila = app.findRecordById('chat_conversas', 'rgrcstcn9twvltz')
      if (convCamila) {
        const camilaId = 'r382fh2anbfa06y'

        // Garantir ou criar a DM oficial entre Sistema e Camila
        const pairSistemaCamila = [sistemaId, camilaId].sort()
        const chaveDmSistemaCamila = pairSistemaCamila[0] + ':' + pairSistemaCamila[1]

        let dmSistemaCamila = null
        const existingDm = app.findRecordsByFilter(
          'chat_conversas',
          "tipo = 'dm' && chave_dm = '" + chaveDmSistemaCamila + "'",
          '',
          1,
          0,
        )

        if (existingDm && existingDm.length > 0) {
          dmSistemaCamila = existingDm[0]
        } else {
          const novaDm = new Record(app.findCollectionByNameOrId('chat_conversas'))
          novaDm.set('tipo', 'dm')
          novaDm.set('titulo', 'Sistema & Camila Guimenti')
          novaDm.set('chave_dm', chaveDmSistemaCamila)
          novaDm.set('participantes', [sistemaId, camilaId])
          novaDm.set('total_mensagens', 0)
          novaDm.set('ultima_mensagem_texto', 'Notificações do sistema ativadas.')
          novaDm.set('ultimo_autor_nome', 'Sistema')
          novaDm.set('ultima_mensagem_tipo', 'notificacao')
          novaDm.set('ultima_mensagem_data', new Date().toISOString())
          app.save(novaDm)
          dmSistemaCamila = novaDm
        }

        // Mover a mensagem de notificação 'hp6mrexswryc70l' da conversa do Thiago para a DM do Sistema
        try {
          const notifMsg = app.findRecordById('chat_mensagens', 'hp6mrexswryc70l')
          if (notifMsg) {
            notifMsg.set('conversa', dmSistemaCamila.id)
            notifMsg.set('autor', sistemaId)
            app.save(notifMsg)

            // Atualizar notificacoes_enviadas correspondente
            const notifsEnv = app.findRecordsByFilter(
              'notificacoes_enviadas',
              "mensagem_id = 'hp6mrexswryc70l'",
              '',
              1,
              0,
            )
            if (notifsEnv && notifsEnv.length > 0) {
              notifsEnv[0].set('conversa', dmSistemaCamila.id)
              app.save(notifsEnv[0])
            }

            // Atualizar resumo da DM Sistema & Camila
            dmSistemaCamila.set('ultima_mensagem_texto', notifMsg.getString('texto').slice(0, 120))
            dmSistemaCamila.set('ultimo_autor_nome', 'Sistema')
            dmSistemaCamila.set('ultima_mensagem_tipo', 'notificacao')
            dmSistemaCamila.set('ultima_mensagem_data', notifMsg.getString('created'))
            dmSistemaCamila.set('total_mensagens', 1)
            app.save(dmSistemaCamila)
          }
        } catch (_) {}

        // Restaurar a conversa pessoal Thiago Almeida & Camila Guimenti
        // Total de mensagens reais = 3 (Thiago: oi, =3; Camila: chegou)
        convCamila.set('titulo', 'Thiago Almeida & Camila Guimenti')
        convCamila.set('total_mensagens', 3)
        convCamila.set('ultima_mensagem_texto', 'chegou')
        convCamila.set('ultimo_autor_nome', 'Camila Guimenti')
        convCamila.set('ultima_mensagem_tipo', 'normal')
        convCamila.set('ultima_mensagem_data', '2026-10-06 14:02:48.188Z')
        app.save(convCamila)
      }
    } catch (_) {}

    // 3. Saneamento das demais DMs do Sistema que foram criadas com o Thiago
    // (ex.: Sistema & Milena Vaz, Bruna Pereira, Vitoria Tavares, Paola Santos, Thais Oliveira, Rafel Pereira)
    const convsSistemaComThiago = app.findRecordsByFilter(
      'chat_conversas',
      "tipo = 'dm' && titulo ~ 'Sistema &' && participantes ~ '" + thiagoId + "'",
      '',
      50,
      0,
    )

    for (let i = 0; i < convsSistemaComThiago.length; i++) {
      const conv = convsSistemaComThiago[i]
      let partes = conv.getStringSlice('participantes') || []

      // Substituir Thiago pelo Sistema nos participantes
      partes = partes.filter((p) => p !== thiagoId)
      if (!partes.includes(sistemaId)) {
        partes.push(sistemaId)
      }
      conv.set('participantes', partes)

      // Recalcular chave_dm ordenada
      const pair = partes.slice(0, 2).sort()
      if (pair.length === 2) {
        conv.set('chave_dm', pair[0] + ':' + pair[1])
      }

      app.save(conv)

      // Remover qualquer chat_leituras de Thiago nessas conversas do Sistema
      try {
        const leiturasThiago = app.findRecordsByFilter(
          'chat_leituras',
          "conversa = '" + conv.id + "' && usuario = '" + thiagoId + "'",
          '',
          10,
          0,
        )
        for (let l = 0; l < leiturasThiago.length; l++) {
          app.delete(leiturasThiago[l])
        }
      } catch (_) {}
    }

    // 4. Corrigir o autor de todas as mensagens de notificação que estavam apontando para o Thiago
    try {
      const msgsNotif = app.findRecordsByFilter(
        'chat_mensagens',
        "autor = '" + thiagoId + "' && (tipo ~ 'notificacao' || autor_nome ~ 'Sistema')",
        '',
        200,
        0,
      )
      for (let m = 0; m < msgsNotif.length; m++) {
        const msg = msgsNotif[m]
        msg.set('autor', sistemaId)
        app.save(msg)
      }
    } catch (_) {}
  },
  () => {
    // Revert opcional
  },
)
