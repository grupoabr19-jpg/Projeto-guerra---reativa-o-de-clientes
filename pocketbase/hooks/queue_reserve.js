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
      const userRegioes = authRecord.get('regioes') || []
      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

      // Verifica se o operador pertence à rota transversal "Repescagem"
      const isRepescagem =
        Array.isArray(userRegioes) &&
        userRegioes.some((r) => {
          const upper = String(r).trim().toUpperCase()
          return upper === 'REPESCAGEM'
        })

      // Verifica se o operador já tem um cliente reservado ou em atendimento ativo (dentro do timeout de 30 min)
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

      const todayStr = now.toISOString().slice(0, 10)
      const endOfToday = `${todayStr} 23:59:59.999Z`

      // Constrói filtro de regiões
      let regiaoFilter = ''
      if (isRepescagem) {
        // Rota Repescagem é transversal: ignora restrição de uma única região (busca em todas as regiões)
        regiaoFilter = ''
      } else if (userRole === 'operador') {
        if (Array.isArray(userRegioes) && userRegioes.length > 0) {
          const parts = userRegioes.map((r) => {
            const upper = String(r).trim().toUpperCase()
            return `regiao = '${upper}'`
          })
          regiaoFilter = `(${parts.join(' || ')})`
        } else {
          regiaoFilter = "regiao = 'Sem Regiao' || regiao = 'Sem Região'"
        }
      } else {
        // Supervisor ou admin: se tiver regiões cadastradas filtra, senão todas
        if (Array.isArray(userRegioes) && userRegioes.length > 0) {
          const parts = userRegioes.map((r) => {
            const upper = String(r).trim().toUpperCase()
            return `regiao = '${upper}'`
          })
          regiaoFilter = `(${parts.join(' || ')})`
        }
      }

      // Função auxiliar inline para verificar se o cliente já foi contatado pelo vendedor original da rota
      // Regra da Repescagem: clientes já contatados pelo vendedor original NÃO entram na Repescagem.
      const jaContatadoPeloVendedorOriginal = (clienteRec) => {
        const cId = clienteRec.id
        const vendedorOriginal = clienteRec.getString('vendedor').trim().toUpperCase()

        // Também busca o vendedor_externo da região se não estiver no cliente
        let vendedorRegiao = ''
        const regNome = clienteRec.getString('regiao').trim().toUpperCase()
        if (regNome) {
          try {
            const rRec = $app.findFirstRecordByData('regioes', 'nome', regNome)
            if (rRec) {
              vendedorRegiao = rRec.getString('vendedor_externo').trim().toUpperCase()
            }
          } catch (_) {}
        }

        // Busca histórico de interações do cliente
        const interacoes = $app.findRecordsByFilter(
          'interacoes',
          `cliente = '${cId}'`,
          '-created',
          50,
          0,
        )

        if (!interacoes || interacoes.length === 0) {
          return false
        }

        for (let i = 0; i < interacoes.length; i++) {
          const it = interacoes[i]
          const opId = it.getString('operador')
          if (!opId) continue

          try {
            const opUser = $app.findRecordById('_pb_users_auth_', opId)
            if (opUser) {
              const opNome = opUser.getString('name').trim().toUpperCase()
              const opEmail = opUser.getString('email').trim().toUpperCase()

              // Compara com o vendedor original registrado ou da região
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

              if (vendedorRegiao) {
                if (
                  opNome === vendedorRegiao ||
                  opNome.includes(vendedorRegiao) ||
                  vendedorRegiao.includes(opNome) ||
                  opEmail.includes(vendedorRegiao)
                ) {
                  return true
                }
              }
            }
          } catch (_) {}
        }

        return false
      }

      let cand = null

      // A: Reagendados vencidos do operador ou da região
      let reagFilter = `estado = 'reagendado' && reagendado_para <= '${endOfToday}'`
      if (regiaoFilter) {
        reagFilter += ` && ${regiaoFilter}`
      }
      if (isRepescagem) {
        // Repescagem só atende clientes com mais de 90 dias sem faturar (faixa 90_plus ou dias_sem_faturar >= 90)
        reagFilter += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
      }
      if (filtroSegmento && filtroSegmento !== 'todos') {
        reagFilter += ` && segmento ~ '${filtroSegmento}'`
      }

      const reagendados = $app.findRecordsByFilter('clientes', reagFilter, 'reagendado_para', 50, 0)
      if (reagendados && reagendados.length > 0) {
        // Prioriza se for do próprio operador
        const myReag = reagendados.find((r) => r.getString('reagendado_operador') === userId)
        if (myReag) {
          cand = myReag
        } else {
          // Filtra se for Repescagem: exclui os contatados pelo vendedor original da rota
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

      // Se não achou reagendado, busca na base disponível
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

        let baseFilter = `(estado = 'na_base' || ((estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp < '${cutoffTime}'))`
        if (regiaoFilter) {
          baseFilter += ` && ${regiaoFilter}`
        }
        if (isRepescagem) {
          // Repescagem: rota transversal para clientes com 90+ dias sem faturar (excluindo os contatados pelo vendedor original)
          baseFilter += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
        } else {
          // Rotas normais (regionais):
          // Regra do negócio: prioriza e atende clientes na faixa "60-89 dias" (até 60-89 dias sem faturar)
          // Clientes "Sem Venda" (sem data de última compra) entram também na fila da região com prioridade normal/baixa
        }
        if (filtroSegmento && filtroSegmento !== 'todos') {
          baseFilter += ` && segmento ~ '${filtroSegmento}'`
        }

        // Evita telefones marcados como inválidos
        baseFilter += ' && telefone_invalido != true'

        const pool = $app.findRecordsByFilter('clientes', baseFilter, sortExpr, 150, 0)
        if (pool && pool.length > 0) {
          if (isRepescagem) {
            // Repescagem: percorre e escolhe o primeiro com 90+ dias que NÃO tenha contato prévio do vendedor original
            for (let m = 0; m < pool.length; m++) {
              const item = pool[m]
              if (!jaContatadoPeloVendedorOriginal(item)) {
                cand = item
                break
              }
            }
          } else {
            // Rotas normais regionais:
            // Regra do Projeto Guerra: clientes com até 60-89 dias sem faturamento (faixa '60_89')
            // têm prioridade absoluta nas rotas regionais.
            // Se houver clientes 60-89 dias, seleciona o melhor deles.
            // Em segundo lugar, se não houver clientes 60-89 dias disponíveis, atende clientes com 90+ dias da região ou Sem Venda.
            const clientesFaixa60_89 = pool.filter((c) => {
              const f = c.getString('faixa')
              const d = c.getInt('dias_sem_faturar')
              return f === '60_89' || (d >= 60 && d <= 89)
            })

            if (clientesFaixa60_89.length > 0) {
              if (ordenacaoEscolhida === 'antigos') {
                clientesFaixa60_89.sort(
                  (a, b) =>
                    (b.getInt('dias_sem_faturar') || 0) - (a.getInt('dias_sem_faturar') || 0),
                )
              } else if (ordenacaoEscolhida === 'novos') {
                clientesFaixa60_89.sort(
                  (a, b) =>
                    (a.getInt('dias_sem_faturar') || 0) - (b.getInt('dias_sem_faturar') || 0),
                )
              } else {
                clientesFaixa60_89.sort(
                  (a, b) => (b.getInt('score') || 0) - (a.getInt('score') || 0),
                )
              }
              cand = clientesFaixa60_89[0]
            } else {
              // Se não há na faixa 60-89, pega da pool geral da região
              if (ordenacaoEscolhida === 'score' && modoCriterio === 'modo_c') {
                pool.sort((a, b) => {
                  const scoreA =
                    (a.getInt('score') || 0) +
                    (a.getString('faixa') === '90_plus' ? bonusFaixa90 : 0)
                  const scoreB =
                    (b.getInt('score') || 0) +
                    (b.getString('faixa') === '90_plus' ? bonusFaixa90 : 0)
                  return scoreB - scoreA
                })
              }
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
