routerAdd(
  'POST',
  '/backend/v1/queue/transfer-client',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userId = authRecord.id
      const userName = authRecord.getString('name') || authRecord.getString('email') || 'Operador'
      const userRole = authRecord.getString('role')

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = body.cliente_id ? String(body.cliente_id).trim() : ''
      const destinoOperadorId = body.destino_operador_id
        ? String(body.destino_operador_id).trim()
        : ''
      const motivo = body.motivo ? String(body.motivo).trim() : 'Transferência de carteira/região'

      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }
      if (!destinoOperadorId) {
        return e.json(400, { error: 'destino_operador_id é obrigatório' })
      }
      if (destinoOperadorId === userId) {
        return e.json(400, { error: 'Não é possível transferir o cliente para você mesmo' })
      }

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      // Validar operador de destino
      const destinoUser = $app.findRecordById('users', destinoOperadorId)
      if (!destinoUser) {
        return e.json(404, { error: 'Operador de destino não encontrado' })
      }

      const destinoNome =
        destinoUser.getString('name') || destinoUser.getString('email') || 'Colega'

      // Verificar permissão: admin pode transferir qualquer um;
      // operador/supervisor só pode transferir se o cliente estiver com ele (operador = userId) ou na fila
      const currentOp = cliente.getString('operador')
      if (userRole !== 'admin' && currentOp && currentOp !== userId) {
        return e.json(403, {
          error: 'Você não tem permissão para transferir um cliente reservado por outro operador',
        })
      }

      const estadoAnterior = cliente.getString('estado')

      // Configurar cliente como reagendado para HOJE com prioridade máxima para o operador de destino
      const now = new Date()
      const hojeIso = now.toISOString()

      // Liberar lock atual e atribuir reagendamento prioritário
      cliente.set('estado', 'reagendado')
      cliente.set('operador', '') // Libera lock de atendimento ativo
      cliente.set('lock_timestamp', null)
      cliente.set('reagendado_operador', destinoOperadorId)
      cliente.set('reagendado_para', hojeIso)
      cliente.set('prioridade_transferencia', true)

      // Se enviou rascunho de respostas para preservar o que já foi preenchido
      if (body.rascunho_respostas) {
        cliente.set('rascunho_respostas', body.rascunho_respostas)
      }

      $app.save(cliente)

      // Registrar interação de histórico
      try {
        const colInteracoes = $app.findCollectionByNameOrId('interacoes')
        const it = new Record(colInteracoes)
        it.set('cliente', cliente.id)
        it.set('operador', userId)
        it.set('tipo', 'status')
        it.set('desfecho', 'transferido')
        it.set('motivo', motivo)
        it.set(
          'conteudo',
          `Cliente transferido por ${userName} para ${destinoNome}.\nMotivo: ${motivo}\nPrioridade imediata aplicada para o colega de rota.`,
        )
        it.set('reagendado_para', hojeIso)
        it.set('estado_anterior', estadoAnterior)
        it.set('estado_novo', 'reagendado')
        $app.save(it)
      } catch (itErr) {
        console.log('[transfer-client] Erro ao registrar interacao: ' + itErr.message)
      }

      // Registrar evento de log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', userId)
        ev.set('acao', 'cliente_transferido')
        ev.set('detalhes', {
          origem_usuario_id: userId,
          origem_usuario_nome: userName,
          destino_operador_id: destinoOperadorId,
          destino_operador_nome: destinoNome,
          motivo: motivo,
          regiao_cliente: cliente.getString('regiao'),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: `Cliente transferido com sucesso para ${destinoNome}! Aparecerá como prioridade nos follow-ups dele.`,
        cliente: cliente,
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
