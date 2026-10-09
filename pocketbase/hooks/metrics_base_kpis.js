/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/backend/v1/metrics/base-kpis',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const q = e.requestInfo().query || {}
      const rawRegiao = q.regiao || ''
      const regiao = String(rawRegiao).trim()
      const baseCategoriaParam = String(q.baseCategoria || q.categoria || 'todas').trim()

      // Construção da condição de categoria de base
      let categoriaSql = '1=1'
      if (baseCategoriaParam === 'cliente_final') {
        categoriaSql = "base_categoria = 'cliente_final'"
      } else if (baseCategoriaParam === 'atacado_fora_mapa') {
        categoriaSql = "base_categoria = 'atacado_fora_mapa'"
      } else if (baseCategoriaParam === 'sem_dono' || baseCategoriaParam === 'sem_dono_equipe') {
        categoriaSql = '(sem_dono_equipe = 1 OR sem_dono_equipe = true)'
      } else if (baseCategoriaParam === 'repescagem') {
        categoriaSql = "(regiao = 'REPESCAGEM' OR dias_sem_faturar >= 90)"
      } else if (baseCategoriaParam === 'normal') {
        categoriaSql =
          "(base_categoria IS NULL OR base_categoria = '' OR base_categoria = 'normal')"
      } else if (baseCategoriaParam === 'todas') {
        categoriaSql = '1=1'
      }

      // Construção da condição de região segura para SQLite
      // Trata todas as variações de grafia e "Sem Região"
      let regiaoCondition = ''
      const params = {}

      if (regiao && regiao.toLowerCase() !== 'todas') {
        const upper = regiao.toUpperCase().trim()
        if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
          regiaoCondition =
            " AND (regiao = '' OR regiao IS NULL OR UPPER(TRIM(regiao)) = 'SEM REGIÃO' OR UPPER(TRIM(regiao)) = 'SEM REGIAO')"
        } else if (
          upper === 'BRAGANÇA' ||
          upper === 'BRAGANCA' ||
          upper === 'BRAGANÇA PAULISTA' ||
          upper === 'BRAGANCA PAULISTA'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'BRAGANÇA' OR UPPER(TRIM(regiao)) = 'BRAGANCA' OR UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA')"
        } else if (
          upper === 'CAMBUÍ' ||
          upper === 'CAMBUI' ||
          upper === 'MICRO-REGIÃO' ||
          upper === 'MICRO REGIAO' ||
          upper === 'MICROREGIAO'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'CAMBUÍ' OR UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO' OR UPPER(TRIM(regiao)) = 'MICROREGIAO')"
        } else if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS' ||
          upper === 'POÇOS' ||
          upper === 'POCOS'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS' OR UPPER(TRIM(regiao)) = 'POCOS')"
        } else if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(regiao)) = 'JUNDIAI')"
        } else if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(regiao)) = 'ITAJUBA')"
        } else if (upper === 'VARGINHA') {
          regiaoCondition = " AND UPPER(TRIM(regiao)) = 'VARGINHA'"
        } else if (upper === 'POUSO ALEGRE') {
          regiaoCondition = " AND UPPER(TRIM(regiao)) = 'POUSO ALEGRE'"
        } else if (upper === 'EXTREMA') {
          regiaoCondition = " AND UPPER(TRIM(regiao)) = 'EXTREMA'"
        } else if (upper === 'ATACADO') {
          regiaoCondition = " AND UPPER(TRIM(regiao)) = 'ATACADO'"
        } else if (upper === 'REPESCAGEM') {
          regiaoCondition = " AND UPPER(TRIM(regiao)) = 'REPESCAGEM'"
        } else {
          regiaoCondition =
            ' AND (UPPER(TRIM(regiao)) = {:regiaoParam} OR UPPER(TRIM(regiao)) LIKE {:regiaoLike})'
          params.regiaoParam = upper
          params.regiaoLike = '%' + upper + '%'
        }
      }

      // Regra fundamental: clientes marcados com ativo_fora_base (flag ou estado) ficam fora
      const baseFilterSql = `estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0) AND (${categoriaSql})`

      const isReativacaoRealCond =
        "(estado = 'reativado' AND ((operador IS NOT NULL AND TRIM(operador) != '') OR (pedido_reativacao IS NOT NULL AND TRIM(pedido_reativacao) != '')))"

      const isFaturamentoCruzamentoCond =
        "(estado = 'reativado' AND (operador IS NULL OR TRIM(operador) = '') AND (pedido_reativacao IS NULL OR TRIM(pedido_reativacao) = ''))"

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

      const totalBase = Number(
        kpiModel.total_base !== undefined && kpiModel.total_base !== null
          ? kpiModel.total_base
          : kpiModel.totalBase || 0,
      )
      const naBaseCount = Number(
        kpiModel.na_base !== undefined && kpiModel.na_base !== null
          ? kpiModel.na_base
          : kpiModel.naBase || 0,
      )
      const reservadoCount = Number(kpiModel.reservado || 0)
      const emAtendimentoCount = Number(
        kpiModel.em_atendimento !== undefined && kpiModel.em_atendimento !== null
          ? kpiModel.em_atendimento
          : kpiModel.emAtendimento || 0,
      )
      const reagendadoCount = Number(kpiModel.reagendado || 0)
      const contatadoCount = Number(kpiModel.contatado || 0)
      const reativadoTotalCount = Number(kpiModel.reativado || 0)
      const reativadosReaisCount = Number(
        kpiModel.reativados_reais !== undefined && kpiModel.reativados_reais !== null
          ? kpiModel.reativados_reais
          : kpiModel.reativadosReais || 0,
      )
      let valorRecuperadoReal = Number(
        kpiModel.valor_recuperado_real !== undefined && kpiModel.valor_recuperado_real !== null
          ? kpiModel.valor_recuperado_real
          : kpiModel.valorRecuperadoReal || 0,
      )
      let toneladasRecuperadasReal = Number(
        kpiModel.toneladas_recuperadas_real !== undefined &&
          kpiModel.toneladas_recuperadas_real !== null
          ? kpiModel.toneladas_recuperadas_real
          : kpiModel.toneladasRecuperadasReal || 0,
      )

      // FONTE OFICIAL DAS MÉTRICAS DE REAL EQUIPE: FICHAS DE ATENDIMENTO (respostas_formulario)
      // Agregação de valor_potencial e toneladas_potencial das fichas dos clientes reativados pela equipe,
      // com deduplicação por cliente (ficha mais recente) e exclusão de desfechos isentos.
      try {
        const rfClientCondition = regiaoCondition
          ? regiaoCondition.replace(/\bregiao\b/g, 'c.regiao')
          : ''
        const rfCategoryCondition = categoriaSql
          .replace(/\bbase_categoria\b/g, 'c.base_categoria')
          .replace(/\bsem_dono_equipe\b/g, 'c.sem_dono_equipe')
          .replace(/\bregiao\b/g, 'c.regiao')
          .replace(/\bdias_sem_faturar\b/g, 'c.dias_sem_faturar')

        const rfBaseFilterSql = `c.estado != 'ativo_fora_base' AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0) AND (${rfCategoryCondition})`

        const fichasQuery = `
          SELECT
            rf.cliente as cliente_id,
            rf.desfecho as desfecho,
            rf.valor_potencial as valor_potencial,
            rf.toneladas_potencial as toneladas_potencial
          FROM respostas_formulario rf
          INNER JOIN clientes c ON c.id = rf.cliente
          WHERE ${rfBaseFilterSql} ${rfClientCondition}
          ORDER BY rf.created DESC
        `

        const fParams = {}
        if (params.regiaoParam) fParams.regiaoParam = params.regiaoParam
        if (params.regiaoLike) fParams.regiaoLike = params.regiaoLike

        const fRows = arrayOf(
          new DynamicModel({
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

        const desfechosIsentos = {
          duplicado: true,
          sem_contato: true,
          ativo_fora_base: true,
          compra_terceiros: true,
          cliente_final: true,
          restricao_financeira: true,
        }

        const clientesProcessados = {}
        let somaValorFichas = 0
        let somaTonFichas = 0

        for (let fi = 0; fi < fRows.length; fi++) {
          const fr = fRows[fi]
          const cId = fr.cliente_id
          if (!cId || clientesProcessados[cId]) continue
          clientesProcessados[cId] = true

          const desfecho = String(fr.desfecho || '').trim()
          if (desfecho === 'reativado' && !desfechosIsentos[desfecho]) {
            const vPot = Number(fr.valor_potencial || 0)
            const tPot = Number(fr.toneladas_potencial || 0)
            if (vPot > 0) somaValorFichas += vPot
            if (tPot > 0) somaTonFichas += tPot
          }
        }

        // Se houver fichas apuradas na esteira, utilizar essa soma como fonte da verdade de Real Equipe
        if (somaValorFichas > 0 || somaTonFichas > 0) {
          valorRecuperadoReal = Number(somaValorFichas.toFixed(2))
          toneladasRecuperadasReal = Number(somaTonFichas.toFixed(4))
        }
      } catch (fichasErr) {
        console.error(
          '[metrics_base_kpis] Erro ao calcular valor/ton das fichas: ' +
            (fichasErr && fichasErr.message ? fichasErr.message : String(fichasErr)),
        )
      }

      const faturamentoCruzamentoCount = Number(
        kpiModel.faturamento_recente_cruzamento !== undefined &&
          kpiModel.faturamento_recente_cruzamento !== null
          ? kpiModel.faturamento_recente_cruzamento
          : kpiModel.faturamentoRecenteCruzamento || 0,
      )
      const valorFaturamentoCruzamento = Number(
        kpiModel.valor_faturamento_recente_cruzamento !== undefined &&
          kpiModel.valor_faturamento_recente_cruzamento !== null
          ? kpiModel.valor_faturamento_recente_cruzamento
          : kpiModel.valorFaturamentoRecenteCruzamento || 0,
      )
      const toneladasFaturamentoCruzamento = Number(
        kpiModel.toneladas_faturamento_recente_cruzamento !== undefined &&
          kpiModel.toneladas_faturamento_recente_cruzamento !== null
          ? kpiModel.toneladas_faturamento_recente_cruzamento
          : kpiModel.toneladasFaturamentoRecenteCruzamento || 0,
      )

      const pedidosEmAbertoCount = Number(
        kpiModel.pedidos_em_aberto !== undefined && kpiModel.pedidos_em_aberto !== null
          ? kpiModel.pedidos_em_aberto
          : kpiModel.pedidosEmAberto || 0,
      )
      const valorPedidosEmAberto = Number(
        kpiModel.valor_pedidos_em_aberto !== undefined && kpiModel.valor_pedidos_em_aberto !== null
          ? kpiModel.valor_pedidos_em_aberto
          : kpiModel.valorPedidosEmAberto || 0,
      )

      const compraTerceirosCount = Number(
        kpiModel.compra_terceiros !== undefined && kpiModel.compra_terceiros !== null
          ? kpiModel.compra_terceiros
          : kpiModel.compraTerceiros || 0,
      )
      const naoQuerNegociarCount = Number(
        kpiModel.nao_quer_negociar !== undefined && kpiModel.nao_quer_negociar !== null
          ? kpiModel.nao_quer_negociar
          : kpiModel.naoQuerNegociar || 0,
      )
      const restricaoFinanceiraCount = Number(
        kpiModel.restricao_financeira !== undefined && kpiModel.restricao_financeira !== null
          ? kpiModel.restricao_financeira
          : kpiModel.restricaoFinanceira || 0,
      )
      const semContatoCount = Number(
        kpiModel.sem_contato !== undefined && kpiModel.sem_contato !== null
          ? kpiModel.sem_contato
          : kpiModel.semContato || 0,
      )
      const valorRecuperadoTotal = Number(
        kpiModel.valor_recuperado_total !== undefined && kpiModel.valor_recuperado_total !== null
          ? kpiModel.valor_recuperado_total
          : kpiModel.valorRecuperadoTotal || 0,
      )

      const naFila = naBaseCount + reservadoCount
      const emAtendimentoTotal = emAtendimentoCount + reservadoCount

      const taxaReativacao =
        totalBase > 0 ? Number(((reativadosReaisCount / totalBase) * 100).toFixed(1)) : 0
      const taxaReativacaoInt = Math.round(taxaReativacao)

      // 2. Agrupamento por região com normalização completa das 8 rotas Varejo + ATACADO + REPESCAGEM
      const regioesQuery = `
        SELECT
          CASE
            WHEN regiao IS NULL OR TRIM(regiao) = '' THEN 'Sem Região'
            WHEN UPPER(TRIM(regiao)) = 'BRAGANÇA' OR UPPER(TRIM(regiao)) = 'BRAGANCA' OR UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA' THEN 'BRAGANÇA'
            WHEN UPPER(TRIM(regiao)) = 'CAMBUÍ' OR UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO' OR UPPER(TRIM(regiao)) = 'MICROREGIAO' THEN 'CAMBUÍ'
            WHEN UPPER(TRIM(regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS' OR UPPER(TRIM(regiao)) = 'POCOS' THEN 'POÇOS DE CALDAS'
            WHEN UPPER(TRIM(regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(regiao)) = 'JUNDIAI' THEN 'JUNDIAÍ'
            WHEN UPPER(TRIM(regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(regiao)) = 'ITAJUBA' THEN 'ITAJUBÁ'
            WHEN UPPER(TRIM(regiao)) = 'VARGINHA' THEN 'VARGINHA'
            WHEN UPPER(TRIM(regiao)) = 'POUSO ALEGRE' THEN 'POUSO ALEGRE'
            WHEN UPPER(TRIM(regiao)) = 'EXTREMA' THEN 'EXTREMA'
            WHEN UPPER(TRIM(regiao)) = 'ATACADO' THEN 'ATACADO'
            WHEN UPPER(TRIM(regiao)) = 'REPESCAGEM' THEN 'REPESCAGEM'
            ELSE UPPER(TRIM(regiao))
          END as regiao_nome,
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
            const rScoreSum = Number(
              r.score_sum !== undefined && r.score_sum !== null ? r.score_sum : r.scoreSum || 0,
            )
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
