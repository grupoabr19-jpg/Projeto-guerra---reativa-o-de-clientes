migrate(
  (app) => {
    // Atualizar deleteRule da coleção chat_mensagens
    // Permite exclusão via deleteRule base se for o autor ou admin.
    // A validação avançada (autor, admin, ou destinatário quando autor é Sistema)
    // é reforçada em pb_hooks (onRecordDeleteRequest e endpoint dedicado).
    const chatMensagensCol = app.findCollectionByNameOrId('chat_mensagens')
    chatMensagensCol.deleteRule =
      "@request.auth.id != '' && (autor = @request.auth.id || @request.auth.role = 'admin' || (conversa.tipo = 'dm' && conversa.participantes ~ @request.auth.id))"
    app.save(chatMensagensCol)
  },
  (app) => {
    try {
      const chatMensagensCol = app.findCollectionByNameOrId('chat_mensagens')
      chatMensagensCol.deleteRule = null
      app.save(chatMensagensCol)
    } catch (_) {}
  },
)
