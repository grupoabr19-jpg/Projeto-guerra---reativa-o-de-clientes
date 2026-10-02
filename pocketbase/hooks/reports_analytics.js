/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/backend/v1/metrics/reports-analytics',
  (e) => {
    try {
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

      // Construção dos filtros SQL para a tabela clientes
      // Base: ignorar clientes marcados como ativo_fora_base
      const baseFilterSql =
        "estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0)"
      const conditions = [baseFilterSql]
      const bindParams = {}

      // Filtro de Bases Especiais / Categorias (Item 6)
      if (baseCategoriaParam === 'cliente_final') {
        conditions.push("base_categoria = 'cliente_final'")
      } else if (baseCategoriaParam === 'atacado_fora_mapa') {
        conditions.push("base_categoria = 'atacado_fora_mapa'")
      } else if (baseCategoriaParam === 'sem_dono') {
        conditions.push('(sem_dono_equipe = 1 OR sem_dono_equipe = true)')
      } else if (baseCategoriaParam === 'repescagem') {
        conditions.push("(regiao = 'REPESCAGEM' OR dias_sem_faturar >= 90)")
      } else if (baseCategoriaParam === 'todas') {
        // Todas as categorias mantendo fora apenas duplicados e ativo_fora_base
      } else {
        // Padrão: base 'normal'
        conditions.push(
          "(base_categoria IS NULL OR base_categoria = '' OR base_categoria = 'normal')",
        )
      }

      // Filtro de Região
      if (regiaoParam && regiaoParam.toLowerCase() !== 'todas') {
        const upper = regiaoParam.toUpperCase()
        if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
          conditions.push(
            "(regiao = '' OR regiao IS NULL OR UPPER(TRIM(regiao)) = 'SEM REGIÃO' OR UPPER(TRIM(regiao)) = 'SEM REGIAO')",
          )
        } else if (
          upper === 'BRAGANÇA' ||
          upper === 'BRAGANCA' ||
          upper === 'BRAGANÇA PAULISTA' ||
          upper === 'BRAGANCA PAULISTA'
        ) {
          conditions.push(
            "(UPPER(TRIM(regiao)) = 'BRAGANÇA' OR UPPER(TRIM(regiao)) = 'BRAGANCA' OR UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA')",
          )
        } else if (
          upper === 'CAMBUÍ' ||
          upper === 'CAMBUI' ||
          upper === 'MICRO-REGIÃO' ||
          upper === 'MICRO REGIAO'
        ) {
          conditions.push(
            "(UPPER(TRIM(regiao)) = 'CAMBUÍ' OR UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO')",
          )
        } else if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS'
        ) {
          conditions.push(
            "(UPPER(TRIM(regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS')",
          )
        } else if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
          conditions.push("(UPPER(TRIM(regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(regiao)) = 'JUNDIAI')")
        } else if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
          conditions.push("(UPPER(TRIM(regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(regiao)) = 'ITAJUBA')")
        } else if (upper === 'VARGINHA') {
          conditions.push("UPPER(TRIM(regiao)) = 'VARGINHA'")
        } else if (upper === 'POUSO ALEGRE') {
          conditions.push("UPPER(TRIM(regiao)) = 'POUSO ALEGRE'")
        } else if (upper === 'EXTREMA') {
          conditions.push("UPPER(TRIM(regiao)) = 'EXTREMA'")
        } else if (upper === 'ATACADO') {
          conditions.push("UPPER(TRIM(regiao)) = 'ATACADO'")
        } else if (upper === 'REPESCAGEM') {
          conditions.push("UPPER(TRIM(regiao)) = 'REPESCAGEM'")
        } else {
          conditions.push(
            '(UPPER(TRIM(regiao)) = {:regiaoParam} OR UPPER(TRIM(regiao)) LIKE {:regiaoLike})',
          )
          bindParams.regiaoParam = upper
          bindParams.regiaoLike = '%' + upper + '%'
        }
      }

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
            "(estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'sem_contato')",
          )
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
      // 1. KPIS GERAIS DA BASE FILTRADA
      // =========================================================================
      // Condição que define uma REATIVAÇÃO REAL DA EQUIPE:
      // Cliente com estado 'reativado' QUE teve atendimento por operador e/ou pedido registrado
      const isReativacaoRealCond =
        "(estado = 'reativado' AND ((operador IS NOT NULL AND TRIM(operador) != '') OR (pedido_reativacao IS NOT NULL AND TRIM(pedido_reativacao) != '')))"

      // Condição que define CLIENTES COM FATURAMENTO RECENTE DETECTADOS NO CRUZAMENTO (sem atendimento de operador)
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
          SUM(CASE WHEN estado = 'compra_terceiros' THEN 1 ELSE 0 END) as compra_terceiros,
          SUM(CASE WHEN estado = 'nao_quer_negociar' THEN 1 ELSE 0 END) as nao_quer_negociar,
          SUM(CASE WHEN estado = 'sem_contato' THEN 1 ELSE 0 END) as sem_contato,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado_total,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas_total
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
        sem_contato: 0,
        valor_recuperado_total: -0,
        toneladas_recuperadas_total: -0,
      })

      const qbKpi = $app.db().newQuery(kpisQuery)
      if (Object.keys(bindParams).length > 0) {
        qbKpi.bind(bindParams)
      }
      qbKpi.one(kpiModel)

      const totalBase = Number(
        kpiModel.total_base !== undefined ? kpiModel.total_base : kpiModel.totalBase || 0,
      )
      const naBaseCount = Number(
        kpiModel.na_base !== undefined ? kpiModel.na_base : kpiModel.naBase || 0,
      )
      const reservadoCount = Number(kpiModel.reservado || 0)
      const emAtendimentoCount = Number(
        kpiModel.em_atendimento !== undefined
          ? kpiModel.em_atendimento
          : kpiModel.emAtendimento || 0,
      )
      const reagendadoCount = Number(kpiModel.reagendado || 0)
      const contatadoCount = Number(kpiModel.contatado || 0)
      const reativadoTotalCount = Number(kpiModel.reativado || 0)

      const reativadosReaisCount = Number(
        kpiModel.reativados_reais !== undefined
          ? kpiModel.reativados_reais
          : kpiModel.reativadosReais || 0,
      )
      const valorRecuperadoReal = Number(
        kpiModel.valor_recuperado_real !== undefined
          ? kpiModel.valor_recuperado_real
          : kpiModel.valorRecuperadoReal || 0,
      )
      const toneladasRecuperadasReal = Number(
        kpiModel.toneladas_recuperadas_real !== undefined
          ? kpiModel.toneladas_recuperadas_real
          : kpiModel.toneladasRecuperadasReal || 0,
      )

      const faturamentoCruzamentoCount = Number(
        kpiModel.faturamento_recente_cruzamento !== undefined
          ? kpiModel.faturamento_recente_cruzamento
          : kpiModel.faturamentoRecenteCruzamento || 0,
      )
      const valorFaturamentoCruzamento = Number(
        kpiModel.valor_faturamento_recente_cruzamento !== undefined
          ? kpiModel.valor_faturamento_recente_cruzamento
          : kpiModel.valorFaturamentoRecenteCruzamento || 0,
      )
      const toneladasFaturamentoCruzamento = Number(
        kpiModel.toneladas_faturamento_recente_cruzamento !== undefined
          ? kpiModel.toneladas_faturamento_recente_cruzamento
          : kpiModel.toneladasFaturamentoRecenteCruzamento || 0,
      )

      const compraTerceirosCount = Number(
        kpiModel.compra_terceiros !== undefined
          ? kpiModel.compra_terceiros
          : kpiModel.compraTerceiros || 0,
      )
      const naoQuerNegociarCount = Number(
        kpiModel.nao_quer_negociar !== undefined
          ? kpiModel.nao_quer_negociar
          : kpiModel.naoQuerNegociar || 0,
      )
      const semContatoCount = Number(
        kpiModel.sem_contato !== undefined ? kpiModel.sem_contato : kpiModel.semContato || 0,
      )
      const valorRecuperadoTotal = Number(
        kpiModel.valor_recuperado_total !== undefined
          ? kpiModel.valor_recuperado_total
          : kpiModel.valorRecuperadoTotal || 0,
      )

      const naFila = naBaseCount + reservadoCount
      // TAXA DE RECUPERAÇÃO oficial: apenas reativações reais da equipe
      const taxaReativacao =
        totalBase > 0 ? Number(((reativadosReaisCount / totalBase) * 100).toFixed(1)) : 0
      const taxaReativacaoInt = Math.round(taxaReativacao)

      // =========================================================================
      // 2. CRUZAMENTO 1: CONVERSÃO POR SEGMENTO (COMERCIAL)
      // =========================================================================
      const segmentoQuery = `
        SELECT
          COALESCE(NULLIF(TRIM(segmento), ''), 'Não Informado') as segmento_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas,
          SUM(CASE WHEN estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'sem_contato' THEN 1 ELSE 0 END) as perdidos,
          SUM(CASE WHEN estado = 'reagendado' THEN 1 ELSE 0 END) as reagendados
        FROM clientes
        WHERE ${whereClause}
        GROUP BY segmento_nome
        ORDER BY total_clientes DESC
      `

      const segmentoRows = arrayOf(
        new DynamicModel({
          segmento_nome: '',
          total_clientes: 0,
          reativados: 0,
          valor_recuperado: -0,
          toneladas_recuperadas: -0,
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
        const val = Number(
          r.valor_recuperado !== undefined ? r.valor_recuperado : r.valorRecuperado || 0,
        )
        const ton = Number(
          r.toneladas_recuperadas !== undefined
            ? r.toneladas_recuperadas
            : r.toneladasRecuperadas || 0,
        )
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
          CASE
            WHEN dias_sem_faturar < 60 THEN '1. Menos de 60 dias'
            WHEN dias_sem_faturar >= 60 AND dias_sem_faturar <= 89 THEN '2. 60 a 89 dias (Fila Prioritária)'
            WHEN dias_sem_faturar >= 90 AND dias_sem_faturar <= 179 THEN '3. 90 a 179 dias (Repescagem)'
            WHEN dias_sem_faturar >= 180 AND dias_sem_faturar <= 365 THEN '4. 180 a 365 dias'
            ELSE '5. Mais de 365 dias (Inatividade Severa)'
          END as faixa_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
          SUM(CASE WHEN estado = 'compra_terceiros' OR estado = 'nao_quer_negociar' OR estado = 'sem_contato' THEN 1 ELSE 0 END) as perdidos
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
          valor_recuperado: -0,
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
        const val = Number(
          r.valor_recuperado !== undefined ? r.valor_recuperado : r.valorRecuperado || 0,
        )
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
          CASE
            WHEN score < 30 THEN 'Score Baixo (0-29)'
            WHEN score >= 30 AND score <= 60 THEN 'Score Médio (30-60)'
            ELSE 'Score Alto (61-100)'
          END as score_faixa,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
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
          valor_recuperado: -0,
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
        const val = Number(
          r.valor_recuperado !== undefined ? r.valor_recuperado : r.valorRecuperado || 0,
        )
        const med = Math.round(
          Number(r.score_medio !== undefined ? r.score_medio : r.scoreMedio || 0),
        )
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
          CASE
            WHEN regiao IS NULL OR TRIM(regiao) = '' THEN 'Sem Região'
            WHEN UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA' THEN 'BRAGANÇA'
            WHEN UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO' THEN 'CAMBUÍ'
            WHEN UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS' THEN 'POÇOS DE CALDAS'
            WHEN UPPER(TRIM(regiao)) = 'JUNDIAI' THEN 'JUNDIAÍ'
            WHEN UPPER(TRIM(regiao)) = 'ITAJUBA' THEN 'ITAJUBÁ'
            ELSE UPPER(TRIM(regiao))
          END as regiao_nome,
          COUNT(*) as total_clientes,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativados,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
          SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas
        FROM clientes
        WHERE ${whereClause}
        GROUP BY regiao_nome
        ORDER BY valor_recuperado DESC
      `

      const regiaoRows = arrayOf(
        new DynamicModel({
          regiao_nome: '',
          total_clientes: 0,
          reativados: 0,
          valor_recuperado: -0,
          toneladas_recuperadas: -0,
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
        const val = Number(
          r.valor_recuperado !== undefined ? r.valor_recuperado : r.valorRecuperado || 0,
        )
        const ton = Number(
          r.toneladas_recuperadas !== undefined
            ? r.toneladas_recuperadas
            : r.toneladasRecuperadas || 0,
        )
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

      // =========================================================================
      // 6. CRUZAMENTO 5: TOP VENDEDORES DE ORIGEM COM CARTEIRA MAIS "MORTA"
      // (Clientes 90+ dias sem faturar que continuam 'na_base', nunca atendidos)
      // =========================================================================
      const carteiraMortaQuery = `
        SELECT
          COALESCE(NULLIF(TRIM(vendedor), ''), 'Sem Vendedor Atribuído') as vendedor_nome,
          COUNT(*) as total_carteira,
          SUM(CASE WHEN dias_sem_faturar >= 90 AND estado = 'na_base' THEN 1 ELSE 0 END) as inativos_90_na_base,
          SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativados,
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
        const mortos = Number(
          r.inativos_90_na_base !== undefined ? r.inativos_90_na_base : r.inativos90NaBase || 0,
        )
        const reat = Number(r.reativados || 0)
        const trab = Number(r.em_trabalho !== undefined ? r.em_trabalho : r.emTrabalho || 0)
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
