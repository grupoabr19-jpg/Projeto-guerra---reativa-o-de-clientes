migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Coleção atendimento_funis
    // Permissões: por enquanto apenas admin (leitura e escrita).
    // RLS: list, view, create, update, delete permitidos apenas para admin autenticado
    const funisCol = new Collection({
      name: 'atendimento_funis',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
          min: 1,
          max: 120,
        },
        {
          name: 'descricao',
          type: 'text',
          max: 500,
        },
        {
          name: 'ordem',
          type: 'number',
        },
        {
          name: 'cor_hex',
          type: 'text',
          max: 30,
        },
        {
          name: 'ativo',
          type: 'bool',
        },
        {
          name: 'criado_por',
          type: 'relation',
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_atend_funis_ordem ON atendimento_funis (ordem ASC)',
        'CREATE INDEX idx_atend_funis_ativo ON atendimento_funis (ativo)',
      ],
    })
    app.save(funisCol)

    const savedFunisCol = app.findCollectionByNameOrId('atendimento_funis')

    // 2. Coleção atendimento_funil_etapas
    const etapasCol = new Collection({
      name: 'atendimento_funil_etapas',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'funil',
          type: 'relation',
          required: true,
          collectionId: savedFunisCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'nome',
          type: 'text',
          required: true,
          min: 1,
          max: 120,
        },
        {
          name: 'ordem',
          type: 'number',
        },
        {
          name: 'cor_hex',
          type: 'text',
          max: 30,
        },
        {
          name: 'descricao',
          type: 'text',
          max: 500,
        },
        {
          name: 'tipo_desfecho',
          type: 'select',
          values: ['normal', 'sucesso', 'perda'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_atend_etapas_funil_ordem ON atendimento_funil_etapas (funil, ordem ASC)',
      ],
    })
    app.save(etapasCol)

    const savedEtapasCol = app.findCollectionByNameOrId('atendimento_funil_etapas')

    // 3. Seeds iniciais sugeridos pelo escopo ("Reativação", "Novo Cliente", "Projeto Especial")
    try {
      let adminUser = null
      try {
        adminUser = app.findFirstRecordByData('users', 'role', 'admin')
      } catch (_) {}
      const adminId = adminUser ? adminUser.id : ''

      const funisIniciais = [
        {
          nome: 'Reativação',
          descricao: 'Fluxo prioritário de retomada de clientes inativos 60-89 e 90+ dias',
          ordem: 1,
          cor_hex: '#253575',
          etapas: [
            {
              nome: 'Contato Inicial / Sondagem',
              ordem: 1,
              cor_hex: '#3b82f6',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Qualificação das 17 Perguntas',
              ordem: 2,
              cor_hex: '#8b5cf6',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Em Cotação / Proposta Enviada',
              ordem: 3,
              cor_hex: '#f59e0b',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Reativado com Pedido',
              ordem: 4,
              cor_hex: '#10b981',
              tipo_desfecho: 'sucesso',
            },
            {
              nome: 'Sem Interesse / Descartado',
              ordem: 5,
              cor_hex: '#ef4444',
              tipo_desfecho: 'perda',
            },
          ],
        },
        {
          nome: 'Novo Cliente',
          descricao: 'Atendimento e recepção de novos leads e prospecções ativas',
          ordem: 2,
          cor_hex: '#F18800',
          etapas: [
            { nome: 'Lead Recebido', ordem: 1, cor_hex: '#64748b', tipo_desfecho: 'normal' },
            {
              nome: 'Primeiro Contato Feito',
              ordem: 2,
              cor_hex: '#3b82f6',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Levantamento de Necessidades',
              ordem: 3,
              cor_hex: '#8b5cf6',
              tipo_desfecho: 'normal',
            },
            { nome: 'Orçamento em Análise', ordem: 4, cor_hex: '#f59e0b', tipo_desfecho: 'normal' },
            {
              nome: 'Primeira Compra Faturada',
              ordem: 5,
              cor_hex: '#10b981',
              tipo_desfecho: 'sucesso',
            },
            { nome: 'Lead Não Convertido', ordem: 6, cor_hex: '#ef4444', tipo_desfecho: 'perda' },
          ],
        },
        {
          nome: 'Projeto Especial',
          descricao:
            'Negociações de grande porte, cotações de construtoras e demandas corporativas',
          ordem: 3,
          cor_hex: '#142758',
          etapas: [
            {
              nome: 'Mapeamento do Projeto',
              ordem: 1,
              cor_hex: '#3b82f6',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Análise Técnica / Engenharia',
              ordem: 2,
              cor_hex: '#6366f1',
              tipo_desfecho: 'normal',
            },
            {
              nome: 'Proposta Comercial Especial',
              ordem: 3,
              cor_hex: '#f59e0b',
              tipo_desfecho: 'normal',
            },
            { nome: 'Contrato Fechado', ordem: 4, cor_hex: '#10b981', tipo_desfecho: 'sucesso' },
            { nome: 'Projeto Cancelado', ordem: 5, cor_hex: '#ef4444', tipo_desfecho: 'perda' },
          ],
        },
      ]

      for (let i = 0; i < funisIniciais.length; i++) {
        const item = funisIniciais[i]
        const recFunil = new Record(savedFunisCol)
        recFunil.set('nome', item.nome)
        recFunil.set('descricao', item.descricao)
        recFunil.set('ordem', item.ordem)
        recFunil.set('cor_hex', item.cor_hex)
        recFunil.set('ativo', true)
        if (adminId) {
          recFunil.set('criado_por', adminId)
        }
        app.save(recFunil)

        // Criar etapas correspondentes
        for (let j = 0; j < item.etapas.length; j++) {
          const et = item.etapas[j]
          const recEtapa = new Record(savedEtapasCol)
          recEtapa.set('funil', recFunil.id)
          recEtapa.set('nome', et.nome)
          recEtapa.set('ordem', et.ordem)
          recEtapa.set('cor_hex', et.cor_hex)
          recEtapa.set('tipo_desfecho', et.tipo_desfecho)
          app.save(recEtapa)
        }
      }
    } catch (seedErr) {
      console.log('[atendimento_funis] Erro ao criar seeds: ' + seedErr)
    }
  },
  (app) => {
    try {
      const etapas = app.findCollectionByNameOrId('atendimento_funil_etapas')
      app.delete(etapas)
    } catch (_) {}
    try {
      const funis = app.findCollectionByNameOrId('atendimento_funis')
      app.delete(funis)
    } catch (_) {}
  },
)
