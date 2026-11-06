/// <reference path="../pb_data/types.d.ts" />

// metrics_base_kpis.js — /backend/v1/metrics/base-kpis
// ROTA MANTIDA. TODAS as fórmulas vêm do módulo único regua_metricas.js (M1).
// Nenhuma fórmula de régua é definida aqui — somente leitura dos filtros,
// montagem das queries com os helpers do módulo e resposta.

routerAdd(
  'GET',
  '/backend/v1/metrics/base-kpis',
  (e) => {
    try {
      const REGUA = require(`${__hooks}/regua_metricas.js`)

      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const q = e.requestInfo().query || {}
      const regiao = String(q.regiao || '').trim()
      const baseCategoriaParam = String(q.baseCategoria || q.categoria || 'todas').trim()

      // Janela temporal personalizada (YYYY-MM-DD) sobre interacoes.created —
      // vale APENAS para "Reativações no período" (régua de prova de operador intacta).
      // Estados atuais da base (Total de Clientes, Na fila etc.) NÃO são datados.
      const janela = REGUA.parseJanela(q.data_inicial, q.data_final)

      const params = {}

      // Condições de região e categoria — helpers ÚNICOS do módulo da régua
      const categoriaSql = REGUA.sqlCategoria(baseCategoriaParam, '')
      const regiaoCondition = REGUA.sqlRegiao(regiao, '', params)

      // Regra fundamental: ativo_fora_base fora (estado + flag) + categoria
      const baseFilterSql = REGUA.sqlBaseFilter(baseCategoriaParam, '')

      // Fórmulas oficiais da régua (reativação oficial / faturamento do cruzamento ERP)
      const isReativacaoRealCond = REGUA.sqlReativacaoReal('')
      const isFaturamentoCruzamentoCond = REGUA.sqlFaturamentoCruzamento('')

      const kpisQuery = `
        SELECT
          COUNT(*) as total_base,
          SUM(CASE WHEN estado = 'na_base' THEN 1 ELSE 0 END) as na_base,
          SUM(CASE WHEN estado = 'reservado' THEN 1 ELSE 0 END) as reservado,
          SUM(CASE WHEN estado = 'em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
          SUM(CASE WHEN estado = 'reagendado' THEN 1 ELSE 0 END) as reagendado,
          SUM(CASE WHEN estado = 'contatado' THEN 1 ELSE 0 END) as contatado,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativado,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados_reais,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado_real,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas_real,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} THEN 1 ELSE 0 END) as faturamento_recente_cruzamento,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_faturamento_recente_cruzamento,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_faturamento_recente_cruzamento,
          SUM(CASE WHEN pedido_em_aberto = 1 THEN 1 ELSE 0 END) as pedidos_em_aberto,
          SUM(CASE WHEN pedido_em_aberto = 1 THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_pedidos_em_aberto,
          SUM(CASE WHEN estado = 'compra_terceiros' THEN 1 ELSE 0 END) as compra_terceiros,
          SUM(CASE WHEN estado = 'nao_quer_negociar' THEN 1 ELSE 0 END) as nao_quer_negociar,
          SUM(CASE WHEN estado = 'restricao_financeira' THEN 1 ELSE 0 END) as restricao_financeira,
          SUM(CASE WHEN estado = 'sem_contato' THEN 1 ELSE 0 END) as sem_contato,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado_total,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas_total
        FROM clientes
        WHERE ${baseFilterSql} ${regiaoCondition}
      `

      const kpiModel = new DynamicModel({
        total_base: 0,
        na_base: 0,
        reservado: 0,
        em_atendimento: 0,
        reagendado: 0,
        contatado: 0,
        reativado: 0,
        reativados_reais: 0,
        valor_recuperado_real: -0,
        toneladas_recuperadas_real: -0,
        faturamento_recente_cruzamento: 0,
        valor_faturamento_recente_cruzamento: -0,
        toneladas_faturamento_recente_cruzamento: -0,
        pedidos_em_aberto: 0,
        valor_pedidos_em_aberto: -0,
        compra_terceiros: 0,
        nao_quer_negociar: 0,
        restricao_financeira: 0,
        sem_contato: 0,
        valor_recuperado_total: -0,
        toneladas_recuperadas_total: -0,
      })

      try {
        const queryBuilder = $app.db().newQuery(kpisQuery)
        if (params && Object.keys(params).length > 0) {
          queryBuilder.bind(params)
        }
        queryBuilder.one(kpiModel)
      } catch (dbErr) {
        const dbErrMsg = dbErr && dbErr.message ? dbErr.message : String(dbErr)
        console.error('[metrics_base_kpis] Erro na query de KPIs: ' + dbErrMsg)
        return e.json(500, {
          error: 'Erro ao calcular KPIs de base: ' + dbErrMsg,
        })
      }

      const totalBase = Number(kpiModel.total_base || 0)
      const naBaseCount = Number(kpiModel.na_base || 0)
      const reservadoCount = Number(kpiModel.reservado || 0)
      const emAtendimentoCount = Number(kpiModel.em_atendimento || 0)
      const reagendadoCount = Number(kpiModel.reagendado || 0)
      const contatadoCount = Number(kpiModel.contatado || 0)
      const reativadoTotalCount = Number(kpiModel.reativado || 0)
      let reativadosReaisCount = Number(kpiModel.reativados_reais || 0)
      let valorRecuperadoReal = Number(kpiModel.valor_recuperado_real || 0)
      let toneladasRecuperadasReal = Number(kpiModel.toneladas_recuperadas_real || 0)

      // Janela temporal ativa: recalcula "Reativações no período" — clientes reativados
      // (régua de prova de operador intacta) cuja interação de reativação caiu no período.
      let clientesNoPeriodo = null
      if (janela.ativa) {
        try {
          const janelaCond = REGUA.sqlJanelaInteracoes('c.id', janela, 'i_win')
          const reatPeriodoQuery = `
            SELECT DISTINCT c.id as cliente_id
            FROM clientes c
            WHERE c.estado = 'reativado'
              AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)
              AND ((c.operador IS NOT NULL AND TRIM(c.operador) != '') OR (c.operador_reativacao IS NOT NULL AND TRIM(c.operador_reativacao) != ''))
              AND ${janelaCond}
              ${regiaoCondition.replace(/\bregiao\b/g, 'c.regiao')}
          `
          const jParams = {
            janelaInicio: janela.inicioIso,
            janelaFim: janela.fimIso,
          }
          if (params.regiaoParam) jParams.regiaoParam = params.regiaoParam
          if (params.regiaoLike) jParams.regiaoLike = params.regiaoLike

          const jRows = arrayOf(new DynamicModel({ cliente_id: '' }))
          const jqb = $app.db().newQuery(reatPeriodoQuery)
          jqb.bind(jParams)
          jqb.all(jRows)
          clientesNoPeriodo = {}
          for (let ji = 0; ji < jRows.length; ji++) {
            const cid = String(jRows[ji].cliente_id || '')
            if (cid) clientesNoPeriodo[cid] = true
          }
          reativadosReaisCount = jRows.length
        } catch (janelaErr) {
          console.error(
            '[metrics_base_kpis] Erro na janela temporal: ' +
              (janelaErr && janelaErr.message ? janelaErr.message : String(janelaErr)),
          )
        }
      }

      // FONTE OFICIAL DO VALOR/TON DA REAL EQUIPE: FICHAS DE ATENDIMENTO
      // (respostas_formulario) — agregação deduplicada pelo módulo da régua.
      try {
        const rfBaseFilterSql = REGUA.sqlBaseFilter(baseCategoriaParam, 'c.')
        const rfClientCondition = REGUA.sqlRegiao(regiao, 'c.', {})
        let rfWhereFichasExtra = ''
        if (janela.ativa && clientesNoPeriodo) {
          rfWhereFichasExtra = ' AND ' + REGUA.sqlJanelaInteracoes('c.id', janela, 'i_win')
        }

        const fichasQuery = `
          SELECT
            rf.id as ficha_id,
            rf.cliente as cliente_id,
            rf.desfecho as desfecho,
            rf.valor_potencial as valor_potencial,
            rf.toneladas_potencial as toneladas_potencial
          FROM respostas_formulario rf
          INNER JOIN clientes c ON c.id = rf.cliente
          WHERE ${rfBaseFilterSql} ${rfClientCondition}${rfWhereFichasExtra}
          ORDER BY rf.created DESC
        `

        const fParams = {}
        if (params.regiaoParam) fParams.regiaoParam = params.regiaoParam
        if (params.regiaoLike) fParams.regiaoLike = params.regiaoLike
        if (janela.ativa && clientesNoPeriodo) {
          fParams.janelaInicio = janela.inicioIso
          fParams.janelaFim = janela.fimIso
        }

        const fRows = arrayOf(
          new DynamicModel({
            ficha_id: '',
            cliente_id: '',
            desfecho: '',
            valor_potencial: -0,
            toneladas_potencial: -0,
          }),
        )

        const fQueryBuilder = $app.db().newQuery(fichasQuery)
        if (Object.keys(fParams).length > 0) {
          fQueryBuilder.bind(fParams)
        }
        fQueryBuilder.all(fRows)

        const fichasAgg = REGUA.agregarFichas(fRows, '[metrics_base_kpis]')
        let somaValorFichas = fichasAgg.somaValor
        let somaTonFichas = fichasAgg.somaTon

        // Com janela ativa, filtra pelo conjunto de clientes do período
        if (janela.ativa && clientesNoPeriodo) {
          let somaValorJanela = 0
          let somaTonJanela = 0
          for (const cid in fichasAgg.fichasPorCliente) {
            if (!clientesNoPeriodo[String(cid)]) continue
            somaValorJanela += Number(fichasAgg.fichasPorCliente[cid].valor || 0)
            somaTonJanela += Number(fichasAgg.fichasPorCliente[cid].ton || 0)
          }
          somaValorFichas = Number(somaValorJanela.toFixed(2))
          somaTonFichas = Number(somaTonJanela.toFixed(4))
        }

        // Se houver fichas apuradas na esteira, essa é a fonte da verdade de Real Equipe
        if (somaValorFichas > 0 || somaTonFichas > 0) {
          valorRecuperadoReal = somaValorFichas
          toneladasRecuperadasReal = somaTonFichas
        }
      } catch (fichasErr) {
        console.error(
          '[metrics_base_kpis] Erro ao calcular valor/ton das fichas: ' +
            (fichasErr && fichasErr.message ? fichasErr.message : String(fichasErr)),
        )
      }

      const faturamentoCruzamentoCount = Number(kpiModel.faturamento_recente_cruzamento || 0)
      const valorFaturamentoCruzamento = Number(kpiModel.valor_faturamento_recente_cruzamento || 0)
      const toneladasFaturamentoCruzamento = Number(
        kpiModel.toneladas_faturamento_recente_cruzamento || 0,
      )
      const pedidosEmAbertoCount = Number(kpiModel.pedidos_em_aberto || 0)
      const valorPedidosEmAberto = Number(kpiModel.valor_pedidos_em_aberto || 0)
      const compraTerceirosCount = Number(kpiModel.compra_terceiros || 0)
      const naoQuerNegociarCount = Number(kpiModel.nao_quer_negociar || 0)
      const restricaoFinanceiraCount = Number(kpiModel.restricao_financeira || 0)
      const semContatoCount = Number(kpiModel.sem_contato || 0)
      const valorRecuperadoTotal = Number(kpiModel.valor_recuperado_total || 0)

      const naFila = naBaseCount + reservadoCount
      const emAtendimentoTotal = emAtendimentoCount + reservadoCount

      const taxaReativacaoRaw = totalBase > 0 ? (reativadosReaisCount / totalBase) * 100 : 0
      const taxaReativacao =
        totalBase > 0
          ? Number(
              taxaReativacaoRaw < 1 ? taxaReativacaoRaw.toFixed(2) : taxaReativacaoRaw.toFixed(1),
            )
          : 0
      const taxaReativacaoInt = Math.round(taxaReativacao)

      // Follow-ups e reagendados — fórmulas ÚNICAS do módulo da régua
      let followupsReagendados = { followupsProgramados: 0, reagendadosPeriodo: 0 }
      try {
        const filtrosClientes =
          '(' + categoriaSql + ')' + regiaoCondition.replace(/\bregiao\b/g, 'regiao')
        const frBind = {}
        if (params.regiaoParam) frBind.regiaoParam = params.regiaoParam
        if (params.regiaoLike) frBind.regiaoLike = params.regiaoLike
        followupsReagendados = REGUA.contarFollowupsReagendados(
          $app,
          janela,
          filtrosClientes,
          frBind,
          '[metrics_base_kpis]',
        )
      } catch (frErr) {
        console.error(
          '[metrics_base_kpis] Erro followups/reagendados: ' +
            (frErr && frErr.message ? frErr.message : String(frErr)),
        )
      }

      // Agrupamento por região — CASE de normalização ÚNICO do módulo da régua
      const regioesQuery = `
        SELECT
          ${REGUA.sqlCaseRegiao('regiao')} as regiao_nome,
          COUNT(*) as total,
          SUM(COALESCE(score, 0)) as score_sum
        FROM clientes
        WHERE ${baseFilterSql}
        GROUP BY regiao_nome
        ORDER BY total DESC
      `

      const regioesMap = {}
      try {
        const rows = arrayOf(
          new DynamicModel({
            regiao_nome: '',
            total: 0,
            score_sum: -0,
          }),
        )
        $app.db().newQuery(regioesQuery).all(rows)
        if (rows && rows.length > 0) {
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i]
            const rName = String(r.regiao_nome || r.regiaoNome || 'Sem Região')
            const rTotal = Number(r.total || 0)
            const rScoreSum = Number(r.score_sum || 0)
            regioesMap[rName] = {
              total: rTotal,
              scoreSum: rScoreSum,
              avgScore: rTotal > 0 ? Math.round(rScoreSum / rTotal) : 0,
            }
          }
        }
      } catch (regErr) {
        console.error(
          '[metrics_base_kpis] Erro na query de regioes: ' +
            (regErr && regErr.message ? regErr.message : String(regErr)),
        )
      }

      return e.json(200, {
        kpis: {
          totalBase: totalBase,
          total_base: totalBase,
          naFila: naFila,
          na_fila: naFila,
          reativados: reativadosReaisCount,
          reativadosReais: reativadosReaisCount,
          taxaReativacao: taxaReativacaoInt,
          taxaReativacaoFloat: taxaReativacao,
          valorRecuperado: valorRecuperadoReal,
          toneladasRecuperadas: toneladasRecuperadasReal,
          faturamentoRecenteCruzamento: faturamentoCruzamentoCount,
          valorFaturamentoCruzamento: valorFaturamentoCruzamento,
          toneladasFaturamentoCruzamento: toneladasFaturamentoCruzamento,
          pedidosEmAberto: pedidosEmAbertoCount,
          pedidos_em_aberto: pedidosEmAbertoCount,
          valorPedidosEmAberto: valorPedidosEmAberto,
          valor_pedidos_em_aberto: valorPedidosEmAberto,
          reativadosTotalBruto: reativadoTotalCount,
          valorRecuperadoTotalBruto: valorRecuperadoTotal,
          // Métricas novas da régua centralizada
          followupsProgramados: followupsReagendados.followupsProgramados,
          reagendadosPeriodo: followupsReagendados.reagendadosPeriodo,
          realEquipeComPedido: 0,
        },
        estadosContagem: {
          na_base: naBaseCount,
          em_atendimento: emAtendimentoTotal,
          reagendado: reagendadoCount,
          contatado: contatadoCount,
          reativado: reativadosReaisCount,
          reativado_total: reativadoTotalCount,
          reativado_cruzamento: faturamentoCruzamentoCount,
          compra_terceiros: compraTerceirosCount,
          nao_quer_negociar: naoQuerNegociarCount,
          restricao_financeira: restricaoFinanceiraCount,
          sem_contato: semContatoCount,
        },
        regioesMap: regioesMap,
        regua: { versao: 'M1', janelaTemporal: janela.ativa },
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[metrics_base_kpis] Erro geral: ' + errMsg)
      return e.json(500, {
        error: 'Erro interno ao processar base-kpis: ' + errMsg,
      })
    }
  },
  $apis.requireAuth(),
)
