/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Cria coleção cidades_rotas (se ainda não existir)
    let collection
    try {
      collection = app.findCollectionByNameOrId('cidades_rotas')
    } catch (_) {
      collection = new Collection({
        name: 'cidades_rotas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.role = 'admin'",
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          { name: 'cidade', type: 'text', required: true },
          { name: 'cidade_normalizada', type: 'text', required: true },
          { name: 'uf', type: 'text', required: false },
          { name: 'rota', type: 'text', required: true },
          { name: 'polo', type: 'text', required: false },
          { name: 'eh_divisa', type: 'bool', required: false },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'observacao', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_cidades_rotas_cid_norm ON cidades_rotas (cidade_normalizada)',
          'CREATE INDEX idx_cidades_rotas_rota ON cidades_rotas (rota)',
        ],
      })
      app.save(collection)
    }

    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    // Lista de mapeamento de cidades por Rota
    // Rota BRAGANÇA (operadores: ALESSANDRO, LEIZ, HELOA)
    // Cidades verbatim: BRAGANÇA, ATIBAIA, PIRACAIA, BOM JESUS DOS PERDÕES, JOANOPOLIS, VARGEM, NAZARÉ PAULISTA, MARIPORÃ
    // Cidades de divisa / limítrofes da região Bragantina: JARINU, PINHALZINHO, PEDRA BELA, MORUNGABA, AMPARO, MONTE ALEGRE DO SUL, TUIUTI, ITATIBA
    const cidadesBraganca = [
      {
        cidade: 'BRAGANÇA PAULISTA',
        uf: 'SP',
        rota: 'BRAGANÇA',
        polo: 'BRAGANÇA',
        eh_divisa: false,
      },
      { cidade: 'BRAGANCA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'ATIBAIA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'PIRACAIA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      {
        cidade: 'BOM JESUS DOS PERDÕES',
        uf: 'SP',
        rota: 'BRAGANÇA',
        polo: 'BRAGANÇA',
        eh_divisa: false,
      },
      { cidade: 'JOANOPOLIS', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'JOANÓPOLIS', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'VARGEM', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'NAZARÉ PAULISTA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'NAZARE PAULISTA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'MARIPORÃ', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'MAIRIPORÃ', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      { cidade: 'MAIRIPORA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: false },
      // Divisas da rota Bragança
      { cidade: 'TUIUTI', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: true },
      { cidade: 'MORUNGABA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: true },
      {
        cidade: 'MONTE ALEGRE DO SUL',
        uf: 'SP',
        rota: 'BRAGANÇA',
        polo: 'BRAGANÇA',
        eh_divisa: true,
      },
      { cidade: 'IGARATÁ', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: true },
      { cidade: 'IGARATA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA', eh_divisa: true },
    ]

    // Rota JUNDIAÍ (operadores: DYOVANA, JOSIANE FRAZÃO, KAYLANE)
    // Cidades verbatim: JUNDIAÍ, ITATIBA, JARINU, VÁRZEA PAULISTA, CAMPO LIMPO, ITUPEVA, CAJAMAR, VINHEDO
    // Divisas: LOUVEIRA, CABREÚVA, VALINHOS, INDAIATUBA, FRANCISCO MORATO, FRANCO DA ROCHA, PIRAPORA DO BOM JESUS, ITAPECERICA
    const cidadesJundiai = [
      { cidade: 'JUNDIAÍ', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'JUNDIAI', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'ITATIBA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'JARINU', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'VÁRZEA PAULISTA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'VARZEA PAULISTA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      {
        cidade: 'CAMPO LIMPO PAULISTA',
        uf: 'SP',
        rota: 'JUNDIAÍ',
        polo: 'JUNDIAÍ',
        eh_divisa: false,
      },
      { cidade: 'CAMPO LIMPO', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'ITUPEVA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'CAJAMAR', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      { cidade: 'VINHEDO', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: false },
      // Divisas da rota Jundiaí
      { cidade: 'LOUVEIRA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'CABREÚVA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'CABREUVA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'VALINHOS', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'INDAIATUBA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'FRANCISCO MORATO', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      { cidade: 'FRANCO DA ROCHA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ', eh_divisa: true },
      {
        cidade: 'PIRAPORA DO BOM JESUS',
        uf: 'SP',
        rota: 'JUNDIAÍ',
        polo: 'JUNDIAÍ',
        eh_divisa: true,
      },
      {
        cidade: 'SANTANA DE PARNAÍBA',
        uf: 'SP',
        rota: 'JUNDIAÍ',
        polo: 'JUNDIAÍ',
        eh_divisa: true,
      },
      {
        cidade: 'SANTANA DE PARNAIBA',
        uf: 'SP',
        rota: 'JUNDIAÍ',
        polo: 'JUNDIAÍ',
        eh_divisa: true,
      },
    ]

    // Rota VARGINHA (operadores: PETERSON, BRUNA, THAIS)
    // Cidades verbatim: VARGINHA, TRÊS PONTAS, TRÊS CORAÇÕES, ELOI MENDES, PARAGUAÇU, MONSENHOR PAULO, CAMPANHA, CAMBUQUIRA, SÃO GONÇALO, CAREAÇU, COQUEIRAL, SANTANA DA VARGEM
    // Divisas: BOA ESPERANÇA, NEPOMUCENO, CARMO DA CACHOEIRA, SÃO BENTO ABADE, CORDEISLÂNDIA, SÃO TOMÉ DAS LETRAS, LAMBARI, CONCEIÇÃO DO RIO VERDE
    const cidadesVarginha = [
      { cidade: 'VARGINHA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'TRÊS PONTAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'TRES PONTAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'TRÊS CORAÇÕES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'TRES CORACOES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'ELÓI MENDES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'ELOI MENDES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'PARAGUAÇU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'PARAGUACU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'MONSENHOR PAULO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'CAMPANHA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'CAMBUQUIRA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      {
        cidade: 'SÃO GONÇALO DO SAPUCAÍ',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: false,
      },
      {
        cidade: 'SAO GONCALO DO SAPUCAI',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: false,
      },
      { cidade: 'SÃO GONÇALO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'SAO GONCALO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'CAREAÇU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'CAREACU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      { cidade: 'COQUEIRAL', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: false },
      {
        cidade: 'SANTANA DA VARGEM',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: false,
      },
      // Divisas da rota Varginha
      { cidade: 'BOA ESPERANÇA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'BOA ESPERANCA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'NEPOMUCENO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      {
        cidade: 'CARMO DA CACHOEIRA',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: true,
      },
      { cidade: 'SÃO BENTO ABADE', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'SAO BENTO ABADE', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'CORDEISLÂNDIA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'CORDEISLANDIA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      {
        cidade: 'SÃO TOMÉ DAS LETRAS',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: true,
      },
      {
        cidade: 'SAO TOME DAS LETRAS',
        uf: 'MG',
        rota: 'VARGINHA',
        polo: 'VARGINHA',
        eh_divisa: true,
      },
      { cidade: 'LUMINÁRIAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
      { cidade: 'LUMINARIAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA', eh_divisa: true },
    ]

    // Rota POUSO ALEGRE (operadores: PAOLA, RAFAELA, VITORIA)
    // Cidades verbatim: POUSO ALEGRE, JACUTINGA, BORDA DA MATA, BUENO BRANDÃO, LAMBARI, CAXAMBU, SÃO LOURENÇO, SÃO SEBASTIÃO DA BELA VISTA, NATÉRCIA, HELIODORA, OURO FINO, BAEPENDI, CARMO DE MINAS, MONTE SIÃO, INCONFIDENTES, CONCEIÇÃO DO RIO VERDE
    // Divisas: ITANHANDU, POUSO ALTO, PASSA QUATRO, VIRGÍNIA, DOM VIÇOSO, SOLEDADE DE MINAS, SANTA RITA DE CALDAS, IPUIÚNA, TURVOLÂNDIA, ESPÍRITO SANTO DO DOURADO, SILVIANÓPOLIS, CONGONHAL, ESTIVA, CAMBUÍ, TOCOS DO MOJI
    const cidadesPousoAlegre = [
      {
        cidade: 'POUSO ALEGRE',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'JACUTINGA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'BORDA DA MATA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'BUENO BRANDÃO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'BUENO BRANDAO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      { cidade: 'LAMBARI', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: false },
      { cidade: 'CAXAMBU', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: false },
      {
        cidade: 'SÃO LOURENÇO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'SAO LOURENCO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'SÃO SEBASTIÃO DA BELA VISTA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'SAO SEBASTIAO DA BELA VISTA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'NATÉRCIA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'NATERCIA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'HELIODORA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'OURO FINO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'BAEPENDI',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'CARMO DE MINAS',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'MONTE SIÃO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'MONTE SIAO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'INCONFIDENTES',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'CONCEIÇÃO DO RIO VERDE',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      {
        cidade: 'CONCEICAO DO RIO VERDE',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: false,
      },
      // Divisas da rota Pouso Alegre
      {
        cidade: 'TURVOLÂNDIA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'TURVOLANDIA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'ESPÍRITO SANTO DO DOURADO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'ESPIRITO SANTO DO DOURADO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'TOCOS DO MOJI',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      { cidade: 'JESUÂNIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: true },
      { cidade: 'JESUANIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: true },
      {
        cidade: 'SOLEDADE DE MINAS',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'POUSO ALTO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'ITANHANDU',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      { cidade: 'CRUZÍLIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: true },
      { cidade: 'CRUZILIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE', eh_divisa: true },
      {
        cidade: 'DOM VIÇOSO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
      {
        cidade: 'DOM VICOSO',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
        eh_divisa: true,
      },
    ]

    // Rota POÇOS DE CALDAS (operadores: JOSÉ FELIPE, MILENA, CAMILA GUIMENTI)
    // Cidades verbatim: POÇOS DE CALDAS, ALFENAS, MACHADO, CALDAS, SANTA RITA DE CALDAS, CONGONHAL, POÇO FUNDO, SILVIANÓPOLIS, FAMA, ANDRADAS, IPUIÚNA, CAMPOS GERAIS, IBITIURA
    // Divisas: BANDEIRA DO SUL, BOTELHOS, CABO VERDE, AREADO, ALTEROSA, CARVALHÓPOLIS, CAMPINAS VERDE, DIVINOLÂNDIA, SÃO SEBASTIÃO DA GRAMA, AGUAÍ, SÃO JOÃO DA BOA VISTA, SANTO ANTÔNIO DO JARDIM
    const cidadesPocosDeCaldas = [
      {
        cidade: 'POÇOS DE CALDAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'POCOS DE CALDAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'ALFENAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'MACHADO',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'CALDAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'SANTA RITA DE CALDAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'CONGONHAL',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'POÇO FUNDO',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'POCO FUNDO',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'SILVIANÓPOLIS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'SILVIANOPOLIS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'FAMA',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'ANDRADAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'IPUIÚNA',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'IPUIUNA',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'CAMPOS GERAIS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'IBITIÚRA DE MINAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'IBITIURA DE MINAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      {
        cidade: 'IBITIURA',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: false,
      },
      // Divisas da rota Poços de Caldas
      {
        cidade: 'BANDEIRA DO SUL',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'BOTELHOS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'CABO VERDE',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'AREADO',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'ALTEROSA',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'CARVALHÓPOLIS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'CARVALHOPOLIS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'DIVINOLÂNDIA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'DIVINOLANDIA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SÃO SEBASTIÃO DA GRAMA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SAO SEBASTIAO DA GRAMA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SÃO JOÃO DA BOA VISTA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SAO JOAO DA BOA VISTA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SANTO ANTÔNIO DO JARDIM',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'SANTO ANTONIO DO JARDIM',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'AGUAÍ',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'AGUAI',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'ÁGUAS DA PRATA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
      {
        cidade: 'AGUAS DA PRATA',
        uf: 'SP',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
        eh_divisa: true,
      },
    ]

    // Rota ITAJUBÁ (operadores: JENNIFER, GABRIELA, JESSICA.S)
    // Cidades verbatim: ITAJUBÁ, SANTA RITA SAPUCAÍ, PIRANGUINHO, MARIA DA FÉ, PEDRALVA, VIRGÍNIA, DELFIM MOREIRA, GONÇALVES, SAPUCAÍ MIRIM, SÃO BENTO, CONCEIÇÃO DOS OUROS, CACHOEIRA DE MINAS, BRASOPOLIS, PARAISOPOLIS, SÃO JOSÉ DO ALEGRE, CONSOLAÇÃO
    // Divisas: PIRANGUÇU, WENCESLAU BRAZ, MARMELÓPOLIS, CRISTINA, ITAMONTE, PASSA QUATRO, SANTO ANTÔNIO DO PINHAL, CAMPOS DO JORDÃO
    const cidadesItajuba = [
      { cidade: 'ITAJUBÁ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'ITAJUBA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      {
        cidade: 'SANTA RITA DO SAPUCAÍ',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'SANTA RITA DO SAPUCAI',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'SANTA RITA SAPUCAÍ',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'SANTA RITA SAPUCAI',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      { cidade: 'PIRANGUINHO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'MARIA DA FÉ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'MARIA DA FE', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'PEDRALVA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'VIRGÍNIA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'VIRGINIA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'DELFIM MOREIRA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'GONÇALVES', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'GONCALVES', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'SAPUCAÍ-MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'SAPUCAÍ MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'SAPUCAI MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      {
        cidade: 'SÃO BENTO DO SAPUCAÍ',
        uf: 'SP',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'SAO BENTO DO SAPUCAI',
        uf: 'SP',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      { cidade: 'SÃO BENTO', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      {
        cidade: 'CONCEIÇÃO DOS OUROS',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'CONCEICAO DOS OUROS',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'CACHOEIRA DE MINAS',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      { cidade: 'BRASÓPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'BRASOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'BRAZÓPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'BRAZOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'PARAÍSOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'PARAISOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      {
        cidade: 'SÃO JOSÉ DO ALEGRE',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      {
        cidade: 'SAO JOSE DO ALEGRE',
        uf: 'MG',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: false,
      },
      { cidade: 'CONSOLAÇÃO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      { cidade: 'CONSOLACAO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: false },
      // Divisas da rota Itajubá
      { cidade: 'PIRANGUÇU', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'PIRANGUCU', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'WENCESLAU BRAZ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'MARMELÓPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'MARMELOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'CRISTINA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'ITAMONTE', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      {
        cidade: 'SANTO ANTÔNIO DO PINHAL',
        uf: 'SP',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: true,
      },
      {
        cidade: 'SANTO ANTONIO DO PINHAL',
        uf: 'SP',
        rota: 'ITAJUBÁ',
        polo: 'ITAJUBÁ',
        eh_divisa: true,
      },
      { cidade: 'CAMPOS DO JORDÃO', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
      { cidade: 'CAMPOS DO JORDAO', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ', eh_divisa: true },
    ]

    // Rota EXTREMA (operadores: GUSTAVO, INAYARA, TAINARA)
    // Cidades verbatim: EXTREMA, TOLEDO, MUNHOZ, PEDRA BELA, PINHALZINHO, SOCORRO, SERRA NEGRA
    // Divisas: ÁGUAS DE LINDÓIA, LINDÓIA, AMPARO, ITAPIRA, MONTE SIÃO, BUENO BRANDÃO, CAMANDUCAIA, ITAPEVA
    const cidadesExtrema = [
      { cidade: 'EXTREMA', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'TOLEDO', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'MUNHOZ', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'PEDRA BELA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'PINHALZINHO', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'SOCORRO', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      { cidade: 'SERRA NEGRA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: false },
      // Divisas da rota Extrema
      { cidade: 'ÁGUAS DE LINDÓIA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
      { cidade: 'AGUAS DE LINDOIA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
      { cidade: 'LINDÓIA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
      { cidade: 'LINDOIA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
      { cidade: 'ITAPIRA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
      { cidade: 'AMPARO', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA', eh_divisa: true },
    ]

    // Cidades da Rota CAMBUÍ (para manter suporte geográfico caso clientes caiam na microrregião)
    const cidadesCambui = [
      { cidade: 'CAMBUÍ', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'CAMBUI', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'BOM REPOUSO', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR AMARAL', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR CÔRTES', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'ESTIVA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'CAMANDUCAIA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'ITAPEVA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      {
        cidade: 'CÓRREGO DO BOM JESUS',
        uf: 'MG',
        rota: 'CAMBUÍ',
        polo: 'CAMBUÍ',
        eh_divisa: false,
      },
      {
        cidade: 'CORREGO DO BOM JESUS',
        uf: 'MG',
        rota: 'CAMBUÍ',
        polo: 'CAMBUÍ',
        eh_divisa: false,
      },
      { cidade: 'MONTE VERDE', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: true },
    ]

    const todasCidades = [
      ...cidadesBraganca,
      ...cidadesJundiai,
      ...cidadesVarginha,
      ...cidadesPousoAlegre,
      ...cidadesPocosDeCaldas,
      ...cidadesItajuba,
      ...cidadesExtrema,
      ...cidadesCambui,
    ]

    // Inserção idempotente com verificação por cidade_normalizada
    let inseridos = 0
    let jaExistiam = 0

    const colCidades = app.findCollectionByNameOrId('cidades_rotas')

    for (let i = 0; i < todasCidades.length; i++) {
      const item = todasCidades[i]
      const cidNorm = normalizarTextoNFD(item.cidade)
      if (!cidNorm) continue

      let existente = null
      try {
        existente = app.findFirstRecordByData('cidades_rotas', 'cidade_normalizada', cidNorm)
      } catch (_) {}

      if (existente) {
        jaExistiam++
        continue
      }

      const rec = new Record(colCidades)
      rec.set('cidade', item.cidade)
      rec.set('cidade_normalizada', cidNorm)
      rec.set('uf', item.uf || '')
      rec.set('rota', item.rota)
      rec.set('polo', item.polo || item.rota)
      rec.set('eh_divisa', Boolean(item.eh_divisa))
      rec.set('ativo', true)
      rec.set(
        'observacao',
        item.eh_divisa ? 'Cidade limítrofe/divisa da rota' : 'Cidade oficial da rota',
      )
      app.save(rec)
      inseridos++
    }

    console.log(
      `[0110_create_cidades_rotas_map] Mapeamento concluído: ${inseridos} cidades inseridas, ${jaExistiam} já existiam.`,
    )
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('cidades_rotas')
      app.delete(collection)
    } catch (_) {}
  },
)
