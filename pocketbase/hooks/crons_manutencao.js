// 1. Cron frequente (a cada 10 minutos): Liberação de locks expirados e quarentenas vencidas
cronAdd('crons_limpeza_fila', '*/10 * * * *', () => {
  try {
    const now = new Date()
    const timeoutMinutos = 30
    const cutoffLock = new Date(now.getTime() - timeoutMinutos * 60 * 1000).toISOString()

    const expiredLocks = $app.findRecordsByFilter(
      'clientes',
      `(estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp < '${cutoffLock}'`,
      '',
      200,
      0,
    )

    for (let i = 0; i < expiredLocks.length; i++) {
      const c = expiredLocks[i]
      c.set('estado', 'na_base')
      c.set('operador', '')
      c.set('lock_timestamp', null)
      $app.save(c)

      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', c.id)
        ev.set('acao', 'timeout_lock_expirado')
        ev.set('detalhes', { motivo: 'Inatividade superior a 30 minutos' })
        $app.save(ev)
      } catch (_) {}
    }

    const todayStr = now.toISOString().slice(0, 10)
    const expiredQuarantine = $app.findRecordsByFilter(
      'clientes',
      `estado = 'nao_quer_negociar' && quarentena_ate != '' && quarentena_ate <= '${todayStr}'`,
      '',
      100,
      0,
    )

    for (let j = 0; j < expiredQuarantine.length; j++) {
      const q = expiredQuarantine[j]
      q.set('estado', 'na_base')
      q.set('quarentena_ate', null)
      $app.save(q)
    }
  } catch (err) {
    console.error('Erro no cron crons_limpeza_fila:', err)
  }
})

// 2. Cron diário (1x por dia, às 03:00 UTC / 00:00 BRT):
// - Recalcula dias sem faturar, faixa (60-89 / 90+) e score de todos os clientes
// - Faz reconciliação com os dados de faturamento já importados: quem faturou recentemente (<60 dias) sai da fila (estado = 'reativado')
// - Libera reservas expiradas (timeout de atendimento abandonado)
// - Grava registro da execução em eventos_log
cronAdd('crons_atualizacao_diaria_base', '0 3 * * *', () => {
  try {
    const now = new Date()
    const nowMs = now.getTime()
    let totalProcessados = 0
    let totalReconciliados = 0
    let totalLocksLiberados = 0

    // Timeout de 30 minutos para atendimentos abandonados
    const timeoutMinutos = 30
    const cutoffLock = new Date(nowMs - timeoutMinutos * 60 * 1000).toISOString()
    const abandonedLocks = $app.findRecordsByFilter(
      'clientes',
      `(estado = 'reservado' || estado = 'em_atendimento') && (lock_timestamp = '' || lock_timestamp < '${cutoffLock}')`,
      '',
      500,
      0,
    )
    for (let l = 0; l < abandonedLocks.length; l++) {
      const lockCli = abandonedLocks[l]
      lockCli.set('estado', 'na_base')
      lockCli.set('operador', '')
      lockCli.set('lock_timestamp', null)
      $app.save(lockCli)
      totalLocksLiberados++
    }

    // Ler pesos do score configurados
    let pesos = {
      recencia: 30,
      frequencia: 25,
      ticket_tonelagem: 20,
      segmento: 10,
      tentativas_penalidade: 15,
    }
    try {
      const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'pesos_score')
      if (cfg && cfg.get('valor')) pesos = cfg.get('valor')
    } catch (_) {}

    // Buscar clientes em lotes para recalcular
    const pageSize = 200
    let page = 0
    let hasMore = true

    while (hasMore) {
      const batch = $app.findRecordsByFilter(
        'clientes',
        "estado != 'duplicado'",
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
        totalProcessados++

        // Recalcular dias sem faturar a partir de ultima_compra ou ultimo_faturamento_data
        let ultimaDataStr = c.getString('ultimo_faturamento_data') || c.getString('ultima_compra')
        let dias = c.getInt('dias_sem_faturar') || 90

        if (ultimaDataStr) {
          const parsed = new Date(ultimaDataStr)
          if (!isNaN(parsed.getTime())) {
            const diffMs = nowMs - parsed.getTime()
            dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
            c.set('dias_sem_faturar', dias)
          }
        }

        // Determinar faixa
        let faixa = '90_plus'
        if (dias < 60) {
          faixa = 'recente'
        } else if (dias >= 60 && dias <= 89) {
          faixa = '60_89'
        } else {
          faixa = '90_plus'
        }
        c.set('faixa', faixa)

        // Reconciliação: quem faturou sai da fila de reativação automaticamente
        const estadoAtual = c.getString('estado')
        if (faixa === 'recente') {
          if (estadoAtual !== 'reativado') {
            c.set('estado', 'reativado')
            c.set('operador', '')
            c.set('lock_timestamp', null)
            totalReconciliados++
          }
        }

        // Recalcular score ponderado
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

        $app.save(c)
      }

      if (batch.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    // Grava registro da execução em eventos_log
    try {
      const colEv = $app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'cron_atualizacao_diaria_concluida')
      ev.set('detalhes', {
        executado_em: now.toISOString(),
        total_processados: totalProcessados,
        total_reconciliados_faturaram: totalReconciliados,
        total_locks_liberados: totalLocksLiberados,
      })
      $app.save(ev)
    } catch (_) {}

    console.log(
      `Job diário concluído: ${totalProcessados} clientes processados, ${totalReconciliados} reconciliados, ${totalLocksLiberados} locks liberados.`,
    )
  } catch (err) {
    console.error('Erro no cron crons_atualizacao_diaria_base:', err)
  }
})
