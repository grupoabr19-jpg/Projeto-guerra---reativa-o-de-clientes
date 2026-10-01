migrate(
  (app) => {
    // 1. Adicionar campos na coleção 'clientes' se ainda não existirem:
    // - base_categoria: select('normal', 'cliente_final', 'atacado_fora_mapa')
    // - sem_dono_equipe: bool
    // - ddd_telefone: text
    const clientes = app.findCollectionByNameOrId('clientes')

    if (!clientes.fields.getByName('base_categoria')) {
      clientes.fields.add(
        new SelectField({
          name: 'base_categoria',
          values: ['normal', 'cliente_final', 'atacado_fora_mapa'],
          maxSelect: 1,
        }),
      )
    }

    if (!clientes.fields.getByName('sem_dono_equipe')) {
      clientes.fields.add(
        new BoolField({
          name: 'sem_dono_equipe',
        }),
      )
    }

    if (!clientes.fields.getByName('ddd_telefone')) {
      clientes.fields.add(
        new TextField({
          name: 'ddd_telefone',
        }),
      )
    }

    clientes.addIndex('idx_clientes_base_categoria', false, 'base_categoria', '')
    clientes.addIndex('idx_clientes_sem_dono_equipe', false, 'sem_dono_equipe', '')
    clientes.addIndex('idx_clientes_ddd_telefone', false, 'ddd_telefone', '')

    app.save(clientes)

    // 2. Migração de dados Frente 1:
    // Todos os clientes cujo campo canal = 'ATACADO' passam para a região 'ATACADO'
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET regiao = 'ATACADO'
      WHERE UPPER(TRIM(canal)) = 'ATACADO'
    `)
      .execute()

    // 3. Atualizar ddd_telefone a partir de telefone / whatsapp
    // Extrai os 2 primeiros dígitos do telefone limpo
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET ddd_telefone = SUBSTR(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(NULLIF(telefone, ''), whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''),
        1, 2
      )
      WHERE (telefone IS NOT NULL AND telefone != '') OR (whatsapp IS NOT NULL AND whatsapp != '')
    `)
      .execute()

    // 4. Marcar clientes ATACADO fora do mapa:
    // Larissa Terra: 11, 12, 13
    // Julio Melo: 15, 19
    // Wilson Neto: 14, 16, 17, 18
    // Se regiao = 'ATACADO' e ddd NÃO estiver em ('11','12','13','14','15','16','17','18','19') -> base_categoria = 'atacado_fora_mapa'
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

    // 5. Migrar clientes já fechados com desfecho 'cliente_final' para base_categoria = 'cliente_final'
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'cliente_final'
      WHERE motivo_ativo_fora_base LIKE '%cliente_final%'
         OR motivo_ativo_fora_base LIKE '%Cliente final%'
         OR motivo_ativo_fora_base LIKE '%uso pessoal%'
    `)
      .execute()

    // 6. Base Cliente Final inicial para clientes com documento CPF ou sem documento e <= 2 compras
    // CPF limpo tem 11 dígitos, ou cpf_cnpj é vazio/nulo (documento não identificado)
    // compras_count <= 2 ou valor_historico <= 2 compras
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'cliente_final'
      WHERE (base_categoria IS NULL OR base_categoria = '' OR base_categoria = 'normal')
        AND (
          LENGTH(REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '-', ''), '/', '')) = 11
          OR cpf_cnpj IS NULL
          OR TRIM(cpf_cnpj) = ''
        )
        AND COALESCE(compras_count, 1) <= 2
        AND (
          dias_sem_faturar <= 730
          OR dias_sem_faturar IS NULL
          OR dias_sem_faturar = 0
          OR (compras_count <= 2 AND (faixa = '60_89' OR faixa = 'recente' OR dias_sem_faturar <= 730))
        )
    `)
      .execute()

    // 7. Identificar e marcar clientes órfãos cujo vendedor de origem não está mais na equipe
    // Vendedores ativos na equipe comercial/rotas:
    // ALESSANDRO, LEIZ, HELOA, DYOVANA, JOSIANE, KAYLANE, PETERSON, BRUNA, THAIS,
    // PAOLA, VITORIA, JOSÉ FELIPE, MILENA, CAMILA, JENNIFER, GABRIELA, JESSICA,
    // GUSTAVO, INAYARA, TAINARA, JULIANO, EDMILA, ARIANE, MATHEUS, JULIO, LARISSA, WILSON
    // Exemplo de órfão clássico: RAFAELA
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET sem_dono_equipe = 1
      WHERE regiao != 'ATACADO'
        AND regiao != 'REPESCAGEM'
        AND (
          UPPER(COALESCE(vendedor, '')) LIKE '%RAFAELA%'
          OR (
            vendedor IS NOT NULL
            AND TRIM(vendedor) != ''
            AND UPPER(vendedor) NOT LIKE '%ALESSANDRO%'
            AND UPPER(vendedor) NOT LIKE '%LEIZ%'
            AND UPPER(vendedor) NOT LIKE '%HELOA%'
            AND UPPER(vendedor) NOT LIKE '%DYOVANA%'
            AND UPPER(vendedor) NOT LIKE '%JOSIANE%'
            AND UPPER(vendedor) NOT LIKE '%KAYLANE%'
            AND UPPER(vendedor) NOT LIKE '%PETERSON%'
            AND UPPER(vendedor) NOT LIKE '%BRUNA%'
            AND UPPER(vendedor) NOT LIKE '%THAIS%'
            AND UPPER(vendedor) NOT LIKE '%PAOLA%'
            AND UPPER(vendedor) NOT LIKE '%VITORIA%'
            AND UPPER(vendedor) NOT LIKE '%JOSE%'
            AND UPPER(vendedor) NOT LIKE '%JOSÉ%'
            AND UPPER(vendedor) NOT LIKE '%FELIPE%'
            AND UPPER(vendedor) NOT LIKE '%MILENA%'
            AND UPPER(vendedor) NOT LIKE '%CAMILA%'
            AND UPPER(vendedor) NOT LIKE '%JENNIFER%'
            AND UPPER(vendedor) NOT LIKE '%GABRIELA%'
            AND UPPER(vendedor) NOT LIKE '%JESSICA%'
            AND UPPER(vendedor) NOT LIKE '%JÉSSICA%'
            AND UPPER(vendedor) NOT LIKE '%GUSTAVO%'
            AND UPPER(vendedor) NOT LIKE '%INAYARA%'
            AND UPPER(vendedor) NOT LIKE '%TAINARA%'
            AND UPPER(vendedor) NOT LIKE '%JULIANO%'
            AND UPPER(vendedor) NOT LIKE '%EDMILA%'
            AND UPPER(vendedor) NOT LIKE '%ARIANE%'
            AND UPPER(vendedor) NOT LIKE '%MATHEUS%'
            AND UPPER(vendedor) NOT LIKE '%JULIO%'
            AND UPPER(vendedor) NOT LIKE '%LARISSA%'
            AND UPPER(vendedor) NOT LIKE '%WILSON%'
            AND UPPER(vendedor) NOT LIKE '%PRISCILA%'
          )
        )
    `)
      .execute()

    // Para os demais que não entraram nas categorias especiais, garantir 'normal'
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'normal'
      WHERE base_categoria IS NULL OR base_categoria = ''
    `)
      .execute()
  },
  (app) => {
    const clientes = app.findCollectionByNameOrId('clientes')
    try {
      clientes.removeIndex('idx_clientes_base_categoria')
    } catch (_) {}
    try {
      clientes.removeIndex('idx_clientes_sem_dono_equipe')
    } catch (_) {}
    try {
      clientes.removeIndex('idx_clientes_ddd_telefone')
    } catch (_) {}

    const f1 = clientes.fields.getByName('base_categoria')
    if (f1) clientes.fields.removeByName('base_categoria')
    const f2 = clientes.fields.getByName('sem_dono_equipe')
    if (f2) clientes.fields.removeByName('sem_dono_equipe')
    const f3 = clientes.fields.getByName('ddd_telefone')
    if (f3) clientes.fields.removeByName('ddd_telefone')

    app.save(clientes)
  },
)
