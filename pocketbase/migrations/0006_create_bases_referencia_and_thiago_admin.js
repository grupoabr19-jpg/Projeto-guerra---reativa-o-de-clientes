migrate(
  (app) => {
    // 1. Criar ou atualizar o usuário Thiago Almeida como admin do sistema
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const emailAdmin = 'thiago.almeida@grupoabr.com.br'
    const defaultPassword = 'ABR@2026'
    const todasRegioesNomes = [
      'BRAGANÇA',
      'JUNDIAÍ',
      'VARGINHA',
      'POUSO ALEGRE',
      'POÇOS DE CALDAS',
      'ITAJUBÁ',
      'EXTREMA',
      'CAMBUÍ',
    ]

    let thiagoRecord
    let thiagoExists = false
    try {
      thiagoRecord = app.findAuthRecordByEmail('_pb_users_auth_', emailAdmin)
      thiagoExists = true
    } catch (_) {
      thiagoRecord = new Record(usersCol)
      thiagoRecord.setEmail(emailAdmin)
    }

    thiagoRecord.setPassword(defaultPassword)
    thiagoRecord.setVerified(true)
    thiagoRecord.set('name', 'Thiago Almeida')
    thiagoRecord.set('role', 'admin')
    thiagoRecord.set('regioes', todasRegioesNomes)
    app.save(thiagoRecord)

    // 2. Criar coleção bases_referencia para armazenar planilhas cruas de referência
    let basesCol
    try {
      basesCol = app.findCollectionByNameOrId('bases_referencia')
    } catch (_) {
      basesCol = new Collection({
        name: 'bases_referencia',
        type: 'base',
        listRule: "@request.auth.role = 'admin'",
        viewRule: "@request.auth.role = 'admin'",
        createRule: "@request.auth.role = 'admin'",
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          { name: 'nome_arquivo', type: 'text', required: true },
          {
            name: 'arquivo',
            type: 'file',
            maxSelect: 1,
            maxSize: 52428800, // 50MB
            mimeTypes: [
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'text/csv',
              'text/plain',
              'application/csv',
            ],
          },
          {
            name: 'enviado_por',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'total_linhas', type: 'number' },
          { name: 'colunas_detectadas', type: 'json' },
          { name: 'amostra_linhas', type: 'json' },
          {
            name: 'status',
            type: 'select',
            values: ['aguardando_analise', 'em_analise', 'mapeado', 'arquivado'],
            maxSelect: 1,
          },
          { name: 'notas', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bases_referencia_created ON bases_referencia (created DESC)',
          'CREATE INDEX idx_bases_referencia_status ON bases_referencia (status)',
        ],
      })
      app.save(basesCol)
    }
  },
  (app) => {
    // Rollback: remove coleção bases_referencia
    try {
      const col = app.findCollectionByNameOrId('bases_referencia')
      app.delete(col)
    } catch (_) {}

    // Rollback usuário Thiago Almeida
    try {
      const thiago = app.findAuthRecordByEmail('_pb_users_auth_', 'thiago.almeida@grupoabr.com.br')
      app.delete(thiago)
    } catch (_) {}
  },
)
