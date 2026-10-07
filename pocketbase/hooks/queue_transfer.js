// pocketbase/hooks/queue_transfer.js
// Transferência de clientes entre operadores da mesma região/rota
// Implementa as 7 correções da auditoria 0080

routerAdd(
  'POST',
  '/backend/v1/queue/transfer-client',
  (e) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function normalizarRegiaoCanonica(r) {
      const norm = normalizarTextoNFD(r)
      if (!norm) return ''
      if (norm === 'BRAGANCA' || norm === 'BRAGANCA PAULISTA' || norm.includes('BRAGANCA')) {
        return 'BRAGANÇA'
      }
      if (
        norm === 'CAMBUI' ||
        norm === 'MICRO-REGIAO' ||
        norm === 'MICRO REGIAO' ||
        norm === 'MICROREGIAO' ||
        norm.includes('CAMBUI')
      ) {
        return 'CAMBUÍ'
      }
      if (
        norm === 'POCOS DE CALDAS' ||
        norm === 'POCOS CALDAS' ||
        norm === 'POCOS' ||
        norm.includes('POCOS') ||
        norm.includes('CALDAS')
      ) {
        return 'POÇOS DE CALDAS'
      }
      if (norm === 'JUNDIAI' || norm.includes('JUNDIAI')) {
        return 'JUNDIAÍ'
      }
      if (norm === 'ITAJUBA' || norm.includes('ITAJUBA')) {
        return 'ITAJUBÁ'
      }
      if (norm === 'VARGINHA' || norm.includes('VARGINHA')) {
        return 'VARGINHA'
      }
      if (norm === 'POUSO ALEGRE' || norm.includes('POUSO')) {
        return 'POUSO ALEGRE'
      }
      if (norm === 'EXTREMA' || norm.includes('EXTREMA')) {
        return 'EXTREMA'
      }
      if (norm === 'ATACADO') {
        return 'ATACADO'
      }
      if (norm === 'REPESCAGEM') {
        return 'REPESCAGEM'
      }
      return norm
    }

    function expurgarLocksExpiradosAtomicamente(appInstance) {
      const now = new Date()
      const cutoffLock = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      const nowIso = now.toISOString()

      let liberados = 0
      try {
        const resBase = appInstance
          .db()
          .newQuery(
            `UPDATE clientes
             SET estado = 'na_base', operador = '', lock_timestamp = '1970-01-01 00:00:00.000Z'
             WHERE (estado = 'reservado' OR estado = 'em_atendimento')
               AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp <= '1970-01-01 00:00:00.000Z' OR lock_timestamp < {:cutoff})
               AND (standby_ate IS NULL OR standby_ate = '' OR datetime(standby_ate) <= datetime({:now}))`,
          )
          .bind({ cutoff: cutoffLock, now: nowIso })
          .execute()

        if (resBase && typeof resBase.rowsAffected === 'function') {
          liberados += resBase.rowsAffected()
        }

        const resStandby = appInstance
          .db()
          .newQuery(
            `UPDATE clientes
             SET estado = 'reativado', operador = '', lock_timestamp = '1970-01-01 00:00:00.000Z'
             WHERE (estado = 'reservado' OR estado = 'em_atendimento')
               AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp <= '1970-01-01 00:00:00.000Z' OR lock_timestamp < {:cutoff})
               AND standby_ate IS NOT NULL AND standby_ate != '' AND datetime(standby_ate) > datetime({:now})`,
          )
          .bind({ cutoff: cutoffLock, now: nowIso })
          .execute()

        if (resStandby && typeof resStandby.rowsAffected === 'function') {
          liberados += resStandby.rowsAffected()
        }
      } catch (err) {
        console.log('[expurgo_locks] Erro ao executar expurgo de locks: ' + err.message)
      }
      return liberados
    }

    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userId = authRecord.id
      const userName = authRecord.getString('name') || authRecord.getString('email') || 'Operador'
      const userRole = authRecord.getString('role')

      // Expurgo de locks antes de processar transferência
      expurgarLocksExpiradosAtomicamente($app)

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
      if (destinoRole !== 'operador' && destinoRole !== 'lider' && destinoRole !== 'supervisor') {
        return e.json(400, {
          error: 'O destinatário deve ser um operador, líder ou supervisor de rota.',
        })
      }

      // Extrair regiões de um record de usuário
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
          return arr.map((r) => normalizarRegiaoCanonica(r)).filter(Boolean)
        }
        return []
      }

      const destinoRegioesNorm = extrairRegioesUsuario(destinoUser)
      const origemRegioesNorm = extrairRegioesUsuario(authRecord)
      const clienteRegiaoNorm = normalizarRegiaoCanonica(cliente.getString('regiao'))

      if ((userRole === 'operador' || userRole === 'lider') && origemRegioesNorm.length === 0) {
        return e.json(400, {
          error:
            'Sua conta não possui região/rota atribuída. Contate o administrador antes de repassar clientes.',
        })
      }

      // Validação de região entre cliente/atendente e destinatário
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

      const currentOp = cliente.getString('operador')
      if (userRole !== 'admin' && currentOp && currentOp !== userId) {
        return e.json(403, {
          error: 'Você não tem permissão para transferir um cliente reservado por outro operador',
        })
      }

      // Blindagem de standby na transferência: 60 dias
      const estadoCli = cliente.getString('estado')
      const standbyAteStr = cliente.getString('standby_ate')
      let emStandby = false
      if (standbyAteStr) {
        const parsedStandby = new Date(standbyAteStr)
        if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > new Date().getTime()) {
          emStandby = true
        }
      }
      if ((estadoCli === 'reativado' || emStandby) && emStandby && userRole !== 'admin') {
        return e.json(400, {
          error:
            'Este cliente foi reativado e está no período de standby de 60 dias. Não pode ser transferido ou colocado como reagendado na fila.',
        })
      }

      const estadoAnterior = cliente.getString('estado')
      const now = new Date()
      const hojeIso = now.toISOString()

      // Liberar lock atual e atribuir reagendamento prioritário
      cliente.set('estado', 'reagendado')
      cliente.set('operador', '')
      cliente.set('lock_timestamp', null)
      cliente.set('reagendado_operador', destinoOperadorId)
      cliente.set('reagendado_para', hojeIso)
      cliente.set('prioridade_transferencia', true)

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
