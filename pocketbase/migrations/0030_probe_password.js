/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0030_probe_password.js
    const thiago = app.findAuthRecordByEmail('_pb_users_auth_', 'thiago.almeida@grupoabr.com.br')
    const match = thiago.validatePassword('ABR@2026')
    console.log('[PROBE] thiago password matches ABR@2026:', match)
  },
  (app) => {},
)
