/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0137: Reparo de reativações LEGÍTIMAS falsamente carimbadas como ativo_fora_base
 *
 * As migrações 0132–0135 moveram para 'ativo_fora_base' clientes reativados usando o campo
 * `operador` como critério — mas reativações via Forms e fichas antigas preenchem
 * `operador_reativacao` (o campo `operador` fica vazio por definição nelas).
 * Resultado: reativações legítimas, com vendedor nomeado e pedido real, foram falsamente
 * carimbadas com o motivo "identificado no cruzamento ERP sem operador".
 *
 * Esta migração:
 * 1. Seleciona clientes com estado='ativo_fora_base' E motivo contendo "cruzamento ERP sem operador";
 * 2. Procura EVIDÊNCIA de ação humana:
 *    a) campo `operador_reativacao` preenchido; OU
 *    b) ficha (respostas_formulario) com desfecho de reativação vinculada a operador real; OU
 *    c) interação com desfecho de reativação/pedido vinculada a operador real;
 * 3. Se houver evidência: restaura estado='reativado', limpa o motivo falso, restaura
 *    operador/operador_reativacao/reativado_em/pedido_reativacao quando disponíveis;
 * 4. NÃO toca em clientes sem evidência (fantasmas do cruzamento ERP) nem nos reativados legítimos;
 * 5. Idempotente: a seleção só pega quem AINDA está ativo_fora_base com o motivo falso —
 *    rodar de novo não duplica nem reverte nada.
 */
migrate(
  (app) => {
    console.log('[MIGRATION 0137] Iniciando reparo de reativações falsamente carimbadas...')

    const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

    // 1. Candidatos: ainda ativo_fora_base com o motivo falso gravado por 0132–0135
    const sqlCandidatos = `
      SELECT id, codigo, nome, operador_reativacao, reativado_em, pedido_reativacao
      FROM clientes
      WHERE estado = 'ativo_fora_base'
        AND motivo_ativo_fora_base LIKE '%cruzamento ERP sem operador%'
    `
    const candidatos = arrayOf(
      new DynamicModel({
        id: '',
        codigo: '',
        nome: '',
        operador_reativacao: '',
        reativado_em: '',
        pedido_reativacao: '',
      }),
    )
    app.db().newQuery(sqlCandidatos).all(candidatos)
    console.log(`[MIGRATION 0137] Candidatos com motivo falso: ${candidatos.length}`)

    let restaurados = 0
    const amostra = []

    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i]

      // Evidência 1: ficha de atendimento (Forms/ficha) com desfecho de reativação por operador real
      const sqlFicha = `
        SELECT rf.operador as operador, rf.desfecho as desfecho, rf.created as created,
               i.numero_pedido as numero_pedido
        FROM respostas_formulario rf
        LEFT JOIN interacoes i ON i.id = rf.interacao
        WHERE rf.cliente = {:cid}
          AND rf.operador IS NOT NULL AND TRIM(rf.operador) != ''
          AND rf.desfecho IN ${DESFECHOS_REATIVACAO}
        ORDER BY rf.created DESC
        LIMIT 1
      `
      const fichaRows = arrayOf(
        new DynamicModel({ operador: '', desfecho: '', created: '', numero_pedido: '' }),
      )
      app.db().newQuery(sqlFicha).bind({ cid: c.id }).all(fichaRows)

      let evOperador = ''
      let evDesfecho = ''
      let evCreated = ''
      let evPedido = ''
      let evOrigem = ''

      if (fichaRows.length > 0 && fichaRows[0].operador) {
        evOperador = fichaRows[0].operador
        evDesfecho = fichaRows[0].desfecho || 'reativado'
        evCreated = fichaRows[0].created || ''
        evPedido = fichaRows[0].numero_pedido || ''
        evOrigem = 'ficha_forms'
      } else if (c.operador_reativacao && String(c.operador_reativacao).trim() !== '') {
        // Evidência 2: campo operador_reativacao preenchido (reativação via Forms/ficha antiga)
        evOperador = c.operador_reativacao
        evDesfecho = 'reativado'
        evCreated = c.reativado_em || ''
        evOrigem = 'operador_reativacao'
      } else {
        // Evidência 3: interação com desfecho de reativação/pedido por operador real
        const sqlInt = `
          SELECT i.operador as operador, i.desfecho as desfecho, i.created as created,
                 i.numero_pedido as numero_pedido
          FROM interacoes i
          WHERE i.cliente = {:cid}
            AND i.operador IS NOT NULL AND TRIM(i.operador) != ''
            AND (i.desfecho IN ${DESFECHOS_REATIVACAO}
                 OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-'))
          ORDER BY i.created DESC
          LIMIT 1
        `
        const intRows = arrayOf(
          new DynamicModel({ operador: '', desfecho: '', created: '', numero_pedido: '' }),
        )
        app.db().newQuery(sqlInt).bind({ cid: c.id }).all(intRows)

        if (intRows.length > 0 && intRows[0].operador) {
          evOperador = intRows[0].operador
          evDesfecho = intRows[0].desfecho || 'reativado'
          evCreated = intRows[0].created || ''
          evPedido = intRows[0].numero_pedido || ''
          evOrigem = 'interacao'
        }
      }

      // Sem evidência: permanece ativo_fora_base (fantasma do cruzamento ERP) — não tocar
      if (!evOperador) continue

      app
        .db()
        .newQuery(
          `UPDATE clientes SET
             estado = 'reativado',
             ativo_fora_base = 0,
             motivo_ativo_fora_base = '',
             operador = {:evOperador},
             operador_reativacao = CASE
               WHEN operador_reativacao IS NULL OR TRIM(operador_reativacao) = '' THEN {:evOperador}
               ELSE operador_reativacao
             END,
             reativado_em = CASE
               WHEN reativado_em IS NULL OR reativado_em = '' THEN {:evCreated}
               ELSE reativado_em
             END,
             pedido_reativacao = CASE
               WHEN pedido_reativacao IS NULL OR TRIM(pedido_reativacao) = '' THEN {:evPedido}
               ELSE pedido_reativacao
             END,
             lock_timestamp = '1970-01-01 00:00:00.000Z'
           WHERE id = {:cid}`,
        )
        .bind({
          evOperador: evOperador,
          evCreated: evCreated,
          evPedido: evPedido,
          cid: c.id,
        })
        .execute()

      restaurados++
      if (amostra.length < 50) {
        amostra.push({
          codigo: c.codigo,
          nome: c.nome,
          origem: evOrigem,
          desfecho: evDesfecho,
          pedido: evPedido,
        })
      }
    }

    console.log(`[MIGRATION 0137] Clientes restaurados para reativado: ${restaurados}`)

    // Auditoria no mesmo padrão de 0132–0135 (amostra + contagem)
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      if (colEventos) {
        const ev = new Record(colEventos)
        ev.set('acao', 'reparo_reativados_falsos_cruzamento_0137')
        ev.set('detalhes', {
          total_restaurados: restaurados,
          total_candidatos: candidatos.length,
          criterio_evidencia:
            'operador_reativacao preenchido OU ficha/interacao com desfecho de reativacao por operador real',
          amostra: amostra,
          versao: '0137',
        })
        app.save(ev)
      }
    } catch (logErr) {
      console.log(
        '[MIGRATION 0137] Falha ao registrar eventos_log: ' +
          (logErr && logErr.message ? logErr.message : String(logErr)),
      )
    }

    console.log('[MIGRATION 0137] Finalizada com sucesso!')
  },
  (app) => {},
)
