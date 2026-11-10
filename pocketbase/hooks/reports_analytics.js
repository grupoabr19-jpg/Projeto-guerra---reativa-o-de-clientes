/// <reference path="../pb_data/types.d.ts" />

// reports_analytics.js — /backend/v1/metrics/reports-analytics
// ROTA MANTIDA, com todos os filtros e cruzamentos. TODAS as fórmulas da régua
// vêm do módulo único regua_metricas.js (M1) — nenhuma fórmula duplicada aqui.

routerAdd(
  'GET',
  '/backend/v1/metrics/reports-analytics',
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
        }
      })()

      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      // Líder de rota: restrição obrigatória
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

      const segmentoParam = String(q.segmento || '').trim()
      const vendedorParam = String(q.vendedor || '').trim()
      const operadorParam = String(q.operador || '').trim()
      const faixaInatividadeParam = String(q.faixaInatividade || '').trim()
      const faixaScoreParam = String(q.faixaScore || '').trim()
      const faixaFaturamentoParam = String(q.faixaFaturamento || '').trim()
      const desfechoParam = String(q.desfecho || '').trim()
      const periodoParam = String(q.periodo || 'total').trim()
      const baseCategoriaParam = String(q.baseCategoria || q.categoria || 'todas').trim()

      // Janela temporal personalizada (YYYY-MM-DD) sobre interacoes.created —
      // helpers ÚNICOS do módulo da régua (régua de prova de operador intacta;
      // estados atuais da base não são datados).
      const janela = REGUA.parseJanela(q.data_inicial, q.data_final)

      // Construção dos filtros SQL para a tabela clientes
      // Base: ignorar clientes marcados como ativo_fora_base + categoria (módulo da régua)
      const baseFilterSql = REGUA.sqlBaseFilter(baseCategoriaParam, '')
      const conditions = [baseFilterSql]
      const bindParams = {}
      // Janela temporal: parâmetros usados pelas subconsultas sqlJanelaInteracoes
      if (janela.ativa) {
        bindParams.janelaInicio = janela.inicioIso
        bindParams.janelaFim = janela.fimIso
      }

      // Filtro de Período (calculado na meia-noite de Brasília)
      if (periodoParam === 'hoje') {
        conditions.push('updated >= {:periodoInicio}')
        bindParams.periodoInicio = REGUA.midnightBrasiliaIso(0)
      } else if (periodoParam === '7dias') {
        conditions.push('updated >= {:periodoInicio}')
        bindParams.periodoInicio = REGUA.midnightBrasiliaIso(7)
      } else if (periodoParam === '30dias') {
        conditions.push('updated >= {:periodoInicio}')
        bindParams.periodoInicio = REGUA.midnightBrasiliaIso(30)
      }

      // Condições de região/categoria — helpers ÚNICOS do módulo da régua
      REGUA.pushCondCategoria(conditions, baseCategoriaParam)
      const regiaoCondResult = REGUA.pushCondRegiao(conditions, regiaoParam, bindParams, '')

      // Filtro de Segmento
      if (segmentoParam && segmentoParam.toLowerCase() !== 'todos') {
        conditions.push('UPPER(TRIM(segmento)) = {:segParam}')
        bindParams.segParam = segmentoParam.toUpperCase()
      }

      // Filtro de Vendedor de Origem
      if (vendedorParam && vendedorParam.toLowerCase() !== 'todos') {
        conditions.push('UPPER(TRIM(vendedor)) = {:vendParam}')
        bindParams.vendParam = vendedorParam.toUpperCase()
      }

      // Filtro de Operador (atribuído ao cliente ou que atendeu)
      if (operadorParam && operadorParam.toLowerCase() !== 'todos') {
        conditions.push('operador = {:opParam}')
        bindParams.opParam = operadorParam
      }

      // Filtro de Faixa de Inatividade
      if (faixaInatividadeParam && faixaInatividadeParam.toLowerCase() !== 'todas') {
        if (faixaInatividadeParam === '60_89') {
          conditions.push('(dias_sem_faturar >= 60 AND dias_sem_faturar <= 89)')
        } else if (faixaInatividadeParam === '90_179') {
          conditions.push('(dias_sem_faturar >= 90 AND dias_sem_faturar <= 179)')
        } else if (faixaInatividadeParam === '180_365') {
          conditions.push('(dias_sem_faturar >= 180 AND dias_sem_faturar <= 365)')
        } else if (faixaInatividadeParam === '365_plus') {
          conditions.push('(dias_sem_faturar > 365)')
        } else if (faixaInatividadeParam === 'menos_60') {
          conditions.push('(dias_sem_faturar < 60)')
        }
      }

      // Filtro de Faixa de Score
      if (faixaScoreParam && faixaScoreParam.toLowerCase() !== 'todas') {
        if (faixaScoreParam === 'baixo') {
          conditions.push('(score < 30)')
        } else if (faixaScoreParam === 'medio') {
          conditions.push('(score >= 30 AND score <= 60)')
        } else if (faixaScoreParam === 'alto') {
          conditions.push('(score > 60)')
        }
      }

      // Filtro de Faixa de Faturamento Histórico (fat_12m_reais ou valor_historico)
      if (faixaFaturamentoParam && faixaFaturamentoParam.toLowerCase() !== 'todas') {
        if (faixaFaturamentoParam === 'ate_10k') {
          conditions.push('(COALESCE(fat_12m_reais, 0) <= 10000)')
        } else if (faixaFaturamentoParam === '10k_50k') {
          conditions.push(
            '(COALESCE(fat_12m_reais, 0) > 10000 AND COALESCE(fat_12m_reais, 0) <= 50000)',
          )
        } else if (faixaFaturamentoParam === '50k_150k') {
          conditions.push(
            '(COALESCE(fat_12m_reais, 0) > 50000 AND COALESCE(fat_12m_reais, 0) <= 150000)',
          )
        } else if (faixaFaturamentoParam === 'mais_150k') {
          conditions.push('(COALESCE(fat_12m_reais, 0) > 150000)')
        } else if (faixaFaturamentoParam === 'zero') {
          conditions.push('(COALESCE(fat_12m_reais, 0) = 0)')
        }
      }

      // Filtro de Desfecho (estado do cliente)
      if (desfechoParam && desfechoParam.toLowerCase() !== 'todos') {
        if (desfechoParam === 'reativado') {
          conditions.push("estado = 'reativado'")
        } else if (desfechoParam === 'reagendado') {
          conditions.push("estado = 'reagendado'")
        } else if (desfechoParam === 'venda_perdida') {
          conditions.push(
            "(estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'restricao_financeira' OR estado = 'sem_contato')",
          )
        } else if (desfechoParam === 'restricao_financeira') {
          conditions.push("estado = 'restricao_financeira'")
        } else if (desfechoParam === 'em_atendimento') {
          conditions.push("(estado = 'em_atendimento' OR estado = 'reservado')")
        } else if (desfechoParam === 'na_base') {
          conditions.push("estado = 'na_base'")
        } else if (desfechoParam === 'contatado') {
          conditions.push("estado = 'contatado'")
        }
      }

      const whereClause = conditions.join(' AND ')

      // =========================================================================
      // 1. KPIS GERAIS DA BASE FILTRADA — fórmulas ÚNICAS do módulo da régua
      // =========================================================================
      const isReativacaoRealCond = REGUA.sqlReativacaoReal('clientes.')
      const isFaturamentoCruzamentoCond = REGUA.sqlFaturamentoCruzamento('clientes.')

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
          SUM(CASE WHEN ${isReativacaoRealCond} AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado_real,
          SUM(CASE WHEN ${isReativacaoRealCond} AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas_real,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} THEN 1 ELSE 0 END) as faturamento_recente_cruzamento,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_faturamento_recente_cruzamento,
          SUM(CASE WHEN ${isFaturamentoCruzamentoCond} AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_faturamento_recente_cruzamento,
          SUM(CASE WHEN estado = 'compra_terceiros' THEN 1 ELSE 0 END) as compra_terceiros,
          SUM(CASE WHEN estado = 'nao_quer_negociar' THEN 1 ELSE 0 END) as nao_quer_negociar,
          SUM(CASE WHEN estado = 'restricao_financeira' THEN 1 ELSE 0 END) as restricao_financeira,
          SUM(CASE WHEN estado = 'sem_contato' THEN 1 ELSE 0 END) as sem_contato,
          SUM(CASE WHEN estado = 'reativado' AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado_total,
          SUM(CASE WHEN estado = 'reativado' AND COALESCE(valor_ultima_compra, 0) <= 150000 THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas_total
        FROM clientes
        WHERE ${whereClause}
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
        compra_terceiros: 0,
        nao_quer_negociar: 0,
        restricao_financeira: 0,
        sem_contato: 0,
        valor_recuperado_total: -0,
        toneladas_recuperadas_total: -0,
      })

      const qbKpi = $app.db().newQuery(kpisQuery)
      if (Object.keys(bindParams).length > 0) {
        qbKpi.bind(bindParams)
      }
      qbKpi.one(kpiModel)

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

      // Janela temporal ativa: recalcula "Reativações no período" pelo timestamp das
      // interações de reativação (interacoes.created) — helper ÚNICO da régua.
      let clientesNoPeriodo = null
      if (janela.ativa) {
        try {
          // Filtros da base (região, segmento, período, categoria) via subconsulta em clientes
          const janelaWhereExtra =
            ' AND c.id IN (SELECT id FROM clientes WHERE ' + whereClause + ')'

          const reatPeriodoQuery = `
            SELECT DISTINCT c.id as cliente_id
            FROM clientes c
            WHERE c.estado = 'reativado'
              AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)
              AND ((c.operador IS NOT NULL AND TRIM(c.operador) != '') OR (c.operador_reativacao IS NOT NULL AND TRIM(c.operador_reativacao) != ''))
              AND ${REGUA.sqlJanelaInteracoes('c.id', janela, 'i_chk')}${janelaWhereExtra}
          `

          const jRowsP = arrayOf(new DynamicModel({ cliente_id: '' }))
          const jqbP = $app.db().newQuery(reatPeriodoQuery)
          jqbP.bind(bindParams)
          jqbP.all(jRowsP)
          clientesNoPeriodo = {}
          for (let jpi = 0; jpi < jRowsP.length; jpi++) {
            const cidP = String(jRowsP[jpi].cliente_id || '')
            if (cidP) clientesNoPeriodo[cidP] = true
          }
          reativadosReaisCount = jRowsP.length
        } catch (janelaErr) {
          console.error(
            '[reports_analytics] Erro na janela temporal: ' +
              (janelaErr && janelaErr.message ? janelaErr.message : String(janelaErr)),
          )
        }
      }

      // FONTE OFICIAL DAS MÉTRICAS DE REAL EQUIPE: FICHAS DE ATENDIMENTO
      // (respostas_formulario) — agregação/cinto de segurança ÚNICOS da régua.
      const fichasPorCliente = {}
      try {
        const rfWhereClause = 'rf.cliente IN (SELECT id FROM clientes WHERE ' + whereClause + ')'

        let fichasJanelaCond = ''
        if (janela.ativa) {
          fichasJanelaCond = ' AND ' + REGUA.sqlJanelaInteracoes('c.id', janela, 'i_win')
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
          WHERE ${rfWhereClause}${fichasJanelaCond}
          ORDER BY rf.created DESC
        `

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
        if (Object.keys(bindParams).length > 0) {
          fQueryBuilder.bind(bindParams)
        }
        fQueryBuilder.all(fRows)

        const fichasAgg = REGUA.agregarFichas(fRows, '[reports_analytics]')
        for (const cid in fichasAgg.fichasPorCliente) {
          fichasPorCliente[cid] = fichasAgg.fichasPorCliente[cid]
        }
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

        if (somaValorFichas > 0 || somaTonFichas > 0) {
          valorRecuperadoReal = somaValorFichas
          toneladasRecuperadasReal = somaTonFichas
        }
      } catch (fichasErr) {
        console.log(
          '[reports_analytics] Erro ao calcular valor/ton das fichas: ' +
            (fichasErr && fichasErr.message ? fichasErr.message : String(fichasErr)),
        )
      }

      const faturamentoCruzamentoCount = Number(kpiModel.faturamento_recente_cruzamento || 0)
      const valorFaturamentoCruzamento = Number(kpiModel.valor_faturamento_recente_cruzamento || 0)
      const toneladasFaturamentoCruzamento = Number(
        kpiModel.toneladas_faturamento_recente_cruzamento || 0,
      )

      const compraTerceirosCount = Number(kpiModel.compra_terceiros || 0)
      const naoQuerNegociarCount = Number(kpiModel.nao_quer_negociar || 0)
      const restricaoFinanceiraCount = Number(kpiModel.restricao_financeira || 0)
      const semContatoCount = Number(kpiModel.sem_contato || 0)
      const valorRecuperadoTotal = Number(kpiModel.valor_recuperado_total || 0)

      const naFila = naBaseCount + reservadoCount
      // TAXA DE RECUPERAÇÃO oficial: apenas reativações reais da equipe
      const taxaReativacaoRaw = totalBase > 0 ? (reativadosReaisCount / totalBase) * 100 : 0
      const taxaReativacao =
        totalBase > 0
          ? Number(
              taxaReativacaoRaw < 1 ? taxaReativacaoRaw.toFixed(2) : taxaReativacaoRaw.toFixed(1),
            )
          : 0
      const taxaReativacaoInt = Math.round(taxaReativacao)

      // =========================================================================
      // MAPA DE VALORES E TONELADAS POR CLIENTE (FONTE OFICIAL: FICHAS DE ATENDIMENTO)
      // Com fallback no próprio cliente (valor_ultima_compra saneado) e cinto de segurança
      // =========================================================================
      const reativadosReaisQuery = `
        SELECT
          id as cliente_id,
          COALESCE(NULLIF(TRIM(segmento), ''), 'Não Informado') as seg_nome,
          ${REGUA.sqlCaseRegiao('regiao')} as reg_nome,
          ${REGUA.sqlCaseFaixaInatividade('dias_sem_faturar')} as faixa_nome,
          ${REGUA.sqlCaseScore('score')} as score_faixa,
          COALESCE(valor_ultima_compra, 0) as valor_cliente,
          COALESCE(toneladas_historico, 0) as ton_cliente
        FROM clientes
        WHERE ${whereClause} AND ${isReativacaoRealCond}${janela.ativa ? ' AND ' + REGUA.sqlJanelaInteracoes('clientes.id', janela, 'i_w2') : ''}
      `

      const reatRows = arrayOf(
        new DynamicModel({
          cliente_id: '',
          seg_nome: '',
          reg_nome: '',
          faixa_nome: '',
          score_faixa: '',
          valor_cliente: -0,
          ton_cliente: -0,
        }),
      )

      const qbReat = $app.db().newQuery(reativadosReaisQuery)
      if (Object.keys(bindParams).length > 0) qbReat.bind(bindParams)
      qbReat.all(reatRows)

      // Mapas de agregação por dimensão para reativados reais
      const reatPorSegmento = {}
      const reatPorFaixa = {}
      const reatPorScore = {}
      const reatPorRegiao = {}

      for (let ri = 0; ri < reatRows.length; ri++) {
        const row = reatRows[ri]
        const cId = String(row.cliente_id || '')
        const seg = String(row.seg_nome || 'Não Informado')
        const reg = String(row.reg_nome || 'Sem Região')
        const faixa = String(row.faixa_nome || 'Indefinida')
        const scoreF = String(row.score_faixa || 'Indefinido')

        let vCliente = Number(row.valor_cliente || 0)
        let tCliente = Number(row.ton_cliente || 0)

        // Se há ficha válida para este cliente, a ficha tem prioridade oficial
        if (fichasPorCliente && fichasPorCliente[cId]) {
          const fichaInfo = fichasPorCliente[cId]
          vCliente = fichaInfo.valor
          tCliente = fichaInfo.ton
        } else {
          // Cinto de segurança: descartar valores absurdos residuais (> 150.000 sem ficha ou ratio fora do padrão)
          if (vCliente > 150000) {
            vCliente = 0
          }
          if (vCliente > 0 && tCliente > 0 && vCliente / tCliente < 100) {
            vCliente = 0
            tCliente = 0
          }
        }

        if (!reatPorSegmento[seg]) reatPorSegmento[seg] = { valor: 0, ton: 0 }
        reatPorSegmento[seg].valor += vCliente
        reatPorSegmento[seg].ton += tCliente

        if (!reatPorFaixa[faixa]) reatPorFaixa[faixa] = { valor: 0 }
        reatPorFaixa[faixa].valor += vCliente

        if (!reatPorScore[scoreF]) reatPorScore[scoreF] = { valor: 0 }
        reatPorScore[scoreF].valor += vCliente

        if (!reatPorRegiao[reg]) reatPorRegiao[reg] = { valor: 0, ton: 0 }
        reatPorRegiao[reg].valor += vCliente
        reatPorRegiao[reg].ton += tCliente
      }

      // =========================================================================
      // 2. CRUZAMENTO 1: CONVERSÃO POR SEGMENTO (COMERCIAL)
      // =========================================================================
      const segmentoQuery = `
        SELECT
          COALESCE(NULLIF(TRIM(segmento), ''), 'Não Informado') as segmento_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'restricao_financeira' OR estado = 'sem_contato' THEN 1 ELSE 0 END) as perdidos,
          SUM(CASE WHEN estado = 'reagendado' THEN 1 ELSE 0 END) as reagendados
        FROM clientes
        WHERE ${whereClause}${janela.ativa ? ' AND ' + REGUA.sqlJanelaInteracoes('clientes.id', janela, 'i_w3') : ''}
        GROUP BY segmento_nome
        ORDER BY total_clientes DESC
      `

      const segmentoRows = arrayOf(
        new DynamicModel({
          segmento_nome: '',
          total_clientes: 0,
          reativados: 0,
          perdidos: 0,
          reagendados: 0,
        }),
      )

      const qbSeg = $app.db().newQuery(segmentoQuery)
      if (Object.keys(bindParams).length > 0) qbSeg.bind(bindParams)
      qbSeg.all(segmentoRows)

      const conversaoPorSegmento = []
      for (let i = 0; i < segmentoRows.length; i++) {
        const r = segmentoRows[i]
        const nome = String(r.segmento_nome || r.segmentoNome || 'Não Informado')
        const total = Number(r.total_clientes || r.totalClientes || 0)
        const reat = Number(r.reativados || 0)
        const segData = reatPorSegmento[nome] || { valor: 0, ton: 0 }
        const val = Number((segData.valor || 0).toFixed(2))
        const ton = Number((segData.ton || 0).toFixed(4))
        const perd = Number(r.perdidos || 0)
        const reag = Number(r.reagendados || 0)
        const taxa = total > 0 ? Math.round((reat / total) * 100) : 0
        conversaoPorSegmento.push({
          segmento: nome,
          totalClientes: total,
          reativados: reat,
          taxaConversao: taxa,
          valorRecuperado: val,
          toneladasRecuperadas: ton,
          perdidos: perd,
          reagendados: reag,
        })
      }

      // =========================================================================
      // 3. CRUZAMENTO 2: CONVERSÃO POR FAIXA DE INATIVIDADE (COMERCIAL)
      // =========================================================================
      const inatividadeQuery = `
        SELECT
          ${REGUA.sqlCaseFaixaInatividade('dias_sem_faturar')} as faixa_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'restricao_financeira' OR estado = 'sem_contato' THEN 1 ELSE 0 END) as perdidos
        FROM clientes
        WHERE ${whereClause}
        GROUP BY faixa_nome
        ORDER BY faixa_nome ASC
      `

      const inatividadeRows = arrayOf(
        new DynamicModel({
          faixa_nome: '',
          total_clientes: 0,
          reativados: 0,
          perdidos: 0,
        }),
      )

      const qbInat = $app.db().newQuery(inatividadeQuery)
      if (Object.keys(bindParams).length > 0) qbInat.bind(bindParams)
      qbInat.all(inatividadeRows)

      const conversaoPorFaixaInatividade = []
      for (let i = 0; i < inatividadeRows.length; i++) {
        const r = inatividadeRows[i]
        const nome = String(r.faixa_nome || r.faixaNome || 'Indefinida')
        const total = Number(r.total_clientes || r.totalClientes || 0)
        const reat = Number(r.reativados || 0)
        const faixaData = reatPorFaixa[nome] || { valor: 0 }
        const val = Number((faixaData.valor || 0).toFixed(2))
        const perd = Number(r.perdidos || 0)
        const taxa = total > 0 ? Math.round((reat / total) * 100) : 0
        conversaoPorFaixaInatividade.push({
          faixa: nome,
          totalClientes: total,
          reativados: reat,
          taxaConversao: taxa,
          valorRecuperado: val,
          perdidos: perd,
        })
      }

      // =========================================================================
      // 4. CRUZAMENTO 3: CONVERSÃO POR FAIXA DE SCORE VS. RESULTADO REAL (COMERCIAL)
      // =========================================================================
      const scoreQuery = `
        SELECT
          ${REGUA.sqlCaseScore('score')} as score_faixa,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados,
          AVG(COALESCE(score, 0)) as score_medio
        FROM clientes
        WHERE ${whereClause}
        GROUP BY score_faixa
        ORDER BY score_medio DESC
      `

      const scoreRows = arrayOf(
        new DynamicModel({
          score_faixa: '',
          total_clientes: 0,
          reativados: 0,
          score_medio: -0,
        }),
      )

      const qbScore = $app.db().newQuery(scoreQuery)
      if (Object.keys(bindParams).length > 0) qbScore.bind(bindParams)
      qbScore.all(scoreRows)

      const conversaoPorScore = []
      for (let i = 0; i < scoreRows.length; i++) {
        const r = scoreRows[i]
        const nome = String(r.score_faixa || r.scoreFaixa || 'Indefinido')
        const total = Number(r.total_clientes || r.totalClientes || 0)
        const reat = Number(r.reativados || 0)
        const scData = reatPorScore[nome] || { valor: 0 }
        const val = Number((scData.valor || 0).toFixed(2))
        const med = Math.round(Number(r.score_medio || 0))
        const taxa = total > 0 ? Math.round((reat / total) * 100) : 0
        conversaoPorScore.push({
          faixaScore: nome,
          scoreMedio: med,
          totalClientes: total,
          reativados: reat,
          taxaConversao: taxa,
          valorRecuperado: val,
        })
      }

      // =========================================================================
      // 5. CRUZAMENTO 4: TICKET E VALOR RECUPERADO POR REGIÃO
      // =========================================================================
      const regiaoQuery = `
        SELECT
          ${REGUA.sqlCaseRegiao('regiao')} as regiao_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados
        FROM clientes
        WHERE ${whereClause}
        GROUP BY regiao_nome
        ORDER BY reativados DESC
      `

      const regiaoRows = arrayOf(
        new DynamicModel({
          regiao_nome: '',
          total_clientes: 0,
          reativados: 0,
        }),
      )

      const qbReg = $app.db().newQuery(regiaoQuery)
      if (Object.keys(bindParams).length > 0) qbReg.bind(bindParams)
      qbReg.all(regiaoRows)

      const recuperacaoPorRegiao = []
      for (let i = 0; i < regiaoRows.length; i++) {
        const r = regiaoRows[i]
        const nome = String(r.regiao_nome || r.regiaoNome || 'Sem Região')
        const total = Number(r.total_clientes || r.totalClientes || 0)
        const reat = Number(r.reativados || 0)
        const regData = reatPorRegiao[nome] || { valor: 0, ton: 0 }
        const val = Number((regData.valor || 0).toFixed(2))
        const ton = Number((regData.ton || 0).toFixed(4))
        const ticketMedio = reat > 0 ? Math.round(val / reat) : 0
        const taxa = total > 0 ? Math.round((reat / total) * 100) : 0
        recuperacaoPorRegiao.push({
          regiao: nome,
          totalClientes: total,
          reativados: reat,
          taxaConversao: taxa,
          valorRecuperado: val,
          toneladasRecuperadas: ton,
          ticketMedio: ticketMedio,
        })
      }
      recuperacaoPorRegiao.sort(function (a, b) {
        return b.valorRecuperado - a.valorRecuperado
      })

      // =========================================================================
      // 6. CRUZAMENTO 5: TOP VENDEDORES DE ORIGEM COM CARTEIRA MAIS "MORTA"
      // (Clientes 90+ dias sem faturar que continuam 'na_base', nunca atendidos)
      // =========================================================================
      const carteiraMortaQuery = `
        SELECT
          COALESCE(NULLIF(TRIM(vendedor), ''), 'Sem Vendedor Atribuído') as vendedor_nome,
          COUNT(*) as total_carteira,
          SUM(CASE WHEN dias_sem_faturar >= 90 AND estado = 'na_base' THEN 1 ELSE 0 END) as inativos_90_na_base,
          SUM(CASE WHEN ${isReativacaoRealCond} THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'em_atendimento' OR estado = 'reservado' OR estado = 'contatado' OR estado = 'reagendado' THEN 1 ELSE 0 END) as em_trabalho
        FROM clientes
        WHERE ${whereClause}
        GROUP BY vendedor_nome
        ORDER BY inativos_90_na_base DESC
        LIMIT 25
      `

      const carteiraMortaRows = arrayOf(
        new DynamicModel({
          vendedor_nome: '',
          total_carteira: 0,
          inativos_90_na_base: 0,
          reativados: 0,
          em_trabalho: 0,
        }),
      )

      const qbMorta = $app.db().newQuery(carteiraMortaQuery)
      if (Object.keys(bindParams).length > 0) qbMorta.bind(bindParams)
      qbMorta.all(carteiraMortaRows)

      const rankingCarteiraMorta = []
      for (let i = 0; i < carteiraMortaRows.length; i++) {
        const r = carteiraMortaRows[i]
        const nome = String(r.vendedor_nome || r.vendedorNome || 'Sem Vendedor')
        const total = Number(r.total_carteira || r.totalCarteira || 0)
        const mortos = Number(r.inativos_90_na_base || 0)
        const reat = Number(r.reativados || 0)
        const trab = Number(r.em_trabalho || 0)
        const percMorto = total > 0 ? Math.round((mortos / total) * 100) : 0
        rankingCarteiraMorta.push({
          vendedor: nome,
          totalCarteira: total,
          inativos90NaBase: mortos,
          percentualMorto: percMorto,
          reativados: reat,
          emTrabalho: trab,
        })
      }

      // =========================================================================
      // 7. LISTA DE VALORES ÚNICOS PARA OS SELECTS DE FILTRO
      // =========================================================================
      const segmentosListQuery = `
        SELECT DISTINCT TRIM(segmento) as seg
        FROM clientes
        WHERE segmento IS NOT NULL AND TRIM(segmento) != ''
        ORDER BY seg ASC
      `
      const segRows = arrayOf(new DynamicModel({ seg: '' }))
      $app.db().newQuery(segmentosListQuery).all(segRows)
      const opcoesSegmentos = []
      for (let i = 0; i < segRows.length; i++) {
        if (segRows[i].seg) opcoesSegmentos.push(segRows[i].seg)
      }

      const vendedoresListQuery = `
        SELECT DISTINCT TRIM(vendedor) as vend
        FROM clientes
        WHERE vendedor IS NOT NULL AND TRIM(vendedor) != ''
        ORDER BY vend ASC
        LIMIT 100
      `
      const vendRows = arrayOf(new DynamicModel({ vend: '' }))
      $app.db().newQuery(vendedoresListQuery).all(vendRows)
      const opcoesVendedores = []
      for (let i = 0; i < vendRows.length; i++) {
        if (vendRows[i].vend) opcoesVendedores.push(vendRows[i].vend)
      }

      return e.json(200, {
        kpis: {
          totalBase: totalBase,
          naFila: naFila,
          reativados: reativadosReaisCount,
          reativadosReais: reativadosReaisCount,
          taxaReativacao: taxaReativacaoInt,
          taxaReativacaoFloat: taxaReativacao,
          valorRecuperado: valorRecuperadoReal,
          toneladasRecuperadas: toneladasRecuperadasReal,
          faturamentoRecenteCruzamento: faturamentoCruzamentoCount,
          valorFaturamentoCruzamento: valorFaturamentoCruzamento,
          toneladasFaturamentoCruzamento: toneladasFaturamentoCruzamento,
          reativadosTotalBruto: reativadoTotalCount,
          valorRecuperadoTotalBruto: valorRecuperadoTotal,
        },
        estadosContagem: {
          na_base: naBaseCount,
          em_atendimento: emAtendimentoCount + reservadoCount,
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
        cruzamentos: {
          conversaoPorSegmento: conversaoPorSegmento,
          conversaoPorFaixaInatividade: conversaoPorFaixaInatividade,
          conversaoPorScore: conversaoPorScore,
          recuperacaoPorRegiao: recuperacaoPorRegiao,
          rankingCarteiraMorta: rankingCarteiraMorta,
        },
        opcoesFiltros: {
          segmentos: opcoesSegmentos,
          vendedores: opcoesVendedores,
        },
        regua: { versao: 'M1', janelaTemporal: janela.ativa },
      })
    } catch (err) {
      console.log(
        '[reports_analytics] Erro geral: ' + (err && err.message ? err.message : String(err)),
      )
      return e.json(500, {
        error:
          'Erro interno ao processar analytics dos relatórios: ' +
          (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
