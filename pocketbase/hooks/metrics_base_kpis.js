/// <reference path="../pb_data/types.d.ts" />

// metrics_base_kpis.js — /backend/v1/metrics/base-kpis
// Fórmulas da régua (M1) embutidas INLINE dentro do callback (padrão obrigatório no
// runtime Goja: require() de módulo local falha com "Invalid module"). A cópia
// é idêntica à de reports_analytics.js e reports_export.js — manter as três iguais.
// Documento de referência: regua_metricas.js.

routerAdd(
  'GET',
  '/backend/v1/metrics/base-kpis',
  (e) => {
    try {
      // fonte: regua_metricas.js (padrão inline obrigatório neste runtime)
      const REGUA = (function () {
        const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

        const REGIAO_GRUPOS = [
          ['BRAGANÇA', ['BRAGANÇA', 'BRAGANCA', 'BRAGANÇA PAULISTA', 'BRAGANCA PAULISTA']],
          ['CAMBUÍ', ['CAMBUÍ', 'CAMBUI', 'MICRO-REGIÃO', 'MICRO REGIAO', 'MICROREGIAO']],
          [
            'POÇOS DE CALDAS',
            [
              'POÇOS DE CALDAS',
              'POCOS DE CALDAS',
              'POÇOS CALDAS',
              'POCOS CALDAS',
              'POÇOS',
              'POCOS',
            ],
          ],
          ['JUNDIAÍ', ['JUNDIAÍ', 'JUNDIAI']],
          ['ITAJUBÁ', ['ITAJUBÁ', 'ITAJUBA']],
          ['VARGINHA', ['VARGINHA']],
          ['POUSO ALEGRE', ['POUSO ALEGRE']],
          ['EXTREMA', ['EXTREMA']],
          ['ATACADO', ['ATACADO']],
          ['REPESCAGEM', ['REPESCAGEM']],
        ]

        function grupoDeRegiao(upper) {
          for (let g = 0; g < REGIAO_GRUPOS.length; g++) {
            if (REGIAO_GRUPOS[g][1].indexOf(upper) !== -1) return REGIAO_GRUPOS[g]
          }
          return null
        }

        function sqlExisteInteracaoReativacao(refCliente, iAlias) {
          const I = iAlias || 'i_chk'
          return (
            'EXISTS (SELECT 1 FROM interacoes ' +
            I +
            ' WHERE ' +
            I +
            '.cliente = ' +
            refCliente +
            ' AND (' +
            I +
            '.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            ' OR (' +
            I +
            '.numero_pedido IS NOT NULL AND TRIM(' +
            I +
            ".numero_pedido) != '' AND TRIM(" +
            I +
            ".numero_pedido) != '-')))"
          )
        }

        // RÉGUA OFICIAL DE REATIVAÇÃO: prova de operador + atendimento real em interacoes.
        function sqlReativacaoReal(a) {
          const p = a ? a + '.' : ''
          const ref = a ? a + '.id' : 'clientes.id'
          return (
            '(' +
            p +
            "estado = 'reativado' AND ((" +
            p +
            'operador IS NOT NULL AND TRIM(' +
            p +
            "operador) != '') OR (" +
            p +
            'operador_reativacao IS NOT NULL AND TRIM(' +
            p +
            "operador_reativacao) != '')) AND " +
            sqlExisteInteracaoReativacao(ref) +
            ')'
          )
        }

        // FATURAMENTO DO CRUZAMENTO ERP: 'reativado' SEM atendimento da equipe.
        function sqlFaturamentoCruzamento(a) {
          const p = a ? a + '.' : ''
          const ref = a ? a + '.id' : 'clientes.id'
          return (
            '(' +
            p +
            "estado = 'reativado' AND ((" +
            p +
            'operador IS NULL OR TRIM(' +
            p +
            "operador) = '') OR NOT " +
            sqlExisteInteracaoReativacao(ref, 'i_chk2') +
            '))'
          )
        }

        // Janela: EXISTS de interação de reativação dentro de [janelaInicio, janelaFim].
        function sqlJanelaInteracoes(refCliente, janela, iAlias) {
          if (!janela || !janela.ativa) return '1=1'
          const I = iAlias || 'i_win'
          return (
            'EXISTS (SELECT 1 FROM interacoes ' +
            I +
            ' WHERE ' +
            I +
            '.cliente = ' +
            refCliente +
            ' AND ' +
            I +
            '.created >= {:janelaInicio} AND ' +
            I +
            '.created <= {:janelaFim} AND (' +
            I +
            '.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            ' OR (' +
            I +
            '.numero_pedido IS NOT NULL AND TRIM(' +
            I +
            ".numero_pedido) != '' AND TRIM(" +
            I +
            ".numero_pedido) != '-')))"
          )
        }

        // Janela temporal: ativa somente com data_inicial E data_final em YYYY-MM-DD. 00:00 BRT = 03:00 UTC.
        function parseJanela(dataInicial, dataFinal) {
          const di = String(dataInicial || '').trim()
          const df = String(dataFinal || '').trim()
          const res = { ativa: false, inicioIso: '', fimIso: '', dataInicial: di, dataFinal: df }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) return res
          const pF = df.split('-')
          res.ativa = true
          res.inicioIso = di + ' 03:00:00.000Z'
          res.fimIso = new Date(
            Date.UTC(
              parseInt(pF[0], 10),
              parseInt(pF[1], 10) - 1,
              parseInt(pF[2], 10) + 1,
              2,
              59,
              59,
              999,
            ),
          ).toISOString()
          return res
        }

        // Categoria de base ('todas'|'normal'|'cliente_final'|'atacado_fora_mapa'|'sem_dono'|'repescagem').
        function sqlCategoria(baseCategoriaParam, pfx) {
          const p = pfx || ''
          const cat = String(baseCategoriaParam || 'todas').trim()
          const colCat = p + 'base_categoria'
          const colSemDono = p + 'sem_dono_equipe'
          const colRegiao = p + 'regiao'
          const colDias = p + 'dias_sem_faturar'
          if (cat === 'cliente_final') return colCat + " = 'cliente_final'"
          if (cat === 'atacado_fora_mapa') return colCat + " = 'atacado_fora_mapa'"
          if (cat === 'sem_dono' || cat === 'sem_dono_equipe')
            return '(' + colSemDono + ' = 1 OR ' + colSemDono + ' = true)'
          if (cat === 'repescagem')
            return '(' + colRegiao + " = 'REPESCAGEM' OR " + colDias + ' >= 90)'
          if (cat === 'normal')
            return '(' + colCat + ' IS NULL OR ' + colCat + " = '' OR " + colCat + " = 'normal')"
          return '1=1'
        }

        // Filtro de base: exclui ativo_fora_base (estado e flag) + categoria.
        function sqlBaseFilter(catParam, a) {
          const p = a ? a + '.' : ''
          return (
            p +
            "estado != 'ativo_fora_base' AND (" +
            p +
            'ativo_fora_base IS NULL OR ' +
            p +
            'ativo_fora_base = 0) AND (' +
            sqlCategoria(catParam, a ? a + '.' : '') +
            ')'
          )
        }

        // Região com todas as grafias; preenche bindParams.regiaoParam/regiaoLike quando livre.
        function sqlRegiao(regiaoParam, pfx, bindParams) {
          const p = pfx || ''
          const reg = String(regiaoParam || '').trim()
          if (!reg || reg.toLowerCase() === 'todas') return ''
          const col = p + 'regiao'
          const upper = reg.toUpperCase().trim()
          if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
            return (
              ' AND (' +
              col +
              " = '' OR " +
              col +
              ' IS NULL OR UPPER(TRIM(' +
              col +
              ")) = 'SEM REGIÃO' OR UPPER(TRIM(" +
              col +
              ")) = 'SEM REGIAO')"
            )
          }
          const grupo = grupoDeRegiao(upper)
          if (grupo) {
            const u = 'UPPER(TRIM(' + col + '))'
            return (
              ' AND (' +
              grupo[1]
                .map(function (v) {
                  return u + " = '" + v + "'"
                })
                .join(' OR ') +
              ')'
            )
          }
          if (bindParams) {
            bindParams.regiaoParam = upper
            bindParams.regiaoLike = '%' + upper + '%'
          }
          return (
            ' AND (UPPER(TRIM(' +
            col +
            ')) = {:regiaoParam} OR UPPER(TRIM(' +
            col +
            ')) LIKE {:regiaoLike})'
          )
        }

        // CASE de normalização de região para GROUP BY.
        function sqlCaseRegiao(col) {
          const c = col || 'regiao'
          const u = 'UPPER(TRIM(' + c + '))'
          let sql = 'CASE WHEN ' + c + ' IS NULL OR TRIM(' + c + ") = '' THEN 'Sem Região' "
          for (let g = 0; g < REGIAO_GRUPOS.length; g++) {
            const grupo = REGIAO_GRUPOS[g]
            sql +=
              'WHEN ' +
              u +
              ' IN (' +
              grupo[1]
                .map(function (v) {
                  return "'" + v + "'"
                })
                .join(', ') +
              ") THEN '" +
              grupo[0] +
              "' "
          }
          return sql + 'ELSE ' + u + ' END'
        }

        // CASE de faixa de inatividade (dias_sem_faturar) para GROUP BY.
        function sqlCaseFaixaInatividade(col) {
          const c = col || 'dias_sem_faturar'
          return (
            'CASE WHEN ' +
            c +
            " IS NULL THEN 'Indefinida' WHEN " +
            c +
            " < 60 THEN 'Menos de 60 dias' WHEN " +
            c +
            " <= 89 THEN '60-89 dias' WHEN " +
            c +
            " <= 179 THEN '90-179 dias' WHEN " +
            c +
            " <= 365 THEN '180-365 dias' ELSE 'Mais de 365 dias' END"
          )
        }

        // CASE de faixa de score para GROUP BY.
        function sqlCaseScore(col) {
          const c = col || 'score'
          return (
            'CASE WHEN ' +
            c +
            " IS NULL THEN 'Indefinido' WHEN " +
            c +
            " < 30 THEN 'Baixo' WHEN " +
            c +
            " <= 60 THEN 'Médio' ELSE 'Alto' END"
          )
        }

        // Início de hoje (meia-noite BRT) menos N dias, no formato de interacoes/clientes.
        function midnightBrasiliaIso(diasAtras) {
          const brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
          const meiaNoiteUtc =
            Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3) -
            (diasAtras || 0) * 86400000
          return new Date(meiaNoiteUtc).toISOString().replace('T', ' ')
        }

        function pushCondCategoria(conditions, cat) {
          const c = sqlCategoria(cat, '')
          if (c && c !== '1=1') conditions.push(c)
        }

        function pushCondRegiao(conditions, regiao, bindParams, pfx) {
          const c = sqlRegiao(regiao, pfx, bindParams)
          const t = c.replace(/^\s*AND\s+/, '')
          if (t) conditions.push(t)
          return c
        }

        // Cinto de segurança + dedupe das fichas (FONTE OFICIAL de valor/ton da Real Equipe).
        function agregarFichas(fRows, tag) {
          const t = tag || '[regua]'
          let somaValor = 0
          let somaTon = 0
          const fichasPorCliente = {}
          const clientesProcessados = {}
          for (let fi = 0; fi < fRows.length; fi++) {
            const fr = fRows[fi]
            const cId = fr.cliente_id
            if (!cId || clientesProcessados[cId]) continue
            clientesProcessados[cId] = true
            const desfecho = String(fr.desfecho || '').trim()
            if (desfecho !== 'reativado') continue
            const vPot = Number(fr.valor_potencial || 0)
            let tPot = Number(fr.toneladas_potencial || 0)
            if (tPot > 500) tPot = tPot / 1000.0
            if (vPot > 0 && tPot > 0 && vPot / tPot < 100) {
              console.log(
                t +
                  ' Cinto de segurança: ficha descartada id=' +
                  fr.ficha_id +
                  ' (cliente=' +
                  cId +
                  ')',
              )
              continue
            }
            if (vPot > 0) somaValor += vPot
            if (tPot > 0) somaTon += tPot
            fichasPorCliente[cId] = { valor: vPot > 0 ? vPot : 0, ton: tPot > 0 ? tPot : 0 }
          }
          return {
            somaValor: Number(somaValor.toFixed(2)),
            somaTon: Number(somaTon.toFixed(4)),
            fichasPorCliente: fichasPorCliente,
          }
        }

        // Follow-ups programados (estado atual) e reagendados (interacoes.created, janela quando ativa).
        function contarFollowupsReagendados(app, janela, filtrosSql, bindParams, tag) {
          const t = tag || '[regua]'
          const res = { followupsProgramados: 0, reagendadosPeriodo: 0 }
          try {
            const fModel = new DynamicModel({ total: 0 })
            const fSql =
              "SELECT COUNT(*) as total FROM clientes WHERE reagendado_para IS NOT NULL AND TRIM(reagendado_para) != ''" +
              (filtrosSql ? ' AND ' + filtrosSql : '')
            const fqb = app.db().newQuery(fSql)
            if (bindParams && Object.keys(bindParams).length > 0) fqb.bind(bindParams)
            fqb.one(fModel)
            res.followupsProgramados = Number(fModel.total || 0)
          } catch (errF) {
            console.error(
              t + ' Erro followups: ' + (errF && errF.message ? errF.message : String(errF)),
            )
          }
          try {
            const rModel = new DynamicModel({ total: 0 })
            let rSql =
              "SELECT COUNT(*) as total FROM interacoes i WHERE (i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != ''))"
            const rParams = {}
            if (janela && janela.ativa) {
              rSql += ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}'
              rParams.janelaInicio = janela.inicioIso
              rParams.janelaFim = janela.fimIso
            }
            const rqb = app.db().newQuery(rSql)
            if (Object.keys(rParams).length > 0) rqb.bind(rParams)
            rqb.one(rModel)
            res.reagendadosPeriodo = Number(rModel.total || 0)
          } catch (errR) {
            console.error(
              t + ' Erro reagendados: ' + (errR && errR.message ? errR.message : String(errR)),
            )
          }
          return res
        }

        return {
          DESFECHOS_REATIVACAO: DESFECHOS_REATIVACAO,
          parseJanela: parseJanela,
          sqlCategoria: sqlCategoria,
          sqlBaseFilter: sqlBaseFilter,
          sqlRegiao: sqlRegiao,
          sqlCaseRegiao: sqlCaseRegiao,
          sqlCaseFaixaInatividade: sqlCaseFaixaInatividade,
          sqlCaseScore: sqlCaseScore,
          sqlReativacaoReal: sqlReativacaoReal,
          sqlFaturamentoCruzamento: sqlFaturamentoCruzamento,
          sqlJanelaInteracoes: sqlJanelaInteracoes,
          sqlExisteInteracaoReativacao: sqlExisteInteracaoReativacao,
          midnightBrasiliaIso: midnightBrasiliaIso,
          pushCondCategoria: pushCondCategoria,
          pushCondRegiao: pushCondRegiao,
          agregarFichas: agregarFichas,
          contarFollowupsReagendados: contarFollowupsReagendados,
        }
      })()

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
        console.log(
          '[metrics_base_kpis] kpisQuery executada OK — total_base=' +
            Number(kpiModel.total_base || 0),
        )
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
          WHERE ${rfBaseFilterSql}${rfClientCondition}${rfWhereFichasExtra}
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

      // ATENDIMENTO (nova lógica): finalizações = atendimentos com ficha concluída (desfecho);
      // canais = contadores separados por tipo de contato; faturamento = desfecho faturamento_concluido.
      // Janela aplicada sobre interacoes.created quando ativa. Região não se aplica a interações aqui.
      const atendimentoResumo = {
        finalizacoes: 0,
        porDesfecho: {},
        canais: { ligacao: 0, whatsapp: 0, email: 0 },
        faturamentoConcluido: 0,
      }
      try {
        const janWhere = janela.ativa
          ? ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}'
          : ''
        const janBind = {}
        if (janela.ativa) {
          janBind.janelaInicio = janela.inicioIso
          janBind.janelaFim = janela.fimIso
        }
        const aggRows = (sqlTxt, model) => {
          const rows = arrayOf(model)
          const qb = $app.db().newQuery(sqlTxt)
          if (Object.keys(janBind).length > 0) qb.bind(janBind)
          qb.all(rows)
          return rows
        }
        const finRows = aggRows(
          "SELECT i.desfecho as chave, COUNT(*) as total FROM interacoes i WHERE i.conteudo LIKE 'Atendimento finalizado com desfecho%'" +
            janWhere +
            ' GROUP BY i.desfecho',
          new DynamicModel({ chave: '', total: 0 }),
        )
        for (let fi = 0; fi < finRows.length; fi++) {
          const d = String(finRows[fi].chave || '').trim() || 'sem_desfecho'
          const n = Number(finRows[fi].total || 0)
          atendimentoResumo.porDesfecho[d] = n
          atendimentoResumo.finalizacoes += n
        }
        const canRows = aggRows(
          "SELECT i.tipo as chave, COUNT(*) as total FROM interacoes i WHERE i.tipo IN ('ligacao', 'whatsapp', 'email')" +
            janWhere +
            ' GROUP BY i.tipo',
          new DynamicModel({ chave: '', total: 0 }),
        )
        for (let ci = 0; ci < canRows.length; ci++) {
          atendimentoResumo.canais[String(canRows[ci].chave)] = Number(canRows[ci].total || 0)
        }
        const fatRows = aggRows(
          "SELECT COUNT(*) as total FROM interacoes i WHERE i.desfecho = 'faturamento_concluido'" +
            janWhere,
          new DynamicModel({ total: 0 }),
        )
        atendimentoResumo.faturamentoConcluido = Number(fatRows.length ? fatRows[0].total || 0 : 0)
      } catch (atendErr) {
        console.error(
          '[metrics_base_kpis] Erro no bloco de atendimento: ' +
            (atendErr && atendErr.message ? atendErr.message : String(atendErr)),
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
        atendimento: atendimentoResumo,
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
