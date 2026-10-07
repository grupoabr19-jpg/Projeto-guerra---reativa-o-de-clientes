/**
 * Migração 0079: Saneamento de clientes com estado='reagendado'
 * cujo reagendado_para já venceu (data <= agora) e cujo reagendado_operador
 * NÃO corresponde a nenhum usuário existente no banco ou a nenhum operador válido.
 *
 * Regra:
 * Voltar para estado='na_base', limpando reagendado_operador e reagendado_para.
 * Manter histórico em eventos_log: ação 'saneamento_reagendamento_orfao'.
 * Não tocar em reagendamentos futuros nem de operadores existentes.
 */
migrate(
  (app) => {
    console.log('=== [0079_saneamento_reagendamento_orfao] INÍCIO ===')

    const nowIso = new Date().toISOString()

    // Buscar todos os IDs de usuários existentes
    const usersRecords = app.findRecordsByFilter('users', '1=1', '', 500, 0)
    const validUserIds = new Set()
    const validOperadorOrLiderIds = new Set()

    for (let u = 0; u < usersRecords.length; u++) {
      const user = usersRecords[u]
      const uId = user.id
      validUserIds.add(uId)
      const role = user.getString('role')
      if (role === 'operador' || role === 'lider') {
        validOperadorOrLiderIds.add(uId)
      }
    }

    // Buscar clientes com estado = 'reagendado'
    const reagendados = app.findRecordsByFilter(
      'clientes',
      "estado = 'reagendado'",
      'reagendado_para',
      1000,
      0,
    )

    console.log(`[0079] Total de clientes com estado='reagendado': ${reagendados.length}`)

    let saneadosCount = 0
    const colEv = app.findCollectionByNameOrId('eventos_log')

    for (let i = 0; i < reagendados.length; i++) {
      const c = reagendados[i]
      const reagPara = c.getString('reagendado_para')
      const reagOp = c.getString('reagendado_operador')

      // Verificar se reagendado_para já venceu (data <= agora)
      const vencido = !reagPara || reagPara <= nowIso

      // Verificar se o reagendado_operador é órfão (não existe em validUserIds ou é inválido/vazio)
      // Conforme o diagnóstico: clientes com operador órfão (usuário inexistente) ou não associado
      const isOrfao = !reagOp || !validUserIds.has(reagOp)

      if (vencido && isOrfao) {
        const estadoAnterior = c.getString('estado')
        const reagParaAnterior = reagPara
        const reagOpAnterior = reagOp

        c.set('estado', 'na_base')
        c.set('reagendado_operador', '')
        c.set('reagendado_para', null)
        if (c.getString('operador') === reagOp) {
          c.set('operador', '')
          c.set('lock_timestamp', null)
        }
        app.save(c)
        saneadosCount++

        // Gravar histórico em eventos_log
        try {
          const ev = new Record(colEv)
          ev.set('cliente', c.id)
          ev.set('acao', 'saneamento_reagendamento_orfao')
          ev.set('detalhes', {
            codigo: c.getString('codigo'),
            nome: c.getString('nome'),
            regiao: c.getString('regiao'),
            vendedor: c.getString('vendedor'),
            estado_anterior: estadoAnterior,
            reagendado_operador_anterior: reagOpAnterior,
            reagendado_para_anterior: reagParaAnterior,
            motivo: 'reagendamento_vencido_operador_orfao',
            executado_em: nowIso,
          })
          app.save(ev)
        } catch (evErr) {
          console.log('[0079] Aviso ao salvar evento log: ' + evErr.message)
        }
      }
    }

    // Também verificar se há clientes na_base ou com outros estados que ficaram com reagendado_operador órfão
    // e limpá-los para evitar sujeira de follow-up
    const sujos = app.findRecordsByFilter('clientes', "reagendado_operador != ''", '', 1000, 0)
    let sujosLimpos = 0
    for (let j = 0; j < sujos.length; j++) {
      const sc = sujos[j]
      const op = sc.getString('reagendado_operador')
      const rPara = sc.getString('reagendado_para')
      const rVencido = !rPara || rPara <= nowIso
      if (rVencido && (!validUserIds.has(op) || !op)) {
        sc.set('reagendado_operador', '')
        sc.set('reagendado_para', null)
        app.save(sc)
        sujosLimpos++
      }
    }

    console.log(
      `[0079] Saneamento concluído: ${saneadosCount} clientes reagendados órfãos saneados para 'na_base'. ${sujosLimpos} registros limpos.`,
    )
    console.log('=== [0079_saneamento_reagendamento_orfao] FIM ===')
  },
  (app) => {
    // Rollback não reconstrói vínculos com operadores inexistentes
  },
)
