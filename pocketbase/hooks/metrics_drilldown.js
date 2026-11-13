/// <reference path="../pb_data/types.d.ts" />

// metrics_drilldown.js — /backend/v1/metrics/drilldown
// Endpoint de drill-down de clientes para os cards e KPIs do Dashboard.
// Devolve a lista de clientes com nome, código, região, operador, valor,
// tonelagem em kg, data do evento e desfecho quando aplicável.
// Respeita estritamente o isolamento do runtime Goja (funções inline).

routerAdd(
  'GET',
  '/backend/v1/metrics/drilldown',
  (e) => {
    try {
      const tipo = String(e.request.url.query().get('tipo') || '')
        .trim()
        .toLowerCase()
      const regiao = String(e.request.url.query().get('regiao') || '').trim()
      const baseCategoriaParam = String(
        e.request.url.query().get('base_categoria') || 'todas',
      ).trim()
      const dataInicial = String(e.request.url.query().get('data_inicial') || '').trim()
      const dataFinal = String(e.request.url.query().get('data_final') || '').trim()
      const desfechoFiltro = String(e.request.url.query().get('desfecho') || '').trim()
      const canalFiltro = String(e.request.url.query().get('canal') || '')
        .trim()
        .toLowerCase()

      const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

      const REGIAO_GRUPOS = [
        ['BRAGANÇA', ['BRAGANÇA', 'BRAGANCA', 'BRAGANÇA PAULISTA', 'BRAGANCA PAULISTA']],
        ['CAMBUÍ', ['CAMBUÍ', 'CAMBUI', 'MICRO-REGIÃO', 'MICRO REGIAO', 'MICROREGIAO']],
        [
          'POÇOS DE CALDAS',
          ['POÇOS DE CALDAS', 'POCOS DE CALDAS', 'POÇOS CALDAS', 'POCOS CALDAS', 'POÇOS', 'POCOS'],
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

      function sqlRegiao(regParam, pfx, bindParams) {
        const p = pfx || ''
        const reg = String(regParam || '').trim()
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

      function sqlCategoria(catParam, pfx) {
        const p = pfx || ''
        const cat = String(catParam || 'todas').trim()
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

      function sqlBaseFilter(catParam, pfx) {
        const p = pfx || ''
        return (
          p +
          "estado != 'ativo_fora_base' AND (" +
          p +
          'ativo_fora_base IS NULL OR ' +
          p +
          'ativo_fora_base = 0) AND (' +
          sqlCategoria(catParam, p) +
          ')'
        )
      }

      function parseJanela(di, df) {
        const sDi = String(di || '').trim()
        const sDf = String(df || '').trim()
        const res = { ativa: false, inicioIso: '', fimIso: '' }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sDi) || !/^\d{4}-\d{2}-\d{2}$/.test(sDf)) return res
        const pF = sDf.split('-')
        res.ativa = true
        res.inicioIso = sDi + ' 03:00:00.000Z'
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

      function sqlExisteInteracaoReativacaoComOperador(refCliente, iAlias) {
        const I = iAlias || 'i_chk2'
        return (
          'EXISTS (SELECT 1 FROM interacoes ' +
          I +
          ' WHERE ' +
          I +
          '.cliente = ' +
          refCliente +
          ' AND ' +
          I +
          '.desfecho IN ' +
          DESFECHOS_REATIVACAO +
          ' AND ' +
          I +
          '.operador IS NOT NULL AND TRIM(' +
          I +
          ".operador) != '')"
        )
      }

      function sqlReativacaoReal(pfx) {
        const p = pfx || ''
        const ref = p ? p + 'id' : 'clientes.id'
        return (
          '(' +
          p +
          "estado = 'reativado' AND ((" +
          p +
          'operador_reativacao IS NOT NULL AND TRIM(' +
          p +
          "operador_reativacao) != '') OR " +
          sqlExisteInteracaoReativacaoComOperador(ref) +
          ') AND ' +
          sqlExisteInteracaoReativacao(ref) +
          ')'
        )
      }

      function sqlFaturamentoCruzamento(pfx) {
        const p = pfx || ''
        return (
          '(' +
          p +
          "estado = 'reativado' AND (" +
          p +
          'operador_reativacao IS NULL OR TRIM(' +
          p +
          "operador_reativacao) = '') AND NOT " +
          sqlReativacaoReal(pfx) +
          ')'
        )
      }

      const janela = parseJanela(dataInicial, dataFinal)
      const params = {}
      const baseFilterSql = sqlBaseFilter(baseCategoriaParam, 'c.')
      const regiaoCondition = sqlRegiao(regiao, 'c.', params)

      let sql = ''
      const items = []

      // Roteamento de acordo com o tipo de métrica
      if (tipo === 'reativados' || tipo === 'reativados_real_equipe') {
        const reatCond = sqlReativacaoReal('c.')
        let janelaCond = '1=1'
        if (janela.ativa) {
          janelaCond =
            'EXISTS (SELECT 1 FROM interacoes i_win WHERE i_win.cliente = c.id AND i_win.created >= {:janelaInicio} AND i_win.created <= {:janelaFim} AND (i_win.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            " OR (i_win.numero_pedido IS NOT NULL AND TRIM(i_win.numero_pedido) != '' AND TRIM(i_win.numero_pedido) != '-')))"
          params.janelaInicio = janela.inicioIso
          params.janelaFim = janela.fimIso
        }

        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(NULLIF(TRIM(c.operador_reativacao), ''), c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.updated as data_evento,
            '' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND ${reatCond} AND ${janelaCond}
          ORDER BY c.updated DESC
          LIMIT 500
        `
      } else if (tipo === 'pedidos_em_aberto') {
        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(NULLIF(TRIM(c.operador_reativacao), ''), c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.updated as data_evento,
            'pedido_em_aberto' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND c.pedido_em_aberto = 1
          ORDER BY c.updated DESC
          LIMIT 500
        `
      } else if (tipo === 'faturamento_cruzamento') {
        const cruzamentoCond = sqlFaturamentoCruzamento('c.')
        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.updated as data_evento,
            'faturamento_cruzamento' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND ${cruzamentoCond}
          ORDER BY c.updated DESC
          LIMIT 500
        `
      } else if (tipo === 'total_base') {
        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.created as data_evento,
            '' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition}
          ORDER BY c.score DESC, c.nome ASC
          LIMIT 500
        `
      } else if (tipo === 'na_fila') {
        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.updated as data_evento,
            '' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND c.estado IN ('na_base', 'reservado')
          ORDER BY c.score DESC, c.dias_sem_faturar ASC
          LIMIT 500
        `
      } else if (
        tipo === 'atendidos' ||
        tipo === 'total_atendimentos' ||
        tipo === 'ligacoes' ||
        tipo === 'ligacao' ||
        tipo === 'whatsapp' ||
        tipo === 'email' ||
        tipo === 'conversoes' ||
        tipo === 'reagendados' ||
        tipo === 'vendas_perdidas' ||
        tipo === 'desfecho'
      ) {
        // Consultas baseadas nas interações do período
        let iWhere = '1=1'
        if (janela.ativa) {
          iWhere += ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}'
          params.janelaInicio = janela.inicioIso
          params.janelaFim = janela.fimIso
        }

        if (tipo === 'ligacoes' || tipo === 'ligacao') {
          iWhere += " AND i.tipo = 'ligacao'"
        } else if (tipo === 'whatsapp') {
          iWhere += " AND i.tipo = 'whatsapp'"
        } else if (tipo === 'email') {
          iWhere += " AND i.tipo = 'email'"
        } else if (tipo === 'conversoes') {
          iWhere +=
            ' AND (i.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            " OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-'))"
        } else if (tipo === 'reagendados') {
          iWhere +=
            " AND (i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != ''))"
        } else if (tipo === 'vendas_perdidas') {
          iWhere +=
            " AND i.desfecho IN ('compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato', 'venda_perdida')"
        } else if (tipo === 'desfecho') {
          if (desfechoFiltro) {
            params.desfechoFiltro = desfechoFiltro
            iWhere += ' AND i.desfecho = {:desfechoFiltro}'
          }
        }

        if (canalFiltro) {
          params.canalFiltro = canalFiltro
          iWhere += ' AND i.tipo = {:canalFiltro}'
        }

        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(u.name, i.operador, c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            i.created as data_evento,
            COALESCE(i.desfecho, '') as desfecho,
            COALESCE(i.tipo, '') as canal
          FROM interacoes i
          INNER JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE ${baseFilterSql} ${regiaoCondition} AND ${iWhere}
          ORDER BY i.created DESC
          LIMIT 500
        `
      } else if (tipo === 'followups_hoje') {
        // Follow-ups programados para hoje
        const brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
        const ano = brt.getUTCFullYear()
        const mes = String(brt.getUTCMonth() + 1).padStart(2, '0')
        const dia = String(brt.getUTCDate()).padStart(2, '0')
        const dataHojeStr = `${ano}-${mes}-${dia}`
        params.dataHojePrefix = `${dataHojeStr}%`

        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.reagendado_para as data_evento,
            'reagendado' as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND (c.reagendado_para LIKE {:dataHojePrefix})
          ORDER BY c.reagendado_para ASC
          LIMIT 500
        `
      } else {
        // Fallback genérico para clientes por estado
        params.tipoEstado = tipo
        sql = `
          SELECT
            c.id as id,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(c.operador, '') as operador,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as toneladas,
            c.estado as estado,
            c.updated as data_evento,
            c.estado as desfecho,
            '' as canal
          FROM clientes c
          WHERE ${baseFilterSql} ${regiaoCondition} AND c.estado = {:tipoEstado}
          ORDER BY c.updated DESC
          LIMIT 500
        `
      }

      const rows = arrayOf(
        new DynamicModel({
          id: '',
          codigo: '',
          nome: '',
          regiao: '',
          operador: '',
          valor: -0,
          toneladas: -0,
          estado: '',
          data_evento: '',
          desfecho: '',
          canal: '',
        }),
      )

      const qb = $app.db().newQuery(sql)
      if (Object.keys(params).length > 0) {
        qb.bind(params)
      }
      qb.all(rows)

      // Também buscar fichas de atendimento para enriquecer valor/toneladas reais caso seja reativados
      const clienteIdsMap = {}
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const cid = String(r.id || '')
        if (cid) clienteIdsMap[cid] = i
        items.push({
          id: cid,
          codigo: String(r.codigo || ''),
          nome: String(r.nome || 'Cliente não identificado'),
          regiao: String(r.regiao || 'Sem Região'),
          operador: String(r.operador || '—'),
          valor: Number(r.valor || 0),
          toneladas: Number(r.toneladas || 0), // valor bruto em kg canônico
          estado: String(r.estado || ''),
          data_evento: String(r.data_evento || ''),
          desfecho: String(r.desfecho || ''),
          canal: String(r.canal || ''),
        })
      }

      // Se for reativados ou conversoes, buscar potenciais da ficha mais recente para cada cliente
      if (
        (tipo === 'reativados' ||
          tipo === 'reativados_real_equipe' ||
          tipo === 'pedidos_em_aberto') &&
        items.length > 0
      ) {
        try {
          const idsList = Object.keys(clienteIdsMap)
          if (idsList.length > 0) {
            // Dividir em pedaços se necessário ou consultar fichas
            const inClause = idsList.map((id) => `'${id}'`).join(', ')
            const fichasRows = arrayOf(
              new DynamicModel({
                cliente: '',
                valor_potencial: -0,
                toneladas_potencial: -0,
                numero_pedido: '',
              }),
            )
            const fSql = `
              SELECT
                rf.cliente as cliente,
                COALESCE(rf.valor_potencial, 0) as valor_potencial,
                COALESCE(rf.toneladas_potencial, 0) as toneladas_potencial,
                COALESCE(rf.numero_pedido, '') as numero_pedido
              FROM respostas_formulario rf
              WHERE rf.cliente IN (${inClause})
              ORDER BY rf.created DESC
            `
            $app.db().newQuery(fSql).all(fichasRows)
            const visto = {}
            for (let f = 0; f < fichasRows.length; f++) {
              const fr = fichasRows[f]
              const cId = String(fr.cliente || '')
              if (cId && !visto[cId]) {
                visto[cId] = true
                const idx = clienteIdsMap[cId]
                if (idx !== undefined && items[idx]) {
                  const valPot = Number(fr.valor_potencial || 0)
                  const tonPot = Number(fr.toneladas_potencial || 0)
                  if (valPot > 0) items[idx].valor = valPot
                  if (tonPot > 0) items[idx].toneladas = tonPot
                  if (fr.numero_pedido) items[idx].numero_pedido = String(fr.numero_pedido)
                }
              }
            }
          }
        } catch (fErr) {
          console.warn('[metrics_drilldown] Aviso ao enriquecer fichas: ' + String(fErr))
        }
      }

      return e.json(200, {
        tipo: tipo,
        total: items.length,
        items: items,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[metrics_drilldown] Erro: ' + errMsg)
      return e.json(500, {
        error: 'Erro ao gerar drill-down: ' + errMsg,
      })
    }
  },
  $apis.requireAuth(),
)
