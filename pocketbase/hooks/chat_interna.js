/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook de validação e endpoints do Chat Interno do Projeto Guerra.
 *
 * Regras implementadas:
 * 1. onRecordCreateRequest("chat_mensagens"):
 *    - Valida permissões: usuário autenticado só pode postar como ele mesmo.
 *    - Se for DM: valida se o usuário faz parte da conversa.
 *    - Se for aviso/broadcast: somente admin pode emitir tipo = 'aviso'. Se não for admin, força para 'normal'.
 *    - Preenche autor_nome e autor_role automaticamente a partir do auth record.
 *    - Atualiza os metadados da conversa (ultima_mensagem_texto, ultimo_autor_nome, etc.)
 *
 * 2. POST /backend/v1/chat/get-or-create-dm:
 *    - Cria ou retorna conversa 1:1 entre o usuário autenticado e outro colaborador.
 *    - Valida se o destinatário existe no sistema.
 *
 * 3. POST /backend/v1/chat/mark-read:
 *    - Registra timestamp de última leitura da conversa pelo usuário para contagem de não-lidas.
 *
 * 4. GET /backend/v1/chat/unread-counts:
 *    - Retorna a soma total e o mapa por conversa de mensagens não lidas pelo usuário autenticado.
 */

// 1. Hook de criação de mensagem
onRecordCreateRequest((e) => {
  try {
    const authRecord = e.auth
    if (!authRecord || !authRecord.id) {
      throw new BadRequestError('Autenticação obrigatória para enviar mensagens.')
    }

    const conversaId = e.record.getString('conversa')
    if (!conversaId) {
      throw new BadRequestError('Conversa é obrigatória.')
    }

    const conversa = $app.findRecordById('chat_conversas', conversaId)
    const convTipo = conversa.getString('tipo')
    const userRole = authRecord.getString('role') || 'operador'
    const userName = (authRecord.getString('name') || authRecord.getString('email') || '').trim()

    // Forçar autor correto
    e.record.set('autor', authRecord.id)
    e.record.set('autor_nome', userName)
    e.record.set('autor_role', userRole)

    const msgTipo = e.record.getString('tipo')
    // Apenas admin pode enviar mensagens do tipo 'aviso' ou 'notificacao' manuais
    if ((msgTipo === 'aviso' || msgTipo === 'notificacao') && userRole !== 'admin') {
      e.record.set('tipo', 'normal')
    }

    // Se a conversa for DM (1:1), garantir que o autor é participante
    // Permite que o admin poste caso esteja intervindo, ou exija que seja um dos participantes
    if (convTipo === 'dm') {
      let parts = []
      try {
        parts = conversa.getStringSlice('participantes') || []
      } catch (_) {}
      if (parts.length > 0 && !parts.includes(authRecord.id) && userRole !== 'admin') {
        throw new ForbiddenError('Você não faz parte desta conversa direta.')
      }
    }

    // Se a conversa for canal de rota, operadores só podem postar se tiverem a região ou se forem admin/supervisor
    if (convTipo === 'canal_rota' && userRole !== 'admin' && userRole !== 'supervisor') {
      const regiaoNome = conversa.getString('regiao_nome')
      let userRegioes = []
      try {
        userRegioes = authRecord.getStringSlice('regioes') || []
      } catch (_) {}
      if (regiaoNome && userRegioes.length > 0 && !userRegioes.includes(regiaoNome)) {
        throw new ForbiddenError('Acesso restrito aos colaboradores da rota ' + regiaoNome)
      }
    }

    return e.next()
  } catch (err) {
    if (err && err.status) throw err
    const msg = err && err.message ? err.message : String(err)
    throw new BadRequestError(msg)
  }
}, 'chat_mensagens')

// 1.1 Hook de validação de exclusão de mensagem (segurança no servidor)
// Regras:
// - Autor da mensagem pode apagar
// - Admin pode apagar qualquer mensagem (moderação de canal geral / supervisão)
// - Se a mensagem foi enviada pelo Sistema (autor = sistema ou tipo = 'notificacao'), o destinatário da conversa pode apagar/descartar
// - Operador/vendedor NÃO PODE apagar mensagem de outro colega
onRecordDeleteRequest((e) => {
  try {
    const authRecord = e.auth
    if (!authRecord || !authRecord.id) {
      throw new BadRequestError('Autenticação obrigatória para apagar mensagem.')
    }

    const msgRecord = e.record
    if (!msgRecord) return e.next()

    const authId = authRecord.id
    const userRole = authRecord.getString('role') || 'operador'
    const autorId = msgRecord.getString('autor')
    const conversaId = msgRecord.getString('conversa')

    // 1. Admin tem permissão total de exclusão
    if (userRole === 'admin') {
      return e.next()
    }

    // 2. O autor original pode apagar sua própria mensagem
    if (autorId === authId) {
      return e.next()
    }

    // 3. Caso especial: mensagem enviada pelo Sistema (notificação/follow-up/alerta)
    // Permite que o participante da conversa (o operador/líder destinatário) descarte a notificação
    const msgTipo = msgRecord.getString('tipo')
    const autorNome = msgRecord.getString('autor_nome') || ''
    let isSistema = msgTipo === 'notificacao' || autorNome.includes('Sistema')

    if (!isSistema && autorId) {
      try {
        const autorUser = $app.findRecordById('users', autorId)
        if (autorUser && autorUser.getString('email') === 'sistema@grupoabr.com.br') {
          isSistema = true
        }
      } catch (_) {}
    }

    if (isSistema && conversaId) {
      try {
        const conversa = $app.findRecordById('chat_conversas', conversaId)
        let parts = []
        try {
          parts = conversa.getStringSlice('participantes') || []
        } catch (_) {}
        if (parts.includes(authId)) {
          return e.next()
        }
      } catch (_) {}
    }

    // Caso não se enquadre em nenhuma das regras acima, nega no servidor
    throw new ForbiddenError('Permissão negada: você não tem permissão para apagar esta mensagem.')
  } catch (err) {
    if (err && err.status) throw err
    const msg = err && err.message ? err.message : String(err)
    throw new BadRequestError(msg)
  }
}, 'chat_mensagens')

// 1.1b Hook de validação de exclusão de conversa (chat_conversas)
// Regras estritas no servidor:
// - Ninguém pode apagar o canal Geral & Anúncios (tipo === 'geral')
// - Admin pode apagar qualquer conversa (exceto canal Geral)
// - Colaborador participante pode apagar/descartar sua própria conversa 1:1 (tipo === 'dm' ou 'kommo_whatsapp')
// - Ninguém pode apagar conversa alheia onde não é participante
onRecordDeleteRequest((e) => {
  try {
    const authRecord = e.auth
    if (!authRecord || !authRecord.id) {
      throw new BadRequestError('Autenticação obrigatória para apagar conversa.')
    }

    const convRecord = e.record
    if (!convRecord) return e.next()

    const authId = authRecord.id
    const userRole = authRecord.getString('role') || 'operador'
    const convTipo = convRecord.getString('tipo')

    // Regra prioritária: canal Geral nunca pode ser apagado
    if (convTipo === 'geral') {
      throw new ForbiddenError(
        'O canal Geral & Anúncios é o canal oficial da empresa e não pode ser apagado.',
      )
    }

    // Admin pode apagar qualquer conversa (exceto canal geral já bloqueado acima)
    if (userRole === 'admin') {
      return e.next()
    }

    // Colaborador comum: só pode apagar DM onde ele mesmo é participante
    if (convTipo === 'dm' || convTipo === 'kommo_whatsapp') {
      let parts = []
      try {
        parts = convRecord.getStringSlice('participantes') || []
      } catch (_) {}
      const respId = convRecord.getString('responsavel_id')

      if (parts.includes(authId) || respId === authId) {
        return e.next()
      }
    }

    throw new ForbiddenError('Permissão negada: você não tem permissão para apagar esta conversa.')
  } catch (err) {
    if (err && err.status) throw err
    const msg = err && err.message ? err.message : String(err)
    throw new BadRequestError(msg)
  }
}, 'chat_conversas')

// 1.1c Hook após exclusão de conversa: limpeza em cascata no servidor
// Remove todas as mensagens da conversa, leituras associadas e desassocia notificações enviadas
onRecordAfterDeleteSuccess((e) => {
  try {
    const convId = e.record.id
    if (!convId) return

    // 1. Apagar mensagens vinculadas a esta conversa
    try {
      const msgs = $app.findRecordsByFilter('chat_mensagens', `conversa = '${convId}'`, '', 5000, 0)
      for (let m = 0; m < msgs.length; m++) {
        try {
          $app.delete(msgs[m])
        } catch (_) {}
      }
    } catch (errMsgs) {
      console.log(
        '[chat_hook] Aviso ao limpar mensagens da conversa ' + convId + ': ' + errMsgs.message,
      )
    }

    // 2. Apagar registros de leitura desta conversa
    try {
      const leituras = $app.findRecordsByFilter(
        'chat_leituras',
        `conversa = '${convId}'`,
        '',
        500,
        0,
      )
      for (let l = 0; l < leituras.length; l++) {
        try {
          $app.delete(leituras[l])
        } catch (_) {}
      }
    } catch (errLeituras) {
      console.log(
        '[chat_hook] Aviso ao limpar leituras da conversa ' + convId + ': ' + errLeituras.message,
      )
    }

    // 3. Atualizar notificações enviadas para remover o ponteiro da conversa
    try {
      const notifs = $app.findRecordsByFilter(
        'notificacoes_enviadas',
        `conversa = '${convId}'`,
        '',
        500,
        0,
      )
      for (let n = 0; n < notifs.length; n++) {
        try {
          const rec = notifs[n]
          rec.set('conversa', null)
          rec.set('mensagem_id', '')
          $app.save(rec)
        } catch (_) {}
      }
    } catch (_) {}
  } catch (err) {
    console.log(
      '[chat_hook] Erro em onRecordAfterDeleteSuccess para chat_conversas: ' + err.message,
    )
  }
}, 'chat_conversas')

// 1.2 Hook após exclusão de mensagem: recalcular conversa pai (total_mensagens, última mensagem) e limpar leituras/notificações
onRecordAfterDeleteSuccess((e) => {
  try {
    const conversaId = e.record.getString('conversa')
    const msgId = e.record.id
    if (!conversaId) return

    // Se houver registro de notificacoes_enviadas vinculado a esta mensagem, remover para coerência
    if (msgId) {
      try {
        const notifs = $app.findRecordsByFilter(
          'notificacoes_enviadas',
          `mensagem_id = '${msgId}'`,
          '',
          10,
          0,
        )
        for (let n = 0; n < notifs.length; n++) {
          $app.delete(notifs[n])
        }
      } catch (_) {}
    }

    // Recalcular resumo e contagem da conversa pai
    try {
      const conversa = $app.findRecordById('chat_conversas', conversaId)
      const ultimas = $app.findRecordsByFilter(
        'chat_mensagens',
        `conversa = '${conversaId}'`,
        '-created',
        1,
        0,
      )

      const contagem = $app.findRecordsByFilter(
        'chat_mensagens',
        `conversa = '${conversaId}'`,
        '',
        1,
        0,
      )
      // Obter contagem total real de mensagens da conversa
      let totalRestante = 0
      try {
        const todasMsgs = $app.findRecordsByFilter(
          'chat_mensagens',
          `conversa = '${conversaId}'`,
          '',
          5000,
          0,
        )
        totalRestante = todasMsgs.length
      } catch (_) {
        totalRestante = Math.max(0, (conversa.getInt('total_mensagens') || 1) - 1)
      }

      conversa.set('total_mensagens', totalRestante)

      if (ultimas && ultimas.length > 0) {
        const ultimaMsg = ultimas[0]
        const texto = ultimaMsg.getString('texto') || ''
        const resumo = texto.length > 120 ? texto.slice(0, 117) + '...' : texto
        conversa.set('ultima_mensagem_texto', resumo)
        conversa.set('ultimo_autor_nome', ultimaMsg.getString('autor_nome') || 'Colaborador')
        conversa.set('ultima_mensagem_tipo', ultimaMsg.getString('tipo') || 'normal')
        conversa.set(
          'ultima_mensagem_data',
          ultimaMsg.getString('created') || new Date().toISOString(),
        )
      } else {
        // Nenhuma mensagem restante na conversa
        const tipoConv = conversa.getString('tipo')
        conversa.set(
          'ultima_mensagem_texto',
          tipoConv === 'geral' ? 'Canal Geral & Anúncios aberto.' : 'Conversa iniciada.',
        )
        conversa.set('ultimo_autor_nome', 'Sistema')
        conversa.set('ultima_mensagem_tipo', 'normal')
        conversa.set(
          'ultima_mensagem_data',
          conversa.getString('created') || new Date().toISOString(),
        )
      }

      $app.save(conversa)
    } catch (convErr) {
      console.log('[chat_hook] Aviso ao recalcular conversa após exclusão: ' + convErr.message)
    }
  } catch (err) {
    console.log('[chat_hook] Erro em onRecordAfterDeleteSuccess: ' + err.message)
  }
}, 'chat_mensagens')

// 1.3 Hook após persistir mensagem: atualizar conversa pai
onRecordAfterCreateSuccess((e) => {
  try {
    const conversaId = e.record.getString('conversa')
    if (!conversaId) return

    const conversa = $app.findRecordById('chat_conversas', conversaId)
    const texto = e.record.getString('texto') || ''
    const resumo = texto.length > 120 ? texto.slice(0, 117) + '...' : texto
    const autorNome = e.record.getString('autor_nome') || 'Colaborador'
    const tipo = e.record.getString('tipo') || 'normal'

    conversa.set('ultima_mensagem_texto', resumo)
    conversa.set('ultimo_autor_nome', autorNome)
    conversa.set('ultima_mensagem_tipo', tipo)
    conversa.set('ultima_mensagem_data', new Date().toISOString())
    const totalAtual = conversa.getInt('total_mensagens') || 0
    conversa.set('total_mensagens', totalAtual + 1)
    $app.save(conversa)
  } catch (err) {
    console.log('[chat_hook] Aviso ao atualizar conversa pai: ' + err.message)
  }
}, 'chat_mensagens')

// 2. Endpoint: Obter ou criar conversa DM (1:1)
// Suporta opcionalmente supervisor/admin abrindo DM entre dois outros usuários (userA e userB)
routerAdd(
  'POST',
  '/backend/v1/chat/get-or-create-dm',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = authRecord.getString('role') || 'operador'
      const body = e.requestInfo().body || {}
      let targetUserId = body.target_user_id
      let initiatorUserId = authRecord.id

      // Se for admin e passar user_a e user_b explicitamente:
      if (userRole === 'admin' && body.user_a_id && body.user_b_id) {
        initiatorUserId = body.user_a_id
        targetUserId = body.user_b_id
      }

      if (!targetUserId || targetUserId === initiatorUserId) {
        return e.json(400, { error: 'Destinatário inválido para conversa 1:1' })
      }

      // Vendedores/operadores/líderes não-admin só podem criar DM onde eles mesmos são uma das pontas
      if (userRole !== 'admin' && initiatorUserId !== authRecord.id) {
        return e.json(403, {
          error: 'Apenas administradores podem abrir conversas de supervisão de terceiros',
        })
      }
      // Validar existência do targetUser
      let targetUser = null
      try {
        targetUser = $app.findRecordById('users', targetUserId)
      } catch (_) {
        return e.json(404, { error: 'Colaborador destinatário não encontrado' })
      }

      // Validar existência do initiatorUser (caso seja terceiros)
      let initiatorUser = authRecord
      if (initiatorUserId !== authRecord.id) {
        try {
          initiatorUser = $app.findRecordById('users', initiatorUserId)
        } catch (_) {
          return e.json(404, { error: 'Usuário participante não encontrado' })
        }
      }

      const myId = initiatorUserId
      // Gerar chave única normalizada ordenada alfabeticamente: menor:maior
      const pair = [myId, targetUserId].sort()
      const chaveDm = pair[0] + ':' + pair[1]

      // Verificar se já existe conversa com essa chave_dm ou por participantes
      const existing = $app.findRecordsByFilter(
        'chat_conversas',
        `tipo = 'dm' && chave_dm = '${chaveDm}'`,
        '-updated',
        5,
        0,
      )

      if (existing && existing.length > 0) {
        return e.json(200, {
          conversa: existing[0],
          is_new: false,
        })
      }

      // Verificação de segurança por participantes
      const existingByParts = $app.findRecordsByFilter(
        'chat_conversas',
        `tipo = 'dm' && participantes ~ '${myId}' && participantes ~ '${targetUserId}'`,
        '-updated',
        5,
        0,
      )

      if (existingByParts && existingByParts.length > 0) {
        const conv = existingByParts[0]
        if (conv.getString('chave_dm') !== chaveDm) {
          conv.set('chave_dm', chaveDm)
          try {
            $app.save(conv)
          } catch (_) {}
        }
        return e.json(200, {
          conversa: conv,
          is_new: false,
        })
      }

      // Criar nova conversa DM
      const targetName = (
        targetUser.getString('name') ||
        targetUser.getString('email') ||
        ''
      ).trim()
      const myName = (
        initiatorUser.getString('name') ||
        initiatorUser.getString('email') ||
        ''
      ).trim()

      const colConversas = $app.findCollectionByNameOrId('chat_conversas')
      const nova = new Record(colConversas)
      nova.set('tipo', 'dm')
      nova.set('titulo', `${myName} & ${targetName}`)
      nova.set('chave_dm', chaveDm)
      nova.set('participantes', [myId, targetUserId])
      nova.set('total_mensagens', 0)
      nova.set('ultima_mensagem_texto', 'Conversa iniciada.')
      nova.set('ultimo_autor_nome', myName)
      nova.set('ultima_mensagem_tipo', 'normal')
      nova.set('ultima_mensagem_data', new Date().toISOString())

      $app.save(nova)

      return e.json(201, {
        conversa: nova,
        is_new: true,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha ao iniciar DM: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)

// 3. Endpoint: Marcar conversa como lida pelo usuário
routerAdd(
  'POST',
  '/backend/v1/chat/mark-read',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const body = e.requestInfo().body || {}
      const conversaId = body.conversa_id
      if (!conversaId) {
        return e.json(400, { error: 'conversa_id obrigatório' })
      }

      const nowIso = new Date().toISOString()
      const existing = $app.findRecordsByFilter(
        'chat_leituras',
        `conversa = '${conversaId}' && usuario = '${authRecord.id}'`,
        '',
        1,
        0,
      )

      if (existing && existing.length > 0) {
        const row = existing[0]
        row.set('last_read', nowIso)
        $app.save(row)
      } else {
        const colLeituras = $app.findCollectionByNameOrId('chat_leituras')
        const nova = new Record(colLeituras)
        nova.set('conversa', conversaId)
        nova.set('usuario', authRecord.id)
        nova.set('last_read', nowIso)
        $app.save(nova)
      }

      return e.json(200, { ok: true, read_at: nowIso })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha ao marcar lido: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)

// 4. Endpoint: Calcular mensagens não lidas
routerAdd(
  'GET',
  '/backend/v1/chat/unread-counts',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userId = authRecord.id
      // Buscar registros de leitura do usuário
      const leituras = $app.findRecordsByFilter(
        'chat_leituras',
        `usuario = '${userId}'`,
        '',
        500,
        0,
      )
      const lastReadByConv = {}
      for (let i = 0; i < leituras.length; i++) {
        const l = leituras[i]
        lastReadByConv[l.getString('conversa')] = l.getString('last_read')
      }

      // Buscar conversas acessíveis pelo usuário
      const todasConversas = $app.findRecordsByFilter('chat_conversas', '', '-updated', 200, 0)
      const userRole = authRecord.getString('role') || 'operador'
      let userRegioes = []
      try {
        userRegioes = authRecord.getStringSlice('regioes') || []
      } catch (_) {}

      const unreadMap = {}
      let totalUnread = 0

      for (let j = 0; j < todasConversas.length; j++) {
        const c = todasConversas[j]
        const cId = c.id
        const tipo = c.getString('tipo')

        // Checar visibilidade da conversa para o usuário
        if (tipo === 'dm') {
          let parts = []
          try {
            parts = c.getStringSlice('participantes') || []
          } catch (_) {}
          if (!parts.includes(userId)) continue
        } else if (tipo === 'canal_rota' && userRole !== 'admin' && userRole !== 'supervisor') {
          const rNome = c.getString('regiao_nome')
          if (rNome && userRegioes.length > 0 && !userRegioes.includes(rNome)) {
            continue
          }
        }

        // Apenas conversas internas (dm, geral, canal_rota) são contabilizadas
        if (tipo !== 'dm' && tipo !== 'geral' && tipo !== 'canal_geral' && tipo !== 'canal_rota') {
          continue
        }

        const lastRead = lastReadByConv[cId]
        let unreadForThis = 0

        // Se tem data de última leitura, contar mensagens posteriores não escritas por ele mesmo
        if (lastRead) {
          const novidades = $app.findRecordsByFilter(
            'chat_mensagens',
            `conversa = '${cId}' && created > '${lastRead}' && autor != '${userId}'`,
            '',
            50,
            0,
          )
          unreadForThis = novidades ? novidades.length : 0
        } else {
          // Se nunca abriu a conversa, conta mensagens recentes não escritas por ele (máx 10 para não sobrecarregar badge)
          const novidades = $app.findRecordsByFilter(
            'chat_mensagens',
            `conversa = '${cId}' && autor != '${userId}'`,
            '-created',
            10,
            0,
          )
          unreadForThis = novidades ? novidades.length : 0
        }

        if (unreadForThis > 0) {
          unreadMap[cId] = unreadForThis
          totalUnread += unreadForThis
        }
      }

      return e.json(200, {
        total_unread: totalUnread,
        by_conversation: unreadMap,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      return e.json(500, { error: 'Falha ao buscar unread: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
