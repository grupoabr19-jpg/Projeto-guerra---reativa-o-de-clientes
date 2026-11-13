/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0142: Backfill de toneladas_historico em kg para clientes reativados.
 *
 * Problema: pós-migração 0141 (unidade canônica kg), vários clientes reativados
 * ficaram com toneladas_historico = 0 enquanto o peso real (em TONELADAS) vive
 * apenas em peso_nf_tonelagem, alimentado pela sincronização ERP.
 *
 * Regra (idempotente, não destrutiva):
 *   - Clientes com estado='reativado' E toneladas_historico <= 0 E peso_nf_tonelagem > 0
 *     recebem toneladas_historico = peso_nf_tonelagem * 1000 (converte t -> kg).
 *   - Cliente sem peso em NENHUM dos dois campos (ex.: FERMUNK C018263) permanece 0.
 *   - Clientes já corretos (ex.: ton_historico=48000 kg / peso_nf=48) NÃO são tocados.
 *   - Auditoria completa em eventos_log (acao='backfill_tonelagem_reativados'). Zero exclusões.
 */
migrate(
  (app) => {
    const T = '[0142_backfill_tonelagem_reativados]'

    let convertidos = 0
    let puladosJaOk = 0
    let puladosSemPeso = 0
    const exemplos = []

    try {
      // Uma linha por cliente reativado com toneladas_historico vazio/zero;
      // peso_nf_tonelagem (em toneladas) vem junto para conversão em JS.
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
           WHERE estado = 'reativado'
             AND (toneladas_historico IS NULL OR toneladas_historico = 0)
             AND COALESCE(peso_nf_tonelagem, 0) > 0`,
        )
        .all(rows)

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const pesoTon = Number(row.peso_nf || 0)
        if (!(pesoTon > 0)) {
          puladosSemPeso++
          continue
        }

        let rec
        try {
          rec = app.findRecordById('clientes', row.id)
        } catch (_) {
          continue
        }

        // Dupla checagem idempotente (o registro pode ter mudado desde o SELECT)
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

    // Auditoria em eventos_log (zero exclusões)
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEventos)
      ev.set('acao', 'backfill_tonelagem_reativados')
      ev.set('detalhes', {
        data_execucao: new Date().toISOString(),
        clientes_convertidos: convertidos,
        clientes_ja_ok: puladosJaOk,
        clientes_sem_peso: puladosSemPeso,
        exemplos: exemplos,
        descricao:
          'toneladas_historico (kg) preenchido com peso_nf_tonelagem (t) * 1000 para reativados com historico vazio',
      })
      app.save(ev)
      console.log(
        T +
          ' Concluido. Convertidos: ' +
          convertidos +
          ', ja ok: ' +
          puladosJaOk +
          ', sem peso: ' +
          puladosSemPeso,
      )
    } catch (errLog) {
      console.log(T + ' Falha ao registrar auditoria: ' + errLog)
    }
  },
  (app) => {
    // Down: reversão não restauraria o estado anterior com segurança
    // (não há como distinguir backfill de valor original); no-op deliberado.
  },
)
