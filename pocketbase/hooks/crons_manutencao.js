// 1. Cron frequente: Liberação de locks expirados e quarentenas vencidas
cronAdd('crons_limpeza_fila', '*/10 * * * *', () => {
  try {
    const now = new Date()
    const timeoutMinutos = 30
    const cutoffLock = new Date(now.getTime() - timeoutMinutos * 60 * 1000).toISOString()

    // Inspeção de teste do Kommo no cron foi transferida exclusivamente para o endpoint dedicado POST /backend/v1/kommo/test
    // para evitar contenção de escrita em SQLite e chamadas HTTP bloqueantes a cada ciclo do cron.

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

    // Data corrente no fuso de Brasília (UTC-3) para cálculo preciso de quarentena
    const brasiliaOffsetMs = -3 * 60 * 60 * 1000
    const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
    const yBrt = dBrasilia.getUTCFullYear()
    const mBrt = String(dBrasilia.getUTCMonth() + 1).padStart(2, '0')
    const dBrt = String(dBrasilia.getUTCDate()).padStart(2, '0')
    const todayStr = `${yBrt}-${mBrt}-${dBrt}`

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
// - Respeita o STANDBY DE NO MÍNIMO 60 DIAS após reativação: se standby_ate estiver no futuro, mantém 'reativado' fora da fila
// - Quando o standby vence: se houve compra confirmada recente (faixa 'recente' ou pedido_confirmado=true), mantém 'reativado';
//   se não houve compra confirmada, restabelece estado = 'na_base' e limpa standby_ate/reativado_em
// - Libera reservas expiradas (timeout de atendimento abandonado)
// - Grava registro da execução em eventos_log
cronAdd('crons_atualizacao_diaria_base', '0 3 * * *', () => {
  try {
    const now = new Date()
    const nowMs = now.getTime()
    let totalProcessados = 0
    let totalReconciliados = 0
    let totalLocksLiberados = 0

    // 1. Timeout de 30 minutos para atendimentos abandonados em MASSA (SQL rápido)
    const timeoutMinutos = 30
    const cutoffLock = new Date(nowMs - timeoutMinutos * 60 * 1000).toISOString()
    try {
      const resLock = $app
        .db()
        .newQuery(
          `UPDATE clientes 
         SET estado = 'na_base', operador = '', lock_timestamp = NULL 
         WHERE (estado = 'reservado' OR estado = 'em_atendimento') 
           AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp < {:cutoff})`,
        )
        .bind({ cutoff: cutoffLock })
        .execute()
      totalLocksLiberados = resLock && resLock.rowsAffected ? resLock.rowsAffected() : 0
    } catch (lockErr) {
      console.log('[cron_3h] Fallback manual para liberação de locks: ' + lockErr.message)
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
    }

    // 2. Ler pesos do score configurados
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

    // Lista de vendedores ativos para checagem de sem_dono_equipe
    const equipeNomesAtivos = [
      'ALESSANDRO',
      'LEIZ',
      'HELOA',
      'DYOVANA',
      'JOSIANE',
      'KAYLANE',
      'PETERSON',
      'BRUNA',
      'THAIS',
      'PAOLA',
      'VITORIA',
      'JOSE',
      'FELIPE',
      'MILENA',
      'CAMILA',
      'JENNIFER',
      'GABRIELA',
      'JESSICA',
      'GUSTAVO',
      'INAYARA',
      'TAINARA',
      'JULIANO',
      'EDMILA',
      'ARIANE',
      'MATHEUS',
      'JULIO',
      'LARISSA',
      'WILSON',
      'PRISCILA',
      'RAFAELA',
      'ANDERSON',
    ]

    // 3. Recálculo em Lotes Otimizados com detecção cirúrgica de mutações
    // Lote de 500 registros para alta vazão com baixo overhead de memória
    const pageSize = 500
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
        // Regra Inviolável: se o cliente for ativo_fora_base, NUNCA mexer
        if (c.getString('estado') === 'ativo_fora_base' || c.getBool('ativo_fora_base')) {
          continue
        }
        totalProcessados++
        let mudou = false

        // Recalcular dias sem faturar
        let ultimaDataStr = c.getString('ultimo_faturamento_data') || c.getString('ultima_compra')
        let dias = c.getInt('dias_sem_faturar')

        if (ultimaDataStr) {
          const parsed = new Date(ultimaDataStr)
          if (!isNaN(parsed.getTime())) {
            const diffMs = nowMs - parsed.getTime()
            const calcDias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
            if (calcDias !== dias) {
              dias = calcDias
              c.set('dias_sem_faturar', dias)
              mudou = true
            }
          }
        } else if (!dias && dias !== 0) {
          dias = 180
          c.set('dias_sem_faturar', dias)
          mudou = true
        }

        // Determinar faixa
        let faixa = '90_plus'
        if (ultimaDataStr && dias < 60) {
          faixa = 'recente'
        } else if (dias >= 60 && dias <= 89) {
          faixa = '60_89'
        } else {
          faixa = '90_plus'
        }
        if (c.getString('faixa') !== faixa) {
          c.set('faixa', faixa)
          mudou = true
        }

        // Reconciliação com faturamento recente e regra de standby de 60 dias:
        const estadoAtual = c.getString('estado')
        if (faixa === 'recente' && ultimaDataStr) {
          if (estadoAtual !== 'reativado') {
            c.set('estado', 'reativado')
            c.set('operador', '')
            c.set('lock_timestamp', null)
            totalReconciliados++
            mudou = true
          }
          // Garante que reativado_em e standby_ate fiquem preenchidos caso estejam vazios
          if (!c.getString('reativado_em')) {
            c.set('reativado_em', now.toISOString())
            mudou = true
          }
          if (!c.getString('standby_ate')) {
            const standbyDate = new Date(nowMs + 60 * 24 * 60 * 60 * 1000)
            c.set('standby_ate', standbyDate.toISOString())
            mudou = true
          }
        } else if (estadoAtual === 'reativado') {
          // Cliente marcado como reativado com faixa 60_89 ou 90_plus:
          const standbyAteStr = c.getString('standby_ate')
          let emStandby = false
          if (standbyAteStr) {
            const parsedStandby = new Date(standbyAteStr)
            if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
              emStandby = true
            }
          }

          if (emStandby) {
            // Cliente ainda está dentro da janela de standby de 60 dias: NÃO religar na fila!
            // Garante operador limpo e lock liberado
            if (c.getString('operador') || c.getString('lock_timestamp')) {
              c.set('operador', '')
              c.set('lock_timestamp', null)
              mudou = true
            }
          } else {
            // Janela de standby expirou (ou não existia / legado vencido):
            // Verificar faturamento / compra confirmada
            const pedidoConfirmado = c.getBool('pedido_confirmado')
            const comprouDeFato =
              pedidoConfirmado || (faixa === 'recente' && Boolean(ultimaDataStr))

            if (comprouDeFato) {
              // Compra confirmada: mantém como sucesso ('reativado')
              if (c.getString('operador') || c.getString('lock_timestamp')) {
                c.set('operador', '')
                c.set('lock_timestamp', null)
                mudou = true
              }
            } else {
              // Sem compra confirmada após os 60 dias de standby: volta para a fila ('na_base')
              c.set('estado', 'na_base')
              c.set('operador', '')
              c.set('lock_timestamp', null)
              c.set('standby_ate', null)
              c.set('reativado_em', null)
              mudou = true
            }
          }
        }

        // DDD e Regra ATACADO fora do mapa
        const telDddRaw = (c.getString('telefone') || c.getString('whatsapp') || '').replace(
          /\D/g,
          '',
        )
        let dddCalc = ''
        if (telDddRaw) {
          let sDdd = telDddRaw
          if (sDdd.startsWith('0')) sDdd = sDdd.slice(1)
          if (sDdd.startsWith('55') && sDdd.length >= 12) sDdd = sDdd.slice(2)
          dddCalc = sDdd.slice(0, 2)
        }
        if (c.getString('ddd_telefone') !== dddCalc) {
          c.set('ddd_telefone', dddCalc)
          mudou = true
        }

        // Blindagem da Base Cliente Final e ATACADO fora do mapa
        // Se já foi classificado como cliente final por desfecho anterior, preserva!
        const categoriaAtual = c.getString('base_categoria')
        const desfechoUltimo = c.getString('desfecho_final') || c.getString('ultimo_desfecho')
        const isClienteFinalPorDesfecho =
          desfechoUltimo === 'cliente_final' || categoriaAtual === 'cliente_final'

        const cleanDoc = String(c.getString('cpf_cnpj') || '').replace(/\D/g, '')
        const isCpfOuNaoIdentificado = cleanDoc.length === 11 || !cleanDoc
        const cCount = c.getInt('compras_count') || c.getInt('frequencia_compras_12m') || 1
        const segAtualNorm = (c.getString('segmento') || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        const isClienteFinalComportamento =
          isCpfOuNaoIdentificado &&
          cCount <= 2 &&
          (segAtualNorm === 'cliente final' ||
            segAtualNorm.includes('cliente final') ||
            segAtualNorm.includes('consumidor')) &&
          (dias <= 730 || dias === 0)

        const regiaoAtual = (c.getString('regiao') || '').toUpperCase()
        let novaBaseCat = categoriaAtual || 'normal'

        if (
          regiaoAtual === 'ATACADO' &&
          (!dddCalc || !['11', '12', '13', '14', '15', '16', '17', '18', '19'].includes(dddCalc))
        ) {
          novaBaseCat = 'atacado_fora_mapa'
        } else if (
          isClienteFinalPorDesfecho ||
          (isClienteFinalComportamento && novaBaseCat !== 'atacado_fora_mapa')
        ) {
          novaBaseCat = 'cliente_final'
        } else if (novaBaseCat !== 'cliente_final' && novaBaseCat !== 'atacado_fora_mapa') {
          novaBaseCat = 'normal'
        }

        if (categoriaAtual !== novaBaseCat) {
          c.set('base_categoria', novaBaseCat)
          mudou = true
        }

        // Sem Dono na Equipe (Item A: Resolução por conjunto de pistas)
        const vendUp = (c.getString('vendedor') || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
        let vNomeLimpo = vendUp
        const pfxList = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ']
        for (let px = 0; px < pfxList.length; px++) {
          if (vNomeLimpo.startsWith(pfxList[px])) {
            vNomeLimpo = vNomeLimpo.slice(pfxList[px].length).trim()
            break
          }
        }

        let temDonoNaEquipe = false
        if (!vendUp) {
          temDonoNaEquipe = true
        } else if (
          vNomeLimpo === 'RAFAELA RESENDE' ||
          vNomeLimpo === 'RAFAELA' ||
          vNomeLimpo.includes('RAFAELA')
        ) {
          temDonoNaEquipe = true
        } else if (equipeNomesAtivos.some((n) => vendUp.includes(n) || vNomeLimpo.includes(n))) {
          temDonoNaEquipe = true
        } else {
          const tVend = (c.getString('tipo_vendedor') || '').toUpperCase()
          const rNome = (c.getString('regiao') || '').toUpperCase()
          if (
            rNome === 'POUSO ALEGRE' &&
            (tVend === 'ESPECIALISTA' || vNomeLimpo.includes('RAFAELA'))
          ) {
            temDonoNaEquipe = true
          }
        }
        const semDonoBool = !temDonoNaEquipe
        if (c.getBool('sem_dono_equipe') !== semDonoBool) {
          c.set('sem_dono_equipe', semDonoBool)
          mudou = true
        }

        // Recalcular Score ponderado
        var sRecencia = Math.min(100, Math.round((dias / 180) * 100))
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
        if (c.getInt('score') !== finalScore) {
          c.set('score', finalScore)
          mudou = true
        }

        if (mudou) {
          $app.save(c)
        }
      }

      if (batch.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    // 4. Limpeza e Retenção do Chat Interno (mensagens com mais de 90 dias)
    let totalChatMsgsLimpas = 0
    try {
      const noventaDiasAtrasMs = nowMs - 90 * 24 * 60 * 60 * 1000
      const cutoffChat = new Date(noventaDiasAtrasMs).toISOString()
      const resChatClean = $app
        .db()
        .newQuery('DELETE FROM chat_mensagens WHERE created < {:cutoff}')
        .bind({ cutoff: cutoffChat })
        .execute()
      totalChatMsgsLimpas =
        resChatClean && resChatClean.rowsAffected ? resChatClean.rowsAffected() : 0
      if (totalChatMsgsLimpas > 0) {
        console.log(
          `[cron_3h] Chat: ${totalChatMsgsLimpas} mensagens com mais de 90 dias foram removidas.`,
        )
      }
    } catch (chatErr) {
      console.log('[cron_3h] Aviso na limpeza de 90 dias do chat: ' + chatErr.message)
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
        total_chat_msgs_limpas: totalChatMsgsLimpas,
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

/**
 * Cron para sincronização periódica contínua da linha SDR do Kommo CRM (35 99770-9232):
 * - Executa a cada 2 minutos continuamente (* /2 * * * *)
 * - No expediente (7h às 17h no horário de Brasília): roda a cada 2 min imperceptível
 * - Fora do expediente (17h às 7h no horário de Brasília): aplica backoff para rodar apenas nos minutos múltiplos de 30
 */
cronAdd('kommo_sdr_polling_fallback', '*/2 * * * *', () => {
  try {
    const now = new Date()
    const utcHours = now.getUTCHours()
    const minutes = now.getUTCMinutes()
    // Horário de Brasília é UTC-3: 7h às 17h BRT corresponde a 10h às 20h UTC
    const brasiliaHours = (utcHours - 3 + 24) % 24
    const dentroExpediente = brasiliaHours >= 7 && brasiliaHours < 17

    // Fora do expediente: backoff maior (executa apenas nos minutos :00 e :30)
    if (!dentroExpediente && minutes % 30 !== 0) {
      return
    }

    const KOMMO_SDR_PHONE_TARGET = '35997709232'

    const cleanPhoneNumber = (phone) => {
      if (!phone) return ''
      return String(phone).replace(/\D/g, '')
    }

    const isPhoneMatch = (phoneA, phoneB) => {
      const cleanA = cleanPhoneNumber(phoneA)
      const cleanB = cleanPhoneNumber(phoneB)
      if (!cleanA || !cleanB) return false
      if (cleanA === cleanB) return true
      const shortA = cleanA.startsWith('55') && cleanA.length >= 12 ? cleanA.slice(2) : cleanA
      const shortB = cleanB.startsWith('55') && cleanB.length >= 12 ? cleanB.slice(2) : cleanB
      if (shortA === shortB) return true
      if (shortA.length === 11 && shortB.length === 10) {
        return shortA.slice(0, 2) === shortB.slice(0, 2) && shortA.slice(3) === shortB.slice(2)
      }
      if (shortB.length === 11 && shortA.length === 10) {
        return shortB.slice(0, 2) === shortA.slice(0, 2) && shortB.slice(3) === shortA.slice(2)
      }
      return false
    }

    const isSdrPhone = (phone) => isPhoneMatch(phone, KOMMO_SDR_PHONE_TARGET)

    const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
    const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
    const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''

    if (!subdomain || !accessToken) return

    const baseUrl = apiBaseUrlSecret
      ? apiBaseUrlSecret.endsWith('/')
        ? apiBaseUrlSecret.slice(0, -1)
        : apiBaseUrlSecret
      : `https://${subdomain}.kommo.com`

    let adminUser = null
    try {
      adminUser = $app.findFirstRecordByData('users', 'role', 'admin')
    } catch (_) {}
    const adminId = adminUser ? adminUser.id : ''

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const leadsRes = $http.send({
      url: `${baseUrl}/api/v4/leads?order[updated_at]=desc&limit=25&with=contacts`,
      method: 'GET',
      headers: headers,
      timeout: 7,
    })

    if (!leadsRes || leadsRes.statusCode < 200 || leadsRes.statusCode >= 300) return
    const leads = leadsRes.json?._embedded?.leads || []
    const convCol = $app.findCollectionByNameOrId('chat_conversas')
    const msgCol = $app.findCollectionByNameOrId('chat_mensagens')

    // Helper: mapear responsible_user_id do Kommo para vendedor no sistema
    const resolveResponsavelKommo = (respUserId) => {
      if (!respUserId) return null
      const kIdStr = String(respUserId).trim()
      try {
        const matched = $app.findRecordsByFilter(
          'users',
          `kommo_user_id = '${kIdStr}'`,
          '-created',
          1,
        )
        if (matched && matched.length > 0) return matched[0]
      } catch (_) {}
      return null
    }

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      const contacts = lead._embedded?.contacts || []
      if (contacts.length === 0) continue

      let contactPhone = ''
      let contactName = ''
      try {
        const cRes = $http.send({
          url: `${baseUrl}/api/v4/contacts/${contacts[0].id}`,
          method: 'GET',
          headers: headers,
          timeout: 4,
        })
        if (cRes && cRes.statusCode === 200 && cRes.json) {
          contactName = cRes.json.name || ''
          const flds = cRes.json.custom_fields_values || []
          for (let f = 0; f < flds.length; f++) {
            if (flds[f].field_code === 'PHONE' && flds[f].values && flds[f].values[0]) {
              contactPhone = flds[f].values[0].value || ''
              break
            }
          }
        }
      } catch (_) {}

      const cleanPhone = cleanPhoneNumber(contactPhone)
      if (cleanPhone || isSdrPhone(contactPhone)) {
        let conv = null
        if (cleanPhone) {
          try {
            const existing = $app.findRecordsByFilter(
              'chat_conversas',
              `kommo_phone_clean = '${cleanPhone}' && tipo = 'kommo_whatsapp'`,
              '-updated',
              1,
            )
            if (existing && existing.length > 0) conv = existing[0]
          } catch (_) {}
        }

        // Buscar cliente na base se houver
        let clienteId = ''
        if (cleanPhone && cleanPhone.length >= 8) {
          try {
            const suffix = cleanPhone.length >= 9 ? cleanPhone.slice(-9) : cleanPhone.slice(-8)
            const cliRecs = $app.findRecordsByFilter(
              'clientes',
              `telefone ~ '${suffix}' || whatsapp ~ '${suffix}'`,
              '-created',
              1,
            )
            if (cliRecs && cliRecs.length > 0) clienteId = cliRecs[0].id
          } catch (_) {}
        }

        // Cruzar responsible_user_id do Kommo com vendedor vinculado
        const leadRespKommoId = lead.responsible_user_id ? String(lead.responsible_user_id) : ''
        const vendedorVinculado = resolveResponsavelKommo(leadRespKommoId)

        let targetResponsavelId = adminId || ''
        let targetStatusSdr = 'novo_lead'
        let targetTransferidoEm = ''

        if (
          vendedorVinculado &&
          vendedorVinculado.id !== adminId &&
          (vendedorVinculado.getString('role') === 'operador' ||
            vendedorVinculado.getString('role') === 'lider')
        ) {
          targetResponsavelId = vendedorVinculado.id
          targetStatusSdr = 'transferido'
          targetTransferidoEm = new Date().toISOString()
        }

        if (!conv) {
          conv = new Record(convCol)
          conv.set('tipo', 'kommo_whatsapp')
          conv.set(
            'titulo',
            contactName
              ? `${contactName} (WhatsApp SDR)`
              : `WhatsApp SDR (${cleanPhone || KOMMO_SDR_PHONE_TARGET})`,
          )
          const parts = []
          if (adminId) parts.push(adminId)
          if (targetResponsavelId && !parts.includes(targetResponsavelId))
            parts.push(targetResponsavelId)
          conv.set('participantes', parts)
          conv.set('kommo_phone', contactPhone || KOMMO_SDR_PHONE_TARGET)
          conv.set('kommo_phone_clean', cleanPhone || KOMMO_SDR_PHONE_TARGET)
          conv.set('kommo_contact_id', String(contacts[0].id))
          conv.set('kommo_lead_id', String(lead.id))
          conv.set('cliente_id', clienteId)
          conv.set('responsavel_id', targetResponsavelId)
          conv.set('status_sdr', targetStatusSdr)
          if (targetTransferidoEm) conv.set('transferido_em', targetTransferidoEm)
          conv.set('total_mensagens', 0)
          $app.save(conv)
        } else {
          let mudou = false
          if (clienteId && !conv.getString('cliente_id')) {
            conv.set('cliente_id', clienteId)
            mudou = true
          }
          if (vendedorVinculado && vendedorVinculado.id !== conv.getString('responsavel_id')) {
            conv.set('responsavel_id', vendedorVinculado.id)
            conv.set('status_sdr', 'transferido')
            if (!conv.getString('transferido_em'))
              conv.set('transferido_em', new Date().toISOString())
            const curParts = conv.get('participantes') || []
            if (!curParts.includes(vendedorVinculado.id)) {
              curParts.push(vendedorVinculado.id)
              conv.set('participantes', curParts)
            }
            mudou = true
          }
          if (!conv.getString('status_sdr')) {
            conv.set(
              'status_sdr',
              conv.getString('responsavel_id') && conv.getString('responsavel_id') !== adminId
                ? 'transferido'
                : 'novo_lead',
            )
            mudou = true
          }
          if (mudou) $app.save(conv)
        }

        // Sincronizar mensagens usando o MOTOR NOVO unificado (Talks -> Events -> Notes)
        try {
          let fetchKommoLeadMessagesUnifiedFn = null
          let upsertKommoMessagesIdempotentFn = null

          if (typeof globalThis !== 'undefined') {
            if (typeof globalThis.fetchKommoLeadMessagesUnified === 'function') {
              fetchKommoLeadMessagesUnifiedFn = globalThis.fetchKommoLeadMessagesUnified
            }
            if (typeof globalThis.upsertKommoMessagesIdempotent === 'function') {
              upsertKommoMessagesIdempotentFn = globalThis.upsertKommoMessagesIdempotent
            }
          }

          if (!fetchKommoLeadMessagesUnifiedFn || !upsertKommoMessagesIdempotentFn) {
            try {
              const msgHelper = require(`${__hooks}/kommo_messages_helper.js`)
              if (msgHelper) {
                if (
                  !fetchKommoLeadMessagesUnifiedFn &&
                  typeof msgHelper.fetchKommoLeadMessagesUnified === 'function'
                ) {
                  fetchKommoLeadMessagesUnifiedFn = msgHelper.fetchKommoLeadMessagesUnified
                }
                if (
                  !upsertKommoMessagesIdempotentFn &&
                  typeof msgHelper.upsertKommoMessagesIdempotent === 'function'
                ) {
                  upsertKommoMessagesIdempotentFn = msgHelper.upsertKommoMessagesIdempotent
                }
              }
            } catch (reqErr) {
              console.log('[cron_kommo_sdr] Aviso require kommo_messages_helper: ' + reqErr.message)
            }
          }

          if (!fetchKommoLeadMessagesUnifiedFn || !upsertKommoMessagesIdempotentFn) {
            throw new Error('Helper kommo_messages_helper não disponível no escopo do cron')
          }

          const mensagensUnificadas = fetchKommoLeadMessagesUnifiedFn(lead.id, contactName)
          if (mensagensUnificadas && mensagensUnificadas.length > 0) {
            const novasMsgs = upsertKommoMessagesIdempotentFn(conv, mensagensUnificadas, adminId)
            console.log(
              '[cron_kommo_sdr] Lead ' +
                lead.id +
                ' (' +
                (contactName || cleanPhone || 'Sem Nome') +
                '): ' +
                mensagensUnificadas.length +
                ' msg(s) encontradas, ' +
                novasMsgs +
                ' nova(s) gravada(s) em chat_mensagens.',
            )
            const ultimaMsg = mensagensUnificadas[mensagensUnificadas.length - 1]
            const ultimaNotaTexto = ultimaMsg ? ultimaMsg.texto || '' : ''

            // Processamento do Bot SDR se houve novas mensagens de entrada e a conversa estiver com o Admin
            if (
              novasMsgs > 0 &&
              ultimaMsg &&
              ultimaMsg.direcao === 'entrada' &&
              adminId &&
              conv.getString('responsavel_id') === adminId &&
              ultimaNotaTexto
            ) {
              try {
                let botAtivo = true
                let botNome = 'SDR Virtual Grupo ABR'
                let botPromptExtra = ''
                let msgForaExpedienteCustom = ''
                try {
                  const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
                  if (cfg) {
                    const v = cfg.get('valor') || {}
                    if (v.ativo === false) botAtivo = false
                    if (v.nome_sdr) botNome = v.nome_sdr
                    if (v.instrucoes) botPromptExtra = ` Diretrizes do Admin: ${v.instrucoes}`
                    if (v.mensagem_fora_expediente)
                      msgForaExpedienteCustom = v.mensagem_fora_expediente
                  }
                } catch (_) {}

                // Verificação de expediente
                const dataAgora = new Date()
                const brtDate = new Date(dataAgora.getTime() - 3 * 60 * 60 * 1000)
                const brtDay = brtDate.getUTCDay()
                const brtHours = brtDate.getUTCHours()
                const brtMonth = brtDate.getUTCMonth() + 1
                const brtDayOfMonth = brtDate.getUTCDate()
                const mmdd =
                  (brtMonth < 10 ? '0' : '') +
                  brtMonth +
                  '-' +
                  (brtDayOfMonth < 10 ? '0' : '') +
                  brtDayOfMonth

                const feriadosFixos = [
                  '01-01',
                  '04-21',
                  '05-01',
                  '09-07',
                  '10-12',
                  '11-02',
                  '11-15',
                  '11-20',
                  '12-25',
                  '03-03',
                  '03-04',
                  '04-18',
                  '06-19',
                  '02-16',
                  '02-17',
                  '04-03',
                  '06-04',
                ]
                const ehFimDeSemana = brtDay === 0 || brtDay === 6
                const ehFeriado = feriadosFixos.indexOf(mmdd) !== -1
                const ehForaHorario = brtHours < 7 || brtHours >= 18
                const ehForaExpediente = ehFimDeSemana || ehFeriado || ehForaHorario

                if (ehForaExpediente) {
                  if (botAtivo) {
                    const textoFora =
                      msgForaExpedienteCustom ||
                      'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!'

                    const foraMsg = new Record(msgCol)
                    foraMsg.set('conversa', conv.id)
                    foraMsg.set('autor', adminId)
                    foraMsg.set('autor_nome', `${botNome} (Fora de Expediente)`)
                    foraMsg.set('autor_role', 'supervisor')
                    foraMsg.set('texto', textoFora)
                    foraMsg.set('tipo', 'normal')
                    foraMsg.set('direcao', 'saida')
                    foraMsg.set('kommo_status', 'enviada')
                    foraMsg.set('kommo_message_id', `sdr_cron_fora_${Date.now()}`)
                    $app.save(foraMsg)

                    conv.set('ultima_mensagem_texto', textoFora.slice(0, 97))
                    conv.set('ultimo_autor_nome', botNome)
                    conv.set('total_mensagens', (conv.getInt('total_mensagens') || 0) + 1)
                    $app.save(conv)

                    // Log de triagem
                    try {
                      const triCol = $app.findCollectionByNameOrId('sdr_triagens_log')
                      const triRec = new Record(triCol)
                      triRec.set('cliente_nome', contactName || 'Cliente WhatsApp SDR')
                      triRec.set('telefone', contactPhone)
                      triRec.set('telefone_limpo', cleanPhone)
                      triRec.set('canal', 'WhatsApp SDR (35) 99770-9232')
                      triRec.set('classificacao', 'FORA_EXPEDIENTE')
                      triRec.set('regiao_nome', 'Aguardando Expediente')
                      triRec.set('rota_destino', 'MATRIZ / ADMIN')
                      triRec.set('operador_destino', adminId)
                      triRec.set('operador_nome', 'Thiago Almeida (Admin)')
                      triRec.set('conversa', conv.id)
                      triRec.set(
                        'motivo_decisao',
                        'Mensagem sincronizada fora do expediente comercial (7h às 18h). Resposta automática enviada.',
                      )
                      triRec.set('regra_aplicada', 'Fora de Expediente')
                      triRec.set('status_transferencia', 'agendado_proximo_expediente')
                      triRec.set(
                        'nota_kommo',
                        `[SDR Grupo ABR]: Contato fora do expediente. Resposta automática enviada.`,
                      )
                      triRec.set(
                        'conversa_resumo',
                        `Cliente: ${ultimaNotaTexto}\nBot: ${textoFora}`,
                      )
                      triRec.set('eh_simulacao', false)
                      $app.save(triRec)
                    } catch (_) {}

                    // Enviar nota ao Kommo
                    try {
                      $http.send({
                        url: `${baseUrl}/api/v4/leads/${lead.id}/notes`,
                        method: 'POST',
                        headers: headers,
                        data: JSON.stringify([
                          {
                            note_type: 'common',
                            params: {
                              text: `[Resposta SDR Grupo ABR - Fora de Expediente]:\n${textoFora}`,
                            },
                          },
                        ]),
                        timeout: 5,
                      })
                    } catch (_) {}
                  }
                } else if (botAtivo) {
                  // Dentro do expediente e bot ativo:
                  // Checar se a mensagem é áudio ou imagem sem texto
                  const isAudio =
                    ultimaNotaTexto.includes('[Áudio recebido]') ||
                    ultimaNotaTexto.toLowerCase().startsWith('[áudio]')
                  const isImage =
                    ultimaNotaTexto.includes('[Imagem recebida]') ||
                    ultimaNotaTexto.toLowerCase().startsWith('[imagem]')

                  if (isAudio || isImage) {
                    let fallbackAudioConfig =
                      'Recebi seu áudio! Para eu te atender mais rápido, pode me enviar por texto?'
                    let fallbackImagemConfig =
                      'Recebi sua imagem! Pode me descrever o que precisa por texto?'
                    try {
                      const cRec = $app.findFirstRecordByData(
                        'configuracoes',
                        'chave',
                        'sdr_bot_config',
                      )
                      if (cRec) {
                        const cv = cRec.get('valor') || {}
                        if (cv.fallback_audio) fallbackAudioConfig = cv.fallback_audio
                        if (cv.fallback_imagem) fallbackImagemConfig = cv.fallback_imagem
                      }
                    } catch (_) {}

                    const fallbackTexto = isAudio ? fallbackAudioConfig : fallbackImagemConfig
                    const rotulo = isAudio ? 'Áudio' : 'Imagem'

                    const botMsg = new Record(msgCol)
                    botMsg.set('conversa', conv.id)
                    botMsg.set('autor', adminId)
                    botMsg.set('autor_nome', `${botNome} (${rotulo})`)
                    botMsg.set('autor_role', 'supervisor')
                    botMsg.set('texto', fallbackTexto)
                    botMsg.set('tipo', 'normal')
                    botMsg.set('direcao', 'saida')
                    botMsg.set('kommo_status', 'enviada')
                    botMsg.set('kommo_message_id', `sdr_cron_fallback_${Date.now()}`)
                    $app.save(botMsg)

                    conv.set('ultima_mensagem_texto', fallbackTexto.slice(0, 97))
                    conv.set('ultimo_autor_nome', botNome)
                    conv.set('total_mensagens', (conv.getInt('total_mensagens') || 0) + 1)
                    $app.save(conv)

                    try {
                      const triCol = $app.findCollectionByNameOrId('sdr_triagens_log')
                      const triRec = new Record(triCol)
                      triRec.set('cliente_nome', contactName || 'Cliente WhatsApp SDR')
                      triRec.set('telefone', contactPhone)
                      triRec.set('telefone_limpo', cleanPhone)
                      triRec.set('canal', 'WhatsApp SDR (35) 99770-9232')
                      triRec.set('classificacao', isAudio ? 'MIDIA_AUDIO' : 'MIDIA_IMAGEM')
                      triRec.set('regiao_nome', 'MATRIZ / ADMIN')
                      triRec.set('rota_destino', 'MATRIZ / ADMIN')
                      triRec.set('operador_destino', adminId)
                      triRec.set('operador_nome', 'Thiago Almeida (Admin)')
                      triRec.set('conversa', conv.id)
                      triRec.set(
                        'motivo_decisao',
                        `${rotulo} recebido do cliente (polling cron). Respondido com fallback garantido.`,
                      )
                      triRec.set('regra_aplicada', `Fallback Garantido de ${rotulo}`)
                      triRec.set('status_transferencia', 'aguardando_texto_cliente')
                      triRec.set(
                        'nota_kommo',
                        `[SDR Grupo ABR]: Respondido com fallback de ${rotulo.toLowerCase()}.`,
                      )
                      triRec.set(
                        'conversa_resumo',
                        `[ORIGEM: ${rotulo.toUpperCase()}]\nCliente: <${rotulo.toLowerCase()}>\nBot: ${fallbackTexto}`,
                      )
                      triRec.set('eh_simulacao', false)
                      $app.save(triRec)
                    } catch (_) {}

                    try {
                      $http.send({
                        url: `${baseUrl}/api/v4/leads/${lead.id}/notes`,
                        method: 'POST',
                        headers: headers,
                        data: JSON.stringify([
                          {
                            note_type: 'common',
                            params: {
                              text: `[Resposta SDR Grupo ABR - Fallback ${rotulo}]:\n${fallbackTexto}`,
                            },
                          },
                        ]),
                        timeout: 5,
                      })
                    } catch (_) {}
                  } else {
                    // Mensagem de texto normal: aciona o agente Skip Cloud nativo
                    try {
                      const agentRes = $ai.agent('sdr-triagem-bot').chat({
                        user_id: adminId,
                        message: `O cliente WhatsApp ${contactName || ''} enviou: "${ultimaNotaTexto}". Faça a triagem rápida de soluções siderúrgicas do Grupo ABR como ${botNome}. Qualifique se é Varejo ou Corporativo e a cidade/local de entrega.${botPromptExtra}`,
                      })
                      const aiReply = agentRes && agentRes.content ? agentRes.content.trim() : ''
                      if (aiReply) {
                        const botMsg = new Record(msgCol)
                        botMsg.set('conversa', conv.id)
                        botMsg.set('autor', adminId)
                        botMsg.set('autor_nome', `${botNome} (IA)`)
                        botMsg.set('autor_role', 'supervisor')
                        botMsg.set('texto', aiReply)
                        botMsg.set('tipo', 'normal')
                        botMsg.set('direcao', 'saida')
                        botMsg.set('kommo_status', 'enviada')
                        botMsg.set('kommo_message_id', `sdr_cron_ai_${Date.now()}`)
                        $app.save(botMsg)

                        conv.set('ultima_mensagem_texto', aiReply.slice(0, 97))
                        conv.set('ultimo_autor_nome', botNome)
                        conv.set('total_mensagens', (conv.getInt('total_mensagens') || 0) + 1)
                        $app.save(conv)

                        try {
                          $http.send({
                            url: `${baseUrl}/api/v4/leads/${lead.id}/notes`,
                            method: 'POST',
                            headers: headers,
                            data: JSON.stringify([
                              {
                                note_type: 'common',
                                params: { text: `[Resposta SDR Virtual Grupo ABR]:\n${aiReply}` },
                              },
                            ]),
                            timeout: 5,
                          })
                        } catch (_) {}
                      }
                    } catch (cronAiErr) {
                      console.log('[cron_kommo_sdr] IA SDR fallback: ' + cronAiErr.message)
                    }
                  }
                }
              } catch (sdrProcErr) {
                console.log('[cron_kommo_sdr] Erro no fluxo SDR: ' + sdrProcErr.message)
              }
            }
          }
        } catch (noteErr) {
          console.log(
            '[cron_kommo_sdr] Erro ao sincronizar notas do lead ' +
              lead.id +
              ': ' +
              noteErr.message,
          )
        }
      }
    }
  } catch (err) {
    console.log('[cron_kommo_sdr] Aviso no polling agendado Kommo SDR: ' + err.message)
  }
})
