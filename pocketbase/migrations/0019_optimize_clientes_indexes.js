/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Índices para otimização de consultas críticas na coleção 'clientes' (23k+ registros)
    // Evita full-table scan e timeout/lock de 30s+ em listagens e na fila de reserva

    const queries = [
      `CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes (estado);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_estado_faixa_score ON clientes (estado, faixa, score DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_estado_created ON clientes (estado, created DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_regiao_estado ON clientes (regiao, estado);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_operador_estado ON clientes (operador, estado);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_reagendado ON clientes (reagendado_para, estado);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_lock ON clientes (lock_timestamp, estado);`,
      `CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON clientes (codigo);`,
    ]

    for (const q of queries) {
      try {
        app.db().newQuery(q).execute()
      } catch (e) {
        console.log('[0019_index] Aviso ao criar índice: ' + (e ? e.message : 'desconhecido'))
      }
    }
  },
  (app) => {
    const drops = [
      `DROP INDEX IF EXISTS idx_clientes_estado;`,
      `DROP INDEX IF EXISTS idx_clientes_estado_faixa_score;`,
      `DROP INDEX IF EXISTS idx_clientes_estado_created;`,
      `DROP INDEX IF EXISTS idx_clientes_regiao_estado;`,
      `DROP INDEX IF EXISTS idx_clientes_operador_estado;`,
      `DROP INDEX IF EXISTS idx_clientes_reagendado;`,
      `DROP INDEX IF EXISTS idx_clientes_lock;`,
      `DROP INDEX IF EXISTS idx_clientes_codigo;`,
    ]
    for (const d of drops) {
      try {
        app.db().newQuery(d).execute()
      } catch (_) {}
    }
  },
)
