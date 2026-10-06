routerAdd(
  'POST',
  '/backend/v1/queue/release-lock',
  (e) => {
    try {
      const userId = e.auth?.id
      if (!userId) return e.unauthorizedError('auth required')

      const body = e.requestInfo().body || {}
      const clienteId = body.cliente_id
      if (!clienteId) return e.badRequestError('cliente_id é obrigatório')

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) return e.notFoundError('Cliente não encontrado')

      // Salvar rascunho de respostas se enviado
      if (body.rascunho_respostas) {
        cliente.set('rascunho_respostas', body.rascunho_respostas)
      }

      // Libera operador e volta para 'na_base' se ainda estava reservado ou em_atendimento
      const estado = cliente.getString('estado')
      if (estado === 'reservado' || estado === 'em_atendimento') {
        // PRESERVAÇÃO DE STANDBY: se o cliente estava reativado em standby e foi aberto em lock por admin,
        // ele NÃO deve cair para 'na_base'! Deve voltar para 'reativado'!
        const standbyAteStr = cliente.getString('standby_ate')
        let emStandby = false
        if (standbyAteStr) {
          const parsedStandby = new Date(standbyAteStr)
          if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > new Date().getTime()) {
            emStandby = true
          }
        }

        const novoEstado = emStandby ? 'reativado' : 'na_base'
        cliente.set('estado', novoEstado)
        cliente.set('operador', '')
        cliente.set('lock_timestamp', null)
        $app.save(cliente)
        try {
          const colEv = $app.findCollectionByNameOrId('eventos_log')
          const ev = new Record(colEv)
          ev.set('cliente', cliente.id)
          ev.set('usuario', userId)
          ev.set('acao', 'lock_liberado')
          ev.set('detalhes', { motivo: body.motivo || 'liberacao_manual_ou_abandono' })
          $app.save(ev)
        } catch (_) {}
      }

      return e.json(200, { ok: true, message: 'Contato liberado e devolvido à fila.' })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
