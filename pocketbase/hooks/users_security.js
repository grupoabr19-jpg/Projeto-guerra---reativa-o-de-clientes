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
