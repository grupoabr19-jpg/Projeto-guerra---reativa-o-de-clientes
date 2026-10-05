migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const regioesCol = app.findCollectionByNameOrId('regioes')

    // 1. Coleção chat_conversas
    // Tipos: dm (1:1), canal_rota (rota/região), geral (canal de anúncios e geral de todos)
    const chatConversas = new Collection({
      name: 'chat_conversas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: null, // não permite deleção acidental de conversas
      fields: [
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['geral', 'canal_rota', 'dm'],
          maxSelect: 1,
        },
        {
          name: 'titulo',
          type: 'text',
        },
        {
          name: 'regiao_nome',
          type: 'text',
        },
        {
          name: 'regiao',
          type: 'relation',
          collectionId: regioesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'participantes',
          type: 'relation',
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 50,
        },
        {
          name: 'chave_dm',
          type: 'text', // userA_id:userB_id ordenado para unicidade de 1:1
        },
        {
          name: 'ultimo_autor_nome',
          type: 'text',
        },
        {
          name: 'ultima_mensagem_texto',
          type: 'text',
        },
        {
          name: 'ultima_mensagem_tipo',
          type: 'text',
        },
        {
          name: 'ultima_mensagem_data',
          type: 'date',
        },
        {
          name: 'total_mensagens',
          type: 'number',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_chat_conversas_tipo ON chat_conversas (tipo)',
        'CREATE INDEX idx_chat_conversas_chave_dm ON chat_conversas (chave_dm)',
        'CREATE INDEX idx_chat_conversas_regiao ON chat_conversas (regiao_nome)',
        'CREATE INDEX idx_chat_conversas_updated ON chat_conversas (updated DESC)',
      ],
    })
    app.save(chatConversas)

    const conversasCol = app.findCollectionByNameOrId('chat_conversas')

    // 2. Coleção chat_mensagens
    // Tipos: normal | aviso (broadcast/anúncio)
    const chatMensagens = new Collection({
      name: 'chat_mensagens',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && autor = @request.auth.id",
      updateRule: null, // mensagens são imutáveis
      deleteRule: null,
      fields: [
        {
          name: 'conversa',
          type: 'relation',
          required: true,
          collectionId: conversasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'autor',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'autor_nome',
          type: 'text',
        },
        {
          name: 'autor_role',
          type: 'text',
        },
        {
          name: 'texto',
          type: 'text',
          required: true,
          max: 4000,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['normal', 'aviso'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_chat_msg_conversa_created ON chat_mensagens (conversa, created ASC)',
        'CREATE INDEX idx_chat_msg_tipo ON chat_mensagens (tipo)',
        'CREATE INDEX idx_chat_msg_created ON chat_mensagens (created DESC)',
      ],
    })
    app.save(chatMensagens)

    // 3. Coleção chat_leituras
    // Rastreia última leitura de cada usuário por conversa para contagem de não lidas sem pop-ups
    const chatLeituras = new Collection({
      name: 'chat_leituras',
      type: 'base',
      listRule: "@request.auth.id != '' && usuario = @request.auth.id",
      viewRule: "@request.auth.id != '' && usuario = @request.auth.id",
      createRule: "@request.auth.id != '' && usuario = @request.auth.id",
      updateRule: "@request.auth.id != '' && usuario = @request.auth.id",
      deleteRule: null,
      fields: [
        {
          name: 'conversa',
          type: 'relation',
          required: true,
          collectionId: conversasCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'usuario',
          type: 'relation',
          required: true,
          collectionId: usersCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'last_read',
          type: 'date',
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_chat_leituras_conv_user ON chat_leituras (conversa, usuario)',
        'CREATE INDEX idx_chat_leituras_user ON chat_leituras (usuario)',
      ],
    })
    app.save(chatLeituras)

    // 4. Seed do Canal Geral e dos Canais de Rota para garantir disponibilidade imediata
    try {
      const geralExiste = app.findRecordsByFilter('chat_conversas', "tipo = 'geral'", '', 1, 0)
      if (!geralExiste || geralExiste.length === 0) {
        const canalGeral = new Record(conversasCol)
        canalGeral.set('tipo', 'geral')
        canalGeral.set('titulo', 'Geral & Anúncios')
        canalGeral.set('regiao_nome', '')
        canalGeral.set(
          'ultima_mensagem_texto',
          'Canal oficial aberto para toda a equipe do Projeto Guerra.',
        )
        canalGeral.set('ultimo_autor_nome', 'Sistema')
        canalGeral.set('ultima_mensagem_tipo', 'aviso')
        canalGeral.set('ultima_mensagem_data', new Date().toISOString())
        canalGeral.set('total_mensagens', 1)
        app.save(canalGeral)

        // Criar mensagem de boas-vindas no canal geral
        const msgCol = app.findCollectionByNameOrId('chat_mensagens')
        const adminUser = app.findFirstRecordByData('users', 'role', 'admin')
        if (adminUser) {
          const welcomeMsg = new Record(msgCol)
          welcomeMsg.set('conversa', canalGeral.id)
          welcomeMsg.set('autor', adminUser.id)
          welcomeMsg.set('autor_nome', adminUser.getString('name') || 'Administração')
          welcomeMsg.set('autor_role', 'admin')
          welcomeMsg.set(
            'texto',
            'Bem-vindos ao chat interno do Projeto Guerra! Aqui você pode trocar mensagens 1:1, participar do canal da sua rota e acompanhar avisos e novidades.',
          )
          welcomeMsg.set('tipo', 'aviso')
          app.save(welcomeMsg)
        }
      }
    } catch (e) {
      console.log('Aviso ao inicializar canal Geral: ' + e)
    }

    // Seed canais de rota a partir de regioes ativas
    try {
      const regioesList = app.findRecordsByFilter('regioes', 'ativo = true', 'ordem', 50, 0)
      for (let r = 0; r < regioesList.length; r++) {
        const reg = regioesList[r]
        const rNome = reg.getString('nome')
        if (!rNome) continue
        const existe = app.findRecordsByFilter(
          'chat_conversas',
          `tipo = 'canal_rota' && regiao_nome = '${rNome}'`,
          '',
          1,
          0,
        )
        if (!existe || existe.length === 0) {
          const canalRota = new Record(conversasCol)
          canalRota.set('tipo', 'canal_rota')
          canalRota.set('titulo', 'Rota ' + rNome)
          canalRota.set('regiao_nome', rNome)
          canalRota.set('regiao', reg.id)
          canalRota.set('ultima_mensagem_texto', 'Canal da rota ' + rNome + ' ativado.')
          canalRota.set('ultimo_autor_nome', 'Sistema')
          canalRota.set('ultima_mensagem_tipo', 'normal')
          canalRota.set('ultima_mensagem_data', new Date().toISOString())
          canalRota.set('total_mensagens', 0)
          app.save(canalRota)
        }
      }
    } catch (e) {
      console.log('Aviso ao inicializar canais de rota: ' + e)
    }
  },
  (app) => {
    try {
      const leituras = app.findCollectionByNameOrId('chat_leituras')
      app.delete(leituras)
    } catch (_) {}
    try {
      const msgs = app.findCollectionByNameOrId('chat_mensagens')
      app.delete(msgs)
    } catch (_) {}
    try {
      const conversas = app.findCollectionByNameOrId('chat_conversas')
      app.delete(conversas)
    } catch (_) {}
  },
)
