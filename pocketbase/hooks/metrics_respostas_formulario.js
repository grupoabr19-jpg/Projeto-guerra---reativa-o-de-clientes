/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/backend/v1/metrics/respostas-formulario',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      // Restrição de Líder de Rota
      const userRole = authRecord.getString('role')
      let allowedRegiao = ''
      if (userRole === 'lider') {
        try {
          const userRegioes = authRecord.get('regioes')
          if (Array.isArray(userRegioes) && userRegioes.length > 0) {
            allowedRegiao = String(userRegioes[0] || '').trim()
          }
        } catch (_) {}
      }

      // Parâmetros de consulta
      const q = e.requestInfo().query || {}
      let regiaoParam = String(q.regiao || '').trim()
      if (allowedRegiao) {
        regiaoParam = allowedRegiao
      }

      const segmentoParam = String(q.segmento || '').trim()
      const periodoParam = String(q.periodo || 'total').trim()
      const baseCategoriaParam = String(q.baseCategoria || q.categoria || 'todas').trim()

      // Cálculo de datas com Fuso de Brasília (UTC-3)
      const now = new Date()
      const brasiliaOffsetMs = -3 * 60 * 60 * 1000
      const dBrasilia = new Date(now.getTime() + brasiliaOffsetMs)
      const yBrt = dBrasilia.getUTCFullYear()
      const mBrt = dBrasilia.getUTCMonth()
      const dayBrt = dBrasilia.getUTCDate()
      // Meia-noite de hoje em Brasília (00:00:00 BRT = 03:00:00 UTC)
      const midnightTodayUtcMs = Date.UTC(yBrt, mBrt, dayBrt, 3, 0, 0, 0)
      const midnightTodayIso = new Date(midnightTodayUtcMs).toISOString()
      const midnight7diasIso = new Date(midnightTodayUtcMs - 7 * 24 * 60 * 60 * 1000).toISOString()
      const midnight30diasIso = new Date(
        midnightTodayUtcMs - 30 * 24 * 60 * 60 * 1000,
      ).toISOString()

      // Filtros em clientes (alias c) e respostas_formulario (alias rf)
      const rfConditions = []
      const bindParams = {}

      // Período de criação da resposta
      if (periodoParam === 'hoje') {
        rfConditions.push('rf.created >= {:periodoInicio}')
        bindParams.periodoInicio = midnightTodayIso
      } else if (periodoParam === '7dias') {
        rfConditions.push('rf.created >= {:periodoInicio}')
        bindParams.periodoInicio = midnight7diasIso
      } else if (periodoParam === '30dias') {
        rfConditions.push('rf.created >= {:periodoInicio}')
        bindParams.periodoInicio = midnight30diasIso
      }

      // Filtro de Região do cliente
      if (regiaoParam && regiaoParam.toLowerCase() !== 'todas') {
        const upper = regiaoParam.toUpperCase()
        if (upper === 'SEM REGIÃO' || upper === 'SEM REGIAO') {
          rfConditions.push(
            "(c.regiao = '' OR c.regiao IS NULL OR UPPER(TRIM(c.regiao)) = 'SEM REGIÃO' OR UPPER(TRIM(c.regiao)) = 'SEM REGIAO')",
          )
        } else if (
          upper === 'BRAGANÇA' ||
          upper === 'BRAGANCA' ||
          upper === 'BRAGANÇA PAULISTA' ||
          upper === 'BRAGANCA PAULISTA'
        ) {
          rfConditions.push(
            "(UPPER(TRIM(c.regiao)) = 'BRAGANÇA' OR UPPER(TRIM(c.regiao)) = 'BRAGANCA' OR UPPER(TRIM(c.regiao)) = 'BRAGANÇA PAULISTA' OR UPPER(TRIM(c.regiao)) = 'BRAGANCA PAULISTA')",
          )
        } else if (
          upper === 'CAMBUÍ' ||
          upper === 'CAMBUI' ||
          upper === 'MICRO-REGIÃO' ||
          upper === 'MICRO REGIAO'
        ) {
          rfConditions.push(
            "(UPPER(TRIM(c.regiao)) = 'CAMBUÍ' OR UPPER(TRIM(c.regiao)) = 'CAMBUI' OR UPPER(TRIM(c.regiao)) = 'MICRO-REGIÃO' OR UPPER(TRIM(c.regiao)) = 'MICRO REGIAO')",
          )
        } else if (
          upper === 'POÇOS DE CALDAS' ||
          upper === 'POCOS DE CALDAS' ||
          upper === 'POÇOS CALDAS' ||
          upper === 'POCOS CALDAS'
        ) {
          rfConditions.push(
            "(UPPER(TRIM(c.regiao)) = 'POÇOS DE CALDAS' OR UPPER(TRIM(c.regiao)) = 'POCOS DE CALDAS' OR UPPER(TRIM(c.regiao)) = 'POÇOS CALDAS' OR UPPER(TRIM(c.regiao)) = 'POCOS CALDAS')",
          )
        } else if (upper === 'JUNDIAÍ' || upper === 'JUNDIAI') {
          rfConditions.push(
            "(UPPER(TRIM(c.regiao)) = 'JUNDIAÍ' OR UPPER(TRIM(c.regiao)) = 'JUNDIAI')",
          )
        } else if (upper === 'ITAJUBÁ' || upper === 'ITAJUBA') {
          rfConditions.push(
            "(UPPER(TRIM(c.regiao)) = 'ITAJUBÁ' OR UPPER(TRIM(c.regiao)) = 'ITAJUBA')",
          )
        } else if (upper === 'VARGINHA') {
          rfConditions.push("UPPER(TRIM(c.regiao)) = 'VARGINHA'")
        } else if (upper === 'POUSO ALEGRE') {
          rfConditions.push("UPPER(TRIM(c.regiao)) = 'POUSO ALEGRE'")
        } else if (upper === 'EXTREMA') {
          rfConditions.push("UPPER(TRIM(c.regiao)) = 'EXTREMA'")
        } else if (upper === 'ATACADO') {
          rfConditions.push("UPPER(TRIM(c.regiao)) = 'ATACADO'")
        } else if (upper === 'REPESCAGEM') {
          rfConditions.push("UPPER(TRIM(c.regiao)) = 'REPESCAGEM'")
        } else {
          rfConditions.push(
            '(UPPER(TRIM(c.regiao)) = {:regiaoParam} OR UPPER(TRIM(c.regiao)) LIKE {:regiaoLike})',
          )
          bindParams.regiaoParam = upper
          bindParams.regiaoLike = '%' + upper + '%'
        }
      }

      // Filtro de Segmento do cliente
      if (segmentoParam && segmentoParam.toLowerCase() !== 'todos') {
        rfConditions.push('UPPER(TRIM(c.segmento)) = {:segParam}')
        bindParams.segParam = segmentoParam.toUpperCase()
      }

      // Filtro de Categoria de Base
      if (baseCategoriaParam === 'cliente_final') {
        rfConditions.push("c.base_categoria = 'cliente_final'")
      } else if (baseCategoriaParam === 'atacado_fora_mapa') {
        rfConditions.push("c.base_categoria = 'atacado_fora_mapa'")
      } else if (baseCategoriaParam === 'sem_dono' || baseCategoriaParam === 'sem_dono_equipe') {
        rfConditions.push('(c.sem_dono_equipe = 1 OR c.sem_dono_equipe = true)')
      } else if (baseCategoriaParam === 'repescagem') {
        rfConditions.push("(c.regiao = 'REPESCAGEM' OR c.dias_sem_faturar >= 90)")
      } else if (baseCategoriaParam === 'normal') {
        rfConditions.push(
          "(c.base_categoria IS NULL OR c.base_categoria = '' OR c.base_categoria = 'normal')",
        )
      }

      const whereClause = rfConditions.length > 0 ? 'WHERE ' + rfConditions.join(' AND ') : ''

      // Buscar respostas_formulario com dados do cliente associado
      const selectQuery = `
        SELECT
          rf.id as id,
          rf.cliente as cliente,
          rf.operador as operador,
          rf.desfecho as desfecho,
          rf.valor_potencial as valor_potencial,
          rf.toneladas_potencial as toneladas_potencial,
          rf.respostas as respostas,
          rf.created as created,
          c.nome as cliente_nome,
          c.segmento as cliente_segmento,
          c.regiao as cliente_regiao
        FROM respostas_formulario rf
        LEFT JOIN clientes c ON c.id = rf.cliente
        ${whereClause}
        ORDER BY rf.created DESC
      `

      const rows = arrayOf(
        new DynamicModel({
          id: '',
          cliente: '',
          operador: '',
          desfecho: '',
          valor_potencial: -0,
          toneladas_potencial: -0,
          respostas: '',
          created: '',
          cliente_nome: '',
          cliente_segmento: '',
          cliente_regiao: '',
        }),
      )

      const qb = $app.db().newQuery(selectQuery)
      if (Object.keys(bindParams).length > 0) {
        qb.bind(bindParams)
      }
      qb.all(rows)

      let totalRegistros = rows.length
      let somaValorPotencial = 0
      let countValorPotencial = 0
      let somaToneladas = 0
      let countToneladas = 0

      // Mapas de contagem
      const q3Contagem = { Sim: 0, Nao: 0, NaoRespondido: 0 }
      const q7Map = {}
      const q8Map = {}
      const q10Map = {}
      const desfechoMap = {}

      // Lista de desfechos isentos de agregação financeira e de volume
      // (duplicado, sem_contato, ativo_fora_base, compra_terceiros, cliente_final, restricao_financeira)
      const desfechosIsentos = {
        duplicado: true,
        sem_contato: true,
        ativo_fora_base: true,
        compra_terceiros: true,
        cliente_final: true,
        restricao_financeira: true,
      }

      // Deduplicação por cliente: como a query já vem ORDER BY rf.created DESC,
      // a primeira ocorrência encontrada para cada cliente é a mais recente
      const clientesFinanceiroProcessados = {}
      const clientesTaxaProcessados = {}

      // Helper para limpar texto de pergunta
      const extrairTexto = (val) => {
        if (val === undefined || val === null) return ''
        let s = String(val).trim()
        if (!s) return ''
        if (s.indexOf('Outros:') === 0 || s.indexOf('Outros -') === 0) {
          const det = s.replace(/^Outros[:\s-]+/, '').trim()
          return det ? 'Outros (' + det + ')' : 'Outros'
        }
        return s
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]

        // Desfecho (contagem de desfechos no gráfico continua contando tudo)
        let desfecho = String(r.desfecho || '').trim()
        if (!desfecho) {
          desfecho = 'nao_informado'
        }
        desfechoMap[desfecho] = (desfechoMap[desfecho] || 0) + 1

        const clienteId = String(r.cliente || '').trim() || r.id

        // Parse do JSON de respostas
        let respostasObj = {}
        const rawRespostas = r.respostas
        if (rawRespostas) {
          if (typeof rawRespostas === 'string') {
            try {
              respostasObj = JSON.parse(rawRespostas)
            } catch (_) {
              respostasObj = {}
            }
          } else if (typeof rawRespostas === 'object') {
            respostasObj = rawRespostas
          }
        }

        // Q7 - Concorrência
        const q7Val = extrairTexto(respostasObj.q7)
        if (q7Val) {
          q7Map[q7Val] = (q7Map[q7Val] || 0) + 1
        }

        // Q8 - Ocorrência / Histórico de Problemas
        const q8Val = extrairTexto(respostasObj.q8)
        if (q8Val) {
          q8Map[q8Val] = (q8Map[q8Val] || 0) + 1
        }

        // Q10 - Ação Corretiva
        const q10Val = extrairTexto(respostasObj.q10)
        if (q10Val) {
          q10Map[q10Val] = (q10Map[q10Val] || 0) + 1
        }

        // --- AGREGAÇÕES FINANCEIRAS (Valor Potencial Q15 e Toneladas Q16) ---
        // 1. Deduplicação por cliente: considerar apenas uma ficha por cliente (a mais recente)
        // 2. Exclusão de desfechos isentos: duplicado, sem_contato, ativo_fora_base,
        //    compra_terceiros, cliente_final, restricao_financeira
        if (!clientesFinanceiroProcessados[clienteId]) {
          clientesFinanceiroProcessados[clienteId] = true

          const isIsento = Boolean(desfechosIsentos[desfecho])

          if (!isIsento) {
            const vPot = Number(
              r.valor_potencial !== undefined && r.valor_potencial !== null
                ? r.valor_potencial
                : r.valorPotencial || 0,
            )
            if (vPot > 0) {
              somaValorPotencial += vPot
              countValorPotencial++
            }

            const tPot = Number(
              r.toneladas_potencial !== undefined && r.toneladas_potencial !== null
                ? r.toneladas_potencial
                : r.toneladasPotencial || 0,
            )
            if (tPot > 0) {
              somaToneladas += tPot
              countToneladas++
            }
          }
        }

        // --- TAXA DE ORÇAMENTO (Q3 NOVA) ---
        // Deve usar EXCLUSIVAMENTE a Q3 NOVA (respostas.q3 com "Sim" / "Não").
        // Deduplica também por cliente para não distorcer a taxa caso o mesmo cliente tenha sido respondido duas vezes.
        // NUNCA misturar com Q3 antiga / q3_arquivo nem assumir Sim só porque vPot > 0.
        // Registros sem respostas.q3 nova ("Sim"/"Não") entram como "NaoRespondido" (não declarados)
        // e NÃO entram no denominador da taxa.
        if (!clientesTaxaProcessados[clienteId]) {
          clientesTaxaProcessados[clienteId] = true

          let q3Val = ''
          if (respostasObj && respostasObj.q3 !== undefined && respostasObj.q3 !== null) {
            q3Val = String(respostasObj.q3).trim()
          }

          if (q3Val === 'Sim' || q3Val === 'sim') {
            q3Contagem.Sim++
          } else if (q3Val === 'Não' || q3Val === 'Nao' || q3Val === 'nao') {
            q3Contagem.Nao++
          } else {
            // Não possui a Q3 nova respondida
            q3Contagem.NaoRespondido++
          }
        }
      }

      // Função de ordenação decrescente por contagem
      const mapToArraySorted = (m) => {
        const arr = []
        for (const k in m) {
          if (Object.prototype.hasOwnProperty.call(m, k)) {
            arr.push({ label: k, count: m[k] })
          }
        }
        arr.sort((a, b) => b.count - a.count)
        return arr
      }

      const q7Sorted = mapToArraySorted(q7Map)
      const q8Sorted = mapToArraySorted(q8Map)
      const q10Sorted = mapToArraySorted(q10Map)

      // Lista formatada de desfechos
      const desfechosArray = mapToArraySorted(desfechoMap)

      const totalOrcamentoRespondido = q3Contagem.Sim + q3Contagem.Nao
      const taxaOrcamentoSim =
        totalOrcamentoRespondido > 0
          ? Math.round((q3Contagem.Sim / totalOrcamentoRespondido) * 100)
          : 0
      const taxaOrcamentoNao = totalOrcamentoRespondido > 0 ? 100 - taxaOrcamentoSim : 0

      const mediaValorPotencial =
        countValorPotencial > 0 ? Math.round(somaValorPotencial / countValorPotencial) : 0
      const mediaToneladas =
        countToneladas > 0 ? Number((somaToneladas / countToneladas).toFixed(2)) : 0

      return e.json(200, {
        totalRegistros: totalRegistros,
        kpis: {
          somaValorPotencial: somaValorPotencial,
          mediaValorPotencial: mediaValorPotencial,
          countComValor: countValorPotencial,
          somaToneladas: somaToneladas,
          mediaToneladas: mediaToneladas,
          countComToneladas: countToneladas,
        },
        q3Orcamento: {
          sim: q3Contagem.Sim,
          nao: q3Contagem.Nao,
          naoRespondido: q3Contagem.NaoRespondido,
          taxaSim: taxaOrcamentoSim,
          taxaNao: taxaOrcamentoNao,
          totalValido: totalOrcamentoRespondido,
        },
        q7Concorrencia: q7Sorted,
        q8Ocorrencia: q8Sorted,
        q10AcaoCorretiva: q10Sorted,
        desfechos: desfechosArray,
      })
    } catch (err) {
      const msg = err && err.message ? err.message : String(err)
      console.log('[metrics_respostas_formulario] Erro: ' + msg)
      return e.json(500, {
        error: 'Erro interno ao processar métricas da ficha: ' + msg,
      })
    }
  },
  $apis.requireAuth(),
)
