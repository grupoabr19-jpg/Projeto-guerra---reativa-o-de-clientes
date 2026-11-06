/// <reference path="../pb_data/types.d.ts" />

// reports_export.js — /backend/v1/reports/export (CSV)
// FÓRMULAS E FILTROS VÊM DO MÓDULO ÚNICO regua_metricas.js (M1):
// - Janela temporal (De/Até) via REGUA.parseJanela (mesma do Dashboard);
// - Normalização de região via REGUA.sqlRegiao;
// - Régua oficial de reativação via REGUA.sqlReativacaoReal (prova de operador
//   + EXISTS de interação com desfecho/pedido) — mesmo número do Dashboard.
// Nenhuma fórmula de régua ou parsing de período é definida aqui.

routerAdd(
  'POST',
  '/backend/v1/reports/export',
  (e) => {
    try {
      const REGUA = require(`${__hooks}/regua_metricas.js`)

      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = String(authRecord.getString('role') || '')
      if (userRole !== 'admin' && userRole !== 'supervisor') {
        return e.json(403, { error: 'Acesso restrito a administradores e supervisores' })
      }

      const body = e.requestInfo().body || {}
      const tipo = String(body.tipo || 'reativados').trim()
      const periodoInicio = String(
        body.periodo_inicio || body.periodoInicio || body.data_inicial || '',
      ).trim()
      const periodoFim = String(body.periodo_fim || body.periodoFim || body.data_final || '').trim()
      const regiao = String(body.regiao || '').trim()
      const operador = String(body.operador || '').trim()

      function formatBrasiliaDate(utcDateStr) {
        if (!utcDateStr) return ''
        try {
          const d = new Date(utcDateStr)
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
          return String(utcDateStr)
        }
      }

      function escapeCsv(val) {
        if (val === null || val === undefined) return ''
        const s = String(val).replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ')
        if (s.includes(';') || s.includes('"') || s.includes(',')) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }

      // Janela temporal — MESMA função do Dashboard (regua_metricas.js):
      // ativa somente com data_inicial E data_final em YYYY-MM-DD; 00:00 BRT = 03:00 UTC.
      const janela = REGUA.parseJanela(periodoInicio, periodoFim)

      const bindParams = {}

      // Normalização de região — MESMA função do Dashboard
      const regiaoCondition = REGUA.sqlRegiao(regiao, 'c.', bindParams)

      let operadorCondition = ''
      if (operador && operador.toLowerCase() !== 'todos') {
        operadorCondition =
          ' AND (u.name = {:opParam} OR c.operador = {:opParam} OR i.operador = {:opParam})'
        bindParams.opParam = operador
      }

      // Período aplicado NO SERVIDOR sobre i.created (mesma janela do Dashboard)
      let dateConditionI = ''
      if (janela.ativa) {
        dateConditionI += ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}'
        bindParams.janelaInicio = janela.inicioIso
        bindParams.janelaFim = janela.fimIso
      }

      // Desfecho/interação que qualifica reativação — lista ÚNICA do módulo da régua
      const interacaoReativacaoCond =
        '(i.desfecho IN ' +
        REGUA.DESFECHOS_REATIVACAO +
        " OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-'))"

      const BOM = '\uFEFF'
      let csvContent = 'sep=;\r\n'
      let filename = `relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`

      if (tipo === 'reativados') {
        filename = `reativados_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent +=
          'Código;Nome do Cliente;Cidade/UF;Região;Segmento;Operador;Pedido;Valor Recuperado;Data Reativação\r\n'

        // Régua oficial do Dashboard: sqlReativacaoReal('c') + interação qualificadora
        // na janela (INNER JOIN restrito = mesmo conjunto do EXISTS do Dashboard).
        const sql = `
          SELECT
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            c.segmento as segmento,
            COALESCE(u.name, c.operador, c.operador_reativacao, '') as operador_nome,
            COALESCE(i.numero_pedido, c.pedido_reativacao, '') as pedido,
            COALESCE(c.valor_ultima_compra, 0) as valor,
            COALESCE(i.created, c.reativado_em, c.updated) as data_reativacao
          FROM clientes c
          INNER JOIN interacoes i ON i.cliente = c.id AND ${interacaoReativacaoCond}${janela.ativa ? ' AND i.created >= {:janelaInicio} AND i.created <= {:janelaFim}' : ''}
          LEFT JOIN users u ON u.id = i.operador
          WHERE ${REGUA.sqlReativacaoReal('c')}
            AND (c.ativo_fora_base IS NULL OR c.ativo_fora_base = 0)
            ${regiaoCondition}
            ${operadorCondition}
          ORDER BY data_reativacao DESC
        `

        const rows = arrayOf(
          new DynamicModel({
            codigo: '',
            nome: '',
            endereco: '',
            regiao: '',
            segmento: '',
            operador_nome: '',
            pedido: '',
            valor: -0,
            data_reativacao: '',
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        const vistos = {}
        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          if (vistos[r.codigo]) continue
          vistos[r.codigo] = true
          csvContent +=
            [
              escapeCsv(r.codigo),
              escapeCsv(r.nome),
              escapeCsv(r.endereco),
              escapeCsv(r.regiao),
              escapeCsv(r.segmento),
              escapeCsv(r.operador_nome),
              escapeCsv(r.pedido),
              Number(r.valor || 0)
                .toFixed(2)
                .replace('.', ','),
              escapeCsv(formatBrasiliaDate(r.data_reativacao)),
            ].join(';') + '\r\n'
        }
      } else if (tipo === 'contatos') {
        filename = `contatos_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent += 'Data/Hora;Código;Nome do Cliente;Região;Operador;Tipo;Desfecho;Detalhes\r\n'

        const sql = `
          SELECT
            i.created as data_hora,
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(u.name, '') as operador_nome,
            i.tipo as tipo,
            i.desfecho as desfecho,
            i.conteudo as conteudo
          FROM interacoes i
          LEFT JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE 1=1
            ${regiaoCondition}
            ${operadorCondition}
            ${dateConditionI}
          ORDER BY i.created DESC
          LIMIT 5000
        `

        const rows = arrayOf(
          new DynamicModel({
            data_hora: '',
            codigo: '',
            nome: '',
            regiao: '',
            operador_nome: '',
            tipo: '',
            desfecho: '',
            conteudo: '',
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          csvContent +=
            [
              escapeCsv(formatBrasiliaDate(r.data_hora)),
              escapeCsv(r.codigo),
              escapeCsv(r.nome),
              escapeCsv(r.regiao),
              escapeCsv(r.operador_nome),
              escapeCsv(r.tipo),
              escapeCsv(r.desfecho),
              escapeCsv(r.conteudo),
            ].join(';') + '\r\n'
        }
      } else if (tipo === 'reagendados') {
        filename = `reagendados_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent +=
          'Código;Nome do Cliente;Cidade/UF;Região;Operador;Data Registro;Reagendado Para;Motivo\r\n'

        const sql = `
          SELECT
            c.codigo as codigo,
            c.nome as nome,
            c.endereco as endereco,
            c.regiao as regiao,
            COALESCE(u.name, '') as operador_nome,
            i.created as data_registro,
            COALESCE(i.reagendado_para, c.reagendado_para) as reagendado_para,
            COALESCE(i.motivo, i.conteudo, '') as motivo
          FROM interacoes i
          INNER JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE (i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != ''))
            ${regiaoCondition}
            ${operadorCondition}
            ${dateConditionI}
          ORDER BY i.created DESC
        `

        const rows = arrayOf(
          new DynamicModel({
            codigo: '',
            nome: '',
            endereco: '',
            regiao: '',
            operador_nome: '',
            data_registro: '',
            reagendado_para: '',
            motivo: '',
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          csvContent +=
            [
              escapeCsv(r.codigo),
              escapeCsv(r.nome),
              escapeCsv(r.endereco),
              escapeCsv(r.regiao),
              escapeCsv(r.operador_nome),
              escapeCsv(formatBrasiliaDate(r.data_registro)),
              escapeCsv(formatBrasiliaDate(r.reagendado_para)),
              escapeCsv(r.motivo),
            ].join(';') + '\r\n'
        }
      } else if (tipo === 'followups') {
        filename = `followups_programados_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent +=
          'Data Agendada;Código;Nome do Cliente;Telefone;Região;Operador Responsável;Status\r\n'

        let followUpDateCond = ''
        if (janela.ativa) {
          followUpDateCond +=
            ' AND c.reagendado_para >= {:janelaInicio} AND c.reagendado_para <= {:janelaFim}'
        }

        const sql = `
          SELECT
            c.reagendado_para as data_agendada,
            c.codigo as codigo,
            c.nome as nome,
            COALESCE(c.telefone, c.whatsapp, '') as telefone,
            c.regiao as regiao,
            COALESCE(u.name, '') as operador_nome,
            c.estado as estado
          FROM clientes c
          LEFT JOIN users u ON u.id = c.operador
          WHERE c.reagendado_para IS NOT NULL AND TRIM(c.reagendado_para) != ''
            ${regiaoCondition}
            ${operadorCondition}
            ${followUpDateCond}
          ORDER BY c.reagendado_para ASC
        `

        const rows = arrayOf(
          new DynamicModel({
            data_agendada: '',
            codigo: '',
            nome: '',
            telefone: '',
            regiao: '',
            operador_nome: '',
            estado: '',
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          csvContent +=
            [
              escapeCsv(formatBrasiliaDate(r.data_agendada)),
              escapeCsv(r.codigo),
              escapeCsv(r.nome),
              escapeCsv(r.telefone),
              escapeCsv(r.regiao),
              escapeCsv(r.operador_nome),
              escapeCsv(r.estado),
            ].join(';') + '\r\n'
        }
      } else if (tipo === 'vendas_perdidas') {
        filename = `vendas_perdidas_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent += 'Código;Nome do Cliente;Região;Operador;Data;Motivo da Perda;Observações\r\n'

        const sql = `
          SELECT
            c.codigo as codigo,
            c.nome as nome,
            c.regiao as regiao,
            COALESCE(u.name, '') as operador_nome,
            i.created as data_perda,
            i.desfecho as motivo_perda,
            i.conteudo as conteudo
          FROM interacoes i
          INNER JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE i.desfecho IN ('compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato')
            ${regiaoCondition}
            ${operadorCondition}
            ${dateConditionI}
          ORDER BY i.created DESC
        `

        const rows = arrayOf(
          new DynamicModel({
            codigo: '',
            nome: '',
            regiao: '',
            operador_nome: '',
            data_perda: '',
            motivo_perda: '',
            conteudo: '',
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          csvContent +=
            [
              escapeCsv(r.codigo),
              escapeCsv(r.nome),
              escapeCsv(r.regiao),
              escapeCsv(r.operador_nome),
              escapeCsv(formatBrasiliaDate(r.data_perda)),
              escapeCsv(r.motivo_perda),
              escapeCsv(r.conteudo),
            ].join(';') + '\r\n'
        }
      } else {
        // resumo_diario
        filename = `resumo_diario_${new Date().toISOString().slice(0, 10)}.csv`
        csvContent += 'Dia;Reativações;Contatos;Reagendamentos;Vendas Perdidas;Total Interações\r\n'

        const sql = `
          SELECT
            strftime('%Y-%m-%d', datetime(i.created, '-3 hours')) as dia,
            SUM(CASE
              WHEN i.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
                   OR (i.numero_pedido IS NOT NULL AND TRIM(i.numero_pedido) != '' AND TRIM(i.numero_pedido) != '-' AND TRIM(i.numero_pedido) != '0')
              THEN 1 ELSE 0 END) as reativacoes,
            SUM(CASE
              WHEN (i.tipo IN ('formulario', 'ligacao') OR (i.desfecho IS NOT NULL AND TRIM(i.desfecho) != ''))
                   AND (i.desfecho IS NULL OR (i.desfecho != 'sem_contato' AND i.desfecho != 'transferido'))
              THEN 1 ELSE 0 END) as contatos,
            SUM(CASE
              WHEN i.desfecho = 'reagendado' OR (i.reagendado_para IS NOT NULL AND TRIM(i.reagendado_para) != '')
              THEN 1 ELSE 0 END) as reagendamentos,
            SUM(CASE
              WHEN i.desfecho IN ('compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato')
              THEN 1 ELSE 0 END) as vendas_perdidas,
            COUNT(*) as total_interacoes
          FROM interacoes i
          LEFT JOIN clientes c ON c.id = i.cliente
          LEFT JOIN users u ON u.id = i.operador
          WHERE 1=1
            ${regiaoCondition}
            ${operadorCondition}
            ${dateConditionI}
          GROUP BY dia
          ORDER BY dia DESC
        `

        const rows = arrayOf(
          new DynamicModel({
            dia: '',
            reativacoes: 0,
            contatos: 0,
            reagendamentos: 0,
            vendas_perdidas: 0,
            total_interacoes: 0,
          }),
        )

        const qb = $app.db().newQuery(sql)
        if (Object.keys(bindParams).length > 0) qb.bind(bindParams)
        qb.all(rows)

        for (let idx = 0; idx < rows.length; idx++) {
          const r = rows[idx]
          csvContent +=
            [
              escapeCsv(r.dia),
              r.reativacoes || 0,
              r.contatos || 0,
              r.reagendamentos || 0,
              r.vendas_perdidas || 0,
              r.total_interacoes || 0,
            ].join(';') + '\r\n'
        }
      }

      return e.json(200, {
        filename: filename,
        csv: BOM + csvContent,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.error('[reports_export] Erro: ' + msg)
      return e.json(500, { error: 'Erro ao gerar exportação CSV: ' + msg })
    }
  },
  $apis.requireAuth(),
)
