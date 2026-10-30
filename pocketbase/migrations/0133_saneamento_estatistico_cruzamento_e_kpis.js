/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0133: Saneamento Estatístico Definitivo do Faturamento Recente / Cruzamento e KPIs
 *
 * Objetivo:
 * 1. Mover todos os clientes restantes que estão em estado 'reativado' sem operador e sem atendimento real
 *    para 'ativo_fora_base' (clientes faturando diretamente no ERP sem ação da equipe de reativação).
 * 2. Blindar os 4 clientes reativados legítimos da equipe (SS Estrutura C012635, Vital Aço C002334, Wellington C020260 e correlatos).
 * 3. Normalizar unidades de massa em clientes (se peso > 500, trata-se de kg registrado em campo de toneladas -> dividir por 1000).
 * 4. Registrar auditoria completa em eventos_log.
 */
migrate(
  (app) => {
    console.log(
      '[MIGRATION 0133] Iniciando saneamento estatístico de clientes reativados e cruzamento...',
    )

    const BLINDADOS_CODIGOS = ['C012635', 'C002334', 'C020260']

    // 1. Identificar clientes em estado 'reativado' sem operador e sem atendimento na tabela interações
    const sqlBuscarFantasmas = `
      SELECT id, codigo, nome, valor_ultima_compra, toneladas_historico, peso_nf_tonelagem
      FROM clientes
      WHERE estado = 'reativado'
        AND (operador IS NULL OR TRIM(operador) = '')
        AND (operador_reativacao IS NULL OR TRIM(operador_reativacao) = '')
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

    const rowsFantasmas = arrayOf(
      new DynamicModel({
        id: '',
        codigo: '',
        nome: '',
        valor_ultima_compra: -0,
        toneladas_historico: -0,
        peso_nf_tonelagem: -0,
      }),
    )

    app.db().newQuery(sqlBuscarFantasmas).all(rowsFantasmas)
    console.log(
      `[MIGRATION 0133] Total de clientes reativados sem operador a reclassificar: ${rowsFantasmas.length}`,
    )

    let totalReclassificados = 0
    const codigosAmostra = []
    const motivo = 'identificado no cruzamento ERP sem operador — movido para ativo_fora_base'

    for (let i = 0; i < rowsFantasmas.length; i++) {
      const item = rowsFantasmas[i]
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

      totalReclassificados++
      if (codigosAmostra.length < 50) {
        codigosAmostra.push(item.codigo)
      }
    }

    console.log(
      `[MIGRATION 0133] Reclassificação concluída: ${totalReclassificados} clientes movidos para 'ativo_fora_base'.`,
    )

    // 2. Normalizar unidades de massa (kg para ton) em clientes com tonelagem > 500
    // Em compras siderúrgicas, 3.000 kg = 3 ton; registros com > 500 estavam em kg.
    try {
      app
        .db()
        .newQuery(
          `UPDATE clientes
           SET toneladas_historico = toneladas_historico / 1000.0
           WHERE toneladas_historico > 500`,
        )
        .execute()

      app
        .db()
        .newQuery(
          `UPDATE clientes
           SET peso_nf_tonelagem = peso_nf_tonelagem / 1000.0
           WHERE peso_nf_tonelagem > 500`,
        )
        .execute()

      console.log('[MIGRATION 0133] Normalização de kg para toneladas concluída em clientes.')
    } catch (normErr) {
      console.warn('[MIGRATION 0133] Aviso ao normalizar toneladas:', normErr)
    }

    // 3. Garantir dados íntegros e blindados dos reativados legítimos da equipe
    try {
      // SS Estrutura Metalica
      app
        .db()
        .newQuery(
          `UPDATE clientes
           SET estado = 'reativado',
               ativo_fora_base = 0,
               pedido_reativacao = '223654',
               numero_nf_fatura = '158708',
               valor_faturado = 6767.50,
               valor_ultima_compra = 6767.50
           WHERE codigo = 'C012635'`,
        )
        .execute()

      // Wellington
      app
        .db()
        .newQuery(
          `UPDATE clientes
           SET estado = 'reativado',
               ativo_fora_base = 0,
               pedido_reativacao = '223787',
               valor_faturado = 2191.13,
               valor_ultima_compra = 2191.13
           WHERE codigo = 'C020260'`,
        )
        .execute()

      // Vital Aço
      app
        .db()
        .newQuery(
          `UPDATE clientes
           SET estado = 'reativado',
               ativo_fora_base = 0
           WHERE codigo = 'C002334'`,
        )
        .execute()
    } catch (blErr) {
      console.warn('[MIGRATION 0133] Aviso na blindagem de clientes legítimos:', blErr)
    }

    // 4. Registro de auditoria em eventos_log
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      if (colEventos) {
        const ev = new Record(colEventos)
        ev.set('acao', 'saneamento_estatistico_dashboard_0133')
        ev.set('detalhes', {
          total_reclassificados: totalReclassificados,
          motivo: motivo,
          amostra_codigos: codigosAmostra,
          versao: '0133',
        })
        app.save(ev)
      }
    } catch (evErr) {
      console.warn('[MIGRATION 0133] Aviso ao gravar eventos_log:', evErr)
    }

    console.log('[MIGRATION 0133] Concluída com sucesso!')
  },
  (app) => {
    console.log('[MIGRATION 0133] Rollback no-op.')
  },
)
