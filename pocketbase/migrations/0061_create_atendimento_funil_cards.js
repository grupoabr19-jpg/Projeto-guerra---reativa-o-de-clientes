migrate(
  (app) => {
    const funisCol = app.findCollectionByNameOrId('atendimento_funis')
    const etapasCol = app.findCollectionByNameOrId('atendimento_funil_etapas')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Coleção atendimento_funil_cards
    // Armazena os cards do pipeline / kanban vinculados a etapas e funis
    // com suporte a contatos locais e contatos Kommo (modo somente-leitura preservado)
    const cardsCol = new Collection({
      name: 'atendimento_funil_cards',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'funil',
          type: 'relation',
          required: true,
          collectionId: funisCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'etapa',
          type: 'relation',
          required: true,
          collectionId: etapasCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'titulo',
          type: 'text',
          required: true,
          min: 1,
          max: 200,
        },
        {
          name: 'contato_nome',
          type: 'text',
          max: 200,
        },
        {
          name: 'telefone',
          type: 'text',
          max: 50,
        },
        {
          name: 'email',
          type: 'text',
          max: 150,
        },
        {
          name: 'valor',
          type: 'number',
        },
        {
          name: 'ordem',
          type: 'number',
        },
        {
          name: 'origem',
          type: 'text',
          max: 50,
        },
        {
          name: 'kommo_id',
          type: 'text',
          max: 80,
        },
        {
          name: 'cliente_id',
          type: 'text',
          max: 80,
        },
        {
          name: 'notas',
          type: 'text',
          max: 2000,
        },
        {
          name: 'historico_etapas',
          type: 'json',
        },
        {
          name: 'responsavel',
          type: 'relation',
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_atend_cards_funil_etapa ON atendimento_funil_cards (funil, etapa, ordem ASC)',
        'CREATE INDEX idx_atend_cards_kommo ON atendimento_funil_cards (kommo_id)',
        'CREATE INDEX idx_atend_cards_cliente ON atendimento_funil_cards (cliente_id)',
      ],
    })
    app.save(cardsCol)
  },
  (app) => {
    try {
      const cardsCol = app.findCollectionByNameOrId('atendimento_funil_cards')
      app.delete(cardsCol)
    } catch (_) {}
  },
)
