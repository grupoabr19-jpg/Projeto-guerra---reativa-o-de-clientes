// pocketbase/hooks/regua_metricas.js
// ============================================================
// RÉGUA ÚNICA DE MÉTRICAS (M1) — FONTE ÚNICA DE TODAS AS FÓRMULAS
// ============================================================
// ATENÇÃO: neste runtime (Goja) este arquivo NÃO é usado via require():
// os hooks (metrics_base_kpis, reports_analytics, reports_export) carregam
// as fórmulas EMBUTIDAS (inline) — padrão obrigatório, "Invalid module" se
// chamar require() de módulo local. Manter este arquivo como REFERÊNCIA
// canônica das fórmulas, e replicar qualquer correção aqui nos hooks.
//
// Consumo hipotético via require() DENTRO do callback de cada hook (Goja não
// compartilha escopo top-level entre hooks; arquivo .js sem routerAdd
// não é autoloadado, só carregado sob demanda).
//
// Fórmulas oficiais centralizadas aqui (nenhum hook pode redefini-las):
// - REATIVAÇÃO OFICIAL (Real Equipe da régua): cliente com estado 'reativado'
//   E prova de operador real (operador OU operador_reativacao preenchidos —
//   NUNCA o campo "operador" sozinho) E atendimento real correspondente em
//   interacoes (desfecho de reativação ou pedido válido).
// - FATURAMENTO DO CRUZAMENTO ERP (métrica separada, rotulada): cliente
//   'reativado' SEM atendimento da equipe — veio do cruzamento de dados.
// - REAL EQUIPE COM PEDIDO/NF: subconjunto da reativação oficial com
//   pedido confirmado (pedido_reativacao do cliente ou numero_pedido da
//   interação).
// - FOLLOW-UPS e REAGENDADOS: contadores centralizados.
// - JANELA TEMPORAL (data_inicial/data_final): vale para interacoes.created
//   (reativações/reagendamentos no período). Estados atuais da base NÃO são
//   datados (ficam fora da janela) — decisão de produto registrada.
// ============================================================

var DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

function pedidoValidoExpr(colPrefix, col) {
  return (
    '(' +
    colPrefix +
    col +
    ' IS NOT NULL AND TRIM(' +
    colPrefix +
    col +
    ") != '' AND TRIM(" +
    colPrefix +
    col +
    ") != '-' AND TRIM(" +
    colPrefix +
    col +
    ") != '0')"
  )
}

/** EXISTS de interação com desfecho de reativação ou pedido válido. refCliente = referência à coluna cliente do dono (ex.: 'clientes.id' ou 'c.id'). */
function sqlExisteInteracaoReativacao(refCliente, iAlias) {
  var I = iAlias || 'i_chk'
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
    ".numero_pedido) != '-'))))"
  )
}

/**
 * RÉGUA OFICIAL DE REATIVAÇÃO: prova de operador (operador OU operador_reativacao)
 * + atendimento real em interacoes. Nunca apenas o campo "operador".
 * @param {string} a alias da tabela clientes na query ('' = sem alias, tabela clientes)
 */
function sqlReativacaoReal(a) {
  var p = a ? a + '.' : ''
  var ref = a ? a + '.id' : 'clientes.id'
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

/** FATURAMENTO DO CRUZAMENTO ERP: 'reativado' SEM atendimento da equipe (métrica separada, sempre rotulada). */
function sqlFaturamentoCruzamento(a) {
  var p = a ? a + '.' : ''
  var ref = a ? a + '.id' : 'clientes.id'
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

/** EXISTS de interação com pedido válido (NF/pedido faturado). */
function sqlExistePedido(refCliente, iAlias) {
  var I = iAlias || 'i_ped'
  return (
    'EXISTS (SELECT 1 FROM interacoes ' +
    I +
    ' WHERE ' +
    I +
    '.cliente = ' +
    refCliente +
    ' AND ' +
    pedidoValidoExpr(I + '.', 'numero_pedido') +
    ')'
  )
}

/** REAL EQUIPE (subconjunto com pedido/NF): reativação oficial + pedido confirmado. */
function sqlRealEquipe(a) {
  var p = a ? a + '.' : ''
  var ref = a ? a + '.id' : 'clientes.id'
  return (
    '(' +
    sqlReativacaoReal(a) +
    ' AND (' +
    sqlExistePedido(ref) +
    ' OR ' +
    pedidoValidoExpr(p, 'pedido_reativacao') +
    '))'
  )
}

/** EXISTS de interação de reativação DENTRO da janela (reativação no período). Usa binds {:janelaInicio}/{:janelaFim}. */
function sqlJanelaInteracoes(refCliente, janela, iAlias) {
  if (!janela || !janela.ativa) return '1=1'
  var I = iAlias || 'i_win'
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
    ".numero_pedido) != '-'))))"
  )
}

/** Filtro de base: exclui ativo_fora_base (estado e flag) + categoria de base. */
function sqlBaseFilter(catParam, a) {
  var p = a ? a + '.' : ''
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

/** Categoria de base ('todas'|'normal'|'cliente_final'|'atacado_fora_mapa'|'sem_dono'|'repescagem'). */
function sqlCategoria(baseCategoriaParam, pfx) {
  var pfx2 = pfx || ''
  var cat = String(baseCategoriaParam || 'todas').trim()
  var colCat = pfx2 + 'base_categoria'
  var colSemDono = pfx2 + 'sem_dono_equipe'
  var colRegiao = pfx2 + 'regiao'
  var colDias = pfx2 + 'dias_sem_faturar'
  if (cat === 'cliente_final') return colCat + " = 'cliente_final'"
  if (cat === 'atacado_fora_mapa') return colCat + " = 'atacado_fora_mapa'"
  if (cat === 'sem_dono' || cat === 'sem_dono_equipe')
    return '(' + colSemDono + ' = 1 OR ' + colSemDono + ' = true)'
  if (cat === 'repescagem') return '(' + colRegiao + " = 'REPESCAGEM' OR " + colDias + ' >= 90)'
  if (cat === 'normal')
    return '(' + colCat + ' IS NULL OR ' + colCat + " = '' OR " + colCat + " = 'normal')"
  return '1=1'
}

/** Condição de região com todas as grafias; preenche bindParams.regiaoParam/regiaoLike quando livre. */
function sqlRegiao(regiaoParam, pfx, bindParams) {
  var p = pfx || ''
  var reg = String(regiaoParam || '').trim()
  if (!reg || reg.toLowerCase() === 'todas') return ''
  var col = p + 'regiao'
  var upper = reg.toUpperCase().trim()
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
  if (
    upper === 'BRAGANÇA' ||
    upper === 'BRAGANCA' ||
    upper === 'BRAGANÇA PAULISTA' ||
    upper === 'BRAGANCA PAULISTA'
  ) {
    return (
      ' AND (UPPER(TRIM(' +
      col +
      ")) = 'BRAGANÇA' OR UPPER(TRIM(" +
      col +
      ")) = 'BRAGANCA' OR UPPER(TRIM(" +
      col +
      ")) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(" +
      col +
      ")) = 'BRAGANCA PAULISTA')"
    )
  }
  if (
    upper === 'CAMBUÍ' ||
    upper === 'CAMBUI' ||
    upper === 'MICRO-REGIÃO' ||
    upper === 'MICRO REGIAO' ||
    upper === 'MICROREGIAO'
  ) {
    return (
      ' AND (UPPER(TRIM(' +
      col +
      ")) = 'CAMBUÍ' OR UPPER(TRIM(" +
      col +
      ")) = 'CAMBUI' OR UPPER(TRIM(" +
      col +
      ")) = 'MICRO-REGIÃO' OR UPPER(TRIM(" +
      col +
      ")) = 'MICRO REGIAO' OR UPPER(TRIM(" +
      col +
      ")) = 'MICROREGIAO')"
    )
  }
  if (
    upper === 'POÇOS DE CALDAS' ||
    upper === 'POCOS DE CALDAS' ||
    upper === 'POÇOS CALDAS' ||
    upper === 'POCOS CALDAS' ||
    upper === 'POÇOS' ||
    upper === 'POCOS'
  ) {
    return (
      ' AND (UPPER(TRIM(' +
      col +
      ")) = 'POÇOS DE CALDAS' OR UPPER(TRIM(" +
      col +
      ")) = 'POCOS DE CALDAS' OR UPPER(TRIM(" +
      col +
      ")) = 'POÇOS CALDAS' OR UPPER(TRIM(" +
      col +
      ")) = 'POCOS CALDAS' OR UPPER(TRIM(" +
      col +
      ")) = 'POÇOS' OR UPPER(TRIM(" +
      col +
      ")) = 'POCOS')"
    )
  }
  if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
    return ' AND (UPPER(TRIM(' + col + ")) = 'JUNDIAÍ' OR UPPER(TRIM(" + col + ")) = 'JUNDIAI')"
  }
  if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
    return ' AND (UPPER(TRIM(' + col + ")) = 'ITAJUBÁ' OR UPPER(TRIM(" + col + ")) = 'ITAJUBA')"
  }
  if (upper === 'VARGINHA') return ' AND UPPER(TRIM(' + col + ")) = 'VARGINHA'"
  if (upper === 'POUSO ALEGRE') return ' AND UPPER(TRIM(' + col + ")) = 'POUSO ALEGRE'"
  if (upper === 'EXTREMA') return ' AND UPPER(TRIM(' + col + ")) = 'EXTREMA'"
  if (upper === 'ATACADO') return ' AND UPPER(TRIM(' + col + ")) = 'ATACADO'"
  if (upper === 'REPESCAGEM') return ' AND UPPER(TRIM(' + col + ")) = 'REPESCAGEM'"
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

/** CASE de normalização de região (8 rotas Varejo + ATACADO + REPESCAGEM) para GROUP BY. */
function sqlCaseRegiao(col) {
  var c = col || 'regiao'
  return (
    'CASE ' +
    'WHEN ' +
    c +
    ' IS NULL OR TRIM(' +
    c +
    ") = '' THEN 'Sem Região' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'BRAGANÇA' OR UPPER(TRIM(" +
    c +
    ")) = 'BRAGANCA' OR UPPER(TRIM(" +
    c +
    ")) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(" +
    c +
    ")) = 'BRAGANCA PAULISTA' THEN 'BRAGANÇA' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'CAMBUÍ' OR UPPER(TRIM(" +
    c +
    ")) = 'CAMBUI' OR UPPER(TRIM(" +
    c +
    ")) = 'MICRO-REGIÃO' OR UPPER(TRIM(" +
    c +
    ")) = 'MICRO REGIAO' OR UPPER(TRIM(" +
    c +
    ")) = 'MICROREGIAO' THEN 'CAMBUÍ' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'POÇOS DE CALDAS' OR UPPER(TRIM(" +
    c +
    ")) = 'POCOS DE CALDAS' OR UPPER(TRIM(" +
    c +
    ")) = 'POÇOS CALDAS' OR UPPER(TRIM(" +
    c +
    ")) = 'POCOS CALDAS' OR UPPER(TRIM(" +
    c +
    ")) = 'POÇOS' OR UPPER(TRIM(" +
    c +
    ")) = 'POCOS' THEN 'POÇOS DE CALDAS' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'JUNDIAÍ' OR UPPER(TRIM(" +
    c +
    ")) = 'JUNDIAI' THEN 'JUNDIAÍ' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'ITAJUBÁ' OR UPPER(TRIM(" +
    c +
    ")) = 'ITAJUBA' THEN 'ITAJUBÁ' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'VARGINHA' THEN 'VARGINHA' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'POUSO ALEGRE' THEN 'POUSO ALEGRE' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'EXTREMA' THEN 'EXTREMA' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'ATACADO' THEN 'ATACADO' " +
    'WHEN UPPER(TRIM(' +
    c +
    ")) = 'REPESCAGEM' THEN 'REPESCAGEM' " +
    'ELSE UPPER(TRIM(' +
    c +
    ')) END'
  )
}

/** Janela temporal personalizada: ativa SOMENTE com data_inicial E data_final em YYYY-MM-DD. 00:00 BRT = 03:00 UTC. */
function parseJanela(dataInicial, dataFinal) {
  var di = String(dataInicial || '').trim()
  var df = String(dataFinal || '').trim()
  var res = { ativa: false, inicioIso: '', fimIso: '', dataInicial: di, dataFinal: df }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) return res
  var pF = df.split('-')
  res.ativa = true
  res.inicioIso = di + ' 03:00:00.000Z'
  res.fimIso = new Date(
    Date.UTC(parseInt(pF[0], 10), parseInt(pF[1], 10) - 1, parseInt(pF[2], 10) + 1, 2, 59, 59, 999),
  ).toISOString()
  return res
}

/**
 * Cinto de segurança + dedupe das fichas de atendimento (FONTE OFICIAL de valor/ton da Real Equipe).
 * Deduplica por cliente (ficha mais recente vence), só considera desfecho 'reativado',
 * normaliza massa (1 ton = 1000 kg) e descarta fichas com razão < 100 R$/ton.
 * @returns {{somaValor: number, somaTon: number, fichasPorCliente: Object}}
 */
function agregarFichas(fRows, tag) {
  var t = tag || '[regua_metricas]'
  var somaValor = 0
  var somaTon = 0
  var fichasPorCliente = {}
  var clientesProcessados = {}
  for (var fi = 0; fi < fRows.length; fi++) {
    var fr = fRows[fi]
    var cId = fr.cliente_id
    if (!cId || clientesProcessados[cId]) continue
    clientesProcessados[cId] = true
    var desfecho = String(fr.desfecho || '').trim()
    if (desfecho !== 'reativado') continue
    var vPot = Number(fr.valor_potencial || 0)
    var tPot = Number(fr.toneladas_potencial || 0)
    if (tPot > 500) tPot = tPot / 1000.0
    if (vPot > 0 && tPot > 0 && vPot / tPot < 100) {
      console.log(
        t +
          ' Cinto de segurança: ficha descartada id=' +
          fr.ficha_id +
          ' (cliente=' +
          cId +
          ', v=' +
          vPot +
          ', ton=' +
          tPot +
          ', razão=' +
          (vPot / tPot).toFixed(2) +
          ' R$/ton)',
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

/**
 * Contadores de follow-ups e reagendados (métricas centrais da régua).
 * - followupsProgramados: clientes com reagendado_para preenchido (estado atual, não datado)
 * - reagendadosPeriodo: interações de reagendamento em interacoes.created (janela quando ativa)
 * @param filtrosSql WHERE extra sobre clientes (região/categoria/segmento) — sem o prefixo ' AND '
 * @returns {{followupsProgramados: number, reagendadosPeriodo: number}}
 */
function contarFollowupsReagendados(app, janela, filtrosSql, bindParams, tag) {
  var t = tag || '[regua_metricas]'
  var res = { followupsProgramados: 0, reagendadosPeriodo: 0 }
  try {
    var fModel = arrayOf(new DynamicModel({ total: 0 }))
    var fSql =
      'SELECT COUNT(*) as total FROM clientes WHERE reagendado_para IS NOT NULL AND TRIM(reagendado_para) != ' +
      "''" +
      (filtrosSql ? ' AND ' + filtrosSql : '')
    var fqb = app.db().newQuery(fSql)
    if (bindParams && Object.keys(bindParams).length > 0) fqb.bind(bindParams)
    fqb.one(fModel)
    res.followupsProgramados = Number(fModel.total || 0)
  } catch (errF) {
    console.error(t + ' Erro followups: ' + (errF && errF.message ? errF.message : String(errF)))
  }
  try {
    var rModel = arrayOf(new DynamicModel({ total: 0 }))
    var rSql =
      "SELECT COUNT(*) as total FROM interacoes i WHERE (i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != ''))"
    if (janela && janela.ativa) {
      rSql += ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}'
    }
    var rqb = app.db().newQuery(rSql)
    var rParams = {}
    if (janela && janela.ativa) {
      rParams.janelaInicio = janela.inicioIso
      rParams.janelaFim = janela.fimIso
    }
    if (Object.keys(rParams).length > 0) rqb.bind(rParams)
    rqb.one(rModel)
    res.reagendadosPeriodo = Number(rModel.total || 0)
  } catch (errR) {
    console.error(t + ' Erro reagendados: ' + (errR && errR.message ? errR.message : String(errR)))
  }
  return res
}

module.exports = {
  versao: 'M1',
  DESFECHOS_REATIVACAO: DESFECHOS_REATIVACAO,
  parseJanela: parseJanela,
  sqlCategoria: sqlCategoria,
  sqlBaseFilter: sqlBaseFilter,
  sqlRegiao: sqlRegiao,
  sqlCaseRegiao: sqlCaseRegiao,
  sqlReativacaoReal: sqlReativacaoReal,
  sqlFaturamentoCruzamento: sqlFaturamentoCruzamento,
  sqlRealEquipe: sqlRealEquipe,
  sqlJanelaInteracoes: sqlJanelaInteracoes,
  sqlExisteInteracaoReativacao: sqlExisteInteracaoReativacao,
  agregarFichas: agregarFichas,
  contarFollowupsReagendados: contarFollowupsReagendados,
}
