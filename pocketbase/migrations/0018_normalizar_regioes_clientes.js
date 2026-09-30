migrate(
  (app) => {
    // Migração 0018: Normalização de nomes de região nos clientes existentes
    // Variações registradas durante importação:
    // - "BRAGANÇA PAULISTA", "BRAGANCA PAULISTA" -> normalizar para a região oficial "BRAGANÇA"
    // - "MICRO-REGIÃO", "MICRO REGIAO", "MICRO-REGIAO" -> normalizar para a região oficial "CAMBUÍ"

    // 1. Normalizar Bragança Paulista -> BRAGANÇA
    app
      .db()
      .newQuery(`
        UPDATE clientes
        SET regiao = 'BRAGANÇA'
        WHERE UPPER(TRIM(regiao)) IN ('BRAGANÇA PAULISTA', 'BRAGANCA PAULISTA')
      `)
      .execute()

    // 2. Normalizar Micro-Região -> CAMBUÍ
    app
      .db()
      .newQuery(`
        UPDATE clientes
        SET regiao = 'CAMBUÍ'
        WHERE UPPER(TRIM(regiao)) IN ('MICRO-REGIÃO', 'MICRO REGIAO', 'MICRO-REGIAO')
      `)
      .execute()

    // 3. Normalizar variações sem acento para o padrão oficial com acento
    app
      .db()
      .newQuery(`
        UPDATE clientes
        SET regiao = 'BRAGANÇA'
        WHERE UPPER(TRIM(regiao)) = 'BRAGANCA'
      `)
      .execute()

    app
      .db()
      .newQuery(`
        UPDATE clientes
        SET regiao = 'CAMBUÍ'
        WHERE UPPER(TRIM(regiao)) = 'CAMBUI'
      `)
      .execute()
  },
  (app) => {
    // Reversão não é necessária pois o mapeamento é uma normalização para o padrão do domínio
  },
)
