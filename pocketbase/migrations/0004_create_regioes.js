migrate(
  (app) => {
    // 1. Criar coleção 'regioes'
    const regioesCol = new Collection({
      name: 'regioes',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.role = "admin" || @request.auth.role = "supervisor"',
      updateRule: '@request.auth.role = "admin" || @request.auth.role = "supervisor"',
      deleteRule: '@request.auth.role = "admin"',
      fields: [
        { name: 'nome', type: 'text', required: true },
        { name: 'ordem', type: 'number' },
        { name: 'ativo', type: 'bool' },
        { name: 'vendedor_externo', type: 'text' },
        { name: 'especialista', type: 'text' },
        { name: 'corporativo', type: 'text' },
        { name: 'construcao_civil', type: 'text' },
        { name: 'cidades_rota', type: 'json' },
        { name: 'municipios_potenciais', type: 'text' },
        { name: 'observacao', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_regioes_nome ON regioes (nome)',
        'CREATE INDEX idx_regioes_ordem ON regioes (ordem)',
      ],
    })
    app.save(regioesCol)

    const OBS_DDD =
      'as cidades do atacado são uma referência comercial das principais praças de cada DDD; a cobertura de cada DDD é mais ampla.'

    // 2. Semear as 8 Regiões oficiais
    const dadosRegioes = [
      {
        nome: 'BRAGANÇA',
        ordem: 1,
        ativo: true,
        vendedor_externo: 'ALESSANDRO',
        especialista: 'LEIZ',
        corporativo: 'HELOA',
        construcao_civil: '',
        cidades_rota: [
          'ATIBAIA',
          'PIRACAIA',
          'BOM JESUS DOS PERDÕES',
          'JOANÓPOLIS',
          'VARGEM',
          'NAZARÉ PAULISTA',
          'MAIRIPORÃ',
        ],
        municipios_potenciais:
          'ATIBAIA, PIRACAIA, BOM JESUS DOS PERDÕES, JOANÓPOLIS, VARGEM, NAZARÉ PAULISTA, MAIRIPORÃ, BRAGANÇA PAULISTA, JARINU, PINHALZINHO, PEDRA BELA, MORUNGABA, AMPARO, MONTE ALEGRE DO SUL, SERRA NEGRA, ITATIBA, TUPI PAULISTA, FRANCO DA ROCHA, CAIEIRAS — LIMÍTROFE — SOCORRO, PEDREIRA, JUQUITIBA',
        observacao: OBS_DDD,
      },
      {
        nome: 'JUNDIAÍ',
        ordem: 2,
        ativo: true,
        vendedor_externo: 'DYOVANA',
        especialista: 'JOSIANE FRAZÃO',
        corporativo: 'KAYLANE',
        construcao_civil: '',
        cidades_rota: [
          'ITATIBA',
          'JARINU',
          'VÁRZEA PAULISTA',
          'CAMPO LIMPO',
          'ITUPEVA',
          'CAJAMAR',
          'VINHEDO',
        ],
        municipios_potenciais:
          'ITATIBA, JARINU, VÁRZEA PAULISTA, CAMPO LIMPO PAULISTA, ITUPEVA, CAJAMAR, VINHEDO, JUNDIAÍ, CABREÚVA, VALINHOS, LOUVEIRA, INDAIATUBA, SALTO, ITU, MORUNGABA, CAMPINAS, SUMARÉ, HORTOLÂNDIA, MONTE MOR, PAULÍNIA — LIMÍTROFE — FRANCISCO MORATO, FRANCO DA ROCHA, PIRAPORA DO BOM JESUS',
        observacao: OBS_DDD,
      },
      {
        nome: 'VARGINHA',
        ordem: 3,
        ativo: true,
        vendedor_externo: 'PETERSON',
        especialista: 'BRUNA',
        corporativo: 'THAIS',
        construcao_civil: '',
        cidades_rota: [
          'TRÊS PONTAS',
          'TRÊS CORAÇÕES',
          'ELÓI MENDES',
          'PARAGUAÇU',
          'MONSENHOR PAULO',
          'CAMPANHA',
          'CAMBUQUIRA',
        ],
        municipios_potenciais:
          'TRÊS PONTAS, TRÊS CORAÇÕES, ELÓI MENDES, PARAGUAÇU, MONSENHOR PAULO, CAMPANHA, CAMBUQUIRA, VARGINHA, BOA ESPERANÇA, COQUEIRAL, SANTANA DA VARGEM, NEPOMUCENO, LAVRAS, PERDÕES, CARMO DA CACHOEIRA, SÃO BENTO ABADE, SÃO THOMÉ DAS LETRAS, LUMINÁRIAS, INGAÍ, ITUMIRIM, IBITURUNA, CRISTAIS, GUAPÉ, ILICÍNEA, ALFENAS, MACHADO, CONGONHAL — LIMÍTROFE — LAMBARI, SÃO GONÇALO DO SAPUCAÍ, HELIODORA',
        observacao: OBS_DDD,
      },
      {
        nome: 'POUSO ALEGRE',
        ordem: 4,
        ativo: true,
        vendedor_externo: 'PAOLA',
        especialista: 'RAFAELA',
        corporativo: 'VITORIA',
        construcao_civil: '',
        cidades_rota: [
          'JACUTINGA',
          'BORDA DA MATA',
          'BUENO BRANDÃO',
          'LAMBARI',
          'CAXAMBU',
          'SÃO LOURENÇO',
          'SÃO SEBASTIÃO DA BELA VISTA',
          'SÃO GONÇALO DO SAPUCAÍ',
          'CAREAÇU',
          'COQUEIRAL',
          'SANTANA DA VARGEM',
        ],
        municipios_potenciais:
          'JACUTINGA, BORDA DA MATA, BUENO BRANDÃO, LAMBARI, CAXAMBU, SÃO LOURENÇO, SÃO SEBASTIÃO DA BELA VISTA, SÃO GONÇALO DO SAPUCAÍ, CAREAÇU, COQUEIRAL, SANTANA DA VARGEM, POUSO ALEGRE, SANTA RITA DO SAPUCAÍ, OURO FINO, MONTE SIÃO, INCONFIDENTES, TOCOS DO MOJI, BOM REPOUSO, ESTIVA, SILVIANÓPOLIS, TURVOLÂNDIA, SÃO JOÃO DA MATA, ESPÍRITO SANTO DO DOURADO, CONGONHAL, NATÉRCIA, HELIODORA, JESUÂNIA, OLÍMPIO NORONHA, CONCEIÇÃO DO RIO VERDE, SOLEDADE DE MINAS, BAEPENDI, POUSO ALTO, ITAMONTE, ITAQUARA, PASSA QUATRO — LIMÍTROFE — ITATIAIA, RESENDE, CRUZEIRO, LORENA',
        observacao: OBS_DDD,
      },
      {
        nome: 'POÇOS DE CALDAS',
        ordem: 5,
        ativo: true,
        vendedor_externo: 'JOSÉ FELIPE',
        especialista: 'MILENA',
        corporativo: 'CAMILA GUIMENTI',
        construcao_civil: '',
        cidades_rota: [
          'ALFENAS',
          'MACHADO',
          'CALDAS',
          'SANTA RITA DE CALDAS',
          'CONGONHAL',
          'POÇO FUNDO',
          'SILVIANÓPOLIS',
          'NATÉRCIA',
          'HELIODORA',
          'OURO FINO',
          'BAEPENDI',
          'CARMO DE MINAS',
          'MONTE SIÃO',
          'INCONFIDENTES',
          'CONCEIÇÃO DO RIO VERDE',
        ],
        municipios_potenciais:
          'ALFENAS, MACHADO, CALDAS, SANTA RITA DE CALDAS, CONGONHAL, POÇO FUNDO, SILVIANÓPOLIS, NATÉRCIA, HELIODORA, OURO FINO, BAEPENDI, CARMO DE MINAS, MONTE SIÃO, INCONFIDENTES, CONCEIÇÃO DO RIO VERDE, POÇOS DE CALDAS, ANDRADAS, IPUÍUNA, IBITIÚRA DE MINAS, BANDEIRA DO SUL, CAMPESTRE, BOTELHOS, CABO VERDE, DIVISA NOVA, SERRANIA, AREADO, ALTEROSA, MONTE BELO, JURUAIA, GUAXUPÉ, MUZAMBINHO, CACONDE, TAPIRATIBA, SÃO JOSÉ DO RIO PARDO, AGUAÍ, SÃO JOÃO DA BOA VISTA, ESPÍRITO SANTO DO PINHAL, SANTO ANTÔNIO DO JARDIM — LIMÍTROFE — VARGEM GRANDE DO SUL, CASA BRANCA, MOCOCA',
        observacao: OBS_DDD,
      },
      {
        nome: 'ITAJUBÁ',
        ordem: 6,
        ativo: true,
        vendedor_externo: 'JENNIFER',
        especialista: 'GABRIELA',
        corporativo: 'JESSICA.S',
        construcao_civil: '',
        cidades_rota: [
          'SANTA RITA SAPUCAÍ',
          'PIRANGUINHO',
          'MARIA DA FÉ',
          'PEDRALVA',
          'VIRGÍNIA',
          'DELFIM MOREIRA',
          'GONÇALVES',
          'FAMA',
          'ANDRADAS',
          'IPUIÚNA',
          'CAMPOS GERAIS',
          'IBITIURA',
        ],
        municipios_potenciais:
          'SANTA RITA SAPUCAÍ, PIRANGUINHO, MARIA DA FÉ, PEDRALVA, VIRGÍNIA, DELFIM MOREIRA, GONÇALVES, FAMA, ANDRADAS, IPUIÚNA, CAMPOS GERAIS, IBITIURA, ITAJUBÁ, PIRANGUÇU, WENCESLAU BRAZ, BRASÓPOLIS, PARAISÓPOLIS, SÃO JOSÉ DO ALEGRE, CRISTINA, DOM VIÇOSO, CARMO DE MINAS, SÃO LOURENÇO, POUSO ALTO, ITANHANDU, PASSA QUATRO, MARMELÓPOLIS — LIMÍTROFE — CAMPOS DO JORDÃO, SANTO ANTÔNIO DO PINHAL, SÃO BENTO DO SAPUCAÍ, PIQUETE, GUARATINGUETÁ, APARECIDA',
        observacao: OBS_DDD,
      },
      {
        nome: 'EXTREMA',
        ordem: 7,
        ativo: true,
        vendedor_externo: 'GUSTAVO',
        especialista: 'INAYARA',
        corporativo: 'TAINARA',
        construcao_civil: '',
        cidades_rota: [
          'TOLEDO',
          'MUNHOZ',
          'PEDRA BELA',
          'PINHALZINHO',
          'SOCORRO',
          'SERRA NEGRA',
          'SAPUCAÍ MIRIM',
          'SÃO BENTO DO SAPUCAÍ',
          'CONCEIÇÃO DOS OUROS',
          'CACHOEIRA DE MINAS',
          'BRASÓPOLIS',
          'PARAÍSOPOLIS',
          'SÃO JOSÉ DO ALEGRE',
          'CONSOLAÇÃO',
        ],
        municipios_potenciais:
          'TOLEDO, MUNHOZ, PEDRA BELA, PINHALZINHO, SOCORRO, SERRA NEGRA, SAPUCAÍ MIRIM, SÃO BENTO DO SAPUCAÍ, CONCEIÇÃO DOS OUROS, CACHOEIRA DE MINAS, BRASÓPOLIS, PARAÍSOPOLIS, SÃO JOSÉ DO ALEGRE, CONSOLAÇÃO, EXTREMA, ITAPEVA, CAMANDUCAIA, CAMBUÍ, VARGEM, JOANÓPOLIS, PIRACAIA, BRAGANÇA PAULISTA, ÁGUAS DE LINDÓIA, LINDÓIA, ITAPIRA, MONTE SIÃO, BUENO BRANDÃO — LIMÍTROFE — AMPARO, PEDREIRA, JAGUARIÚNA, HOLAMBRA, SANTO ANTÔNIO DE POSSE',
        observacao: OBS_DDD,
      },
      {
        nome: 'CAMBUÍ',
        ordem: 8,
        ativo: true,
        vendedor_externo: 'JULIANO',
        especialista: 'EDMILA',
        corporativo: 'MATHEUS TEIXEIRA',
        construcao_civil: 'ARIANE', // ARIANE aparece na última posição; região a confirmar e editável
        cidades_rota: [
          'BOM REPOUSO',
          'SENADOR',
          'ESTIVA',
          'CAMANDUCAIA',
          'ITAPEVA',
          'CÓRREGO DO BOM JESUS',
        ],
        municipios_potenciais:
          'BOM REPOUSO, SENADOR AMARAL, SENADOR CÔRTES, ESTIVA, CAMANDUCAIA, ITAPEVA, CÓRREGO DO BOM JESUS, CAMBUÍ, MONTE VERDE, TOLEDO, EXTREMA, MUNHOZ, BUENO BRANDÃO, BORDA DA MATA, TOCOS DO MOJI, POUSO ALEGRE, CONGONHAL, IPUÍUNA, SANTA RITA DO SAPUCAÍ, CONSOLAÇÃO, PARAISÓPOLIS, SÃO BENTO DO SAPUCAÍ, SAPUCAÍ-MIRIM — LIMÍTROFE — GONÇALVES, CAMPOS DO JORDÃO, JOANÓPOLIS, VARGEM',
        observacao: OBS_DDD,
      },
    ]

    for (const r of dadosRegioes) {
      try {
        app.findFirstRecordByData('regioes', 'nome', r.nome)
      } catch (_) {
        const rec = new Record(regioesCol)
        rec.set('nome', r.nome)
        rec.set('ordem', r.ordem)
        rec.set('ativo', r.ativo)
        rec.set('vendedor_externo', r.vendedor_externo)
        rec.set('especialista', r.especialista)
        rec.set('corporativo', r.corporativo)
        rec.set('construcao_civil', r.construcao_civil)
        rec.set('cidades_rota', r.cidades_rota)
        rec.set('municipios_potenciais', r.municipios_potenciais)
        rec.set('observacao', r.observacao)
        app.save(rec)
      }
    }

    // 3. Atualizar os usuários de demonstração para usar as novas regiões oficiais
    // Admin: todas as 8 regiões
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

    try {
      const admin = app.findAuthRecordByEmail('_pb_users_auth_', 'pietra.leite@grupoabr.com.br')
      admin.set('regioes', todasRegioesNomes)
      app.save(admin)
    } catch (_) {}

    // Supervisor: POÇOS DE CALDAS, POUSO ALEGRE, VARGINHA
    try {
      const sup = app.findAuthRecordByEmail('_pb_users_auth_', 'supervisor@guerra.com.br')
      sup.set('regioes', ['POÇOS DE CALDAS', 'POUSO ALEGRE', 'VARGINHA'])
      app.save(sup)
    } catch (_) {}

    // Operador 1: POÇOS DE CALDAS (conforme instrução 7 do task)
    try {
      const op = app.findAuthRecordByEmail('_pb_users_auth_', 'operador1@guerra.com.br')
      op.set('regioes', ['POÇOS DE CALDAS'])
      app.save(op)
    } catch (_) {}

    // 4. Atualizar os 5 clientes de amostra para pertencerem a regiões reais
    const sampleUpdates = [
      { codigo: 'C001021', regiao: 'POÇOS DE CALDAS', vendedor: 'JOSÉ FELIPE' },
      { codigo: 'C001022', regiao: 'POUSO ALEGRE', vendedor: 'PAOLA' },
      { codigo: 'C001023', regiao: 'BRAGANÇA', vendedor: 'ALESSANDRO' },
      { codigo: 'C001024', regiao: 'JUNDIAÍ', vendedor: 'DYOVANA' },
      { codigo: 'C001025', regiao: 'VARGINHA', vendedor: 'PETERSON' },
    ]

    for (const s of sampleUpdates) {
      try {
        const cRec = app.findFirstRecordByData('clientes', 'codigo', s.codigo)
        cRec.set('regiao', s.regiao)
        cRec.set('vendedor', s.vendedor)
        app.save(cRec)
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('regioes')
      app.delete(col)
    } catch (_) {}
  },
)
