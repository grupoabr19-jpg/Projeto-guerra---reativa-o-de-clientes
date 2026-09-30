routerAdd(
  'POST',
  '/backend/v1/queue/reserve-next',
  (e) => {
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
      const userRole = authRecord.getString('role')

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

      // Normaliza para array de strings limpas
      if (Array.isArray(userRegioes)) {
        userRegioes = userRegioes.map((r) => String(r || '').trim()).filter(Boolean)
      } else {
        userRegioes = []
      }

      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

      // Verifica se o operador pertence à rota transversal "Repescagem"
      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')

      // 1. Verifica se o operador já tem um cliente reservado ou em atendimento ativo (dentro do lock de 30 min)
      try {
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
      } catch (lockErr) {
        console.log('[queue_reserve] Erro ao verificar lock existente: ' + lockErr.message)
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

      const todayStr = now.toISOString().slice(0, 10)
      const endOfToday = `${todayStr} 23:59:59.999Z`

      // Constrói filtro de regiões exato e rápido com suporte a variações de grafia
      const buildRegiaoCondition = (regiaoStr) => {
        const upper = String(regiaoStr).trim().toUpperCase()
        if (upper === 'BRAGANÇA' || upper === 'BRAGANCA') {
          return "(regiao = 'BRAGANÇA' || regiao = 'BRAGANCA' || regiao = 'BRAGANÇA PAULISTA' || regiao = 'BRAGANCA PAULISTA')"
        }
        if (upper === 'CAMBUÍ' || upper === 'CAMBUI') {
          return "(regiao = 'CAMBUÍ' || regiao = 'CAMBUI' || regiao = 'MICRO-REGIÃO' || regiao = 'MICRO REGIAO')"
        }
        if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS'
        ) {
          return "(regiao = 'POÇOS DE CALDAS' || regiao = 'POCOS DE CALDAS' || regiao = 'POÇOS CALDAS' || regiao = 'POCOS CALDAS')"
        }
        if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
          return "(regiao = 'JUNDIAÍ' || regiao = 'JUNDIAI')"
        }
        if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
          return "(regiao = 'ITAJUBÁ' || regiao = 'ITAJUBA')"
        }
        // Evita operador ~ (LIKE '%x%') para não causar full table scan nos 23 mil registros
        return `regiao = '${upper}'`
      }

      let regiaoFilter = ''
      if (isRepescagem) {
        // Rota Repescagem é transversal: ignora restrição de região
        regiaoFilter = ''
      } else if (userRole === 'operador') {
        if (userRegioes.length > 0) {
          const parts = userRegioes.map((r) => buildRegiaoCondition(r))
          regiaoFilter = parts.length === 1 ? parts[0] : `(${parts.join(' || ')})`
        } else {
          // Operador sem regiões atribuídas na conta: atende a base disponível para não travar a operação
          regiaoFilter = ''
        }
      } else {
        // Supervisor ou admin: se tiver regiões atribuídas busca nelas, senão tem acesso total
        if (userRegioes.length > 0) {
          const parts = userRegioes.map((r) => buildRegiaoCondition(r))
          regiaoFilter = parts.length === 1 ? parts[0] : `(${parts.join(' || ')})`
        } else {
          regiaoFilter = ''
        }
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

      // A: Reagendados vencidos do operador ou da região
      let reagFilter = `estado = 'reagendado' && reagendado_para <= '${endOfToday}'`
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
          // Prioridade máxima: follow-ups do próprio operador (ou atribuídos especificamente a ele)
          // ordenando os com prioridade_transferencia primeiro
          const myReags = reagendados.filter((r) => r.getString('reagendado_operador') === userId)
          if (myReags.length > 0) {
            // Se algum tem prioridade_transferencia = true, pega ele primeiro
            const transferido = myReags.find((r) => r.getBool('prioridade_transferencia') === true)
            cand = transferido || myReags[0]
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

      // B: Se não achou reagendado, busca na base de clientes disponíveis (estado = 'na_base')
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

        // Condição limpa e indexada para SQLite:
        // Prioriza estado = 'na_base', que usa diretamente o índice idx_clientes_fast_queue
        let baseFilter = "estado = 'na_base' && telefone_invalido != true"
        if (regiaoFilter) {
          baseFilter += ` && ${regiaoFilter}`
        }
        if (isRepescagem) {
          baseFilter += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
        }
        if (filtroSegmento && filtroSegmento !== 'todos') {
          baseFilter += ` && segmento = '${filtroSegmento}'`
        }

        let pool = []
        try {
          pool = $app.findRecordsByFilter('clientes', baseFilter, sortExpr, 50, 0)
        } catch (findErr) {
          console.log('[queue_reserve] Erro em findRecordsByFilter clientes: ' + findErr.message)
        }

        // Fallback: se pool na região estiver vazia e operador tiver região, tenta sem filtro de segmento
        if ((!pool || pool.length === 0) && filtroSegmento && filtroSegmento !== 'todos') {
          try {
            let fallbackFilter = "estado = 'na_base' && telefone_invalido != true"
            if (regiaoFilter) fallbackFilter += ` && ${regiaoFilter}`
            pool = $app.findRecordsByFilter('clientes', fallbackFilter, sortExpr, 30, 0)
          } catch (_) {}
        }

        // Fallback 2: se ainda assim não encontrar na região, para operadores sem clientes na base regional (ou se a região acabou),
        // busca clientes gerais com telefone válido para não deixar o operador ocioso
        if ((!pool || pool.length === 0) && userRole === 'operador' && !isRepescagem) {
          try {
            pool = $app.findRecordsByFilter(
              'clientes',
              "estado = 'na_base' && telefone_invalido != true",
              sortExpr,
              20,
              0,
            )
          } catch (_) {}
        }

        if (pool && pool.length > 0) {
          if (isRepescagem) {
            for (let m = 0; m < pool.length; m++) {
              const item = pool[m]
              if (!jaContatadoPeloVendedorOriginal(item)) {
                cand = item
                break
              }
            }
          } else {
            // Prioriza clientes 60-89 dias se houver
            const clientesFaixa60_89 = pool.filter((c) => {
              const f = c.getString('faixa')
              const d = c.getInt('dias_sem_faturar')
              return f === '60_89' || (d >= 60 && d <= 89)
            })

            if (clientesFaixa60_89.length > 0) {
              cand = clientesFaixa60_89[0]
            } else {
              cand = pool[0]
            }
          }
        }
      }

      if (!cand) {
        return e.json(200, {
          cliente: null,
          message: isRepescagem
            ? 'Nenhum cliente disponível na fila da Repescagem (90+ dias sem contato prévio do vendedor) no momento.'
            : 'Fila de atendimento vazia para as regiões atribuídas no momento.',
        })
      }

      // Lock atômico: atribui operador, lock_timestamp e muda estado para 'reservado'
      cand.set('estado', 'reservado')
      cand.set('operador', userId)
      cand.set('lock_timestamp', new Date().toISOString())
      // Se era uma transferência pendente que agora está sendo atendida, reseta a flag
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
          dias_sem_faturar: cand.getInt('dias_sem_faturar'),
          repescagem: isRepescagem,
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
