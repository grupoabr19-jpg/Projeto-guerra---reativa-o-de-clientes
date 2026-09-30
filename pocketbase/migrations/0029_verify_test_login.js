/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0029_verify_test_login.js - temporário para testar authWithPassword
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const thiago = app.findAuthRecordByEmail('_pb_users_auth_', 'thiago.almeida@grupoabr.com.br')
    console.log('[test_auth] thiago found:', thiago.id, thiago.getString('email'))
  },
  (app) => {},
)
