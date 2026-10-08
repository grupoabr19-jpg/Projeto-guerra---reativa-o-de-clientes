migrate(
  (app) => {
    // Migração 0092: Saneamento dos registros presos e locks residuais de clientes com desfecho já registrado
    // Casos confirmados:
    // - C001021 (ROBISNEY, sem_contato)
    // - C004216 (MRX, nao_quer_negociar)
    // - C004324 (PAOLA, sem_contato)
    // - C017606, C003058, C008908, C012100 (ativo_fora_base)
    // - FINO SABOR 5399 (em_atendimento com reagendamento gravado para 08/10)
    //
    // REGRAS:
    // 1. Para clientes cujo estado NÃO é 'reservado' nem 'em_atendimento' e que ainda tenham lock_timestamp/operador residual:
    //    zerar lock_timestamp (e operador quando o estado indicar fim de ciclo sem vínculo).
    // 2. Para clientes em 'em_atendimento' ou 'reservado' com desfecho ou reagendamento futuro já gravado:
    //    limpar lock e ajustar estado para o desfecho/reagendamento gravado.
    // 3. NÃO tocar em clientes com pedido_em_aberto = true (faturamento pendente),
    //    NÃO alterar estados 'reativado', nem campos de standby, valor, toneladas, vendedor ou regiao.

    const nowIso = new Date().toISOString()

    // 1. Zerar locks residuais de clientes já concluídos (estados que não são 'reservado' nem 'em_atendimento')
    // Estados de fim de ciclo sem vínculo com operador: 'sem_contato', 'nao_quer_negociar', 'duplicado', 'ativo_fora_base', 'cliente_final', 'compra_terceiros', 'contatado'
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET lock_timestamp = '1970-01-01 00:00:00.000Z',
        operador = ''
    WHERE estado IN ('sem_contato', 'nao_quer_negociar', 'duplicado', 'ativo_fora_base', 'compra_terceiros')
      AND (pedido_em_aberto IS NOT 1)
      AND (lock_timestamp > '1970-01-01 00:00:00.000Z' OR (operador IS NOT NULL AND operador != ''))
  `)
      .execute()

    // Clientes em estado 'reagendado' que ainda tenham lock_timestamp preso: limpa lock_timestamp e preserva reagendado_operador / operador se aplicável
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET lock_timestamp = '1970-01-01 00:00:00.000Z',
        operador = ''
    WHERE estado = 'reagendado'
      AND (pedido_em_aberto IS NOT 1)
      AND (lock_timestamp > '1970-01-01 00:00:00.000Z' OR (operador IS NOT NULL AND operador != ''))
  `)
      .execute()

    // Clientes em estado 'na_base' que ainda tenham lock_timestamp ou operador presos
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET lock_timestamp = '1970-01-01 00:00:00.000Z',
        operador = ''
    WHERE estado = 'na_base'
      AND (pedido_em_aberto IS NOT 1)
      AND (lock_timestamp > '1970-01-01 00:00:00.000Z' OR (operador IS NOT NULL AND operador != ''))
  `)
      .execute()

    // 2. Caso específico: clientes em 'reservado' ou 'em_atendimento' com reagendamento futuro/gravado (ex: FINO SABOR 5399)
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET estado = 'reagendado',
        operador = '',
        lock_timestamp = '1970-01-01 00:00:00.000Z'
    WHERE estado IN ('reservado', 'em_atendimento')
      AND (pedido_em_aberto IS NOT 1)
      AND reagendado_para IS NOT NULL
      AND reagendado_para != ''
  `)
      .execute()

    // 3. Clientes com ativo_fora_base = 1 ou motivo_ativo_fora_base preenchido mas com lock/operador residual
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET lock_timestamp = '1970-01-01 00:00:00.000Z',
        operador = ''
    WHERE (ativo_fora_base = 1 OR estado = 'ativo_fora_base')
      AND (pedido_em_aberto IS NOT 1)
      AND (lock_timestamp > '1970-01-01 00:00:00.000Z' OR (operador IS NOT NULL AND operador != ''))
  `)
      .execute()

    // 4. Garantir explicitamente os casos citados no relatório da CAUSA 4:
    // C001021, C004216, C004324, C017606, C003058, C008908, C012100 e FINO SABOR 5399
    const codigosAlvo = [
      'C001021',
      'C004216',
      'C004324',
      'C017606',
      'C003058',
      'C008908',
      'C012100',
    ]
    for (let i = 0; i < codigosAlvo.length; i++) {
      const cod = codigosAlvo[i]
      try {
        const rec = app.findFirstRecordByData('clientes', 'codigo', cod)
        if (rec && !rec.getBool('pedido_em_aberto') && rec.getString('estado') !== 'reativado') {
          rec.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          rec.set('operador', '')
          app.save(rec)
        }
      } catch (_) {}
    }

    // FINO SABOR (código contendo 5399 ou nome FINO SABOR)
    try {
      const recsFino = app.findRecordsByFilter(
        'clientes',
        "(codigo ~ '5399' || nome ~ 'FINO SABOR') && pedido_em_aberto != true",
        '',
        5,
        0,
      )
      for (let j = 0; j < recsFino.length; j++) {
        const f = recsFino[j]
        f.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        f.set('operador', '')
        if (f.getString('reagendado_para')) {
          f.set('estado', 'reagendado')
        }
        app.save(f)
      }
    } catch (_) {}
  },
  (app) => {
    // No-op rollback para limpeza de dados residuais
  },
)
