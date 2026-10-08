migrate(
  (app) => {
    // Migração 0096: Sanear clientes em 'em_atendimento' ou 'reservado' com interação de desfecho concluído
    // Clientes que possuem interação de desfecho concluído (desfecho preenchido e não 'em_atendimento'/'reservado')
    // e pedido_em_aberto falso:
    // -> estado = 'reagendado' se reagendado_para preenchido, senão 'na_base' (ou o próprio desfecho concluído)
    // -> operador = ''
    // -> lock_timestamp = '1970-01-01 00:00:00.000Z'
    // Não toca em standby, duplicidade, fila ordenada, pedidos em aberto.

    // 1. Atualizar clientes com reagendado_para preenchido que ficaram presos em 'em_atendimento' ou 'reservado'
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = 'reagendado',
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z'
      WHERE (estado = 'em_atendimento' OR estado = 'reservado')
        AND reagendado_para IS NOT NULL
        AND reagendado_para != ''
        AND (pedido_em_aberto IS NOT 1)
    `)
      .execute()

    // 2. Atualizar clientes presos em 'em_atendimento' ou 'reservado' que possuem interação com desfecho concluído
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = CASE
            WHEN reagendado_para IS NOT NULL AND reagendado_para != '' THEN 'reagendado'
            ELSE 'na_base'
          END,
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z'
      WHERE (estado = 'em_atendimento' OR estado = 'reservado')
        AND (pedido_em_aberto IS NOT 1)
        AND id IN (
          SELECT DISTINCT cliente
          FROM interacoes
          WHERE desfecho IS NOT NULL
            AND desfecho != ''
            AND desfecho != 'em_atendimento'
            AND desfecho != 'reservado'
        )
    `)
      .execute()

    // 3. Atualizar clientes presos em 'em_atendimento' ou 'reservado' que possuem respostas_formulario com desfecho
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = CASE
            WHEN reagendado_para IS NOT NULL AND reagendado_para != '' THEN 'reagendado'
            ELSE 'na_base'
          END,
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z'
      WHERE (estado = 'em_atendimento' OR estado = 'reservado')
        AND (pedido_em_aberto IS NOT 1)
        AND id IN (
          SELECT DISTINCT cliente
          FROM respostas_formulario
          WHERE desfecho IS NOT NULL
            AND desfecho != ''
            AND desfecho != 'em_atendimento'
            AND desfecho != 'reservado'
        )
    `)
      .execute()

    // 4. Caso específico reportado: FINO SABOR C002605 (id x48olwzb5m67wtl)
    try {
      const finoSabor = app.findFirstRecordByData('clientes', 'codigo', 'C002605')
      if (finoSabor && !finoSabor.getBool('pedido_em_aberto')) {
        finoSabor.set('operador', '')
        finoSabor.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        if (finoSabor.getString('reagendado_para')) {
          finoSabor.set('estado', 'reagendado')
        } else {
          finoSabor.set('estado', 'na_base')
        }
        app.save(finoSabor)
      }
    } catch (_) {}
  },
  (app) => {
    // Rollback no-op para migração de saneamento idempotente
  },
)
