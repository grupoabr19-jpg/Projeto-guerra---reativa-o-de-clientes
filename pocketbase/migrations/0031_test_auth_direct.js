/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0031_test_auth_direct.js
    const email = 'thiago.almeida@grupoabr.com.br'
    const user = app.findAuthRecordByEmail('_pb_users_auth_', email)
    const valid = user.validatePassword('ABR@2026')
    if (!valid) {
      throw new Error(`Password mismatch for ${email}! validatePassword returned false.`)
    }
  },
  (app) => {},
)
