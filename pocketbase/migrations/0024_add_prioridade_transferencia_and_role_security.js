/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0024_add_prioridade_transferencia_and_role_security.js
    const clientes = app.findCollectionByNameOrId('clientes')

    // 1. Adicionar campo prioridade_transferencia se não existir
    if (!clientes.fields.getByName('prioridade_transferencia')) {
      clientes.fields.add(
        new BoolField({
          name: 'prioridade_transferencia',
          required: false,
        }),
      )
    }

    app.save(clientes)

    // 2. Adicionar índice para prioridade_transferencia e reagendado_operador
    try {
      clientes.addIndex(
        'idx_clientes_reagendado_prioridade',
        false,
        'reagendado_operador, prioridade_transferencia, reagendado_para',
        '',
      )
      app.save(clientes)
    } catch (e) {
      console.log('Aviso ao adicionar índice idx_clientes_reagendado_prioridade:', e)
    }
  },
  (app) => {
    const clientes = app.findCollectionByNameOrId('clientes')
    try {
      clientes.removeIndex('idx_clientes_reagendado_prioridade')
    } catch (_) {}
    const f = clientes.fields.getByName('prioridade_transferencia')
    if (f) {
      clientes.fields.removeByName('prioridade_transferencia')
    }
    app.save(clientes)
  },
)
