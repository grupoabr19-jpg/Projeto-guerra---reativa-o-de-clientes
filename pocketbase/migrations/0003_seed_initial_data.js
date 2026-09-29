migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const clientes = app.findCollectionByNameOrId('clientes')
    const configuracoes = app.findCollectionByNameOrId('configuracoes')

    // 1. Seed or update main Admin user
    let adminUser
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'pietra.leite@grupoabr.com.br')
      adminUser.set('role', 'admin')
      adminUser.set('name', 'Pietra Leite (Admin)')
      adminUser.set('regioes', ['Norte', 'Sul', 'Sudeste', 'Nordeste', 'Centro-Oeste'])
      app.save(adminUser)
    } catch (_) {
      adminUser = new Record(users)
      adminUser.setEmail('pietra.leite@grupoabr.com.br')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Pietra Leite (Admin)')
      adminUser.set('role', 'admin')
      adminUser.set('regioes', ['Norte', 'Sul', 'Sudeste', 'Nordeste', 'Centro-Oeste'])
      app.save(adminUser)
    }

    // Seed Supervisor
    let supUser
    try {
      supUser = app.findAuthRecordByEmail('_pb_users_auth_', 'supervisor@guerra.com.br')
    } catch (_) {
      supUser = new Record(users)
      supUser.setEmail('supervisor@guerra.com.br')
      supUser.setPassword('Skip@Pass')
      supUser.setVerified(true)
      supUser.set('name', 'Carlos Mendes (Supervisor)')
      supUser.set('role', 'supervisor')
      supUser.set('regioes', ['Sudeste', 'Sul'])
      app.save(supUser)
    }

    // Seed Operador 1
    let op1
    try {
      op1 = app.findAuthRecordByEmail('_pb_users_auth_', 'operador1@guerra.com.br')
    } catch (_) {
      op1 = new Record(users)
      op1.setEmail('operador1@guerra.com.br')
      op1.setPassword('Skip@Pass')
      op1.setVerified(true)
      op1.set('name', 'Mariana Silva (Operadora)')
      op1.set('role', 'operador')
      op1.set('regioes', ['Sudeste'])
      app.save(op1)
    }

    // 2. Seed Default Settings
    const defaultConfigs = [
      {
        chave: 'pesos_score',
        descricao: 'Pesos configuráveis do cálculo de score de reativação',
        valor: {
          recencia: 30, // 30%
          frequencia: 25, // 25%
          ticket_tonelagem: 20, // 20%
          segmento: 10, // 10%
          tentativas_penalidade: 15, // 15%
        },
      },
      {
        chave: 'motor_fila',
        descricao: 'Regras de ordenação e operação da fila',
        valor: {
          modo_criterio: 'modo_c', // "modo_a" (tempo sem faturar), "modo_b" (maior score), "modo_c" (score ponderado 90+ bonus)
          bonus_faixa_90: 20,
          timeout_lock_minutos: 30,
          limite_sem_contato: 3,
          prazo_quarentena_dias: 90,
          prazo_reativado_retorno_dias: 30,
          prazo_contatado_retorno_dias: 30,
          max_ciclos_followup: 4,
          horario_expediente_inicio: '08:00',
          horario_expediente_fim: '18:00',
        },
      },
      {
        chave: 'questionario_qualificacao',
        descricao: 'Estrutura e textos das 17 perguntas da tela de atendimento',
        valor: [
          {
            id: 'q1',
            numero: 1,
            titulo: 'Confirmação do Código do Cliente',
            tipo: 'preenchido',
            campo_origem: 'codigo',
            descricao: 'Código único no ERP (pré-preenchido)',
          },
          {
            id: 'q2',
            numero: 2,
            titulo: 'Razão Social / Nome do Cliente',
            tipo: 'preenchido',
            campo_origem: 'nome',
            descricao: 'Nome cadastral (pré-preenchido)',
          },
          {
            id: 'q3',
            numero: 3,
            titulo: 'Cliente continua ativo no mercado e operando?',
            tipo: 'select',
            opcoes: [
              'Sim, operação normal',
              'Sim, operação reduzida',
              'Em recuperação judicial',
              'Encerrou atividades',
            ],
            obrigatoria: true,
          },
          {
            id: 'q4',
            numero: 4,
            titulo: 'Região e Vendedor Atribuído',
            tipo: 'preenchido',
            campo_origem: 'regiao_vendedor',
            descricao: 'Território de atendimento',
          },
          {
            id: 'q5',
            numero: 5,
            titulo: 'Principal motivo do cancelamento / inatividade',
            tipo: 'select',
            opcoes: [
              'Preço / Condições de pagamento',
              'Prazo de entrega',
              'Problema com qualidade',
              'Atendimento / Vendedor',
              'Mudança na demanda',
              'Outro',
            ],
            obrigatoria: true,
          },
          {
            id: 'q6',
            numero: 6,
            titulo: 'Sensibilidade a preço / condição comercial',
            tipo: 'select',
            opcoes: [
              'Muito alta (decide por centavos)',
              'Média (avalia custo-benefício)',
              'Baixa (prioriza qualidade e prazo)',
            ],
          },
          {
            id: 'q7',
            numero: 7,
            titulo: 'Está comprando de concorrente atualmente?',
            tipo: 'select',
            opcoes: ['Sim', 'Não', 'Comprando de terceiros/revenda'],
          },
          {
            id: 'q8',
            numero: 8,
            titulo: 'Qual erro ou falha ocorreu no último fornecimento?',
            tipo: 'text',
            obrigatoria: true,
            condicional: "Pula se Q9 for 'Nenhum erro ocorrido'",
          },
          {
            id: 'q9',
            numero: 9,
            titulo: 'Tipo de ocorrência ou problema histórico',
            tipo: 'select',
            opcoes: [
              'Nenhum erro ocorrido',
              'Atraso no frete/entrega',
              'Divergência de lote/especificação',
              'Problema em nota fiscal/faturamento',
              'Outros problemas operacionais',
            ],
            obrigatoria: true,
          },
          {
            id: 'q10',
            numero: 10,
            titulo: 'Ação de correção / reparação necessária',
            tipo: 'text',
            obrigatoria: true,
            condicional: "Pula se Q9 for 'Nenhum erro ocorrido'",
          },
          {
            id: 'q11',
            numero: 11,
            titulo: 'Anexos comprobatórios (se houver reclamação)',
            tipo: 'arquivos',
            max_arquivos: 5,
            max_mb: 10,
          },
          {
            id: 'q12',
            numero: 12,
            titulo: 'Disposto a retomar compras com nova proposta?',
            tipo: 'select',
            opcoes: [
              'Sim, imediatamente',
              'Sim, no próximo ciclo (30 dias)',
              'Precisa de aprovação da diretoria',
              'Não tem interesse',
            ],
          },
          {
            id: 'q13',
            numero: 13,
            titulo: 'Canal preferido para envio de propostas e pedidos',
            tipo: 'select',
            opcoes: ['WhatsApp', 'E-mail', 'Telefone', 'Visita presencial'],
          },
          {
            id: 'q14',
            numero: 14,
            titulo: 'Desfecho e encaminhamento deste contato',
            tipo: 'desfecho_unificado',
            descricao: 'Desfecho unificado com Q17',
            obrigatoria: true,
          },
          {
            id: 'q15',
            numero: 15,
            titulo: 'Valor potencial estimado do pedido (R$)',
            tipo: 'numero',
            mascara: 'moeda',
            obrigatoria: false,
          },
          {
            id: 'q16',
            numero: 16,
            titulo: 'Volume / Tonelagem potencial estimada (ton)',
            tipo: 'numero',
            mascara: 'decimal',
            obrigatoria: false,
          },
          {
            id: 'q17',
            numero: 17,
            titulo: 'Observações gerais e próximos passos',
            tipo: 'textarea',
            descricao: 'Notas livres do operador',
          },
        ],
      },
      {
        chave: 'kommo_config',
        descricao: 'Status e mapeamentos da integração Kommo CRM',
        valor: {
          funil_nome: 'Reativação',
          etapa_inicial: 'Lead Criado',
          etapa_reativado: 'Reativado',
          etapa_perdido: 'Perdido',
          etapa_reagendado: 'Reagendado',
          ultimo_sync: null,
          taxa_limite_req_por_segundo: 7,
        },
      },
    ]

    for (const item of defaultConfigs) {
      try {
        app.findFirstRecordByData('configuracoes', 'chave', item.chave)
      } catch (_) {
        const rec = new Record(configuracoes)
        rec.set('chave', item.chave)
        rec.set('valor', item.valor)
        rec.set('descricao', item.descricao)
        app.save(rec)
      }
    }

    // 3. Seed small sample test data (apenas amostra de 5 clientes para navegação)
    const sampleClientes = [
      {
        codigo: 'C001021',
        nome: 'Indústria Metalúrgica Aliança Ltda',
        cpf_cnpj: '12.345.678/0001-90',
        telefone: '11987654321',
        whatsapp: '11987654321',
        email: 'compras@aliancametal.com.br',
        regiao: 'Sudeste',
        vendedor: 'Marcos Paulo',
        segmento: 'Metalurgia',
        endereco: 'Av. Industrial, 1200 - São Paulo/SP',
        ultima_compra: '2024-07-15 10:00:00.000Z',
        valor_ultima_compra: 45000,
        toneladas_historico: 35.5,
        valor_historico: 185000,
        compras_count: 8,
        dias_sem_faturar: 235,
        faixa: '90_plus',
        score: 84,
        estado: 'na_base',
        origem: 'importacao',
      },
      {
        codigo: 'C001022',
        nome: 'Construtora Horizonte Brasil S.A.',
        cpf_cnpj: '98.765.432/0001-11',
        telefone: '21998877665',
        whatsapp: '21998877665',
        email: 'suprimentos@horizontebrasil.com.br',
        regiao: 'Sudeste',
        vendedor: 'Carla Esteves',
        segmento: 'Construção Civil',
        endereco: 'Rua das Pedras, 450 - Rio de Janeiro/RJ',
        ultima_compra: '2024-11-20 14:30:00.000Z',
        valor_ultima_compra: 82000,
        toneladas_historico: 64.0,
        valor_historico: 320000,
        compras_count: 12,
        dias_sem_faturar: 107,
        faixa: '90_plus',
        score: 79,
        estado: 'na_base',
        origem: 'importacao',
      },
      {
        codigo: 'C001023',
        nome: 'Agroindustrial São Bento Eireli',
        cpf_cnpj: '33.444.555/0001-22',
        telefone: '19971122334',
        whatsapp: '19971122334',
        email: 'diretoria@saobentoagro.com.br',
        regiao: 'Sudeste',
        vendedor: 'Marcos Paulo',
        segmento: 'Agronegócio',
        endereco: 'Rodovia SP-330 km 142 - Limeira/SP',
        ultima_compra: '2024-12-28 09:15:00.000Z',
        valor_ultima_compra: 31000,
        toneladas_historico: 22.8,
        valor_historico: 115000,
        compras_count: 5,
        dias_sem_faturar: 69,
        faixa: '60_89',
        score: 68,
        estado: 'na_base',
        origem: 'importacao',
      },
      {
        codigo: 'C001024',
        nome: 'Distribuidora Sul Mineradora Ltda',
        cpf_cnpj: '44.555.666/0001-33',
        telefone: '41988887777',
        whatsapp: '41988887777',
        email: 'pedidos@sulmineradora.com.br',
        regiao: 'Sul',
        vendedor: 'Rodrigo Faro',
        segmento: 'Mineração',
        endereco: 'BR 277 km 80 - Curitiba/PR',
        ultima_compra: '2024-10-10 11:00:00.000Z',
        valor_ultima_compra: 60000,
        toneladas_historico: 50.0,
        valor_historico: 240000,
        compras_count: 9,
        dias_sem_faturar: 148,
        faixa: '90_plus',
        score: 72,
        estado: 'na_base',
        origem: 'importacao',
      },
      {
        codigo: 'C001025',
        nome: 'Engenharia & Pré-Moldados Pioneira',
        cpf_cnpj: '55.666.777/0001-44',
        telefone: '31999990000',
        whatsapp: '31999990000',
        email: 'contato@pioneiraeng.com.br',
        regiao: 'Sudeste',
        vendedor: 'Carla Esteves',
        segmento: 'Pré-moldados',
        endereco: 'Distrito Industrial - Contagem/MG',
        ultima_compra: '2025-01-05 16:00:00.000Z',
        valor_ultima_compra: 19500,
        toneladas_historico: 15.0,
        valor_historico: 75000,
        compras_count: 3,
        dias_sem_faturar: 61,
        faixa: '60_89',
        score: 55,
        estado: 'na_base',
        origem: 'importacao',
      },
    ]

    for (const c of sampleClientes) {
      try {
        app.findFirstRecordByData('clientes', 'codigo', c.codigo)
      } catch (_) {
        const rec = new Record(clientes)
        for (const k in c) {
          rec.set(k, c[k])
        }
        app.save(rec)
      }
    }
  },
  (app) => {
    // rollback
  },
)
