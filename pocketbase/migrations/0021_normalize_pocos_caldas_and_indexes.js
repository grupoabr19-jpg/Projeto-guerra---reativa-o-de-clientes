/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0021_normalize_pocos_caldas_and_indexes.js
    // 1. Normalizar todas as variações 'POCOS CALDAS', 'POCOS DE CALDAS' para a nomenclatura padrão 'POÇOS DE CALDAS'
    try {
      app
        .db()
        .newQuery(`
        UPDATE clientes 
        SET regiao = 'POÇOS DE CALDAS' 
        WHERE regiao = 'POCOS CALDAS' OR regiao = 'POCOS DE CALDAS' OR regiao = 'POÇOS CALDAS'
      `)
        .execute()
    } catch (e) {
      console.log('[0021] Aviso ao normalizar regioes clientes: ' + (e ? e.message : ''))
    }

    // 2. Normalizar outros apelidos conhecidos em clientes para evitar descasamento
    try {
      app
        .db()
        .newQuery(`
        UPDATE clientes 
        SET regiao = 'BRAGANÇA' 
        WHERE regiao = 'BRAGANCA' OR regiao = 'BRAGANÇA PAULISTA' OR regiao = 'BRAGANCA PAULISTA'
      `)
        .execute()

      app
        .db()
        .newQuery(`
        UPDATE clientes 
        SET regiao = 'CAMBUÍ' 
        WHERE regiao = 'CAMBUI' OR regiao = 'MICRO-REGIÃO' OR regiao = 'MICRO REGIAO' OR regiao = 'MICRO-REGIAO'
      `)
        .execute()
    } catch (_) {}

    // 3. Garantir índices compostos perfeitos para acelerar findRecordsByFilter com LIMIT e evitar "context deadline exceeded"
    try {
      app
        .db()
        .newQuery(
          `CREATE INDEX IF NOT EXISTS idx_clientes_fast_queue ON clientes (estado, telefone_invalido, score DESC);`,
        )
        .execute()
      app
        .db()
        .newQuery(
          `CREATE INDEX IF NOT EXISTS idx_clientes_reg_fast ON clientes (regiao, estado, telefone_invalido);`,
        )
        .execute()
    } catch (_) {}
  },
  (app) => {},
)
