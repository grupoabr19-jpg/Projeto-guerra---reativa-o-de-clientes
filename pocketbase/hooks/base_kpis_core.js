// pocketbase/hooks/base_kpis_core.js
// Módulo unificado para cálculo e agregação de KPIs de base, reativações reais e fichas de atendimento.
// Compartilhado entre /backend/v1/metrics/base-kpis e /backend/v1/metrics/reports-analytics.
// Compatível com Goja (ES5/Goja runtime).

/**
 * Retorna os timestamps e strings ISO para cálculo de datas no Fuso de Brasília (UTC-3).
 */
function getBrasiliaDateBounds() {
  var now = new Date()
  var brasiliaOffsetMs = -3 * 60 * 60 * 1000
  var dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
  var yBrt = dBrasilia.getUTCFullYear()
  var mBrt = dBrasilia.getUTCMonth()
  var dayBrt = dBrasilia.getUTCDate()
  // Meia-noite de hoje em Brasília (00:00:00 BRT = 03:00:00 UTC)
  var midnightTodayUtcMs = Date.UTC(yBrt, mBrt, dayBrt, 3, 0, 0, 0)
  var midnightTodayIso = new Date(midnightTodayUtcMs).toISOString()
  var midnight7diasIso = new Date(midnightTodayUtcMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  var midnight30diasIso = new Date(midnightTodayUtcMs - 30 * 24 * 60 * 60 * 1000).toISOString()

  return {
    midnightTodayIso: midnightTodayIso,
    midnight7diasIso: midnight7diasIso,
    midnight30diasIso: midnight30diasIso,
  }
}

/**
 * Constrói a expressão SQL para a categoria de base.
 * @param {string} baseCategoriaParam
 * @param {string} [tablePrefix] - ex: 'c.' ou ''
 */
function buildCategoriaSql(baseCategoriaParam, tablePrefix) {
  var pfx = tablePrefix || ''
  var colCat = pfx + 'base_categoria'
  var colSemDono = pfx + 'sem_dono_equipe'
  var colRegiao = pfx + 'regiao'
  var colDias = pfx + 'dias_sem_faturar'

  var cat = String(baseCategoriaParam || 'todas').trim()
  if (cat === 'cliente_final') {
    return colCat + " = 'cliente_final'"
  } else if (cat === 'atacado_fora_mapa') {
    return colCat + " = 'atacado_fora_mapa'"
  } else if (cat === 'sem_dono' || cat === 'sem_dono_equipe') {
    return '(' + colSemDono + ' = 1 OR ' + colSemDono + ' = true)'
  } else if (cat === 'repescagem') {
    return '(' + colRegiao + " = 'REPESCAGEM' OR " + colDias + ' >= 90)'
  } else if (cat === 'normal') {
    return '(' + colCat + ' IS NULL OR ' + colCat + " = '' OR " + colCat + " = 'normal')"
  }
  return '1=1'
}

/**
 * Constrói o fragmento SQL e parâmetros para filtro de região.
 * @param {string} regiaoParam
 * @param {Object} bindParams
 * @param {string} [tablePrefix]
 */
function buildRegiaoSql(regiaoParam, bindParams, tablePrefix) {
  var reg = String(regiaoParam || '').trim()
  if (!reg || reg.toLowerCase() === 'todas') {
    return ''
  }

  var pfx = tablePrefix || ''
  var col = pfx + 'regiao'
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
  } else if (
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
  } else if (
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
  } else if (
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
  } else if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
    return ' AND (UPPER(TRIM(' + col + ")) = 'JUNDIAÍ' OR UPPER(TRIM(" + col + ")) = 'JUNDIAI')"
  } else if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
    return ' AND (UPPER(TRIM(' + col + ")) = 'ITAJUBÁ' OR UPPER(TRIM(" + col + ")) = 'ITAJUBA')"
  } else if (upper === 'VARGINHA') {
    return ' AND UPPER(TRIM(' + col + ")) = 'VARGINHA'"
  } else if (upper === 'POUSO ALEGRE') {
    return ' AND UPPER(TRIM(' + col + ")) = 'POUSO ALEGRE'"
  } else if (upper === 'EXTREMA') {
    return ' AND UPPER(TRIM(' + col + ")) = 'EXTREMA'"
  } else if (upper === 'ATACADO') {
    return ' AND UPPER(TRIM(' + col + ")) = 'ATACADO'"
  } else if (upper === 'REPESCAGEM') {
    return ' AND UPPER(TRIM(' + col + ")) = 'REPESCAGEM'"
  } else {
    bindParams.regiaoParam = upper
    bindParams.regiaoLike = '%' + upper + '%'
    return (
      ' AND (UPPER(TRIM(' +
      col +
      ')) = {:regiaoParam} OR UPPER(TRIM(' +
      col +
      ')) LIKE {:regiaoLike})'
    )
  }
}

/**
 * Normaliza o nome da região para agrupamento padronizado (8 rotas Varejo + ATACADO + REPESCAGEM).
 */
var SQL_CASE_REGIAO_NORMALIZADA =
  'CASE ' +
  "  WHEN regiao IS NULL OR TRIM(regiao) = '' THEN 'Sem Região' " +
  "  WHEN UPPER(TRIM(regiao)) = 'BRAGANÇA' OR UPPER(TRIM(regiao)) = 'BRAGANCA' OR UPPER(TRIM(regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(regiao)) = 'BRAGANCA PAULISTA' THEN 'BRAGANÇA' " +
  "  WHEN UPPER(TRIM(regiao)) = 'CAMBUÍ' OR UPPER(TRIM(regiao)) = 'CAMBUI' OR UPPER(TRIM(regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(regiao)) = 'MICRO REGIAO' OR UPPER(TRIM(regiao)) = 'MICROREGIAO' THEN 'CAMBUÍ' " +
  "  WHEN UPPER(TRIM(regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(regiao)) = 'POCOS CALDAS' OR UPPER(TRIM(regiao)) = 'POÇOS' OR UPPER(TRIM(regiao)) = 'POCOS' THEN 'POÇOS DE CALDAS' " +
  "  WHEN UPPER(TRIM(regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(regiao)) = 'JUNDIAI' THEN 'JUNDIAÍ' " +
  "  WHEN UPPER(TRIM(regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(regiao)) = 'ITAJUBA' THEN 'ITAJUBÁ' " +
  "  WHEN UPPER(TRIM(regiao)) = 'VARGINHA' THEN 'VARGINHA' " +
  "  WHEN UPPER(TRIM(regiao)) = 'POUSO ALEGRE' THEN 'POUSO ALEGRE' " +
  "  WHEN UPPER(TRIM(regiao)) = 'EXTREMA' THEN 'EXTREMA' " +
  "  WHEN UPPER(TRIM(regiao)) = 'ATACADO' THEN 'ATACADO' " +
  "  WHEN UPPER(TRIM(regiao)) = 'REPESCAGEM' THEN 'REPESCAGEM' " +
  '  ELSE UPPER(TRIM(regiao)) ' +
  'END'

/**
 * Desfechos que devem ser isentos dos cálculos de reativação real e volumes.
 */
var DESFECHOS_ISENTOS = {
  duplicado: true,
  sem_contato: true,
  ativo_fora_base: true,
  compra_terceiros: true,
  cliente_final: true,
  restricao_financeira: true,
}

/**
 * Condição SQL para definir Reativação Real da Equipe.
 * Exige operador preenchido E atendimento real na tabela interacoes.
 */
var SQL_IS_REATIVACAO_REAL =
  "(estado = 'reativado' AND operador IS NOT NULL AND TRIM(operador) != '' AND EXISTS (SELECT 1 FROM interacoes i_chk WHERE i_chk.cliente = clientes.id AND (i_chk.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido') OR (i_chk.numero_pedido IS NOT NULL AND TRIM(i_chk.numero_pedido) != '' AND TRIM(i_chk.numero_pedido) != '-'))))"

/**
 * Condição SQL para definir Faturamento Recente do Cruzamento (sem atendimento da equipe).
 */
var SQL_IS_FATURAMENTO_CRUZAMENTO =
  "(estado = 'reativado' AND (operador IS NULL OR TRIM(operador) = '' OR NOT EXISTS (SELECT 1 FROM interacoes i_chk2 WHERE i_chk2.cliente = clientes.id AND (i_chk2.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido') OR (i_chk2.numero_pedido IS NOT NULL AND TRIM(i_chk2.numero_pedido) != '' AND TRIM(i_chk2.numero_pedido) != '-')))))"

/**
 * Agrega valor e tonelagem oficiais a partir das fichas de atendimento (respostas_formulario).
 * Realiza:
 * 1. Join com a tabela clientes
 * 2. Ordenação por rf.created DESC
 * 3. Deduplicação por cliente (ficha mais recente vence)
 * 4. Exclusão de desfechos isentos
 * 5. Cinto de segurança nos agregadores (R$ 0,10/kg -> razão < 100 R$/ton)
 *
 * Retorna: { somaValor: number, somaTon: number, fichasPorCliente: Object }
 */
function agregarFichasAtendimentoReais(rfWhereClause, bindParams, logPrefix) {
  var tag = logPrefix || '[base_kpis_core]'
  var somaValor = 0
  var somaTon = 0
  var fichasPorCliente = {}

  try {
    var fichasQuery =
      'SELECT ' +
      '  rf.id as ficha_id, ' +
      '  rf.cliente as cliente_id, ' +
      '  rf.desfecho as desfecho, ' +
      '  rf.valor_potencial as valor_potencial, ' +
      '  rf.toneladas_potencial as toneladas_potencial ' +
      'FROM respostas_formulario rf ' +
      'INNER JOIN clientes c ON c.id = rf.cliente ' +
      'WHERE ' +
      (rfWhereClause || '1=1') +
      ' ' +
      'ORDER BY rf.created DESC'

    var fRows = arrayOf(
      new DynamicModel({
        ficha_id: '',
        cliente_id: '',
        desfecho: '',
        valor_potencial: -0,
        toneladas_potencial: -0,
      }),
    )

    var fQueryBuilder = $app.db().newQuery(fichasQuery)
    if (bindParams && Object.keys(bindParams).length > 0) {
      fQueryBuilder.bind(bindParams)
    }
    fQueryBuilder.all(fRows)

    var clientesProcessados = {}

    for (var fi = 0; fi < fRows.length; fi++) {
      var fr = fRows[fi]
      var cId = fr.cliente_id
      if (!cId || clientesProcessados[cId]) continue
      clientesProcessados[cId] = true

      var desfecho = String(fr.desfecho || '').trim()
      if (desfecho === 'reativado' && !DESFECHOS_ISENTOS[desfecho]) {
        var vPot = Number(fr.valor_potencial || 0)
        var tPot = Number(fr.toneladas_potencial || 0)

        // Cinto de segurança nos agregadores:
        // Descartar fichas com valor_potencial > 0, toneladas_potencial > 0 e razão < 100 R$/ton
        if (vPot > 0 && tPot > 0 && vPot / tPot < 100) {
          console.log(
            tag +
              ' Cinto de segurança ativado: ficha corrupta descartada id=' +
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

        fichasPorCliente[cId] = {
          valor: vPot > 0 ? vPot : 0,
          ton: tPot > 0 ? tPot : 0,
        }
      }
    }
  } catch (err) {
    console.error(
      tag +
        ' Erro ao agregar fichas de atendimento: ' +
        (err && err.message ? err.message : String(err)),
    )
  }

  return {
    somaValor: Number(somaValor.toFixed(2)),
    somaTon: Number(somaTon.toFixed(4)),
    fichasPorCliente: fichasPorCliente,
  }
}

// Registro no escopo global para que outros hooks possam consumir
if (typeof globalThis !== 'undefined') {
  globalThis.baseKpisCore = {
    getBrasiliaDateBounds: getBrasiliaDateBounds,
    buildCategoriaSql: buildCategoriaSql,
    buildRegiaoSql: buildRegiaoSql,
    SQL_CASE_REGIAO_NORMALIZADA: SQL_CASE_REGIAO_NORMALIZADA,
    DESFECHOS_ISENTOS: DESFECHOS_ISENTOS,
    SQL_IS_REATIVACAO_REAL: SQL_IS_REATIVACAO_REAL,
    SQL_IS_FATURAMENTO_CRUZAMENTO: SQL_IS_FATURAMENTO_CRUZAMENTO,
    agregarFichasAtendimentoReais: agregarFichasAtendimentoReais,
  }
}
