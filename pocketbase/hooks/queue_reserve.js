// pocketbase/hooks/queue_reserve.js
// Endpoint de reserva do próximo cliente na fila / carteira
// Implementa as 7 correções de blindagem da auditoria 0080

routerAdd(
  'POST',
  '/backend/v1/queue/reserve-next',
  (e) => {
    // Utilitários de normalização e matching definidos diretamente no corpo do handler (escopo Goja isolado)
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function buildRegiaoSqlFilter(regiaoStr) {
      const norm = normalizarTextoNFD(regiaoStr)
      if (norm === 'BRAGANCA' || norm === 'BRAGANCA PAULISTA' || norm.includes('BRAGANCA')) {
        return "(regiao = 'BRAGANÇA' || regiao = 'BRAGANCA' || regiao = 'BRAGANÇA PAULISTA' || regiao = 'BRAGANCA PAULISTA' || regiao ~ 'BRAGANCA' || regiao ~ 'BRAGANÇA')"
      }
      if (
        norm === 'CAMBUI' ||
        norm === 'MICRO-REGIAO' ||
        norm === 'MICRO REGIAO' ||
        norm === 'MICROREGIAO' ||
        norm.includes('CAMBUI')
      ) {
        return "(regiao = 'CAMBUÍ' || regiao = 'CAMBUI' || regiao = 'MICRO-REGIÃO' || regiao = 'MICRO REGIAO' || regiao ~ 'CAMBUI' || regiao ~ 'CAMBUÍ')"
      }
      if (
        norm === 'POCOS DE CALDAS' ||
        norm === 'POCOS CALDAS' ||
        norm === 'POCOS' ||
        norm.includes('POCOS') ||
        norm.includes('CALDAS')
      ) {
        return "(regiao = 'POÇOS DE CALDAS' || regiao = 'POCOS DE CALDAS' || regiao = 'POÇOS CALDAS' || regiao = 'POCOS CALDAS' || regiao ~ 'POCOS' || regiao ~ 'POÇOS')"
      }
      if (norm === 'JUNDIAI' || norm.includes('JUNDIAI')) {
        return "(regiao = 'JUNDIAÍ' || regiao = 'JUNDIAI' || regiao ~ 'JUNDIAI' || regiao ~ 'JUNDIAÍ')"
      }
      if (norm === 'ITAJUBA' || norm.includes('ITAJUBA')) {
        return "(regiao = 'ITAJUBÁ' || regiao = 'ITAJUBA' || regiao ~ 'ITAJUBA' || regiao ~ 'ITAJUBÁ')"
      }
      if (norm === 'VARGINHA' || norm.includes('VARGINHA')) {
        return "(regiao = 'VARGINHA' || regiao ~ 'VARGINHA')"
      }
      if (norm === 'POUSO ALEGRE' || norm.includes('POUSO')) {
        return "(regiao = 'POUSO ALEGRE' || regiao ~ 'POUSO ALEGRE')"
      }
      if (norm === 'EXTREMA' || norm.includes('EXTREMA')) {
        return "(regiao = 'EXTREMA' || regiao ~ 'EXTREMA')"
      }
      if (norm === 'ATACADO') {
        return "regiao = 'ATACADO'"
      }
      if (norm === 'REPESCAGEM') {
        return "regiao = 'REPESCAGEM'"
      }
      return `(regiao = '${norm}' || regiao ~ '${norm}')`
    }

    function limparPrefixoVendedor(vendedorStr) {
      let v = normalizarTextoNFD(vendedorStr)
      const prefixos = [
        'VARE - ',
        'VCORP - ',
        'VAREXT - ',
        'ATR - ',
        'VARC - ',
        'ADMV - ',
        'ATF - ',
      ]
      for (let i = 0; i < prefixos.length; i++) {
        const p = normalizarTextoNFD(prefixos[i])
        if (v.startsWith(p)) {
          v = v.slice(p.length).trim()
          break
        }
      }
      return v
    }

    function obterVariantesVendedor(nomeOuToken) {
      const norm = normalizarTextoNFD(nomeOuToken)
      const variantes = new Set()
      if (!norm) return []

      variantes.add(norm)

      if (norm.includes('ALESSANDRO') || norm.includes('JAPA')) {
        variantes.add('ALESSANDRO')
        variantes.add('JAPA')
      }
      if (norm.includes('JESSICA') || norm.includes('JESSIKA')) {
        variantes.add('JESSICA')
        variantes.add('JESSIKA')
      }
      if (norm.includes('JOSE FELIPE') || norm.includes('FELIPE') || norm.includes('JOSE')) {
        variantes.add('JOSE FELIPE')
        variantes.add('FELIPE')
        variantes.add('JOSE')
      }
      if (
        norm.includes('ARIANE') ||
        norm.includes('CONSTRUCAO CIVIL') ||
        norm.includes('CONSTRUCAO')
      ) {
        variantes.add('ARIANE')
        variantes.add('CONSTRUCAO CIVIL')
        variantes.add('CONSTRUCAO')
      }

      const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 3)
      for (let i = 0; i < partes.length; i++) {
        variantes.add(partes[i])
        if (partes[i] === 'JAPA') variantes.add('ALESSANDRO')
        if (partes[i] === 'ALESSANDRO') variantes.add('JAPA')
        if (partes[i] === 'JESSIKA') variantes.add('JESSICA')
        if (partes[i] === 'JESSICA') variantes.add('JESSIKA')
        if (partes[i] === 'FELIPE') {
          variantes.add('JOSE FELIPE')
          variantes.add('JOSE')
        }
      }

      return Array.from(variantes)
    }

    function matchesCarteiraVendedorTolerante(clienteRec, userName) {
      if (!userName) return true
      const vRaw = clienteRec.getString('vendedor') || ''
      const tipoVendRaw = clienteRec.getString('tipo_vendedor') || ''
      if (!vRaw && !tipoVendRaw) return false

      const vLimpo = limparPrefixoVendedor(vRaw)
      const tipoLimpo = normalizarTextoNFD(tipoVendRaw)
      const vTextoCompleto = `${vLimpo} ${tipoLimpo}`

      const userNorm = normalizarTextoNFD(userName)
      const userVariantes = obterVariantesVendedor(userNorm)

      if (vLimpo === userNorm || vLimpo.includes(userNorm) || userNorm.includes(vLimpo)) {
        return true
      }

      for (let i = 0; i < userVariantes.length; i++) {
        const varItem = userVariantes[i]
        if (varItem.length < 3) continue

        if (
          vLimpo.includes(varItem) ||
          tipoLimpo.includes(varItem) ||
          vTextoCompleto.includes(varItem)
        ) {
          return true
        }
      }

      return false
    }

    function buildVendedorSqlTerms(userName) {
      const variantes = obterVariantesVendedor(userName)
      const tokens = []
      for (let i = 0; i < variantes.length; i++) {
        const v = variantes[i]
        if (v.length >= 3 && v !== 'DOS' && v !== 'DAS' && v !== 'SILVA') {
          tokens.push(v)
        }
      }
      return tokens
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
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const filtroSegmento = body.segmento ? String(body.segmento).trim() : ''
      const ordenacaoEscolhida = body.ordenacao ? String(body.ordenacao).trim() : 'score'

      const userId = authRecord.id
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')
      const isLider = userRole === 'lider'

      // EXPURGO ATÔMICO IMEDIATO: liberação de qualquer lock expirado (> 30 min) na base
      // antes de computar reservas ou checar lock do próprio operador
      expurgarLocksExpiradosAtomicamente($app)

      // Extração resiliente de regioes do authRecord (Goja runtime do PocketBase)
      let userRegioes = []
      try {
        const slice = authRecord.getStringSlice('regioes')
        if (slice && slice.length > 0) {
          userRegioes = slice
        } else {
          const raw = authRecord.getString('regioes')
          if (raw && raw.trim().startsWith('[')) {
            userRegioes = JSON.parse(raw)
          } else {
            const rawGet = authRecord.get('regioes')
            if (Array.isArray(rawGet)) {
              userRegioes = rawGet
            }
          }
        }
      } catch (_) {
        const rawGet = authRecord.get('regioes')
        if (Array.isArray(rawGet)) {
          userRegioes = rawGet
        }
      }

      if (Array.isArray(userRegioes)) {
        userRegioes = userRegioes.map((r) => String(r || '').trim()).filter(Boolean)
      } else {
        userRegioes = []
      }

      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

      // Identificação dos perfis de rota
      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')
      const isAtacado = userRegioes.some((r) => r.toUpperCase() === 'ATACADO')

      // Mapa de DDDs do ATACADO por operador:
      // - Larissa Terra: DDDs 11, 12, 13
      // - Julio Melo: DDDs 15, 19
      // - Wilson Neto: DDDs 14, 16, 17, 18
      let atacadoDddsPermitidos = []
      const userNameNorm = normalizarTextoNFD(userName)
      if (isAtacado) {
        if (userNameNorm.includes('LARISSA')) {
          atacadoDddsPermitidos = ['11', '12', '13']
        } else if (userNameNorm.includes('JULIO')) {
          atacadoDddsPermitidos = ['15', '19']
        } else if (userNameNorm.includes('WILSON')) {
          atacadoDddsPermitidos = ['14', '16', '17', '18']
        } else {
          // Fallback para supervisor/admin ou outro membro do atacado
          atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
        }
      }

      // 1. Verifica se o operador já tem um cliente reservado ou em atendimento ativo (dentro do lock de 30 min)
      // REGRA DE SANEAMENTO ATÔMICO: Se o lock ativo apontar para cliente que JÁ TEM desfecho gravado
      // ou reagendamento futuro/ativo, o servidor ignora e saneia o registro (limpa lock e acerta estado),
      // e segue para o próximo da fila — nunca mais devolve cliente concluído em loop!
      try {
        const currentLocked = $app.findRecordsByFilter(
          'clientes',
          `operador = '${userId}' && (estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp >= '${cutoffTime}'`,
          '-lock_timestamp',
          5,
          0,
        )

        if (currentLocked && currentLocked.length > 0) {
          for (let lcIdx = 0; lcIdx < currentLocked.length; lcIdx++) {
            const candLock = currentLocked[lcIdx]
            const candReagPara = candLock.getString('reagendado_para')
            const candEstado = candLock.getString('estado')

            // Checar se o cliente já tem interação de conclusão/desfecho recente ou se já foi concluído
            let temDesfechoGravado = false
            try {
              const ultimasInteracoes = $app.findRecordsByFilter(
                'interacoes',
                `cliente = '${candLock.id}' && desfecho != ''`,
                '-created',
                1,
                0,
              )
              if (ultimasInteracoes && ultimasInteracoes.length > 0) {
                temDesfechoGravado = true
              }
            } catch (_) {}

            const temReagendamentoFuturoOuGravado = Boolean(
              candReagPara && candReagPara.trim() !== '',
            )

            if (temDesfechoGravado || temReagendamentoFuturoOuGravado) {
              // Saneamento defensivo: limpa lock e operador e ajusta o estado
              console.log(
                `[queue_reserve] Saneando cliente concluído preso em lock: ${candLock.id} (código ${candLock.getString('codigo')}, desfecho: ${temDesfechoGravado}, reag: ${temReagendamentoFuturoOuGravado})`,
              )
              try {
                $app
                  .db()
                  .newQuery(
                    `UPDATE clientes
                   SET operador = '',
                       lock_timestamp = '1970-01-01 00:00:00.000Z',
                       estado = CASE
                         WHEN reagendado_para IS NOT NULL AND reagendado_para != '' THEN 'reagendado'
                         WHEN estado = 'em_atendimento' OR estado = 'reservado' THEN 'na_base'
                         ELSE estado
                       END
                   WHERE id = {:id}`,
                  )
                  .bind({ id: candLock.id })
                  .execute()
              } catch (sanErr) {
                console.log(
                  '[queue_reserve] Erro ao sanear cliente com desfecho: ' + sanErr.message,
                )
              }
              // Não devolve este cliente concluído! Continua verificando outros ou segue para a fila
              continue
            }

            // Cliente legítimo em andamento sem desfecho
            return e.json(200, {
              cliente: candLock,
              ja_reservado: true,
              carteira_esgotada: false,
              message: 'Você já possui um contato em andamento.',
            })
          }
        }
      } catch (lockErr) {
        console.log('[queue_reserve] Erro ao verificar lock existente: ' + lockErr.message)
      }

      // Buscar configurações de motor de fila
      let modoCriterio = 'modo_c'
      try {
        const cfgRec = $app.findFirstRecordByData('configuracoes', 'chave', 'motor_fila')
        const cfgVal = cfgRec.get('valor') || {}
        if (cfgVal.modo_criterio) modoCriterio = cfgVal.modo_criterio
      } catch (_) {}

      // Fuso de Brasília (UTC-3): hoje em BRT e fim do dia (meia-noite de Brasília em UTC)
      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
      const yBrt = dBrasilia.getUTCFullYear()
      const mBrt = dBrasilia.getUTCMonth()
      const dayBrt = dBrasilia.getUTCDate()
      const endOfTodayBrtUtcMs = Date.UTC(yBrt, mBrt, dayBrt + 1, 2, 59, 59, 999)
      const endOfToday = new Date(endOfTodayBrtUtcMs).toISOString()

      // Filtro de região
      let regiaoFilter = ''
      if (isRepescagem) {
        regiaoFilter = ''
      } else if (userRegioes.length > 0) {
        const parts = userRegioes.map((r) => buildRegiaoSqlFilter(r))
        regiaoFilter = parts.length === 1 ? parts[0] : `(${parts.join(' || ')})`
      }

      // Função defensiva de checagem para Repescagem
      const jaContatadoPeloVendedorOriginal = (clienteRec) => {
        try {
          const cId = clienteRec.id
          const vendedorOriginal = (clienteRec.getString('vendedor') || '').trim().toUpperCase()

          let interacoes = []
          try {
            interacoes = $app.findRecordsByFilter(
              'interacoes',
              `cliente = '${cId}'`,
              '-created',
              10,
              0,
            )
          } catch (_) {
            return false
          }

          if (!interacoes || interacoes.length === 0) return false

          for (let i = 0; i < interacoes.length; i++) {
            const it = interacoes[i]
            const opId = it.getString('operador')
            if (!opId) continue

            try {
              const opUser = $app.findRecordById('users', opId)
              if (opUser) {
                const opNome = (opUser.getString('name') || '').trim().toUpperCase()
                const opEmail = (opUser.getString('email') || '').trim().toUpperCase()

                if (vendedorOriginal) {
                  if (
                    opNome === vendedorOriginal ||
                    opNome.includes(vendedorOriginal) ||
                    vendedorOriginal.includes(opNome) ||
                    opEmail.includes(vendedorOriginal)
                  ) {
                    return true
                  }
                }
              }
            } catch (_) {}
          }
          return false
        } catch (_) {
          return false
        }
      }

      let cand = null

      // =========================================================================
      // A: REAGENDADOS VENCIDOS (Follow-ups do operador ou da região)
      // =========================================================================
      let reagFilter = `estado = 'reagendado' && reagendado_para <= '${endOfToday}' && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'`
      if (regiaoFilter) {
        reagFilter += ` && ${regiaoFilter}`
      }
      if (isRepescagem) {
        reagFilter += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
      }
      if (filtroSegmento && filtroSegmento !== 'todos') {
        reagFilter += ` && segmento = '${filtroSegmento}'`
      }

      try {
        const reagendados = $app.findRecordsByFilter(
          'clientes',
          reagFilter,
          '-prioridade_transferencia,reagendado_para',
          50,
          0,
        )
        if (reagendados && reagendados.length > 0) {
          // Prioridade máxima: follow-ups atribuídos diretamente a este operador
          const myReags = reagendados.filter((r) => r.getString('reagendado_operador') === userId)
          if (myReags.length > 0) {
            const transferido = myReags.find((r) => r.getBool('prioridade_transferencia') === true)
            cand = transferido || myReags[0]
          } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
            // No Atacado, filtra por DDD
            for (let k = 0; k < reagendados.length; k++) {
              const rCand = reagendados[k]
              const ddd = extrairDddCliente(rCand)
              if (atacadoDddsPermitidos.includes(ddd)) {
                cand = rCand
                break
              }
            }
          } else if (!isRepescagem && (userRole === 'operador' || userRole === 'lider')) {
            // No Varejo: Prioridade 1 = carteira própria (matching tolerante)
            for (let k = 0; k < reagendados.length; k++) {
              const rCand = reagendados[k]
              if (matchesCarteiraVendedorTolerante(rCand, userName)) {
                cand = rCand
                break
              }
            }
            // Se for Líder de Rota e não achou da carteira própria, suporta reagendados da rota
            if (!cand && isLider) {
              cand = reagendados[0]
            }
          } else {
            for (let k = 0; k < reagendados.length; k++) {
              const rCand = reagendados[k]
              if (isRepescagem) {
                if (!jaContatadoPeloVendedorOriginal(rCand)) {
                  cand = rCand
                  break
                }
              } else {
                cand = rCand
                break
              }
            }
          }
        }
      } catch (reagErr) {
        console.log('[queue_reserve] Aviso ao buscar reagendados: ' + reagErr.message)
      }

      // =========================================================================
      // B: BASE DISPONÍVEL (estado = 'na_base') COM BLINDAGEM DO POOL E 2ª PASSADA
      // =========================================================================
      let contagemCarteiraSemFiltroSegmento = 0
      let segundaPassadaExecutada = false

      if (!cand) {
        let sortExpr = '-score'
        if (ordenacaoEscolhida === 'antigos') {
          sortExpr = '-dias_sem_faturar'
        } else if (ordenacaoEscolhida === 'novos') {
          sortExpr = 'dias_sem_faturar'
        } else if (ordenacaoEscolhida === 'score') {
          sortExpr = '-score'
        } else if (modoCriterio === 'modo_a') {
          sortExpr = '-dias_sem_faturar'
        } else {
          sortExpr = '-score'
        }

        const nowIsoQueue = now.toISOString()
        const isVarejoOperadorOuLider =
          !isAtacado && !isRepescagem && (userRole === 'operador' || userRole === 'lider')

        // Termos SQL do vendedor e seus sinônimos para blindar o pool ANTES do LIMIT 500
        const vendedorTokens = buildVendedorSqlTerms(userName)

        // Helper para montar filtro da base
        const montarBaseFilter = (paramsFiltro) => {
          const { comFiltroVendedor, comFiltroSegmento, incluirSemDonoRota } = paramsFiltro
          let f = `estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`

          if (regiaoFilter) {
            f += ` && ${regiaoFilter}`
          }
          if (isRepescagem) {
            f += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
          }
          if (comFiltroSegmento && filtroSegmento && filtroSegmento !== 'todos') {
            f += ` && segmento = '${filtroSegmento}'`
          }

          if (isVarejoOperadorOuLider) {
            if (comFiltroVendedor && vendedorTokens.length > 0) {
              const vConds = vendedorTokens.map((t) => `vendedor ~ '${t}'`)
              f += ` && (${vConds.join(' || ')})`
            } else if (incluirSemDonoRota && isLider) {
              // Líder de rota: clientes sem dono na equipe ou com vendedor genérico da rota
              f += ' && sem_dono_equipe = true'
            }
          }

          return f
        }

        // =========================================================================
        // PASSADA 1: Busca primária específica
        // =========================================================================
        let pool = []
        try {
          const filterP1 = montarBaseFilter({
            comFiltroVendedor: isVarejoOperadorOuLider,
            comFiltroSegmento: true,
            incluirSemDonoRota: false,
          })
          pool = $app.findRecordsByFilter('clientes', filterP1, sortExpr, 500, 0)
        } catch (findErr) {
          console.log('[queue_reserve] Erro Passada 1 findRecordsByFilter: ' + findErr.message)
        }

        // =========================================================================
        // PASSADA 2: Fallback ampliado antes de declarar carteira esgotada
        // Se a passada 1 não retornar candidatos para Varejo:
        // - Se operador: amplia sem o filtro SQL estrito de vendedor (mas mantendo matching em memória)
        // - Se líder de rota: busca clientes da rota sem vendedor específico / sem dono (Prioridade 2)
        // =========================================================================
        const precisaSegundaPassada =
          (!pool || pool.length === 0) &&
          (isVarejoOperadorOuLider || (isAtacado && (!pool || pool.length === 0)))

        if (precisaSegundaPassada) {
          segundaPassadaExecutada = true
          try {
            if (isVarejoOperadorOuLider) {
              // Passada 2A: Tenta buscar da região com matching em memória (sem trava de token no SQL)
              const filterP2A = montarBaseFilter({
                comFiltroVendedor: false,
                comFiltroSegmento: true,
                incluirSemDonoRota: false,
              })
              const poolP2A = $app.findRecordsByFilter('clientes', filterP2A, sortExpr, 500, 0)
              if (poolP2A && poolP2A.length > 0) {
                // Filtra clientes da carteira do vendedor
                const daCarteira = poolP2A.filter((c) =>
                  matchesCarteiraVendedorTolerante(c, userName),
                )
                if (daCarteira.length > 0) {
                  pool = daCarteira
                } else if (isLider) {
                  // Prioridade 2 do Líder: suporte de vazão da equipe para clientes sem dono
                  const semDonoRota = poolP2A.filter((c) => c.getBool('sem_dono_equipe') === true)
                  if (semDonoRota.length > 0) {
                    pool = semDonoRota
                  }
                }
              }
            } else if (isAtacado) {
              // Atacado: re-busca pool amplo para garantir
              const filterAtacado = montarBaseFilter({
                comFiltroVendedor: false,
                comFiltroSegmento: true,
                incluirSemDonoRota: false,
              })
              pool = $app.findRecordsByFilter('clientes', filterAtacado, sortExpr, 500, 0)
            }
          } catch (p2Err) {
            console.log('[queue_reserve] Erro na 2ª passada ampliada: ' + p2Err.message)
          }
        }

        // Se o operador filtrou por segmento, calcular contagem sem filtro de segmento
        // para dar o aviso correto caso a carteira tenha clientes em outros segmentos
        if (filtroSegmento && filtroSegmento !== 'todos') {
          try {
            const filterSemSeg = montarBaseFilter({
              comFiltroVendedor: isVarejoOperadorOuLider,
              comFiltroSegmento: false,
              incluirSemDonoRota: false,
            })
            const poolSemSeg = $app.findRecordsByFilter('clientes', filterSemSeg, '-score', 500, 0)
            if (poolSemSeg && poolSemSeg.length > 0) {
              if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
                contagemCarteiraSemFiltroSegmento = poolSemSeg.filter((c) => {
                  const ddd = extrairDddCliente(c)
                  return atacadoDddsPermitidos.includes(ddd)
                }).length
              } else if (isVarejoOperadorOuLider) {
                contagemCarteiraSemFiltroSegmento = poolSemSeg.filter(
                  (c) =>
                    matchesCarteiraVendedorTolerante(c, userName) ||
                    (isLider && c.getBool('sem_dono_equipe') === true),
                ).length
              } else {
                contagemCarteiraSemFiltroSegmento = poolSemSeg.length
              }
            }
          } catch (_) {}
        }

        // =========================================================================
        // SELEÇÃO DO CANDIDATO NO POOL
        // =========================================================================
        if (pool && pool.length > 0) {
          if (isRepescagem) {
            for (let m = 0; m < pool.length; m++) {
              const item = pool[m]
              if (!jaContatadoPeloVendedorOriginal(item)) {
                cand = item
                break
              }
            }
          } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
            // ATACADO: Filtrar por DDDs permitidos
            const poolAtacadoOperador = pool.filter((c) => {
              const ddd = extrairDddCliente(c)
              return atacadoDddsPermitidos.includes(ddd)
            })

            if (poolAtacadoOperador.length > 0) {
              if (ordenacaoEscolhida === 'antigos') {
                cand = poolAtacadoOperador[0]
              } else {
                // Prioridade 60–89 primeiro; 90+ depois
                const faixa60 = poolAtacadoOperador.filter((c) => {
                  const f = c.getString('faixa')
                  const d = c.getInt('dias_sem_faturar')
                  return f === '60_89' || (d >= 60 && d <= 89)
                })
                cand = faixa60.length > 0 ? faixa60[0] : poolAtacadoOperador[0]
              }
            }
          } else if (isVarejoOperadorOuLider) {
            // VAREJO:
            // Prioridade 1: Carteira própria do vendedor (matching tolerante)
            const poolPropria = pool.filter((c) => matchesCarteiraVendedorTolerante(c, userName))

            let poolElegivel = []
            if (poolPropria.length > 0) {
              poolElegivel = poolPropria
            } else if (isLider) {
              // Prioridade 2 do Líder: suporte de vazão da equipe (clientes sem dono da rota)
              const poolSuporte = pool.filter((c) => c.getBool('sem_dono_equipe') === true)
              poolElegivel = poolSuporte
            }

            if (poolElegivel.length > 0) {
              if (ordenacaoEscolhida === 'antigos') {
                poolElegivel.sort(
                  (a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'),
                )
                cand = poolElegivel[0]
              } else if (ordenacaoEscolhida === 'novos') {
                poolElegivel.sort(
                  (a, b) => a.getInt('dias_sem_faturar') - b.getInt('dias_sem_faturar'),
                )
                cand = poolElegivel[0]
              } else {
                // Padrão: faixa 60–89 primeiro; esgotada, 90+ pelos mais antigos
                const faixa60 = poolElegivel.filter((c) => {
                  const f = c.getString('faixa')
                  const d = c.getInt('dias_sem_faturar')
                  return f === '60_89' || (d >= 60 && d <= 89)
                })
                if (faixa60.length > 0) {
                  cand = faixa60[0]
                } else {
                  const faixa90 = poolElegivel.filter((c) => {
                    const f = c.getString('faixa')
                    const d = c.getInt('dias_sem_faturar')
                    return f === '90_plus' || d >= 90
                  })
                  if (faixa90.length > 0) {
                    faixa90.sort(
                      (a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'),
                    )
                    cand = faixa90[0]
                  } else {
                    cand = poolElegivel[0]
                  }
                }
              }
            }
          } else {
            // Supervisor ou admin atendendo
            const faixa60 = pool.filter((c) => {
              const f = c.getString('faixa')
              const d = c.getInt('dias_sem_faturar')
              return f === '60_89' || (d >= 60 && d <= 89)
            })
            if (faixa60.length > 0) {
              cand = faixa60[0]
            } else {
              const faixa90 = pool.filter((c) => {
                const f = c.getString('faixa')
                const d = c.getInt('dias_sem_faturar')
                return f === '90_plus' || d >= 90
              })
              if (faixa90.length > 0) {
                faixa90.sort((a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'))
                cand = faixa90[0]
              } else {
                cand = pool[0]
              }
            }
          }
        }
      }

      // =========================================================================
      // NENHUM CANDIDATO ENCONTRADO
      // =========================================================================
      if (!cand) {
        // Se havia filtro de segmento ativo e existem clientes na carteira sem o filtro:
        const temFiltroSegmentoAtivo = filtroSegmento && filtroSegmento !== 'todos'
        if (temFiltroSegmentoAtivo && contagemCarteiraSemFiltroSegmento > 0) {
          return e.json(200, {
            cliente: null,
            carteira_esgotada: false,
            segmento_zerado: true,
            segunda_passada_executada: segundaPassadaExecutada,
            total_carteira_sem_filtro: contagemCarteiraSemFiltroSegmento,
            message: `Nenhum cliente disponível no segmento selecionado. Selecione 'Todos os Segmentos' para acessar os ${contagemCarteiraSemFiltroSegmento} clientes da sua carteira.`,
          })
        }

        const isCarteiraVazia = userRole === 'operador' || userRole === 'lider'
        let msg = 'Fila de atendimento vazia para as regiões atribuídas no momento.'

        if (isRepescagem) {
          msg =
            'Nenhum cliente disponível na fila da Repescagem (90+ dias sem contato prévio do vendedor) no momento.'
        } else if (isAtacado && isCarteiraVazia) {
          msg = `Carteira esgotada para os seus DDDs (${atacadoDddsPermitidos.join(', ')}). Nenhum cliente disponível no seu mapa no momento.`
        } else if (isCarteiraVazia) {
          if (isLider) {
            msg = `Carteira esgotada: não há clientes da sua carteira (${userName}) nem clientes de suporte da rota disponíveis para reativação no momento.`
          } else {
            msg = `Carteira esgotada: não há clientes da sua carteira (${userName}) disponíveis para reativação no momento.`
          }
        }

        return e.json(200, {
          cliente: null,
          carteira_esgotada: isCarteiraVazia,
          segmento_zerado: false,
          segunda_passada_executada: segundaPassadaExecutada,
          total_carteira_sem_filtro: 0,
          message: msg,
        })
      }

      // =========================================================================
      // LOCK ATÔMICO
      // =========================================================================
      cand.set('estado', 'reservado')
      cand.set('operador', userId)
      cand.set('lock_timestamp', new Date().toISOString())
      if (cand.getBool('prioridade_transferencia')) {
        cand.set('prioridade_transferencia', false)
      }
      $app.save(cand)

      // Registra evento de auditoria
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cand.id)
        ev.set('usuario', userId)
        ev.set('acao', isRepescagem ? 'lock_reservado_repescagem' : 'lock_reservado')
        ev.set('detalhes', {
          codigo: cand.getString('codigo'),
          regiao: cand.getString('regiao'),
          score: cand.getInt('score'),
          faixa: cand.getString('faixa'),
          vendedor: cand.getString('vendedor'),
          ddd_telefone: cand.getString('ddd_telefone'),
          dias_sem_faturar: cand.getInt('dias_sem_faturar'),
          repescagem: isRepescagem,
          atacado: isAtacado,
          is_lider: isLider,
          segunda_passada_executada: segundaPassadaExecutada,
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        cliente: cand,
        ja_reservado: false,
        carteira_esgotada: false,
        segunda_passada_executada: segundaPassadaExecutada,
        message: 'Novo contato reservado com sucesso.',
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[queue_reserve] Erro crítico em reserve-next: ' + errMsg)
      return e.json(500, { error: 'Falha ao reservar cliente na fila: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
