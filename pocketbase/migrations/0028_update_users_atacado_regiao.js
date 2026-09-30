migrate(
  (app) => {
    // 0028_update_users_atacado_regiao.js
    // Atualiza a coluna 'regioes' dos usuários Julio, Larissa e Wilson via SQL direto
    // para garantir persistência no SQLite do PocketBase
    const jsonAtacado = JSON.stringify(['ATACADO'])

    // Atualizar Julio Melo, Larissa Terra e Wilson Neto
    app
      .db()
      .newQuery(
        "UPDATE users SET regioes = {:reg} WHERE email IN ('julio.melo@grupoabr.com.br', 'larissa.terra@grupoabr.com.br', 'wilson.neto@grupoabr.com.br')",
      )
      .bind({ reg: jsonAtacado })
      .execute()
  },
  (app) => {
    const jsonVazio = JSON.stringify([])
    app
      .db()
      .newQuery(
        "UPDATE users SET regioes = {:reg} WHERE email IN ('julio.melo@grupoabr.com.br', 'larissa.terra@grupoabr.com.br', 'wilson.neto@grupoabr.com.br')",
      )
      .bind({ reg: jsonVazio })
      .execute()
  },
)
