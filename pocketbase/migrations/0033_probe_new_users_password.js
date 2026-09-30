/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0033_probe_new_users_password.js
    const emails = [
      'milena.vaz@grupoabr.com.br',
      'alessandro.faris@grupoabr.com.br',
      'Rafael.pereira@grupoabr.com.br',
      'matheus.teixeira@grupoabr.com.br',
    ]

    for (const email of emails) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        const valid = u.validatePassword('ABR@2026')
        console.log(`[PROBE_NEW] ${email} valid:`, valid)
      } catch (err) {
        console.log(`[PROBE_NEW] error for ${email}:`, err.message)
      }
    }
  },
  (app) => {},
)
