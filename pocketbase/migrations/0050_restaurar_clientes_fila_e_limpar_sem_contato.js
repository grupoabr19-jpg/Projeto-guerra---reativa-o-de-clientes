migrate(
  (app) => {
    // 1. Restaurar para 'na_base' clientes que foram indevidamente alterados para 'sem_contato'
    // pelo chunking de substituição total ou pelo importador recente, DESDE QUE:
    // - tentativas_sem_contato seja 0 ou nulo (nunca foram tentados por operador em atendimento)
    // - não estejam marcados como ativo_fora_base
    // - não sejam clientes com faturamento recente (<60 dias)
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = 'na_base'
      WHERE estado = 'sem_contato'
        AND COALESCE(tentativas_sem_contato, 0) = 0
        AND COALESCE(ativo_fora_base, 0) != 1
        AND (faixa = '60_89' OR faixa = '90_plus' OR dias_sem_faturar >= 60 OR dias_sem_faturar IS NULL)
    `)
      .execute()

    // 1b. Corrigir clientes comerciais que foram indevidamente categorizados como 'cliente_final'
    // Restaurar base_categoria = 'normal' se o segmento NÃO for 'Cliente final' OU se for CNPJ (14 dígitos) OU compras > 2
    // Apenas mantemos em 'cliente_final' os atendimentos já desfechados como cliente final ou genuínos clientes finais
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'normal'
      WHERE base_categoria = 'cliente_final'
        AND (
          motivo_ativo_fora_base IS NULL
          OR (
            motivo_ativo_fora_base NOT LIKE '%cliente_final%'
            AND motivo_ativo_fora_base NOT LIKE '%Cliente final%'
            AND motivo_ativo_fora_base NOT LIKE '%uso pessoal%'
          )
        )
        AND (
          (segmento IS NOT NULL AND segmento != '' AND LOWER(segmento) NOT LIKE '%cliente final%' AND LOWER(segmento) NOT LIKE '%consumidor%')
          OR (LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '-', ''), '/', ''), ' ', '')) = 14)
          OR COALESCE(compras_count, 1) > 2
        )
    `)
      .execute()

    // 2. Corrigir clientes com vendedor da equipe ativa marcados indevidamente com sem_dono_equipe = 1
    // Nomes ativos: ALESSANDRO, LEIZ, HELOA, DYOVANA, JOSIANE, KAYLANE, PETERSON, BRUNA, THAIS,
    // PAOLA, VITORIA, JOSE, FELIPE, MILENA, CAMILA, JENNIFER, GABRIELA, JESSICA, GUSTAVO,
    // INAYARA, TAINARA, JULIANO, EDMILA, ARIANE, MATHEUS, JULIO, LARISSA, WILSON, PRISCILA
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET sem_dono_equipe = 0
      WHERE sem_dono_equipe = 1
        AND (
          UPPER(vendedor) LIKE '%BRUNA%'
          OR UPPER(vendedor) LIKE '%PETERSON%'
          OR UPPER(vendedor) LIKE '%THAIS%'
          OR UPPER(vendedor) LIKE '%ALESSANDRO%'
          OR UPPER(vendedor) LIKE '%LEIZ%'
          OR UPPER(vendedor) LIKE '%HELOA%'
          OR UPPER(vendedor) LIKE '%DYOVANA%'
          OR UPPER(vendedor) LIKE '%JOSIANE%'
          OR UPPER(vendedor) LIKE '%KAYLANE%'
          OR UPPER(vendedor) LIKE '%PAOLA%'
          OR UPPER(vendedor) LIKE '%VITORIA%'
          OR UPPER(vendedor) LIKE '%JOSE%'
          OR UPPER(vendedor) LIKE '%JOSÉ%'
          OR UPPER(vendedor) LIKE '%FELIPE%'
          OR UPPER(vendedor) LIKE '%MILENA%'
          OR UPPER(vendedor) LIKE '%CAMILA%'
          OR UPPER(vendedor) LIKE '%JENNIFER%'
          OR UPPER(vendedor) LIKE '%GABRIELA%'
          OR UPPER(vendedor) LIKE '%JESSICA%'
          OR UPPER(vendedor) LIKE '%JÉSSICA%'
          OR UPPER(vendedor) LIKE '%GUSTAVO%'
          OR UPPER(vendedor) LIKE '%INAYARA%'
          OR UPPER(vendedor) LIKE '%TAINARA%'
          OR UPPER(vendedor) LIKE '%JULIANO%'
          OR UPPER(vendedor) LIKE '%EDMILA%'
          OR UPPER(vendedor) LIKE '%ARIANE%'
          OR UPPER(vendedor) LIKE '%MATHEUS%'
          OR UPPER(vendedor) LIKE '%JULIO%'
          OR UPPER(vendedor) LIKE '%LARISSA%'
          OR UPPER(vendedor) LIKE '%WILSON%'
          OR UPPER(vendedor) LIKE '%PRISCILA%'
        )
    `)
      .execute()

    // 3. Executar rodada imediata de sincronização de faixas e score (corrigindo o ReferenceError)
    const now = new Date()
    const nowMs = now.getTime()
    let totalProcessados = 0
    let totalReconciliados = 0

    let pesos = {
      recencia: 30,
      frequencia: 25,
      ticket_tonelagem: 20,
      segmento: 10,
      tentativas_penalidade: 15,
    }
    try {
      const cfg = app.findFirstRecordByData('configuracoes', 'chave', 'pesos_score')
      if (cfg && cfg.get('valor')) pesos = cfg.get('valor')
    } catch (_) {}

    const pageSize = 200
    let page = 0
    let hasMore = true

    while (hasMore) {
      const batch = app.findRecordsByFilter(
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
        } else if ((faixa === '60_89' || faixa === '90_plus') && estadoAtual === 'reativado') {
          c.set('estado', 'na_base')
          c.set('operador', '')
          c.set('lock_timestamp', null)
        }

        const scoreRecencia = Math.min(100, Math.round((dias / 180) * 100))
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

        app.save(c)
      }

      if (batch.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'restauracao_clientes_fila_concluida')
      ev.set('detalhes', {
        executado_em: now.toISOString(),
        total_processados: totalProcessados,
        total_reconciliados_faturaram: totalReconciliados,
      })
      app.save(ev)
    } catch (_) {}
  },
  (app) => {},
)
