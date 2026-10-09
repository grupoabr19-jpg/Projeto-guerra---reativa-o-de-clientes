// pocketbase/hooks/queue_search.js
// Busca na carteira, abertura de cliente específico e destrave/edição administrativa
// Handlers executados em escopo isolado no Goja runtime do PocketBase

/**
 * 1. POST /backend/v1/queue/search-carteira
 * Busca clientes restrita à carteira do operador, região ou Repescagem
 */
routerAdd(
  'POST',
  '/backend/v1/queue/search-carteira',
  (e) => {
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

      const termoBusca = (body.termo || '').trim()
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
      const isLider = userRole === 'lider'

      // Expurgo atômico imediato de locks antes de operações
      expurgarLocksExpiradosAtomicamente($app)

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
      const userNameNorm = normalizarTextoNFD(userName)

      // Mapa de DDDs do ATACADO por operador:
      let atacadoDddsPermitidos = []
      if (isAtacado) {
        if (userNameNorm.includes('LARISSA')) {
          atacadoDddsPermitidos = ['11', '12', '13']
        } else if (userNameNorm.includes('JULIO')) {
          atacadoDddsPermitidos = ['15', '19']
        } else if (userNameNorm.includes('WILSON')) {
          atacadoDddsPermitidos = ['14', '16', '17', '18']
        } else {
          atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
        }
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

      // Sanitiza termo de busca para SQLite filter
      const cleanTerm = termoBusca.replace(/['"\\]/g, '')

      let filterExpr = `(nome ~ '${cleanTerm}' || codigo ~ '${cleanTerm}') && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'`
      if (userRole !== 'admin') {
        const nowIso = new Date().toISOString()
        // Clientes com pedido_em_aberto=true podem ser buscados (serão filtrados para o dono/admin abaixo)
        filterExpr += ` && (pedido_em_aberto = true || estado != 'reativado' || standby_ate = '' || standby_ate = null || standby_ate <= '${nowIso}')`
      }

      // Restrições de perfil/região
      if (isRepescagem) {
        filterExpr += " && (faixa = '90_plus' || dias_sem_faturar >= 90)"
      } else if (userRole === 'operador' || userRole === 'lider') {
        if (userRegioes.length > 0) {
          const parts = userRegioes.map((r) => buildRegiaoSqlFilter(r))
          filterExpr += ` && (${parts.join(' || ')})`
        }
      } else if (userRegioes.length > 0) {
        const parts = userRegioes.map((r) => buildRegiaoSqlFilter(r))
        filterExpr += ` && (${parts.join(' || ')})`
      }

      // Buscar registros no PocketBase
      let pool = []
      try {
        pool = $app.findRecordsByFilter('clientes', filterExpr, '-score', 120, 0)
      } catch (err) {
        console.log('[queue_search] Erro ao buscar: ' + err.message)
      }

      // Filtrar estritamente pela carteira no servidor
      let resultados = []
      if (pool && pool.length > 0) {
        if (isRepescagem) {
          resultados = pool.filter((c) => !jaContatadoPeloVendedorOriginal(c))
        } else if (isAtacado && (userRole === 'operador' || userRole === 'lider')) {
          resultados = pool.filter((c) => {
            const ddd = extrairDddCliente(c)
            return atacadoDddsPermitidos.includes(ddd)
          })
        } else if (userRole === 'operador' || userRole === 'lider') {
          // VAREJO: carteira do vendedor tolerante OU líder suporte sem dono
          resultados = pool.filter((c) => {
            const matchProprio = matchesCarteiraVendedorTolerante(c, userName)
            if (matchProprio) return true
            if (isLider && c.getBool('sem_dono_equipe') === true) return true
            return false
          })
        } else {
          resultados = pool
        }
      }

      // Filtrar resultados adicionais para garantir que se standby_ate estiver no futuro e não for admin, NUNCA apareça
      // EXCETO se pedido_em_aberto=true E o usuário for o operador responsável (dono do pedido)
      let resultadosFiltrados = resultados
      if (userRole !== 'admin') {
        const nowTime = new Date().getTime()
        resultadosFiltrados = resultados.filter((c) => {
          const temPedidoAberto = c.getBool('pedido_em_aberto')
          if (temPedidoAberto) {
            // Se tem pedido em aberto: VISÍVEL apenas para o dono (operador_reativacao ou operador)
            const opReat = c.getString('operador_reativacao')
            const opAtual = c.getString('operador')
            const ehDono =
              opReat === userId ||
              opAtual === userId ||
              matchesCarteiraVendedorTolerante(c, userName)
            return ehDono
          }

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

      // Formatar saída enxuta
      const itemsFormatados = sliced.map((c) => {
        let ultimoContatoStr = '—'
        const ultFat = c.getString('ultimo_faturamento_data')
        const ultComp = c.getString('ultima_compra')
        const formatarDataIsoBrl = (isoStr) => {
          if (!isoStr) return '—'
          try {
            const d = new Date(isoStr)
            if (isNaN(d.getTime())) return isoStr
            return d.toISOString().slice(0, 10).split('-').reverse().join('/')
          } catch (_) {
            return isoStr
          }
        }
        if (ultFat) {
          ultimoContatoStr = formatarDataIsoBrl(ultFat)
        } else if (ultComp) {
          ultimoContatoStr = formatarDataIsoBrl(ultComp)
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

        const temPedidoEmAberto = c.getBool('pedido_em_aberto')
        const statusFaturamento = c.getString('status_faturamento')
        const operadorReativacao = c.getString('operador_reativacao')

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
          operador_reativacao: operadorReativacao,
          lock_timestamp: c.getString('lock_timestamp'),
          ultimo_faturamento_data: ultFat || ultComp || '',
          ultimo_contato: ultimoContatoStr,
          telefone: c.getString('telefone'),
          whatsapp: c.getString('whatsapp'),
          standby_ate: stStr,
          reativado_em: c.getString('reativado_em'),
          em_standby: emStandby,
          pedido_em_aberto: temPedidoEmAberto,
          status_faturamento: statusFaturamento,
          pedido_reativacao: c.getString('pedido_reativacao'),
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

/**
 * 2. POST /backend/v1/queue/reserve-specific
 * Reserva um cliente específico buscado na carteira
 */
routerAdd(
  'POST',
  '/backend/v1/queue/reserve-specific',
  (e) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
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

      const userId = authRecord.id
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')
      const isLider = userRole === 'lider'

      // Expurgo atômico imediato de locks
      expurgarLocksExpiradosAtomicamente($app)

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

      // Blindagem de Standby estrita: 60 dias
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

      const temPedidoAberto = cliente.getBool('pedido_em_aberto')
      const opReativacao = cliente.getString('operador_reativacao')
      const ehDonoDoPedido = opReativacao === userId || cliente.getString('operador') === userId

      if ((estadoCli === 'reativado' || emStandby) && emStandby && userRole !== 'admin') {
        // Se tem pedido em aberto e o usuário é o dono, PERMITE abrir para complementar faturamento!
        if (temPedidoAberto && ehDonoDoPedido) {
          // Permissão concedida para o dono complementar faturamento
        } else {
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
      }

      // Checa lock de 30 min de outro operador
      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      const currentOp = cliente.getString('operador')
      const estadoAtual = cliente.getString('estado')
      const lockTimestamp = cliente.getString('lock_timestamp')

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
      const userNameNorm = normalizarTextoNFD(userName)

      // Validar se cliente pertence à carteira
      if (userRole === 'operador' || userRole === 'lider') {
        if (isAtacado) {
          let atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
          if (userNameNorm.includes('LARISSA')) atacadoDddsPermitidos = ['11', '12', '13']
          else if (userNameNorm.includes('JULIO')) atacadoDddsPermitidos = ['15', '19']
          else if (userNameNorm.includes('WILSON')) atacadoDddsPermitidos = ['14', '16', '17', '18']

          const ddd = extrairDddCliente(cliente)
          if (!atacadoDddsPermitidos.includes(ddd)) {
            return e.json(403, {
              error: `Este cliente pertence a outro DDD do Atacado e não está na sua carteira (${atacadoDddsPermitidos.join(', ')}).`,
            })
          }
        } else if (!isRepescagem) {
          // Varejo: valida vendedor com matching tolerante
          const matchVendedor = matchesCarteiraVendedorTolerante(cliente, userName)
          const matchLiderSuporte = isLider && cliente.getBool('sem_dono_equipe') === true

          if (!matchVendedor && !matchLiderSuporte) {
            return e.json(403, {
              error:
                'Este cliente pertence à carteira de outro vendedor e não está sob sua responsabilidade.',
            })
          }
        }
      }

      // Se o operador já tiver OUTRO cliente em lock, libera o anterior de volta para 'na_base'
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
 * 3. POST /backend/v1/queue/destravar-standby
 * Endpoint para DESTRAVAR / remover standby de cliente
 * Exclusivo para role = 'admin'.
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

      // 2. Gravar interação na timeline do cliente
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
 * 4. POST /backend/v1/queue/editar-atendimento-fechado
 * Endpoint para EDITAR ATENDIMENTO FECHADO (incluso em standby)
 * Exclusivo para role = 'admin'.
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
      let toneladasPotencial = undefined

      const q3Val =
        respostas.q3 !== undefined && respostas.q3 !== null ? String(respostas.q3).trim() : ''
      const fezOrcamento = q3Val.toLowerCase() === 'sim'
      const naoFezOrcamento = q3Val.toLowerCase() === 'não' || q3Val.toLowerCase() === 'nao'

      if (naoFezOrcamento) {
        // Quando Q3 = "Não", garante que campos de valor e peso fiquem limpos
        delete respostas.q15
        delete respostas.q16
        valorPotencial = null
        toneladasPotencial = null
      } else if (
        body.valor_potencial !== undefined &&
        body.valor_potencial !== null &&
        body.valor_potencial !== ''
      ) {
        const num = Number(body.valor_potencial)
        if (!isNaN(num)) valorPotencial = num
      }

      if (
        !naoFezOrcamento &&
        body.toneladas_potencial !== undefined &&
        body.toneladas_potencial !== null &&
        body.toneladas_potencial !== ''
      ) {
        const valRef = valorPotencial !== undefined && valorPotencial !== null ? valorPotencial : 0
        const rawPesoInput = body.toneladas_potencial
        const rawValorInput = body.valor_potencial !== undefined ? body.valor_potencial : valRef

        const normRes =
          typeof normalizarPesoEUnidade === 'function'
            ? normalizarPesoEUnidade(valRef, rawPesoInput, rawValorInput, rawPesoInput)
            : null

        if (normRes) {
          respostas.q16 = normRes.peso_bruto // mantém raw em q16
          respostas.q16_unidade_detectada = normRes.unidade_detectada
          respostas.q16_toneladas_normalizadas = normRes.toneladas
          toneladasPotencial = normRes.toneladas
        } else {
          const num = Number(rawPesoInput)
          if (!isNaN(num)) {
            toneladasPotencial = num
            let unidadeDetectada = 'ton'
            let tonNormalizada = num
            if (valRef > 0 && num > 0) {
              const ratio = valRef / num
              if (ratio >= 2 && ratio <= 60) {
                unidadeDetectada = 'kg'
                tonNormalizada = Number((num / 1000).toFixed(6))
              } else if (ratio < 2 && num >= 50) {
                unidadeDetectada = 'kg'
                tonNormalizada = Number((num / 1000).toFixed(6))
              } else if (num >= 50) {
                unidadeDetectada = 'kg'
                tonNormalizada = Number((num / 1000).toFixed(6))
              }
            } else if (num >= 50) {
              unidadeDetectada = 'kg'
              tonNormalizada = Number((num / 1000).toFixed(6))
            }
            respostas.q16 = num
            respostas.q16_unidade_detectada = unidadeDetectada
            respostas.q16_toneladas_normalizadas = tonNormalizada
            toneladasPotencial = tonNormalizada
          }
        }
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

      // 2. Auditoria interacoes
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

/**
 * 5. POST /backend/v1/queue/concluir-faturamento
 * Conclui faturamento de pedido em aberto.
 * Valida permissão: dono do pedido (operador_reativacao ou operador) OU admin/supervisor.
 * Recebe: cliente_id, data_faturamento, numero_nf_fatura, valor_faturado, observacoes
 */
routerAdd(
  'POST',
  '/backend/v1/queue/concluir-faturamento',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userId = authRecord.id
      const userName = authRecord.getString('name') || authRecord.getString('email') || 'Usuário'
      const userRole = authRecord.getString('role')

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = (body.cliente_id || '').trim()
      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }

      const rawDataFat = (body.data_faturamento || '').trim()
      if (!rawDataFat) {
        return e.json(400, { error: 'data_faturamento é obrigatória' })
      }

      const dataFatDate = new Date(rawDataFat)
      if (isNaN(dataFatDate.getTime())) {
        return e.json(400, { error: 'data_faturamento inválida. Utilize formato ISO/data válida.' })
      }

      const valorFaturadoNum = Number(body.valor_faturado)
      if (isNaN(valorFaturadoNum) || valorFaturadoNum <= 0) {
        return e.json(400, { error: 'valor_faturado é obrigatório e deve ser maior que zero (R$)' })
      }

      const numeroNfFatura = String(body.numero_nf_fatura || '').trim()
      const observacoes = String(body.observacoes || '').trim()

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      // Validação de permissão: dono da reativação, operador atual ou admin/supervisor
      const opReativacao = cliente.getString('operador_reativacao')
      const opAtual = cliente.getString('operador')
      const ehDono = opReativacao === userId || opAtual === userId
      const ehPrivilegiado = userRole === 'admin' || userRole === 'supervisor'

      if (!ehDono && !ehPrivilegiado) {
        return e.json(403, {
          error:
            'Permissão negada. Apenas o operador responsável pelo pedido ou administrador podem concluir o faturamento.',
        })
      }

      const valorAnterior = cliente.getFloat('valor_faturado') || 0
      const statusAnterior = cliente.getString('status_faturamento') || 'pendente'

      // Atualiza cliente
      cliente.set('pedido_em_aberto', false)
      cliente.set('status_faturamento', 'faturado')
      cliente.set('data_faturamento', dataFatDate.toISOString())
      cliente.set('valor_faturado', valorFaturadoNum)
      if (numeroNfFatura) {
        cliente.set('numero_nf_fatura', numeroNfFatura)
      }
      // Atualiza dados de faturamento geral do cliente também
      cliente.set('ultimo_faturamento_data', dataFatDate.toISOString())
      cliente.set('ultima_compra', dataFatDate.toISOString())
      cliente.set('valor_ultima_compra', valorFaturadoNum)
      cliente.set('dias_sem_faturar', 0)
      cliente.set('faixa', 'recente')
      $app.save(cliente)

      const agoraIso = new Date().toISOString()

      // Registrar auditoria em interacoes
      try {
        const colIt = $app.findCollectionByNameOrId('interacoes')
        const it = new Record(colIt)
        it.set('cliente', cliente.id)
        it.set('operador', userId)
        it.set('tipo', 'status')
        it.set('desfecho', 'faturamento_concluido')
        it.set('motivo', 'Conclusão e complementação de faturamento de pedido em aberto')
        const formatarMoedaLocal = (num) => {
          const val = Number(num) || 0
          const fixed = val.toFixed(2)
          const parts = fixed.split('.')
          const inteira = parts[0]
          const decimal = parts[1] || '00'
          let formatada = ''
          const len = inteira.length
          for (let i = 0; i < len; i++) {
            if (i > 0 && (len - i) % 3 === 0) {
              formatada += '.'
            }
            formatada += inteira.charAt(i)
          }
          return formatada + ',' + decimal
        }
        const dataFatStr = dataFatDate.toISOString().slice(0, 10).split('-').reverse().join('/')
        it.set(
          'conteudo',
          `Faturamento concluído por ${userName}.\nData Faturamento: ${dataFatStr}\nValor Faturado: R$ ${formatarMoedaLocal(valorFaturadoNum)}${numeroNfFatura ? `\nNF/Fatura: ${numeroNfFatura}` : ''}${observacoes ? `\nObservações: ${observacoes}` : ''}`,
        )
        it.set('estado_anterior', cliente.getString('estado'))
        it.set('estado_novo', cliente.getString('estado'))
        if (numeroNfFatura) {
          it.set('numero_pedido', numeroNfFatura)
        }
        $app.save(it)
      } catch (itErr) {
        console.log('[concluir_faturamento] Aviso ao criar interacao: ' + itErr.message)
      }

      // Registrar em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', userId)
        ev.set('acao', 'faturamento_concluido')
        ev.set('detalhes', {
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          status_anterior: statusAnterior,
          status_novo: 'faturado',
          data_faturamento: dataFatDate.toISOString(),
          valor_faturado: valorFaturadoNum,
          numero_nf_fatura: numeroNfFatura,
          observacoes: observacoes,
          operador_id: userId,
          operador_nome: userName,
          executado_em: agoraIso,
        })
        $app.save(ev)
      } catch (evErr) {
        console.log('[concluir_faturamento] Aviso ao criar eventos_log: ' + evErr.message)
      }

      return e.json(200, {
        ok: true,
        message: `Faturamento do cliente ${cliente.getString('nome')} (${cliente.getString('codigo')}) concluído com sucesso!`,
        cliente: cliente,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[concluir_faturamento] Erro: ' + msg)
      return e.json(500, { error: 'Falha ao concluir faturamento: ' + msg })
    }
  },
  $apis.requireAuth(),
)
