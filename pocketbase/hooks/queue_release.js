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

        // CONSUMO DE RETOMADA:
        // Se o cliente liberado possuía reagendamento vencido (ou marcado como retomada servida):
        // empurrar reagendado_para para o próximo início de expediente útil (07:00 BRT do próximo dia útil)
        // e registrar retomada_servida_em para garantir que no próximo clique o operador receba outro cliente da carteira!
        const reagParaStr = cliente.getString('reagendado_para')
        let novoEstado = emStandby ? 'reativado' : 'na_base'

        if (reagParaStr && !emStandby) {
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
          const proximaAberturaIso = new Date(proximaAberturaExpedienteUtcMs).toISOString()

          cliente.set('reagendado_para', proximaAberturaIso)
          cliente.set('retomada_servida_em', now.toISOString())
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
            reagendado_adiado_para: reagParaStr ? cliente.getString('reagendado_para') : null,
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
