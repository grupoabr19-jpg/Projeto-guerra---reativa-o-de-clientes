migrate(
  (app) => {
    // Inicializa a configuração de metas operacionais
    // Estrutura prevê meta global e metas específicas por região
    try {
      const existing = app.findFirstRecordByData('configuracoes', 'chave', 'metas_operacionais')
      if (existing) return
    } catch (_) {}

    const col = app.findCollectionByNameOrId('configuracoes')
    const record = new Record(col)
    record.set('chave', 'metas_operacionais')
    record.set(
      'descricao',
      'Metas operacionais de contatos diários e conversões semanais (globais e por região)',
    )
    record.set('valor', {
      global: {
        contatos_dia: 40,
        conversoes_semana: 5,
      },
      por_regiao: {},
      atualizado_em: new Date().toISOString(),
    })
    app.save(record)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'metas_operacionais')
      app.delete(rec)
    } catch (_) {}
  },
)
