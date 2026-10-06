migrate(
  (app) => {
    // 1. Remover mensagens antigas de boas-vindas com dados estáticos/desatualizados
    // (ex.: autor Pietra Leite com menção a canais de rota descontinuados)
    try {
      const msgsAntigas = app.findRecordsByFilter(
        'chat_mensagens',
        "texto ~ 'Bem-vindos ao chat interno' || texto ~ 'canal da sua rota'",
        '',
        100,
        0,
      )

      for (let i = 0; i < msgsAntigas.length; i++) {
        const msg = msgsAntigas[i]
        const convId = msg.getString('conversa')
        try {
          app.delete(msg)
          console.log('[0073_migration] Mensagem antiga de boas-vindas removida: ' + msg.id)
        } catch (delErr) {
          console.log('[0073_migration] Erro ao remover mensagem: ' + delErr.message)
        }

        // Se a conversa era o canal geral, atualizar contadores e última mensagem
        if (convId) {
          try {
            const conv = app.findRecordById('chat_conversas', convId)
            const msgsRestantes = app.findRecordsByFilter(
              'chat_mensagens',
              `conversa = '${convId}'`,
              '-created',
              10,
              0,
            )
            conv.set('total_mensagens', msgsRestantes.length)
            if (msgsRestantes.length > 0) {
              const ult = msgsRestantes[0]
              const txt = ult.getString('texto') || ''
              conv.set('ultima_mensagem_texto', txt.length > 120 ? txt.slice(0, 117) + '...' : txt)
              conv.set('ultimo_autor_nome', ult.getString('autor_nome') || 'Sistema')
              conv.set('ultima_mensagem_tipo', ult.getString('tipo') || 'normal')
              conv.set('ultima_mensagem_data', ult.getString('created') || new Date().toISOString())
            } else {
              conv.set(
                'ultima_mensagem_texto',
                'Canal oficial aberto para toda a equipe do Projeto Guerra.',
              )
              conv.set('ultimo_autor_nome', 'Sistema')
              conv.set('ultima_mensagem_tipo', 'aviso')
              conv.set('ultima_mensagem_data', new Date().toISOString())
            }
            app.save(conv)
          } catch (_) {}
        }
      }
    } catch (e) {
      console.log('[0073_migration] Aviso na limpeza de mensagens antigas: ' + e.message)
    }

    // 2. Garantir saneamento do canal Geral
    try {
      const canalGeral = app.findFirstRecordByData('chat_conversas', 'tipo', 'geral')
      if (canalGeral) {
        const msgsGeral = app.findRecordsByFilter(
          'chat_mensagens',
          `conversa = '${canalGeral.id}'`,
          '-created',
          50,
          0,
        )
        canalGeral.set('total_mensagens', msgsGeral.length)
        if (msgsGeral.length > 0) {
          const ult = msgsGeral[0]
          const txt = ult.getString('texto') || ''
          canalGeral.set(
            'ultima_mensagem_texto',
            txt.length > 120 ? txt.slice(0, 117) + '...' : txt,
          )
          canalGeral.set('ultimo_autor_nome', ult.getString('autor_nome') || 'Sistema')
          canalGeral.set('ultima_mensagem_tipo', ult.getString('tipo') || 'normal')
          canalGeral.set(
            'ultima_mensagem_data',
            ult.getString('created') || new Date().toISOString(),
          )
        } else {
          canalGeral.set(
            'ultima_mensagem_texto',
            'Canal oficial aberto para toda a equipe do Projeto Guerra.',
          )
          canalGeral.set('ultimo_autor_nome', 'Sistema')
          canalGeral.set('ultima_mensagem_tipo', 'aviso')
        }
        app.save(canalGeral)
      }
    } catch (_) {}
  },
  () => {
    // Reversão não necessária para limpeza de mensagens obsoletas
  },
)
