migrate(
  (app) => {
    // 1. Atualizar campos de chat_conversas para suportar tipo 'kommo_whatsapp'
    const convCol = app.findCollectionByNameOrId('chat_conversas')
    const tipoField = convCol.fields.getByName('tipo')
    if (tipoField) {
      // adicionar 'kommo_whatsapp' aos valores permitidos
      tipoField.values = ['geral', 'canal_rota', 'dm', 'kommo_whatsapp']
    }

    // Novos campos em chat_conversas para a bridge Kommo
    const camposExtrasConv = [
      { name: 'kommo_chat_id', type: 'text', max: 120 },
      { name: 'kommo_contact_id', type: 'text', max: 120 },
      { name: 'kommo_lead_id', type: 'text', max: 120 },
      { name: 'kommo_phone', type: 'text', max: 50 },
      { name: 'kommo_phone_clean', type: 'text', max: 50 },
      { name: 'cliente_id', type: 'text', max: 80 },
      { name: 'responsavel_id', type: 'text', max: 80 },
    ]

    for (let i = 0; i < camposExtrasConv.length; i++) {
      const c = camposExtrasConv[i]
      if (!convCol.fields.getByName(c.name)) {
        convCol.fields.add(
          new TextField({
            name: c.name,
            max: c.max,
          }),
        )
      }
    }

    // Criar índices para busca rápida de conversas por telefone ou kommo_chat_id
    try {
      convCol.indexes.push(
        'CREATE INDEX idx_chat_conv_kommo_phone ON chat_conversas (kommo_phone_clean)',
      )
      convCol.indexes.push(
        'CREATE INDEX idx_chat_conv_kommo_chat ON chat_conversas (kommo_chat_id)',
      )
    } catch (_) {}

    app.save(convCol)

    // 2. Atualizar campos de chat_mensagens para suportar metadados externos do Kommo
    const msgCol = app.findCollectionByNameOrId('chat_mensagens')
    const camposExtrasMsg = [
      { name: 'kommo_message_id', type: 'text', max: 120 },
      { name: 'kommo_status', type: 'text', max: 50 }, // 'recebida', 'enviada', 'erro', 'pendente'
      { name: 'kommo_error', type: 'text', max: 500 },
      { name: 'direcao', type: 'text', max: 20 }, // 'entrada', 'saida'
    ]

    for (let i = 0; i < camposExtrasMsg.length; i++) {
      const c = camposExtrasMsg[i]
      if (!msgCol.fields.getByName(c.name)) {
        msgCol.fields.add(
          new TextField({
            name: c.name,
            max: c.max,
          }),
        )
      }
    }

    try {
      msgCol.indexes.push('CREATE INDEX idx_chat_msg_kommo_id ON chat_mensagens (kommo_message_id)')
    } catch (_) {}

    app.save(msgCol)

    console.log('[0063] Migração de suporte Kommo WhatsApp chat executada com sucesso.')
  },
  (app) => {
    // Reversão básica sem perda de integridade
    try {
      const convCol = app.findCollectionByNameOrId('chat_conversas')
      const tipoField = convCol.fields.getByName('tipo')
      if (tipoField) {
        tipoField.values = ['geral', 'canal_rota', 'dm']
      }
      app.save(convCol)
    } catch (_) {}
  },
)
