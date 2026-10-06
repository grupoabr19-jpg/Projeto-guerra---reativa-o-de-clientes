migrate(
  (app) => {
    console.log('=== [0074_censo_duplicidades] INÍCIO DO CENSO DE DUPLICIDADES ===')

    // 1. Clientes com mais de 1 interação com desfecho 'reativado'
    try {
      const qInteracoes = app.db().newQuery(`
        SELECT cliente, COUNT(*) as qtd_reativacoes, GROUP_CONCAT(id) as interacao_ids, GROUP_CONCAT(created) as datas, GROUP_CONCAT(operador) as operadores, GROUP_CONCAT(numero_pedido) as pedidos
        FROM interacoes
        WHERE desfecho = 'reativado'
        GROUP BY cliente
        HAVING COUNT(*) > 1
      `)
      const rowsMulti = []
      qInteracoes.all(rowsMulti)
      console.log(
        `[CENSO] Clientes com mais de 1 interação desfecho=reativado: ${rowsMulti.length}`,
      )
      for (let i = 0; i < rowsMulti.length; i++) {
        const r = rowsMulti[i]
        let cliNome = 'Desconhecido'
        let cliCodigo = 'S/C'
        try {
          const cli = app.findRecordById('clientes', r.cliente)
          cliNome = cli.getString('nome')
          cliCodigo = cli.getString('codigo')
        } catch (_) {}
        console.log(
          `[CENSO_MULTI_INTERACAO] Cliente ${cliCodigo} - ${cliNome} (id: ${r.cliente}): ${r.qtd_reativacoes} reativações. Datas: ${r.datas}. Operadores: ${r.operadores}. Pedidos: ${r.pedidos}`,
        )
      }
    } catch (err) {
      console.log(`[CENSO] Erro na query de interacoes múltiplas: ${err.message}`)
    }

    // 2. Clientes com mais de 1 resposta_formulario com desfecho 'reativado'
    try {
      const qResp = app.db().newQuery(`
        SELECT cliente, COUNT(*) as qtd, GROUP_CONCAT(id) as ids, GROUP_CONCAT(created) as datas, GROUP_CONCAT(operador) as operadores
        FROM respostas_formulario
        WHERE desfecho = 'reativado'
        GROUP BY cliente
        HAVING COUNT(*) > 1
      `)
      const rowsResp = []
      qResp.all(rowsResp)
      console.log(
        `[CENSO] Clientes com mais de 1 respostas_formulario desfecho=reativado: ${rowsResp.length}`,
      )
      for (let i = 0; i < rowsResp.length; i++) {
        const r = rowsResp[i]
        let cliNome = 'Desconhecido'
        let cliCodigo = 'S/C'
        try {
          const cli = app.findRecordById('clientes', r.cliente)
          cliNome = cli.getString('nome')
          cliCodigo = cli.getString('codigo')
        } catch (_) {}
        console.log(
          `[CENSO_MULTI_FORMULARIO] Cliente ${cliCodigo} - ${cliNome}: ${r.qtd} formulários de reativação. Datas: ${r.datas}. Operadores: ${r.operadores}`,
        )
      }
    } catch (err) {
      console.log(`[CENSO] Erro na query de respostas_formulario múltiplas: ${err.message}`)
    }

    // 3. Clientes que possuem reativado_em / standby_ate preenchidos mas estado diferente de 'reativado' (ex: virou reagendado ou na_base)
    try {
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
      console.log(
        `[CENSO] Clientes em standby_ate futuro cujo estado NÃO é reativado (corrompidos): ${rowsStandby.length}`,
      )
      for (let i = 0; i < rowsStandby.length; i++) {
        const r = rowsStandby[i]
        console.log(
          `[CENSO_STANDBY_CORROMPIDO] ${r.codigo} - ${r.nome} | Estado atual: ${r.estado} | standby_ate: ${r.standby_ate} | reag_op: ${r.reagendado_operador} | reag_para: ${r.reagendado_para}`,
        )
      }
    } catch (err) {
      console.log(`[CENSO] Erro na query de standby corrompido: ${err.message}`)
    }

    // 4. Clientes que tiveram atendimento posterior após uma reativação com standby ainda vigente
    try {
      const qReabertosAposReativacao = app.db().newQuery(`
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
      qReabertosAposReativacao.all(rowsReabertos)
      console.log(
        `[CENSO] Atendimentos ocorridos >5min após reativado_em do cliente: ${rowsReabertos.length}`,
      )
      for (let i = 0; i < rowsReabertos.length; i++) {
        const r = rowsReabertos[i]
        console.log(
          `[CENSO_REABERTO_APOS_REATIVACAO] ${r.codigo} - ${r.nome} | Reativado em: ${r.reativado_em} | Standby: ${r.standby_ate} | Interação em: ${r.interacao_created} | Tipo: ${r.tipo} | Desfecho: ${r.desfecho} | Operador: ${r.interacao_operador}`,
        )
      }
    } catch (err) {
      console.log(`[CENSO] Erro na query de reabertos após reativação: ${err.message}`)
    }

    // 5. Total de clientes marcados como reativado pelo cron de 05/10 03:00 UTC
    try {
      const qCronLote = app.db().newQuery(`
        SELECT COUNT(*) as total, regiao, canal, sem_dono_equipe
        FROM clientes
        WHERE reativado_em >= '2026-10-05 02:50:00' AND reativado_em <= '2026-10-05 03:15:00'
        GROUP BY regiao, canal, sem_dono_equipe
      `)
      const rowsLote = []
      qCronLote.all(rowsLote)
      console.log(`[CENSO] Distribuição do lote de reativados em 05/10 03:00 UTC:`)
      for (let i = 0; i < rowsLote.length; i++) {
        const r = rowsLote[i]
        console.log(
          `[CENSO_LOTE_03Z] Região: ${r.regiao} | Canal: ${r.canal} | Sem dono: ${r.sem_dono_equipe} | Total: ${r.total}`,
        )
      }
    } catch (err) {
      console.log(`[CENSO] Erro na contagem do lote de 05/10: ${err.message}`)
    }

    console.log('=== [0074_censo_duplicidades] FIM DO CENSO ===')
  },
  () => {},
)
