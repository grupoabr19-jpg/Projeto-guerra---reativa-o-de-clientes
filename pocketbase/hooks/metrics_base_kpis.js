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

      const rawRegiao = e.requestInfo().query ? e.requestInfo().query.regiao || '' : ''
      const regiao = String(rawRegiao).trim()

      // Construção da condição de região segura para SQLite
      // Trata as variações de grafia e "Sem Região"
      let regiaoCondition = ''
      const params = {}

      if (regiao && regiao.toLowerCase() !== 'todas') {
        const upper = regiao.toUpperCase()
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
          upper === 'MICRO REGIAO'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'CAMBUÍ' OR UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO')"
        } else if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS'
        ) {
          regiaoCondition =
            " AND (UPPER(TRIM(regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS')"
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

      // Regra fundamental: clientes marcados com ativo_fora_base (flag ou estado) NÃO contam na carteira ativa/inativos nem na fila
      const baseFilterSql =
        "estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0)"

      // 1. Contagens agregadas gerais e valores recuperados
      // No PocketBase JSVM (Goja), dbx.Query.one() requer um DynamicModel com a estrutura dos campos.
      // O acesso às propriedades geradas no DynamicModel é feito em lowerCamelCase.
      const kpisQuery = `
        SELECT
          COUNT(*) as total_base,
          SUM(CASE WHEN estado = 'na_base' THEN 1 ELSE 0 END) as na_base,
          SUM(CASE WHEN estado = 'reservado' THEN 1 ELSE 0 END) as reservado,
          SUM(CASE WHEN estado = 'em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
          SUM(CASE WHEN estado = 'reagendado' THEN 1 ELSE 0 END) as reagendado,
          SUM(CASE WHEN estado = 'contatado' THEN 1 ELSE 0 END) as contatado,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativado,
          SUM(CASE WHEN estado = 'compra_terceiros' THEN 1 ELSE 0 END) as compra_terceiros,
          SUM(CASE WHEN estado = 'nao_quer_negociar' THEN 1 ELSE 0 END) as nao_quer_negociar,
          SUM(CASE WHEN estado = 'sem_contato' THEN 1 ELSE 0 END) as sem_contato,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas
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
        compra_terceiros: 0,
        nao_quer_negociar: 0,
        sem_contato: 0,
        valor_recuperado: -0,
        toneladas_recuperadas: -0,
      })

      try {
        const queryBuilder = $app.db().newQuery(kpisQuery)
        if (params && Object.keys(params).length > 0) {
          queryBuilder.bind(params)
        }
        queryBuilder.one(kpiModel)
      } catch (dbErr) {
        console.log(
          '[metrics_base_kpis] Erro na query de KPIs: ' +
            (dbErr && dbErr.message ? dbErr.message : String(dbErr)),
        )
        return e.json(500, {
          error:
            'Erro ao calcular KPIs de base: ' +
            (dbErr && dbErr.message ? dbErr.message : String(dbErr)),
        })
      }

      // Propriedades acessíveis no DynamicModel (Goja armazena nos campos nomeados da struct/objeto)
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
      const reativadoCount = Number(kpiModel.reativado || 0)
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
      const semContatoCount = Number(
        kpiModel.sem_contato !== undefined && kpiModel.sem_contato !== null
          ? kpiModel.sem_contato
          : kpiModel.semContato || 0,
      )
      const valorRecuperado = Number(
        kpiModel.valor_recuperado !== undefined && kpiModel.valor_recuperado !== null
          ? kpiModel.valor_recuperado
          : kpiModel.valorRecuperado || 0,
      )
      const toneladasRecuperadas = Number(
        kpiModel.toneladas_recuperadas !== undefined && kpiModel.toneladas_recuperadas !== null
          ? kpiModel.toneladas_recuperadas
          : kpiModel.toneladasRecuperadas || 0,
      )

      // Na fila: 'na_base' + 'reservado' (ou clientes disponíveis para alocação)
      const naFila = naBaseCount + reservadoCount
      const emAtendimentoTotal = emAtendimentoCount + reservadoCount
      const taxaReativacao = totalBase > 0 ? Math.round((reativadoCount / totalBase) * 100) : 0

      // 2. Agrupamento por região (contagem e média ponderada de score para todas as regiões da base)
      const regioesQuery = `
        SELECT
          CASE
            WHEN regiao IS NULL OR TRIM(regiao) = '' THEN 'Sem Região'
            WHEN UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA' THEN 'BRAGANÇA'
            WHEN UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO' THEN 'CAMBUÍ'
            WHEN UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS' THEN 'POÇOS DE CALDAS'
            WHEN UPPER(TRIM(regiao)) = 'JUNDIAI' THEN 'JUNDIAÍ'
            WHEN UPPER(TRIM(regiao)) = 'ITAJUBA' THEN 'ITAJUBÁ'
            ELSE UPPER(TRIM(regiao))
          END as regiao_nome,
          COUNT(*) as total,
          SUM(COALESCE(score, 0)) as score_sum
        FROM clientes
        WHERE ${baseFilterSql}
        GROUP BY regiao_nome
        ORDER BY total DESC
      `

      const regioesRows = arrayOf(
        new DynamicModel({
          regiao_nome: '',
          total: 0,
          score_sum: -0,
        }),
      )

      try {
        $app.db().newQuery(regioesQuery).all(regioesRows)
      } catch (regErr) {
        console.log(
          '[metrics_base_kpis] Erro na query de regioes: ' +
            (regErr && regErr.message ? regErr.message : String(regErr)),
        )
      }

      const regioesMap = {}
      for (let i = 0; i < regioesRows.length; i++) {
        const r = regioesRows[i]
        const rName = r.regiao_nome || r.regiaoNome || 'Sem Região'
        const rTotal = Number(r.total || 0)
        const rScoreSum = Number(r.score_sum || r.scoreSum || 0)
        regioesMap[rName] = {
          total: rTotal,
          scoreSum: rScoreSum,
          avgScore: rTotal > 0 ? Math.round(rScoreSum / rTotal) : 0,
        }
      }

      return e.json(200, {
        kpis: {
          totalBase: totalBase,
          total_base: totalBase,
          naFila: naFila,
          na_fila: naFila,
          reativados: reativadoCount,
          taxaReativacao: taxaReativacao,
          valorRecuperado: valorRecuperado,
          toneladasRecuperadas: toneladasRecuperadas,
        },
        estadosContagem: {
          na_base: naBaseCount,
          em_atendimento: emAtendimentoTotal,
          reagendado: reagendadoCount,
          contatado: contatadoCount,
          reativado: reativadoCount,
          compra_terceiros: compraTerceirosCount,
          nao_quer_negociar: naoQuerNegociarCount,
          sem_contato: semContatoCount,
        },
        regioesMap: regioesMap,
      })
    } catch (err) {
      console.log(
        '[metrics_base_kpis] Erro geral: ' + (err && err.message ? err.message : String(err)),
      )
      return e.json(500, {
        error:
          'Erro interno ao processar base-kpis: ' +
          (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
