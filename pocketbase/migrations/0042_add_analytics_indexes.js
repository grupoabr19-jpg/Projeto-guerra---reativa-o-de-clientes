/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('clientes')

    // Adicionar índices para otimizar agregações e filtros combinados
    // col.addIndex é idempotente no PocketBase
    col.addIndex('idx_clientes_segmento', false, 'segmento', '')
    col.addIndex('idx_clientes_vendedor', false, 'vendedor', '')
    col.addIndex('idx_clientes_dias_sem_faturar', false, 'dias_sem_faturar', '')
    col.addIndex('idx_clientes_fat_12m', false, 'fat_12m_reais', '')

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('clientes')
      col.removeIndex('idx_clientes_segmento')
      col.removeIndex('idx_clientes_vendedor')
      col.removeIndex('idx_clientes_dias_sem_faturar')
      col.removeIndex('idx_clientes_fat_12m')
      app.save(col)
    } catch (_) {}
  },
)
