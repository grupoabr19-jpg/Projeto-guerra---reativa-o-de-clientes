/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    console.log('=== [0080_censo_completo_operadores] INÍCIO DO DIAGNÓSTICO ===')

    // 1. Buscar todos os usuários com papel operador ou lider
    const users = app.findRecordsByFilter(
      'users',
      "role = 'operador' || role = 'lider'",
      'name',
      100,
      0,
    )

    console.log(`[0080] Total de usuários operador/lider encontrados: ${users.length}`)

    // Coletar todos os vendedores distintos existentes na tabela clientes usando DynamicModel
    const rowsVend = arrayOf(new DynamicModel({ vendedor: '' }))
    app
      .db()
      .newQuery(
        'SELECT DISTINCT vendedor FROM clientes WHERE vendedor IS NOT NULL AND TRIM(vendedor) != ""',
      )
      .all(rowsVend)

    console.log(`[0080] Total de grafias distintas de vendedor em clientes: ${rowsVend.length}`)

    // Detalhar situação de cada operador
    const censoResultado = []

    const now = new Date()
    const nowIso = now.toISOString()
    const cutoff30m = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

    for (let u = 0; u < users.length; u++) {
      const user = users[u]
      const uId = user.id
      const uName = user.getString('name')
      const uRole = user.getString('role')

      let regioes = []
      try {
        const slice = user.getStringSlice('regioes')
        if (slice && slice.length > 0) regioes = slice
        else {
          const raw = user.getString('regioes')
          if (raw && raw.trim().startsWith('[')) regioes = JSON.parse(raw)
        }
      } catch (_) {}

      const isRepescagem = regioes.some((r) => String(r).toUpperCase() === 'REPESCAGEM')
      const isAtacado = regioes.some((r) => String(r).toUpperCase() === 'ATACADO')

      // Verificar locks ativos do operador
      const locks = app.findRecordsByFilter(
        'clientes',
        `operador = '${uId}' && (estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp >= '${cutoff30m}'`,
        '-lock_timestamp',
        10,
        0,
      )

      // Verificar clientes atribuídos a ele com lock expirado via SQL
      const rowExp = new DynamicModel({ total: 0 })
      app
        .db()
        .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE operador = {:uid}
            AND (estado = 'reservado' OR estado = 'em_atendimento')
            AND (lock_timestamp < {:cutoff} OR lock_timestamp = '' OR lock_timestamp IS NULL)
        `)
        .bind({ uid: uId, cutoff: cutoff30m })
        .one(rowExp)

      // Verificar reagendados do operador
      const reagendados = app.findRecordsByFilter(
        'clientes',
        `reagendado_operador = '${uId}' && estado = 'reagendado' && ativo_fora_base != true`,
        '-reagendado_para',
        100,
        0,
      )

      censoResultado.push({
        id: uId,
        nome: uName,
        role: uRole,
        regioes: regioes,
        isAtacado: isAtacado,
        isRepescagem: isRepescagem,
        tem_lock_ativo: locks.length > 0,
        locks_ativos_count: locks.length,
        lock_ativo_cliente: locks.length > 0 ? locks[0].getString('codigo') : null,
        locks_expirados_count: rowExp.total || 0,
        reagendados_count: reagendados.length,
      })
    }

    // Salvar auditoria
    const colEv = app.findCollectionByNameOrId('eventos_log')
    const ev = new Record(colEv)
    ev.set('acao', 'censo_diagnostico_0080')
    ev.set('detalhes', {
      executado_em: nowIso,
      operadores: censoResultado,
      total_vendedores_distintos: rowsVend.length,
      amostra_vendedores: rowsVend.slice(0, 30).map((v) => v.vendedor),
    })
    app.save(ev)

    console.log('=== [0080_censo_completo_operadores] FIM DO DIAGNÓSTICO ===')
  },
  (app) => {},
)
