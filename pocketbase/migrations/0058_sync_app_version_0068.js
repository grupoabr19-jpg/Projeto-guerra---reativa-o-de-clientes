migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'app_version')
      const val = rec.get('valor')
      let data = {}
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        data = JSON.parse(val)
      } else if (val && typeof val === 'object') {
        data = val
      }
      // Se a versão cadastrada era a inicial 1.0.0 de teste, alinhar com 0.0.68
      if (data.version === '1.0.0' || data.build_id === 'build-1.0.0') {
        rec.set('valor', {
          version: '0.0.68',
          build_id: 'v0.0.68',
          published_at: new Date().toISOString(),
          mensagem: 'Nova versão do Projeto Guerra disponível!',
          force_reload: false,
        })
        app.save(rec)
      }
    } catch (_) {}
  },
  () => {},
)
