/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0128: Saneamento definitivo de cruzamentos de dados indevidos de 28/10.
 *
 * Itens atendidos:
 * 1. Reclassificação idempotente dos clientes marcados como estado='reativado' com operador vazio
 *    e origem='importacao' durante a janela do cruzamento automático de 28/10 (~12:00 a 13:00 UTC).
 *    Estes clientes NÃO são reativações da equipe, são clientes que faturaram recentemente no ERP.
 *    Conforme a decisão de produto: cliente ativo identificado na base de inativos SAI da base
 *    (ativo_fora_base = true, estado = 'ativo_fora_base', motivo_ativo_fora_base = 'faturamento recente identificado no cruzamento em 28/10 — sem atendimento da equipe').
 *    Seus dados históricos de faturamento permanecem intactos no cadastro.
 *
 * 2. Caso WELLINGTON RODRIGO DOS SANTOS (C020260):
 *    Possui ficha real preenchida pela vendedora Leiz Torso (t1uvqnaa4av72ni) em 29/10/2026 com desfecho
 *    'reativado' e valor potencial de R$ 1.656,00, além de faturamento concluído no pedido 223787 / NF 158793/158836.
 *    Logo, é um cliente REATIVADO LEGÍTIMO pela equipe. Preenche operador = 't1uvqnaa4av72ni'
 *    (e operador_reativacao se necessário) para computar corretamente em isReativacaoRealCond.
 *
 * 3. Preservação rigorosa de:
 *    - SS ESTRUTURA METALICA LTDA (C012635) — garante operador preenchido com operador_reativacao ('t1uvqnaa4av72ni').
 *    - VITAL ACO ESTRUT METALICAS LTDA (C002334) — Milena Vaz (k987jw3wh2pc401) intocada.
 *    - Qualquer cliente que possua operador preenchido ou ficha legítima com atendimento da equipe.
 *
 * 4. Registro no histórico de auditoria (eventos_log) e total idempotência.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0128] Iniciando saneamento dos cruzamentos de 28/10...')

    let colEventos = null
    try {
      colEventos = app.findCollectionByNameOrId('eventos_log')
    } catch (_) {}

    // -----------------------------------------------------------------
    // 1. CASO WELLINGTON RODRIGO DOS SANTOS (C020260)
    // -----------------------------------------------------------------
    try {
      const wellington = app.findFirstRecordByFilter('clientes', "codigo = 'C020260'")
      if (wellington) {
        const opAtual = (wellington.getString('operador') || '').trim()
        const opReat = (wellington.getString('operador_reativacao') || '').trim()
        const opFinal = opAtual || opReat || 't1uvqnaa4av72ni'

        if (!opAtual || wellington.getString('estado') !== 'reativado') {
          console.log(
            `[MIGRATION 0128] Consolidando reativação legítima de WELLINGTON (C020260) com operador ${opFinal}`,
          )
          wellington.set('estado', 'reativado')
          wellington.set('operador', opFinal)
          if (!opReat) wellington.set('operador_reativacao', opFinal)
          app.save(wellington)

          if (colEventos) {
            try {
              const ev = new Record(colEventos)
              ev.set('cliente', wellington.id)
              ev.set('tipo_evento', 'consolidacao_reativacao_legitima')
              ev.set(
                'descricao',
                'Atribuição de operador Leiz Torso (t1uvqnaa4av72ni) para Wellington (C020260), confirmada por ficha de atendimento real e faturamento de pedido 223787.',
              )
              app.save(ev)
            } catch (eErr) {
              console.warn('[MIGRATION 0128] Falha ao gravar log Wellington:', eErr)
            }
          }
        }
      }
    } catch (errW) {
      console.warn('[MIGRATION 0128] Erro ao verificar Wellington C020260:', errW)
    }

    // -----------------------------------------------------------------
    // 2. PRESERVAÇÃO E BLINDAGEM DA SS ESTRUTURA METALICA (C012635)
    // -----------------------------------------------------------------
    try {
      const ss = app.findFirstRecordByFilter('clientes', "codigo = 'C012635'")
      if (ss) {
        const ssOp = (ss.getString('operador') || '').trim()
        const ssOpReat = (ss.getString('operador_reativacao') || '').trim()
        const targetOp = ssOp || ssOpReat || 't1uvqnaa4av72ni'
        if (!ssOp) {
          console.log(
            `[MIGRATION 0128] Preenchendo operador legítimo de SS ESTRUTURA METALICA (C012635) -> ${targetOp}`,
          )
          ss.set('operador', targetOp)
          if (!ssOpReat) ss.set('operador_reativacao', targetOp)
          app.save(ss)
        }
      }
    } catch (errSS) {
      console.warn('[MIGRATION 0128] Erro ao verificar SS Estrutura Metalica:', errSS)
    }

    // -----------------------------------------------------------------
    // 3. SANEAMENTO DOS CLIENTES CARIMBADOS EM 28/10 SEM OPERADOR
    // -----------------------------------------------------------------
    try {
      console.log(
        '[MIGRATION 0128] Buscando clientes estado=reativado com operador vazio da janela de 28/10...',
      )

      // Clientes marcados no cruzamento de 28/10 (entre 12:00 e 13:00 UTC)
      // com operador vazio e origem='importacao'
      const sqlBusca = `
        SELECT id, codigo, nome
        FROM clientes
        WHERE estado = 'reativado'
          AND (operador IS NULL OR TRIM(operador) = '')
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
      console.log(
        `[MIGRATION 0128] Total de clientes identificados para saneamento: ${rows.length}`,
      )

      if (rows.length > 0) {
        let totalReclassificados = 0
        let totalPromovidosReal = 0

        for (let i = 0; i < rows.length; i++) {
          const item = rows[i]
          const cId = item.id

          // Verificar se por acaso possui ficha real em respostas_formulario
          let fichaOp = ''
          try {
            const rfRows = arrayOf(new DynamicModel({ operador: '', desfecho: '' }))
            app
              .db()
              .newQuery(
                `SELECT operador, desfecho FROM respostas_formulario WHERE cliente = {:cId} ORDER BY created DESC LIMIT 1`,
              )
              .bind({ cId: cId })
              .all(rfRows)
            if (rfRows.length > 0 && rfRows[0].operador) {
              const d = (rfRows[0].desfecho || '').trim()
              if (d === 'reativado' || d === 'reativado_com_pedido' || d === 'fechou_pedido') {
                fichaOp = (rfRows[0].operador || '').trim()
              }
            }
          } catch (_) {}

          // Verificar se por acaso possui interação real com desfecho de reativação
          if (!fichaOp) {
            try {
              const itRows = arrayOf(new DynamicModel({ operador: '' }))
              app
                .db()
                .newQuery(
                  `SELECT operador FROM interacoes WHERE cliente = {:cId} AND (desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido') OR (numero_pedido IS NOT NULL AND TRIM(numero_pedido) != '' AND TRIM(numero_pedido) != '-')) ORDER BY created DESC LIMIT 1`,
                )
                .bind({ cId: cId })
                .all(itRows)
              if (itRows.length > 0 && itRows[0].operador) {
                fichaOp = (itRows[0].operador || '').trim()
              }
            } catch (_) {}
          }

          if (fichaOp) {
            // Possui atendimento real da equipe: vira reativado legítimo
            app
              .db()
              .newQuery(
                `UPDATE clientes SET operador = {:op}, operador_reativacao = COALESCE(NULLIF(operador_reativacao, ''), {:op}) WHERE id = {:cId}`,
              )
              .bind({ op: fichaOp, cId: cId })
              .execute()
            totalPromovidosReal++
          } else {
            // É comprador recente identificado no cruzamento sem atendimento da equipe:
            // Sai da base -> ativo_fora_base = 1, estado = 'ativo_fora_base'
            const motivo =
              'faturamento recente identificado no cruzamento em 28/10 — sem atendimento da equipe'
            app
              .db()
              .newQuery(
                `UPDATE clientes SET 
                   ativo_fora_base = 1,
                   estado = 'ativo_fora_base',
                   motivo_ativo_fora_base = {:motivo},
                   lock_timestamp = NULL
                 WHERE id = {:cId}`,
              )
              .bind({ motivo: motivo, cId: cId })
              .execute()
            totalReclassificados++
          }
        }

        console.log(
          `[MIGRATION 0128] Saneamento concluído: ${totalReclassificados} clientes reclassificados para 'ativo_fora_base', ${totalPromovidosReal} clientes promovidos a 'reativado' legítimo com operador.`,
        )

        // Registrar evento consolidado no histórico de auditoria
        if (colEventos) {
          try {
            const ev = new Record(colEventos)
            ev.set('tipo_evento', 'saneamento_cruzamento_28_10')
            ev.set(
              'descricao',
              `Saneamento v0.0.177: Reclassificação de ${totalReclassificados} clientes do cruzamento de 28/10 para ativo_fora_base e promoção de ${totalPromovidosReal} com atendimento para reativação legítima.`,
            )
            app.save(ev)
          } catch (evErr) {
            console.warn('[MIGRATION 0128] Falha ao gravar evento de auditoria geral:', evErr)
          }
        }
      } else {
        console.log(
          '[MIGRATION 0128] Nenhum cliente encontrado na janela do cruzamento de 28/10 pendente de saneamento (já saneado ou base vazia).',
        )
      }
    } catch (errCruz) {
      console.error('[MIGRATION 0128] Erro ao sanar clientes do cruzamento 28/10:', errCruz)
    }

    console.log('[MIGRATION 0128] Migração 0128 concluída com sucesso.')
  },
  (app) => {
    console.log('[MIGRATION 0128] Rollback executado (no-op para integridade dos dados).')
  },
)
