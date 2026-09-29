migrate(
  (app) => {
    // 1. Adicionar campo 'tipo' na coleção 'regioes' se não existir
    const regioesCol = app.findCollectionByNameOrId('regioes')
    if (!regioesCol.fields.getByName('tipo')) {
      regioesCol.fields.add(
        new SelectField({
          name: 'tipo',
          values: ['comercial', 'repescagem'],
          maxSelect: 1,
        }),
      )
      app.save(regioesCol)
    }

    // Atualizar as 8 rotas padrão existentes para tipo = 'comercial'
    app
      .db()
      .newQuery("UPDATE regioes SET tipo = 'comercial' WHERE tipo IS NULL OR tipo = ''")
      .execute()

    // 2. Criar ou atualizar a região 'Repescagem' como tipo 'repescagem'
    let repescagemRec
    try {
      repescagemRec = app.findFirstRecordByData('regioes', 'nome', 'REPESCAGEM')
    } catch (_) {
      try {
        repescagemRec = app.findFirstRecordByData('regioes', 'nome', 'Repescagem')
      } catch (_) {
        repescagemRec = new Record(regioesCol)
        repescagemRec.set('nome', 'REPESCAGEM')
      }
    }

    repescagemRec.set('ordem', 99)
    repescagemRec.set('ativo', true)
    repescagemRec.set('tipo', 'repescagem')
    repescagemRec.set('vendedor_externo', '')
    repescagemRec.set('especialista', '')
    repescagemRec.set('corporativo', '')
    repescagemRec.set('construcao_civil', '')
    repescagemRec.set('cidades_rota', [])
    repescagemRec.set(
      'municipios_potenciais',
      'Fila transversal nacional (todas as regiões - clientes 90+ dias)',
    )
    repescagemRec.set(
      'observacao',
      'Rota especial transversal: atende clientes com mais de 90 dias sem faturar de todas as regiões que não possuam contato prévio do vendedor da rota.',
    )
    app.save(repescagemRec)

    // 3. Criar a conta de usuária da Priscila Faria
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const emailPriscila = 'priscila.faria@grupoabr.com.br'
    const defaultPassword = 'ABR@2026'

    let priscilaRec
    try {
      priscilaRec = app.findAuthRecordByEmail('_pb_users_auth_', emailPriscila)
    } catch (_) {
      priscilaRec = new Record(usersCol)
      priscilaRec.setEmail(emailPriscila)
    }

    priscilaRec.setPassword(defaultPassword)
    priscilaRec.setVerified(true)
    priscilaRec.set('name', 'Priscila Faria')
    priscilaRec.set('role', 'operador')
    priscilaRec.set('regioes', ['REPESCAGEM'])
    app.save(priscilaRec)
  },
  (app) => {
    // Rollback: remover conta da Priscila Faria
    try {
      const u = app.findAuthRecordByEmail('_pb_users_auth_', 'priscila.faria@grupoabr.com.br')
      app.delete(u)
    } catch (_) {}

    // Rollback: remover região REPESCAGEM
    try {
      const r = app.findFirstRecordByData('regioes', 'nome', 'REPESCAGEM')
      app.delete(r)
    } catch (_) {}
  },
)
