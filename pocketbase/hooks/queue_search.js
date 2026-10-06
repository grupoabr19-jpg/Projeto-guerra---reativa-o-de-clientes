routerAdd(
  'POST',
  '/backend/v1/queue/search-carteira',
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

      const termoBusca = (body.termo || '').trim()
      // Bloquear termos muito curtos (mínimo 3 caracteres)
      if (termoBusca.length < 3) {
        return e.json(400, {
          error: 'Digite pelo menos 3 caracteres para buscar na sua carteira.',
          items: [],
          total: 0,
        })
      }

      const userId = authRecord.id
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')

      // Extração resiliente de regiões do authRecord
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
            if (Array.isArray(rawGet)) userRegioes = rawGet
          }
        }
      } catch (_) {
        const rawGet = authRecord.get('regioes')
        if (Array.isArray(rawGet)) userRegioes = rawGet
      }
      if (Array.isArray(userRegioes)) {
        userRegioes = userRegioes.map((r) => String(r || '').trim()).filter(Boolean)
      } else {
        userRegioes = []
      }

      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')
      const isAtacado = userRegioes.some((r) => r.toUpperCase() === 'ATACADO')

      const userFirstName = (userName.split(' ')[0] || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()

      const userFullNameNorm = (userName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()

      // Mapa de DDDs do ATACADO por operador:
      let atacadoDddsPermitidos = []
      if (isAtacado) {
        if (userFirstName === 'LARISSA') {
          atacadoDddsPermitidos = ['11', '12', '13']
        } else if (userFirstName === 'JULIO' || userFirstName === 'JÚLIO') {
          atacadoDddsPermitidos = ['15', '19']
        } else if (userFirstName === 'WILSON') {
          atacadoDddsPermitidos = ['14', '16', '17', '18']
        } else {
          atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
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

      // Helper para matching de carteira Varejo (vendedor no cliente vs operador)
      const matchesCarteiraVendedor = (clienteRec) => {
        if (!userFirstName && !userFullNameNorm) return true
        const vRaw = clienteRec.getString('vendedor') || ''
        const v = vRaw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
        if (!v) return false

        let vSemCanal = v
        const prefixos = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ']
        for (let p = 0; p < prefixos.length; p++) {
          if (vSemCanal.startsWith(prefixos[p])) {
            vSemCanal = vSemCanal.slice(prefixos[p].length).trim()
            break
          }
        }

        if (
          userFullNameNorm &&
          (vSemCanal === userFullNameNorm ||
            v.includes(userFullNameNorm) ||
            userFullNameNorm.includes(vSemCanal))
        ) {
          return true
        }

        if (userFirstName && (v.includes(userFirstName) || vSemCanal.startsWith(userFirstName))) {
          return true
        }

        return false
      }

      // Helper de checagem Repescagem (não contatado pelo vendedor original)
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

      // Sanitiza termo de busca para SQLite filter
      const cleanTerm = termoBusca.replace(/['"\\]/g, '')

      // Filtro base: busca clientes por nome (ou código) na base.
      // Exclui clientes ativo_fora_base que já saíram da base.
      // Para operadores, líderes e supervisores: exclui clientes já reativados que ainda estão em standby válido!
      let filterExpr = `(nome ~ '${cleanTerm}' || codigo ~ '${cleanTerm}') && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'`
      if (userRole !== 'admin') {
        const nowIso = new Date().toISOString()
        filterExpr += ` && !(estado = 'reativado' && standby_ate > '${nowIso}')`
      }
      // Restrições de perfil/região
      if (isRepescagem) {
        filterExpr += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
      } else if (userRole === 'operador' || userRole === 'lider') {
        if (userRegioes.length > 0) {
          const parts = userRegioes.map((r) => buildRegiaoCondition(r))
          filterExpr += ` && (${parts.join(' || ')})`
        }
        if (!isAtacado) {
          filterExpr += ' && sem_dono_equipe != true'
          if (userFirstName && userFirstName.length >= 3) {
            filterExpr += ` && vendedor ~ '${userFirstName}'`
          }
        }
      } else if (userRegioes.length > 0) {
        // Supervisor com regiões atribuídas
        const parts = userRegioes.map((r) => buildRegiaoCondition(r))
        filterExpr += ` && (${parts.join(' || ')})`
      }

      // Buscar registros no PocketBase
      let pool = []
      try {
        pool = $app.findRecordsByFilter('clientes', filterExpr, '-score', 80, 0)
      } catch (err) {
        console.log('[queue_search] Erro ao buscar: ' + err.message)
      }

      // Fallback para Varejo se o filtro de vendedor com ~ foi estrito demais
      if (
        (!pool || pool.length === 0) &&
        !isAtacado &&
        !isRepescagem &&
        (userRole === 'operador' || userRole === 'lider')
      ) {
        try {
          let broadExpr = `(nome ~ '${cleanTerm}' || codigo ~ '${cleanTerm}') && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'`
          if (userRole !== 'admin') {
            const nowIsoFallback = new Date().toISOString()
            broadExpr += ` && !(estado = 'reativado' && standby_ate > '${nowIsoFallback}')`
          }
          if (userRegioes.length > 0) {
            const parts = userRegioes.map((r) => buildRegiaoCondition(r))
            broadExpr += ` && (${parts.join(' || ')})`
          }
          broadExpr += ' && sem_dono_equipe != true'
          pool = $app.findRecordsByFilter('clientes', broadExpr, '-score', 80, 0)
        } catch (_) {}
      }
      // Filtrar estritamente pela carteira no servidor
      let resultados = []
      if (pool && pool.length > 0) {
        if (isRepescagem) {
          resultados = pool.filter((c) => !jaContatadoPeloVendedorOriginal(c))
        } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
          resultados = pool.filter((c) => {
            const ddd = extrairDdd(c)
            return atacadoDddsPermitidos.includes(ddd)
          })
        } else if (userRole === 'operador' || userRole === 'lider') {
          resultados = pool.filter((c) => matchesCarteiraVendedor(c))
        } else {
          resultados = pool
        }
      }

      // Filtrar resultados adicionais para garantir que se standby_ate estiver no futuro e não for admin, NUNCA apareça
      let resultadosFiltrados = resultados
      if (userRole !== 'admin') {
        const nowTime = new Date().getTime()
        resultadosFiltrados = resultados.filter((c) => {
          const est = c.getString('estado')
          const stStr = c.getString('standby_ate')
          if (est === 'reativado' && stStr) {
            const stDate = new Date(stStr)
            if (!isNaN(stDate.getTime()) && stDate.getTime() > nowTime) {
              return false
            }
          }
          return true
        })
      }

      // Limitar a 20 resultados mais relevantes
      const sliced = resultadosFiltrados.slice(0, 20)

      // Formatar saída enxuta para a lista de resultados da busca
      const itemsFormatados = sliced.map((c) => {
        let ultimoContatoStr = '—'
        const ultFat = c.getString('ultimo_faturamento_data')
        const ultComp = c.getString('ultima_compra')
        if (ultFat) {
          try {
            ultimoContatoStr = new Date(ultFat).toLocaleDateString('pt-BR')
          } catch (_) {
            ultimoContatoStr = ultFat
          }
        } else if (ultComp) {
          try {
            ultimoContatoStr = new Date(ultComp).toLocaleDateString('pt-BR')
          } catch (_) {
            ultimoContatoStr = ultComp
          }
        }

        const stStr = c.getString('standby_ate')
        const estStr = c.getString('estado')
        let emStandby = false
        if (stStr) {
          const stDate = new Date(stStr)
          if (!isNaN(stDate.getTime()) && stDate.getTime() > new Date().getTime()) {
            emStandby = true
          }
        }

        return {
          id: c.id,
          codigo: c.getString('codigo'),
          nome: c.getString('nome'),
          regiao: c.getString('regiao'),
          vendedor: c.getString('vendedor'),
          segmento: c.getString('segmento'),
          dias_sem_faturar: c.getInt('dias_sem_faturar'),
          faixa: c.getString('faixa'),
          score: c.getInt('score'),
          estado: estStr,
          operador: c.getString('operador'),
          lock_timestamp: c.getString('lock_timestamp'),
          ultimo_faturamento_data: ultFat || ultComp || '',
          ultimo_contato: ultimoContatoStr,
          telefone: c.getString('telefone'),
          whatsapp: c.getString('whatsapp'),
          standby_ate: stStr,
          reativado_em: c.getString('reativado_em'),
          em_standby: emStandby,
        }
      })

      return e.json(200, {
        items: itemsFormatados,
        total: resultados.length,
        termo: cleanTerm,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[queue_search] Erro: ' + msg)
      return e.json(500, { error: 'Falha ao buscar clientes na carteira: ' + msg })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/queue/reserve-specific',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userId = authRecord.id
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = (body.cliente_id || '').trim()
      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      // Se já saiu como ativo fora da base
      if (cliente.getBool('ativo_fora_base')) {
        return e.json(400, {
          error: 'Este cliente já foi retirado da base como Ativo Fora da Base.',
        })
      }

      // Blindagem de Standby estrita: se o cliente está reativado e em período de standby futuro
      // OU se tem standby_ate no futuro mesmo que o estado tenha sido alterado indevidamente
      const estadoCli = cliente.getString('estado')
      const standbyAteStr = cliente.getString('standby_ate')
      const reativadoEmStr = cliente.getString('reativado_em')
      let emStandby = false
      if (standbyAteStr) {
        const parsedStandby = new Date(standbyAteStr)
        if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > new Date().getTime()) {
          emStandby = true
        }
      }

      if ((estadoCli === 'reativado' || emStandby) && emStandby && userRole !== 'admin') {
        return e.json(403, {
          error:
            'Este cliente foi reativado recentemente e está no período de standby de 60 dias fora da fila. Somente o administrador pode destravar ou acessar esta ficha.',
          is_standby: true,
          standby_ate: standbyAteStr,
          reativado_em: reativadoEmStr,
          cliente_id: cliente.id,
          cliente_nome: cliente.getString('nome'),
          cliente_codigo: cliente.getString('codigo'),
        })
      }

      // Checa lock de 30 min
      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      const currentOp = cliente.getString('operador')
      const estadoAtual = cliente.getString('estado')
      const lockTimestamp = cliente.getString('lock_timestamp')

      // Se o cliente já está em lock por OUTRO operador
      if (
        currentOp &&
        currentOp !== userId &&
        (estadoAtual === 'reservado' || estadoAtual === 'em_atendimento') &&
        lockTimestamp &&
        lockTimestamp >= cutoffTime
      ) {
        return e.json(409, {
          error: 'Este cliente já está em atendimento por outro operador no momento.',
        })
      }

      // Validação de carteira do operador logado
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
            if (Array.isArray(rawGet)) userRegioes = rawGet
          }
        }
      } catch (_) {
        const rawGet = authRecord.get('regioes')
        if (Array.isArray(rawGet)) userRegioes = rawGet
      }
      if (Array.isArray(userRegioes)) {
        userRegioes = userRegioes.map((r) => String(r || '').trim()).filter(Boolean)
      } else {
        userRegioes = []
      }

      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')
      const isAtacado = userRegioes.some((r) => r.toUpperCase() === 'ATACADO')

      const userFirstName = (userName.split(' ')[0] || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()

      const userFullNameNorm = (userName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()

      // Validar se cliente pertence à carteira
      if (userRole === 'operador' || userRole === 'lider') {
        if (isAtacado) {
          let atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
          if (userFirstName === 'LARISSA') atacadoDddsPermitidos = ['11', '12', '13']
          else if (userFirstName === 'JULIO' || userFirstName === 'JÚLIO')
            atacadoDddsPermitidos = ['15', '19']
          else if (userFirstName === 'WILSON') atacadoDddsPermitidos = ['14', '16', '17', '18']

          const dddGravado = cliente.getString('ddd_telefone')
          let ddd = dddGravado && dddGravado.length >= 2 ? dddGravado.slice(0, 2) : ''
          if (!ddd) {
            const telRaw = (
              cliente.getString('telefone') ||
              cliente.getString('whatsapp') ||
              ''
            ).replace(/\D/g, '')
            let s = telRaw
            if (s.startsWith('0')) s = s.slice(1)
            if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
            ddd = s.slice(0, 2)
          }

          if (!atacadoDddsPermitidos.includes(ddd)) {
            return e.json(403, {
              error: `Este cliente pertence a outro DDD do Atacado e não está na sua carteira (${atacadoDddsPermitidos.join(', ')}).`,
            })
          }
        } else if (!isRepescagem) {
          // Varejo: valida vendedor
          const vRaw = cliente.getString('vendedor') || ''
          const v = vRaw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim()

          let vSemCanal = v
          const prefixos = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ']
          for (let p = 0; p < prefixos.length; p++) {
            if (vSemCanal.startsWith(prefixos[p])) {
              vSemCanal = vSemCanal.slice(prefixos[p].length).trim()
              break
            }
          }

          const matchFullName =
            userFullNameNorm &&
            (vSemCanal === userFullNameNorm ||
              v.includes(userFullNameNorm) ||
              userFullNameNorm.includes(vSemCanal))
          const matchFirstName =
            userFirstName && (v.includes(userFirstName) || vSemCanal.startsWith(userFirstName))

          if (!matchFullName && !matchFirstName) {
            return e.json(403, {
              error:
                'Este cliente pertence à carteira de outro vendedor e não está sob sua responsabilidade.',
            })
          }
        }
      }

      // Se o operador já tiver OUTRO cliente em lock, libera o anterior de volta para 'na_base' (ou preserva)
      // para que ele possa abrir o cliente específico que procurou
      try {
        const currentLocked = $app.findRecordsByFilter(
          'clientes',
          `operador = '${userId}' && (estado = 'reservado' || estado = 'em_atendimento') && id != '${cliente.id}' && lock_timestamp >= '${cutoffTime}'`,
          '-lock_timestamp',
          5,
          0,
        )
        if (currentLocked && currentLocked.length > 0) {
          for (let k = 0; k < currentLocked.length; k++) {
            const outro = currentLocked[k]
            outro.set('estado', 'na_base')
            outro.set('operador', '')
            outro.set('lock_timestamp', null)
            $app.save(outro)
          }
        }
      } catch (lockErr) {
        console.log('[queue_search] Aviso ao liberar lock anterior: ' + lockErr.message)
      }

      // Aplica lock no cliente solicitado
      cliente.set('estado', 'em_atendimento')
      cliente.set('operador', userId)
      cliente.set('lock_timestamp', new Date().toISOString())
      $app.save(cliente)

      // Registra evento de auditoria
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', userId)
        ev.set('acao', 'lock_busca_carteira')
        ev.set('detalhes', {
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          regiao: cliente.getString('regiao'),
          vendedor: cliente.getString('vendedor'),
          motivo: 'atendimento_iniciado_por_busca_direta_carteira',
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        cliente: cliente,
        message: 'Cliente aberto da sua carteira com sucesso.',
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[queue_search] Erro em reserve-specific: ' + msg)
      return e.json(500, { error: 'Falha ao abrir cliente: ' + msg })
    }
  },
  $apis.requireAuth(),
)

/**
 * Endpoint para DESTRAVAR / remover standby de cliente
 * Exclusivo para role = 'admin' (operador, líder e supervisor recebem 403).
 * Limpa standby_ate e reativado_em, permitindo que o cliente volte à fila / carteira imediatamente.
 * Se o cliente ainda estiver como 'reativado', retorna para 'na_base' (ou mantém estado compatível se for reagendado).
 * Grava auditoria em eventos_log com usuário admin, cliente e data/hora.
 */
routerAdd(
  'POST',
  '/backend/v1/queue/destravar-standby',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error:
            'Permissão negada. Apenas o perfil administrador pode destravar clientes em standby.',
        })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = (body.cliente_id || '').trim()
      const motivo = (
        body.motivo || 'Destrave manual de standby autorizado por administrador'
      ).trim()

      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      const estadoAnterior = cliente.getString('estado')
      const standbyAnterior = cliente.getString('standby_ate')
      const reativadoEmAnterior = cliente.getString('reativado_em')

      // Zerar standby e reativação
      cliente.set('standby_ate', null)
      cliente.set('reativado_em', null)

      // Se estava como reativado fora da fila, devolve para na_base para reaparecer no fluxo normal
      if (estadoAnterior === 'reativado') {
        cliente.set('estado', 'na_base')
        cliente.set('operador', '')
        cliente.set('lock_timestamp', null)
      }

      $app.save(cliente)

      // 1. Gravar registro em eventos_log para auditoria
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', authRecord.id)
        ev.set('acao', 'destrave_standby_admin')
        ev.set('detalhes', {
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          regiao: cliente.getString('regiao'),
          vendedor: cliente.getString('vendedor'),
          admin_id: authRecord.id,
          admin_nome: authRecord.getString('name') || authRecord.getString('email'),
          admin_email: authRecord.getString('email'),
          estado_anterior: estadoAnterior,
          estado_novo: cliente.getString('estado'),
          standby_ate_anterior: standbyAnterior,
          reativado_em_anterior: reativadoEmAnterior,
          motivo: motivo,
          timestamp: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (evErr) {
        console.log('[queue_search] Aviso ao registrar auditoria eventos_log: ' + evErr.message)
      }

      // 2. Gravar interação na timeline do cliente para histórico visível na ficha
      try {
        const colIt = $app.findCollectionByNameOrId('interacoes')
        const it = new Record(colIt)
        it.set('cliente', cliente.id)
        it.set('operador', authRecord.id)
        it.set('tipo', 'status')
        it.set('desfecho', 'destravado_admin')
        it.set('motivo', motivo)
        it.set(
          'conteudo',
          `Cliente destravado pelo Administrador ${authRecord.getString('name') || authRecord.getString('email')}. Standby de 60 dias removido. O cliente está liberado para atendimento normal pela carteira/fila.`,
        )
        it.set('estado_anterior', estadoAnterior)
        it.set('estado_novo', cliente.getString('estado'))
        $app.save(it)
      } catch (itErr) {
        console.log('[queue_search] Aviso ao registrar interacao de destrave: ' + itErr.message)
      }

      return e.json(200, {
        ok: true,
        message: `Cliente ${cliente.getString('nome')} (${cliente.getString('codigo')}) destravado com sucesso pelo administrador.`,
        cliente: cliente,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[queue_search] Erro ao destravar standby: ' + msg)
      return e.json(500, { error: 'Falha ao destravar cliente: ' + msg })
    }
  },
  $apis.requireAuth(),
)

/**
 * Endpoint para EDITAR ATENDIMENTO FECHADO (incluso em standby)
 * Exclusivo para role = 'admin' (operador, líder e supervisor recebem 403).
 * NÃO altera NEM zera standby_ate / reativado_em — preserva a blindagem intacta.
 * Atualiza o último registro em respostas_formulario (ou cria caso não exista)
 * e os campos derivados em clientes (desfecho, rascunho_respostas, observacoes).
 * Grava auditoria dupla: eventos_log e interacoes com tipo 'edicao_admin'.
 */
routerAdd(
  'POST',
  '/backend/v1/queue/editar-atendimento-fechado',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error: 'Permissão negada. Apenas administradores podem editar atendimentos fechados.',
        })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = (body.cliente_id || '').trim()
      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }

      const motivoEdicao = (body.motivo_edicao || '').trim()
      if (!motivoEdicao) {
        return e.json(400, { error: 'motivo_edicao é obrigatório' })
      }

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      const desfechoAnterior = cliente.getString('desfecho') || ''
      const desfechoNovo = (body.desfecho || desfechoAnterior || '').trim()
      const observacoes =
        body.observacoes !== undefined
          ? String(body.observacoes || '')
          : cliente.getString('observacoes')
      const respostas = body.respostas && typeof body.respostas === 'object' ? body.respostas : {}

      let valorPotencial = undefined
      if (
        body.valor_potencial !== undefined &&
        body.valor_potencial !== null &&
        body.valor_potencial !== ''
      ) {
        const num = Number(body.valor_potencial)
        if (!isNaN(num)) valorPotencial = num
      }

      let toneladasPotencial = undefined
      if (
        body.toneladas_potencial !== undefined &&
        body.toneladas_potencial !== null &&
        body.toneladas_potencial !== ''
      ) {
        const num = Number(body.toneladas_potencial)
        if (!isNaN(num)) toneladasPotencial = num
      }

      const adminId = authRecord.id
      const adminNome =
        authRecord.getString('name') || authRecord.getString('email') || 'Administrador'

      // Buscar último registro em respostas_formulario deste cliente
      let ultResp = null
      try {
        const respList = $app.findRecordsByFilter(
          'respostas_formulario',
          `cliente = '${cliente.id}'`,
          '-created',
          1,
          0,
        )
        if (respList && respList.length > 0) {
          ultResp = respList[0]
        }
      } catch (rfErr) {
        console.log('[queue_search] Aviso ao buscar respostas_formulario: ' + rfErr.message)
      }

      if (ultResp) {
        if (body.desfecho) ultResp.set('desfecho', desfechoNovo)
        ultResp.set('respostas', respostas)
        if (valorPotencial !== undefined) ultResp.set('valor_potencial', valorPotencial)
        if (toneladasPotencial !== undefined) ultResp.set('toneladas_potencial', toneladasPotencial)
        $app.save(ultResp)
      } else {
        try {
          const colRf = $app.findCollectionByNameOrId('respostas_formulario')
          const novaResp = new Record(colRf)
          novaResp.set('cliente', cliente.id)
          novaResp.set('operador', adminId)
          novaResp.set('desfecho', desfechoNovo)
          novaResp.set('respostas', respostas)
          if (valorPotencial !== undefined) novaResp.set('valor_potencial', valorPotencial)
          if (toneladasPotencial !== undefined)
            novaResp.set('toneladas_potencial', toneladasPotencial)
          $app.save(novaResp)
        } catch (rfCreateErr) {
          console.log('[queue_search] Aviso ao criar respostas_formulario: ' + rfCreateErr.message)
        }
      }

      // Atualiza campos derivados em clientes SEM MEXER em standby_ate, reativado_em, estado ou fluxo da fila
      if (body.desfecho) {
        cliente.set('desfecho', desfechoNovo)
      }
      cliente.set('rascunho_respostas', respostas)
      if (body.observacoes !== undefined) {
        cliente.set('observacoes', observacoes)
      }
      $app.save(cliente)

      const timestamp = new Date().toISOString()

      // 1. Auditoria eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', adminId)
        ev.set('acao', 'edicao_atendimento_fechado_admin')
        ev.set('detalhes', {
          cliente_id: cliente.id,
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          desfecho_anterior: desfechoAnterior,
          desfecho_novo: desfechoNovo,
          admin_id: adminId,
          admin_nome: adminNome,
          motivo_edicao: motivoEdicao,
          timestamp: timestamp,
        })
        $app.save(ev)
      } catch (evErr) {
        console.log('[queue_search] Aviso ao registrar auditoria eventos_log: ' + evErr.message)
      }

      // 2. Auditoria interacoes (tipo 'edicao_admin')
      try {
        const colIt = $app.findCollectionByNameOrId('interacoes')
        const it = new Record(colIt)
        it.set('cliente', cliente.id)
        it.set('operador', adminId)
        it.set('tipo', 'edicao_admin')
        it.set('desfecho', desfechoNovo)
        it.set('motivo', motivoEdicao)
        it.set(
          'conteudo',
          `Atendimento editado pelo Administrador ${adminNome}. Desfecho: ${desfechoAnterior || 'nenhum'} → ${desfechoNovo}. Motivo: ${motivoEdicao}.`,
        )
        if (body.observacoes !== undefined) {
          it.set('observacoes', observacoes)
        }
        $app.save(it)
      } catch (itErr) {
        console.log('[queue_search] Aviso ao registrar interacao de edicao: ' + itErr.message)
      }

      return e.json(200, {
        ok: true,
        message: 'Atendimento fechado editado com sucesso pelo administrador.',
        cliente: cliente,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[queue_search] Erro ao editar atendimento fechado: ' + msg)
      return e.json(500, { error: 'Falha ao editar atendimento: ' + msg })
    }
  },
  $apis.requireAuth(),
)
