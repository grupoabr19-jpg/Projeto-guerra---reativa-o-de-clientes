// Hook de segurança para atualização de usuários
// Apenas administradores podem alterar o campo 'role' de um usuário.
// Um usuário comum só pode atualizar seus próprios dados não-sensíveis (ex: nome, avatar, telefone).
onRecordUpdateRequest((e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Autenticação necessária' })
    }

    const currentRole = authRecord.getString('role')
    const targetRecord = e.record
    if (!targetRecord) {
      return e.next()
    }

    // Se o targetRecord pertence à coleção users
    if (targetRecord.collection().name === 'users') {
      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      // Se houver tentativa de alterar o campo 'role'
      if (body.role !== undefined && body.role !== null) {
        if (currentRole !== 'admin') {
          return e.json(403, {
            error: 'Apenas administradores podem alterar o nível de acesso (role) de usuários.',
          })
        }
      }
    }

    return e.next()
  } catch (err) {
    return e.json(500, { error: err.message })
  }
}, 'users')

// Hook de segurança e integridade para exclusão de usuários
// 1. Apenas administradores autenticados podem excluir usuários
// 2. O administrador não pode excluir a própria conta
// 3. Cascade suave: desvincula operador de clientes reservados/em_atendimento (libera locks e devolve à fila)
//    e de clientes reagendados para aquele operador (limpa reagendado_operador e devolve para na_base)
// 4. Preserva histórico de interações e respostas_formulario
onRecordDeleteRequest((e) => {
  try {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Autenticação necessária' })
    }

    const currentRole = authRecord.getString('role')
    if (currentRole !== 'admin') {
      return e.json(403, {
        error: 'Apenas administradores podem excluir contas de usuários do sistema.',
      })
    }

    const targetRecord = e.record
    if (!targetRecord) {
      return e.next()
    }

    const targetUserId = targetRecord.id
    if (authRecord.id === targetUserId) {
      return e.json(400, {
        error: 'Ação bloqueada: você não pode excluir a sua própria conta de administrador.',
      })
    }

    const targetUserName =
      targetRecord.getString('name') || targetRecord.getString('email') || targetUserId

    // Cascade suave: desvincular operador de clientes e liberar locks
    try {
      // 1. Clientes em atendimento ou reservados pelo usuário excluído
      const clientesReservados = $app.findRecordsByFilter(
        'clientes',
        `operador = '${targetUserId}'`,
        '',
        500,
        0,
      )

      for (let i = 0; i < clientesReservados.length; i++) {
        const c = clientesReservados[i]
        const st = c.getString('estado')
        if (st === 'reservado' || st === 'em_atendimento') {
          c.set('estado', 'na_base')
        }
        c.set('operador', '')
        c.set('lock_timestamp', null)
        $app.save(c)
      }

      // 2. Clientes reagendados para o usuário excluído
      const clientesReagendados = $app.findRecordsByFilter(
        'clientes',
        `reagendado_operador = '${targetUserId}'`,
        '',
        500,
        0,
      )

      for (let j = 0; j < clientesReagendados.length; j++) {
        const cr = clientesReagendados[j]
        cr.set('reagendado_operador', '')
        cr.set('prioridade_transferencia', false)
        // Se estava apenas reagendado sem outro operador, devolver à base para não ficar órfão
        if (cr.getString('estado') === 'reagendado') {
          cr.set('estado', 'na_base')
        }
        $app.save(cr)
      }

      // 3. Registrar auditoria em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', 'usuario_excluido')
        ev.set('detalhes', {
          excluido_id: targetUserId,
          excluido_nome: targetUserName,
          excluido_email: targetRecord.getString('email'),
          clientes_reservados_liberados: clientesReservados.length,
          clientes_reagendados_liberados: clientesReagendados.length,
        })
        $app.save(ev)
      } catch (_) {}
    } catch (cascadeErr) {
      console.log(
        '[users_security] Aviso ao desvincular registros de cliente do usuario ' +
          targetUserId +
          ': ' +
          cascadeErr.message,
      )
    }

    return e.next()
  } catch (err) {
    return e.json(500, { error: err.message })
  }
}, 'users')
