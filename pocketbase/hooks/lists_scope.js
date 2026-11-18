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
      const dataInicialParam = String(q.data_inicial || '').trim()
      const dataFinalParam = String(q.data_final || '').trim()
      const dataInicialValida = /^\d{4}-\d{2}-\d{2}$/.test(dataInicialParam)
      const dataFinalValida = /^\d{4}-\d{2}-\d{2}$/.test(dataFinalParam)

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
          'VARE-',
          'VCORP-',
          'VAREXT-',
          'ATR-',
          'VARC-',
          'ADMV-',
          'ATF-',
          'EXT-',
          'INT-',
          'REP-',
        ]
        for (let i = 0; i < prefixos.length; i++) {
          const p = normalizarTextoNFD(prefixos[i])
          if (v.startsWith(p)) {
            v = v.slice(p.length).trim()
            break
          }
        }
        const rotasSufixo = [
          ' - BRAGANCA',
          ' - BRAGANCA PAULISTA',
          ' - JUNDIAI',
          ' - VARGINHA',
          ' - POUSO ALEGRE',
          ' - POCOS DE CALDAS',
          ' - POCOS CALDAS',
          ' - ITAJUBA',
          ' - EXTREMA',
          ' - CAMBUI',
          ' - ATACADO',
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
          scopeInteracaoCond +=
            ' AND (i.operador = {:filtroOp} OR u.name = {:filtroOp} OR c.operador = {:filtroOp})'
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
          scopeInteracaoCond +=
            ' AND (i.operador = {:filtroOp} OR u.name = {:filtroOp} OR c.operador = {:filtroOp})'
          bindParams.filtroOp = filtroOperador
        }
      } else {
        // Operador padrão ou Vendedor Externo:
        // Restrito aos seus atendimentos e à sua carteira
        scopeInteracaoCond +=
          ' AND (i.operador = {:myUserId} OR c.operador = {:myUserId} OR c.vendedor LIKE {:myNomeLike})'
        scopeClienteCond += ' AND (c.operador = {:myUserId} OR c.vendedor LIKE {:myNomeLike})'
        bindParams.myUserId = userId
        bindParams.myNomeLike = '%' + primeNome + '%'
      }

      // Regra básica: ignorar ativo_fora_base
      const baseCliFilter =
        "c.estado != 'ativo_fora_base' AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)"

      // Janela temporal personalizada sobre o timestamp da interação (i.created)
      let janelaInteracaoCond = ''
      if (dataInicialValida) {
        janelaInteracaoCond += ' AND i.created >= {:janelaStartUtc}'
        bindParams.janelaStartUtc = `${dataInicialParam} 03:00:00.000Z`
      }
      if (dataFinalValida) {
        const pF = dataFinalParam.split('-')
        const fimD = new Date(
          Date.UTC(
            parseInt(pF[0], 10),
            parseInt(pF[1], 10) - 1,
            parseInt(pF[2], 10) + 1,
            2,
            59,
            59,
            999,
          ),
        )
        janelaInteracaoCond += ' AND i.created <= {:janelaEndUtc}'
        bindParams.janelaEndUtc = fimD.toISOString()
      }
      // Follow-ups são por data futura de retorno (reagendado_para) — janela em dias
      let janelaFollowupCond = ''
      if (dataInicialValida) {
        janelaFollowupCond += ' AND c.reagendado_para >= {:janelaFuInicio}'
        bindParams.janelaFuInicio = `${dataInicialParam} 00:00:00.000Z`
      }
      if (dataFinalValida) {
        janelaFollowupCond += ' AND c.reagendado_para <= {:janelaFuFim}'
        bindParams.janelaFuFim = `${dataFinalParam} 23:59:59.999Z`
      }

      // REGUA REAL EQUIPE (cópia inline de metrics_base_kpis.js — manter idêntica).
      // Mesma base, mesma prova de reativação, mesma janela e mesmo complemento de fichas
      // que o card "Real Equipe": ERP vence; ficha só complementa valor/kg quando vazio no ERP.
      const REGUA = (function () {
        const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

        const REGIAO_GRUPOS = [
          ['BRAGANÇA', ['BRAGANÇA', 'BRAGANCA', 'BRAGANÇA PAULISTA', 'BRAGANCA PAULISTA']],
          ['CAMBUÍ', ['CAMBUÍ', 'CAMBUI', 'MICRO-REGIÃO', 'MICRO REGIAO', 'MICROREGIAO']],
          [
            'POÇOS DE CALDAS',
            [
              'POÇOS DE CALDAS',
              'POCOS DE CALDAS',
              'POÇOS CALDAS',
              'POCOS CALDAS',
              'POÇOS',
              'POCOS',
            ],
          ],
          ['JUNDIAÍ', ['JUNDIAÍ', 'JUNDIAI']],
          ['ITAJUBÁ', ['ITAJUBÁ', 'ITAJUBA']],
          ['VARGINHA', ['VARGINHA']],
          ['POUSO ALEGRE', ['POUSO ALEGRE']],
          ['EXTREMA', ['EXTREMA']],
          ['ATACADO', ['ATACADO']],
          ['REPESCAGEM', ['REPESCAGEM']],
        ]

        function grupoDeRegiao(upper) {
          for (let g = 0; g < REGIAO_GRUPOS.length; g++) {
            if (REGIAO_GRUPOS[g][1].indexOf(upper) !== -1) return REGIAO_GRUPOS[g]
          }
          return null
        }

        function sqlExisteInteracaoReativacao(refCliente, iAlias) {
          const I = iAlias || 'i_chk'
          return (
            'EXISTS (SELECT 1 FROM interacoes ' +
            I +
            ' WHERE ' +
            I +
            '.cliente = ' +
            refCliente +
            ' AND (' +
            I +
            '.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            ' OR (' +
            I +
            '.numero_pedido IS NOT NULL AND TRIM(' +
            I +
            ".numero_pedido) != '' AND TRIM(" +
            I +
            ".numero_pedido) != '-')))"
          )
        }

        function sqlExisteInteracaoReativacaoComOperador(refCliente, iAlias) {
          const I = iAlias || 'i_chk2'
          return (
            'EXISTS (SELECT 1 FROM interacoes ' +
            I +
            ' WHERE ' +
            I +
            '.cliente = ' +
            refCliente +
            ' AND ' +
            I +
            '.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            ' AND ' +
            I +
            '.operador IS NOT NULL AND TRIM(' +
            I +
            ".operador) != '')"
          )
        }

        // RÉGUA OFICIAL DE REATIVAÇÃO: operador_reativacao OU interação com operador real + prova de reativação.
        function sqlReativacaoReal(a) {
          const p = a ? a + '.' : ''
          const ref = a ? a + '.id' : 'clientes.id'
          return (
            '(' +
            p +
            "estado = 'reativado' AND ((" +
            p +
            'operador_reativacao IS NOT NULL AND TRIM(' +
            p +
            "operador_reativacao) != '') OR " +
            sqlExisteInteracaoReativacaoComOperador(ref) +
            ') AND ' +
            sqlExisteInteracaoReativacao(ref) +
            ')'
          )
        }

        function sqlJanelaInteracoes(refCliente, janela, iAlias) {
          if (!janela || !janela.ativa) return '1=1'
          const I = iAlias || 'i_win'
          return (
            'EXISTS (SELECT 1 FROM interacoes ' +
            I +
            ' WHERE ' +
            I +
            '.cliente = ' +
            refCliente +
            ' AND ' +
            I +
            '.created >= {:janelaInicio} AND ' +
            I +
            '.created <= {:janelaFim} AND (' +
            I +
            '.desfecho IN ' +
            DESFECHOS_REATIVACAO +
            ' OR (' +
            I +
            '.numero_pedido IS NOT NULL AND TRIM(' +
            I +
            ".numero_pedido) != '' AND TRIM(" +
            I +
            ".numero_pedido) != '-')))"
          )
        }

        function parseJanela(dataInicial, dataFinal) {
          const di = String(dataInicial || '').trim()
          const df = String(dataFinal || '').trim()
          const res = { ativa: false, inicioIso: '', fimIso: '', dataInicial: di, dataFinal: df }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || !/^\d{4}-\d{2}-\d{2}$/.test(df)) return res
          const pF = df.split('-')
          res.ativa = true
          res.inicioIso = di + ' 03:00:00.000Z'
          res.fimIso = new Date(
            Date.UTC(
              parseInt(pF[0], 10),
              parseInt(pF[1], 10) - 1,
              parseInt(pF[2], 10) + 1,
              2,
              59,
              59,
              999,
            ),
          ).toISOString()
          return res
        }

        function sqlRegiao(regiaoParam, pfx, bindParams) {
          const p = pfx || ''
          const reg = String(regiaoParam || '').trim()
          if (!reg || reg.toLowerCase() === 'todas') return ''
          const col = p + 'regiao'
          const upper = reg.toUpperCase().trim()
          if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
            return (
              ' AND (' +
              col +
              " = '' OR " +
              col +
              ' IS NULL OR UPPER(TRIM(' +
              col +
              ")) = 'SEM REGIÃO' OR UPPER(TRIM(" +
              col +
              ")) = 'SEM REGIAO')"
            )
          }
          const grupo = grupoDeRegiao(upper)
          if (grupo) {
            const u = 'UPPER(TRIM(' + col + '))'
            return (
              ' AND (' +
              grupo[1]
                .map(function (v) {
                  return u + " = '" + v + "'"
                })
                .join(' OR ') +
              ')'
            )
          }
          if (bindParams) {
            bindParams.regiaoParam = upper
            bindParams.regiaoLike = '%' + upper + '%'
          }
          return (
            ' AND (UPPER(TRIM(' +
            col +
            ')) = {:regiaoParam} OR UPPER(TRIM(' +
            col +
            ')) LIKE {:regiaoLike})'
          )
        }

        return {
          parseJanela: parseJanela,
          sqlRegiao: sqlRegiao,
          sqlReativacaoReal: sqlReativacaoReal,
          sqlJanelaInteracoes: sqlJanelaInteracoes,
        }
      })()

      // 1. LISTA 1: CLIENTES REATIVADOS — mesma régua do card Real Equipe (contagem, valor e kg batem)
      let reativadosList = []
      if (tipoLista === 'todas' || tipoLista === 'reativados') {
        const bReat = {}
        let escopoReat = ''
        if (userRole === 'admin' || userRole === 'supervisor') {
          escopoReat += REGUA.sqlRegiao(filtroRegiao, 'c.', bReat)
        } else if (userRole === 'lider') {
          if (userRegioes.length > 0) {
            const regPartsR = []
            for (let rj = 0; rj < userRegioes.length; rj++) {
              const kR = 'liderRegR_' + rj
              regPartsR.push('c.regiao = {:' + kR + '}')
              bReat[kR] = userRegioes[rj]
            }
            escopoReat += ' AND (' + regPartsR.join(' OR ') + ')'
          }
        } else {
          escopoReat +=
            ' AND (c.operador = {:myUserId} OR c.operador_reativacao = {:myUserId} OR c.vendedor LIKE {:myNomeLike} OR EXISTS (SELECT 1 FROM interacoes ipo WHERE ipo.cliente = c.id AND ipo.operador = {:myUserId}))'
          bReat.myUserId = userId
          bReat.myNomeLike = '%' + primeNome + '%'
        }
        if (
          (userRole === 'admin' || userRole === 'supervisor' || userRole === 'lider') &&
          filtroOperador &&
          filtroOperador.toLowerCase() !== 'todos'
        ) {
          escopoReat +=
            ' AND (c.operador_reativacao = {:filtroOp} OR c.operador = {:filtroOp} OR EXISTS (SELECT 1 FROM interacoes ipf LEFT JOIN users upf ON upf.id = ipf.operador WHERE ipf.cliente = c.id AND (ipf.operador = {:filtroOp} OR upf.name = {:filtroOp})))'
          bReat.filtroOp = filtroOperador
        }

        const janelaReat = REGUA.parseJanela(dataInicialParam, dataFinalParam)
        if (janelaReat.ativa) {
          bReat.janelaInicio = janelaReat.inicioIso
          bReat.janelaFim = janelaReat.fimIso
        }
        const janelaCondReat = REGUA.sqlJanelaInteracoes('c.id', janelaReat, 'i_win')
        const condReativados = `
            ${baseCliFilter}
            AND ${REGUA.sqlReativacaoReal('c')}
            AND ${janelaCondReat}
            ${escopoReat}
        `

        const reatSql = `
          SELECT
            c.id as cliente_id,
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            c.vendedor as vendedor_origem,
            COALESCE((SELECT up.name FROM interacoes ip LEFT JOIN users up ON up.id = ip.operador
                      WHERE ip.cliente = c.id
                        AND ip.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
                        AND ip.operador IS NOT NULL AND TRIM(ip.operador) != ''
                      ORDER BY ip.created DESC LIMIT 1), c.operador, c.operador_reativacao, '') as operador_nome,
            COALESCE((SELECT ip2.numero_pedido FROM interacoes ip2
                      WHERE ip2.cliente = c.id AND ip2.numero_pedido IS NOT NULL
                        AND TRIM(ip2.numero_pedido) != '' AND TRIM(ip2.numero_pedido) != '-'
                      ORDER BY ip2.created DESC LIMIT 1), c.pedido_reativacao, '') as pedido,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(NULLIF(c.toneladas_historico, 0), CASE WHEN COALESCE(c.peso_nf_tonelagem, 0) > 0 THEN c.peso_nf_tonelagem * 1000 ELSE 0 END, 0) as kg,
            COALESCE((SELECT MAX(ip3.created) FROM interacoes ip3 WHERE ip3.cliente = c.id
                      AND (ip3.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
                           OR (ip3.numero_pedido IS NOT NULL AND TRIM(ip3.numero_pedido) != '' AND TRIM(ip3.numero_pedido) != '-'))),
                     c.reativado_em, c.updated) as data_reativacao
          FROM clientes c
          WHERE ${condReativados}
          ORDER BY data_reativacao DESC
        `

        const reatRows = arrayOf(
          new DynamicModel({
            cliente_id: '',
            codigo: '',
            nome: '',
            endereco: '',
            regiao: '',
            vendedor_origem: '',
            operador_nome: '',
            pedido: '',
            valor: -0,
            kg: -0,
            data_reativacao: '',
          }),
        )
        const qbReat = $app.db().newQuery(reatSql)
        if (Object.keys(bReat).length > 0) qbReat.bind(bReat)
        qbReat.all(reatRows)

        // Fichas de atendimento dos mesmos clientes: 1ª (mais recente) por cliente, só desfecho reativado
        const fichaRows = arrayOf(
          new DynamicModel({
            cliente_id: '',
            desfecho: '',
            valor_potencial: -0,
            toneladas_potencial: -0,
          }),
        )
        const fichasSql = `
          SELECT rf.cliente as cliente_id, rf.desfecho as desfecho,
                 rf.valor_potencial as valor_potencial, rf.toneladas_potencial as toneladas_potencial
          FROM respostas_formulario rf
          WHERE rf.cliente IN (SELECT c.id FROM clientes c WHERE ${condReativados})
          ORDER BY rf.created DESC
        `
        const qbFichas = $app.db().newQuery(fichasSql)
        if (Object.keys(bReat).length > 0) qbFichas.bind(bReat)
        qbFichas.all(fichaRows)

        const fichaPorCliente = {}
        const fichaVista = {}
        for (let fi = 0; fi < fichaRows.length; fi++) {
          const fr = fichaRows[fi]
          const cId = String(fr.cliente_id || '')
          if (!cId || fichaVista[cId]) continue
          fichaVista[cId] = true
          if (String(fr.desfecho || '').trim() !== 'reativado') continue
          const vPot = Number(fr.valor_potencial || 0)
          const kgPot = Number(fr.toneladas_potencial || 0)
          fichaPorCliente[cId] = {
            valor: vPot > 0 ? vPot : 0,
            kg: kgPot > 0 ? kgPot : 0,
          }
        }

        for (let idx = 0; idx < reatRows.length; idx++) {
          const r = reatRows[idx]
          const ficha = fichaPorCliente[String(r.cliente_id || '')]
          // ERP vence; ficha só complementa o campo que estiver 0/vazio no ERP
          const valorCli =
            Number(r.valor || 0) > 0 ? Number(r.valor) : ficha ? Number(ficha.valor || 0) : 0
          const kgCli = Number(r.kg || 0) > 0 ? Number(r.kg) : ficha ? Number(ficha.kg || 0) : 0
          reativadosList.push({
            id: r.cliente_id,
            codigo: r.codigo,
            nome: r.nome,
            cidade: extrairCidadeCliente(r.endereco),
            regiao: r.regiao,
            vendedorOrigem: r.vendedor_origem,
            operadorResponsavel: r.operador_nome,
            pedido: r.pedido,
            valor: valorCli,
            volumeKg: kgCli,
            data: r.data_reativacao,
            dataFormatada: formatBrasiliaDate(r.data_reativacao),
          })
        }
      }

      // 2. LISTA 2: CLIENTES REAGENDADOS
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
            ${janelaInteracaoCond}
          ORDER BY i.created DESC
            LIMIT ${limit}
        `

        const reagRows = arrayOf(
          new DynamicModel({
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
          }),
        )

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
            ${janelaFollowupCond}
          ORDER BY c.reagendado_para ASC
          LIMIT ${limit}
        `

        const follRows = arrayOf(
          new DynamicModel({
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
          }),
        )

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
