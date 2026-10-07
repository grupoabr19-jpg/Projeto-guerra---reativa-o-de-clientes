/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      // Usar raw SQL do SQLite via app.db().newQuery para extrair do JSON 'respostas'
      // No SQLite: json_extract(respostas, '$.q3')
      // 1. Atualizar q3_arquivo onde json_extract(respostas, '$.q3') existe e não é Sim/Não
      const result = app
        .db()
        .newQuery(`
        UPDATE respostas_formulario
        SET q3_arquivo = json_extract(respostas, '$.q3'),
            respostas = json_set(
              json_remove(respostas, '$.q3'),
              '$.q3_arquivo',
              json_extract(respostas, '$.q3')
            )
        WHERE json_extract(respostas, '$.q3') IS NOT NULL
          AND json_extract(respostas, '$.q3') != ''
          AND json_extract(respostas, '$.q3') NOT IN ('Sim', 'Não');
      `)
        .execute()

      // Tratar também se houver q3_outros
      app
        .db()
        .newQuery(`
        UPDATE respostas_formulario
        SET respostas = json_set(
              json_remove(respostas, '$.q3_outros'),
              '$.q3_outros_arquivo',
              json_extract(respostas, '$.q3_outros')
            )
        WHERE json_extract(respostas, '$.q3_outros') IS NOT NULL;
      `)
        .execute()

      console.log(
        `[0085_sql_migrar_q3] Executado UPDATE SQL em respostas_formulario. Rows affected: ${result ? result.rowsAffected : 'ok'}`,
      )
    } catch (err) {
      console.log(`[0085_sql_migrar_q3] Erro: ${err.message}`)
    }
  },
  () => {},
)
