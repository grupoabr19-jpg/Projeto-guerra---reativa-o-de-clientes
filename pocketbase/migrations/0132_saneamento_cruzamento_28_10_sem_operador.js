/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0132: Saneamento definitivo de cruzamentos de 28/10 sem operador (com ou sem faturamento).
 *
 * Objetivo:
 * - A migração 0128/0130 limpou os registros do cruzamento com faturamento recente, mas a leva de
 *   28/10 (~12:00 a 13:00 UTC) sem valor de faturamento continuou em estado='reativado' com operador vazio.
 *   Exemplos reais: ANA PRISCILLA (C023333), L&G (C023338), RODRIGO PERRONE (C023345), GILDASIO (C023343), NF-PHS (C023336).
 * - Mover TODOS os registros com estado='reativado', operador vazio/null, operador_reativacao vazio/null e origem='importacao'
 *   da leva do cruzamento de 28/10 para estado='ativo_fora_base', ativo_fora_base=true,
 *   com motivo_ativo_fora_base preenchido.
 * - Blindagem expressa e inegociável de clientes legítimos:
 *     - SS ESTRUTURA METALICA LTDA (C012635)
 *     - VITAL ACO ESTRUT METALICAS LTDA (C002334)
 *     - WELLINGTON RODRIGO DOS SANTOS (C020260)
 *   Estes permanecem intocados em estado='reativado' com operador atribuído.
 * - Idempotente: seguro para rodar múltiplas vezes, no-op em base limpa ou vazia.
 * - Registro de auditoria em eventos_log com os detalhes da operação.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0132] Iniciando saneamento completo da leva de 28/10 sem operador...')

    const BLINDADOS = ['C012635', 'C002334', 'C020260']

    // 1. Garantir que os blindados continuam reativados com operadores legítimos
    try {
      // Wellington C020260
      const wellington = app.findFirstRecordByFilter('clientes', "codigo = 'C020260'")
      if (wellington) {
        const op = (wellington.getString('operador') || '').trim() || 't1uvqnaa4av72ni'
        wellington.set('estado', 'reativado')
        wellington.set('operador', op)
        if (!wellington.getString('operador_reativacao')) {
          wellington.set('operador_reativacao', op)
        }
        wellington.set('ativo_fora_base', false)
        app.save(wellington)
      }
    } catch (errW) {
      console.warn('[MIGRATION 0132] Aviso ao validar Wellington:', errW)
    }

    try {
      // SS Estrutura C012635
      const ss = app.findFirstRecordByFilter('clientes', "codigo = 'C012635'")
      if (ss) {
        const op = (ss.getString('operador') || '').trim() || 't1uvqnaa4av72ni'
        ss.set('estado', 'reativado')
        ss.set('operador', op)
        if (!ss.getString('operador_reativacao')) {
          ss.set('operador_reativacao', op)
        }
        ss.set('ativo_fora_base', false)
        app.save(ss)
      }
    } catch (errSS) {
      console.warn('[MIGRATION 0132] Aviso ao validar SS Estrutura:', errSS)
    }

    try {
      // Vital C002334
      const vital = app.findFirstRecordByFilter('clientes', "codigo = 'C002334'")
      if (vital) {
        const op = (vital.getString('operador') || '').trim() || 'k987jw3wh2pc401'
        vital.set('estado', 'reativado')
        vital.set('operador', op)
        if (!vital.getString('operador_reativacao')) {
          vital.set('operador_reativacao', op)
        }
        vital.set('ativo_fora_base', false)
        app.save(vital)
      }
    } catch (errV) {
      console.warn('[MIGRATION 0132] Aviso ao validar Vital:', errV)
    }

    // 2. Buscar todos os clientes da leva de 28/10 em estado reativado sem operador
    const sqlBusca = `
      SELECT id, codigo, nome
      FROM clientes
      WHERE estado = 'reativado'
        AND (operador IS NULL OR TRIM(operador) = '')
        AND (operador_reativacao IS NULL OR TRIM(operador_reativacao) = '')
        AND origem = 'importacao'
        AND reativado_em >= '2026-10-28 12:00:00'
        AND reativado_em <= '2026-10-28 13:00:00'
        AND codigo NOT IN ('C012635', 'C002334', 'C020260')
    `

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        codigo: '',
        nome: '',
      }),
    )

    app.db().newQuery(sqlBusca).all(rows)
    console.log(`[MIGRATION 0132] Total de clientes identificados para saneamento: ${rows.length}`)

    let totalSaneados = 0
    const codigosSaneados = []

    if (rows.length > 0) {
      const motivo =
        'identificado no cruzamento de 28/10 sem operador — movido para ativo_fora_base'

      for (let i = 0; i < rows.length; i++) {
        const item = rows[i]

        // Double check de segurança contra blindados
        if (BLINDADOS.indexOf(item.codigo) !== -1) {
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

        totalSaneados++
        if (codigosSaneados.length < 50) {
          codigosSaneados.push(item.codigo)
        }
      }

      console.log(
        `[MIGRATION 0132] Saneamento concluído: ${totalSaneados} clientes reclassificados para 'ativo_fora_base'.`,
      )

      // 3. Registrar auditoria em eventos_log
      try {
        const colEventos = app.findCollectionByNameOrId('eventos_log')
        if (colEventos) {
          const ev = new Record(colEventos)
          ev.set('acao', 'saneamento_cruzamento_28_10_sem_operador')
          ev.set('detalhes', {
            total_saneados: totalSaneados,
            motivo: motivo,
            amostra_codigos: codigosSaneados,
            versao: '0132',
          })
          app.save(ev)
          console.log('[MIGRATION 0132] Evento de auditoria registrado em eventos_log com sucesso.')
        }
      } catch (evErr) {
        console.warn('[MIGRATION 0132] Aviso ao registrar log de auditoria:', evErr)
      }
    } else {
      console.log(
        '[MIGRATION 0132] Nenhum cliente com operador vazio na janela de 28/10 pendente de saneamento.',
      )
    }

    console.log('[MIGRATION 0132] Finalizada com sucesso.')
  },
  (app) => {
    console.log('[MIGRATION 0132] Rollback executado (no-op para integridade dos dados).')
  },
)
