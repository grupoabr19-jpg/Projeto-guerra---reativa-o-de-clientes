/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/backend/v1/metrics/listas-colaborador',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = String(authRecord.getString('role') || 'operador').trim()
      const userName = String(authRecord.getString('name') || '').trim()
      const userId = String(authRecord.id).trim()

      let userRegioes = []
      try {
        const slice = authRecord.getStringSlice('regioes')
        if (slice && slice.length > 0) userRegioes = slice
        else {
          const raw = authRecord.getString('regioes')
          if (raw && raw.startsWith('[')) {
            userRegioes = JSON.parse(raw)
          }
        }
      } catch (_) {}

      // Parâmetros opcionais (supervisores/admins e líderes podem filtrar mais)
      const q = e.requestInfo().query || {}
      const filtroRegiao = String(q.regiao || '').trim()
      const filtroOperador = String(q.operador || '').trim()
      const tipoLista = String(q.tipo || 'todas').trim() // reativados | reagendados | followups | todas
      const limit = Math.min(Math.max(parseInt(q.limit || '100', 10), 10), 500)

      // Helpers inline
      function normalizarTextoNFD(s) {
        if (!s) return ''
        let res = String(s).toUpperCase().trim()
        res = res.replace(/[ÁÀÃÂÄ]/g, 'A')
        res = res.replace(/[ÉÈÊË]/g, 'E')
        res = res.replace(/[ÍÌÎÏ]/g, 'I')
        res = res.replace(/[ÓÒÕÔÖ]/g, 'O')
        res = res.replace(/[ÚÙÛÜ]/g, 'U')
        res = res.replace(/[Ç]/g, 'C')
        res = res.replace(/[^A-Z0-9\s/_-]/g, ' ')
        return res.replace(/\s+/g, ' ').trim()
      }

      function limparPrefixoVendedor(vendedorStr) {
        let v = normalizarTextoNFD(vendedorStr)
        const prefixos = [
          'VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ', 'VARC - ', 'ADMV - ', 'ATF - ',
          'ESPECIALISTE - ', 'ESPECIALISTA - ', 'EXT - ', 'INT - ', 'REP - ',
          'VARE-', 'VCORP-', 'VAREXT-', 'ATR-', 'VARC-', 'ADMV-', 'ATF-', 'EXT-', 'INT-', 'REP-',
        ]
        for (let i = 0; i < prefixos.length; i++) {
          const p = normalizarTextoNFD(prefixos[i])
          if (v.startsWith(p)) {
            v = v.slice(p.length).trim()
            break
          }
        }
        const rotasSufixo = [
          ' - BRAGANCA', ' - BRAGANCA PAULISTA', ' - JUNDIAI', ' - VARGINHA',
          ' - POUSO ALEGRE', ' - POCOS DE CALDAS', ' - POCOS CALDAS', ' - ITAJUBA',
          ' - EXTREMA', ' - CAMBUI', ' - ATACADO',
        ]
        for (let j = 0; j < rotasSufixo.length; j++) {
          const s = normalizarTextoNFD(rotasSufixo[j])
          if (v.endsWith(s)) {
            v = v.slice(0, v.length - s.length).trim()
            break
          }
        }
        return v
      }

      function extrairCidadeCliente(enderecoRaw) {
        if (!enderecoRaw) return ''
        const end = String(enderecoRaw).trim()
        const partesHifen = end.split('-')
        if (partesHifen.length >= 2) {
          const antesUf = partesHifen[partesHifen.length - 2].trim()
          const partesVirgula = antesUf.split(',')
          const possivelCidade = partesVirgula[partesVirgula.length - 1].trim()
          if (possivelCidade) return possivelCidade
        }
        const partesVirgula = end.split(',')
        if (partesVirgula.length > 1) {
          return partesVirgula[partesVirgula.length - 1].trim()
        }
        return end
      }

      function formatBrasiliaDate(utcStr) {
        if (!utcStr) return ''
        try {
          const d = new Date(utcStr)
          if (isNaN(d.getTime())) return ''
          const brMs = d.getTime() - 3 * 60 * 60 * 1000
          const brD = new Date(brMs)
          const y = brD.getUTCFullYear()
          const m = String(brD.getUTCMonth() + 1).padStart(2, '0')
          const dia = String(brD.getUTCDate()).padStart(2, '0')
          const h = String(brD.getUTCHours()).padStart(2, '0')
          const min = String(brD.getUTCMinutes()).padStart(2, '0')
          return `${dia}/${m}/${y} ${h}:${min}`
        } catch (_) {
          return String(utcStr)
        }
      }

      // DETERMINAÇÃO DO ESCOPO DO CHAMADOR:
      // - supervisor / admin: tudo (pode filtrar por regiao e operador se enviados)
      // - lider: todos os atendimentos/clientes da rota dele (userRegioes)
      // - vendedor_externo: clientes da sua própria carteira (vendedor ~ nome dele)
      // - operador: só atendimentos dele (i.operador = userId ou c.operador = userId ou vendedor ~ nome)
      let scopeClienteCond = '1=1'
      let scopeInteracaoCond = '1=1'
      const bindParams = {}

      const userNorm = normalizarTextoNFD(userName)
      const userTokens = userNorm.split(/\s+/).filter((t) => t.length >= 3)
      const primeNome = userTokens.length > 0 ? userTokens[0] : userNorm

      if (userRole === 'admin' || userRole === 'supervisor') {
        // Sem restrição forçada, respeita filtros enviados
        if (filtroRegiao && filtroRegiao.toLowerCase() !== 'todas') {
          scopeClienteCond += ' AND c.regiao = {:filtroRegiao}'
          bindParams.filtroRegiao = filtroRegiao
        }
        if (filtroOperador && filtroOperador.toLowerCase() !== 'todos') {
          scopeInteracaoCond += ' AND (i.operador = {:filtroOp} OR u.name = {:filtroOp} OR c.operador = {:filtroOp})'
          bindParams.filtroOp = filtroOperador
        }
      } else if (userRole === 'lider') {
        // Líder de rota: todos da sua rota
        if (userRegioes.length > 0) {
          const regParts = []
          for (let ri = 0; ri < userRegioes.length; ri++) {
            const rKey = `liderReg_${ri}`
            regParts.push(`c.regiao = {:${rKey}}`)
            bindParams[rKey] = userRegioes[ri]
          }
          scopeClienteCond += ' AND (' + regParts.join(' OR ') + ')'
        }
        // Se o líder selecionar um operador específico do time dele
        if (filtroOperador && filtroOperador.toLowerCase() !== 'todos') {
          scopeInteracaoCond += ' AND (i.operador = {:filtroOp} OR u.name = {:filtroOp} OR c.operador = {:filtroOp})'
          bindParams.filtroOp = filtroOperador
        }
      } else {
        // Operador padrão ou Vendedor Externo:
        // Restrito aos seus atendimentos e à sua carteira
        scopeInteracaoCond += ' AND (i.operador = {:myUserId} OR c.operador = {:myUserId} OR c.vendedor LIKE {:myNomeLike})'
        scopeClienteCond += ' AND (c.operador = {:myUserId} OR c.vendedor LIKE {:myNomeLike})'
        bindParams.myUserId = userId
        bindParams.myNomeLike = '%' + primeNome + '%'
      }

      // Regra básica: ignorar ativo_fora_base
      const baseCliFilter = "c.estado != 'ativo_fora_base' AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)"

      // 1. LISTA 1: CLIENTES REATIVADOS
      // Apenas reativações reais com operador preenchido e interação confirmada
      let reativadosList = []
      if (tipoLista === 'todas' || tipoLista === 'reativados') {
        const reatSql = `
          SELECT
            c.id as cliente_id,
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            c.vendedor as vendedor_origem,
            COALESCE(u.name, c.operador, '') as operador_nome,
            COALESCE(i.numero_pedido, c.pedido_reativacao, '') as pedido,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(i.created, c.reativado_em, c.updated) as data_reativacao
          FROM clientes c
          INNER JOIN interacoes i ON i.cliente = c.id
          LEFT JOIN users u ON u.id = i.operador
          WHERE c.estado = 'reativado'
            AND c.operador IS NOT NULL AND TRIM(c.operador) != ''
            AND ${baseCliFilter}
            AND (i.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
                 OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-'))
            AND ${scopeClienteCond}
            AND ${scopeInteracaoCond}
          ORDER BY data_reativacao DESC
          LIMIT ${limit}
        `

        const reatRows = arrayOf(new DynamicModel({
          cliente_id: '',
          codigo: '',
          nome: '',
          endereco: '',
          regiao: '',
          vendedor_origem: '',
          operador_nome: '',
          pedido: '',
          valor: -0,
          data_reativacao: '',
        }))

        const qbReat = $app.db().newQuery(reatSql)
        if (Object.keys(bindParams).length > 0) qbReat.bind(bindParams)
        qbReat.all(reatRows)

        const vistosReat = {}
        for (let idx = 0; idx < reatRows.length; idx++) {
          const r = reatRows[idx]
          if (vistosReat[r.cliente_id]) continue
          vistosReat[r.cliente_id] = true
          reativadosList.push({
            id: r.cliente_id,
            codigo: r.codigo,
            nome: r.nome,
            cidade: extrairCidadeCliente(r.endereco),
            regiao: r.regiao,
            vendedorOrigem: r.vendedor_origem,
            operadorResponsavel: r.operador_nome,
            pedido: r.pedido,
            valor: Number(r.valor || 0),
            data: r.data_reativacao,
            dataFormatada: formatBrasiliaDate(r.data_reativacao),
          })
        }
      }

      // 2. LISTA 2: CLIENTES REAGENDADOS
      let reagendadosList = []
      if (tipoLista === 'todas' || tipoLista === 'reagendados') {
        const reagSql = `
          SELECT
            c.id as cliente_id,
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            c.vendedor as vendedor_origem,
            COALESCE(u.name, c.operador, '') as operador_nome,
            i.created as data_atendimento,
            COALESCE(i.reagendado_para, c.reagendado_para) as reagendado_para,
            COALESCE(i.motivo, i.conteudo, '') as motivo
          FROM interacoes i
          INNER JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE ${baseCliFilter}
            AND (i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != ''))
            AND ${scopeClienteCond}
            AND ${scopeInteracaoCond}
          ORDER BY i.created DESC
          LIMIT ${limit}
        `

        const reagRows = arrayOf(new DynamicModel({
          cliente_id: '',
          codigo: '',
          nome: '',
          endereco: '',
          regiao: '',
          vendedor_origem: '',
          operador_nome: '',
          data_atendimento: '',
          reagendado_para: '',
          motivo: '',
        }))

        const qbReag = $app.db().newQuery(reagSql)
        if (Object.keys(bindParams).length > 0) qbReag.bind(bindParams)
        qbReag.all(reagRows)

        const vistosReag = {}
        for (let idx = 0; idx < reagRows.length; idx++) {
          const r = reagRows[idx]
          if (vistosReag[r.cliente_id]) continue
          vistosReag[r.cliente_id] = true
          reagendadosList.push({
            id: r.cliente_id,
            codigo: r.codigo,
            nome: r.nome,
            cidade: extrairCidadeCliente(r.endereco),
            regiao: r.regiao,
            vendedorOrigem: r.vendedor_origem,
            operadorResponsavel: r.operador_nome,
            dataAtendimento: r.data_atendimento,
            dataAtendimentoFormatada: formatBrasiliaDate(r.data_atendimento),
            reagendadoPara: r.reagendado_para,
            reagendadoParaFormatada: formatBrasiliaDate(r.reagendado_para),
            motivo: r.motivo,
          })
        }
      }

      // 3. LISTA 3: FOLLOW-UPS PROGRAMADOS
      let followupsList = []
      if (tipoLista === 'todas' || tipoLista === 'followups') {
        const follSql = `
          SELECT
            c.id as cliente_id,
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            c.vendedor as vendedor_origem,
            c.telefone as telefone,
            c.whatsapp as whatsapp,
            c.reagendado_para as data_retorno,
            COALESCE(u.name, c.operador, '') as operador_nome,
            c.estado as estado
          FROM clientes c
          LEFT JOIN users u ON u.id = c.operador
          WHERE ${baseCliFilter}
            AND c.reagendado_para IS NOT NULL AND TRIM(c.reagendado_para) != ''
            AND ${scopeClienteCond}
          ORDER BY c.reagendado_para ASC
          LIMIT ${limit}
        `

        const follRows = arrayOf(new DynamicModel({
          cliente_id: '',
          codigo: '',
          nome: '',
          endereco: '',
          regiao: '',
          vendedor_origem: '',
          telefone: '',
          whatsapp: '',
          data_retorno: '',
          operador_nome: '',
          estado: '',
        }))

        const qbFoll = $app.db().newQuery(follSql)
        if (Object.keys(bindParams).length > 0) qbFoll.bind(bindParams)
        qbFoll.all(follRows)

        for (let idx = 0; idx < follRows.length; idx++) {
          const r = follRows[idx]
          followupsList.push({
            id: r.cliente_id,
            codigo: r.codigo,
            nome: r.nome,
            cidade: extrairCidadeCliente(r.endereco),
            regiao: r.regiao,
            vendedorOrigem: r.vendedor_origem,
            telefone: r.telefone || r.whatsapp || '',
            operadorResponsavel: r.operador_nome,
            dataRetorno: r.data_retorno,
            dataRetornoFormatada: formatBrasiliaDate(r.data_retorno),
            estado: r.estado,
          })
        }
      }

      return e.json(200, {
        scope: {
          role: userRole,
          userId: userId,
          userName: userName,
          regioes: userRegioes,
        },
        totais: {
          reativados: reativadosList.length,
          reagendados: reagendadosList.length,
          followups: followupsList.length,
        },
        reativados: reativadosList,
        reagendados: reagendadosList,
        followups: followupsList,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[listas_colaborador] Erro: ' + msg)
      return e.json(500, { error: 'Erro ao carregar listas do colaborador: ' + msg })
    }
  },
  $apis.requireAuth(),
)
