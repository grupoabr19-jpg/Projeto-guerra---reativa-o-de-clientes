/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/backend/v1/metrics/reports-daily-evolution',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      // Restrição de Líder de Rota
      const userRole = authRecord.getString('role')
      let allowedRegiao = ''
      if (userRole === 'lider') {
        try {
          const userRegioes = authRecord.get('regioes')
          if (Array.isArray(userRegioes) && userRegioes.length > 0) {
            allowedRegiao = String(userRegioes[0] || '').trim()
          }
        } catch (_) {}
      }

      // Parâmetros de consulta
      const q = e.requestInfo().query || {}
      let regiaoParam = String(q.regiao || '').trim()
      if (allowedRegiao) {
        regiaoParam = allowedRegiao
      }
      const operadorParam = String(q.operador || '').trim()
      const periodoParam = String(q.periodo || 'este_mes').trim()
      const mesParam = String(q.mes || '').trim() // ex: '2026-10'

      // Helper inline para formatar YYYY-MM-DD
      const formatYmd = (d) => {
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }

      // Cálculo de datas com Fuso de Brasília (UTC-3)
      const now = new Date()
      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
      const currYear = dBrasilia.getUTCFullYear()
      const currMonth = dBrasilia.getUTCMonth() // 0-indexed
      const currDay = dBrasilia.getUTCDate()

      let startDateStr = ''
      let endDateStr = ''

      if (periodoParam === '7dias') {
        const startD = new Date(Date.UTC(currYear, currMonth, currDay - 6, 12, 0, 0))
        startDateStr = formatYmd(startD)
        endDateStr = formatYmd(dBrasilia)
      } else if (periodoParam === '30dias') {
        const startD = new Date(Date.UTC(currYear, currMonth, currDay - 29, 12, 0, 0))
        startDateStr = formatYmd(startD)
        endDateStr = formatYmd(dBrasilia)
      } else if (periodoParam === '90dias') {
        const startD = new Date(Date.UTC(currYear, currMonth, currDay - 89, 12, 0, 0))
        startDateStr = formatYmd(startD)
        endDateStr = formatYmd(dBrasilia)
      } else if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
        // Mês específico selecionado
        const parts = mesParam.split('-')
        const targetYear = parseInt(parts[0], 10)
        const targetMonth = parseInt(parts[1], 10) - 1 // 0-indexed
        startDateStr = `${parts[0]}-${parts[1]}-01`
        // Último dia do mês
        const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
        endDateStr = `${parts[0]}-${parts[1]}-${String(lastDayOfMonth).padStart(2, '0')}`
      } else {
        // Padrão: este mês (do dia 1 até o último dia do mês corrente)
        const targetYear = currYear
        const targetMonth = currMonth
        const mm = String(targetMonth + 1).padStart(2, '0')
        startDateStr = `${targetYear}-${mm}-01`
        const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
        endDateStr = `${targetYear}-${mm}-${String(lastDayOfMonth).padStart(2, '0')}`
      }

      // Início em UTC: YYYY-MM-DD 00:00:00 BRT = YYYY-MM-DD 03:00:00 UTC
      // Fim em UTC: YYYY-MM-DD 23:59:59.999 BRT = seguinte 02:59:59.999 UTC
      const startUtcIso = `${startDateStr} 03:00:00.000Z`
      // Para o final, pegamos o dia seguinte às 02:59:59.999 UTC
      const endYear = parseInt(endDateStr.slice(0, 4), 10)
      const endMonth = parseInt(endDateStr.slice(5, 7), 10) - 1
      const endDay = parseInt(endDateStr.slice(8, 10), 10)
      const nextDayD = new Date(Date.UTC(endYear, endMonth, endDay + 1, 2, 59, 59, 999))
      const endUtcIso = nextDayD.toISOString()

      // Construção de filtros de região e operador para interações e clientes
      let regiaoCondition = ''
      const bindParams = {
        startUtc: startUtcIso,
        endUtc: endUtcIso,
      }

      if (regiaoParam && regiaoParam.toLowerCase() !== 'todas') {
        const upper = regiaoParam.toUpperCase().trim()
        if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
          regiaoCondition =
            " AND (c.regiao = '' OR c.regiao IS NULL OR UPPER(TRIM(c.regiao)) = 'SEM REGIÃO' OR UPPER(TRIM(c.regiao)) = 'SEM REGIAO')"
        } else if (
          upper === 'BRAGANÇA' ||
          upper === 'BRAGANCA' ||
          upper === 'BRAGANÇA PAULISTA' ||
          upper === 'BRAGANCA PAULISTA'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(c.regiao)) = 'BRAGANÇA' OR UPPER(TRIM(c.regiao)) = 'BRAGANCA' OR UPPER(TRIM(c.regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(c.regiao)) = 'BRAGANCA PAULISTA')"
        } else if (
          upper === 'CAMBUÍ' ||
          upper === 'CAMBUI' ||
          upper === 'MICRO-REGIÃO' ||
          upper === 'MICRO REGIAO' ||
          upper === 'MICROREGIAO'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(c.regiao)) = 'CAMBUÍ' OR UPPER(TRIM(c.regiao)) = 'CAMBUI' OR UPPER(TRIM(c.regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(c.regiao)) = 'MICRO REGIAO' OR UPPER(TRIM(c.regiao)) = 'MICROREGIAO')"
        } else if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS' ||
          upper === 'POÇOS' ||
          upper === 'POCOS'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(c.regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(c.regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(c.regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(c.regiao)) = 'POCOS CALDAS' OR UPPER(TRIM(c.regiao)) = 'POÇOS' OR UPPER(TRIM(c.regiao)) = 'POCOS')"
        } else if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
          regiaoCondition =
            " AND (UPPER(TRIM(c.regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(c.regiao)) = 'JUNDIAI')"
        } else if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
          regiaoCondition =
            " AND (UPPER(TRIM(c.regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(c.regiao)) = 'ITAJUBA')"
        } else if (upper === 'VARGINHA') {
          regiaoCondition = " AND UPPER(TRIM(c.regiao)) = 'VARGINHA'"
        } else if (upper === 'POUSO ALEGRE') {
          regiaoCondition = " AND UPPER(TRIM(c.regiao)) = 'POUSO ALEGRE'"
        } else if (upper === 'EXTREMA') {
          regiaoCondition = " AND UPPER(TRIM(c.regiao)) = 'EXTREMA'"
        } else if (upper === 'ATACADO') {
          regiaoCondition = " AND UPPER(TRIM(c.regiao)) = 'ATACADO'"
        } else if (upper === 'REPESCAGEM') {
          regiaoCondition = " AND UPPER(TRIM(c.regiao)) = 'REPESCAGEM'"
        } else {
          regiaoCondition =
            ' AND (UPPER(TRIM(c.regiao)) = {:regiaoParam} OR UPPER(TRIM(c.regiao)) LIKE {:regiaoLike})'
          bindParams.regiaoParam = upper
          bindParams.regiaoLike = '%' + upper + '%'
        }
      }

      let operadorCondition = ''
      if (operadorParam && operadorParam !== 'todos') {
        operadorCondition = ' AND i.operador = {:operadorParam}'
        bindParams.operadorParam = operadorParam
      }

      // Consulta de interações agregadas por dia no fuso de Brasília (UTC -3 horas)
      // Contato feito: atendimento com contato efetivo (tipo 'formulario'/'ligacao' ou com desfecho preenchido), excluindo sem_contato e transferido
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
          ${regiaoCondition}
          ${operadorCondition}
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

      const qbDaily = $app.db().newQuery(interacoesDailyQuery)
      if (Object.keys(bindParams).length > 0) {
        qbDaily.bind(bindParams)
      }
      qbDaily.all(rowsDaily)

      // Consulta de Follow-ups AGENDADOS PARA o dia (data do agendamento 'reagendado_para' caindo no período)
      // Agrupamos pela data em que o retorno foi agendado para acontecer
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
          ${regiaoCondition}
          ${operadorCondition}
        GROUP BY dia
        ORDER BY dia ASC
      `

      const rowsFollowUps = arrayOf(
        new DynamicModel({
          dia: '',
          follow_ups_agendados: 0,
        }),
      )

      const qbFollowUps = $app.db().newQuery(followUpsScheduledQuery)
      if (Object.keys(bindParams).length > 0) {
        qbFollowUps.bind(bindParams)
      }
      qbFollowUps.all(rowsFollowUps)

      // Montar mapa indexado por dia
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

      // Gerar todos os dias contínuos do período (para o gráfico não ter buracos na linha de tempo)
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
        Date.UTC(
          parseInt(endParts[0], 10),
          parseInt(endParts[1], 10) - 1,
          parseInt(endParts[2], 10),
        ),
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

        // Se só havia follow-up mapeado mas sem interações
        if (!dailyDataMap[dateKey] && followUpsMap[dateKey]) {
          dayRecord.followUpsAgendados = followUpsMap[dateKey]
        }

        totalReativacoes += dayRecord.reativacoes
        totalContatos += dayRecord.contatos
        totalReagendamentos += dayRecord.reagendamentos
        totalFollowUps += dayRecord.followUpsAgendados
        totalVendasPerdidas += dayRecord.vendasPerdidas

        // Formatação amigável do dia para exibição no eixo X (ex: "28/10")
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

      return e.json(200, {
        periodo: periodoParam,
        dataInicio: startDateStr,
        dataFim: endDateStr,
        totais: {
          reativacoes: totalReativacoes,
          contatos: totalContatos,
          reagendamentos: totalReagendamentos,
          followUpsAgendados: totalFollowUps,
          vendasPerdidas: totalVendasPerdidas,
        },
        serie: serieCompleta,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[reports_daily_evolution] Erro: ' + msg)
      return e.json(500, {
        error: 'Erro interno ao calcular evolução diária: ' + msg,
      })
    }
  },
  $apis.requireAuth(),
)
