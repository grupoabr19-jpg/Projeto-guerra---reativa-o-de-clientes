/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    if (!users.fields.getByName('last_seen')) {
      users.fields.add(
        new DateField({
          name: 'last_seen',
          required: false,
        }),
      )
    }

    app.save(users)

    try {
      users.addIndex('idx_users_last_seen', false, 'last_seen', '')
      app.save(users)
    } catch (e) {
      console.log('Aviso ao criar idx_users_last_seen:', e)
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users')
      try {
        users.removeIndex('idx_users_last_seen')
      } catch (_) {}

      if (users.fields.getByName('last_seen')) {
        users.fields.removeByName('last_seen')
      }
      app.save(users)
    } catch (_) {}
  },
)
