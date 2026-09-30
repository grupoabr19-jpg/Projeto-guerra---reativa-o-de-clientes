migrate(
  (app) => {
    // Migração 0017: Correção de elegibilidade da fila de reativação
    // Clientes com mais de 60 dias sem faturamento (faixa '60_89' e '90_plus') e clientes 'Sem Venda'
    // que foram indevidamente alterados para estado = 'reativado' durante importação de histórico
    // devem retornar ao estado = 'na_base' com lock_timestamp = '' e operador = '' para ficarem disponíveis na fila.
    //
    // Apenas clientes com faturamento recente real (< 60 dias, faixa 'recente' com ultimo_faturamento_data comprovado)
    // devem permanecer como 'reativado'.

    // 1. Clientes com 60 ou mais dias sem faturamento que estavam como 'reativado' voltam para 'na_base'
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET estado = 'na_base', operador = '', lock_timestamp = ''
    WHERE estado = 'reativado'
      AND (
        faixa = '60_89'
        OR faixa = '90_plus'
        OR dias_sem_faturar >= 60
        OR (dias_sem_faturar IS NULL AND (ultimo_faturamento_data IS NULL OR ultimo_faturamento_data = ''))
      )
  `)
      .execute()

    // 2. Garantir que clientes com faixa 60_89 tenham a faixa calculada corretamente se estiverem com dias entre 60 e 89
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET faixa = '60_89'
    WHERE dias_sem_faturar >= 60 AND dias_sem_faturar <= 89 AND faixa != '60_89'
  `)
      .execute()

    // 3. Garantir que clientes com dias >= 90 tenham faixa 90_plus
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET faixa = '90_plus'
    WHERE (dias_sem_faturar >= 90 OR (dias_sem_faturar IS NULL AND (ultima_compra IS NULL OR ultima_compra = ''))) AND faixa != '90_plus'
  `)
      .execute()
  },
  (app) => {
    // Reversão
  },
)
