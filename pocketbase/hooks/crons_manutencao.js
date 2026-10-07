// pocketbase/hooks/crons_manutencao.js
// Rotinas de manutenção e atualização diária da base
// Implementa as 7 correções da auditoria 0080

// 1. Cron frequente (a cada 10 minutos): Liberação atômica de locks expirados (> 30 min) e quarentenas vencidas
cronAdd('crons_limpeza_fila', '*/10 * * * *', () => {
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
    const now = new Date()

    // EXPURGO ATÔMICO IMEDIATO: liberação de qualquer lock expirado (> 30 min) na base
    const totalLocksLiberados = expurgarLocksExpiradosAtomicamente($app)
    if (totalLocksLiberados > 0) {
      console.log(`[cron_10m] Locks expirados liberados atomicamente: ${totalLocksLiberados}`)
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
// - Respeita o STANDBY DE NO MÍNIMO 60 DIAS após reativação
// - Expurgo atômico de reservas expiradas (>30 min)
// - Matching tolerante e saneamento de sem_dono_equipe com sinônimos
// - Grava registro da execução em eventos_log
cronAdd('crons_atualizacao_diaria_base', '0 3 * * *', () => {
  function normalizarTextoNFD(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()
  }

  function limparPrefixoVendedor(vendedorStr) {
    let v = normalizarTextoNFD(vendedorStr)
    const prefixos = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ', 'VARC - ', 'ADMV - ', 'ATF - ']
    for (let i = 0; i < prefixos.length; i++) {
      const p = normalizarTextoNFD(prefixos[i])
      if (v.startsWith(p)) {
        v = v.slice(p.length).trim()
        break
      }
    }
    return v
  }

  function extrairDddCliente(clienteRec) {
    const dddGravado = clienteRec.getString('ddd_telefone')
    if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
    const telRaw = (
      clienteRec.getString('telefone') ||
      clienteRec.getString('whatsapp') ||
      ''
    ).replace(/\D/g, '')
    if (!telRaw) return ''
    let s = telRaw
    if (s.startsWith('0')) s = s.slice(1)
    if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
    return s.slice(0, 2)
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
    const now = new Date()
    const nowMs = now.getTime()
    let totalProcessados = 0
    let totalReconciliados = 0

    // 1. Timeout de 30 minutos para atendimentos abandonados via expurgo atômico
    const totalLocksLiberados = expurgarLocksExpiradosAtomicamente($app)

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

    // Lista canônica de termos e apelidos de operadores e líderes da equipe ativa
    // Inclui nomes, sobrenomes e apelidos: JAPA, ALESSANDRO, JESSIKA, FELIPE, CONSTRUCAO CIVIL, etc.
    const termosEquipeAtiva = [
      'ALESSANDRO',
      'JAPA',
      'LEIZ',
      'HELOA',
      'HELOÁ',
      'DYOVANA',
      'JOSIANE',
      'KAYLANE',
      'PETERSON',
      'BRUNA',
      'THAIS',
      'THAÍS',
      'PAOLA',
      'VITORIA',
      'VITÓRIA',
      'JOSE FELIPE',
      'JOSE',
      'JOSÉ',
      'FELIPE',
      'MILENA',
      'CAMILA',
      'JENNIFER',
      'GABRIELA',
      'JESSICA',
      'JESSIKA',
      'GUSTAVO',
      'INAYARA',
      'TAINARA',
      'JULIANO',
      'EDMILA',
      'ARIANE',
      'CONSTRUCAO CIVIL',
      'CONSTRUÇÃO CIVIL',
      'CONSTRUCAO',
      'MATHEUS',
      'JULIO',
      'JÚLIO',
      'LARISSA',
      'WILSON',
      'PRISCILA',
      'RAFAELA',
      'ANDERSON',
    ].map((t) => normalizarTextoNFD(t))

    // 3. Recálculo em Lotes com detecção cirúrgica de mutações
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
          if (!c.getString('reativado_em')) {
            const dataFatParsed = new Date(ultimaDataStr)
            const dataReativado = !isNaN(dataFatParsed.getTime()) ? dataFatParsed : now
            c.set('reativado_em', dataReativado.toISOString())
            mudou = true
          }
          if (!c.getString('standby_ate')) {
            const dataReatParsed = new Date(c.getString('reativado_em') || now.toISOString())
            const baseMs = !isNaN(dataReatParsed.getTime()) ? dataReatParsed.getTime() : nowMs
            const standbyDate = new Date(baseMs + 60 * 24 * 60 * 60 * 1000)
            c.set('standby_ate', standbyDate.toISOString())
            mudou = true
          }
        } else if (estadoAtual === 'reativado') {
          const standbyAteStr = c.getString('standby_ate')
          let emStandby = false
          if (standbyAteStr) {
            const parsedStandby = new Date(standbyAteStr)
            if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
              emStandby = true
            }
          }

          if (emStandby) {
            if (c.getString('operador') || c.getString('lock_timestamp')) {
              c.set('operador', '')
              c.set('lock_timestamp', null)
              mudou = true
            }
          } else {
            const pedidoConfirmado = c.getBool('pedido_confirmado')
            const comprouDeFato =
              pedidoConfirmado || (faixa === 'recente' && Boolean(ultimaDataStr))

            if (comprouDeFato) {
              if (c.getString('operador') || c.getString('lock_timestamp')) {
                c.set('operador', '')
                c.set('lock_timestamp', null)
                mudou = true
              }
            } else {
              c.set('estado', 'na_base')
              c.set('operador', '')
              c.set('lock_timestamp', null)
              c.set('standby_ate', null)
              c.set('reativado_em', null)
              mudou = true
            }
          }
        } else {
          const standbyAteStr = c.getString('standby_ate')
          if (standbyAteStr) {
            const parsedStandby = new Date(standbyAteStr)
            if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > nowMs) {
              c.set('estado', 'reativado')
              c.set('operador', '')
              c.set('lock_timestamp', null)
              mudou = true
            }
          }
        }

        // DDD e Regra ATACADO
        const dddCalc = extrairDddCliente(c)
        if (c.getString('ddd_telefone') !== dddCalc) {
          c.set('ddd_telefone', dddCalc)
          mudou = true
        }

        // Blindagem de Base Categoria
        const categoriaAtual = c.getString('base_categoria')
        const desfechoUltimo = c.getString('desfecho_final') || c.getString('ultimo_desfecho')
        const isClienteFinalPorDesfecho =
          desfechoUltimo === 'cliente_final' || categoriaAtual === 'cliente_final'

        const cleanDoc = String(c.getString('cpf_cnpj') || '').replace(/\D/g, '')
        const isCpfOuNaoIdentificado = cleanDoc.length === 11 || !cleanDoc
        const cCount = c.getInt('compras_count') || c.getInt('frequencia_compras_12m') || 1
        const segAtualNorm = normalizarTextoNFD(c.getString('segmento') || '')
        const isClienteFinalComportamento =
          isCpfOuNaoIdentificado &&
          cCount <= 2 &&
          (segAtualNorm === 'CLIENTE FINAL' ||
            segAtualNorm.includes('CLIENTE FINAL') ||
            segAtualNorm.includes('CONSUMIDOR')) &&
          (dias <= 730 || dias === 0)

        const regiaoAtual = normalizarTextoNFD(c.getString('regiao') || '')
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

        // Correção 1 & 2: sem_dono_equipe tolerante com apelidos, canais e sinônimos
        const vRaw = c.getString('vendedor') || ''
        const tipoVendRaw = c.getString('tipo_vendedor') || ''
        const vLimpo = limparPrefixoVendedor(vRaw)
        const tipoLimpo = normalizarTextoNFD(tipoVendRaw)
        const vTexto = `${vLimpo} ${tipoLimpo}`

        let temDonoNaEquipe = false
        if (!vRaw.trim() && !tipoVendRaw.trim()) {
          // Cliente sem vendedor específico: na rota, líder pode atender
          temDonoNaEquipe = false
        } else {
          // Verifica se bate com algum termo/apelido da equipe ativa
          for (let t = 0; t < termosEquipeAtiva.length; t++) {
            const termo = termosEquipeAtiva[t]
            if (vTexto.includes(termo) || vLimpo.includes(termo)) {
              temDonoNaEquipe = true
              break
            }
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
