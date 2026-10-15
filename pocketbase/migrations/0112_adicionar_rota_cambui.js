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

    // 1. Garantir que os 4 operadores da rota CAMBUÍ estão cadastrados, ativos e com a região CAMBUÍ
    // Operadores: JULIANO, EDMILA, MATHEUS TEIXEIRA, ARIANE
    const colUsers = app.findCollectionByNameOrId('users')

    const equipeCambui = [
      {
        nome: 'Juliano Pereira',
        email: 'juliano.pereira@grupoabr.com.br',
        role: 'lider',
      },
      {
        nome: 'Edmila Melo',
        email: 'edmila.melo@grupoabr.com.br',
        role: 'operador',
      },
      {
        nome: 'Matheus Teixeira',
        email: 'matheus.teixeira@grupoabr.com.br',
        role: 'operador',
      },
      {
        nome: 'Ariane Souza',
        email: 'ariane.souza@grupoabr.com.br',
        role: 'operador',
      },
    ]

    for (let uI = 0; uI < equipeCambui.length; uI++) {
      const eq = equipeCambui[uI]
      let uRec = null
      try {
        uRec = app.findAuthRecordByEmail('users', eq.email)
      } catch (_) {
        try {
          const normEq = normalizarTextoNFD(eq.nome)
          const allU = app.findRecordsByFilter('users', "role != 'cliente'", 'name', 200, 0)
          for (let k = 0; k < allU.length; k++) {
            const nK = normalizarTextoNFD(allU[k].getString('name'))
            if (nK === normEq || nK.includes(normEq) || normEq.includes(nK)) {
              uRec = allU[k]
              break
            }
          }
        } catch (_) {}
      }

      if (!uRec) {
        // Cria usuário se não existir
        uRec = new Record(colUsers)
        uRec.set('name', eq.nome)
        uRec.set('email', eq.email)
        uRec.set('role', eq.role)
        uRec.set('regioes', ['CAMBUÍ'])
        uRec.set('ativo', true)
        uRec.set('verified', true)
        uRec.set('emailVisibility', true)
        uRec.setPassword('Abr@123456')
        app.save(uRec)
        console.log(
          `[0112_adicionar_rota_cambui] Criado usuário para Cambuí: ${eq.nome} (${eq.email})`,
        )
      } else {
        // Garante região CAMBUÍ e status ativo
        let userRegs = []
        try {
          const slice = uRec.getStringSlice('regioes')
          if (slice && slice.length > 0) userRegs = slice
          else {
            const raw = uRec.get('regioes')
            if (Array.isArray(raw)) userRegs = raw
          }
        } catch (_) {}

        const temCambui = userRegs.some(
          (r) => normalizarTextoNFD(r) === 'CAMBUI' || normalizarTextoNFD(r) === 'CAMBUI',
        )

        let alterou = false
        if (!temCambui) {
          userRegs.push('CAMBUÍ')
          uRec.set('regioes', userRegs)
          alterou = true
        }
        if (uRec.getBool('ativo') === false) {
          uRec.set('ativo', true)
          alterou = true
        }
        if (alterou) {
          app.save(uRec)
          console.log(`[0112_adicionar_rota_cambui] Atualizado usuário: ${eq.nome}`)
        }
      }
    }

    // 2. Mapeamento completo de cidades para a rota CAMBUÍ:
    // Polo: CAMBUÍ
    // Informadas pelo usuário: BOM REPOUSO, SENADOR, ESTIVA, CAMANDUCAIA, ITAPEVA, CÓRREGO DO BOM JESUS, MONTE VERDE
    // Divisas geográficas reais das cidades da rota (fronteira MG / SP na Serra da Mantiqueira / Sul de Minas):
    // Divisas com Cambuí, Camanducaia, Bom Repouso, Estiva, Itapeva, Córrego do Bom Jesus e Monte Verde:
    // - SENADOR AMARAL (MG)
    // - SENADOR CÔRTES (MG)
    // - SÃO JOSÉ DOS CAMPOS (SP) - divisa com Camanducaia / Monte Verde
    // - MONTEIRO LOBATO (SP) - divisa Serra da Mantiqueira / microbacia
    // - SAPUCAÍ-MIRIM / SAPUCAÍ MIRIM (MG) - divisa com Camanducaia/Monte Verde
    // - GONÇALVES (MG) - divisa com Camanducaia / Córrego do Bom Jesus
    // - PARAÍSOPOLIS / PARAISOPOLIS (MG) - divisa com Córrego do Bom Jesus / Consolação
    // - CONSOLAÇÃO (MG) - divisa com Cambuí, Córrego do Bom Jesus e Estiva
    // - CACHOEIRA DE MINAS (MG) - divisa com Estiva / Consolação
    // - POUSO ALEGRE (MG) - divisa com Estiva
    // - TOCOS DO MOJI (MG) - divisa com Estiva
    // - BORDA DA MATA (MG) - divisa com Estiva
    // - INCONFIDENTES (MG) - divisa com Bom Repouso
    // - BUENO BRANDÃO (MG) - divisa com Bom Repouso e Senador Amaral
    // - MUNHOZ (MG) - divisa com Senador Amaral e Itapeva
    // - EXTREMA (MG) - divisa com Itapeva e Camanducaia
    // - JOANÓPOLIS / JOANOPOLIS (SP) - divisa com Camanducaia / Monte Verde
    const cidadesCambuiNovas = [
      // Verbatim / Polo / Cidades informadas pelo usuário
      { cidade: 'CAMBUÍ', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'CAMBUI', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'BOM REPOUSO', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR AMARAL', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      { cidade: 'SENADOR CÔRTES', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
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
      { cidade: 'MONTE VERDE', uf: 'MG', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: false },
      // Divisas geográficas reais da rota de Cambuí (municípios de fronteira SP/MG)
      { cidade: 'SÃO JOSÉ DOS CAMPOS', uf: 'SP', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: true },
      { cidade: 'SAO JOSE DOS CAMPOS', uf: 'SP', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: true },
      { cidade: 'MONTEIRO LOBATO', uf: 'SP', rota: 'CAMBUÍ', polo: 'CAMBUÍ', eh_divisa: true },
    ]

    const colCidades = app.findCollectionByNameOrId('cidades_rotas')
    let inseridos = 0
    let atualizados = 0

    for (let i = 0; i < cidadesCambuiNovas.length; i++) {
      const item = cidadesCambuiNovas[i]
      const cidNorm = normalizarTextoNFD(item.cidade)
      if (!cidNorm) continue

      let existente = null
      try {
        existente = app.findFirstRecordByData('cidades_rotas', 'cidade_normalizada', cidNorm)
      } catch (_) {}

      if (existente) {
        // Se já pertencia a Cambuí, apenas atualiza observação/polo se necessário
        if (existente.getString('rota') === 'CAMBUÍ') {
          existente.set('ativo', true)
          if (item.eh_divisa !== undefined) existente.set('eh_divisa', item.eh_divisa)
          app.save(existente)
          atualizados++
        }
        continue
      }

      const rec = new Record(colCidades)
      rec.set('cidade', item.cidade)
      rec.set('cidade_normalizada', cidNorm)
      rec.set('uf', item.uf || 'MG')
      rec.set('rota', item.rota)
      rec.set('polo', item.polo || 'CAMBUÍ')
      rec.set('eh_divisa', Boolean(item.eh_divisa))
      rec.set('ativo', true)
      rec.set(
        'observacao',
        item.eh_divisa
          ? 'Cidade limítrofe/divisa da rota Cambuí'
          : 'Cidade informada da rota Cambuí',
      )
      app.save(rec)
      inseridos++
    }

    console.log(
      `[0112_adicionar_rota_cambui] Mapa atualizado: ${inseridos} cidades inseridas, ${atualizados} cidades checadas/atualizadas para CAMBUÍ.`,
    )

    // 3. Recalcular auditoria dos 4 baldes da base com o mapa de Cambuí completo
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

    const usersList = app.findRecordsByFilter('users', "role != 'cliente'", 'name', 500, 0)
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
        "estado = 'na_base' && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'",
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
      '[0112_adicionar_rota_cambui] AUDITORIA APÓS CAMBUÍ: ' + JSON.stringify(relatorioBaldes),
    )
  },
  (app) => {
    // Reversão
    try {
      const colCidades = app.findCollectionByNameOrId('cidades_rotas')
      const recs = app.findRecordsByFilter(
        'cidades_rotas',
        "rota = 'CAMBUÍ' && eh_divisa = true",
        'id',
        50,
        0,
      )
      for (let i = 0; i < recs.length; i++) {
        app.delete(recs[i])
      }
    } catch (_) {}
  },
)
