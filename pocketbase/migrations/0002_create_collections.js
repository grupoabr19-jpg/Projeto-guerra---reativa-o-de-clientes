migrate(
  (app) => {
    // 1. Clientes
    const clientes = new Collection({
      name: 'clientes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'cpf_cnpj', type: 'text' },
        { name: 'telefone', type: 'text' },
        { name: 'whatsapp', type: 'text' },
        { name: 'telefone_invalido', type: 'bool' },
        { name: 'email', type: 'text' },
        { name: 'regiao', type: 'text' },
        { name: 'vendedor', type: 'text' },
        { name: 'segmento', type: 'text' },
        { name: 'endereco', type: 'text' },
        { name: 'ultima_compra', type: 'date' },
        { name: 'valor_ultima_compra', type: 'number' },
        { name: 'toneladas_historico', type: 'number' },
        { name: 'valor_historico', type: 'number' },
        { name: 'compras_count', type: 'number' },
        { name: 'dias_sem_faturar', type: 'number' },
        { name: 'faixa', type: 'select', values: ['60_89', '90_plus', 'recente'], maxSelect: 1 },
        { name: 'score', type: 'number' },
        {
          name: 'estado',
          type: 'select',
          values: [
            'na_base',
            'reservado',
            'em_atendimento',
            'reativado',
            'reagendado',
            'contatado',
            'compra_terceiros',
            'nao_quer_negociar',
            'duplicado',
            'sem_contato',
          ],
          maxSelect: 1,
        },
        { name: 'operador', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'lock_timestamp', type: 'date' },
        { name: 'reagendado_para', type: 'date' },
        {
          name: 'reagendado_operador',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'tentativas_sem_contato', type: 'number' },
        { name: 'ciclos_followup', type: 'number' },
        { name: 'quarentena_ate', type: 'date' },
        { name: 'pedido_reativacao', type: 'text' },
        { name: 'pedido_confirmado', type: 'bool' },
        { name: 'kommo_id', type: 'text' },
        { name: 'kommo_lead_id', type: 'text' },
        { name: 'origem', type: 'select', values: ['importacao', 'kommo', 'manual'], maxSelect: 1 },
        { name: 'duplicado_de_codigo', type: 'text' },
        { name: 'notas', type: 'text' },
        { name: 'rascunho_respostas', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_clientes_codigo ON clientes (codigo)',
        'CREATE INDEX idx_clientes_estado ON clientes (estado)',
        'CREATE INDEX idx_clientes_regiao ON clientes (regiao)',
        'CREATE INDEX idx_clientes_score ON clientes (score DESC)',
        'CREATE INDEX idx_clientes_operador ON clientes (operador)',
      ],
    })
    app.save(clientes)

    const clientesColId = clientes.id

    // 2. Interacoes / Atendimentos (registro de contato com cliente)
    const interacoes = new Collection({
      name: 'interacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'cliente',
          type: 'relation',
          collectionId: clientesColId,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'operador',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: true,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          values: ['ligacao', 'whatsapp', 'email', 'status', 'nota', 'formulario'],
          maxSelect: 1,
        },
        { name: 'conteudo', type: 'text' },
        { name: 'desfecho', type: 'text' },
        { name: 'motivo', type: 'text' },
        { name: 'reagendado_para', type: 'date' },
        { name: 'numero_pedido', type: 'text' },
        { name: 'estado_anterior', type: 'text' },
        { name: 'estado_novo', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_interacoes_cliente ON interacoes (cliente, created DESC)',
        'CREATE INDEX idx_interacoes_operador ON interacoes (operador)',
      ],
    })
    app.save(interacoes)

    // 3. Respostas do Formulário de 17 Perguntas
    const respostasFormulario = new Collection({
      name: 'respostas_formulario',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'cliente',
          type: 'relation',
          collectionId: clientesColId,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'interacao',
          type: 'relation',
          collectionId: interacoes.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'operador', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'respostas', type: 'json', required: true }, // mapa de q1..q17
        { name: 'desfecho', type: 'text' },
        { name: 'valor_potencial', type: 'number' }, // Q15
        { name: 'toneladas_potencial', type: 'number' }, // Q16
        { name: 'anexos', type: 'file', maxSelect: 5, maxSize: 10485760 }, // Q11 até 5 arquivos de 10MB
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_respostas_cliente ON respostas_formulario (cliente, created DESC)',
      ],
    })
    app.save(respostasFormulario)

    // 4. Importacoes
    const importacoes = new Collection({
      name: 'importacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'nome_arquivo', type: 'text', required: true },
        { name: 'linhas_total', type: 'number' },
        { name: 'linhas_importadas', type: 'number' },
        { name: 'linhas_atualizadas', type: 'number' },
        { name: 'linhas_rejeitadas', type: 'number' },
        { name: 'reconciliados_faturaram', type: 'number' },
        { name: 'pedidos_validados', type: 'number' },
        { name: 'pedidos_divergentes', type: 'number' },
        {
          name: 'status',
          type: 'select',
          values: ['processando', 'concluida', 'erro'],
          maxSelect: 1,
        },
        { name: 'detalhes_erro', type: 'json' },
        { name: 'divergencias_pedidos', type: 'json' },
        { name: 'substituicao_total', type: 'bool' },
        { name: 'criado_por', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_importacoes_created ON importacoes (created DESC)'],
    })
    app.save(importacoes)

    // 5. Eventos de Log / Auditoria
    const eventosLog = new Collection({
      name: 'eventos_log',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'cliente', type: 'relation', collectionId: clientesColId, maxSelect: 1 },
        { name: 'usuario', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'acao', type: 'text', required: true }, // 'lock_reservado', 'lock_liberado', 'desfecho_alterado', 'reversao_supervisor', etc.
        { name: 'detalhes', type: 'json' },
        { name: 'ip', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_eventos_cliente ON eventos_log (cliente, created DESC)',
        'CREATE INDEX idx_eventos_created ON eventos_log (created DESC)',
      ],
    })
    app.save(eventosLog)

    // 6. Configuracoes
    const configuracoes = new Collection({
      name: 'configuracoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'",
      updateRule: "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'chave', type: 'text', required: true },
        { name: 'valor', type: 'json', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_config_chave ON configuracoes (chave)'],
    })
    app.save(configuracoes)
  },
  (app) => {
    const names = [
      'configuracoes',
      'eventos_log',
      'importacoes',
      'respostas_formulario',
      'interacoes',
      'clientes',
    ]
    for (const n of names) {
      try {
        const c = app.findCollectionByNameOrId(n)
        app.delete(c)
      } catch (_) {}
    }
  },
)
