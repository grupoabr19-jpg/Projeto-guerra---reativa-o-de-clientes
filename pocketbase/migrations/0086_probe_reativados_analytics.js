migrate(
  (app) => {
    const row = new DynamicModel({
      total_reativados: 0,
      reativados_reais: 0,
      automaticas: 0,
    })

    app
      .db()
      .newQuery(`
    SELECT
      SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as total_reativados,
      SUM(CASE WHEN (estado = 'reativado' AND ((operador IS NOT NULL AND TRIM(operador) != '') OR (pedido_reativacao IS NOT NULL AND TRIM(pedido_reativacao) != ''))) THEN 1 ELSE 0 END) as reativados_reais,
      SUM(CASE WHEN (estado = 'reativado' AND (operador IS NULL OR TRIM(operador) = '') AND (pedido_reativacao IS NULL OR TRIM(pedido_reativacao) = '')) THEN 1 ELSE 0 END) as automaticas
    FROM clientes
    WHERE estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0)
  `)
      .one(row)
  },
  (app) => {},
)
