// pocketbase/migrations/0114_sanear_fila_atacado_e_cliente_guerra.js
// Saneamento urgente: cliente de atacado na_base e devolução de atacados em varejo à fila do Atacado por DDD

migrate(
  (app) => {
    let afetados = 0

    // 1. Liberação expressa do cliente ne7ys3txxqjen4a (FUROESTAMP / C022241 / Iracemápolis DDD 19)
    try {
      const cliAlvo = app.findRecordById('clientes', 'ne7ys3txxqjen4a')
      if (cliAlvo) {
        cliAlvo.set('estado', 'na_base')
        cliAlvo.set('operador', '')
        cliAlvo.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        cliAlvo.set('reagendado_para', null)
        cliAlvo.set('reagendado_operador', '')
        cliAlvo.set('retomada_servida_em', null)
        cliAlvo.set('rascunho_respostas', null)
        app.save(cliAlvo)
        afetados++
        console.log('[migracao_0114] Cliente ne7ys3txxqjen4a liberado para na_base com sucesso.')
      }
    } catch (err) {
      console.log('[migracao_0114] Aviso ao liberar cliente ne7ys3txxqjen4a: ' + err.message)
    }

    // 2. Localizar IDs de operadores que NÃO pertencem à fila do ATACADO
    // Usuários com região ATACADO no users
    const users = app.findRecordsByFilter('users', "role != 'cliente'", 'name', 500, 0)
    const idsAtacado = new Set()
    for (let i = 0; i < users.length; i++) {
      const u = users[i]
      let regioes = []
      try {
        const slice = u.getStringSlice('regioes')
        if (slice && slice.length > 0) regioes = slice
        else {
          const raw = u.getString('regioes')
          if (raw && raw.trim().startsWith('[')) regioes = JSON.parse(raw)
        }
      } catch (_) {}
      const isAtacadoUser = regioes.some((r) => String(r || '').toUpperCase() === 'ATACADO')
      if (isAtacadoUser) {
        idsAtacado.add(u.id)
      }
    }

    // 3. Verificar outros clientes de regiao = 'ATACADO' que estejam com operador de varejo em estado reservado, em_atendimento ou reagendado
    const clientesAtacado = app.findRecordsByFilter(
      'clientes',
      "regiao = 'ATACADO' && (estado = 'reservado' || estado = 'em_atendimento' || estado = 'reagendado')",
      'codigo',
      500,
      0,
    )

    let outrosDevolvidos = 0
    for (let j = 0; j < clientesAtacado.length; j++) {
      const c = clientesAtacado[j]
      if (c.id === 'ne7ys3txxqjen4a') continue

      const op = c.getString('operador')
      const reagOp = c.getString('reagendado_operador')

      const operadorInvalido = (op && !idsAtacado.has(op)) || (reagOp && !idsAtacado.has(reagOp))
      if (operadorInvalido) {
        c.set('estado', 'na_base')
        c.set('operador', '')
        c.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        c.set('reagendado_para', null)
        c.set('reagendado_operador', '')
        c.set('retomada_servida_em', null)
        app.save(c)
        outrosDevolvidos++
        console.log(
          `[migracao_0114] Cliente ATACADO ${c.id} (${c.getString('codigo')}) devolvido de operador de varejo à fila do Atacado.`,
        )
      }
    }

    // Registrar auditoria em eventos_log
    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('cliente', 'ne7ys3txxqjen4a')
      ev.set('acao', 'saneamento_fila_atacado_guerra')
      ev.set('detalhes', {
        cliente_principal: 'ne7ys3txxqjen4a',
        total_devolvidos: afetados + outrosDevolvidos,
        outros_devolvidos: outrosDevolvidos,
        motivo: 'devolucao_cliente_atacado_para_fila_por_ddd_julio_melo',
      })
      app.save(ev)
    } catch (_) {}

    console.log(
      `[migracao_0114] Saneamento concluído: ${afetados + outrosDevolvidos} clientes de atacado liberados para na_base na fila correta do Atacado.`,
    )
  },
  (app) => {
    // Reversão no-op para migrações de dados pontuais
  },
)
