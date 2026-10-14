/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    if (!users.fields.getByName('ativo')) {
      users.fields.add(
        new BoolField({
          name: 'ativo',
          required: false,
        }),
      )
    }

    app.save(users)

    // Garantir que todos os usuários existentes fiquem marcados como ativo = true
    try {
      app.db().newQuery('UPDATE users SET ativo = 1 WHERE ativo IS NULL OR ativo = 0').execute()
    } catch (e) {
      console.log('Aviso ao inicializar ativo=1 em users:', e)
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users')
      if (users.fields.getByName('ativo')) {
        users.fields.removeByName('ativo')
      }
      app.save(users)
    } catch (_) {}
  },
)
