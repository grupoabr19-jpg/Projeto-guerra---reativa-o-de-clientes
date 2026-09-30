/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0039_verify_counts_and_clean.js
    const countTotal = app.countRecords('clientes')

    const confCol = app.findCollectionByNameOrId('configuracoes')
    let rec
    try {
      rec = app.findFirstRecordByData('configuracoes', 'chave', 'kpis_endpoint_test_result')
    } catch (_) {
      rec = new Record(confCol)
      rec.set('chave', 'kpis_endpoint_test_result')
    }
    rec.set('valor', {
      countTotalGeralClientes: countTotal,
      timestamp: new Date().toISOString(),
    })
    rec.set('descricao', 'Verificação de contagem de clientes')
    app.save(rec)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'kpis_endpoint_test_result')
      app.delete(rec)
    } catch (_) {}
  },
)
