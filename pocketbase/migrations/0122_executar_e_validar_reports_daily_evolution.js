// pocketbase/migrations/0122_executar_e_validar_reports_daily_evolution.js
migrate(
  (app) => {
    // 1. Simular a execução completa da lógica do hook reports_daily_evolution
    // Testamos a execução das queries SQL com bind e agregação dos dias contínuos
    // para garantir ausência total de erros de sintaxe SQL ou Goja.

    const periodoParam = 'este_mes'
    const formatYmd = (d) => {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const now = new Date()
    const brasiliaOffsetMs = -3 * 60 * 60 * 1000
    const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
    const currYear = dBrasilia.getUTCFullYear()
    const currMonth = dBrasilia.getUTCMonth()
    const mm = String(currMonth + 1).padStart(2, '0')
    const startDateStr = `${currYear}-${mm}-01`
    const lastDayOfMonth = new Date(Date.UTC(currYear, currMonth + 1, 0)).getUTCDate()
    const endDateStr = `${currYear}-${mm}-${String(lastDayOfMonth).padStart(2, '0')}`

    const startUtcIso = `${startDateStr} 03:00:00.000Z`
    const nextDayD = new Date(Date.UTC(currYear, currMonth, lastDayOfMonth + 1, 2, 59, 59, 999))
    const endUtcIso = nextDayD.toISOString()

    const bindParams = {
      startUtc: startUtcIso,
      endUtc: endUtcIso,
    }

    const interacoesDailyQuery = `
      SELECT
        strftime('%Y-%m-%d', datetime(i.created, '-3 hours')) as dia,
        SUM(CASE
          WHEN i.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
               OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '0' AND TRIM(i.numero_pedido) != '-')
          THEN 1 ELSE 0 END) as reativacoes,
        SUM(CASE
          WHEN (i.tipo IN ('formulario', 'ligacao') OR (i.desfecho IS NOT NULL AND TRIM(i.desfecho) != ''))
               AND (i.desfecho IS NULL OR (i.desfecho != 'sem_contato' AND i.desfecho != 'transferido'))
          THEN 1 ELSE 0 END) as contatos,
        SUM(CASE
          WHEN i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != '')
          THEN 1 ELSE 0 END) as reagendamentos,
        SUM(CASE
          WHEN i.desfecho IN ('compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato')
          THEN 1 ELSE 0 END) as vendas_perdidas,
        COUNT(*) as total_interacoes
      FROM interacoes i
      LEFT JOIN clientes c ON c.id = i.cliente
      WHERE i.created >= {:startUtc} AND i.created <= {:endUtc}
      GROUP BY dia
      ORDER BY dia ASC
    `

    const rowsDaily = arrayOf(
      new DynamicModel({
        dia: '',
        reativacoes: 0,
        contatos: 0,
        reagendamentos: 0,
        vendas_perdidas: 0,
        total_interacoes: 0,
      }),
    )

    const qbDaily = app.db().newQuery(interacoesDailyQuery)
    qbDaily.bind(bindParams)
    qbDaily.all(rowsDaily)

    const followUpsScheduledQuery = `
      SELECT
        strftime('%Y-%m-%d', datetime(i.reagendado_para, '-3 hours')) as dia,
        COUNT(*) as follow_ups_agendados
      FROM interacoes i
      LEFT JOIN clientes c ON c.id = i.cliente
      WHERE i.reagendado_para IS NOT NULL
        AND TRIM(i.reagendado_para) != ''
        AND i.reagendado_para >= {:startUtc}
        AND i.reagendado_para <= {:endUtc}
      GROUP BY dia
      ORDER BY dia ASC
    `

    const rowsFollowUps = arrayOf(
      new DynamicModel({
        dia: '',
        follow_ups_agendados: 0,
      }),
    )

    const qbFollowUps = app.db().newQuery(followUpsScheduledQuery)
    qbFollowUps.bind(bindParams)
    qbFollowUps.all(rowsFollowUps)

    const followUpsMap = {}
    for (let f = 0; f < rowsFollowUps.length; f++) {
      const item = rowsFollowUps[f]
      if (item.dia) {
        followUpsMap[item.dia] = Number(item.follow_ups_agendados || 0)
      }
    }

    const dailyDataMap = {}
    for (let r = 0; r < rowsDaily.length; r++) {
      const row = rowsDaily[r]
      if (row.dia) {
        dailyDataMap[row.dia] = {
          dia: row.dia,
          reativacoes: Number(row.reativacoes || 0),
          contatos: Number(row.contatos || 0),
          reagendamentos: Number(row.reagendamentos || 0),
          vendasPerdidas: Number(row.vendas_perdidas || 0),
          totalInteracoes: Number(row.total_interacoes || 0),
          followUpsAgendados: followUpsMap[row.dia] || 0,
        }
      }
    }

    const serieCompleta = []
    const startParts = startDateStr.split('-')
    const endParts = endDateStr.split('-')

    const curLoop = new Date(
      Date.UTC(
        parseInt(startParts[0], 10),
        parseInt(startParts[1], 10) - 1,
        parseInt(startParts[2], 10),
      ),
    )
    const endLoop = new Date(
      Date.UTC(parseInt(endParts[0], 10), parseInt(endParts[1], 10) - 1, parseInt(endParts[2], 10)),
    )

    let totalReativacoes = 0
    let totalContatos = 0
    let totalReagendamentos = 0
    let totalFollowUps = 0
    let totalVendasPerdidas = 0

    while (curLoop <= endLoop) {
      const yStr = curLoop.getUTCFullYear()
      const mStr = String(curLoop.getUTCMonth() + 1).padStart(2, '0')
      const dStr = String(curLoop.getUTCDate()).padStart(2, '0')
      const dateKey = `${yStr}-${mStr}-${dStr}`

      const dayRecord = dailyDataMap[dateKey] || {
        dia: dateKey,
        reativacoes: 0,
        contatos: 0,
        reagendamentos: 0,
        vendasPerdidas: 0,
        totalInteracoes: 0,
        followUpsAgendados: followUpsMap[dateKey] || 0,
      }

      if (!dailyDataMap[dateKey] && followUpsMap[dateKey]) {
        dayRecord.followUpsAgendados = followUpsMap[dateKey]
      }

      totalReativacoes += dayRecord.reativacoes
      totalContatos += dayRecord.contatos
      totalReagendamentos += dayRecord.reagendamentos
      totalFollowUps += dayRecord.followUpsAgendados
      totalVendasPerdidas += dayRecord.vendasPerdidas

      const labelCurto = `${dStr}/${mStr}`

      serieCompleta.push({
        dia: dateKey,
        label: labelCurto,
        reativacoes: dayRecord.reativacoes,
        contatos: dayRecord.contatos,
        reagendamentos: dayRecord.reagendamentos,
        followUpsAgendados: dayRecord.followUpsAgendados,
        vendasPerdidas: dayRecord.vendasPerdidas,
        totalInteracoes: dayRecord.totalInteracoes,
      })

      curLoop.setUTCDate(curLoop.getUTCDate() + 1)
    }

    // Salvar evidência de validação em configuracoes
    let conf = null
    try {
      conf = app.findFirstRecordByFilter(
        'configuracoes',
        "chave = 'validacao_reports_daily_evolution'",
      )
    } catch (_) {}
    if (!conf) {
      const col = app.findCollectionByNameOrId('configuracoes')
      conf = new Record(col)
      conf.set('chave', 'validacao_reports_daily_evolution')
    }
    conf.set('descricao', 'Validação da query e série temporal do endpoint reports-daily-evolution')
    conf.set('valor', {
      status: 'SUCESSO_SERIE_VALIDADA',
      periodo: periodoParam,
      dataInicio: startDateStr,
      dataFim: endDateStr,
      diasNaSerie: serieCompleta.length,
      primeiroDia: serieCompleta.length > 0 ? serieCompleta[0].dia : null,
      ultimoDia: serieCompleta.length > 0 ? serieCompleta[serieCompleta.length - 1].dia : null,
      totais: {
        reativacoes: totalReativacoes,
        contatos: totalContatos,
        reagendamentos: totalReagendamentos,
        followUpsAgendados: totalFollowUps,
        vendasPerdidas: totalVendasPerdidas,
      },
      amostraDias: serieCompleta.slice(-5),
      timestamp: new Date().toISOString(),
    })
    app.save(conf)
  },
  (app) => {},
)
