// pocketbase/hooks/queue_reserve.js
// MOTOR DE FILA / ROTEAMENTO v3 EM CASCATA DE 3 FILTROS
// Regra do Usuário (Roteamento v3):
//
// 1) FILTRO 1 — NOME DO VENDEDOR (primario_nominal):
//    Cliente cai para o vendedor gravado no cadastro, SE esse vendedor tiver conta ativa
//    no sistema E ainda estiver ocupando a cadeira dele na rota (mesma região, mesmo tipo/especialidade).
//    Ex.: cliente "VARE - CAMILA GUIMENTI" em Poços de Caldas → cai para Camila Guimenti.
//
// 2) FILTRO 2 — TIPO DE VENDEDOR (secundario_tipo):
//    Se o vendedor do cadastro NÃO puder ser atendido pelo Filtro 1 (saiu da empresa, conta inativa,
//    sem conta no sistema, OU ainda ativo mas que TROCOU de rota ou de especialidade — ou seja, não ocupa
//    mais a cadeira daquela região/tipo), o cliente é roteado pela CADEIRA: tipo do cliente determina qual
//    cadeira da rota recebe (prefixo VCORP no campo vendedor → cadeira Corporativo da rota; VARE ou externo
//    → cadeira Especialista / Vendedor Externo da rota).
//
// 3) FILTRO 3 — REGIÃO (terciario_regiao):
//    A cidade do cadastro aponta a rota (via coleção `cidades_rotas`, já semeada e reconciliada);
//    dentro da rota, entrega ao TITULAR ATUAL da cadeira definida no Filtro 2.
//    Efeito direto: os ~83 clientes "VCORP - KAYLANE SILVA" (conta inativa) passam a ir automaticamente
//    para Josiane Frazão, hoje Corporativo+Especialista da rota Jundiaí — sem transferência manual,
//    sem cliente parado. FIM da regra "fica parado" do v0.0.149.
//
// PRESERVADOS INTEGRALMENTE:
// - BLINDAGEM DE ATACADO da v0.0.152: exclusão SQL de região ATACADO nos filtros de varejo,
//   função isClienteAtacado em memória e trava pré-salvamento.
// - Repescagem com blindagem de atacado no SQL e catch logando mensagem real sem fingir carteira esgotada.
// - Atacado por DDD: Larissa Terra (11,12,13), Julio Melo (15,19), Wilson Neto (14,16,17,18).
// - Prioridade 60–89 dias primeiro, 90+ depois.
// - Locks de 30 minutos e expurgo automático.
// - Rota especial Repescagem (90+ dias, todas as regiões, exceto já contatados pelo vendedor original).
// - Base Cliente Final e Atacado Fora do Mapa segregados fora da fila.
// - Rastreabilidade em eventos_log com filtro_origem: primario_nominal, secundario_tipo, terciario_regiao, atacado_ddd, repescagem.
//
// No Goja runtime do PocketBase, callbacks rodam em VM pool isolada.
// TODAS as funções auxiliares são declaradas inline dentro do corpo do callback.

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
      if (!clienteRec) return ''
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

    function isClienteAtacado(clienteRec) {
      if (!clienteRec) return false
      const regiao = normalizarTextoNFD(clienteRec.getString('regiao'))
      if (regiao === 'ATACADO' || regiao.includes('ATACADO')) {
        return true
      }
      const vendRaw = normalizarTextoNFD(clienteRec.getString('vendedor'))
      const tipoVend = normalizarTextoNFD(clienteRec.getString('tipo_vendedor'))
      const canalRaw = normalizarTextoNFD(clienteRec.getString('canal'))
      if (
        vendRaw.startsWith('ATR -') ||
        vendRaw.startsWith('ATR-') ||
        vendRaw.startsWith('ATACADO -') ||
        vendRaw.startsWith('ATACADO-') ||
        vendRaw.includes('ATACADO') ||
        tipoVend === 'ATACADO' ||
        tipoVend.includes('ATACADO') ||
        canalRaw === 'ATACADO' ||
        canalRaw.includes('ATACADO')
      ) {
        return true
      }
      const ddd = extrairDddCliente(clienteRec)
      const dddsAtacado = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
      if (
        dddsAtacado.includes(ddd) &&
        (canalRaw === 'ATACADO' ||
          tipoVend === 'ATACADO' ||
          vendRaw.startsWith('ATR') ||
          vendRaw.includes('ATACADO'))
      ) {
        return true
      }
      return false
    }

    function extrairCidadeCliente(clienteRec) {
      if (!clienteRec) return ''
      const cidDireta = clienteRec.getString('cidade')
      if (cidDireta && cidDireta.trim()) {
        return normalizarTextoNFD(cidDireta)
      }
      const endRaw = clienteRec.getString('endereco') || ''
      if (endRaw) {
        const partesHifen = endRaw.split('-')
        if (partesHifen.length >= 2) {
          const antesUf = partesHifen[partesHifen.length - 2].trim()
          const partesVirgula = antesUf.split(',')
          const possivelCidade = partesVirgula[partesVirgula.length - 1].trim()
          if (possivelCidade) {
            return normalizarTextoNFD(possivelCidade)
          }
        }
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

    function extrairRegioesDeUsuario(uRec) {
      let rList = []
      try {
        const slice = uRec.getStringSlice('regioes')
        if (slice && slice.length > 0) rList = slice
        else {
          const raw = uRec.getString('regioes')
          if (raw && raw.trim().startsWith('[')) rList = JSON.parse(raw)
          else {
            const rawGet = uRec.get('regioes')
            if (Array.isArray(rawGet)) rList = rawGet
          }
        }
      } catch (_) {}
      if (!Array.isArray(rList)) rList = []
      return rList.map((r) => normalizarTextoNFD(r)).filter(Boolean)
    }

    function classificarTipoCadeiraCliente(vendedorStr, tipoVendStr) {
      const vNorm = normalizarTextoNFD(vendedorStr)
      const tNorm = normalizarTextoNFD(tipoVendStr)
      if (
        vNorm.startsWith('VCORP') ||
        vNorm.includes('VCORP') ||
        tNorm === 'CORPORATIVO' ||
        tNorm.includes('CORPORATIVO')
      ) {
        return 'corporativo'
      }
      return 'especialista_externo'
    }

    function jaContatadoPeloVendedorOriginal(appInstance, clienteRec) {
      try {
        const cId = clienteRec.id
        const vendedorOriginal = (clienteRec.getString('vendedor') || '').trim().toUpperCase()
        let interacoes = []
        try {
          interacoes = appInstance.findRecordsByFilter(
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
            const opUser = appInstance.findRecordById('users', opId)
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
      // CARREGAMENTO DO ECOSSISTEMA DE VENDEDORES E MATRIZ DE CADEIRAS (ROTEAMENTO v3)
      // =========================================================================
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
        const uAtivo = u.getBool('ativo') !== false
        const uVars = obterVariantesVendedor(uNome)
        const uRegs = extrairRegioesDeUsuario(u)

        const uObj = {
          id: u.id,
          nome: uNome,
          ativo: uAtivo,
          role: u.getString('role'),
          variantes: uVars,
          regioes: uRegs,
        }

        if (uAtivo) {
          listaAtivos.push(uObj)
        } else {
          listaInativos.push(uObj)
        }
      }

      // 2. Carrega matriz de cadeiras oficiais por rota (da coleção `regioes`)
      let regioesComerciaisRecs = []
      try {
        regioesComerciaisRecs = $app.findRecordsByFilter(
          'regioes',
          "tipo = 'comercial' && ativo = true",
          'ordem',
          50,
          0,
        )
      } catch (rgErr) {
        console.log('[queue_reserve] Erro ao carregar regioes: ' + rgErr.message)
      }

      const matrizCadeirasPorRota = {}
      for (let rgI = 0; rgI < regioesComerciaisRecs.length; rgI++) {
        const rg = regioesComerciaisRecs[rgI]
        const rNomeNorm = normalizarTextoNFD(rg.getString('nome'))
        matrizCadeirasPorRota[rNomeNorm] = {
          nome: rg.getString('nome'),
          corporativo: rg.getString('corporativo') || '',
          especialista: rg.getString('especialista') || '',
          vendedor_externo: rg.getString('vendedor_externo') || '',
          construcao_civil: rg.getString('construcao_civil') || '',
        }
      }

      // 3. Carrega mapeamento cidade_normalizada -> rota (da coleção `cidades_rotas`)
      let cidadesRotasRecs = []
      try {
        cidadesRotasRecs = $app.findRecordsByFilter(
          'cidades_rotas',
          'ativo = true',
          'cidade',
          1000,
          0,
        )
      } catch (crAllErr) {
        console.log('[queue_reserve] Erro ao carregar cidades_rotas completo: ' + crAllErr.message)
      }

      const mapaCidadeParaRota = {}
      for (let crIdx = 0; crIdx < cidadesRotasRecs.length; crIdx++) {
        const cRec = cidadesRotasRecs[crIdx]
        const cn = cRec.getString('cidade_normalizada')
        if (cn) {
          mapaCidadeParaRota[cn] = normalizarTextoNFD(cRec.getString('rota'))
        }
      }

      const resolverRotaDoCliente = (clienteRec) => {
        const cidCli = extrairCidadeCliente(clienteRec)
        if (cidCli && mapaCidadeParaRota[cidCli]) {
          return mapaCidadeParaRota[cidCli]
        }
        if (cidCli) {
          const keys = Object.keys(mapaCidadeParaRota)
          for (let kI = 0; kI < keys.length; kI++) {
            const k = keys[kI]
            if (cidCli === k || cidCli.includes(k) || k.includes(cidCli)) {
              return mapaCidadeParaRota[k]
            }
          }
        }
        const endCli = normalizarTextoNFD(clienteRec.getString('endereco'))
        if (endCli) {
          const keys = Object.keys(mapaCidadeParaRota)
          for (let kI = 0; kI < keys.length; kI++) {
            const k = keys[kI]
            if (k.length >= 4 && endCli.includes(k)) {
              return mapaCidadeParaRota[k]
            }
          }
        }
        const regCliNorm = normalizarTextoNFD(clienteRec.getString('regiao'))
        if (regCliNorm && matrizCadeirasPorRota[regCliNorm]) {
          return regCliNorm
        }
        return ''
      }

      const buscarColaboradorAtivoPorNomeMatriz = (nomeMatriz) => {
        if (!nomeMatriz || !nomeMatriz.trim()) return null
        const nNorm = normalizarTextoNFD(nomeMatriz)
        const nVars = obterVariantesVendedor(nNorm)

        for (let i = 0; i < listaAtivos.length; i++) {
          const at = listaAtivos[i]
          const atNorm = normalizarTextoNFD(at.nome)
          if (nNorm === atNorm || nNorm.includes(atNorm) || atNorm.includes(nNorm)) {
            return at
          }
          for (let vI = 0; vI < nVars.length; vI++) {
            const vItem = nVars[vI]
            if (vItem.length >= 3 && (atNorm.includes(vItem) || at.variantes.includes(vItem))) {
              return at
            }
          }
          for (let aV = 0; aV < at.variantes.length; aV++) {
            const aItem = at.variantes[aV]
            if (aItem.length >= 3 && nNorm.includes(aItem)) {
              return at
            }
          }
        }
        return null
      }

      const checarStatusVendedorCadastro = (vendedorStr) => {
        if (!vendedorStr || !vendedorStr.trim()) {
          return { temCadastro: false, ativo: false }
        }
        const vLimpo = limparPrefixoVendedor(vendedorStr)
        const vNorm = normalizarTextoNFD(vLimpo)
        if (!vNorm || vNorm.length < 3) {
          return { temCadastro: false, ativo: false }
        }

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

        if (vNorm.includes('KAYLANE')) {
          return { temCadastro: true, ativo: false, nome: 'KAYLANE SILVA' }
        }

        return { temCadastro: false, ativo: false }
      }

      const resolverDestinoRoteamentov3 = (clienteRec) => {
        const vRaw = clienteRec.getString('vendedor') || ''
        const tipoVendRaw = clienteRec.getString('tipo_vendedor') || ''
        const rotaCliente = resolverRotaDoCliente(clienteRec)
        const tipoCadeira = classificarTipoCadeiraCliente(vRaw, tipoVendRaw)

        const statusV = checarStatusVendedorCadastro(vRaw)

        // FILTRO 1: NOME DO VENDEDOR (primario_nominal)
        if (statusV.temCadastro && statusV.ativo && statusV.usuario) {
          const uVendedor = statusV.usuario
          const uVendedorRegioes = uVendedor.regioes || []

          const mesmaRota = rotaCliente ? uVendedorRegioes.includes(rotaCliente) : true

          let mesmaCadeira = true
          if (rotaCliente && matrizCadeirasPorRota[rotaCliente]) {
            const cadRota = matrizCadeirasPorRota[rotaCliente]
            const uNomeNorm = normalizarTextoNFD(uVendedor.nome)
            if (tipoCadeira === 'corporativo') {
              const corpNorm = normalizarTextoNFD(cadRota.corporativo)
              mesmaCadeira =
                corpNorm && (uNomeNorm.includes(corpNorm) || corpNorm.includes(uNomeNorm))
            } else {
              const espNorm = normalizarTextoNFD(cadRota.especialista)
              const veNorm = normalizarTextoNFD(cadRota.vendedor_externo)
              mesmaCadeira =
                (espNorm && (uNomeNorm.includes(espNorm) || eNorm.includes(uNomeNorm))) ||
                (veNorm && (uNomeNorm.includes(veNorm) || veNorm.includes(uNomeNorm)))
            }
          }

          if (mesmaRota && mesmaCadeira) {
            return {
              filtro: 'primario_nominal',
              operador_id: uVendedor.id,
              operador_nome: uVendedor.nome,
              rota: rotaCliente,
              cadeira: tipoCadeira,
            }
          }
        }

        // FILTROS 2 E 3: TIPO DE VENDEDOR + REGIÃO (secundario_tipo / terciario_regiao)
        if (rotaCliente && matrizCadeirasPorRota[rotaCliente]) {
          const cadRota = matrizCadeirasPorRota[rotaCliente]
          let nomeTitularCadeira = ''
          let nomeCadeira = ''

          if (tipoCadeira === 'corporativo') {
            nomeTitularCadeira = cadRota.corporativo
            nomeCadeira = 'corporativo'
          } else {
            nomeTitularCadeira = cadRota.especialista || cadRota.vendedor_externo
            nomeCadeira = cadRota.especialista ? 'especialista' : 'vendedor_externo'
          }

          if (nomeTitularCadeira) {
            const opTitular = buscarColaboradorAtivoPorNomeMatriz(nomeTitularCadeira)
            if (opTitular) {
              const temPrefixoTipo =
                normalizarTextoNFD(vRaw).startsWith('VCORP') ||
                normalizarTextoNFD(vRaw).startsWith('VARE')
              const filtroNome = temPrefixoTipo ? 'secundario_tipo' : 'terciario_regiao'

              return {
                filtro: filtroNome,
                operador_id: opTitular.id,
                operador_nome: opTitular.nome,
                rota: rotaCliente,
                cadeira: nomeCadeira,
              }
            }
          }
        }

        return {
          filtro: 'sem_destino',
          operador_id: '',
          operador_nome: '',
          rota: rotaCliente,
          cadeira: tipoCadeira,
        }
      }

      // Helper defensivo de checagem para Repescagem
      const checarJaContatado = (clienteRec) => jaContatadoPeloVendedorOriginal($app, clienteRec)

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

      // Ordenação determinística EM MEMÓRIA do topo da fila:
      // REGRA MESTRA DO PROJETO GUERRA:
      // Prioridade 1: Faixa 60–89 dias PRIMEIRO (menor tempo de inatividade = mais quente para reativar).
      // Prioridade 2: Faixa 90+ dias DEPOIS.
      // Dentro de cada grupo de prioridade: score desc -> dias_sem_faturar desc -> codigo asc.
      const ordenarPoolPorPrioridade = (pool) => {
        if (!pool || pool.length < 2) return pool
        return pool.slice().sort((a, b) => {
          const fA = a.getString('faixa')
          const dA = a.getInt('dias_sem_faturar')
          const eh60A = fA === '60_89' || (dA >= 60 && dA <= 89)

          const fB = b.getString('faixa')
          const dB = b.getInt('dias_sem_faturar')
          const eh60B = fB === '60_89' || (dB >= 60 && dB <= 89)

          if (eh60A && !eh60B) return -1
          if (!eh60A && eh60B) return 1

          const scoreA = a.getInt('score')
          const scoreB = b.getInt('score')
          if (scoreB !== scoreA) return scoreB - scoreA

          if (dB !== dA) return dB - dA

          const codA = a.getString('codigo') || ''
          const codB = b.getString('codigo') || ''
          return codA < codB ? -1 : codA > codB ? 1 : 0
        })
      }

      let cand = null
      let filtroOrigemAtendido = ''

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
            if (!isAtacado && isClienteAtacado(r)) {
              console.log(
                `[queue_reserve] Reagendado ignorado (perfil atacado não elegível para operador ${userName}): ${r.id} (${r.getString('codigo')})`,
              )
              return false
            }
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
      // ETAPA B: ATACADO E REPESCAGEM
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

          const poolOperadorOrdenado = ordenarPoolPorPrioridade(poolOperador)
          if (poolOperadorOrdenado.length > 0) {
            if (ordenacaoEscolhida === 'antigos') {
              cand = poolOperadorOrdenado
                .slice()
                .sort((a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'))[0]
            } else if (ordenacaoEscolhida === 'novos') {
              cand = poolOperadorOrdenado
                .slice()
                .sort((a, b) => a.getInt('dias_sem_faturar') - b.getInt('dias_sem_faturar'))[0]
            } else {
              cand = poolOperadorOrdenado[0]
            }
            filtroOrigemAtendido = 'atacado_ddd'
          }
        } catch (atacadoErr) {
          console.log('[queue_reserve] Erro na fila do Atacado: ' + atacadoErr.message)
        }
      }

      if (!cand && isRepescagem) {
        const nowIsoQueue = now.toISOString()
        let repescagemFilter = `estado = 'na_base' && regiao != 'ATACADO' && tipo_vendedor != 'ATACADO' && vendedor !~ 'ATR' && vendedor !~ 'ATACADO' && canal != 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (faixa = '90_plus' || dias_sem_faturar >= 90) && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
        if (filtroSegmento && filtroSegmento !== 'todos') {
          repescagemFilter += ` && segmento = '${filtroSegmento}'`
        }

        try {
          const poolRepescagem = $app.findRecordsByFilter(
            'clientes',
            repescagemFilter,
            '-score',
            1000,
            0,
          )
          const poolNaoRepetido = poolRepescagem.filter((c) => !isCandidatoRepetidoRecente(c))
          const poolOrdenadoRepescagem = ordenarPoolPorPrioridade(poolNaoRepetido)
          let puladosPorAtacado = 0
          let puladosPorContatoPrevio = 0

          for (let m = 0; m < poolOrdenadoRepescagem.length; m++) {
            const item = poolOrdenadoRepescagem[m]
            if (!isAtacado && isClienteAtacado(item)) {
              puladosPorAtacado++
              continue
            }
            if (checarJaContatado(item)) {
              puladosPorContatoPrevio++
              continue
            }
            cand = item
            filtroOrigemAtendido = 'repescagem'
            break
          }

          console.log(
            `[queue_reserve] Repescagem avaliada para ${userName}: ${poolRepescagem.length} registros no filtro SQL, ${puladosPorAtacado} pulados por atacado, ${puladosPorContatoPrevio} pulados por contato prévio, candidato encontrado: ${cand ? cand.getString('codigo') : 'NENHUM'}`,
          )
        } catch (repErr) {
          const repMsg = repErr && repErr.message ? repErr.message : String(repErr)
          console.error('[queue_reserve] Erro interno na fila da Repescagem: ' + repMsg)
          return e.json(500, { error: 'Falha interna na fila da Repescagem: ' + repMsg })
        }
      }

      // =========================================================================
      // MOTOR DE FILA VAREJO — ROTEAMENTO v3 EM CASCATA DE 3 FILTROS
      // =========================================================================
      let contagemCarteiraNominalSemFiltroSegmento = 0
      const isVarejo = !isAtacado && !isRepescagem
      let rotasDoOperador = userRegioes.filter(
        (r) => r.toUpperCase() !== 'ATACADO' && r.toUpperCase() !== 'REPESCAGEM',
      )

      if (!cand && isVarejo) {
        let sortExpr = '-score'
        if (ordenacaoEscolhida === 'antigos') sortExpr = '-dias_sem_faturar'
        else if (ordenacaoEscolhida === 'novos') sortExpr = 'dias_sem_faturar'

        const nowIsoQueue = now.toISOString()
        const vendedorTokens = buildVendedorSqlTerms(userName)

        const selecionarMelhorCandidato = (pool) => {
          if (!pool || pool.length === 0) return null
          const poolOrdenado = ordenarPoolPorPrioridade(pool)
          if (ordenacaoEscolhida === 'antigos') {
            return poolOrdenado
              .slice()
              .sort((a, b) => b.getInt('dias_sem_faturar') - a.getInt('dias_sem_faturar'))[0]
          }
          if (ordenacaoEscolhida === 'novos') {
            return poolOrdenado
              .slice()
              .sort((a, b) => a.getInt('dias_sem_faturar') - b.getInt('dias_sem_faturar'))[0]
          }
          return poolOrdenado[0]
        }

        // PASSO 1: FILTRO 1 — NOME DO VENDEDOR (primario_nominal)
        const montarFilterNominal = (comSegmento) => {
          let f = `estado = 'na_base' && regiao != 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
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

        const poolNominalValida = poolNominal.filter((c) => {
          if (isCandidatoRepetidoRecente(c)) return false
          if (isClienteAtacado(c)) return false
          if (!matchesCarteiraVendedorTolerante(c, userName)) return false

          const destino = resolverDestinoRoteamentov3(c)
          return destino.filtro === 'primario_nominal' && destino.operador_id === userId
        })

        if (poolNominalValida.length > 0) {
          cand = selecionarMelhorCandidato(poolNominalValida)
          filtroOrigemAtendido = 'primario_nominal'
        }

        if (!cand && filtroSegmento && filtroSegmento !== 'todos') {
          try {
            const fSemSeg = montarFilterNominal(false)
            const pSemSeg = $app.findRecordsByFilter('clientes', fSemSeg, '-score', 500, 0)
            contagemCarteiraNominalSemFiltroSegmento = pSemSeg.filter((c) => {
              if (!matchesCarteiraVendedorTolerante(c, userName)) return false
              const destino = resolverDestinoRoteamentov3(c)
              return destino.filtro === 'primario_nominal' && destino.operador_id === userId
            }).length
          } catch (_) {}
        }

        // PASSO 2: FILTROS 2 E 3 — TIPO DE VENDEDOR + REGIÃO
        if (!cand && rotasDoOperador.length > 0) {
          let fBaseVarejo = `estado = 'na_base' && regiao != 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`
          if (filtroSegmento && filtroSegmento !== 'todos') {
            fBaseVarejo += ` && segmento = '${filtroSegmento}'`
          }

          let poolCandidatosGeral = []
          try {
            poolCandidatosGeral = $app.findRecordsByFilter(
              'clientes',
              fBaseVarejo,
              sortExpr,
              500,
              0,
            )
          } catch (cgErr) {
            console.log('[queue_reserve] Erro ao buscar pool geral de varejo: ' + cgErr.message)
          }

          const poolTipoValida = []
          const poolRegiaoValida = []

          for (let pIdx = 0; pIdx < poolCandidatosGeral.length; pIdx++) {
            const cli = poolCandidatosGeral[pIdx]
            if (isCandidatoRepetidoRecente(cli)) continue
            if (isClienteAtacado(cli)) continue

            const destino = resolverDestinoRoteamentov3(cli)
            if (destino.operador_id === userId) {
              if (destino.filtro === 'secundario_tipo') {
                poolTipoValida.push(cli)
              } else if (destino.filtro === 'terciario_regiao') {
                poolRegiaoValida.push(cli)
              }
            }
          }

          if (poolTipoValida.length > 0) {
            cand = selecionarMelhorCandidato(poolTipoValida)
            filtroOrigemAtendido = 'secundario_tipo'
          } else if (poolRegiaoValida.length > 0) {
            cand = selecionarMelhorCandidato(poolRegiaoValida)
            filtroOrigemAtendido = 'terciario_regiao'
          }
        }
      }

      // NENHUM CANDIDATO ENCONTRADO
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
          msg = `Carteira esgotada: não há clientes na sua carteira nominal (${userName}) nem clientes roteáveis por tipo/região para sua rota (${rotasDoOperador.join(', ') || 'sua rota'}).`
        }

        return e.json(200, {
          cliente: null,
          carteira_esgotada: isCarteiraVazia,
          segmento_zerado: false,
          total_carteira_sem_filtro: 0,
          message: msg,
        })
      }

      // TRAVA DE SEGURANÇA MÁXIMA EM MEMÓRIA:
      if (!isAtacado && isClienteAtacado(cand)) {
        console.error(
          `[queue_reserve] BLOQUEIO CRÍTICO: tentativa de servir cliente de ATACADO (${cand.id} - ${cand.getString('codigo')}) para operador sem região ATACADO (${userName} - ${userId}). Reserva cancelada.`,
        )
        return e.json(200, {
          cliente: null,
          carteira_esgotada: true,
          segmento_zerado: false,
          total_carteira_sem_filtro: 0,
          message: 'Fila de atendimento vazia para o seu perfil no momento.',
        })
      }

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

      let mensagemOrigem = 'Novo contato reservado com sucesso.'
      if (filtroOrigemAtendido === 'primario_nominal') {
        mensagemOrigem = 'Contato reservado da sua carteira nominal (Filtro 1 - Nome).'
      } else if (filtroOrigemAtendido === 'secundario_tipo') {
        mensagemOrigem = 'Contato reservado pelo tipo de vendedor da sua cadeira (Filtro 2 - Tipo).'
      } else if (filtroOrigemAtendido === 'terciario_regiao') {
        mensagemOrigem = 'Contato reservado pela região da sua rota (Filtro 3 - Região).'
      }

      return e.json(200, {
        cliente: cand,
        ja_reservado: false,
        carteira_esgotada: false,
        filtro_origem: filtroOrigemAtendido,
        message: mensagemOrigem,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[queue_reserve] Erro crítico em reserve-next: ' + errMsg)
      return e.json(500, { error: 'Falha ao reservar cliente na fila: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
