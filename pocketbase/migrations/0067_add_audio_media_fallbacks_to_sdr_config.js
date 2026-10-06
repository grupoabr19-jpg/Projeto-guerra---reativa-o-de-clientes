/// <reference path="../pb_data/types.d.ts" />

/**
 * 0067_add_audio_media_fallbacks_to_sdr_config.js
 *
 * Atualiza o registro sdr_bot_config na coleção `configuracoes` para incluir:
 * - fallback_audio: texto educado caso transcrição falhe ou esteja indisponível
 * - fallback_imagem: texto educado para fotos, imagens e documentos anexos
 * - transcrever_audio_ativo: flag para tentar transcrever áudio
 */
migrate(
  (app) => {
    try {
      let cfgRec = null
      try {
        cfgRec = app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      } catch (_) {}

      if (!cfgRec) {
        const configCol = app.findCollectionByNameOrId('configuracoes')
        cfgRec = new Record(configCol)
        cfgRec.set('chave', 'sdr_bot_config')
        cfgRec.set(
          'descricao',
          'Configurações de comportamento, prompt e regras do Bot SDR Grupo ABR',
        )
      }

      const currentVal = cfgRec.get('valor') || {}
      const fallbackAudioDefault =
        'Recebi seu áudio! Para eu te atender mais rápido, pode me enviar por texto?'
      const fallbackImagemDefault = 'Recebi sua imagem! Pode me descrever o que precisa por texto?'

      const updatedVal = Object.assign({}, currentVal, {
        fallback_audio: currentVal.fallback_audio || fallbackAudioDefault,
        fallback_imagem: currentVal.fallback_imagem || fallbackImagemDefault,
        transcrever_audio_ativo:
          typeof currentVal.transcrever_audio_ativo === 'boolean'
            ? currentVal.transcrever_audio_ativo
            : true,
      })

      cfgRec.set('valor', updatedVal)
      app.save(cfgRec)
    } catch (err) {
      console.log('[0067_migration] Erro ao atualizar sdr_bot_config: ' + err.message)
    }
  },
  (app) => {
    try {
      const cfgRec = app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      const currentVal = cfgRec.get('valor') || {}
      delete currentVal.fallback_audio
      delete currentVal.fallback_imagem
      delete currentVal.transcrever_audio_ativo
      cfgRec.set('valor', currentVal)
      app.save(cfgRec)
    } catch (_) {}
  },
)
