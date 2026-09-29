migrate(
  (app) => {
    // 1. Restringir coleção 'importacoes' para apenas supervisor e admin
    const colImportacoes = app.findCollectionByNameOrId('importacoes')
    colImportacoes.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colImportacoes.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colImportacoes.createRule = "@request.auth.role = 'admin'"
    colImportacoes.updateRule = "@request.auth.role = 'admin'"
    colImportacoes.deleteRule = "@request.auth.role = 'admin'"
    app.save(colImportacoes)

    // 2. Restringir coleção 'configuracoes' para apenas supervisor e admin
    const colConfiguracoes = app.findCollectionByNameOrId('configuracoes')
    colConfiguracoes.listRule = "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colConfiguracoes.viewRule = "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colConfiguracoes.createRule =
      "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colConfiguracoes.updateRule =
      "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
    colConfiguracoes.deleteRule = "@request.auth.role = 'admin'"
    app.save(colConfiguracoes)

    // 3. Restringir coleção 'bases_referencia' para apenas admin
    const colBases = app.findCollectionByNameOrId('bases_referencia')
    colBases.listRule = "@request.auth.role = 'admin'"
    colBases.viewRule = "@request.auth.role = 'admin'"
    colBases.createRule = "@request.auth.role = 'admin'"
    colBases.updateRule = "@request.auth.role = 'admin'"
    colBases.deleteRule = "@request.auth.role = 'admin'"
    app.save(colBases)
  },
  (app) => {
    try {
      const colImportacoes = app.findCollectionByNameOrId('importacoes')
      colImportacoes.listRule = "@request.auth.id != ''"
      colImportacoes.viewRule = "@request.auth.id != ''"
      colImportacoes.createRule = "@request.auth.id != ''"
      colImportacoes.updateRule = "@request.auth.id != ''"
      colImportacoes.deleteRule = "@request.auth.role = 'admin'"
      app.save(colImportacoes)

      const colConfiguracoes = app.findCollectionByNameOrId('configuracoes')
      colConfiguracoes.listRule = "@request.auth.id != ''"
      colConfiguracoes.viewRule = "@request.auth.id != ''"
      app.save(colConfiguracoes)
    } catch (_) {}
  },
)
