/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/backend/v1/manutencao/recalcular-base',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const role = authRecord.getString('role')
      if (role !== 'admin' && role !== 'supervisor') {
        return e.json(403, {
          error: 'Apenas administradores e supervisores podem disparar o recálculo da base',
        })
      }

      const now = new Date()
      const nowMs = now.getTime()
      let totalProcessados = 0
      let totalReconciliados = 0
      let totalLocksLiberados = 0

      // Timeout de 30 minutos para atendimentos abandonados
      const timeoutMinutos = 30
      const cutoffLock = new Date(nowMs - timeoutMinutos * 60 * 1000).toISOString()
      const abandonedLocks = $app.findRecordsByFilter(
        'clientes',
        "(estado = 'reservado' || estado = 'em_atendimento') && (lock_timestamp = '' || lock_timestamp < '" +
          cutoffLock +
          "')",
        '',
        500,
        0,
      )
      for (let l = 0; l < abandonedLocks.length; l++) {
        const lockCli = abandonedLocks[l]
        lockCli.set('estado', 'na_base')
        lockCli.set('operador', '')
        lockCli.set('lock_timestamp', null)
        $app.save(lockCli)
        totalLocksLiberados++
      }

      // Ler pesos do score configurados
      let pesos = {
        recencia: 30,
        frequencia: 25,
        ticket_tonelagem: 20,
        segmento: 10,
        tentativas_penalidade: 15,
      }
      try {
        const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'pesos_score')
        if (cfg && cfg.get('valor')) pesos = cfg.get('valor')
      } catch (_) {}

      // Buscar clientes em lotes para recalcular
      const pageSize = 200
      let page = 0
      let hasMore = true

      while (hasMore) {
        const batch = $app.findRecordsByFilter(
          'clientes',
          "estado != 'duplicado' && estado != 'ativo_fora_base' && ativo_fora_base != true",
          'id',
          pageSize,
          page * pageSize,
        )

        if (!batch || batch.length === 0) {
          hasMore = false
          break
        }

        for (let i = 0; i < batch.length; i++) {
          const c = batch[i]
          if (c.getString('estado') === 'ativo_fora_base' || c.getBool('ativo_fora_base')) {
            continue
          }
          totalProcessados++

          let ultimaDataStr = c.getString('ultimo_faturamento_data') || c.getString('ultima_compra')
          let dias = c.getInt('dias_sem_faturar')

          if (ultimaDataStr) {
            const parsed = new Date(ultimaDataStr)
            if (!isNaN(parsed.getTime())) {
              const diffMs = nowMs - parsed.getTime()
              dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
              c.set('dias_sem_faturar', dias)
            }
          } else if (!dias && dias !== 0) {
            dias = 180
            c.set('dias_sem_faturar', dias)
          }

          let faixa = '90_plus'
          if (ultimaDataStr && dias < 60) {
            faixa = 'recente'
          } else if (dias >= 60 && dias <= 89) {
            faixa = '60_89'
          } else {
            faixa = '90_plus'
          }
          c.set('faixa', faixa)

          const estadoAtual = c.getString('estado')
          if (faixa === 'recente' && ultimaDataStr) {
            if (estadoAtual !== 'reativado') {
              c.set('estado', 'reativado')
              c.set('operador', '')
              c.set('lock_timestamp', null)
              totalReconciliados++
            }
            if (!c.getString('reativado_em')) {
              const dataFatParsed = new Date(ultimaDataStr)
              const dataReativado = !isNaN(dataFatParsed.getTime()) ? dataFatParsed : now
              c.set('reativado_em', dataReativado.toISOString())
            }
            if (!c.getString('standby_ate')) {
              const dataReatParsed = new Date(c.getString('reativado_em') || now.toISOString())
              const baseMs = !isNaN(dataReatParsed.getTime()) ? dataReatParsed.getTime() : nowMs
              const standbyDate = new Date(baseMs + 60 * 24 * 60 * 60 * 1000)
              c.set('standby_ate', standbyDate.toISOString())
            }
          } else if ((faixa === '60_89' || faixa === '90_plus') && estadoAtual === 'reativado') {
            // RESPEITAR O STANDBY DE 60 DIAS: se standby_ate estiver no futuro, NUNCA jogar para 'na_base'!
            const standbyAteStr = c.getString('standby_ate')
            let emStandby = false
            if (standbyAteStr) {
              const parsedStandby = new Date(standbyAteStr)
              if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
                emStandby = true
              }
            }
            if (!emStandby) {
              const pedidoConfirmado = c.getBool('pedido_confirmado')
              if (!pedidoConfirmado) {
                c.set('estado', 'na_base')
                c.set('operador', '')
                c.set('lock_timestamp', null)
                c.set('standby_ate', null)
                c.set('reativado_em', null)
              }
            }
          } else {
            // Se estado não é reativado mas tem standby_ate no futuro:
            const standbyAteStr = c.getString('standby_ate')
            if (standbyAteStr) {
              const parsedStandby = new Date(standbyAteStr)
              if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
                c.set('estado', 'reativado')
                c.set('operador', '')
                c.set('lock_timestamp', null)
              }
            }
          }

          var sRecencia = Math.min(100, Math.round((dias / 180) * 100))
          var cCount = c.getInt('compras_count') || c.getInt('frequencia_compras_12m') || 1
          var sFreq = Math.min(100, cCount * 12)
          var vHist = c.getFloat('valor_historico') || c.getFloat('fat_12m_reais') || 0
          var tMedio = cCount > 0 ? vHist / cCount : c.getFloat('valor_ultima_compra') || 0
          var sTicket = Math.min(100, Math.round((tMedio / 100000) * 100))
          var sSeg = 70

          var calcScore = Math.min(
            100,
            Math.max(
              0,
              Math.round(
                (sRecencia * (pesos.recencia || 30)) / 100 +
                  (sFreq * (pesos.frequencia || 25)) / 100 +
                  (sTicket * (pesos.ticket_tonelagem || 20)) / 100 +
                  (sSeg * (pesos.segmento || 10)) / 100,
              ),
            ),
          )

          var tentativas = c.getInt('tentativas_sem_contato') || 0
          var finalScore = Math.max(0, calcScore - tentativas * 5)
          c.set('score', finalScore)

          $app.save(c)
        }

        if (batch.length < pageSize) {
          hasMore = false
        } else {
          page++
        }
      }

      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', 'recalculo_manual_base_concluido')
        ev.set('detalhes', {
          executado_em: now.toISOString(),
          total_processados: totalProcessados,
          total_reconciliados_faturaram: totalReconciliados,
          total_locks_liberados: totalLocksLiberados,
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: 'Recálculo e reconciliação da base concluídos com sucesso!',
        totalProcessados,
        totalReconciliados,
        totalLocksLiberados,
        executadoEm: now.toISOString(),
      })
    } catch (err) {
      console.error('[recalcular-base] Erro:', err)
      return e.json(500, {
        error: 'Erro ao recalcular base: ' + (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
