migrate(
  (app) => {
    // 1. Atualizar campos da coleção chat_mensagens para suportar tipo 'notificacao' e metadados estruturados
    try {
      const colMsg = app.findCollectionByNameOrId('chat_mensagens')

      // Atualizar o selectField tipo para aceitar: normal, aviso, notificacao
      const tipoField = colMsg.fields.getByName('tipo')
      if (tipoField) {
        tipoField.values = ['normal', 'aviso', 'notificacao']
        tipoField.maxSelect = 3
      }

      // Adicionar campo json 'metadata' para dados da notificação (tipo_evento, cliente_id, link, titulo_id, etc.)
      if (!colMsg.fields.getByName('metadata')) {
        colMsg.fields.add(
          new JSONField({
            name: 'metadata',
            maxSize: 1048576,
          }),
        )
      }

      app.save(colMsg)
    } catch (err) {
      console.log('[migration 0069] Aviso ao atualizar chat_mensagens: ' + err.message)
    }

    // 2. Criar coleção para deduplicação e auditoria de notificações enviadas
    // Evita rigorosamente reenviar o mesmo lembrete no mesmo dia ou repetição desnecessária
    try {
      const colNotif = new Collection({
        name: 'notificacoes_enviadas',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')",
        viewRule:
          "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          {
            name: 'chave_dedupe',
            type: 'text',
            required: true,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: [
              'followup_dia',
              'followup_atrasado',
              'resumo_matinal',
              'ranking_subida',
              'ranking_conquista',
              'cliente_devolvido',
            ],
            maxSelect: 6,
          },
          {
            name: 'usuario',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'cliente_id',
            type: 'text',
          },
          {
            name: 'conversa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('chat_conversas').id,
            maxSelect: 1,
          },
          {
            name: 'mensagem_id',
            type: 'text',
          },
          {
            name: 'dados',
            type: 'json',
            maxSize: 524288,
          },
          {
            name: 'created',
            type: 'autodate',
            onCreate: true,
            onUpdate: false,
          },
          {
            name: 'updated',
            type: 'autodate',
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_notif_chave_dedupe ON notificacoes_enviadas (chave_dedupe)',
          'CREATE INDEX idx_notif_usuario_tipo ON notificacoes_enviadas (usuario, tipo)',
          'CREATE INDEX idx_notif_created ON notificacoes_enviadas (created DESC)',
        ],
      })
      app.save(colNotif)
    } catch (err) {
      console.log('[migration 0069] Aviso ao criar notificacoes_enviadas: ' + err.message)
    }
  },
  (app) => {
    try {
      const colNotif = app.findCollectionByNameOrId('notificacoes_enviadas')
      app.delete(colNotif)
    } catch (_) {}
  },
)
