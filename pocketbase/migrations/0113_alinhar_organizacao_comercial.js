/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    console.log(
      '[0113_alinhar_organizacao_comercial] Iniciando alinhamento cirúrgico da organização comercial...',
    )

    // =========================================================================
    // 1. RECONCILIAÇÃO DA COLEÇÃO cidades_rotas
    // =========================================================================
    // Conforme a tabela oficial do Projeto Guerra enviada pelo usuário:
    // - BRAGANÇA: BRAGANÇA, ATIBAIA, PIRACAIA, BOM JESUS DOS PERDÕES, JOANOPOLIS, VARGEM, NAZARÉ PAULISTA, MARIPORÃ
    // - JUNDIAÍ: JUNDIAÍ, ITATIBA, JARINU, VÁRZEA PAULISTA, CAMPO LIMPO, ITUPEVA, CAJAMAR, VINHEDO
    // - VARGINHA: VARGINHA, TRÊS PONTAS, TRÊS CORAÇÕES, ELOI MENDES, PARAGUAÇU, MONSENHOR PAULO, CAMPANHA, CAMBUQUIRA, SÃO GONÇALO, CAREAÇU, COQUEIRAL, SANTANA DA VARGEM
    // - POUSO ALEGRE: POUSO ALEGRE, JACUTINGA, BORDA DA MATA, BUENO BRANDÃO, LAMBARI, CAXAMBU, SÃO LOURENÇO, SÃO SEBASTIÃO DA BELA VISTA, NATÉRCIA, HELIODORA, OURO FINO, BAEPENDI, CARMO DE MINAS, MONTE SIÃO, INCONFIDENTES, CONCEIÇÃO DO RIO VERDE
    // - POÇOS DE CALDAS: POÇOS DE CALDAS, ALFENAS, MACHADO, CALDAS, SANTA RITA DE CALDAS, CONGONHAL, POÇO FUNDO, SILVIANÓPOLIS, FAMA, ANDRADAS, IPUIÚNA, CAMPOS GERAIS, IBITIURA
    // - ITAJUBÁ: ITAJUBÁ, SANTA RITA SAPUCAÍ, PIRANGUINHO, MARIA DA FÉ, PEDRALVA, VIRGÍNIA, DELFIM MOREIRA, GONÇALVES, SAPUCAÍ MIRIM, SÃO BENTO (1x), CONCEIÇÃO DOS OUROS, CACHOEIRA DE MINAS, BRASOPOLIS (1x), PARAISOPOLIS (variante de BRASOPOLIS), SÃO JOSÉ DO ALEGRE, CONSOLAÇÃO
    // - EXTREMA: EXTREMA, TOLEDO, MUNHOZ, PEDRA BELA, PINHALZINHO, SOCORRO, SERRA NEGRA
    // - CAMBUÍ: CAMBUÍ, BOM REPOUSO, SENADOR, ESTIVA, CAMANDUCAIA, ITAPEVA, CÓRREGO DO BOM JESUS, MONTE VERDE
    //
    // Regra: Cidades que já estão corretas não mexer. Divisas existentes permanecem (complemento aprovado).
    // Reatribuir cidades caso estivessem em outra rota no banco e semear variantes faltantes (com/sem acento).

    const cidadesOficiaisMatriz = [
      // BRAGANÇA
      { cidade: 'BRAGANÇA PAULISTA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'BRAGANCA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'BRAGANÇA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'ATIBAIA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'PIRACAIA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'BOM JESUS DOS PERDÕES', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'BOM JESUS DOS PERDOES', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'JOANOPOLIS', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'JOANÓPOLIS', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'VARGEM', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'NAZARÉ PAULISTA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'NAZARE PAULISTA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'MARIPORÃ', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'MARIPORA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'MAIRIPORÃ', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },
      { cidade: 'MAIRIPORA', uf: 'SP', rota: 'BRAGANÇA', polo: 'BRAGANÇA' },

      // JUNDIAÍ
      { cidade: 'JUNDIAÍ', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'JUNDIAI', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'ITATIBA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'JARINU', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'VÁRZEA PAULISTA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'VARZEA PAULISTA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'CAMPO LIMPO', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'CAMPO LIMPO PAULISTA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'ITUPEVA', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'CAJAMAR', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },
      { cidade: 'VINHEDO', uf: 'SP', rota: 'JUNDIAÍ', polo: 'JUNDIAÍ' },

      // VARGINHA
      { cidade: 'VARGINHA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'TRÊS PONTAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'TRES PONTAS', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'TRÊS CORAÇÕES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'TRES CORACOES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'ELOI MENDES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'ELÓI MENDES', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'PARAGUAÇU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'PARAGUACU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'MONSENHOR PAULO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'CAMPANHA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'CAMBUQUIRA', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'SÃO GONÇALO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'SAO GONCALO', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'SÃO GONÇALO DO SAPUCAÍ', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'SAO GONCALO DO SAPUCAI', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'CAREAÇU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'CAREACU', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'COQUEIRAL', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },
      { cidade: 'SANTANA DA VARGEM', uf: 'MG', rota: 'VARGINHA', polo: 'VARGINHA' },

      // POUSO ALEGRE
      { cidade: 'POUSO ALEGRE', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'JACUTINGA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'BORDA DA MATA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'BUENO BRANDÃO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'BUENO BRANDAO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'LAMBARI', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'CAXAMBU', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'SÃO LOURENÇO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'SAO LOURENCO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      {
        cidade: 'SÃO SEBASTIÃO DA BELA VISTA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
      },
      {
        cidade: 'SAO SEBASTIAO DA BELA VISTA',
        uf: 'MG',
        rota: 'POUSO ALEGRE',
        polo: 'POUSO ALEGRE',
      },
      { cidade: 'NATÉRCIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'NATERCIA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'HELIODORA', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'OURO FINO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'BAEPENDI', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'CARMO DE MINAS', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'MONTE SIÃO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'MONTE SIAO', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'INCONFIDENTES', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'CONCEIÇÃO DO RIO VERDE', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },
      { cidade: 'CONCEICAO DO RIO VERDE', uf: 'MG', rota: 'POUSO ALEGRE', polo: 'POUSO ALEGRE' },

      // POÇOS DE CALDAS
      { cidade: 'POÇOS DE CALDAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'POCOS DE CALDAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'ALFENAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'MACHADO', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'CALDAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      {
        cidade: 'SANTA RITA DE CALDAS',
        uf: 'MG',
        rota: 'POÇOS DE CALDAS',
        polo: 'POÇOS DE CALDAS',
      },
      { cidade: 'CONGONHAL', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'POÇO FUNDO', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'POCO FUNDO', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'SILVIANÓPOLIS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'SILVIANOPOLIS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'FAMA', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'ANDRADAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'IPUIÚNA', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'IPUIUNA', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'CAMPOS GERAIS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'IBITIURA', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'IBITIÚRA DE MINAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },
      { cidade: 'IBITIURA DE MINAS', uf: 'MG', rota: 'POÇOS DE CALDAS', polo: 'POÇOS DE CALDAS' },

      // ITAJUBÁ
      { cidade: 'ITAJUBÁ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'ITAJUBA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SANTA RITA SAPUCAÍ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SANTA RITA SAPUCAI', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SANTA RITA DO SAPUCAÍ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SANTA RITA DO SAPUCAI', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'PIRANGUINHO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'MARIA DA FÉ', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'MARIA DA FE', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'PEDRALVA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'VIRGÍNIA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'VIRGINIA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'DELFIM MOREIRA', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'GONÇALVES', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'GONCALVES', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAPUCAÍ MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAPUCAI MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAPUCAÍ-MIRIM', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SÃO BENTO', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAO BENTO', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SÃO BENTO DO SAPUCAÍ', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAO BENTO DO SAPUCAI', uf: 'SP', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'CONCEIÇÃO DOS OUROS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'CONCEICAO DOS OUROS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'CACHOEIRA DE MINAS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'BRASOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'BRASÓPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'BRAZOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'BRAZÓPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'PARAISOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'PARAÍSOPOLIS', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SÃO JOSÉ DO ALEGRE', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'SAO JOSE DO ALEGRE', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'CONSOLAÇÃO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },
      { cidade: 'CONSOLACAO', uf: 'MG', rota: 'ITAJUBÁ', polo: 'ITAJUBÁ' },

      // EXTREMA
      { cidade: 'EXTREMA', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'TOLEDO', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'MUNHOZ', uf: 'MG', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'PEDRA BELA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'PINHALZINHO', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'SOCORRO', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA' },
      { cidade: 'SERRA NEGRA', uf: 'SP', rota: 'EXTREMA', polo: 'EXTREMA' },

      // CAMBUÍ
      { cidade: 'CAMBUÍ', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'CAMBUI', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'BOM REPOUSO', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'SENADOR', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'ESTIVA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'CAMANDUCAIA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'ITAPEVA', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'CÓRREGO DO BOM JESUS', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'CORREGO DO BOM JESUS', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
      { cidade: 'MONTE VERDE', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ' },
    ]

    const colCidadesRotas = app.findCollectionByNameOrId('cidades_rotas')
    let cidadesInseridas = 0
    let cidadesAtualizadas = 0

    for (let i = 0; i < cidadesOficiaisMatriz.length; i++) {
      const cItem = cidadesOficiaisMatriz[i]
      const cNorm = normalizarTextoNFD(cItem.cidade)
      if (!cNorm) continue

      let existente = null
      try {
        existente = app.findFirstRecordByData('cidades_rotas', 'cidade_normalizada', cNorm)
      } catch (_) {}

      if (existente) {
        let alterou = false
        if (existente.getString('rota') !== cItem.rota) {
          console.log(
            `[0113_alinhar_organizacao_comercial] Reatribuindo rota de ${cNorm}: ${existente.getString('rota')} -> ${cItem.rota}`,
          )
          existente.set('rota', cItem.rota)
          alterou = true
        }
        if (existente.getString('polo') !== cItem.polo) {
          existente.set('polo', cItem.polo)
          alterou = true
        }
        // Se a cidade está na tabela oficial do usuário, ela é atendimento oficial (eh_divisa = false)
        if (existente.getBool('eh_divisa') === true) {
          existente.set('eh_divisa', false)
          alterou = true
        }
        if (existente.getBool('ativo') === false) {
          existente.set('ativo', true)
          alterou = true
        }
        if (alterou) {
          app.save(existente)
          cidadesAtualizadas++
        }
      } else {
        const novoRec = new Record(colCidadesRotas)
        novoRec.set('cidade', cItem.cidade)
        novoRec.set('cidade_normalizada', cNorm)
        novoRec.set('uf', cItem.uf || '')
        novoRec.set('rota', cItem.rota)
        novoRec.set('polo', cItem.polo)
        novoRec.set('eh_divisa', false)
        novoRec.set('ativo', true)
        novoRec.set('observacao', 'Cidade oficial da rota conforme tabela do Projeto Guerra')
        app.save(novoRec)
        cidadesInseridas++
      }
    }

    console.log(
      `[0113_alinhar_organizacao_comercial] Cidades reconciliadas: ${cidadesInseridas} inseridas, ${cidadesAtualizadas} atualizadas.`,
    )

    // =========================================================================
    // 2. RECONCILIAÇÃO DA COLEÇÃO regioes
    // =========================================================================
    // Matriz de papéis por rota:
    // - BRAGANÇA: VE: ALESSANDRO, ESP: LEIZ, CORP: HELOA
    // - JUNDIAÍ: VE: DYOVANA, ESP: JOSIANE FRAZÃO, CORP: JOSIANE FRAZÃO (Kaylane saiu; usuário definiu Josiane)
    // - VARGINHA: VE: PETERSON, ESP: BRUNA, CORP: THAIS
    // - POUSO ALEGRE: VE: PAOLA, ESP: RAFAELA, CORP: VITORIA
    // - POÇOS DE CALDAS: VE: JOSÉ FELIPE, ESP: MILENA, CORP: CAMILA GUIMENTI
    // - ITAJUBÁ: VE: JENNIFER, ESP: GABRIELA, CORP: JESSICA.S
    // - EXTREMA: VE: GUSTAVO, ESP: INAYARA, CORP: TAINARA
    // - CAMBUÍ: VE: JULIANO, ESP: EDMILA, CORP: MATHEUS TEIXEIRA, CC: ARIANE

    const mapaRegioesConfig = {
      BRAGANÇA: {
        vendedor_externo: 'ALESSANDRO',
        especialista: 'LEIZ',
        corporativo: 'HELOA',
        construcao_civil: '',
        cidades: [
          'BRAGANÇA',
          'ATIBAIA',
          'PIRACAIA',
          'BOM JESUS DOS PERDÕES',
          'JOANOPOLIS',
          'VARGEM',
          'NAZARÉ PAULISTA',
          'MARIPORÃ',
        ],
      },
      JUNDIAÍ: {
        vendedor_externo: 'DYOVANA',
        especialista: 'JOSIANE FRAZÃO',
        corporativo: 'JOSIANE FRAZÃO',
        construcao_civil: '',
        cidades: [
          'JUNDIAÍ',
          'ITATIBA',
          'JARINU',
          'VÁRZEA PAULISTA',
          'CAMPO LIMPO',
          'ITUPEVA',
          'CAJAMAR',
          'VINHEDO',
        ],
      },
      VARGINHA: {
        vendedor_externo: 'PETERSON',
        especialista: 'BRUNA',
        corporativo: 'THAIS',
        construcao_civil: '',
        cidades: [
          'VARGINHA',
          'TRÊS PONTAS',
          'TRÊS CORAÇÕES',
          'ELOI MENDES',
          'PARAGUAÇU',
          'MONSENHOR PAULO',
          'CAMPANHA',
          'CAMBUQUIRA',
          'SÃO GONÇALO',
          'CAREAÇU',
          'COQUEIRAL',
          'SANTANA DA VARGEM',
        ],
      },
      'POUSO ALEGRE': {
        vendedor_externo: 'PAOLA',
        especialista: 'RAFAELA',
        corporativo: 'VITORIA',
        construcao_civil: '',
        cidades: [
          'POUSO ALEGRE',
          'JACUTINGA',
          'BORDA DA MATA',
          'BUENO BRANDÃO',
          'LAMBARI',
          'CAXAMBU',
          'SÃO LOURENÇO',
          'SÃO SEBASTIÃO DA BELA VISTA',
          'NATÉRCIA',
          'HELIODORA',
          'OURO FINO',
          'BAEPENDI',
          'CARMO DE MINAS',
          'MONTE SIÃO',
          'INCONFIDENTES',
          'CONCEIÇÃO DO RIO VERDE',
        ],
      },
      'POÇOS DE CALDAS': {
        vendedor_externo: 'JOSÉ FELIPE',
        especialista: 'MILENA',
        corporativo: 'CAMILA GUIMENTI',
        construcao_civil: '',
        cidades: [
          'POÇOS DE CALDAS',
          'ALFENAS',
          'MACHADO',
          'CALDAS',
          'SANTA RITA DE CALDAS',
          'CONGONHAL',
          'POÇO FUNDO',
          'SILVIANÓPOLIS',
          'FAMA',
          'ANDRADAS',
          'IPUIÚNA',
          'CAMPOS GERAIS',
          'IBITIURA',
        ],
      },
      ITAJUBÁ: {
        vendedor_externo: 'JENNIFER',
        especialista: 'GABRIELA',
        corporativo: 'JESSICA.S',
        construcao_civil: '',
        cidades: [
          'ITAJUBÁ',
          'SANTA RITA SAPUCAÍ',
          'PIRANGUINHO',
          'MARIA DA FÉ',
          'PEDRALVA',
          'VIRGÍNIA',
          'DELFIM MOREIRA',
          'GONÇALVES',
          'SAPUCAÍ MIRIM',
          'SÃO BENTO',
          'CONCEIÇÃO DOS OUROS',
          'CACHOEIRA DE MINAS',
          'BRASOPOLIS',
          'PARAISOPOLIS',
          'SÃO JOSÉ DO ALEGRE',
          'CONSOLAÇÃO',
        ],
      },
      EXTREMA: {
        vendedor_externo: 'GUSTAVO',
        especialista: 'INAYARA',
        corporativo: 'TAINARA',
        construcao_civil: '',
        cidades: [
          'EXTREMA',
          'TOLEDO',
          'MUNHOZ',
          'PEDRA BELA',
          'PINHALZINHO',
          'SOCORRO',
          'SERRA NEGRA',
        ],
      },
      CAMBUÍ: {
        vendedor_externo: 'JULIANO',
        especialista: 'EDMILA',
        corporativo: 'MATHEUS TEIXEIRA',
        construcao_civil: 'ARIANE',
        cidades: [
          'CAMBUÍ',
          'BOM REPOUSO',
          'SENADOR',
          'ESTIVA',
          'CAMANDUCAIA',
          'ITAPEVA',
          'CÓRREGO DO BOM JESUS',
          'MONTE VERDE',
        ],
      },
    }

    const regioesRecs = app.findRecordsByFilter('regioes', 'tipo = "comercial"', 'ordem', 50, 0)
    for (let rI = 0; rI < regioesRecs.length; rI++) {
      const regRec = regioesRecs[rI]
      const rNome = regRec.getString('nome')
      const targetCfg = mapaRegioesConfig[rNome]
      if (!targetCfg) continue

      regRec.set('vendedor_externo', targetCfg.vendedor_externo)
      regRec.set('especialista', targetCfg.especialista)
      regRec.set('corporativo', targetCfg.corporativo)
      regRec.set('construcao_civil', targetCfg.construcao_civil)
      regRec.set('cidades_rota', targetCfg.cidades)
      app.save(regRec)
      console.log(
        `[0113_alinhar_organizacao_comercial] Região ${rNome} alinhada com a matriz oficial.`,
      )
    }

    // =========================================================================
    // 3. RECONCILIAÇÃO DO CADASTRO DE USUÁRIOS
    // =========================================================================
    // Regras:
    // - Vendedores externos (VE): lider (exceto Cambuí que já é líder Juliano)
    // - Especialistas: operador (ou supervisor se aplicável)
    // - Corporativo: operador
    // - Construção Civil: ARIANE (mantida operador em Cambuí)
    // - KAYLANE: NÃO REATIVAR; permanece inativa / sem alteração de acesso.
    // - JOSIANE FRAZÃO: Especialista e Corporativo em Jundiaí mantida conforme escolha do usuário.
    // - Garantir que cada colaborador tenha EXATAMENTE a região correta da sua rota.

    const atribuicoesUsuarios = [
      // BRAGANÇA
      { match: 'ALESSANDRO', regiao: 'BRAGANÇA', role: 'lider' },
      { match: 'LEIZ', regiao: 'BRAGANÇA', role: 'operador' },
      { match: 'HELOA', regiao: 'BRAGANÇA', role: 'operador' },

      // JUNDIAÍ
      { match: 'DYOVANA', regiao: 'JUNDIAÍ', role: 'lider' },
      { match: 'JOSIANE', regiao: 'JUNDIAÍ', role: 'operador' }, // Especialista e Corporativo

      // VARGINHA
      { match: 'PETERSON', regiao: 'VARGINHA', role: 'lider' },
      { match: 'BRUNA', regiao: 'VARGINHA', role: 'operador' },
      { match: 'THAIS', regiao: 'VARGINHA', role: 'operador' },

      // POUSO ALEGRE
      { match: 'PAOLA', regiao: 'POUSO ALEGRE', role: 'lider' },
      { match: 'RAFAELA', regiao: 'POUSO ALEGRE', role: 'operador' },
      { match: 'VITORIA', regiao: 'POUSO ALEGRE', role: 'operador' },

      // POÇOS DE CALDAS
      { match: 'JOSE FELIPE', regiao: 'POÇOS DE CALDAS', role: 'lider' },
      { match: 'MILENA', regiao: 'POÇOS DE CALDAS', role: 'operador' },
      { match: 'CAMILA', regiao: 'POÇOS DE CALDAS', role: 'operador' },

      // ITAJUBÁ
      { match: 'JENNIFER', regiao: 'ITAJUBÁ', role: 'lider' },
      { match: 'GABRIELA', regiao: 'ITAJUBÁ', role: 'operador' },
      { match: 'JESSICA', regiao: 'ITAJUBÁ', role: 'operador' },

      // EXTREMA
      { match: 'GUSTAVO', regiao: 'EXTREMA', role: 'lider' },
      { match: 'INAYARA', regiao: 'EXTREMA', role: 'operador' },
      { match: 'TAINARA', regiao: 'EXTREMA', role: 'operador' },

      // CAMBUÍ
      { match: 'JULIANO', regiao: 'CAMBUÍ', role: 'lider' },
      { match: 'EDMILA', regiao: 'CAMBUÍ', role: 'operador' },
      { match: 'MATHEUS TEIXEIRA', regiao: 'CAMBUÍ', role: 'operador' },
      { match: 'ARIANE', regiao: 'CAMBUÍ', role: 'operador' },
    ]

    const todosUsers = app.findRecordsByFilter('users', 'role != "cliente"', 'name', 500, 0)
    for (let uI = 0; uI < todosUsers.length; uI++) {
      const uRec = todosUsers[uI]
      const uNome = normalizarTextoNFD(uRec.getString('name'))
      const uEmail = normalizarTextoNFD(uRec.getString('email'))

      // Ignora admins, sistema e usuários atacado/repescagem explicitos
      if (
        uRec.getString('role') === 'admin' ||
        uNome.includes('SISTEMA') ||
        uNome.includes('THIAGO') ||
        uNome.includes('PIETRA') ||
        uNome.includes('HELTON')
      ) {
        continue
      }
      if (
        uNome.includes('LARISSA') ||
        uNome.includes('JULIO') ||
        uNome.includes('WILSON') ||
        uNome.includes('ANDERSON') ||
        uNome.includes('PRISCILA')
      ) {
        continue
      }

      for (let aI = 0; aI < atribuicoesUsuarios.length; aI++) {
        const at = atribuicoesUsuarios[aI]
        if (uNome.includes(at.match) || uEmail.includes(at.match.replace(/\s+/g, '.'))) {
          let mudou = false
          // Ajusta regiões para conter exclusivamente a rota correta do Varejo
          const regAtual = uRec.get('regioes')
          const arrayReg = Array.isArray(regAtual) ? regAtual : [regAtual]
          const regNormalizadaAtual = arrayReg.map((r) => normalizarTextoNFD(r)).join(',')
          const regEsperadaNormalizada = normalizarTextoNFD(at.regiao)

          if (regNormalizadaAtual !== regEsperadaNormalizada) {
            uRec.set('regioes', [at.regiao])
            mudou = true
          }

          if (at.role && uRec.getString('role') !== at.role) {
            uRec.set('role', at.role)
            mudou = true
          }

          if (mudou) {
            app.save(uRec)
            console.log(
              `[0113_alinhar_organizacao_comercial] Usuário alinhado: ${uRec.getString('name')} -> Região: [${at.regiao}], Role: ${at.role}`,
            )
          }
          break
        }
      }
    }

    // =========================================================================
    // 4. AUDITORIA COMPLETA DOS BALDES DE ROTEAMENTO
    // =========================================================================
    function limparPrefixoVendedor(vendedorStr) {
      let v = normalizarTextoNFD(vendedorStr)
      const prefixos = [
        'VARE - ',
        'VCORP - ',
        'VAREXT - ',
        'ATR - ',
        'VARC - ',
        'ADMV - ',
        'ATF - ',
        'ESPECIALISTE - ',
        'ESPECIALISTA - ',
        'EXT - ',
        'INT - ',
        'REP - ',
      ]
      for (let i = 0; i < prefixos.length; i++) {
        const p = normalizarTextoNFD(prefixos[i])
        if (v.startsWith(p)) {
          v = v.slice(p.length).trim()
          break
        }
      }
      return v
    }

    function obterVariantesVendedor(nomeOuToken) {
      const norm = normalizarTextoNFD(nomeOuToken)
      const variantes = new Set()
      if (!norm) return []
      variantes.add(norm)
      if (norm.includes('ALESSANDRO') || norm.includes('JAPA')) {
        variantes.add('ALESSANDRO')
        variantes.add('JAPA')
      }
      if (norm.includes('JESSICA') || norm.includes('JESSIKA')) {
        variantes.add('JESSICA')
        variantes.add('JESSIKA')
      }
      if (norm.includes('JOSE FELIPE') || norm.includes('FELIPE') || norm.includes('JOSE')) {
        variantes.add('JOSE FELIPE')
        variantes.add('FELIPE')
        variantes.add('JOSE')
      }
      if (
        norm.includes('ARIANE') ||
        norm.includes('CONSTRUCAO CIVIL') ||
        norm.includes('CONSTRUCAO')
      ) {
        variantes.add('ARIANE')
        variantes.add('CONSTRUCAO CIVIL')
        variantes.add('CONSTRUCAO')
      }
      if (norm.includes('JOSIANE') || norm.includes('FRAZAO')) {
        variantes.add('JOSIANE')
        variantes.add('FRAZAO')
      }
      if (norm.includes('CAMILA') || norm.includes('GUIMENTI')) {
        variantes.add('CAMILA')
        variantes.add('GUIMENTI')
      }
      const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 3)
      for (let i = 0; i < partes.length; i++) {
        variantes.add(partes[i])
      }
      return Array.from(variantes)
    }

    function extrairCidadeCliente(clienteRec) {
      const cidDireta = clienteRec.getString('cidade')
      if (cidDireta && cidDireta.trim()) {
        return normalizarTextoNFD(cidDireta)
      }
      const endRaw = clienteRec.getString('endereco') || ''
      if (endRaw) {
        const partesHifen = endRaw.split('-')
        if (partesHifen.length >= 2) {
          const antesUf = partesHifen[partesHifen.length - 2].trim()
          const partesVirgula = antesUf.split(',')
          const possivelCidade = partesVirgula[partesVirgula.length - 1].trim()
          if (possivelCidade) return normalizarTextoNFD(possivelCidade)
        }
        const partesVirgula = endRaw.split(',')
        if (partesVirgula.length > 1) {
          return normalizarTextoNFD(partesVirgula[partesVirgula.length - 1])
        }
        return normalizarTextoNFD(endRaw)
      }
      return ''
    }

    const usersList = app.findRecordsByFilter('users', 'role != "cliente"', 'name', 500, 0)
    const colaboradoresAtivos = []
    const colaboradoresInativos = []

    for (let i = 0; i < usersList.length; i++) {
      const u = usersList[i]
      const uNome = (u.getString('name') || '').trim()
      const uAtivo = u.getBool('ativo') !== false
      const uObj = {
        id: u.id,
        nome: uNome,
        ativo: uAtivo,
        variantes: obterVariantesVendedor(uNome),
      }
      if (uAtivo) colaboradoresAtivos.push(uObj)
      else colaboradoresInativos.push(uObj)
    }

    const cidadesRotasRecs = app.findRecordsByFilter(
      'cidades_rotas',
      'ativo = true',
      'cidade',
      1000,
      0,
    )
    const mapaCidades = {}
    for (let i = 0; i < cidadesRotasRecs.length; i++) {
      const r = cidadesRotasRecs[i]
      mapaCidades[r.getString('cidade_normalizada')] = r.getString('rota')
    }
    const listaCidadesNorm = Object.keys(mapaCidades)

    let page = 1
    const perPage = 500
    let totalNaBase = 0

    let baldeNominalAtiva = 0
    let baldeSecundarioCidade = 0
    let baldeParadoInativo = 0
    let baldeSemCorrespondencia = 0
    let baldeAtacadoRepescagem = 0

    const detalhePorOperadorNominal = {}
    const detalhePorRotaCidade = {}
    const detalheParadosVendedor = {}

    let hasMore = true
    while (hasMore) {
      const batch = app.findRecordsByFilter(
        'clientes',
        'estado = "na_base" && ativo_fora_base != true && base_categoria != "cliente_final" && base_categoria != "atacado_fora_mapa"',
        'id',
        perPage,
        (page - 1) * perPage,
      )

      for (let bI = 0; bI < batch.length; bI++) {
        totalNaBase++
        const c = batch[bI]
        const regiao = c.getString('regiao')

        if (regiao === 'ATACADO' || regiao === 'REPESCAGEM') {
          baldeAtacadoRepescagem++
          continue
        }

        const vRaw = c.getString('vendedor') || ''
        const vLimpo = normalizarTextoNFD(limparPrefixoVendedor(vRaw))

        // 1. Checa vendedor ATIVO
        let casouAtivo = false
        let operadorAtivoNome = ''
        if (vLimpo && vLimpo.length >= 3) {
          for (let aI = 0; aI < colaboradoresAtivos.length; aI++) {
            const at = colaboradoresAtivos[aI]
            const atN = normalizarTextoNFD(at.nome)
            if (vLimpo === atN || vLimpo.includes(atN) || atN.includes(vLimpo)) {
              casouAtivo = true
              operadorAtivoNome = at.nome
              break
            }
            for (let vI = 0; vI < at.variantes.length; vI++) {
              const varItem = at.variantes[vI]
              if (varItem.length >= 3 && (vLimpo.includes(varItem) || varItem.includes(vLimpo))) {
                casouAtivo = true
                operadorAtivoNome = at.nome
                break
              }
            }
            if (casouAtivo) break
          }
        }

        if (casouAtivo) {
          baldeNominalAtiva++
          detalhePorOperadorNominal[operadorAtivoNome] =
            (detalhePorOperadorNominal[operadorAtivoNome] || 0) + 1
          continue
        }

        // 2. Checa vendedor INATIVO/AFASTADO (Fica parado!)
        let casouInativo = false
        let inativoNome = ''
        if (vLimpo && (vLimpo.includes('KAYLANE') || vLimpo.length >= 3)) {
          if (vLimpo.includes('KAYLANE')) {
            casouInativo = true
            inativoNome = 'KAYLANE SILVA'
          } else {
            for (let inI = 0; inI < colaboradoresInativos.length; inI++) {
              const inat = colaboradoresInativos[inI]
              const inN = normalizarTextoNFD(inat.nome)
              if (vLimpo === inN || vLimpo.includes(inN) || inN.includes(vLimpo)) {
                casouInativo = true
                inativoNome = inat.nome
                break
              }
              for (let vI = 0; vI < inat.variantes.length; vI++) {
                const varItem = inat.variantes[vI]
                if (varItem.length >= 3 && (vLimpo.includes(varItem) || varItem.includes(vLimpo))) {
                  casouInativo = true
                  inativoNome = inat.nome
                  break
                }
              }
              if (casouInativo) break
            }
          }
        }

        if (casouInativo) {
          baldeParadoInativo++
          detalheParadosVendedor[inativoNome] = (detalheParadosVendedor[inativoNome] || 0) + 1
          continue
        }

        // 3. Secundário por cidade
        const cidCli = extrairCidadeCliente(c)
        const endCli = normalizarTextoNFD(c.getString('endereco'))
        let rotaAtribuida = ''

        if (cidCli && mapaCidades[cidCli]) {
          rotaAtribuida = mapaCidades[cidCli]
        } else if (cidCli) {
          for (let cI = 0; cI < listaCidadesNorm.length; cI++) {
            const cn = listaCidadesNorm[cI]
            if (cidCli === cn || cidCli.includes(cn) || cn.includes(cidCli)) {
              rotaAtribuida = mapaCidades[cn]
              break
            }
          }
        }

        if (!rotaAtribuida && endCli) {
          for (let cI = 0; cI < listaCidadesNorm.length; cI++) {
            const cn = listaCidadesNorm[cI]
            if (cn.length >= 4 && endCli.includes(cn)) {
              rotaAtribuida = mapaCidades[cn]
              break
            }
          }
        }

        if (rotaAtribuida) {
          baldeSecundarioCidade++
          detalhePorRotaCidade[rotaAtribuida] = (detalhePorRotaCidade[rotaAtribuida] || 0) + 1
        } else {
          baldeSemCorrespondencia++
        }
      }

      if (batch.length < perPage) {
        hasMore = false
      } else {
        page++
      }
    }

    const relatorioBaldes = {
      total_na_base_analisados: totalNaBase,
      total_atacado_repescagem: baldeAtacadoRepescagem,
      balde_a_nominal_ativa: baldeNominalAtiva,
      balde_b_secundario_cidade: baldeSecundarioCidade,
      balde_c_parados_inativo: baldeParadoInativo,
      balde_d_sem_correspondencia: baldeSemCorrespondencia,
      detalhes_nominal: detalhePorOperadorNominal,
      detalhes_cidade_por_rota: detalhePorRotaCidade,
      detalhes_parados: detalheParadosVendedor,
      executado_em: new Date().toISOString(),
      versao_migracao: '0113_alinhar_organizacao_comercial',
    }

    let cfgAuditoria = null
    try {
      cfgAuditoria = app.findFirstRecordByData(
        'configuracoes',
        'chave',
        'auditoria_baldes_roteamento',
      )
    } catch (_) {}

    if (!cfgAuditoria) {
      const col = app.findCollectionByNameOrId('configuracoes')
      cfgAuditoria = new Record(col)
      cfgAuditoria.set('chave', 'auditoria_baldes_roteamento')
      cfgAuditoria.set(
        'descricao',
        'Auditoria de validação dos 4 baldes do novo roteamento em cascata',
      )
    }
    cfgAuditoria.set('valor', relatorioBaldes)
    app.save(cfgAuditoria)

    console.log(
      '[0113_alinhar_organizacao_comercial] AUDITORIA BALDES RESULTADO: ' +
        JSON.stringify(relatorioBaldes),
    )
  },
  (app) => {
    // Reversão no-op para preservar sanidade dos dados
    console.log('[0113_alinhar_organizacao_comercial] Rollback invocado.')
  },
)
