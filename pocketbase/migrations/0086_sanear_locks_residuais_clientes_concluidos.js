// pocketbase/migrations/0086_sanear_locks_residuais_clientes_concluidos.js
migrate(
  (app) => {
    // Saneamento de dados atuais presos:
    // Clientes com desfecho gravado (diferente de 'na_base', 'reservado', 'em_atendimento')
    // ou com reagendamento gravado (reagendado_para preenchido), mas que ainda possuem operador ou lock residual ativo,
    // ou que ficaram presos em estado 'em_atendimento'.
    try {
      // 1. Clientes com desfecho já concluído ou reagendamento que ficaram em 'em_atendimento' com operador/lock
      app
        .db()
        .newQuery(`
      UPDATE clientes
      SET operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z',
          estado = CASE
            WHEN reagendado_para IS NOT NULL AND reagendado_para != '' THEN 'reagendado'
            WHEN estado = 'em_atendimento' OR estado = 'reservado' THEN 'na_base'
            ELSE estado
          END
      WHERE (
        (reagendado_para IS NOT NULL AND reagendado_para != '')
        OR estado IN ('reagendado', 'reativado', 'sem_contato', 'venda_perdida', 'compra_terceiros', 'nao_quer_negociar', 'duplicado', 'ativo_fora_base', 'contatado')
      )
      AND (
        (operador IS NOT NULL AND operador != '')
        OR (lock_timestamp IS NOT NULL AND lock_timestamp != '' AND lock_timestamp > '1970-01-01 00:00:00.000Z')
        OR estado = 'em_atendimento'
      )
    `)
        .execute()

      // 2. Caso específico FINO SABOR (cliente x48olwzb5m67wtl / C002605 / 5399) e similares
      app
        .db()
        .newQuery(`
      UPDATE clientes
      SET operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z',
          estado = 'reagendado'
      WHERE id = 'x48olwzb5m67wtl'
         OR (nome LIKE '%FINO SABOR%' AND reagendado_para IS NOT NULL AND reagendado_para != '')
    `)
        .execute()

      console.log('[migracao_0086] Saneamento de locks residuais e estados concluído com sucesso.')
    } catch (err) {
      console.log('[migracao_0086] Erro no saneamento: ' + err.message)
      throw err
    }
  },
  (app) => {
    // Reversão não necessária para limpeza de locks residuais
  },
)
