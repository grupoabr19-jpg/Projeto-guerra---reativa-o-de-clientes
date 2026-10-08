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

      // Libera operador e volta para 'na_base' ou 'reagendado' se ainda estava reservado ou em_atendimento
      const estado = cliente.getString('estado')
      if (estado === 'reservado' || estado === 'em_atendimento') {
        const now = new Date()
        const nowMs = now.getTime()

        // PRESERVAÇÃO DE STANDBY: se o cliente estava reativado em standby e foi aberto em lock por admin,
        // ele NÃO deve cair para 'na_base'! Deve voltar para 'reativado'!
        const standbyAteStr = cliente.getString('standby_ate')
        let emStandby = false
        if (standbyAteStr) {
          const parsedStandby = new Date(standbyAteStr)
          if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
            emStandby = true
          }
        }

        // CONSUMO DE RETOMADA / DEVOLUÇÃO COM BLINDAGEM DE FILA:
        // TODO abandono/devolução (com ou sem reagendamento prévio, exceto se estiver em standby) deve:
        // setar reagendado_para = 07:00 BRT do próximo dia útil (sexta->segunda, sábado->segunda, respeitando expediente 7h-17h),
        // retomada_servida_em = agora, reagendado_operador = userId, estado = "reagendado", operador = "", lock_timestamp = null.
        // Assim o cliente sai do dia e nunca reaparece no mesmo dia.
        let novoEstado = emStandby ? 'reativado' : 'reagendado'
        let proximaAberturaIso = null

        if (!emStandby) {
          // Calcular próximo dia útil às 07:00 (Brasília UTC-3 => 10:00 UTC)
          const brtMs = nowMs - 3 * 60 * 60 * 1000
          const brtDate = new Date(brtMs)
          const dayOfWeek = brtDate.getUTCDay() // 0 = Domingo, 1 = Segunda, ..., 5 = Sexta, 6 = Sábado

          // Se hoje é Sexta (5), próximo dia útil é Segunda (+3 dias)
          // Se hoje é Sábado (6), próximo dia útil é Segunda (+2 dias)
          // Senão (+1 dia útil)
          let diasAdd = 1
          if (dayOfWeek === 5) {
            diasAdd = 3
          } else if (dayOfWeek === 6) {
            diasAdd = 2
          }

          const proxBrtMs = brtMs + diasAdd * 24 * 60 * 60 * 1000
          const proxBrtDate = new Date(proxBrtMs)
          const targetYear = proxBrtDate.getUTCFullYear()
          const targetMonth = proxBrtDate.getUTCMonth()
          const targetDay = proxBrtDate.getUTCDate()

          // 07:00 Brasília = 10:00 UTC
          const proximaAberturaExpedienteUtcMs = Date.UTC(
            targetYear,
            targetMonth,
            targetDay,
            10,
            0,
            0,
            0,
          )
          proximaAberturaIso = new Date(proximaAberturaExpedienteUtcMs).toISOString()

          cliente.set('reagendado_para', proximaAberturaIso)
          cliente.set('retomada_servida_em', now.toISOString())
          cliente.set('reagendado_operador', userId)
          novoEstado = 'reagendado'
        }

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
          ev.set('detalhes', {
            motivo: body.motivo || 'liberacao_manual_ou_abandono',
            reagendado_adiado_para: proximaAberturaIso,
            reagendado_operador: userId,
          })
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
