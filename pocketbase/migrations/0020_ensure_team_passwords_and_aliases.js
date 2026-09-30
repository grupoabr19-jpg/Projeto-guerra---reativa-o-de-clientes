/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0020_ensure_team_passwords_and_aliases.js
    // Garante que todas as contas da equipe interna estejam com a senha padrão ABR@2026 ativa,
    // email verificado (verified = true) e aliases de e-mail para contas com variações de digitação (ex: ederbueno@ / thiago.almeida@ etc.)

    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const DEFAULT_PASSWORD = 'ABR@2026'

    // 1. Contas existentes para garantir verified=true e senha padrão se ainda não tiverem
    const teamEmails = [
      'thiago.almeida@grupoabr.com.br',
      'pietra.leite@grupoabr.com.br',
      'priscila.faria@grupoabr.com.br',
      'anderson.silva@grupoabr.com.br',
      'ariane.souza@grupoabr.com.br',
      'maria.barbosa@grupoabr.com.br',
      'bruna.pereira@grupoabr.com.br',
      'gabriela.cunha@grupoabr.com.br',
      'inayara.cunha@grupoabr.com.br',
      'dyovana.silva@grupoabr.com.br',
      'edmila.melo@grupoabr.com.br',
      'eder.bueno@grupoabr.com.br',
      'julio.melo@grupoabr.com.br',
      'josiane.lima@grupoabr.com.br',
      'juliano.pereira@grupoabr.com.br',
      'leiz.torso@grupoabr.com.br',
      'larissa.terra@grupoabr.com.br',
      'marcelo.silva@grupoabr.com.br',
      'wilson.neto@grupoabr.com.br',
      'thais.oliveira@grupoabr.com.br',
      'camila.guimenti@grupoabr.com.br',
      'raul.pereira@grupoabr.com.br',
      'peterson.seixas@grupoabr.com.br',
      'vitoria.tavares@grupoabr.com.br',
      'supervisor@guerra.com.br',
      'operador1@guerra.com.br',
    ]

    for (const email of teamEmails) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        u.setVerified(true)
        u.setPassword(DEFAULT_PASSWORD)
        app.save(u)
      } catch (_) {
        // Se ainda não existir, cria
        try {
          const newU = new Record(usersCol)
          newU.setEmail(email)
          newU.setPassword(DEFAULT_PASSWORD)
          newU.setVerified(true)
          newU.set('name', email.split('@')[0].replace('.', ' ').toUpperCase())
          newU.set('role', 'operador')
          newU.set('regioes', [])
          app.save(newU)
        } catch (_) {}
      }
    }

    // 2. Aliases frequentes de digitação para evitar que usuários fiquem bloqueados
    // Ex: ederbueno@grupoabr.com.br -> espelha Eder Bueno
    const aliases = [
      {
        aliasEmail: 'ederbueno@grupoabr.com.br',
        name: 'Eder Bueno (Alias)',
        role: 'operador',
        regioes: ['POÇOS DE CALDAS', 'POCOS CALDAS', 'POCOS DE CALDAS'],
      },
      {
        aliasEmail: 'eder.bueno@guerra.com.br',
        name: 'Eder Bueno (Guerra)',
        role: 'operador',
        regioes: ['POÇOS DE CALDAS', 'POCOS CALDAS', 'POCOS DE CALDAS'],
      },
      {
        aliasEmail: 'thiago@grupoabr.com.br',
        name: 'Thiago Almeida (Alias)',
        role: 'admin',
        regioes: [
          'BRAGANÇA',
          'JUNDIAÍ',
          'VARGINHA',
          'POUSO ALEGRE',
          'POÇOS DE CALDAS',
          'ITAJUBÁ',
          'EXTREMA',
          'CAMBUÍ',
          'REPESCAGEM',
        ],
      },
    ]

    for (const al of aliases) {
      try {
        const existing = app.findAuthRecordByEmail('_pb_users_auth_', al.aliasEmail)
        existing.setVerified(true)
        existing.setPassword(DEFAULT_PASSWORD)
        existing.set('role', al.role)
        existing.set('regioes', al.regioes)
        app.save(existing)
      } catch (_) {
        try {
          const rec = new Record(usersCol)
          rec.setEmail(al.aliasEmail)
          rec.setPassword(DEFAULT_PASSWORD)
          rec.setVerified(true)
          rec.set('name', al.name)
          rec.set('role', al.role)
          rec.set('regioes', al.regioes)
          app.save(rec)
        } catch (_) {}
      }
    }

    // 3. Normalizar regiões de usuários sem região atribuída para testes rápidos
    // Se Eder Bueno principal não tiver regiões, atribuir POÇOS DE CALDAS (pois clientes estão sob POCOS CALDAS / POÇOS DE CALDAS)
    try {
      const eder = app.findAuthRecordByEmail('_pb_users_auth_', 'eder.bueno@grupoabr.com.br')
      eder.set('regioes', ['POÇOS DE CALDAS', 'POCOS CALDAS'])
      app.save(eder)
    } catch (_) {}

    // 4. Também normalizar Camila Guimenti para incluir POCOS CALDAS além de POÇOS DE CALDAS
    try {
      const camila = app.findAuthRecordByEmail('_pb_users_auth_', 'camila.guimenti@grupoabr.com.br')
      camila.set('regioes', ['POÇOS DE CALDAS', 'POCOS CALDAS'])
      app.save(camila)
    } catch (_) {}
  },
  (app) => {
    // Rollback não precisa remover usuários para não corromper base de produção
  },
)
