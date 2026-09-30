/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0040_test_base_kpis_endpoint_call.js (mantido para histórico de migrações aplicadas)
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'kpis_call_validation_result')
      if (rec) {
        app.delete(rec)
      }
    } catch (_) {}
  },
  (app) => {
    // down
  },
)
