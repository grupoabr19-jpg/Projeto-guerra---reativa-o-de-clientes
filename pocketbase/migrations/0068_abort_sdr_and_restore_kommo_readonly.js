migrate(
  (app) => {
    // Desativar ou sinalizar configuração sdr_bot_config como inativa
    try {
      const cfg = app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      if (cfg) {
        cfg.set('valor', {
          ativo: false,
          status: 'abortado',
          mensagem: 'Projeto de atendimento via Kommo e SDR cancelado pelo usuário.',
        })
        app.save(cfg)
      }
    } catch (_) {}

    // Garantir modo somente-leitura nas configuracoes
    try {
      const kCfg = app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
      if (kCfg) {
        const v = kCfg.get('valor') || {}
        v.modo = 'readonly'
        v.somente_leitura = true
        kCfg.set('valor', v)
        app.save(kCfg)
      }
    } catch (_) {}
  },
  (app) => {
    // rollback
  },
)
