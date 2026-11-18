/// <reference path="../pb_data/types.d.ts" />

// auditoria_peso.js — GET /backend/v1/metrics/auditoria-peso
// Ferramenta de AUDITORIA de peso (somente ADMIN): lista clientes reativados
// (mesma régua do card "Clientes Reativados Real Equipe") com valor faturado,
// peso em kg (toneladas_historico, fallback peso_nf_tonelagem × 1000) e origem
// do peso. NÃO corrige nada — a correção é feita linha a linha pelo admin via
// POST /backend/v1/queue/editar-peso-admin (ver editar_peso_admin.js).
// NOTA Goja: funções auxiliares INLINE dentro do callback (regra do projeto).

routerAdd('GET', '/backend/v1/metrics/auditoria-peso', (e) => {
  const authRecord = e.auth
  if (!authRecord || !authRecord.id) {
    return e.json(401, { error: 'Autenticação necessária.' })
  }
  if (authRecord.getString('role') !== 'admin') {
    return e.json(403, { error: 'Apenas administradores podem acessar a auditoria de peso.' })
  }

  try {
    const regiao = String(e.request.url.query().get('regiao') || '').trim()
    const baseCategoriaParam = String(e.request.url.query().get('base_categoria') || 'todas').trim()
    const dataInicial = String(e.request.url.query().get('data_inicial') || '').trim()
    const dataFinal = String(e.request.url.query().get('data_final') || '').trim()

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
      if (cat === 'repescagem') return '(' + colRegiao + " = 'REPESCAGEM' OR " + colDias + ' >= 90)'
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

    const janela = parseJanela(dataInicial, dataFinal)
    const params = {}
    const baseFilterSql = sqlBaseFilter(baseCategoriaParam, 'c.')
    const regiaoCondition = sqlRegiao(regiao, 'c.', params)

    let janelaCond = '1=1'
    if (janela.ativa) {
      janelaCond =
        'EXISTS (SELECT 1 FROM interacoes i_win WHERE i_win.cliente = c.id AND i_win.created >= {:janelaInicio} AND i_win.created <= {:janelaFim} AND (i_win.desfecho IN ' +
        DESFECHOS_REATIVACAO +
        " OR (i_win.numero_pedido IS NOT NULL AND TRIM(i_win.numero_pedido) != '' AND TRIM(i_win.numero_pedido) != '-')))"
      params.janelaInicio = janela.inicioIso
      params.janelaFim = janela.fimIso
    }

    // Mesma régua das métricas: ERP vence — peso kg = toneladas_historico,
    // fallback peso_nf_tonelagem × 1000. Origem indica de onde veio o kg.
    const sql = `
      SELECT
        c.id as id,
        c.codigo as codigo,
        c.nome as nome,
        c.regiao as regiao,
        COALESCE(NULLIF(TRIM(c.operador_reativacao), ''), c.operador, '') as operador,
        COALESCE(c.valor_ultima_compra, 0) as valor,
        CASE
          WHEN COALESCE(c.toneladas_historico, 0) != 0 THEN c.toneladas_historico
          WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000
          ELSE 0
        END as peso_kg,
        CASE
          WHEN COALESCE(c.toneladas_historico, 0) != 0 THEN 'esteira_erp'
          WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN 'nf_erp'
          ELSE 'ausente'
        END as origem,
        COALESCE(c.peso_nf_tonelagem, 0) as peso_nf_tonelagem
      FROM clientes c
      WHERE ${baseFilterSql} ${regiaoCondition} AND ${sqlReativacaoReal('c.')} AND ${janelaCond}
      ORDER BY c.updated DESC
      LIMIT 1000
    `

    // Ajuste fino da origem: edição manual do admin (auditoria em eventos_log)
    // aparece como 'manual_admin' — o ERP (esteira) continua vencendo o VALOR,
    // mas o admin sabe que aquele kg passou por uma mão humana.
    const idsManuais = {}
    try {
      const rowsManuais = arrayOf(new DynamicModel({ cliente: '' }))
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT cliente as cliente FROM eventos_log WHERE acao = 'edicao_peso_admin'",
        )
        .all(rowsManuais)
      for (let m = 0; m < rowsManuais.length; m++) {
        if (rowsManuais[m].cliente) idsManuais[rowsManuais[m].cliente] = true
      }
    } catch (manErr) {
      console.log('[auditoria_peso] Aviso ao ler eventos_log (origem manual): ' + manErr.message)
    }

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        codigo: '',
        nome: '',
        regiao: '',
        operador: '',
        valor: -0,
        peso_kg: -0,
        origem: '',
        peso_nf_tonelagem: -0,
      }),
    )
    $app.db().newQuery(sql).bind(params).all(rows)

    const itens = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      itens.push({
        id: r.id,
        codigo: r.codigo,
        nome: r.nome,
        regiao: r.regiao,
        operador: r.operador || '(sem operador)',
        valor: Number(r.valor) || 0,
        peso_kg: Number(r.peso_kg) || 0,
        origem: r.origem || 'ausente',
        peso_nf_tonelagem: Number(r.peso_nf_tonelagem) || 0,
      })
    }

    // Peso tocado manualmente pelo admin sobrescreve a origem exibida
    // (a esteira ERP continua vencendo o VALOR na régua das métricas)
    for (let j = 0; j < itens.length; j++) {
      if (idsManuais[itens[j].id] && itens[j].origem !== 'ausente') {
        itens[j].origem = 'manual_admin'
      }
    }

    return e.json(200, { itens: itens, total: itens.length })
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err)
    console.error('[auditoria_peso] Erro: ' + errMsg)
    return e.json(500, { error: 'Erro ao carregar auditoria de peso: ' + errMsg })
  }
})
