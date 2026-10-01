migrate(
  (app) => {
    // Função SQL para extrair DDD real eliminando zeros à esquerda (ex.: 011 -> 11) ou prefixo 55
    // SQLite puro:
    // Se começar com '0', pega caracteres 2 e 3
    // Se começar com '55' e tamanho >= 12, pega caracteres 3 e 4
    // Senão pega caracteres 1 e 2
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET ddd_telefone = CASE
        WHEN SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 1, 1) = '0'
          THEN SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 2, 2)
        WHEN SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 1, 2) = '55'
          AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) >= 12
          THEN SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 3, 2)
        ELSE SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 1, 2)
      END
      WHERE (telefone IS NOT NULL AND telefone != '') OR (whatsapp IS NOT NULL AND whatsapp != '')
    `)
      .execute()

    // 2. Recalcular ATACADO fora do mapa:
    // Larissa Terra: 11, 12, 13
    // Julio Melo: 15, 19
    // Wilson Neto: 14, 16, 17, 18
    // Total mapa atendido: '11','12','13','14','15','16','17','18','19'
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'atacado_fora_mapa'
      WHERE regiao = 'ATACADO'
        AND (
          ddd_telefone IS NULL
          OR ddd_telefone = ''
          OR ddd_telefone NOT IN ('11', '12', '13', '14', '15', '16', '17', '18', '19')
        )
    `)
      .execute()

    // Se estiver no mapa do Atacado e tiver sido classificado antes como atacado_fora_mapa, volta para normal (ou cliente_final se aplicável)
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'normal'
      WHERE regiao = 'ATACADO'
        AND base_categoria = 'atacado_fora_mapa'
        AND ddd_telefone IN ('11', '12', '13', '14', '15', '16', '17', '18', '19')
    `)
      .execute()
  },
  (app) => {},
)
