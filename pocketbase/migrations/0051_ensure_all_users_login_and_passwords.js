/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0051_ensure_all_users_login_and_passwords.js
    // Garante que TODOS os usuários do sistema (incluindo Thiago Almeida, Pietra, supervisores,
    // operadores e líderes de rota) estejam com a senha padrão ABR@2026 ativa, verified = true
    // e emailVisibility = true, para assegurar 100% de sucesso no login authWithPassword.
    const DEFAULT_PASSWORD = 'ABR@2026'

    const allUsers = app.findRecordsByFilter('_pb_users_auth_', '', 'created', 500, 0)
    let totalUpdated = 0

    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i]
      let needsSave = false

      if (!u.getBool('verified')) {
        u.setVerified(true)
        needsSave = true
      }
      if (!u.getBool('emailVisibility')) {
        u.set('emailVisibility', true)
      }

      if (!u.validatePassword(DEFAULT_PASSWORD)) {
        u.setPassword(DEFAULT_PASSWORD)
        needsSave = true
      }

      if (needsSave) {
        app.save(u)
        totalUpdated++
      }
    }

    // Validação estrita de cada perfil chave para assegurar que nenhum fique inacessível
    const chaves = [
      'thiago.almeida@grupoabr.com.br',
      'thiago@grupoabr.com.br',
      'pietra.leite@grupoabr.com.br',
      'marcelo.silva@grupoabr.com.br',
      'dyovana.silva@grupoabr.com.br',
      'bruna.pereira@grupoabr.com.br',
      'priscila.faria@grupoabr.com.br',
      'julio.melo@grupoabr.com.br',
    ]

    for (let j = 0; j < chaves.length; j++) {
      const email = chaves[j]
      try {
        const checkUser = app.findAuthRecordByEmail('_pb_users_auth_', email)
        if (!checkUser.validatePassword(DEFAULT_PASSWORD)) {
          checkUser.setPassword(DEFAULT_PASSWORD)
          checkUser.setVerified(true)
          app.save(checkUser)
        }
      } catch (_) {}
    }
  },
  (app) => {},
)
