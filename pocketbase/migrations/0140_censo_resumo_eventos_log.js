/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0140 (CENSO — somente leitura, não modifica dados de clientes):
 * grava em eventos_log um RESUMO compacto da validação final da rodada v0.0.192
 * (sem amostra, só números) para leitura direta pelo admin:
 *   - reativacoes_oficiais: sem janela, 15d, 30d e 45d (régua oficial idêntica ao Dashboard);
 *   - dedupe_0138: total de clientes, apontando merge_em, mesclados, pulados, apagados=0;
 *   - pedido_223654: onde está gravado (SS ESTRUTURA x JPA COMERCIO).
 */
migrate(
  (app) => {
    const T = '[0140_censo_resumo]'
    const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

    const countRows = function (sql, params) {
      const rows = arrayOf(new DynamicModel({ total: 0 }))
      const qb = app.db().newQuery(sql)
      if (params && Object.keys(params).length > 0) qb.bind(params)
      qb.all(rows)
      return Number(rows.length > 0 ? rows[0].total : 0)
    }
    const idsReativ = function (sql, params) {
      const rows = arrayOf(new DynamicModel({ cliente_id: '' }))
      const qb = app.db().newQuery(sql)
      if (params && Object.keys(params).length > 0) qb.bind(params)
      qb.all(rows)
      return rows.length
    }

    const janelaCond = function (refCliente) {
      return (
        'EXISTS (SELECT 1 FROM interacoes i_val WHERE i_val.cliente = ' +
        refCliente +
        ' AND i_val.created >= {:janelaInicio} AND i_val.created <= {:janelaFim} AND (' +
        'i_val.desfecho IN ' +
        DESFECHOS_REATIVACAO +
        " OR (i_val.numero_pedido IS NOT NULL AND TRIM(i_val.numero_pedido) != '' AND TRIM(i_val.numero_pedido) != '-')))"
      )
    }

    const filtroClientes =
      "FROM clientes c WHERE c.estado = 'reativado'" +
      ' AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)' +
      " AND ((c.operador IS NOT NULL AND TRIM(c.operador) != '') OR (c.operador_reativacao IS NOT NULL AND TRIM(c.operador_reativacao) != ''))"
    const provaInteracao =
      ' AND EXISTS (SELECT 1 FROM interacoes i_chk WHERE i_chk.cliente = c.id AND (i_chk.desfecho IN ' +
      DESFECHOS_REATIVACAO +
      " OR (i_chk.numero_pedido IS NOT NULL AND TRIM(i_chk.numero_pedido) != '' AND TRIM(i_chk.numero_pedido) != '-')))"

    const semJanela = idsReativ(
      'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + provaInteracao,
    )

    const agora = new Date()
    const dia30 = new Date(agora.getTime() - 30 * 86400000)
    const dia15 = new Date(agora.getTime() - 15 * 86400000)
    const dia45 = new Date(agora.getTime() - 45 * 86400000)
    const params30 = { janelaInicio: dia30.toISOString(), janelaFim: agora.toISOString() }
    const params15 = { janelaInicio: dia15.toISOString(), janelaFim: agora.toISOString() }
    const params45 = { janelaInicio: dia45.toISOString(), janelaFim: agora.toISOString() }
    const reat30 = idsReativ(
      'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + ' AND ' + janelaCond('c.id'),
      params30,
    )
    const reat15 = idsReativ(
      'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + ' AND ' + janelaCond('c.id'),
      params15,
    )
    const reat45 = idsReativ(
      'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + ' AND ' + janelaCond('c.id'),
      params45,
    )

    const totalClientes = countRows('SELECT COUNT(*) as total FROM clientes')
    const totalMerge = countRows(
      "SELECT COUNT(*) as total FROM clientes WHERE COALESCE(merge_em,'') != ''",
    )
    const duplicadosEstado = countRows(
      "SELECT COUNT(*) as total FROM clientes WHERE estado = 'duplicado'",
    )

    let ev0138 = null
    try {
      const evs = app.findRecordsByFilter(
        'eventos_log',
        "acao = 'dedupe_clientes_0138'",
        '-created',
        1,
        0,
      )
      if (evs.length > 0) ev0138 = evs[0].get('detalhes')
    } catch (_) {}

    let pedido223 = []
    try {
      const rows223 = arrayOf(
        new DynamicModel({ codigo: '', nome: '', pedido: '', nf: '', valor: -0 }),
      )
      app
        .db()
        .newQuery(
          "SELECT COALESCE(codigo,'') AS codigo, COALESCE(nome,'') AS nome, " +
            "COALESCE(pedido_reativacao,'') AS pedido, COALESCE(numero_nf_fatura,'') AS nf, " +
            'COALESCE(valor_faturado,0) AS valor FROM clientes ' +
            "WHERE pedido_reativacao LIKE '%223654%' OR nome LIKE '%SS ESTRUTURA%' OR nome LIKE '%JPA COMERCIO%'",
        )
        .all(rows223)
      for (let i = 0; i < rows223.length; i++) {
        pedido223.push(
          rows223[i].codigo +
            ' | ' +
            rows223[i].nome +
            ' | pedido=' +
            rows223[i].pedido +
            ' | NF=' +
            rows223[i].nf +
            ' | valor=' +
            rows223[i].valor,
        )
      }
    } catch (_) {}

    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEventos)
      ev.set('acao', 'censo_resumo_0140')
      ev.set('detalhes', {
        reativacoes_oficiais: {
          sem_janela_estoque: semJanela,
          ultimos_15_dias: reat15,
          ultimos_30_dias: reat30,
          ultimos_45_dias: reat45,
        },
        dedupe_0138: {
          total_clientes: totalClientes,
          apontando_merge_em: totalMerge,
          estado_duplicado: duplicadosEstado,
          registros_apagados: 0,
          auditoria_migracao: ev0138,
        },
        pedido_223654: pedido223,
        gerado_em: agora.toISOString(),
      })
      app.save(ev)
      console.log(
        T +
          ' reat(semJanela/15d/30d/45d)=' +
          semJanela +
          '/' +
          reat15 +
          '/' +
          reat30 +
          '/' +
          reat45 +
          ' | clientes=' +
          totalClientes +
          ' merge_em=' +
          totalMerge +
          ' apagados=0',
      )
    } catch (eLog) {
      console.log(T + ' Falha ao registrar resumo: ' + eLog)
    }
  },
  (app) => {},
)
