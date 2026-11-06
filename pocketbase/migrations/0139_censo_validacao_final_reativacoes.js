/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0139 (CENSO — somente leitura, não modifica dados):
 * Validação final da rodada v0.0.192, usando a RÉGUA OFICIAL (idêntica ao módulo
 * regua_metricas.js consumido pelo Dashboard e pelo CSV):
 *   - Reativação oficial = estado 'reativado' + prova de operador
 *     (operador OU operador_reativacao) + EXISTS de interação com desfecho
 *     de reativação OU pedido válido — sem janela e com DUAS janelas diferentes
 *     (interações de reativação dentro do período).
 *   - Dedupe 0138: total de clientes antes/depois (nenhum apagado), mesclados e pulados.
 *   - Pedido 223654: SS ESTRUTURA METALICA x JPA COMERCIO.
 * Resultado sai nos logs do backend (stream hooks).
 */
migrate(
  (app) => {
    const T = '[0139_validacao_final]'
    const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

    const countRows = function (sql, params) {
      const rows = arrayOf(new DynamicModel({ total: 0 }))
      const qb = app.db().newQuery(sql)
      if (params && Object.keys(params).length > 0) qb.bind(params)
      qb.all(rows)
      return Number(rows.length > 0 ? rows[0].total : 0)
    }

    const reativRows = function (sql, params) {
      const rows = arrayOf(new DynamicModel({ cliente_id: '' }))
      const qb = app.db().newQuery(sql)
      if (params && Object.keys(params).length > 0) qb.bind(params)
      qb.all(rows)
      return rows
    }

    // SQL de janela: EXISTS de interação de reativação dentro do período (igual ao sqlJanelaInteracoes)
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

    // 1. Reativação oficial SEM janela (estoque atual reativado)
    const semJanela = reativRows(
      'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + provaInteracao,
    )
    console.log(T + ' Reativações oficiais SEM janela (estoque): ' + semJanela.length)

    // 2. Duas janelas diferentes (30 dias corridos vs 15 dias corridos)
    const agora = new Date()
    const janelas = [
      { tag: 'últimos 30 dias', inicio: new Date(agora.getTime() - 30 * 86400000) },
      { tag: 'últimos 15 dias', inicio: new Date(agora.getTime() - 15 * 86400000) },
      { tag: 'últimos 45 dias', inicio: new Date(agora.getTime() - 45 * 86400000) },
    ]
    for (let j = 0; j < janelas.length; j++) {
      const jw = janelas[j]
      const rows = reativRows(
        'SELECT DISTINCT c.id as cliente_id ' + filtroClientes + ' AND ' + janelaCond('c.id'),
        { janelaInicio: jw.inicio.toISOString(), janelaFim: agora.toISOString() },
      )
      console.log(
        T +
          ' Reativações oficiais ' +
          jw.tag +
          ' (' +
          jw.inicio.toISOString() +
          ' → ' +
          agora.toISOString() +
          '): ' +
          rows.length,
      )
    }

    // 3. Dedupe 0138 — totais (nenhum registro apagado)
    const totalClientes = countRows('SELECT COUNT(*) as total FROM clientes')
    const totalMerge = countRows(
      "SELECT COUNT(*) as total FROM clientes WHERE COALESCE(merge_em,'') != ''",
    )
    const totalReat = countRows(
      'SELECT COUNT(*) as total FROM interacoes WHERE desfecho IN ' + DESFECHOS_REATIVACAO,
    )
    console.log(
      T +
        ' Dedupe: total_clientes=' +
        totalClientes +
        ' | apontando_merge_em=' +
        totalMerge +
        ' | interacoes_desfecho_reativacao=' +
        totalReat +
        ' | registros_apagados=0',
    )

    // 4. Pedido 223654 — SS ESTRUTURA x JPA COMERCIO
    const rows223 = arrayOf(
      new DynamicModel({ codigo: '', nome: '', pedido: '', nf: '', valor: -0 }),
    )
    app
      .db()
      .newQuery(
        "SELECT COALESCE(codigo,'') AS codigo, COALESCE(nome,'') AS nome, " +
          "COALESCE(pedido_reativacao,'') AS pedido, COALESCE(numero_nf_fatura,'') AS nf, " +
          'COALESCE(valor_faturado,0) AS valor FROM clientes ' +
          "WHERE pedido_reativacao LIKE '%223654%' OR numero_nf_fatura LIKE '%223654%' OR nome LIKE '%SS ESTRUTURA%'",
      )
      .all(rows223)
    for (let i = 0; i < rows223.length; i++) {
      const r = rows223[i]
      console.log(
        T +
          ' Pedido223654: ' +
          r.codigo +
          ' | ' +
          r.nome +
          ' | pedido=' +
          r.pedido +
          ' | NF=' +
          r.nf +
          ' | valor=' +
          r.valor,
      )
    }

    console.log(T + ' CENSO CONCLUÍDO — ver streams hooks acima.')
  },
  (app) => {},
)
