/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook de controle de versão do Projeto Guerra.
 * Permite que o frontend consulte a versão ativa e que admins emitam pulso de atualização.
 *
 * Endpoints:
 * - GET  /backend/v1/app/version   : Retorna a versão atual cadastrada (público / auth)
 * - POST /backend/v1/app/version   : Atualiza versão / buildId e emite pulso (exclusivo admin)
 */

routerAdd('GET', '/backend/v1/app/version', (e) => {
  try {
    let versionData = {
      version: '0.0.177',
      build_id: 'v0.0.177',
      published_at: new Date().toISOString(),
      mensagem: '',
      force_reload: false,
    }

    try {
      const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'app_version')
      const val = cfg.get('valor')
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        versionData = JSON.parse(val)
      } else if (val && typeof val === 'object') {
        versionData = val
      }
    } catch (_) {
      // Usa fallback
    }

    const resPayload = Object.assign({ ok: true }, versionData, {
      server_time: new Date().toISOString(),
    })
    return e.json(200, resPayload)
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err)
    return e.json(500, { error: 'Falha ao buscar versão: ' + errMsg })
  }
})

routerAdd(
  'POST',
  '/backend/v1/app/version',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const role = authRecord.getString('role')
      if (role !== 'admin') {
        return e.json(403, { error: 'Apenas administradores podem atualizar versão do sistema' })
      }

      const info = e.requestInfo()
      const body = (info && info.body) || {}
      const novaVersao = String(body.version || '1.0.0').trim()
      const novoBuildId = String(body.build_id || `build-${Date.now()}`).trim()
      const mensagem = String(body.mensagem || 'Nova versão do sistema liberada!').trim()
      const forceReload = Boolean(body.force_reload)

      let cfg
      try {
        cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'app_version')
      } catch (_) {
        const col = $app.findCollectionByNameOrId('configuracoes')
        cfg = new Record(col)
        cfg.set('chave', 'app_version')
        cfg.set('descricao', 'Controle de versão do frontend e pulso de atualização do navegador')
      }

      const payload = {
        version: novaVersao,
        build_id: novoBuildId,
        published_at: new Date().toISOString(),
        mensagem: mensagem,
        force_reload: forceReload,
        updated_by: authRecord.id,
      }

      cfg.set('valor', payload)
      $app.save(cfg)

      // Se solicitado disparo no chat ou broadcast:
      if (body.disparar_chat_aviso) {
        try {
          const geral = $app.findFirstRecordByData('chat_conversas', 'tipo', 'geral')
          const colMsg = $app.findCollectionByNameOrId('chat_mensagens')
          const msgRec = new Record(colMsg)
          msgRec.set('conversa', geral.id)
          msgRec.set('autor', authRecord.id)
          msgRec.set('autor_nome', authRecord.getString('name') || 'Administração')
          msgRec.set('autor_role', 'admin')
          msgRec.set(
            'texto',
            `🚀 [ATUALIZAÇÃO DO SISTEMA v${novaVersao}] ${mensagem} - Por favor, recarregue a página para aplicar as melhorias.`,
          )
          msgRec.set('tipo', 'aviso')
          $app.save(msgRec)
        } catch (chatErr) {
          console.warn('[app_version] Aviso no chat não pôde ser gerado:', chatErr)
        }
      }

      return e.json(200, Object.assign({ ok: true }, payload))
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha ao atualizar versão: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
