migrate(
  (app) => {
    console.log('=== [0076_saneamento_duplicidades] INÍCIO DO SANEAMENTO ===')
    const agoraIso = new Date().toISOString()
    const colEv = app.findCollectionByNameOrId('eventos_log')

    // -------------------------------------------------------------
    // CASO 1: Restauração de clientes com standby_ate futuro cujo estado NÃO era 'reativado'
    // Exemplo: ODAIR (C023063) voltou para na_base; PRAIA MATERIAIS (C006844) virou reagendado
    // -------------------------------------------------------------
    try {
      const qStandbyCorrompido = app.db().newQuery(`
        SELECT id, codigo, nome, estado, reativado_em, standby_ate, reagendado_operador, reagendado_para, operador
        FROM clientes
        WHERE standby_ate IS NOT NULL 
          AND standby_ate != '' 
          AND datetime(standby_ate) > datetime('now')
          AND estado != 'reativado'
          AND estado != 'ativo_fora_base'
      `)
      const rowsStandby = []
      qStandbyCorrompido.all(rowsStandby)
      console.log(
        `[0076_saneamento] Restaurando ${rowsStandby.length} clientes com standby vigente cujo estado estava corrompido`,
      )

      for (let i = 0; i < rowsStandby.length; i++) {
        const r = rowsStandby[i]
        const recCli = app.findRecordById('clientes', r.id)
        if (recCli) {
          recCli.set('estado', 'reativado')
          recCli.set('operador', '')
          recCli.set('lock_timestamp', null)
          // limpa reagendado se estiver dentro do standby de reativação
          recCli.set('reagendado_para', null)
          recCli.set('reagendado_operador', '')
          recCli.set('prioridade_transferencia', false)
          app.save(recCli)

          const ev = new Record(colEv)
          ev.set('cliente', r.id)
          ev.set('acao', 'correcao_duplicidade_reativacao')
          ev.set('detalhes', {
            motivo:
              'Restauração de cliente com standby vigente de reativação (estado sobrescrito por reabertura indevida ou timeout)',
            codigo: r.codigo,
            nome: r.nome,
            estado_anterior: r.estado,
            estado_novo: 'reativado',
            standby_ate: r.standby_ate,
            reativado_em: r.reativado_em,
            reagendado_operador_anterior: r.reagendado_operador,
            reagendado_para_anterior: r.reagendado_para,
            timestamp: agoraIso,
          })
          app.save(ev)
        }
      }
    } catch (errStandby) {
      console.log('[0076_saneamento] Erro no CASO 1: ' + errStandby.message)
    }

    // -------------------------------------------------------------
    // CASO 2: Identificação e saneamento de reativações duplicadas
    // Exemplo: UELTON (C017545) que teve 2 reativações com o mesmo pedido (40523)
    // Marca a interação mais recente como corrigida/duplicada e preserva a primeira oficial
    // -------------------------------------------------------------
    try {
      const qDupInteracoes = app.db().newQuery(`
        SELECT cliente, COUNT(*) as qtd
        FROM interacoes
        WHERE desfecho = 'reativado'
        GROUP BY cliente
        HAVING COUNT(*) > 1
      `)
      const rowsDup = []
      qDupInteracoes.all(rowsDup)
      console.log(
        `[0076_saneamento] Clientes com múltiplas interações de reativação: ${rowsDup.length}`,
      )

      for (let i = 0; i < rowsDup.length; i++) {
        const dupCliId = rowsDup[i].cliente
        // Buscar todas as interações de reativação deste cliente ordenadas por data crescente
        const itList = app.findRecordsByFilter(
          'interacoes',
          `cliente = '${dupCliId}' && desfecho = 'reativado'`,
          'created',
          20,
          0,
        )

        if (itList && itList.length > 1) {
          const primeira = itList[0]
          // A partir da segunda, são atendimentos redundantes/duplicados
          for (let k = 1; k < itList.length; k++) {
            const repetida = itList[k]
            const pedRepetido = repetida.getString('numero_pedido')
            const opRepetido = repetida.getString('operador')
            const createdRepetido = repetida.getString('created')

            repetida.set('desfecho', 'reativacao_duplicada_consolidada')
            repetida.set(
              'conteudo',
              `[CONSOLIDADO - DUPLICIDADE] Atendimento redundante realizado após o cliente já estar reativado (1ª reativação em ${primeira.getString('created')}, pedido ${primeira.getString('numero_pedido')}). Registro preservado para auditoria operacional.`,
            )
            app.save(repetida)

            const ev = new Record(colEv)
            ev.set('cliente', dupCliId)
            ev.set('acao', 'correcao_duplicidade_reativacao')
            ev.set('detalhes', {
              motivo:
                'Consolidação de 2º atendimento de reativação redundante em cliente já reativado',
              interacao_duplicada_id: repetida.id,
              interacao_original_id: primeira.id,
              operador: opRepetido,
              pedido: pedRepetido,
              data_duplicada: createdRepetido,
              data_original: primeira.getString('created'),
              timestamp: agoraIso,
            })
            app.save(ev)
          }

          // Garantir que no cadastro do cliente os dados oficiais da primeira reativação estejam consistentes
          try {
            const cliRec = app.findRecordById('clientes', dupCliId)
            if (cliRec) {
              cliRec.set('estado', 'reativado')
              cliRec.set('operador', '')
              cliRec.set('lock_timestamp', null)
              cliRec.set('reagendado_para', null)
              cliRec.set('reagendado_operador', '')
              if (!cliRec.getString('pedido_reativacao') && primeira.getString('numero_pedido')) {
                cliRec.set('pedido_reativacao', primeira.getString('numero_pedido'))
              }
              if (!cliRec.getString('reativado_em')) {
                cliRec.set('reativado_em', primeira.getString('created'))
              }
              // Standby de 60 dias a partir da reativação original
              if (!cliRec.getString('standby_ate')) {
                const dtOrig = new Date(primeira.getString('created'))
                const dtStandby = new Date(dtOrig.getTime() + 60 * 24 * 60 * 60 * 1000)
                cliRec.set('standby_ate', dtStandby.toISOString())
              }
              app.save(cliRec)
            }
          } catch (_) {}
        }
      }
    } catch (errDup) {
      console.log('[0076_saneamento] Erro no CASO 2: ' + errDup.message)
    }

    // -------------------------------------------------------------
    // CASO 3: Clientes do lote Atacado (05/10 03:00Z)
    // Garantir que todos os clientes reativados com standby vigente estejam com operador limpo,
    // sem lock ativo e estado devidamente mantido como 'reativado'.
    // -------------------------------------------------------------
    try {
      const qLote = app.db().newQuery(`
        SELECT id, codigo, nome, estado, standby_ate, operador, lock_timestamp
        FROM clientes
        WHERE reativado_em >= '2026-10-05 02:50:00' AND reativado_em <= '2026-10-05 03:15:00'
          AND (operador != '' OR lock_timestamp IS NOT NULL OR estado != 'reativado')
      `)
      const rowsLote = []
      qLote.all(rowsLote)
      console.log(
        `[0076_saneamento] Clientes do lote 05/10 precisando de ajuste fino de operador/lock/estado: ${rowsLote.length}`,
      )

      for (let i = 0; i < rowsLote.length; i++) {
        const r = rowsLote[i]
        const rec = app.findRecordById('clientes', r.id)
        if (rec) {
          rec.set('estado', 'reativado')
          rec.set('operador', '')
          rec.set('lock_timestamp', null)
          app.save(rec)
        }
      }
    } catch (errLote) {
      console.log('[0076_saneamento] Erro no CASO 3: ' + errLote.message)
    }

    // Resumo final do saneamento registrado em eventos_log
    try {
      const evFinal = new Record(colEv)
      evFinal.set('acao', 'saneamento_duplicidades_concluido')
      evFinal.set('detalhes', {
        executado_em: agoraIso,
        descricao:
          'Saneamento preventivo e corretivo da release v0.0.93/v0.0.94 aplicado com sucesso. Clientes reativados em standby restaurados, reativações redundantes consolidadas e locks liberados.',
      })
      app.save(evFinal)
    } catch (_) {}

    console.log('=== [0076_saneamento_duplicidades] SANEAMENTO CONCLUÍDO COM SUCESSO ===')
  },
  () => {},
)
