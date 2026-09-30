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

      const destinoRole = destinoUser.getString('role')
      // Apenas operadores, líderes ou supervisores podem receber clientes reatribuídos
      if (destinoRole !== 'operador' && destinoRole !== 'lider' && destinoRole !== 'supervisor') {
        return e.json(400, {
          error: 'O destinatário deve ser um operador, líder ou supervisor de rota.',
        })
      }

      // Função auxiliar de normalização de região (inline no callback do hook)
      const normalizarRegiaoHook = (r) => {
        let s = String(r || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
        if (s === 'BRAGANCA PAULISTA' || s === 'BRAGANCA') return 'BRAGANCA'
        if (s === 'POCOS DE CALDAS' || s === 'POCOS CALDAS' || s === 'POCOS') {
          return 'POCOS DE CALDAS'
        }
        if (s === 'CAMBUI' || s === 'MICRO-REGIAO' || s === 'MICRO REGIAO' || s === 'MICROREGIAO') {
          return 'CAMBUI'
        }
        if (s === 'JUNDIAI') return 'JUNDIAI'
        if (s === 'ITAJUBA') return 'ITAJUBA'
        if (s === 'POUSO ALEGRE') return 'POUSO ALEGRE'
        if (s === 'VARGINHA') return 'VARGINHA'
        if (s === 'EXTREMA') return 'EXTREMA'
        return s
      }

      // Extrair regiões de um record de usuário (resiliente com Goja PocketBase)
      const extrairRegioesUsuario = (rec) => {
        let arr = []
        try {
          const slice = rec.getStringSlice('regioes')
          if (slice && slice.length > 0) {
            arr = slice
          } else {
            const raw = rec.getString('regioes')
            if (raw && raw.trim().startsWith('[')) {
              arr = JSON.parse(raw)
            } else {
              const rawGet = rec.get('regioes')
              if (Array.isArray(rawGet)) arr = rawGet
            }
          }
        } catch (_) {
          const rawGet = rec.get('regioes')
          if (Array.isArray(rawGet)) arr = rawGet
        }
        if (Array.isArray(arr)) {
          return arr.map(normalizarRegiaoHook).filter(Boolean)
        }
        return []
      }

      const destinoRegioesNorm = extrairRegioesUsuario(destinoUser)
      const origemRegioesNorm = extrairRegioesUsuario(authRecord)
      const clienteRegiaoNorm = normalizarRegiaoHook(cliente.getString('regiao'))

      // Se o atendente atual for operador ou líder e não tiver região definida
      if ((userRole === 'operador' || userRole === 'lider') && origemRegioesNorm.length === 0) {
        return e.json(400, {
          error:
            'Sua conta não possui região/rota atribuída. Contate o administrador antes de repassar clientes.',
        })
      }

      // Validação de região entre cliente/atendente e destinatário:
      // O destinatário precisa compartilhar ao menos uma região com o atendente (ou com a região do cliente)
      if (userRole !== 'admin') {
        const atendeCliente = clienteRegiaoNorm && destinoRegioesNorm.includes(clienteRegiaoNorm)
        const compartilhaOrigem = origemRegioesNorm.some((r) => destinoRegioesNorm.includes(r))

        if (!atendeCliente && !compartilhaOrigem) {
          return e.json(400, {
            error:
              'O operador de destino não pertence à mesma região/rota do cliente ou do seu usuário.',
          })
        }
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
