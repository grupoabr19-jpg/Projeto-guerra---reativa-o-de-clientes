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
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')

      // Extração do primeiro nome do operador em maiúsculas para matching de carteira
      // Ex: "Bruna Pereira" -> "BRUNA"; "Peterson Seixas" -> "PETERSON"; "Thais Oliveira" -> "THAIS"; "Ariane Souza" -> "ARIANE"
      const userFirstName = (userName.split(' ')[0] || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()

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

      // Identificação dos perfis de rota
      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')
      const isAtacado = userRegioes.some((r) => r.toUpperCase() === 'ATACADO')

      // Mapa de DDDs do ATACADO por operador:
      // - Larissa Terra: DDDs 11, 12, 13
      // - Julio Melo: DDDs 15, 19
      // - Wilson Neto: DDDs 14, 16, 17, 18
      let atacadoDddsPermitidos = []
      if (isAtacado) {
        if (userFirstName === 'LARISSA') {
          atacadoDddsPermitidos = ['11', '12', '13']
        } else if (userFirstName === 'JULIO' || userFirstName === 'JÚLIO') {
          atacadoDddsPermitidos = ['15', '19']
        } else if (userFirstName === 'WILSON') {
          atacadoDddsPermitidos = ['14', '16', '17', '18']
        } else {
          // Fallback para supervisor/admin ou outro membro do atacado
          atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
        }
      }

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
            carteira_esgotada: false,
            message: 'Você já possui um contato em andamento.',
          })
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
        if (upper === 'ATACADO') {
          return "regiao = 'ATACADO'"
        }
        return `regiao = '${upper}'`
      }

      let regiaoFilter = ''
      if (isRepescagem) {
        regiaoFilter = ''
      } else if (userRole === 'operador' || userRole === 'lider') {
        if (userRegioes.length > 0) {
          const parts = userRegioes.map((r) => buildRegiaoCondition(r))
          regiaoFilter = parts.length === 1 ? parts[0] : `(${parts.join(' || ')})`
        } else {
          regiaoFilter = ''
        }
      } else {
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

      // Helper para extrair DDD do cliente
      const extrairDdd = (clienteRec) => {
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

      // Helper para checar se o vendedor do cliente corresponde ao operador (Matching Carteira Varejo)
      const matchesCarteiraVendedor = (clienteRec) => {
        if (!userFirstName) return true
        const v = (clienteRec.getString('vendedor') || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
        if (!v) return false
        // Ex: "VARE - BRUNA PEREIRA" -> matches "BRUNA"
        // Ex: "VAREXT - PETERSON SEIXAS (VARGINHA)" -> matches "PETERSON"
        // Ex: "VCORP - THAIS OLIVEIRA" -> matches "THAIS"
        // Ex: "ARIANE" -> matches "ARIANE"
        // Ex: "JOSÉ FELIPE" / "JOSE FELIPE" -> matches "JOSE"
        return v.includes(userFirstName)
      }

      let cand = null

      // A: Reagendados vencidos do operador ou da região
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
          // Prioridade máxima: follow-ups do próprio operador (ou atribuídos especificamente a ele)
          const myReags = reagendados.filter((r) => r.getString('reagendado_operador') === userId)
          if (myReags.length > 0) {
            const transferido = myReags.find((r) => r.getBool('prioridade_transferencia') === true)
            cand = transferido || myReags[0]
          } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
            // No Atacado, filtra por DDD
            for (let k = 0; k < reagendados.length; k++) {
              const rCand = reagendados[k]
              const ddd = extrairDdd(rCand)
              if (atacadoDddsPermitidos.includes(ddd)) {
                cand = rCand
                break
              }
            }
          } else if (!isRepescagem && (userRole === 'operador' || userRole === 'lider')) {
            // No Varejo, filtra por carteira do operador
            for (let k = 0; k < reagendados.length; k++) {
              const rCand = reagendados[k]
              if (matchesCarteiraVendedor(rCand)) {
                cand = rCand
                break
              }
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

        // Filtro base limpo com novas bases separadas:
        // Exclui clientes ativo_fora_base, cliente_final, atacado_fora_mapa e sem_dono_equipe (para operadores)
        let baseFilter =
          "estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'"

        if (regiaoFilter) {
          baseFilter += ` && ${regiaoFilter}`
        }
        if (isRepescagem) {
          baseFilter += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
        }
        if (filtroSegmento && filtroSegmento !== 'todos') {
          baseFilter += ` && segmento = '${filtroSegmento}'`
        }

        // Se for operador/líder do Varejo (não Atacado nem Repescagem), exclui clientes marcados como sem_dono_equipe
        if (!isAtacado && !isRepescagem && (userRole === 'operador' || userRole === 'lider')) {
          baseFilter += ' && sem_dono_equipe != true'
        }

        let pool = []
        try {
          // Busca um pool maior (300) para poder aplicar matching de carteira e DDD com precisão
          pool = $app.findRecordsByFilter('clientes', baseFilter, sortExpr, 300, 0)
        } catch (findErr) {
          console.log('[queue_reserve] Erro em findRecordsByFilter clientes: ' + findErr.message)
        }

        // Fallback: se pool na região estiver vazia e operador tiver filtro de segmento, tenta sem filtro de segmento
        if ((!pool || pool.length === 0) && filtroSegmento && filtroSegmento !== 'todos') {
          try {
            let fallbackFilter =
              "estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'"
            if (regiaoFilter) fallbackFilter += ` && ${regiaoFilter}`
            if (!isAtacado && !isRepescagem && (userRole === 'operador' || userRole === 'lider')) {
              fallbackFilter += ' && sem_dono_equipe != true'
            }
            pool = $app.findRecordsByFilter('clientes', fallbackFilter, sortExpr, 300, 0)
          } catch (_) {}
        }

        // =========================================================================
        // APLICAÇÃO DAS REGRAS ESPECÍFICAS DE CARTEIRA E DDD
        // =========================================================================
        if (pool && pool.length > 0) {
          if (isRepescagem) {
            // Priscila atende 90+ de todas as rotas exceto já contatados pelo vendedor original
            for (let m = 0; m < pool.length; m++) {
              const item = pool[m]
              if (!jaContatadoPeloVendedorOriginal(item)) {
                cand = item
                break
              }
            }
          } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
            // ATACADO: Filtrar estritamente clientes cujo DDD esteja no mapa do operador
            const poolAtacadoOperador = pool.filter((c) => {
              const ddd = extrairDdd(c)
              return atacadoDddsPermitidos.includes(ddd)
            })

            if (poolAtacadoOperador.length > 0) {
              if (ordenacaoEscolhida === 'antigos') {
                cand = poolAtacadoOperador[0]
              } else {
                // Prioridade: faixa 60–89 primeiro; faixa 90+ só quando não houver 60–89
                const faixa60 = poolAtacadoOperador.filter((c) => {
                  const f = c.getString('faixa')
                  const d = c.getInt('dias_sem_faturar')
                  return f === '60_89' || (d >= 60 && d <= 89)
                })
                cand = faixa60.length > 0 ? faixa60[0] : poolAtacadoOperador[0]
              }
            }
          } else if (userRole === 'operador' || userRole === 'lider') {
            // VAREJO: Filtrar estritamente clientes cuja CARTEIRA individual pertence ao operador
            const poolCarteiraOperador = pool.filter((c) => matchesCarteiraVendedor(c))

            if (poolCarteiraOperador.length > 0) {
              if (ordenacaoEscolhida === 'antigos') {
                cand = poolCarteiraOperador[0]
              } else {
                // Prioridade idêntica: 60–89 primeiro; 90+ só depois ou por filtro 'antigos'
                const faixa60 = poolCarteiraOperador.filter((c) => {
                  const f = c.getString('faixa')
                  const d = c.getInt('dias_sem_faturar')
                  return f === '60_89' || (d >= 60 && d <= 89)
                })
                cand = faixa60.length > 0 ? faixa60[0] : poolCarteiraOperador[0]
              }
            }
          } else {
            // Supervisor ou admin atendendo: prioriza 60-89
            const faixa60 = pool.filter((c) => {
              const f = c.getString('faixa')
              const d = c.getInt('dias_sem_faturar')
              return f === '60_89' || (d >= 60 && d <= 89)
            })
            cand = faixa60.length > 0 ? faixa60[0] : pool[0]
          }
        }
      }

      // Se nenhum candidato elegível foi encontrado:
      if (!cand) {
        const isCarteiraVazia = userRole === 'operador' || userRole === 'lider'
        let msg = 'Fila de atendimento vazia para as regiões atribuídas no momento.'

        if (isRepescagem) {
          msg =
            'Nenhum cliente disponível na fila da Repescagem (90+ dias sem contato prévio do vendedor) no momento.'
        } else if (isAtacado && isCarteiraVazia) {
          msg = `Carteira esgotada para os seus DDDs (${atacadoDddsPermitidos.join(', ')}). Nenhum cliente disponível no seu mapa no momento.`
        } else if (isCarteiraVazia) {
          msg = `Carteira esgotada: não há clientes da sua carteira (${userName}) disponíveis para reativação no momento.`
        }

        return e.json(200, {
          cliente: null,
          carteira_esgotada: isCarteiraVazia,
          message: msg,
        })
      }

      // Lock atômico: atribui operador, lock_timestamp e muda estado para 'reservado'
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
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        cliente: cand,
        ja_reservado: false,
        carteira_esgotada: false,
        message: 'Novo contato reservado com sucesso.',
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
