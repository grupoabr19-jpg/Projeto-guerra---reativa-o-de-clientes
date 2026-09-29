migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Lista de 22 contas conforme especificação do Projeto Guerra
    // Senha padrão para novas contas: ABR@2026
    // pietre.leite: manter role admin, confirmar senha ABR@2026 e manter ou atribuir todas as regiões oficiais
    const accountsData = [
      {
        email: 'anderson.silva@grupoabr.com.br',
        name: 'Anderson Silva',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'ariane.souza@grupoabr.com.br',
        name: 'Ariane Souza',
        role: 'operador',
        // Casamento claro: ARIANE (Construção Civil) -> CAMBUÍ (região provisória)
        regioes: ['CAMBUÍ'],
      },
      {
        email: 'maria.barbosa@grupoabr.com.br',
        name: 'Maria Barbosa',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'bruna.pereira@grupoabr.com.br',
        name: 'Bruna Pereira',
        role: 'operador',
        // Especialista de Varginha é 'BRUNA'. Primeiro nome único na tabela de equipes.
        // Role supervisor (especialista = gestão da rota/suporte) e região VARGINHA
        role: 'supervisor',
        regioes: ['VARGINHA'],
      },
      {
        email: 'gabriela.cunha@grupoabr.com.br',
        name: 'Gabriela Cunha',
        role: 'supervisor',
        // Especialista de Itajubá é 'GABRIELA'. Primeiro nome único na tabela de equipes.
        // Role supervisor e região ITAJUBÁ
        regioes: ['ITAJUBÁ'],
      },
      {
        email: 'inayara.cunha@grupoabr.com.br',
        name: 'Inayara Cunha',
        role: 'supervisor',
        // Especialista de Extrema é 'INAYARA' -> supervisor, região EXTREMA
        regioes: ['EXTREMA'],
      },
      {
        email: 'dyovana.silva@grupoabr.com.br',
        name: 'Dyovana Silva',
        role: 'operador',
        // Vendedora externa de Jundiaí é 'DYOVANA' -> operador, região JUNDIAÍ
        regioes: ['JUNDIAÍ'],
      },
      {
        email: 'edmila.melo@grupoabr.com.br',
        name: 'Edmila Melo',
        role: 'supervisor',
        // Especialista de Cambuí é 'EDMILA' -> supervisor, região CAMBUÍ
        regioes: ['CAMBUÍ'],
      },
      {
        email: 'eder.bueno@grupoabr.com.br',
        name: 'Eder Bueno',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'julio.melo@grupoabr.com.br',
        name: 'Julio Melo',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'josiane.lima@grupoabr.com.br',
        name: 'Josiane Lima',
        role: 'operador',
        // ATENÇÃO: Na tabela de regiões consta 'JOSIANE FRAZÃO' (Jundiaí).
        // Como o sobrenome difere (Lima vs Frazão), conforme regra estrita não vinculamos região.
        regioes: [],
      },
      {
        email: 'juliano.pereira@grupoabr.com.br',
        name: 'Juliano Pereira',
        role: 'operador',
        // Vendedor externo de Cambuí é 'JULIANO' -> operador, região CAMBUÍ
        regioes: ['CAMBUÍ'],
      },
      {
        email: 'pietra.leite@grupoabr.com.br',
        name: 'Pietra Leite',
        role: 'admin',
        // Conta admin do sistema
        regioes: [
          'BRAGANÇA',
          'JUNDIAÍ',
          'VARGINHA',
          'POUSO ALEGRE',
          'POÇOS DE CALDAS',
          'ITAJUBÁ',
          'EXTREMA',
          'CAMBUÍ',
        ],
      },
      {
        email: 'leiz.torso@grupoabr.com.br',
        name: 'Leiz Torso',
        role: 'supervisor',
        // Especialista de Bragança é 'LEIZ' -> supervisor, região BRAGANÇA
        regioes: ['BRAGANÇA'],
      },
      {
        email: 'larissa.terra@grupoabr.com.br',
        name: 'Larissa Terra',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'marcelo.silva@grupoabr.com.br',
        name: 'Marcelo Silva',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'wilson.neto@grupoabr.com.br',
        name: 'Wilson Neto',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'thais.oliveira@grupoabr.com.br',
        name: 'Thais Oliveira',
        role: 'operador',
        // Corporativo de Varginha é 'THAIS' -> operador, região VARGINHA
        regioes: ['VARGINHA'],
      },
      {
        email: 'camila.guimenti@grupoabr.com.br',
        name: 'Camila Guimenti',
        role: 'operador',
        // Corporativo de Poços de Caldas é 'CAMILA GUIMENTI' -> operador, região POÇOS DE CALDAS
        regioes: ['POÇOS DE CALDAS'],
      },
      {
        email: 'raul.pereira@grupoabr.com.br',
        name: 'Raul Pereira',
        role: 'operador',
        regioes: [],
      },
      {
        email: 'peterson.seixas@grupoabr.com.br',
        name: 'Peterson Seixas',
        role: 'operador',
        // Vendedor externo de Varginha é 'PETERSON' -> operador, região VARGINHA
        regioes: ['VARGINHA'],
      },
      {
        email: 'vitoria.tavares@grupoabr.com.br',
        name: 'Vitoria Tavares',
        role: 'operador',
        // Corporativo de Pouso Alegre é 'VITORIA' -> operador, região POUSO ALEGRE
        regioes: ['POUSO ALEGRE'],
      },
    ]

    const DEFAULT_PASSWORD = 'ABR@2026'

    for (const acc of accountsData) {
      let record
      let isExisting = false

      try {
        record = app.findAuthRecordByEmail('_pb_users_auth_', acc.email)
        isExisting = true
      } catch (_) {
        record = new Record(users)
        record.setEmail(acc.email)
      }

      // Atualiza ou define a senha padrão ABR@2026
      record.setPassword(DEFAULT_PASSWORD)
      record.setVerified(true)

      // Se já existia (ex: pietra.leite), preserva papel admin se aplicável, ou atualiza com dados
      if (isExisting) {
        if (acc.email === 'pietra.leite@grupoabr.com.br') {
          record.set('role', 'admin')
          record.set('name', 'Pietra Leite')
          record.set('regioes', acc.regioes)
        } else {
          record.set('name', acc.name)
          record.set('role', acc.role)
          record.set('regioes', acc.regioes)
        }
      } else {
        record.set('name', acc.name)
        record.set('role', acc.role)
        record.set('regioes', acc.regioes)
      }

      app.save(record)
    }
  },
  (app) => {
    // Rollback: se necessário, remove os usuários criados, exceto admin pietra.leite
    const emailsToRemove = [
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
    ]

    for (const email of emailsToRemove) {
      try {
        const record = app.findAuthRecordByEmail('_pb_users_auth_', email)
        app.delete(record)
      } catch (_) {}
    }
  },
)
