/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 1762812001: backfill idempotente de toneladas_historico (kg) a partir
 * de peso_nf_tonelagem (toneladas) para QUALQUER cliente da base (não apenas
 * reativados) que tenha peso apenas no campo da esteira do ERP.
 *
 * Regra (idempotente, não destrutiva):
 *   - toneladas_historico IS NULL ou = 0 E peso_nf_tonelagem > 0
 *     => toneladas_historico = peso_nf_tonelagem * 1000 (t -> kg).
 *   - NUNCA sobrescreve kg > 0 com 0 e nunca inventa peso ausente
 *     (cliente com 0 nos dois campos permanece 0 — caso FERMUNK).
 *   - Auditoria em eventos_log (acao='backfill_replicacao_peso_nf').
 */
migrate(
  (app) => {
    const T = '[1762812001_backfill_replicacao_peso_nf]'

    let convertidos = 0
    let puladosJaOk = 0
    const exemplos = []

    try {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          codigo: '',
          nome: '',
          peso_nf: -0,
        }),
      )

      app
        .db()
        .newQuery(
          `SELECT id, codigo, nome, COALESCE(peso_nf_tonelagem, 0) as peso_nf
           FROM clientes
           WHERE (toneladas_historico IS NULL OR toneladas_historico = 0)
             AND COALESCE(peso_nf_tonelagem, 0) > 0`,
        )
        .all(rows)

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const pesoTon = Number(row.peso_nf || 0)
        if (!(pesoTon > 0)) continue

        let rec
        try {
          rec = app.findRecordById('clientes', row.id)
        } catch (_) {
          continue
        }

        // Dupla checagem idempotente (registro pode ter mudado desde o SELECT)
        if (Number(rec.getFloat('toneladas_historico') || 0) > 0) {
          puladosJaOk++
          continue
        }

        const kgBackfill = Number((pesoTon * 1000).toFixed(4))
        rec.set('toneladas_historico', kgBackfill)
        app.save(rec)
        convertidos++

        if (exemplos.length < 10) {
          exemplos.push({
            id: row.id,
            codigo: row.codigo,
            nome: row.nome,
            peso_nf_tonelagem: pesoTon,
            toneladas_historico_kg: kgBackfill,
          })
        }
      }
    } catch (errQuery) {
      console.log(
        T +
          ' Erro no backfill: ' +
          (errQuery && errQuery.message ? errQuery.message : String(errQuery)),
      )
    }

    // Auditoria em eventos_log (console.log de migration não aparece nos logs)
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEventos)
      ev.set('acao', 'backfill_replicacao_peso_nf')
      ev.set('detalhes', {
        data_execucao: new Date().toISOString(),
        clientes_convertidos: convertidos,
        clientes_pulados_ja_ok: puladosJaOk,
        exemplos: exemplos,
      })
      app.save(ev)
      console.log(T + ' concluido: convertidos=' + convertidos + ', pulados_ja_ok=' + puladosJaOk)
    } catch (evErr) {
      console.log(T + ' Falha ao gravar eventos_log: ' + String(evErr))
    }
  },
  (app) => {
    // Rollback: não destrutivo — nada a desfazer (backfill idempotente)
  },
)
