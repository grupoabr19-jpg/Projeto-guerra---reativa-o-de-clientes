routerAdd(
  'POST',
  '/backend/v1/queue/reserve-next',
  (e) => {
    try {
      const userId = e.auth?.id
      if (!userId) return e.unauthorizedError('auth required')

      const user = $app.findRecordById('users', userId)
      const userRole = user.getString('role') || 'operador'
      const userRegioes = user.get('regioes') || []

      // Se já estiver com um cliente reservado ou em_atendimento há menos de 30 min, devolve esse mesmo
      const now = new Date()
      const timeoutMinutos = 30
      const cutoffTime = new Date(now.getTime() - timeoutMinutos * 60 * 1000).toISOString()

      const currentLocked = $app.findRecordsByFilter(
        'clientes',
        `operador = '${userId}' && (estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp >= '${cutoffTime}'`,
        '-lock_timestamp',
        1,
        0,
      )

      if (currentLocked && currentLocked.length > 0) {
        return e.json(200, {
          cliente: currentLocked[0],
          ja_reservado: true,
          message: 'Você já possui um contato em andamento.',
        })
      }

      // Buscar configurações de motor de fila
      let modoCriterio = 'modo_c'
      let bonusFaixa90 = 20
      try {
        const cfgRec = $app.findFirstRecordByData('configuracoes', 'chave', 'motor_fila')
        const cfgVal = cfgRec.get('valor') || {}
        if (cfgVal.modo_criterio) modoCriterio = cfgVal.modo_criterio
        if (cfgVal.bonus_faixa_90) bonusFaixa90 = cfgVal.bonus_faixa_90
      } catch (_) {}

      // 1. Prioridade A: Reagendados vencidos do operador (ou de qualquer operador se vencido e sem lock)
      // 2. Prioridade B: Reagendados de hoje
      // 3. Prioridade C: Fila regional conforme Modo A, B ou C

      const todayStr = now.toISOString().slice(0, 10)
      const endOfToday = `${todayStr} 23:59:59.999Z`

      // Constrói filtro de regiões
      let regiaoFilter = ''
      if (userRole === 'operador') {
        if (Array.isArray(userRegioes) && userRegioes.length > 0) {
          const parts = userRegioes.map((r) => `regiao = '${r}'`)
          regiaoFilter = `(${parts.join(' || ')})`
        } else {
          regiaoFilter = "regiao = 'Sem Regiao'"
        }
      } else {
        // Supervisor ou admin: se tiver regiões cadastradas filtra, senão todas
        if (Array.isArray(userRegioes) && userRegioes.length > 0) {
          const parts = userRegioes.map((r) => `regiao = '${r}'`)
          regiaoFilter = `(${parts.join(' || ')})`
        }
      }

      let cand = null

      // A: Reagendados vencidos do operador ou da região
      const reagFilter =
        `estado = 'reagendado' && reagendado_para <= '${endOfToday}'` +
        (regiaoFilter ? ` && ${regiaoFilter}` : '')
      const reagendados = $app.findRecordsByFilter('clientes', reagFilter, 'reagendado_para', 5, 0)

      if (reagendados && reagendados.length > 0) {
        // Prioriza se for do próprio operador ou qualquer um da região
        const myReag = reagendados.find((r) => r.getString('reagendado_operador') === userId)
        cand = myReag || reagendados[0]
      }

      // Se não achou reagendado, busca na base disponível (estado = 'na_base' ou lock expirado)
      if (!cand) {
        let sortExpr = '-score'
        if (modoCriterio === 'modo_a') {
          sortExpr = '-dias_sem_faturar'
        } else if (modoCriterio === 'modo_b') {
          sortExpr = '-score'
        } else {
          sortExpr = '-score' // modo_c
        }

        let baseFilter = `(estado = 'na_base' || ((estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp < '${cutoffTime}'))`
        if (regiaoFilter) {
          baseFilter += ` && ${regiaoFilter}`
        }

        // Evita telefones marcados como inválidos
        baseFilter += ' && telefone_invalido != true'

        const pool = $app.findRecordsByFilter('clientes', baseFilter, sortExpr, 20, 0)
        if (pool && pool.length > 0) {
          if (modoCriterio === 'modo_c') {
            // Ponderar bônus faixa 90+
            pool.sort((a, b) => {
              const scoreA =
                (a.getInt('score') || 0) + (a.getString('faixa') === '90_plus' ? bonusFaixa90 : 0)
              const scoreB =
                (b.getInt('score') || 0) + (b.getString('faixa') === '90_plus' ? bonusFaixa90 : 0)
              return scoreB - scoreA
            })
          }
          cand = pool[0]
        }
      }

      if (!cand) {
        return e.json(200, {
          cliente: null,
          message: 'Fila de atendimento vazia para as regiões atribuídas no momento.',
        })
      }

      // Lock atômico: atribui operador, lock_timestamp e muda estado para 'reservado'
      cand.set('estado', 'reservado')
      cand.set('operador', userId)
      cand.set('lock_timestamp', new Date().toISOString())
      $app.save(cand)

      // Registra evento de auditoria
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cand.id)
        ev.set('usuario', userId)
        ev.set('acao', 'lock_reservado')
        ev.set('detalhes', {
          codigo: cand.getString('codigo'),
          regiao: cand.getString('regiao'),
          score: cand.getInt('score'),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        cliente: cand,
        ja_reservado: false,
        message: 'Novo contato reservado com sucesso.',
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
