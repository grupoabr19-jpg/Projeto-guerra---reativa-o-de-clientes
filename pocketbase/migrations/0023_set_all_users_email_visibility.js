/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0023_set_all_users_email_visibility.js
    // Torna emailVisibility = true para TODOS os usuários da coleção users,
    // permitindo que o admin e supervisores visualizem a lista completa com e-mails
    // no painel de Configurações -> Usuários.

    // 1. Atualizar via SQL direto para cobrir instantaneamente todos os registros da tabela users
    try {
      app
        .db()
        .newQuery(
          'UPDATE `users` SET `emailVisibility` = 1 WHERE `emailVisibility` = 0 OR `emailVisibility` IS NULL',
        )
        .execute()
    } catch (e) {
      console.log('Aviso ao rodar UPDATE SQL em users:', e)
    }

    // 2. Garantir também via model record para todos os registros encontrados
    try {
      const records = app.findRecordsByFilter('users', '1=1', '', 0, 0)
      for (const rec of records) {
        try {
          rec.set('emailVisibility', true)
          app.save(rec)
        } catch (err) {
          console.log('Aviso ao salvar emailVisibility no usuário ' + rec.id + ':', err)
        }
      }
    } catch (err) {
      console.log('Erro ao buscar registros de users:', err)
    }
  },
  (app) => {
    // Reversão opcional (não reverter para manter privacidade configurável se necessário)
  },
)
