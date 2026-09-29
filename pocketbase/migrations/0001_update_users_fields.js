migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    // Add role field if not present
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['operador', 'supervisor', 'admin'],
          maxSelect: 1,
        }),
      )
    }

    // Add regioes field (JSON list of string regions the operator can access, e.g. ["Norte", "Sul"])
    if (!users.fields.getByName('regioes')) {
      users.fields.add(
        new JSONField({
          name: 'regioes',
          maxSize: 10000,
        }),
      )
    }

    // Add telefone
    if (!users.fields.getByName('telefone')) {
      users.fields.add(
        new TextField({
          name: 'telefone',
        }),
      )
    }

    // Set permissive access rules for internal app authenticated users
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.createRule = "@request.auth.role = 'admin'"
    users.updateRule = "@request.auth.id != ''"
    users.deleteRule = "@request.auth.role = 'admin'"

    app.save(users)
  },
  (app) => {
    // rollback
  },
)
