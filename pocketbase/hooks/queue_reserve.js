// pocketbase/hooks/queue_reserve.js
// NOVO MOTOR DE FILA / ROTEAMENTO EM DOIS FILTROS EM CASCATA
// Regra do Usuário:
// 1) FILTRO PRIMÁRIO — CARTEIRA NOMINAL:
//    Cada cliente é servido SOMENTE para o operador que consta como vendedor no cadastro dele
//    (campo `vendedor`, ex.: "VCORP - KAYLANE SILVA", "ESPECIALISTE - NOME", "EXT - NOME").
//    Usa casamento tolerante de nomes (apelidos, primeira parte do nome, acentos).
//    Cliente no nome da Camila só cai para Camila; da Rafaela só para Rafaela.
//
// 2) VENDEDOR AFASTADO/INATIVO:
//    Se o vendedor do cadastro estiver inativo, desativado (ativo=false) ou sem conta no sistema,
//    o cliente FICA PARADO — não cai para outro operador, não vai para fila de ninguém, apenas aguarda
//    (até transferência de carteira ou reativação da conta).
//
// 3) FILTRO SECUNDÁRIO — POR CIDADE:
//    Apenas clientes cujo vendedor do cadastro NÃO corresponde a nenhum colaborador cadastrado
//    nas filas de atendimento (ex.: vendedores externos, parceiros, lojas, sem vendedor).
//    Esses clientes são roteados pela CIDADE do cadastro do cliente (extraída de endereco/cidade),
//    consultando a tabela `cidades_rotas` semeada com as cidades oficiais e divisas das rotas.
//    Se a cidade mapeia para a rota do operador, ele pode atender via fila secundária por cidade!
//
// Preservados intactos:
// - Prioridade 60–89 dias primeiro, 90+ depois
// - Locks de 30 minutos e expurgo automático
// - Rota especial Repescagem (90+ dias, todas as regiões, exceto já contatados pelo vendedor original)
// - ATACADO por DDD separado: Larissa Terra (11,12,13), Julio Melo (15,19), Wilson Neto (14,16,17,18)
// - Base Cliente Final e Atacado Fora do Mapa segregados fora da fila
// - Logs claros e estruturados do motivo e filtro de cada atendimento

routerAdd(
  'POST',
  '/backend/v1/queue/reserve-next',
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
        'ESPECIALISTE - ',
        'ESPECIALISTA - ',
        'EXT - ',
        'INT - ',
        'REP - ',
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
      if (norm.includes('JOSIANE') || norm.includes('FRAZAO')) {
        variantes.add('JOSIANE')
        variantes.add('JOSIANE FRAZAO')
        variantes.add('FRAZAO')
      }
      if (norm.includes('CAMILA') || norm.includes('GUIMENTI')) {
        variantes.add('CAMILA')
        variantes.add('CAMILA GUIMENTI')
        variantes.add('GUIMENTI')
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

    function extrairCidadeCliente(clienteRec) {
      // 1. Campo explícito se existir
      const cidDireta = clienteRec.getString('cidade')
      if (cidDireta && cidDireta.trim()) {
        return normalizarTextoNFD(cidDireta)
      }

      // 2. Campo endereco: normalmente "Cidade - UF" ou "Rua..., Bairro, Cidade - UF"
      const endRaw = clienteRec.getString('endereco') || ''
      if (endRaw) {
        // Se contiver hífen: ex "BRAGANCA PAULISTA - SP" ou "... - CIDADE - UF"
        const partesHifen = endRaw.split('-')
        if (partesHifen.length >= 2) {
          const antesUf = partesHifen[partesHifen.length - 2].trim()
          // Se tiver vírgula antes da cidade, pega após a última vírgula
          const partesVirgula = antesUf.split(',')
          const possivelCidade = partesVirgula[partesVirgula.length - 1].trim()
          if (possivelCidade) {
            return normalizarTextoNFD(possivelCidade)
          }
        }
        // Se não tiver hífen, tenta split por vírgula
        const partesVirgula = endRaw.split(',')
        if (partesVirgula.length > 1) {
          return normalizarTextoNFD(partesVirgula[partesVirgula.length - 1])
        }
        return normalizarTextoNFD(endRaw)
      }
      return ''
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
      const devolverEProximo = Boolean(body.devolver_e_proximo)
      const clienteDevolvidoId = body.cliente_atual_id ? String(body.cliente_atual_id).trim() : ''

      const userId = authRecord.id
      const userName = (authRecord.getString('name') || '').trim()
      const userRole = authRecord.getString('role')
      const isLider = userRole === 'lider'

      // EXPURGO ATÔMICO IMEDIATO: liberação de qualquer lock expirado (> 30 min)
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

      const now = new Date()
      const cutoffTime = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

      const isRepescagem = userRegioes.some((r) => r.toUpperCase() === 'REPESCAGEM')
      const isAtacado = userRegioes.some((r) => r.toUpperCase() === 'ATACADO')

      // Mapa de DDDs do ATACADO por operador
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
          atacadoDddsPermitidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
        }
      }

      // FLUXO ATÔMICO DEVOLVER_E_PROXIMO:
      let idsExcluidosNestaChamada = []
      if (clienteDevolvidoId) {
        idsExcluidosNestaChamada.push(clienteDevolvidoId)
      }

      if (devolverEProximo) {
        try {
          const lockedToRelease = $app.findRecordsByFilter(
            'clientes',
            `operador = '${userId}' && (estado = 'reservado' || estado = 'em_atendimento')`,
            '-lock_timestamp',
            10,
            0,
          )
          for (let rIdx = 0; rIdx < lockedToRelease.length; rIdx++) {
            const toRel = lockedToRelease[rIdx]
            idsExcluidosNestaChamada.push(toRel.id)

            const stStr = toRel.getString('standby_ate')
            let isSt = false
            if (stStr) {
              const pSt = new Date(stStr)
              if (!isNaN(pSt.getTime()) && pSt.getTime() > now.getTime()) {
                isSt = true
              }
            }

            if (!isSt) {
              const nowMsRel = now.getTime()
              const brtMsRel = nowMsRel - 3 * 60 * 60 * 1000
              const brtDateRel = new Date(brtMsRel)
              const dowRel = brtDateRel.getUTCDay()
              let dAddRel = 1
              if (dowRel === 5) dAddRel = 3
              else if (dowRel === 6) dAddRel = 2

              const proxBrtRel = new Date(brtMsRel + dAddRel * 24 * 60 * 60 * 1000)
              const targetIsoRel = new Date(
                Date.UTC(
                  proxBrtRel.getUTCFullYear(),
                  proxBrtRel.getUTCMonth(),
                  proxBrtRel.getUTCDate(),
                  10,
                  0,
                  0,
                  0,
                ),
              ).toISOString()

              toRel.set('reagendado_para', targetIsoRel)
              toRel.set('retomada_servida_em', now.toISOString())
              toRel.set('reagendado_operador', userId)
              toRel.set('estado', 'reagendado')
            } else {
              toRel.set('estado', 'reativado')
            }

            if (body.rascunho_respostas) {
              toRel.set('rascunho_respostas', body.rascunho_respostas)
            }
            toRel.set('operador', '')
            toRel.set('lock_timestamp', null)
            $app.save(toRel)

            try {
              const colEv = $app.findCollectionByNameOrId('eventos_log')
              const ev = new Record(colEv)
              ev.set('cliente', toRel.id)
              ev.set('usuario', userId)
              ev.set('acao', 'lock_liberado_devolver_e_proximo')
              ev.set('detalhes', { motivo: 'devolver_e_proximo_automatico' })
              $app.save(ev)
            } catch (_) {}
          }
        } catch (devErr) {
          console.log('[queue_reserve] Erro ao devolver_e_proximo: ' + devErr.message)
        }
      }

      // 1. Verifica se o operador já possui contato em andamento
      try {
        const currentLocked = $app.findRecordsByFilter(
          'clientes',
          `operador = '${userId}' && (estado = 'reservado' || estado = 'em_atendimento') && lock_timestamp >= '${cutoffTime}'`,
          '-lock_timestamp',
          10,
          0,
        )

        if (currentLocked && currentLocked.length > 0) {
          for (let lcIdx = 0; lcIdx < currentLocked.length; lcIdx++) {
            const candLock = currentLocked[lcIdx]
            const candReagPara = candLock.getString('reagendado_para')
            const candEstado = candLock.getString('estado')
            const candPedidoEmAberto = candLock.getBool('pedido_em_aberto')

            if (candPedidoEmAberto) {
              return e.json(200, {
                cliente: candLock,
                ja_reservado: true,
                carteira_esgotada: false,
                message: 'Você possui um cliente com pedido em aberto aguardando faturamento.',
              })
            }

            let temDesfechoGravado = false
            let ultimoDesfecho = ''

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
                ultimoDesfecho = ultimasInteracoes[0].getString('desfecho')
              }
            } catch (_) {}

            if (!temDesfechoGravado) {
              try {
                const ultimasRespostas = $app.findRecordsByFilter(
                  'respostas_formulario',
                  `cliente = '${candLock.id}' && desfecho != ''`,
                  '-created',
                  1,
                  0,
                )
                if (ultimasRespostas && ultimasRespostas.length > 0) {
                  temDesfechoGravado = true
                  ultimoDesfecho = ultimasRespostas[0].getString('desfecho')
                }
              } catch (_) {}
            }

            const estadosConcluidos = [
              'reativado',
              'reagendado',
              'sem_contato',
              'venda_perdida',
              'nao_quer_negociar',
              'restricao_financeira',
              'compra_terceiros',
              'sem_perfil',
              'duplicado',
              'ativo_fora_base',
            ]
            const clienteEmEstadoConcluido = estadosConcluidos.includes(candEstado)
            const temReagendamentoFuturoOuGravado = Boolean(
              candReagPara && candReagPara.trim() !== '',
            )

            if (temDesfechoGravado || temReagendamentoFuturoOuGravado || clienteEmEstadoConcluido) {
              const candReagOperador = candLock.getString('reagendado_operador')
              const candRetomadaServidaEm = candLock.getString('retomada_servida_em') || ''
              const agoraIso = new Date().toISOString()
              const isReagendamentoVencidoProprio = Boolean(
                candReagPara &&
                candReagPara.trim() !== '' &&
                candReagPara <= agoraIso &&
                candReagOperador === userId &&
                (!candRetomadaServidaEm || candRetomadaServidaEm < candReagPara),
              )

              if (isReagendamentoVencidoProprio) {
                try {
                  candLock.set('estado', 'reservado')
                  candLock.set('operador', userId)
                  candLock.set('lock_timestamp', agoraIso)
                  candLock.set('retomada_servida_em', agoraIso)
                  $app.save(candLock)
                  return e.json(200, {
                    cliente: candLock,
                    ja_reservado: false,
                    carteira_esgotada: false,
                    filtro_origem: 'reagendamento_proprio',
                    message: 'Reagendamento do seu próprio contato retomado com sucesso.',
                  })
                } catch (_) {}
              }

              const desfechoEfetivo =
                ultimoDesfecho ||
                (temReagendamentoFuturoOuGravado
                  ? 'reagendado'
                  : clienteEmEstadoConcluido
                    ? candEstado
                    : 'na_base')

              try {
                $app
                  .db()
                  .newQuery(
                    `UPDATE clientes
                     SET operador = '',
                         lock_timestamp = '1970-01-01 00:00:00.000Z',
                         estado = CASE
                           WHEN reagendado_para IS NOT NULL AND reagendado_para != '' THEN 'reagendado'
                           WHEN {:desfecho} != '' AND {:desfecho} != 'reservado' AND {:desfecho} != 'em_atendimento' THEN {:desfecho}
                           WHEN estado = 'em_atendimento' OR estado = 'reservado' THEN 'na_base'
                           ELSE estado
                         END
                     WHERE id = {:id}`,
                  )
                  .bind({ id: candLock.id, desfecho: desfechoEfetivo })
                  .execute()
              } catch (_) {}
              continue
            }

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

      // Fuso de Brasília
      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
      const yBrt = dBrasilia.getUTCFullYear()
      const mBrt = dBrasilia.getUTCMonth()
      const dayBrt = dBrasilia.getUTCDate()
      const endOfTodayBrtUtcMs = Date.UTC(yBrt, mBrt, dayBrt + 1, 2, 59, 59, 999)
      const endOfToday = new Date(endOfTodayBrtUtcMs).toISOString()

      // =========================================================================
      // CARREGAMENTO DO ECOSSISTEMA DE VENDEDORES (FILTROS 1, 2 e 3)
      // =========================================================================
      // Carrega colaboradores cadastrados no users
      let todosUsuarios = []
      try {
        todosUsuarios = $app.findRecordsByFilter('users', "role != 'cliente'", 'name', 500, 0)
      } catch (uErr) {
        console.log('[queue_reserve] Erro ao carregar users: ' + uErr.message)
      }

      const listaAtivos = []
      const listaInativos = []

      for (let uIdx = 0; uIdx < todosUsuarios.length; uIdx++) {
        const u = todosUsuarios[uIdx]
        const uNome = (u.getString('name') || '').trim()
        const uAtivo = u.getBool('ativo') !== false // padrão ativo se não for explicitamente falso
        const uVars = obterVariantesVendedor(uNome)

        const uObj = {
          id: u.id,
          nome: uNome,
          ativo: uAtivo,
          variantes: uVars,
        }

        if (uAtivo) {
          listaAtivos.push(uObj)
        } else {
          listaInativos.push(uObj)
        }
      }

      // Função: verifica se o vendedor do cadastro casa com algum colaborador cadastrado
      // Retorna: { temCadastro: boolean, ativo: boolean, usuario?: object }
      const checarStatusVendedorCadastro = (vendedorStr) => {
        if (!vendedorStr || !vendedorStr.trim()) {
          return { temCadastro: false, ativo: false }
        }
        const vLimpo = limparPrefixoVendedor(vendedorStr)
        const vNorm = normalizarTextoNFD(vLimpo)
        if (!vNorm || vNorm.length < 3) {
          return { temCadastro: false, ativo: false }
        }

        // 1. Checa nos ativos
        for (let aIdx = 0; aIdx < listaAtivos.length; aIdx++) {
          const atUser = listaAtivos[aIdx]
          const atNorm = normalizarTextoNFD(atUser.nome)
          if (vNorm === atNorm || vNorm.includes(atNorm) || atNorm.includes(vNorm)) {
            return { temCadastro: true, ativo: true, usuario: atUser }
          }
          for (let vI = 0; vI < atUser.variantes.length; vI++) {
            const vItem = atUser.variantes[vI]
            if (vItem.length >= 3 && (vNorm.includes(vItem) || vItem.includes(vNorm))) {
              return { temCadastro: true, ativo: true, usuario: atUser }
            }
          }
        }

        // 2. Checa nos inativos / afastados (ex.: Kaylane)
        for (let inIdx = 0; inIdx < listaInativos.length; inIdx++) {
          const inUser = listaInativos[inIdx]
          const inNorm = normalizarTextoNFD(inUser.nome)
          if (vNorm === inNorm || vNorm.includes(inNorm) || inNorm.includes(vNorm)) {
            return { temCadastro: true, ativo: false, usuario: inUser }
          }
          for (let vI = 0; vI < inUser.variantes.length; vI++) {
            const vItem = inUser.variantes[vI]
            if (vItem.length >= 3 && (vNorm.includes(vItem) || vItem.includes(vNorm))) {
              return { temCadastro: true, ativo: false, usuario: inUser }
            }
          }
        }

        // 3. Checagem especial de segurança para nomes conhecidos afastados
        if (vNorm.includes('KAYLANE')) {
          return { temCadastro: true, ativo: false, nome: 'KAYLANE SILVA' }
        }

        return { temCadastro: false, ativo: false }
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

      const isCandidatoRepetidoRecente = (c) => {
        if (!c) return true
        if (idsExcluidosNestaChamada.includes(c.id)) return true

        const cEstado = c.getString('estado')
        const cAtivoFora = c.getBool('ativo_fora_base')
        const cBaseCat = c.getString('base_categoria')
        if (
          cAtivoFora ||
          cBaseCat === 'cliente_final' ||
          cBaseCat === 'atacado_fora_mapa' ||
          cEstado === 'ativo_fora_base' ||
          cEstado === 'sem_contato' ||
          cEstado === 'venda_perdida' ||
          cEstado === 'compra_terceiros' ||
          cEstado === 'nao_quer_negociar' ||
          cEstado === 'restricao_financeira' ||
          cEstado === 'duplicado'
        ) {
          return true
        }

        const retomadaServida = c.getString('retomada_servida_em')
        const reagOp = c.getString('reagendado_operador')
        if (reagOp === userId && retomadaServida) {
          const retDate = new Date(retomadaServida)
          if (!isNaN(retDate.getTime())) {
            const diffH = (now.getTime() - retDate.getTime()) / (1000 * 60 * 60)
            if (diffH >= 0 && diffH < 12) {
              return true
            }
          }
        }

        try {
          const ultimasInt = $app.findRecordsByFilter(
            'interacoes',
            `cliente = '${c.id}' && operador = '${userId}' && desfecho != '' && desfecho != 'transferido'`,
            '-created',
            1,
            0,
          )
          if (ultimasInt && ultimasInt.length > 0) {
            const intData = ultimasInt[0].getString('created')
            if (intData) {
              const pData = new Date(intData)
              if (!isNaN(pData.getTime())) {
                const diffHInt = (now.getTime() - pData.getTime()) / (1000 * 60 * 60)
                if (diffHInt >= 0 && diffHInt < 12) {
                  return true
                }
              }
            }
          }
        } catch (_) {}

        return false
      }

      let cand = null
      let filtroOrigemAtendido = '' // 'reagendado' | 'primario_nominal' | 'secundario_cidade' | 'atacado_ddd' | 'repescagem'

      // =========================================================================
      // ETAPA A: REAGENDADOS VENCIDOS (Follow-ups do próprio operador)
      // =========================================================================
      let reagFilter = `estado = 'reagendado' && reagendado_para != '' && reagendado_para <= '${endOfToday}' && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'`
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
          const myReags = reagendados.filter((r) => {
            if (r.getString('reagendado_operador') !== userId) return false
            if (r.getBool('prioridade_transferencia') === true) return true
            return !isCandidatoRepetidoRecente(r)
          })
          if (myReags.length > 0) {
            const transferido = myReags.find((r) => r.getBool('prioridade_transferencia') === true)
            cand = transferido || myReags[0]
            filtroOrigemAtendido = 'reagendado'
          }
        }
      } catch (reagErr) {
        console.log('[queue_reserve] Aviso ao buscar reagendados: ' + reagErr.message)
      }

      // =========================================================================
      // ETAPA B: ATACADO E REPESCAGEM (Regras Específicas Mantidas)
      // =========================================================================
      if (!cand && isAtacado && (userRole === 'operador' || userRole === 'lider')) {
        let sortExpr = '-score'
        if (ordenacaoEscolhida === 'antigos') sortExpr = '-dias_sem_faturar'
        else if (ordenacaoEscolhida === 'novos') sortExpr = 'dias_sem_faturar'

        const nowIsoQueue = now.toISOString()
        let atacadoFilter = `estado = 'na_base' && regiao = 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
        if (filtroSegmento && filtroSegmento !== 'todos') {
          atacadoFilter += ` && segmento = '${filtroSegmento}'`
        }

        try {
          const poolAtacado = $app.findRecordsByFilter('clientes', atacadoFilter, sortExpr, 500, 0)
          const poolNaoRepetido = poolAtacado.filter((c) => !isCandidatoRepetidoRecente(c))
          const poolOperador = poolNaoRepetido.filter((c) => {
            const ddd = extrairDddCliente(c)
            return atacadoDddsPermitidos.includes(ddd)
          })

          if (poolOperador.length > 0) {
            if (ordenacaoEscolhida === 'antigos' || ordenacaoEscolhida === 'novos') {
              cand = poolOperador[0]
            } else {
              const faixa60 = poolOperador.filter((c) => {
                const f = c.getString('faixa')
                const d = c.getInt('dias_sem_faturar')
                return f === '60_89' || (d >= 60 && d <= 89)
              })
              cand = faixa60.length > 0 ? faixa60[0] : poolOperador[0]
            }
            filtroOrigemAtendido = 'atacado_ddd'
          }
        } catch (atacadoErr) {
          console.log('[queue_reserve] Erro na fila do Atacado: ' + atacadoErr.message)
        }
      }

      if (!cand && isRepescagem) {
        const nowIsoQueue = now.toISOString()
        let repescagemFilter = `estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (faixa = '90_plus' || dias_sem_faturar >= 90) && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
        if (filtroSegmento && filtroSegmento !== 'todos') {
          repescagemFilter += ` && segmento = '${filtroSegmento}'`
        }

        try {
          const poolRepescagem = $app.findRecordsByFilter(
            'clientes',
            repescagemFilter,
            '-score',
            500,
            0,
          )
          const poolNaoRepetido = poolRepescagem.filter((c) => !isCandidatoRepetidoRecente(c))
          for (let m = 0; m < poolNaoRepetido.length; m++) {
            const item = poolNaoRepetido[m]
            if (!jaContatadoPeloVendedorOriginal(item)) {
              cand = item
              filtroOrigemAtendido = 'repescagem'
              break
            }
          }
        } catch (repErr) {
          console.log('[queue_reserve] Erro na fila da Repescagem: ' + repErr.message)
        }
      }

      // =========================================================================
      // NOVO MOTOR — FILTRO PRIMÁRIO: CARTEIRA NOMINAL
      // =========================================================================
      // Cada operador do Varejo recebe SOMENTE clientes cujo vendedor cadastrado
      // corresponde ao seu próprio nome (casamento tolerante).
      let contagemCarteiraNominalSemFiltroSegmento = 0
      const isVarejo = !isAtacado && !isRepescagem

      if (!cand && isVarejo) {
        let sortExpr = '-score'
        if (ordenacaoEscolhida === 'antigos') sortExpr = '-dias_sem_faturar'
        else if (ordenacaoEscolhida === 'novos') sortExpr = 'dias_sem_faturar'

        const nowIsoQueue = now.toISOString()
        const vendedorTokens = buildVendedorSqlTerms(userName)

        // Helper de filtro nominal
        const montarFilterNominal = (comSegmento) => {
          let f = `estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
          if (comSegmento && filtroSegmento && filtroSegmento !== 'todos') {
            f += ` && segmento = '${filtroSegmento}'`
          }
          if (vendedorTokens.length > 0) {
            const vConds = vendedorTokens.map((t) => `vendedor ~ '${t}'`)
            f += ` && (${vConds.join(' || ')})`
          }
          return f
        }

        let poolNominal = []
        try {
          const fNom = montarFilterNominal(true)
          poolNominal = $app.findRecordsByFilter('clientes', fNom, sortExpr, 500, 0)
        } catch (fnErr) {
          console.log('[queue_reserve] Erro busca nominal: ' + fnErr.message)
        }

        // Refinamento em memória: matching tolerante estrito
        const poolNominalValida = poolNominal.filter((c) => {
          if (isCandidatoRepetidoRecente(c)) return false
          return matchesCarteiraVendedorTolerante(c, userName)
        })

        if (poolNominalValida.length > 0) {
          if (ordenacaoEscolhida === 'antigos' || ordenacaoEscolhida === 'novos') {
            cand = poolNominalValida[0]
          } else {
            // Prioridade 60–89 primeiro; 90+ depois pelos mais antigos
            const faixa60 = poolNominalValida.filter((c) => {
              const f = c.getString('faixa')
              const d = c.getInt('dias_sem_faturar')
              return f === '60_89' || (d >= 60 && d <= 89)
            })
            if (faixa60.length > 0) {
              cand = faixa60[0]
            } else {
              const faixa90 = poolNominalValida.filter((c) => {
                const f = c.getString('faixa')
                const d = c.getInt('dias_sem_faturar')
                return f === '90_plus' || d >= 90
              })
              if (faixa90.length > 0) {
                faixa90.sort((a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'))
                cand = faixa90[0]
              } else {
                cand = poolNominalValida[0]
              }
            }
          }
          filtroOrigemAtendido = 'primario_nominal'
        }

        // Contagem para aviso de segmento caso nominal esteja vazio apenas pelo segmento
        if (!cand && filtroSegmento && filtroSegmento !== 'todos') {
          try {
            const fSemSeg = montarFilterNominal(false)
            const pSemSeg = $app.findRecordsByFilter('clientes', fSemSeg, '-score', 500, 0)
            contagemCarteiraNominalSemFiltroSegmento = pSemSeg.filter((c) =>
              matchesCarteiraVendedorTolerante(c, userName),
            ).length
          } catch (_) {}
        }
      }

      // =========================================================================
      // NOVO MOTOR — FILTRO SECUNDÁRIO: POR CIDADE LIGADA À ROTA
      // =========================================================================
      // Apenas entra aqui se a carteira nominal não tiver candidatos disponíveis.
      // O operador pode receber clientes cujos vendedores NÃO constam em nenhuma fila
      // (vendedor não cadastrado, parceiros, lojas, sem vendedor), MAS:
      // se o vendedor for AFASTADO/INATIVO (ex.: Kaylane), O CLIENTE FICA PARADO!
      let cidadesDaRotaDoOperador = []
      let rotasDoOperador = userRegioes.filter(
        (r) => r.toUpperCase() !== 'ATACADO' && r.toUpperCase() !== 'REPESCAGEM',
      )

      if (!cand && isVarejo && rotasDoOperador.length > 0) {
        // Carrega todas as cidades mapeadas para as rotas do operador na tabela cidades_rotas
        try {
          const rotaConds = rotasDoOperador.map((r) => `rota = '${r}'`)
          const condRota = rotaConds.length === 1 ? rotaConds[0] : `(${rotaConds.join(' || ')})`
          const crRecords = $app.findRecordsByFilter(
            'cidades_rotas',
            `${condRota} && ativo = true`,
            'cidade',
            500,
            0,
          )
          for (let crI = 0; crI < crRecords.length; crI++) {
            const cNorm = crRecords[crI].getString('cidade_normalizada')
            if (cNorm) cidadesDaRotaDoOperador.push(cNorm)
          }
        } catch (crErr) {
          console.log('[queue_reserve] Erro ao carregar cidades_rotas: ' + crErr.message)
        }

        if (cidadesDaRotaDoOperador.length > 0) {
          let sortExpr = '-score'
          if (ordenacaoEscolhida === 'antigos') sortExpr = '-dias_sem_faturar'
          else if (ordenacaoEscolhida === 'novos') sortExpr = 'dias_sem_faturar'

          const nowIsoQueue = now.toISOString()
          let fCidadeBase = `estado = 'na_base' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
          if (filtroSegmento && filtroSegmento !== 'todos') {
            fCidadeBase += ` && segmento = '${filtroSegmento}'`
          }

          // Busca pool candidato da base
          let poolSecundario = []
          try {
            poolSecundario = $app.findRecordsByFilter('clientes', fCidadeBase, sortExpr, 500, 0)
          } catch (secErr) {
            console.log('[queue_reserve] Erro ao buscar pool secundário: ' + secErr.message)
          }

          // Avaliação e filtragem com as duas regras em cascata:
          // 1. O vendedor NÃO pode ser colaborador ativo de outro operador (pertenceria à carteira dele)
          // 2. O vendedor NÃO pode ser colaborador inativo/afastado (regra: FICA PARADO!)
          // 3. A cidade do cliente deve pertencer ao mapa cidade→rota do operador
          const poolSecundarioElegivel = []

          for (let pI = 0; pI < poolSecundario.length; pI++) {
            const cliCand = poolSecundario[pI]
            if (isCandidatoRepetidoRecente(cliCand)) continue

            const vCandRaw = cliCand.getString('vendedor') || ''
            const statusV = checarStatusVendedorCadastro(vCandRaw)

            // Se tem cadastro no sistema:
            // - se for ativo: pertence à carteira nominal de outro colega (não entra na secundária)
            // - se for inativo/afastado: FICA PARADO conforme regra 2 (não cai para ninguém)
            if (statusV.temCadastro) {
              continue
            }

            // Vendedor não consta em nenhuma fila cadastrada!
            // Agora avalia se a cidade do cadastro casa com a rota do operador
            const cidadeCli = extrairCidadeCliente(cliCand)
            const enderecoCli = normalizarTextoNFD(cliCand.getString('endereco'))
            const regiaoCli = normalizarTextoNFD(cliCand.getString('regiao'))

            let casaComRotaPorCidade = false

            // Checa cidade extraída
            if (cidadeCli) {
              for (let cI = 0; cI < cidadesDaRotaDoOperador.length; cI++) {
                const cidNorm = cidadesDaRotaDoOperador[cI]
                if (
                  cidadeCli === cidNorm ||
                  cidadeCli.includes(cidNorm) ||
                  cidNorm.includes(cidadeCli)
                ) {
                  casaComRotaPorCidade = true
                  break
                }
              }
            }

            // Fallback: se endereço ou regiao contiverem o nome de alguma cidade da rota
            if (!casaComRotaPorCidade && enderecoCli) {
              for (let cI = 0; cI < cidadesDaRotaDoOperador.length; cI++) {
                const cidNorm = cidadesDaRotaDoOperador[cI]
                if (cidNorm.length >= 4 && enderecoCli.includes(cidNorm)) {
                  casaComRotaPorCidade = true
                  break
                }
              }
            }

            // Se bateu na cidade polo ou divisa da rota do operador:
            if (casaComRotaPorCidade) {
              poolSecundarioElegivel.push(cliCand)
            }
          }

          if (poolSecundarioElegivel.length > 0) {
            if (ordenacaoEscolhida === 'antigos' || ordenacaoEscolhida === 'novos') {
              cand = poolSecundarioElegivel[0]
            } else {
              const faixa60 = poolSecundarioElegivel.filter((c) => {
                const f = c.getString('faixa')
                const d = c.getInt('dias_sem_faturar')
                return f === '60_89' || (d >= 60 && d <= 89)
              })
              if (faixa60.length > 0) {
                cand = faixa60[0]
              } else {
                const faixa90 = poolSecundarioElegivel.filter((c) => {
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
                  cand = poolSecundarioElegivel[0]
                }
              }
            }
            filtroOrigemAtendido = 'secundario_cidade'
          }
        }
      }

      // =========================================================================
      // NENHUM CANDIDATO ENCONTRADO
      // =========================================================================
      if (!cand) {
        const temFiltroSegmentoAtivo = filtroSegmento && filtroSegmento !== 'todos'
        if (temFiltroSegmentoAtivo && contagemCarteiraNominalSemFiltroSegmento > 0) {
          return e.json(200, {
            cliente: null,
            carteira_esgotada: false,
            segmento_zerado: true,
            total_carteira_sem_filtro: contagemCarteiraNominalSemFiltroSegmento,
            message: `Nenhum cliente disponível no segmento selecionado. Selecione 'Todos os Segmentos' para acessar os ${contagemCarteiraNominalSemFiltroSegmento} clientes da sua carteira.`,
          })
        }

        const isCarteiraVazia = userRole === 'operador' || userRole === 'lider'
        let msg = 'Fila de atendimento vazia para o seu perfil no momento.'

        if (isRepescagem) {
          msg =
            'Nenhum cliente disponível na fila da Repescagem (90+ dias sem contato prévio do vendedor) no momento.'
        } else if (isAtacado && isCarteiraVazia) {
          msg = `Carteira esgotada para os seus DDDs (${atacadoDddsPermitidos.join(', ')}). Nenhum cliente disponível no seu mapa no momento.`
        } else if (isCarteiraVazia) {
          msg = `Carteira esgotada: não há clientes na sua carteira nominal (${userName}) nem clientes roteáveis por cidade para sua região (${rotasDoOperador.join(', ') || 'sua rota'}). Clientes de colaboradores inativos/afastados permanecem parados aguardando redistribuição.`
        }

        return e.json(200, {
          cliente: null,
          carteira_esgotada: isCarteiraVazia,
          segmento_zerado: false,
          total_carteira_sem_filtro: 0,
          message: msg,
        })
      }

      // =========================================================================
      // RESERVA ATÔMICA E AUDITORIA DETALHADA
      // =========================================================================
      const agoraReservaIso = new Date().toISOString()
      cand.set('estado', 'reservado')
      cand.set('operador', userId)
      cand.set('lock_timestamp', agoraReservaIso)
      if (cand.getString('reagendado_para')) {
        cand.set('retomada_servida_em', agoraReservaIso)
      }
      if (cand.getBool('prioridade_transferencia')) {
        cand.set('prioridade_transferencia', false)
      }
      $app.save(cand)

      console.log(
        `[queue_reserve] Cliente servido via filtro [${filtroOrigemAtendido}]: ${cand.id} (${cand.getString('codigo')}) para operador ${userName} (ID: ${userId}). Vendedor cadastro: "${cand.getString('vendedor')}", Cidade/End: "${cand.getString('endereco')}"`,
      )

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
          vendedor_cadastro: cand.getString('vendedor'),
          operador_atribuido: userName,
          endereco: cand.getString('endereco'),
          cidade: cand.getString('cidade'),
          filtro_origem: filtroOrigemAtendido,
          ddd_telefone: cand.getString('ddd_telefone'),
          dias_sem_faturar: cand.getInt('dias_sem_faturar'),
          repescagem: isRepescagem,
          atacado: isAtacado,
          is_lider: isLider,
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        cliente: cand,
        ja_reservado: false,
        carteira_esgotada: false,
        filtro_origem: filtroOrigemAtendido,
        message:
          filtroOrigemAtendido === 'primario_nominal'
            ? 'Contato reservado da sua carteira nominal.'
            : filtroOrigemAtendido === 'secundario_cidade'
              ? 'Contato reservado pelo filtro regional de cidade da sua rota.'
              : 'Novo contato reservado com sucesso.',
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[queue_reserve] Erro crítico em reserve-next: ' + errMsg)
      return e.json(500, { error: 'Falha ao reservar cliente na fila: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
