migrate(
  (app) => {
    // Limpeza de chaves de probe
    const chaves = [
      'probe_reativados_analytics',
      'probe_counts',
      'probe_scores',
      'probe_inatividade',
    ]
    for (let i = 0; i < chaves.length; i++) {
      try {
        const rec = app.findFirstRecordByData('configuracoes', 'chave', chaves[i])
        app.delete(rec)
      } catch (_) {}
    }
  },
  (app) => {},
)
