/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0034_ensure_all_users_verified_and_standard_passwords.js
    // Garante que TODOS os usuários existentes e recém-criados estejam com:
    // 1. verified = true (para que o PocketBase nunca rejeite authWithPassword por pendência de verificação)
    // 2. Senha padrão ABR@2026 ativa
    // 3. emailVisibility = true
    const DEFAULT_PASSWORD = 'ABR@2026'
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    const allUsers = app.findRecordsByFilter('_pb_users_auth_', '', 'created', 500, 0)
    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i]
      let needsSave = false

      if (!u.getBool('verified')) {
        u.setVerified(true)
        needsSave = true
      }
      if (!u.getBool('emailVisibility')) {
        u.set('emailVisibility', true)
        needsSave = true
      }

      // Validar se a senha confere com ABR@2026, senão atualizar
      if (!u.validatePassword(DEFAULT_PASSWORD)) {
        u.setPassword(DEFAULT_PASSWORD)
        needsSave = true
      }

      if (needsSave) {
        app.save(u)
      }
    }
  },
  (app) => {},
)
