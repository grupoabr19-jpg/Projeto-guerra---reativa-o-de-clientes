cronAdd('crons_limpeza_fila', '*/10 * * * *', () => {
  try {
    const now = new Date()
    // 1. Liberação de locks expirados (timeout de 30 minutos)
    const timeoutMinutos = 30
    const cutoffLock = new Date(now.getTime() - timeoutMinutos * 60 * 1000).toISOString()

    const expiredLocks = $app.findRecordsByFilter(
      'clientes',
      `(estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp < '${cutoffLock}'`,
      '',
      100,
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

    // 2. Retorno de clientes em quarentena ou prazo de 30 dias expirado
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
