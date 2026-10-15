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

    // Salva na tabela configuracoes para auditoria e histórico
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
      '[0111_auditoria_baldes_roteamento] RESUMO AUDITORIA: ' + JSON.stringify(relatorioBaldes),
    )
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'auditoria_baldes_roteamento')
      if (rec) app.delete(rec)
    } catch (_) {}
  },
)
