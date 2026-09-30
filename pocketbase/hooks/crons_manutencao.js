// 1. Cron frequente: Liberação de locks expirados e quarentenas vencidas
cronAdd('crons_limpeza_fila', '*/10 * * * *', () => {
  try {
    const now = new Date()
    const timeoutMinutos = 30
    const cutoffLock = new Date(now.getTime() - timeoutMinutos * 60 * 1000).toISOString()

    // Inspeção de teste do Kommo no cron de 10 min se ainda não tiver sido realizada
    try {
      const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'kommo_config')
      const val = (cfg ? cfg.get('valor') : {}) || {}
      if (!val.inspecao || !val.ultimo_teste_ok) {
        const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
        const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
        const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
        const baseUrl = apiBaseUrlSecret
          ? apiBaseUrlSecret.endsWith('/')
            ? apiBaseUrlSecret.slice(0, -1)
            : apiBaseUrlSecret
          : `https://${subdomain}.kommo.com`

        if (subdomain && accessToken) {
          const accRes = $http.send({
            url: `${baseUrl}/api/v4/account?with=amojo_id,version`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const pipRes = $http.send({
            url: `${baseUrl}/api/v4/leads/pipelines`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const usersRes = $http.send({
            url: `${baseUrl}/api/v4/users?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const contactFieldsRes = $http.send({
            url: `${baseUrl}/api/v4/contacts/custom_fields?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const leadFieldsRes = $http.send({
            url: `${baseUrl}/api/v4/leads/custom_fields?limit=250`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const compRes = $http.send({
            url: `${baseUrl}/api/v4/companies?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const leadsCountRes = $http.send({
            url: `${baseUrl}/api/v4/leads?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const contactsCountRes = $http.send({
            url: `${baseUrl}/api/v4/contacts?limit=1`,
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15,
          })

          const accData = accRes.json || {}
          const pipelines = (pipRes.json?._embedded?.pipelines || []).map((p) => ({
            id: p.id,
            name: p.name,
            is_main: p.is_main,
            sort: p.sort,
            statuses: (p._embedded?.statuses || []).map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              sort: s.sort,
            })),
          }))
          const users = (usersRes.json?._embedded?.users || []).map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            is_active: u.rights?.is_active,
          }))
          const contactFields = (contactFieldsRes.json?._embedded?.custom_fields || []).map(
            (f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              code: f.code,
            }),
          )
          const leadFields = (leadFieldsRes.json?._embedded?.custom_fields || []).map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            code: f.code,
          }))

          const reativacaoPipeline = pipelines.find((p) => p.name.toLowerCase().includes('reativa'))

          if (cfg) {
            const novoVal = Object.assign({}, val, {
              ultimo_teste_ok: accRes.statusCode >= 200 && accRes.statusCode < 300,
              ultimo_sync: now.toISOString(),
              inspecao: {
                account_id: accData.id,
                account_name: accData.name,
                subdomain: accData.subdomain,
                country: accData.country,
                currency: accData.currency,
                created_at: accData.created_at,
                pipelines_count: pipelines.length,
                pipelines: pipelines,
                users_count: users.length,
                users: users,
                contact_fields_count: contactFields.length,
                contact_fields: contactFields,
                lead_fields_count: leadFields.length,
                lead_fields: leadFields,
                has_companies:
                  (compRes.statusCode === 200 && compRes.json?._embedded?.companies?.length > 0) ||
                  false,
                has_contacts:
                  (contactsCountRes.statusCode === 200 &&
                    contactsCountRes.json?._embedded?.contacts?.length > 0) ||
                  false,
                has_leads:
                  (leadsCountRes.statusCode === 200 &&
                    leadsCountRes.json?._embedded?.leads?.length > 0) ||
                  false,
                has_reativacao_pipeline: Boolean(reativacaoPipeline),
                reativacao_pipeline: reativacaoPipeline || null,
                secret_checks: {
                  field_origin: $os.getenv('KOMMO_FIELD_ORIGIN') || '',
                  field_segment: $os.getenv('KOMMO_FIELD_SEGMENT') || '',
                  field_temperature: $os.getenv('KOMMO_FIELD_TEMPERATURE') || '',
                  pipeline_excluir_liderancas:
                    $os.getenv('KOMMO_PIPELINE_EXCLUIR_LIDERANCAS') || '',
                  stage_excluir_comunicacao:
                    $os.getenv('KOMMO_STAGE_EXCLUIR_COMUNICACAO_INTERNA') || '',
                  status_id_comunicacao_interna:
                    $os.getenv('KOMMO_STATUS_ID_COMUNICACAO_INTERNA') || '',
                },
              },
            })
            cfg.set('valor', novoVal)
            $app.save(cfg)
          }
        }
      }
    } catch (eKommo) {
      console.error('Erro na verificação Kommo via cron:', eKommo.message)
    }

    const expiredLocks = $app.findRecordsByFilter(
      'clientes',
      `(estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp < '${cutoffLock}'`,
      '',
      200,
      0,
    )

    for (let i = 0; i < expiredLocks.length; i++) {
      const c = expiredLocks[i]
      c.set('estado', 'na_base')
      c.set('operador', '')
      c.set('lock_timestamp', null)
      $app.save(c)

      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', c.id)
        ev.set('acao', 'timeout_lock_expirado')
        ev.set('detalhes', { motivo: 'Inatividade superior a 30 minutos' })
        $app.save(ev)
      } catch (_) {}
    }

    const todayStr = now.toISOString().slice(0, 10)
    const expiredQuarantine = $app.findRecordsByFilter(
      'clientes',
      `estado = 'nao_quer_negociar' && quarentena_ate != '' && quarentena_ate <= '${todayStr}'`,
      '',
      100,
      0,
    )

    for (let j = 0; j < expiredQuarantine.length; j++) {
      const q = expiredQuarantine[j]
      q.set('estado', 'na_base')
      q.set('quarentena_ate', null)
      $app.save(q)
    }
  } catch (err) {
    console.error('Erro no cron crons_limpeza_fila:', err)
  }
})

// 2. Cron diário (1x por dia, às 03:00 UTC / 00:00 BRT):
// - Recalcula dias sem faturar, faixa (60-89 / 90+) e score de todos os clientes
// - Faz reconciliação: apenas quem faturou recentemente (<60 dias comprovados) sai da fila (estado = 'reativado')
// - Clientes com 60+ dias ou sem venda que foram marcados indevidamente como reativados são restabelecidos para 'na_base'
// - Libera reservas expiradas (timeout de atendimento abandonado)
// - Grava registro da execução em eventos_log
cronAdd('crons_atualizacao_diaria_base', '0 3 * * *', () => {
  try {
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
      `(estado = 'reservado' || estado = 'em_atendimento') && (lock_timestamp = '' || lock_timestamp < '${cutoffLock}')`,
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
        "estado != 'duplicado'",
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
        totalProcessados++

        // Recalcular dias sem faturar a partir de ultima_compra ou ultimo_faturamento_data
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

        // Determinar faixa:
        // - Recente: < 60 dias com faturamento real
        // - 60_89: 60 até 89 dias
        // - 90_plus: 90 dias ou mais, ou clientes sem data de última compra ("Sem Venda")
        let faixa = '90_plus'
        if (ultimaDataStr && dias < 60) {
          faixa = 'recente'
        } else if (dias >= 60 && dias <= 89) {
          faixa = '60_89'
        } else {
          faixa = '90_plus'
        }
        c.set('faixa', faixa)

        // Reconciliação:
        // 1. Quem faturou recentemente (<60 dias comprovados) sai da fila de reativação automaticamente
        // 2. Quem tem 60+ dias ou é Sem Venda e estava como 'reativado' (ex: por engano na importação) volta para 'na_base'
        const estadoAtual = c.getString('estado')
        if (faixa === 'recente' && ultimaDataStr) {
          if (estadoAtual !== 'reativado') {
            c.set('estado', 'reativado')
            c.set('operador', '')
            c.set('lock_timestamp', null)
            totalReconciliados++
          }
        } else if ((faixa === '60_89' || faixa === '90_plus') && estadoAtual === 'reativado') {
          // Se o cliente tem mais de 60 dias sem faturar, ele DEVE estar ativo na base de reativação
          c.set('estado', 'na_base')
          c.set('operador', '')
          c.set('lock_timestamp', null)
        }

        // Recalcular score ponderado        const scoreRecencia = Math.min(100, Math.round((dias / 180) * 100))
        const comprasCount = c.getInt('compras_count') || c.getInt('frequencia_compras_12m') || 1
        const scoreFreq = Math.min(100, comprasCount * 12)
        const valHist = c.getFloat('valor_historico') || c.getFloat('fat_12m_reais') || 0
        const ticketMedio =
          comprasCount > 0 ? valHist / comprasCount : c.getFloat('valor_ultima_compra') || 0
        const scoreTicket = Math.min(100, Math.round((ticketMedio / 100000) * 100))
        const scoreSeg = 70

        const calcScore = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (scoreRecencia * (pesos.recencia || 30)) / 100 +
                (scoreFreq * (pesos.frequencia || 25)) / 100 +
                (scoreTicket * (pesos.ticket_tonelagem || 20)) / 100 +
                (scoreSeg * (pesos.segmento || 10)) / 100,
            ),
          ),
        )

        const tentativas = c.getInt('tentativas_sem_contato') || 0
        const finalScore = Math.max(0, calcScore - tentativas * 5)
        c.set('score', finalScore)

        $app.save(c)
      }

      if (batch.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    // Grava registro da execução em eventos_log
    try {
      const colEv = $app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'cron_atualizacao_diaria_concluida')
      ev.set('detalhes', {
        executado_em: now.toISOString(),
        total_processados: totalProcessados,
        total_reconciliados_faturaram: totalReconciliados,
        total_locks_liberados: totalLocksLiberados,
      })
      $app.save(ev)
    } catch (_) {}

    console.log(
      `Job diário concluído: ${totalProcessados} clientes processados, ${totalReconciliados} reconciliados, ${totalLocksLiberados} locks liberados.`,
    )
  } catch (err) {
    console.error('Erro no cron crons_atualizacao_diaria_base:', err)
  }
})
