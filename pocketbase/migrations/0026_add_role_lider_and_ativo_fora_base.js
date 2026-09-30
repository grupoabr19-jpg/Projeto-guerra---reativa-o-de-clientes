/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0026_add_role_lider_and_ativo_fora_base.js

    // 1. Atualizar coleção users para incluir 'lider' no enum de role
    const users = app.findCollectionByNameOrId('users')
    const roleField = users.fields.getByName('role')
    if (roleField) {
      roleField.values = ['operador', 'supervisor', 'admin', 'lider']
      roleField.maxSelect = 1
    } else {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['operador', 'supervisor', 'admin', 'lider'],
          maxSelect: 1,
        }),
      )
    }
    app.save(users)

    // 2. Atualizar coleção clientes:
    // - Adicionar 'ativo_fora_base' no enum estado (se existir estado)
    // - Adicionar flag booleana 'ativo_fora_base' (bool opcional)
    // - Adicionar campo 'motivo_ativo_fora_base' (text opcional)
    const clientes = app.findCollectionByNameOrId('clientes')
    const estadoField = clientes.fields.getByName('estado')
    if (estadoField) {
      const currentValues = estadoField.values || []
      if (!currentValues.includes('ativo_fora_base')) {
        estadoField.values = [...currentValues, 'ativo_fora_base']
        estadoField.maxSelect = 1
      }
    }

    if (!clientes.fields.getByName('ativo_fora_base')) {
      clientes.fields.add(
        new BoolField({
          name: 'ativo_fora_base',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('motivo_ativo_fora_base')) {
      clientes.fields.add(
        new TextField({
          name: 'motivo_ativo_fora_base',
          required: false,
        }),
      )
    }

    app.save(clientes)

    // Índice para busca e filtragem rápida de ativo_fora_base
    try {
      clientes.addIndex('idx_clientes_ativo_fora_base', false, 'ativo_fora_base', '')
      app.save(clientes)
    } catch (e) {
      console.log('Aviso ao adicionar índice idx_clientes_ativo_fora_base:', e)
    }

    // 3. Atualizar coleção importacoes:
    // Adicionar campo 'linhas_puladas_ativo_fora_base' (number) para auditoria nas importações
    const importacoes = app.findCollectionByNameOrId('importacoes')
    if (!importacoes.fields.getByName('linhas_puladas_ativo_fora_base')) {
      importacoes.fields.add(
        new NumberField({
          name: 'linhas_puladas_ativo_fora_base',
          required: false,
          onlyInt: true,
        }),
      )
      app.save(importacoes)
    }
  },
  (app) => {
    // rollback
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      try {
        clientes.removeIndex('idx_clientes_ativo_fora_base')
      } catch (_) {}

      const f1 = clientes.fields.getByName('ativo_fora_base')
      if (f1) clientes.fields.removeByName('ativo_fora_base')

      const f2 = clientes.fields.getByName('motivo_ativo_fora_base')
      if (f2) clientes.fields.removeByName('motivo_ativo_fora_base')

      app.save(clientes)
    } catch (_) {}
  },
)
