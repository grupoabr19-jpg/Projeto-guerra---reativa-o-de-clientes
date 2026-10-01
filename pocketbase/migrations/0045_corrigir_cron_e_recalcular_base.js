migrate(
  (app) => {
    // Executa uma rodada imediata de manutenção diária para compensar o período parado
    const now = new Date()
    const nowMs = now.getTime()
    let totalProcessados = 0
    let totalReconciliados = 0
    let totalLocksLiberados = 0

    const timeoutMinutos = 30
    const cutoffLock = new Date(nowMs - timeoutMinutos * 60 * 1000).toISOString()
    const abandonedLocks = app.findRecordsByFilter(
      'clientes',
      "(estado = 'reservado' || estado = 'em_atendimento') && (lock_timestamp = '' || lock_timestamp < '" +
        cutoffLock +
        "')",
      '',
      500,
      0,
    )
    for (let l = 0; l < abandonedLocks.length; l++) {
      const lockCli = abandonedLocks[l]
      lockCli.set('estado', 'na_base')
      lockCli.set('operador', '')
      lockCli.set('lock_timestamp', null)
      app.save(lockCli)
      totalLocksLiberados++
    }

    let pesos = {
      recencia: 30,
      frequencia: 25,
      ticket_tonelagem: 20,
      segmento: 10,
      tentativas_penalidade: 15,
    }
    try {
      const cfg = app.findFirstRecordByData('configuracoes', 'chave', 'pesos_score')
      if (cfg && cfg.get('valor')) pesos = cfg.get('valor')
    } catch (_) {}

    const pageSize = 200
    let page = 0
    let hasMore = true

    while (hasMore) {
      const batch = app.findRecordsByFilter(
        'clientes',
        "estado != 'duplicado' && estado != 'ativo_fora_base' && ativo_fora_base != true",
        'id',
        pageSize,
        page * pageSize,
      )

      if (!batch || batch.length === 0) {
        hasMore = false
        break
      }

      for (let i = 0; i < batch.length; i++) {
        const c = batch[i]
        if (c.getString('estado') === 'ativo_fora_base' || c.getBool('ativo_fora_base')) {
          continue
        }
        totalProcessados++

        let ultimaDataStr = c.getString('ultimo_faturamento_data') || c.getString('ultima_compra')
        let dias = c.getInt('dias_sem_faturar')

        if (ultimaDataStr) {
          const parsed = new Date(ultimaDataStr)
          if (!isNaN(parsed.getTime())) {
            const diffMs = nowMs - parsed.getTime()
            dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
            c.set('dias_sem_faturar', dias)
          }
        } else if (!dias && dias !== 0) {
          dias = 180
          c.set('dias_sem_faturar', dias)
        }

        let faixa = '90_plus'
        if (ultimaDataStr && dias < 60) {
          faixa = 'recente'
        } else if (dias >= 60 && dias <= 89) {
          faixa = '60_89'
        } else {
          faixa = '90_plus'
        }
        c.set('faixa', faixa)

        const estadoAtual = c.getString('estado')
        if (faixa === 'recente' && ultimaDataStr) {
          if (estadoAtual !== 'reativado') {
            c.set('estado', 'reativado')
            c.set('operador', '')
            c.set('lock_timestamp', null)
            totalReconciliados++
          }
        } else if ((faixa === '60_89' || faixa === '90_plus') && estadoAtual === 'reativado') {
          c.set('estado', 'na_base')
          c.set('operador', '')
          c.set('lock_timestamp', null)
        }

        const scoreRecencia = Math.min(100, Math.round((dias / 180) * 100))
        const comprasCount = c.getInt('compras_count') || c.getInt('frequencia_compras_12m') || 1
        const scoreFreq = Math.min(100, comprasCount * 12)
        const valHist = c.getFloat('valor_historico') || c.getFloat('fat_12m_reais') || 0
        const ticketMedio =
          comprasCount > 0 ? valHist / comprasCount : c.getFloat('valor_ultima_compra') || 0
        const scoreTicket = Math.min(100, Math.round((ticketMedio / 100000) * 100))
        const scoreSeg = 70

        const calcScore = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (scoreRecencia * (pesos.recencia || 30)) / 100 +
                (scoreFreq * (pesos.frequencia || 25)) / 100 +
                (scoreTicket * (pesos.ticket_tonelagem || 20)) / 100 +
                (scoreSeg * (pesos.segmento || 10)) / 100,
            ),
          ),
        )

        const tentativas = c.getInt('tentativas_sem_contato') || 0
        const finalScore = Math.max(0, calcScore - tentativas * 5)
        c.set('score', finalScore)

        app.save(c)
      }

      if (batch.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'recalculo_compensatorio_migracao_concluido')
      ev.set('detalhes', {
        executado_em: now.toISOString(),
        total_processados: totalProcessados,
        total_reconciliados_faturaram: totalReconciliados,
        total_locks_liberados: totalLocksLiberados,
      })
      app.save(ev)
    } catch (_) {}

    console.log(
      `[migracao 0045] Recálculo compensatório concluído: ${totalProcessados} clientes processados, ${totalReconciliados} reconciliados, ${totalLocksLiberados} locks liberados.`,
    )
  },
  (app) => {},
)
