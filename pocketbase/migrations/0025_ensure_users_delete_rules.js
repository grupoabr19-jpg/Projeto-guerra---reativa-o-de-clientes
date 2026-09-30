/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0025_ensure_users_delete_rules.js
    const users = app.findCollectionByNameOrId('users')

    // Garantir que deleteRule exige perfil admin
    users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)
  },
)
