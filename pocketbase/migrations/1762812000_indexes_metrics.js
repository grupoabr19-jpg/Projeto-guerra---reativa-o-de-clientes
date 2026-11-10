/// <reference path="../pb_data/types.d.ts" />

// Índices para os endpoints de métricas (base-kpis / analytics / export).
// O endpoint /backend/v1/metrics/base-kpis varre ~21k clientes com EXISTS
// correlacionados sobre interacoes (cliente + desfecho) — sem índice cada
// verificação virava full scan e o request estourava 504.

migrate(
  (app) => {
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_desfecho ON interacoes (cliente, desfecho)',
      )
      .execute()
    app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_interacoes_created ON interacoes (created)')
      .execute()
    app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes (estado)')
      .execute()
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_respostas_formulario_cliente ON respostas_formulario (cliente)',
      )
      .execute()
  },
  (app) => {
    app.db().newQuery('DROP INDEX IF EXISTS idx_interacoes_cliente_desfecho').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_interacoes_created').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_clientes_estado').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_respostas_formulario_cliente').execute()
  },
)
