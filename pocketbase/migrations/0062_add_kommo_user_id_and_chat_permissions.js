migrate(
  (app) => {
    // 1. Adicionar campo kommo_user_id na coleção users
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('kommo_user_id')) {
      usersCol.fields.add(
        new TextField({
          name: 'kommo_user_id',
          required: false,
        }),
      )
    }
    if (!usersCol.fields.getByName('kommo_user_nome')) {
      usersCol.fields.add(
        new TextField({
          name: 'kommo_user_nome',
          required: false,
        }),
      )
    }
    app.save(usersCol)

    // 2. Atualizar access rules da coleção chat_conversas e chat_mensagens para impor segurança no servidor
    // Admin tem visão irrestrita (supervisão de conversas).
    // Demais perfis (operador, líder, supervisor):
    // - chat_conversas: list/view só se for canal geral, ou se fizer parte de participantes (para DM), ou rota atribuída
    // - chat_mensagens: list/view só se admin OU se a conversa for permitida (participantes inclui o usuário ou canal geral ou canal da rota)
    const chatConversasCol = app.findCollectionByNameOrId('chat_conversas')
    // Regra PB: Admin pode ver todas. Não-admin só vê se geral, rota atribuída, ou se está em participantes
    chatConversasCol.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || tipo = 'geral' || tipo = 'canal_rota' || participantes ~ @request.auth.id)"
    chatConversasCol.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || tipo = 'geral' || tipo = 'canal_rota' || participantes ~ @request.auth.id)"
    app.save(chatConversasCol)

    const chatMensagensCol = app.findCollectionByNameOrId('chat_mensagens')
    chatMensagensCol.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || conversa.tipo = 'geral' || conversa.tipo = 'canal_rota' || conversa.participantes ~ @request.auth.id)"
    chatMensagensCol.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || conversa.tipo = 'geral' || conversa.tipo = 'canal_rota' || conversa.participantes ~ @request.auth.id)"
    app.save(chatMensagensCol)
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      const f1 = usersCol.fields.getByName('kommo_user_id')
      if (f1) usersCol.fields.remove(f1)
      const f2 = usersCol.fields.getByName('kommo_user_nome')
      if (f2) usersCol.fields.remove(f2)
      app.save(usersCol)
    } catch (_) {}

    try {
      const chatConversasCol = app.findCollectionByNameOrId('chat_conversas')
      chatConversasCol.listRule = "@request.auth.id != ''"
      chatConversasCol.viewRule = "@request.auth.id != ''"
      app.save(chatConversasCol)

      const chatMensagensCol = app.findCollectionByNameOrId('chat_mensagens')
      chatMensagensCol.listRule = "@request.auth.id != ''"
      chatMensagensCol.viewRule = "@request.auth.id != ''"
      app.save(chatMensagensCol)
    } catch (_) {}
  },
)
