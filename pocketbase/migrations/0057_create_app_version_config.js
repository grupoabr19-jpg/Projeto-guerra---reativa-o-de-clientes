migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('configuracoes')

    try {
      app.findFirstRecordByData('configuracoes', 'chave', 'app_version')
    } catch (_) {
      const rec = new Record(col)
      rec.set('chave', 'app_version')
      rec.set('descricao', 'Controle de versão do frontend e pulso de atualização do navegador')
      rec.set('valor', {
        version: '1.0.0',
        build_id: 'build-1.0.0',
        published_at: new Date().toISOString(),
        mensagem: 'Nova versão do Projeto Guerra disponível!',
        force_reload: false,
      })
      app.save(rec)
    }
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'app_version')
      app.delete(rec)
    } catch (_) {}
  },
)
