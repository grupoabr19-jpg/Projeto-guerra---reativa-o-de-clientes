// pocketbase/migrations/0115_auditoria_roteamento_v3.js
// Migração para auditar a distribuição da base conforme o Roteamento v3
// Baldes auditados:
// 1. Primário Nominal (Filtro 1)
// 2. Secundário Tipo (Filtro 2)
// 3. Terciário Região (Filtro 3)
// 4. Atacado por DDD (blindado)
// 5. Sem correspondência / Parado (se houver)
// E verificação específica dos 83 clientes VCORP - KAYLANE SILVA -> destino Josiane Frazão (Jundiaí)
// E blindagem do cliente de Atacado ne7ys3txxqjen4a -> Julio Melo exclusivamente

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
      const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 3)
      for (let i = 0; i < partes.length; i++) {
        variantes.add(partes[i])
        if (partes[i] === 'JAPA') variantes.add('ALESSANDRO')
        if (partes[i] === 'ALESSANDRO') variantes.add('JAPA')
        if (partes[i] === 'JESSIKA') variantes.add('JESSICA')
        if (partes[i] === 'JESSICA') variantes.add('JESSIKA')
        if (partes[i] === 'FELIPE') {
          variantes.add('JOSE FELIPE')
          variantes.add('JOSE')
        }
      }
      return Array.from(variantes)
    }

    function extrairDddCliente(clienteRec) {
      const dddGravado = clienteRec.getString('ddd_telefone')
      if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
      const telRaw = (
        clienteRec.getString('telefone') ||
        clienteRec.getString('whatsapp') ||
        ''
      ).replace(/\D/g, '')
      if (!telRaw) return ''
      let s = telRaw
      if (s.startsWith('0')) s = s.slice(1)
      if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
      return s.slice(0, 2)
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
          if (possivelCidade) {
            return normalizarTextoNFD(possivelCidade)
          }
        }
        const partesVirgula = endRaw.split(',')
        if (partesVirgula.length > 1) {
          return normalizarTextoNFD(partesVirgula[partesVirgula.length - 1])
        }
        return normalizarTextoNFD(endRaw)
      }
      return ''
    }

    function isClienteAtacado(clienteRec) {
      if (!clienteRec) return false
      const regiao = normalizarTextoNFD(clienteRec.getString('regiao'))
      if (regiao === 'ATACADO' || regiao.includes('ATACADO')) return true
      const vendRaw = normalizarTextoNFD(clienteRec.getString('vendedor'))
      const tipoVend = normalizarTextoNFD(clienteRec.getString('tipo_vendedor'))
      const canalRaw = normalizarTextoNFD(clienteRec.getString('canal'))
      if (
        vendRaw.startsWith('ATR -') ||
        vendRaw.startsWith('ATR-') ||
        vendRaw.startsWith('ATACADO -') ||
        vendRaw.startsWith('ATACADO-') ||
        vendRaw.includes('ATACADO') ||
        tipoVend === 'ATACADO' ||
        tipoVend.includes('ATACADO') ||
        canalRaw === 'ATACADO' ||
        canalRaw.includes('ATACADO')
      ) {
        return true
      }
      const ddd = extrairDddCliente(clienteRec)
      const dddsAtacado = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
      if (
        dddsAtacado.includes(ddd) &&
        (canalRaw === 'ATACADO' ||
          tipoVend === 'ATACADO' ||
          vendRaw.startsWith('ATR') ||
          vendRaw.includes('ATACADO'))
      ) {
        return true
      }
      return false
    }

    // Carregar usuários do sistema
    let todosUsuarios = []
    try {
      todosUsuarios = app.findRecordsByFilter('users', "role != 'cliente'", 'name', 500, 0)
    } catch (_) {}

    function extrairRegioesDeUsuario(uRec) {
      let rList = []
      try {
        const slice = uRec.getStringSlice('regioes')
        if (slice && slice.length > 0) rList = slice
        else {
          const raw = uRec.getString('regioes')
          if (raw && raw.trim().startsWith('[')) rList = JSON.parse(raw)
          else {
            const rawGet = uRec.get('regioes')
            if (Array.isArray(rawGet)) rList = rawGet
          }
        }
      } catch (_) {}
      if (!Array.isArray(rList)) rList = []
      return rList.map((r) => normalizarTextoNFD(r)).filter(Boolean)
    }

    const listaAtivos = []
    const listaInativos = []
    for (let uIdx = 0; uIdx < todosUsuarios.length; uIdx++) {
      const u = todosUsuarios[uIdx]
      const uNome = (u.getString('name') || '').trim()
      const uAtivo = u.getBool('ativo') !== false
      const uVars = obterVariantesVendedor(uNome)
      const uRegs = extrairRegioesDeUsuario(u)
      const uObj = { id: u.id, nome: uNome, ativo: uAtivo, variantes: uVars, regioes: uRegs }
      if (uAtivo) listaAtivos.push(uObj)
      else listaInativos.push(uObj)
    }

    // Matriz de cadeiras por rota
    let regioesComerciaisRecs = []
    try {
      regioesComerciaisRecs = app.findRecordsByFilter(
        'regioes',
        "tipo = 'comercial' && ativo = true",
        'ordem',
        50,
        0,
      )
    } catch (_) {}
    const matrizCadeirasPorRota = {}
    for (let rgI = 0; rgI < regioesComerciaisRecs.length; rgI++) {
      const rg = regioesComerciaisRecs[rgI]
      matrizCadeirasPorRota[normalizarTextoNFD(rg.getString('nome'))] = {
        nome: rg.getString('nome'),
        corporativo: rg.getString('corporativo') || '',
        especialista: rg.getString('especialista') || '',
        vendedor_externo: rg.getString('vendedor_externo') || '',
      }
    }

    // Cidades -> rotas
    let cidadesRotasRecs = []
    try {
      cidadesRotasRecs = app.findRecordsByFilter('cidades_rotas', 'ativo = true', 'cidade', 1000, 0)
    } catch (_) {}
    const mapaCidadeParaRota = {}
    for (let crIdx = 0; crIdx < cidadesRotasRecs.length; crIdx++) {
      const cRec = cidadesRotasRecs[crIdx]
      const cn = cRec.getString('cidade_normalizada')
      if (cn) mapaCidadeParaRota[cn] = normalizarTextoNFD(cRec.getString('rota'))
    }

    const classificarTipoCadeiraCliente = (vendedorStr, tipoVendStr) => {
      const vNorm = normalizarTextoNFD(vendedorStr)
      const tNorm = normalizarTextoNFD(tipoVendStr)
      if (
        vNorm.startsWith('VCORP') ||
        vNorm.includes('VCORP') ||
        tNorm === 'CORPORATIVO' ||
        tNorm.includes('CORPORATIVO')
      ) {
        return 'corporativo'
      }
      return 'especialista_externo'
    }

    const resolverRotaDoCliente = (clienteRec) => {
      const cidCli = extrairCidadeCliente(clienteRec)
      if (cidCli && mapaCidadeParaRota[cidCli]) return mapaCidadeParaRota[cidCli]
      if (cidCli) {
        const keys = Object.keys(mapaCidadeParaRota)
        for (let kI = 0; kI < keys.length; kI++) {
          const k = keys[kI]
          if (cidCli === k || cidCli.includes(k) || k.includes(cidCli)) return mapaCidadeParaRota[k]
        }
      }
      const endCli = normalizarTextoNFD(clienteRec.getString('endereco'))
      if (endCli) {
        const keys = Object.keys(mapaCidadeParaRota)
        for (let kI = 0; kI < keys.length; kI++) {
          const k = keys[kI]
          if (k.length >= 4 && endCli.includes(k)) return mapaCidadeParaRota[k]
        }
      }
      const regCliNorm = normalizarTextoNFD(clienteRec.getString('regiao'))
      if (regCliNorm && matrizCadeirasPorRota[regCliNorm]) return regCliNorm
      return ''
    }

    const buscarColaboradorAtivoPorNomeMatriz = (nomeMatriz) => {
      if (!nomeMatriz || !nomeMatriz.trim()) return null
      const nNorm = normalizarTextoNFD(nomeMatriz)
      const nVars = obterVariantesVendedor(nNorm)
      for (let i = 0; i < listaAtivos.length; i++) {
        const at = listaAtivos[i]
        const atNorm = normalizarTextoNFD(at.nome)
        if (nNorm === atNorm || nNorm.includes(atNorm) || atNorm.includes(nNorm)) return at
        for (let vI = 0; vI < nVars.length; vI++) {
          const vItem = nVars[vI]
          if (vItem.length >= 3 && (atNorm.includes(vItem) || at.variantes.includes(vItem)))
            return at
        }
        for (let aV = 0; aV < at.variantes.length; aV++) {
          const aItem = at.variantes[aV]
          if (aItem.length >= 3 && nNorm.includes(aItem)) return at
        }
      }
      return null
    }

    const checarStatusVendedorCadastro = (vendedorStr) => {
      if (!vendedorStr || !vendedorStr.trim()) return { temCadastro: false, ativo: false }
      const vLimpo = normalizarTextoNFD(limparPrefixoVendedor(vendedorStr))
      if (!vLimpo || vLimpo.length < 3) return { temCadastro: false, ativo: false }
      for (let aIdx = 0; aIdx < listaAtivos.length; aIdx++) {
        const atUser = listaAtivos[aIdx]
        const atNorm = normalizarTextoNFD(atUser.nome)
        if (vLimpo === atNorm || vLimpo.includes(atNorm) || atNorm.includes(vLimpo)) {
          return { temCadastro: true, ativo: true, usuario: atUser }
        }
        for (let vI = 0; vI < atUser.variantes.length; vI++) {
          const vItem = atUser.variantes[vI]
          if (vItem.length >= 3 && (vLimpo.includes(vItem) || vItem.includes(vLimpo))) {
            return { temCadastro: true, ativo: true, usuario: atUser }
          }
        }
      }
      for (let inIdx = 0; inIdx < listaInativos.length; inIdx++) {
        const inUser = listaInativos[inIdx]
        const inNorm = normalizarTextoNFD(inUser.nome)
        if (vLimpo === inNorm || vLimpo.includes(inNorm) || inNorm.includes(vLimpo)) {
          return { temCadastro: true, ativo: false, usuario: inUser }
        }
        for (let vI = 0; vI < inUser.variantes.length; vI++) {
          const vItem = inUser.variantes[vI]
          if (vItem.length >= 3 && (vLimpo.includes(vItem) || vItem.includes(vLimpo))) {
            return { temCadastro: true, ativo: false, usuario: inUser }
          }
        }
      }
      if (vLimpo.includes('KAYLANE')) {
        return { temCadastro: true, ativo: false, nome: 'KAYLANE SILVA' }
      }
      return { temCadastro: false, ativo: false }
    }

    const resolverDestinoRoteamentov3 = (clienteRec) => {
      const vRaw = clienteRec.getString('vendedor') || ''
      const tipoVendRaw = clienteRec.getString('tipo_vendedor') || ''
      const rotaCliente = resolverRotaDoCliente(clienteRec)
      const tipoCadeira = classificarTipoCadeiraCliente(vRaw, tipoVendRaw)
      const statusV = checarStatusVendedorCadastro(vRaw)

      // Filtro 1: Nome do vendedor
      if (statusV.temCadastro && statusV.ativo && statusV.usuario) {
        const uVendedor = statusV.usuario
        const uRegs = uVendedor.regioes || []
        const mesmaRota = rotaCliente ? uRegs.includes(rotaCliente) : true
        let mesmaCadeira = true
        if (rotaCliente && matrizCadeirasPorRota[rotaCliente]) {
          const cadRota = matrizCadeirasPorRota[rotaCliente]
          const uNomeNorm = normalizarTextoNFD(uVendedor.nome)
          if (tipoCadeira === 'corporativo') {
            const cNorm = normalizarTextoNFD(cadRota.corporativo)
            mesmaCadeira = cNorm && (uNomeNorm.includes(cNorm) || cNorm.includes(uNomeNorm))
          } else {
            const eNorm = normalizarTextoNFD(cadRota.especialista)
            const veNorm = normalizarTextoNFD(cadRota.vendedor_externo)
            mesmaCadeira =
              (eNorm && (uNomeNorm.includes(eNorm) || eNorm.includes(uNomeNorm))) ||
              (veNorm && (uNomeNorm.includes(veNorm) || veNorm.includes(uNomeNorm)))
          }
        }
        if (mesmaRota && mesmaCadeira) {
          return {
            filtro: 'primario_nominal',
            operador_id: uVendedor.id,
            operador_nome: uVendedor.nome,
            rota: rotaCliente,
            cadeira: tipoCadeira,
          }
        }
      }

      // Filtros 2 e 3: Cadeira da rota
      if (rotaCliente && matrizCadeirasPorRota[rotaCliente]) {
        const cadRota = matrizCadeirasPorRota[rotaCliente]
        let titular = ''
        let nomeCad = ''
        if (tipoCadeira === 'corporativo') {
          titular = cadRota.corporativo
          nomeCad = 'corporativo'
        } else {
          titular = cadRota.especialista || cadRota.vendedor_externo
          nomeCad = cadRota.especialista ? 'especialista' : 'vendedor_externo'
        }
        if (titular) {
          const opTitular = buscarColaboradorAtivoPorNomeMatriz(titular)
          if (opTitular) {
            const temPrefixoTipo =
              normalizarTextoNFD(vRaw).startsWith('VCORP') ||
              normalizarTextoNFD(vRaw).startsWith('VARE')
            return {
              filtro: temPrefixoTipo ? 'secundario_tipo' : 'terciario_regiao',
              operador_id: opTitular.id,
              operador_nome: opTitular.nome,
              rota: rotaCliente,
              cadeira: nomeCad,
            }
          }
        }
      }

      return {
        filtro: 'sem_destino',
        operador_id: '',
        operador_nome: '',
        rota: rotaCliente,
        cadeira: tipoCadeira,
      }
    }

    // AUDITORIA DOS CLIENTES EM na_base
    console.log('[0115_auditoria_roteamento_v3] Iniciando auditoria dos clientes na base...')
    const clientesBase = app.findRecordsByFilter(
      'clientes',
      "estado = 'na_base' && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa'",
      'id',
      2000,
      0,
    )

    let totalNominal = 0
    let totalTipo = 0
    let totalRegiao = 0
    let totalAtacado = 0
    let totalSemDestino = 0

    let kaylaneTotal = 0
    let kaylaneParaJosiane = 0

    // Teste regressão atacado
    let agroparanaDestino = null

    for (let cI = 0; cI < clientesBase.length; cI++) {
      const c = clientesBase[cI]
      const v = c.getString('vendedor') || ''

      if (isClienteAtacado(c)) {
        totalAtacado++
        if (c.id === 'ne7ys3txxqjen4a') {
          const ddd = extrairDddCliente(c)
          let opAtacado = 'Não atribuído'
          if (['15', '19'].includes(ddd)) opAtacado = 'Julio Melo'
          else if (['11', '12', '13'].includes(ddd)) opAtacado = 'Larissa Terra'
          else if (['14', '16', '17', '18'].includes(ddd)) opAtacado = 'Wilson Neto'
          agroparanaDestino = { ddd: ddd, operador: opAtacado }
        }
        continue
      }

      const dest = resolverDestinoRoteamentov3(c)
      if (dest.filtro === 'primario_nominal') totalNominal++
      else if (dest.filtro === 'secundario_tipo') totalTipo++
      else if (dest.filtro === 'terciario_regiao') totalRegiao++
      else totalSemDestino++

      if (normalizarTextoNFD(v).includes('KAYLANE')) {
        kaylaneTotal++
        if (normalizarTextoNFD(dest.operador_nome).includes('JOSIANE')) {
          kaylaneParaJosiane++
        }
      }
    }

    console.log(`[0115_auditoria_roteamento_v3] RESULTADOS DA AUDITORIA:`)
    console.log(`- Total de clientes na_base auditados: ${clientesBase.length}`)
    console.log(`- Atacado (blindado por DDD): ${totalAtacado}`)
    console.log(`- Filtro 1 (Primário Nominal): ${totalNominal}`)
    console.log(`- Filtro 2 (Secundário Tipo - VCORP/VARE): ${totalTipo}`)
    console.log(`- Filtro 3 (Terciário Região): ${totalRegiao}`)
    console.log(`- Sem Destino (Rotas sem cadeira): ${totalSemDestino}`)
    console.log(`- Clientes Kaylane auditados: ${kaylaneTotal}`)
    console.log(`- Clientes Kaylane direcionados para Josiane Frazão: ${kaylaneParaJosiane}`)
    if (agroparanaDestino) {
      console.log(
        `- Teste ne7ys3txxqjen4a (COMERCIAL AGROPECUARIA DO NORTE DO PARANA): DDD ${agroparanaDestino.ddd} -> ${agroparanaDestino.operador}`,
      )
    }

    // Registra evento de auditoria no eventos_log
    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'censo_roteamento_v3')
      ev.set('detalhes', {
        total_clientes_auditados: clientesBase.length,
        total_atacado: totalAtacado,
        total_filtro_1_nominal: totalNominal,
        total_filtro_2_tipo: totalTipo,
        total_filtro_3_regiao: totalRegiao,
        total_sem_destino: totalSemDestino,
        kaylane_total: kaylaneTotal,
        kaylane_para_josiane: kaylaneParaJosiane,
        agroparana_teste: agroparanaDestino,
        data_censo: new Date().toISOString(),
      })
      app.save(ev)
    } catch (_) {}
  },
  (app) => {},
)
