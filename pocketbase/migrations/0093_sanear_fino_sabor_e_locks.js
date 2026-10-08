migrate(
  (app) => {
    // Migração 0093: Saneamento definitivo de clientes presos em lock residual
    // e restauração do estado correto (ex: reagendado, na_base, etc.)
    // Casos foco:
    // - FINO SABOR C002605 (id x48olwzb5m67wtl): reagendado_para 2026-10-08 -> estado = 'reagendado'
    // - ROBISNEY C001021
    // - MRX C004216
    // - PAOLA C004324
    // e qualquer outro cliente no mesmo padrão (desfecho gravado / reagendamento futuro com lock residual).

    // 1. Clientes com reagendado_para gravado que estejam com estado inconsistente ('na_base', 'em_atendimento', 'reservado')
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = 'reagendado',
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z'
      WHERE reagendado_para IS NOT NULL
        AND reagendado_para != ''
        AND estado IN ('na_base', 'em_atendimento', 'reservado')
        AND (pedido_em_aberto IS NOT 1)
    `)
      .execute()

    // 2. Clientes em estados de desfecho concluído com lock_timestamp ou operador residuais
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET lock_timestamp = '1970-01-01 00:00:00.000Z',
          operador = ''
      WHERE estado IN ('reagendado', 'sem_contato', 'venda_perdida', 'nao_quer_negociar', 'compra_terceiros', 'sem_perfil', 'duplicado', 'ativo_fora_base')
        AND (pedido_em_aberto IS NOT 1)
        AND (lock_timestamp > '1970-01-01 00:00:00.000Z' OR (operador IS NOT NULL AND operador != ''))
    `)
      .execute()

    // 3. Clientes em 'em_atendimento' ou 'reservado' com lock expirado (> 30 min) sem pedido em aberto
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = 'na_base',
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z'
      WHERE estado IN ('em_atendimento', 'reservado')
        AND (pedido_em_aberto IS NOT 1)
        AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp < {:cutoff})
    `)
      .bind({ cutoff: cutoffTime })
      .execute()

    // 4. Garantir explicitamente os casos específicos reportados
    const codigosEspecificos = ['C002605', 'C001021', 'C004216', 'C004324']
    for (let i = 0; i < codigosEspecificos.length; i++) {
      const cod = codigosEspecificos[i]
      try {
        const rec = app.findFirstRecordByData('clientes', 'codigo', cod)
        if (rec && !rec.getBool('pedido_em_aberto')) {
          rec.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          rec.set('operador', '')
          if (rec.getString('reagendado_para')) {
            rec.set('estado', 'reagendado')
          }
          app.save(rec)
        }
      } catch (_) {}
    }
  },
  (app) => {
    // Rollback no-op para migrações de saneamento
  },
)
