/// <reference path="../pb_data/types.d.ts" />

// Endpoint GET: Qualquer usuário autenticado (operador, líder, supervisor, admin) pode consultar as metas
routerAdd(
  'GET',
  '/backend/v1/metas',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      let metasData = {
        global: {
          contatos_dia: 0,
          conversoes_semana: 0,
        },
        por_regiao: {},
      }

      try {
        const record = $app.findFirstRecordByData('configuracoes', 'chave', 'metas_operacionais')
        if (record && record.get('valor')) {
          metasData = record.get('valor')
        }
      } catch (_) {}

      return e.json(200, metasData)
    } catch (err) {
      console.error('[metas-get] Erro:', err)
      return e.json(500, {
        error: 'Erro ao carregar metas: ' + (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)

// Endpoint PUT / POST: EXCLUSIVO ADMIN para atualizar as metas operacionais
routerAdd(
  'POST',
  '/backend/v1/metas',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const role = authRecord.getString('role')
      if (role !== 'admin') {
        return e.json(403, { error: 'Apenas administradores podem gerenciar metas operacionais' })
      }

      const body = e.requestInfo().body || {}
      const globalMeta = body.global || {}
      const porRegiao = body.por_regiao || {}

      const contatosDia = parseInt(globalMeta.contatos_dia, 10)
      const conversoesSemana = parseInt(globalMeta.conversoes_semana, 10)

      const payload = {
        global: {
          contatos_dia: isNaN(contatosDia) || contatosDia < 0 ? 0 : contatosDia,
          conversoes_semana: isNaN(conversoesSemana) || conversoesSemana < 0 ? 0 : conversoesSemana,
        },
        por_regiao: porRegiao,
        atualizado_em: new Date().toISOString(),
        atualizado_por: authRecord.id,
      }

      let record
      try {
        record = $app.findFirstRecordByData('configuracoes', 'chave', 'metas_operacionais')
      } catch (_) {
        const col = $app.findCollectionByNameOrId('configuracoes')
        record = new Record(col)
        record.set('chave', 'metas_operacionais')
        record.set(
          'descricao',
          'Metas operacionais de contatos diários e conversões semanais (globais e por região)',
        )
      }

      record.set('valor', payload)
      $app.save(record)

      // Registrar auditoria em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', 'metas_operacionais_atualizadas')
        ev.set('detalhes', payload)
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: 'Metas salvas com sucesso!',
        metas: payload,
      })
    } catch (err) {
      console.error('[metas-post] Erro:', err)
      return e.json(500, {
        error: 'Erro ao atualizar metas: ' + (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
