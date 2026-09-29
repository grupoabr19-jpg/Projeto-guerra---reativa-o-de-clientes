migrate(
  (app) => {
    // 1. titulos_catalogo
    // Coleção pública para leitura de autenticados; create/update/delete para admin
    const titulosCatalogo = new Collection({
      name: 'titulos_catalogo',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'codigo', type: 'text', required: true },
        { name: 'nome', type: 'text', required: true },
        { name: 'emoji', type: 'text', required: true },
        {
          name: 'nivel',
          type: 'select',
          values: ['bronze', 'prata', 'ouro', 'platina', 'diamante'],
          required: true,
          maxSelect: 1,
        },
        { name: 'ordem', type: 'number', required: true },
        { name: 'pontos_necessarios', type: 'number', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'categoria', type: 'text' },
        { name: 'cor_hex', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_titulos_codigo ON titulos_catalogo (codigo)',
        'CREATE INDEX idx_titulos_ordem ON titulos_catalogo (ordem ASC)',
        'CREATE INDEX idx_titulos_pontos ON titulos_catalogo (pontos_necessarios ASC)',
      ],
    })
    app.save(titulosCatalogo)

    const titulosColId = titulosCatalogo.id

    // 2. conquistas_usuarios
    // Registra cada título/badge conquistado pelo usuário
    const conquistasUsuarios = new Collection({
      name: 'conquistas_usuarios',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'usuario',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'titulo',
          type: 'relation',
          collectionId: titulosColId,
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'pontos_no_momento', type: 'number' },
        { name: 'data_conquista', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_conquistas_user_titulo ON conquistas_usuarios (usuario, titulo)',
        'CREATE INDEX idx_conquistas_usuario ON conquistas_usuarios (usuario)',
      ],
    })
    app.save(conquistasUsuarios)

    // 3. concursos_sazonais
    // Administrador cria, edita e encerra. Leitura aberta para todos autenticados.
    const concursosSazonais = new Collection({
      name: 'concursos_sazonais',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        { name: 'titulo', type: 'text', required: true },
        { name: 'descricao', type: 'text' },
        { name: 'data_inicio', type: 'date', required: true },
        { name: 'data_fim', type: 'date', required: true },
        {
          name: 'metrica_tipo',
          type: 'select',
          values: ['conversoes', 'toneladas', 'atendimentos', 'pontos'],
          required: true,
          maxSelect: 1,
        },
        { name: 'meta_quantidade', type: 'number', required: true },
        { name: 'premio_descricao', type: 'text', required: true },
        { name: 'badge_exclusiva_nome', type: 'text' },
        { name: 'badge_exclusiva_emoji', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'encerrado', 'planejado'],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'vencedor',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'resultado_vencedor', type: 'text' },
        {
          name: 'criado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_concursos_status ON concursos_sazonais (status)',
        'CREATE INDEX idx_concursos_periodo ON concursos_sazonais (data_inicio, data_fim)',
      ],
    })
    app.save(concursosSazonais)

    // 4. Inserir configuração de pesos de gamificação padrão em 'configuracoes'
    try {
      const colConfig = app.findCollectionByNameOrId('configuracoes')
      const rec = new Record(colConfig)
      rec.set('chave', 'pesos_gamificacao')
      rec.set('descricao', 'Pesos e regras de pontuação da gamificação do Projeto Guerra')
      rec.set('valor', {
        atendimento_ligacao: 10,
        atendimento_formulario: 25,
        conversao_reativacao: 150,
        reagendamento_qualificado: 20,
        venda_perdida_com_motivo: 5,
        pontos_por_tonelada: 5,
      })
      app.save(rec)
    } catch (_) {}
  },
  (app) => {
    const names = ['concursos_sazonais', 'conquistas_usuarios', 'titulos_catalogo']
    for (const n of names) {
      try {
        const c = app.findCollectionByNameOrId(n)
        app.delete(c)
      } catch (_) {}
    }
    try {
      const cfg = app.findFirstRecordByData('configuracoes', 'chave', 'pesos_gamificacao')
      app.delete(cfg)
    } catch (_) {}
  },
)
