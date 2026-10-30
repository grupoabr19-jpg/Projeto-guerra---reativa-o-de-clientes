/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0135: Saneamento Definitivo e Irrestrito de Reativação Sem Operador Direto
 *
 * Mover para 'ativo_fora_base' todo e qualquer cliente em estado = 'reativado' que:
 * 1. Tem campo `operador` vazio, nulo ou em branco; OU
 * 2. Não possui NENHUMA interação na coleção `interacoes` com desfecho de reativação ou número de pedido válido.
 *
 * Exceções intocáveis (Reativações Reais da Equipe):
 * C012635 - SS Estrutura Metálica (pedido 223654, NF 158708, R$ 6.767,50)
 * C002334 - Vital Aço
 * C020260 - Wellington (pedido 223787, R$ 2.191,13)
 */
migrate(
  (app) => {
    console.log('[MIGRATION 0135] Iniciando saneamento universal de reativados sem operador...')

    const BLINDADOS = ['C012635', 'C002334', 'C020260']

    // Mover qualquer reativado com operador vazio
    const sqlVazio = `
      SELECT id, codigo, nome
      FROM clientes
      WHERE estado = 'reativado'
        AND (operador IS NULL OR TRIM(operador) = '')
        AND codigo NOT IN ('C012635', 'C002334', 'C020260')
    `
    const rowsVazio = arrayOf(new DynamicModel({ id: '', codigo: '', nome: '' }))
    app.db().newQuery(sqlVazio).all(rowsVazio)

    console.log(`[MIGRATION 0135] Clientes com operador vazio: ${rowsVazio.length}`)

    const motivo = 'identificado no cruzamento ERP sem operador — movido para ativo_fora_base'

    for (let i = 0; i < rowsVazio.length; i++) {
      const item = rowsVazio[i]
      if (BLINDADOS.indexOf(item.codigo) !== -1) continue

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
    }

    // Mover qualquer reativado restante que NÃO tenha interação comprovada de reativação
    const sqlSemInteracao = `
      SELECT id, codigo, nome
      FROM clientes
      WHERE estado = 'reativado'
        AND codigo NOT IN ('C012635', 'C002334', 'C020260')
        AND NOT EXISTS (
          SELECT 1 FROM interacoes i
          WHERE i.cliente = clientes.id
            AND (
              i.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
              OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-')
            )
        )
    `
    const rowsSemInteracao = arrayOf(new DynamicModel({ id: '', codigo: '', nome: '' }))
    app.db().newQuery(sqlSemInteracao).all(rowsSemInteracao)

    console.log(`[MIGRATION 0135] Clientes sem atendimento comprovado: ${rowsSemInteracao.length}`)

    for (let j = 0; j < rowsSemInteracao.length; j++) {
      const item2 = rowsSemInteracao[j]
      if (BLINDADOS.indexOf(item2.codigo) !== -1) continue

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
        .bind({ motivo: motivo, cId: item2.id })
        .execute()
    }

    console.log('[MIGRATION 0135] Finalizada com sucesso!')
  },
  (app) => {},
)
