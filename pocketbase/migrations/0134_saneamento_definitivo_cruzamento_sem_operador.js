/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0134: Saneamento Definitivo do Faturamento Recente / Cruzamento Sem Atendimento
 *
 * Mover para 'ativo_fora_base' TODOS os clientes em estado = 'reativado' que NÃO possuem
 * operador atribuído no campo `operador` e NÃO possuem atendimento real com desfecho de reativação
 * ou número de pedido válido na tabela `interacoes`.
 *
 * Blindagem estrita:
 * C012635 (SS Estrutura Metalica)
 * C002334 (Vital Aço)
 * C020260 (Wellington)
 */
migrate(
  (app) => {
    console.log('[MIGRATION 0134] Iniciando saneamento de faturamento recente sem operador...')

    const BLINDADOS_CODIGOS = ['C012635', 'C002334', 'C020260']

    // Buscar clientes em estado reativado sem operador direto e sem atendimento em interações
    const sqlBuscar = `
      SELECT id, codigo, nome
      FROM clientes
      WHERE estado = 'reativado'
        AND (operador IS NULL OR TRIM(operador) = '')
        AND codigo NOT IN ('C012635', 'C002334', 'C020260')
        AND NOT EXISTS (
          SELECT 1 FROM interacoes i
          WHERE i.cliente = clientes.id
            AND i.operador IS NOT NULL
            AND TRIM(i.operador) != ''
            AND (
              i.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
              OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-')
            )
        )
    `

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        codigo: '',
        nome: '',
      }),
    )

    app.db().newQuery(sqlBuscar).all(rows)
    console.log(
      `[MIGRATION 0134] Total de clientes identificados para reclassificação: ${rows.length}`,
    )

    let totalMovidos = 0
    const codigosAmostra = []
    const motivo = 'identificado no cruzamento ERP sem operador — movido para ativo_fora_base'

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i]
      if (BLINDADOS_CODIGOS.indexOf(item.codigo) !== -1) {
        continue
      }

      app
        .db()
        .newQuery(
          `UPDATE clientes SET
             ativo_fora_base = 1,
             estado = 'ativo_fora_base',
             motivo_ativo_fora_base = {:motivo},
             lock_timestamp = '1970-01-01 00:00:00.000Z'
           WHERE id = {:cId}`,
        )
        .bind({ motivo: motivo, cId: item.id })
        .execute()

      totalMovidos++
      if (codigosAmostra.length < 50) {
        codigosAmostra.push(item.codigo)
      }
    }

    console.log(
      `[MIGRATION 0134] Concluído: ${totalMovidos} clientes movidos para ativo_fora_base.`,
    )

    // Registrar em eventos_log
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      if (colEventos) {
        const ev = new Record(colEventos)
        ev.set('acao', 'saneamento_cruzamento_sem_operador_0134')
        ev.set('detalhes', {
          total_movidos: totalMovidos,
          motivo: motivo,
          amostra_codigos: codigosAmostra,
          versao: '0134',
        })
        app.save(ev)
      }
    } catch (_) {}
  },
  (app) => {},
)
