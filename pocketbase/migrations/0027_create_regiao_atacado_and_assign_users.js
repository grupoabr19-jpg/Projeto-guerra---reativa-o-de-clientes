migrate(
  (app) => {
    // 1. Criar ou atualizar a região 'ATACADO' na coleção 'regioes'
    const regioesCol = app.findCollectionByNameOrId('regioes')

    let atacadoRec
    try {
      atacadoRec = app.findFirstRecordByData('regioes', 'nome', 'ATACADO')
    } catch (_) {
      try {
        atacadoRec = app.findFirstRecordByData('regioes', 'nome', 'Atacado')
      } catch (_) {
        atacadoRec = new Record(regioesCol)
        atacadoRec.set('nome', 'ATACADO')
      }
    }

    atacadoRec.set('ordem', 9)
    atacadoRec.set('ativo', true)
    atacadoRec.set('tipo', 'comercial')
    atacadoRec.set('vendedor_externo', '')
    atacadoRec.set('especialista', '')
    atacadoRec.set('corporativo', '')
    atacadoRec.set('construcao_civil', '')
    atacadoRec.set('cidades_rota', [])
    atacadoRec.set(
      'municipios_potenciais',
      'Operação Atacado: clientes do canal Atacado e grandes volumes em múltiplos municípios.',
    )
    atacadoRec.set(
      'observacao',
      'Região/rota Atacado para atendimento especializado de contas de atacado.',
    )
    app.save(atacadoRec)

    // 2. Vincular os usuários Julio, Larissa e Wilson à nova região 'ATACADO'
    // Preservando seus papéis (role) e dados existentes
    const usersToLink = [
      { email: 'julio.melo@grupoabr.com.br', name: 'Julio Melo' },
      { email: 'larissa.terra@grupoabr.com.br', name: 'Larissa Terra' },
      { email: 'wilson.neto@grupoabr.com.br', name: 'Wilson Neto' },
    ]

    for (const target of usersToLink) {
      try {
        let uRec
        try {
          uRec = app.findAuthRecordByEmail('_pb_users_auth_', target.email)
        } catch (_) {
          // Busca alternativa por nome
          uRec = app.findFirstRecordByData('_pb_users_auth_', 'name', target.name)
        }

        if (uRec) {
          // Obter regiões atuais (se houver) e adicionar 'ATACADO' sem duplicar
          let currentRegioes = []
          try {
            const raw = uRec.get('regioes')
            if (Array.isArray(raw)) {
              currentRegioes = raw
            } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
              currentRegioes = JSON.parse(raw)
            }
          } catch (_) {
            currentRegioes = []
          }

          if (!currentRegioes.includes('ATACADO')) {
            currentRegioes.push('ATACADO')
          }

          uRec.set('regioes', currentRegioes)
          app.save(uRec)
        }
      } catch (err) {
        console.log(
          '[0027_add_regiao_atacado] Erro ao atualizar usuario ' +
            target.email +
            ': ' +
            (err ? err.message : ''),
        )
      }
    }
  },
  (app) => {
    // Rollback: remover 'ATACADO' das regiões dos usuários Julio, Larissa e Wilson
    const emails = [
      'julio.melo@grupoabr.com.br',
      'larissa.terra@grupoabr.com.br',
      'wilson.neto@grupoabr.com.br',
    ]

    for (const email of emails) {
      try {
        const uRec = app.findAuthRecordByEmail('_pb_users_auth_', email)
        let currentRegioes = []
        const raw = uRec.get('regioes')
        if (Array.isArray(raw)) {
          currentRegioes = raw
        } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
          currentRegioes = JSON.parse(raw)
        }
        uRec.set(
          'regioes',
          currentRegioes.filter((r) => r !== 'ATACADO'),
        )
        app.save(uRec)
      } catch (_) {}
    }

    // Rollback: remover região ATACADO
    try {
      const atacadoRec = app.findFirstRecordByData('regioes', 'nome', 'ATACADO')
      app.delete(atacadoRec)
    } catch (_) {}
  },
)
