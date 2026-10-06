migrate(
  (app) => {
    // Gravar resultado do censo em eventos_log para consulta direta via API
    try {
      // 1. Multi interações com desfecho 'reativado'
      const qInteracoes = app.db().newQuery(`
        SELECT cliente, COUNT(*) as qtd_reativacoes, GROUP_CONCAT(id) as interacao_ids, GROUP_CONCAT(created) as datas, GROUP_CONCAT(operador) as operadores, GROUP_CONCAT(numero_pedido) as pedidos
        FROM interacoes
        WHERE desfecho = 'reativado'
        GROUP BY cliente
        HAVING COUNT(*) > 1
      `)
      const rowsMulti = []
      qInteracoes.all(rowsMulti)
      const multiInteracoesDet = []
      for (let i = 0; i < rowsMulti.length; i++) {
        const r = rowsMulti[i]
        let cliNome = 'Desconhecido'
        let cliCodigo = 'S/C'
        try {
          const cli = app.findRecordById('clientes', r.cliente)
          cliNome = cli.getString('nome')
          cliCodigo = cli.getString('codigo')
        } catch (_) {}
        multiInteracoesDet.push({
          cliente_id: r.cliente,
          codigo: cliCodigo,
          nome: cliNome,
          qtd: r.qtd_reativacoes,
          datas: r.datas,
          operadores: r.operadores,
          pedidos: r.pedidos,
        })
      }

      // 2. Standby corrompido (standby_ate no futuro mas estado != 'reativado' e != 'ativo_fora_base')
      const qStandbyCorrompido = app.db().newQuery(`
        SELECT id, codigo, nome, regiao, vendedor, estado, reativado_em, standby_ate, reagendado_operador, reagendado_para, operador
        FROM clientes
        WHERE standby_ate IS NOT NULL 
          AND standby_ate != '' 
          AND datetime(standby_ate) > datetime('now')
          AND estado != 'reativado'
          AND estado != 'ativo_fora_base'
      `)
      const rowsStandby = []
      qStandbyCorrompido.all(rowsStandby)

      // 3. Reabertos após reativação
      const qReabertos = app.db().newQuery(`
        SELECT c.id, c.codigo, c.nome, c.estado, c.reativado_em, c.standby_ate, i.id as interacao_id, i.tipo, i.desfecho, i.created as interacao_created, i.operador as interacao_operador
        FROM clientes c
        JOIN interacoes i ON i.cliente = c.id
        WHERE c.reativado_em IS NOT NULL 
          AND c.reativado_em != ''
          AND i.created > datetime(c.reativado_em, '+5 minutes')
          AND i.tipo IN ('formulario', 'status')
        ORDER BY i.created DESC
      `)
      const rowsReabertos = []
      qReabertos.all(rowsReabertos)

      // 4. Clientes que faturaram recentemente (faixa='recente') no lote de 05/10 03:00 UTC
      const qCronLote = app.db().newQuery(`
        SELECT COUNT(*) as total
        FROM clientes
        WHERE reativado_em >= '2026-10-05 02:50:00' AND reativado_em <= '2026-10-05 03:15:00'
      `)
      const rowsLote = []
      qCronLote.all(rowsLote)

      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'censo_duplicidades_executado')
      ev.set('detalhes', {
        multi_reativacoes: multiInteracoesDet,
        standby_corrompido: rowsStandby,
        reabertos_apos_reativado: rowsReabertos,
        total_lote_05_10: rowsLote.length > 0 ? rowsLote[0].total : 0,
      })
      app.save(ev)
    } catch (err) {
      console.log('[0075] Erro ao gravar censo em eventos_log: ' + err.message)
    }
  },
  () => {},
)
