/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0022_add_interacoes_and_clientes_metrics_indexes.js
    // Adiciona índices essenciais para consultas de atendimentos agregadas gerais e por operador
    // Evita scans pesados e timeouts em bases com 23k+ registros

    const queries = [
      // Interações por data de criação (para filtros por período: hoje, 7dias, 30dias, total)
      `CREATE INDEX IF NOT EXISTS idx_interacoes_created ON interacoes (created DESC);`,
      // Interações compostas por operador e data de criação
      `CREATE INDEX IF NOT EXISTS idx_interacoes_op_created ON interacoes (operador, created DESC);`,
      // Interações compostas por desfecho e operador
      `CREATE INDEX IF NOT EXISTS idx_interacoes_desfecho_op ON interacoes (desfecho, operador);`,
      // Clientes por reagendado_para e reagendado_operador (para follow-ups do dia)
      `CREATE INDEX IF NOT EXISTS idx_clientes_reag_op_data ON clientes (reagendado_operador, reagendado_para);`,
      // Clientes por regiao e reagendado_para
      `CREATE INDEX IF NOT EXISTS idx_clientes_reg_reag ON clientes (regiao, reagendado_para);`,
    ]

    for (const q of queries) {
      try {
        app.db().newQuery(q).execute()
      } catch (e) {
        console.log('[0022_index] Aviso ao criar índice: ' + (e ? e.message : 'desconhecido'))
      }
    }
  },
  (app) => {
    const drops = [
      `DROP INDEX IF EXISTS idx_interacoes_created;`,
      `DROP INDEX IF EXISTS idx_interacoes_op_created;`,
      `DROP INDEX IF EXISTS idx_interacoes_desfecho_op;`,
      `DROP INDEX IF EXISTS idx_clientes_reag_op_data;`,
      `DROP INDEX IF EXISTS idx_clientes_reg_reag;`,
    ]
    for (const d of drops) {
      try {
        app.db().newQuery(d).execute()
      } catch (_) {}
    }
  },
)
