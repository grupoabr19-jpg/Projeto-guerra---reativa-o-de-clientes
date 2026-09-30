/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0032_test_all_profiles.js
    const testAccounts = [
      'thiago.almeida@grupoabr.com.br',
      'thiago@grupoabr.com.br',
      'marcelo.silva@grupoabr.com.br', // supervisor
      'priscila.faria@grupoabr.com.br', // operador
      'dyovana.silva@grupoabr.com.br', // lider
    ]

    for (const email of testAccounts) {
      const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
      const valid = u.validatePassword('ABR@2026')
      if (!valid) {
        throw new Error(`Password mismatch for ${email}`)
      }
    }
  },
  (app) => {},
)
