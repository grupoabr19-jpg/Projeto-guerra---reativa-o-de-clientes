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
