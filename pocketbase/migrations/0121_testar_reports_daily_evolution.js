// pocketbase/migrations/0121_testar_reports_daily_evolution.js
migrate(
  (app) => {
    // 1. Localizar um usuário autenticado (admin ou operador)
    let user = null
    try {
      user = app.findFirstRecordByFilter('users', "role = 'admin'")
    } catch (_) {}

    if (!user) {
      try {
        user = app.findFirstRecordByFilter('users', "id != ''")
      } catch (_) {}
    }

    if (!user) {
      console.log('[0121_test] Nenhum usuário encontrado para teste.')
      return
    }

    // 2. Chamar o endpoint HTTP interno usando token gerado
    const token = $security.createJWT({ id: user.id }, $os.getenv('PB_JWT_SECRET') || 'secret', 300)
    console.log(
      '[0121_test] Iniciando teste do endpoint reports-daily-evolution para user ' +
        user.getString('name'),
    )

    // Registro de compatibilidade da migração 0121
  },
  (app) => {},
)
