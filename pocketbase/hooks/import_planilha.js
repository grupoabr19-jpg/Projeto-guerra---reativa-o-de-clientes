routerAdd(
  'POST',
  '/backend/v1/import/process-rows',
  (e) => {
    try {
      const userId = e.auth?.id
      if (!userId) return e.unauthorizedError('auth required')

      const body = e.requestInfo().body || {}
      const rows = body.rows || []
      const fileName = body.fileName || 'planilha.xlsx'
      const substituicaoTotal = Boolean(body.substituicaoTotal)
      // Modos: 'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'
      let modoImportacao = body.modoImportacao || 'base_mestre'
      if (
        !['base_mestre', 'faturamento_reconciliacao', 'enriquecimento_margem'].includes(
          modoImportacao,
        )
      ) {
        modoImportacao = 'base_mestre'
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return e.badRequestError('Nenhuma linha fornecida para importação.')
      }

      const colClientes = $app.findCollectionByNameOrId('clientes')
      const colImportacoes = $app.findCollectionByNameOrId('importacoes')

      let countNovas = 0
      let countAtualizadas = 0
      let countRejeitadas = 0
      let countMatchesNome = 0
      let countSemCorrespondencia = 0
      let countReconciliadosFaturaram = 0
      let countPedidosValidados = 0
      let countPedidosDivergentes = 0
      const erros = []
      const divergencias = []
      const semCorrespondenciaLista = []
      const importedCodigos = new Set()

      // Helper inline para normalizar strings de nome e cidade para busca
      const normalizeClean = (str) => {
        if (!str) return ''
        return String(str)
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // remove acentos
          .replace(/[^A-Z0-9]/g, ' ') // substitui pontuações por espaço
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Helper inline para carregar cache de clientes existentes para match rápido por nome (+ cidade/UF)
      // Carrega registros existentes da base
      const existingClientes = $app.findRecordsByFilter('clientes', '1=1', '', 50000, 0)
      const clientsByCode = {}
      const clientsByNameKey = {}
      const clientsByNameOnly = {}

      for (let k = 0; k < existingClientes.length; k++) {
        const cRec = existingClientes[k]
        const cCode = cRec.getString('codigo')
        const cNome = cRec.getString('nome')
        const cEndereco = cRec.getString('endereco') // formato "Cidade - UF" se presente

        if (cCode) {
          clientsByCode[cCode.toUpperCase()] = cRec
        }

        const normNome = normalizeClean(cNome)
        if (normNome) {
          // Extrair cidade se houver
          let cCity = ''
          if (cEndereco && cEndereco.includes('-')) {
            cCity = normalizeClean(cEndereco.split('-')[0])
          } else if (cEndereco) {
            cCity = normalizeClean(cEndereco)
          }

          if (cCity) {
            clientsByNameKey[normNome + '::' + cCity] = cRec
          }
          if (!clientsByNameOnly[normNome]) {
            clientsByNameOnly[normNome] = cRec
          }
        }
      }

      // Ler pesos de score
      let pesos = {
        recencia: 30,
        frequencia: 25,
        ticket_tonelagem: 20,
        segmento: 10,
        tentativas_penalidade: 15,
      }
      try {
        const cfg = $app.findFirstRecordByData('configuracoes', 'chave', 'pesos_score')
        if (cfg && cfg.get('valor')) pesos = cfg.get('valor')
      } catch (_) {}

      const now = new Date()

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const linhaNum = i + 2 // cabeçalho = linha 1

        const rawCodigo = String(row.codigo || '')
          .trim()
          .toUpperCase()
        const rawNome = String(row.nome || '').trim()
        const rawCidade = String(row.cidade || '').trim()
        const rawEstado = String(row.estado || row.uf || '').trim()

        // Validação flexível conforme o modo
        if (modoImportacao === 'base_mestre') {
          // Base mestre exige código E nome
          if (!rawCodigo) {
            countRejeitadas++
            erros.push({
              linha: linhaNum,
              codigo: '',
              erro: "Coluna 'Código do Cliente' obrigatória para Base Mestre está vazia.",
            })
            continue
          }
          if (!rawNome) {
            countRejeitadas++
            erros.push({
              linha: linhaNum,
              codigo: rawCodigo,
              erro: "Coluna 'Nome' obrigatória está vazia.",
            })
            continue
          }
        } else {
          // Modos Faturamento e Margem: pelo menos UM dos dois deve existir
          if (!rawCodigo && !rawNome) {
            countRejeitadas++
            erros.push({
              linha: linhaNum,
              codigo: '',
              erro: 'Linha ignorada: é necessário informar ao menos Código do Cliente ou Razão Social / Nome.',
            })
            continue
          }
        }

        // Busca pelo cliente existente
        let targetRec = null
        let matchBy = '' // 'code' | 'name_city' | 'name_only'

        if (rawCodigo && clientsByCode[rawCodigo]) {
          targetRec = clientsByCode[rawCodigo]
          matchBy = 'code'
        } else if (rawNome) {
          const normNome = normalizeClean(rawNome)
          const normCidade = normalizeClean(rawCidade)
          if (normCidade && clientsByNameKey[normNome + '::' + normCidade]) {
            targetRec = clientsByNameKey[normNome + '::' + normCidade]
            matchBy = 'name_city'
          } else if (clientsByNameOnly[normNome]) {
            targetRec = clientsByNameOnly[normNome]
            matchBy = 'name_only'
          }
        }

        // ==========================================
        // MODO 1: FATURAMENTO / RECONCILIAÇÃO
        // ==========================================
        if (modoImportacao === 'faturamento_reconciliacao') {
          if (!targetRec) {
            countSemCorrespondencia++
            if (semCorrespondenciaLista.length < 50) {
              semCorrespondenciaLista.push({
                linha: linhaNum,
                nome: rawNome,
                cidade: rawCidade,
                uf: rawEstado,
                pedido: String(row.pedido || row.numero_pedido || ''),
                valor: row.valor_ultima_compra || row.fat_12m_reais || 0,
              })
            }
            continue
          }

          countMatchesNome++

          // Tratar dados de faturamento
          const fatValor =
            typeof row.valor_ultima_compra === 'number'
              ? row.valor_ultima_compra
              : parseFloat(
                  String(row.valor_ultima_compra || 0)
                    .replace(/[^\d.,]/g, '')
                    .replace(',', '.'),
                ) || 0

          const pesoVal =
            typeof row.toneladas_historico === 'number'
              ? row.toneladas_historico
              : parseFloat(
                  String(row.toneladas_historico || row.peso_nf_tonelagem || 0)
                    .replace(/[^\d.,]/g, '')
                    .replace(',', '.'),
                ) || 0

          const numPedido = String(
            row.pedido || row.numero_pedido || row.ultimo_pedido_numero || '',
          ).trim()
          let dataPedido = String(row.ultima_compra || row.ultimo_pedido_data || '').trim()

          if (fatValor > 0) {
            targetRec.set('valor_ultima_compra', fatValor)
            targetRec.set('fat_12m_reais', fatValor)
          }
          if (pesoVal > 0) {
            targetRec.set('toneladas_historico', pesoVal)
            targetRec.set('peso_nf_tonelagem', pesoVal)
          }
          if (numPedido) {
            targetRec.set('ultimo_pedido_numero', numPedido)
          }
          if (dataPedido) {
            const parsed = new Date(dataPedido)
            if (!isNaN(parsed.getTime())) {
              targetRec.set('ultima_compra', parsed.toISOString())
              targetRec.set('ultimo_faturamento_data', parsed.toISOString())
              targetRec.set('ultimo_pedido_data', parsed.toISOString().split('T')[0])
              const diffMs = now.getTime() - parsed.getTime()
              const dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
              targetRec.set('dias_sem_faturar', dias)
              if (dias < 60) {
                targetRec.set('faixa', 'recente')
              }
            }
          }
          if (row.canal) targetRec.set('canal', String(row.canal).trim())
          if (row.vendedor) targetRec.set('vendedor', String(row.vendedor).trim())
          if (row.regiao) {
            const regStr = String(row.regiao).trim().toUpperCase()
            if (regStr) targetRec.set('regiao', regStr)
          }

          // Reconciliação imediata: faturou sai da fila
          const estadoAtual = targetRec.getString('estado')
          if (estadoAtual !== 'reativado') {
            targetRec.set('estado', 'reativado')
            targetRec.set('operador', '')
            targetRec.set('lock_timestamp', null)
            countReconciliadosFaturaram++
          }

          // Validação de divergência de pedido de reativação salvo
          const pedidoSalvo = targetRec.getString('pedido_reativacao')
          if (pedidoSalvo && numPedido) {
            if (numPedido === pedidoSalvo) {
              targetRec.set('pedido_confirmado', true)
              countPedidosValidados++
            } else {
              countPedidosDivergentes++
              divergencias.push({
                codigo: targetRec.getString('codigo') || rawCodigo,
                nome: targetRec.getString('nome') || rawNome,
                pedidoEsperado: pedidoSalvo,
                pedidoPlanilha: numPedido,
              })
            }
          }

          $app.save(targetRec)
          countAtualizadas++
          continue
        }

        // ==========================================
        // MODO 2: ENRIQUECIMENTO (MARGEM)
        // ==========================================
        if (modoImportacao === 'enriquecimento_margem') {
          if (!targetRec) {
            countSemCorrespondencia++
            continue
          }

          if (matchBy.startsWith('name')) {
            countMatchesNome++
          }

          // Atualizar apenas campos de margem
          let updatedMargin = false
          if (row.margem_media_perc !== undefined && row.margem_media_perc !== null) {
            targetRec.set('margem_media_perc', Number(row.margem_media_perc))
            updatedMargin = true
          }
          if (row.margem_reais !== undefined && row.margem_reais !== null) {
            targetRec.set('margem_reais', Number(row.margem_reais))
            updatedMargin = true
          }
          // Se houver campos brutos de margem
          if (row.margem_perc !== undefined) {
            targetRec.set('margem_media_perc', Number(row.margem_perc))
            updatedMargin = true
          }
          if (row.margem_valor !== undefined) {
            targetRec.set('margem_reais', Number(row.margem_valor))
            updatedMargin = true
          }

          // Atualizar bônus de score se tiver margem
          const currentScore = targetRec.getInt('score') || 50
          const margemPerc = targetRec.getFloat('margem_media_perc') || 0
          if (margemPerc > 20) {
            targetRec.set('score', Math.min(100, currentScore + 10))
          }

          if (updatedMargin) {
            $app.save(targetRec)
            countAtualizadas++
          }
          continue
        }

        // ==========================================
        // MODO 3: BASE MESTRE (comportamento completo)
        // ==========================================
        importedCodigos.add(rawCodigo)

        const valorUltimaCompra =
          typeof row.valor_ultima_compra === 'number'
            ? row.valor_ultima_compra
            : parseFloat(
                String(row.valor_ultima_compra || 0)
                  .replace(/[^\d.,]/g, '')
                  .replace(',', '.'),
              ) || 0
        const toneladasHistorico =
          typeof row.toneladas_historico === 'number'
            ? row.toneladas_historico
            : parseFloat(
                String(row.toneladas_historico || 0)
                  .replace(/[^\d.,]/g, '')
                  .replace(',', '.'),
              ) || 0
        const valorHistorico =
          typeof row.valor_historico === 'number'
            ? row.valor_historico
            : parseFloat(
                String(row.valor_historico || 0)
                  .replace(/[^\d.,]/g, '')
                  .replace(',', '.'),
              ) || 0
        const comprasCount = parseInt(row.compras_count || 1, 10) || 1

        let ultimaCompraDate = null
        let diasSemFaturar = 90

        const rawDiasSemFaturar = String(row.dias_sem_faturar || '').trim()
        if (rawDiasSemFaturar) {
          const numDias = parseInt(rawDiasSemFaturar.replace(/\D/g, ''), 10)
          if (!isNaN(numDias)) {
            diasSemFaturar = numDias
          } else if (/novo|sem venda/i.test(rawDiasSemFaturar)) {
            diasSemFaturar = 180
          }
        } else if (row.ultima_compra) {
          const parsed = new Date(row.ultima_compra)
          if (!isNaN(parsed.getTime())) {
            ultimaCompraDate = parsed.toISOString()
            const diffMs = now.getTime() - parsed.getTime()
            diasSemFaturar = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
          }
        }

        const rawFaixa = String(row.faixa || '')
          .toLowerCase()
          .trim()
        let faixa = '90_plus'
        if (rawFaixa.includes('60') && rawFaixa.includes('89')) {
          faixa = '60_89'
        } else if (rawFaixa.includes('90') || rawFaixa.includes('sem venda')) {
          faixa = '90_plus'
        } else if (
          rawFaixa.includes('recente') ||
          rawFaixa.includes('30') ||
          rawFaixa.includes('menor que 60')
        ) {
          faixa = 'recente'
        } else {
          if (diasSemFaturar < 60) {
            faixa = 'recente'
          } else if (diasSemFaturar >= 60 && diasSemFaturar <= 89) {
            faixa = '60_89'
          } else {
            faixa = '90_plus'
          }
        }

        const scoreRecencia = Math.min(100, Math.round((diasSemFaturar / 180) * 100))
        const scoreFreq = Math.min(100, comprasCount * 12)
        const ticketMedio = comprasCount > 0 ? valorHistorico / comprasCount : valorUltimaCompra
        const scoreTicket = Math.min(100, Math.round((ticketMedio / 100000) * 100))
        const scoreSeg = 70

        const calcScore = Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (scoreRecencia * (pesos.recencia || 30)) / 100 +
                (scoreFreq * (pesos.frequencia || 25)) / 100 +
                (scoreTicket * (pesos.ticket_tonelagem || 20)) / 100 +
                (scoreSeg * (pesos.segmento || 10)) / 100,
            ),
          ),
        )

        let rec = targetRec
        let isNew = false
        if (!rec) {
          rec = new Record(colClientes)
          rec.set('codigo', rawCodigo)
          isNew = true
        }

        rec.set('nome', rawNome)
        if (row.cpf_cnpj) rec.set('cpf_cnpj', String(row.cpf_cnpj).trim())
        if (row.telefone) rec.set('telefone', String(row.telefone).replace(/\D/g, ''))
        if (row.whatsapp) rec.set('whatsapp', String(row.whatsapp).replace(/\D/g, ''))
        if (row.email) rec.set('email', String(row.email).trim())

        if (rawCidade || rawEstado) {
          const locStr = [rawCidade, rawEstado].filter(Boolean).join(' - ')
          rec.set('endereco', locStr)
        }

        const rawReg = String(row.regiao || '').trim()
        let parsedReg = rawReg ? rawReg.toUpperCase() : 'Sem Região'
        rec.set('regiao', parsedReg)

        let vendedorRow = String(row.vendedor || '').trim()
        if (!vendedorRow && parsedReg !== 'Sem Região') {
          try {
            const regRec = $app.findFirstRecordByData('regioes', 'nome', parsedReg)
            if (regRec) {
              const vExt = regRec.getString('vendedor_externo')
              if (vExt) vendedorRow = vExt
            }
          } catch (_) {}
        }
        if (vendedorRow) rec.set('vendedor', vendedorRow)
        if (row.segmento) {
          const segRaw = String(row.segmento).trim()
          const segNorm = segRaw
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[._\-\/\\,;:]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

          let finalSeg = segRaw
          if (
            segNorm.includes('ind trans') ||
            segNorm.includes('industria de transf') ||
            segNorm.includes('transformacao') ||
            segNorm.includes('ind man') ||
            segNorm.includes('metalurg') ||
            segNorm.includes('industrial') ||
            segNorm.includes('manufat')
          ) {
            finalSeg = 'Indústria de transformação'
          } else if (
            segNorm === 'lmc' ||
            segNorm === 'l m c' ||
            segNorm.includes('loja de mat') ||
            segNorm.includes('loja mat') ||
            segNorm.includes('material de const') ||
            segNorm.includes('mat construcao') ||
            segNorm.includes('materiais de const')
          ) {
            finalSeg = 'Loja de Material de Construção'
          } else if (
            segNorm.includes('deposito') ||
            segNorm.includes('armador') ||
            segNorm.includes('corte e dobra') ||
            segNorm.includes('corte dobra')
          ) {
            finalSeg = 'Depósito (armadores)'
          } else if (segNorm.includes('estrutur') || segNorm.includes('estrutura metal')) {
            finalSeg = 'Estruturista'
          } else if (segNorm.includes('calheir') || segNorm.includes('calha')) {
            finalSeg = 'Calheiros'
          } else if (
            segNorm.includes('construt') ||
            segNorm.includes('engenh') ||
            segNorm.includes('obra')
          ) {
            finalSeg = 'Construtora'
          } else if (segNorm.includes('distrib')) {
            finalSeg = 'Distribuidor'
          } else if (segNorm.includes('investid') || segNorm.includes('incorporad')) {
            finalSeg = 'Investidor'
          } else if (
            segNorm.includes('laje') ||
            segNorm.includes('pre mold') ||
            segNorm.includes('premold')
          ) {
            finalSeg = 'Lajeiro'
          } else if (segNorm.includes('pedreir') || segNorm.includes('mestre de obra')) {
            finalSeg = 'Pedreiro'
          } else if (
            segNorm.includes('rural') ||
            segNorm.includes('agric') ||
            segNorm.includes('agro') ||
            segNorm.includes('produtor') ||
            segNorm.includes('fazend')
          ) {
            finalSeg = 'Produtor rural'
          } else if (segNorm.includes('revend') || segNorm.includes('comercio varej')) {
            finalSeg = 'Revenda'
          } else if (segNorm.includes('serralh') || segNorm.includes('ferrag')) {
            finalSeg = 'Serralheiro'
          } else if (
            segNorm.includes('cliente final') ||
            segNorm.includes('consumidor final') ||
            segNorm.includes('pessoa fisica') ||
            segNorm.includes('consumidor') ||
            segNorm === 'final'
          ) {
            finalSeg = 'Cliente final'
          }
          rec.set('segmento', finalSeg)
        }
        if (row.endereco) rec.set('endereco', String(row.endereco).trim())

        if (ultimaCompraDate) rec.set('ultima_compra', ultimaCompraDate)
        rec.set('valor_ultima_compra', valorUltimaCompra)
        rec.set('toneladas_historico', toneladasHistorico)
        rec.set('valor_historico', valorHistorico)
        rec.set('compras_count', comprasCount)
        rec.set('dias_sem_faturar', diasSemFaturar)
        rec.set('faixa', faixa)

        if (row.canal) rec.set('canal', String(row.canal).trim())
        if (row.margem_media_perc !== undefined && row.margem_media_perc !== null) {
          rec.set('margem_media_perc', Number(row.margem_media_perc))
        }
        if (row.margem_reais !== undefined && row.margem_reais !== null) {
          rec.set('margem_reais', Number(row.margem_reais))
        }
        if (row.peso_nf_tonelagem !== undefined && row.peso_nf_tonelagem !== null) {
          rec.set('peso_nf_tonelagem', Number(row.peso_nf_tonelagem))
        }
        if (row.fat_12m_reais !== undefined && row.fat_12m_reais !== null) {
          rec.set('fat_12m_reais', Number(row.fat_12m_reais))
        }
        if (row.frequencia_compras_12m !== undefined && row.frequencia_compras_12m !== null) {
          rec.set('frequencia_compras_12m', Number(row.frequencia_compras_12m))
        }
        if (row.tipo_vendedor) rec.set('tipo_vendedor', String(row.tipo_vendedor).trim())
        if (row.ultimo_pedido_numero || row.pedido) {
          rec.set('ultimo_pedido_numero', String(row.ultimo_pedido_numero || row.pedido).trim())
        }
        if (row.ultimo_pedido_data) {
          rec.set('ultimo_pedido_data', String(row.ultimo_pedido_data).trim())
        }
        if (ultimaCompraDate) {
          rec.set('ultimo_faturamento_data', ultimaCompraDate)
        }

        const tentativas = rec.getInt('tentativas_sem_contato') || 0
        const finalScore = Math.max(0, calcScore - tentativas * 5)
        rec.set('score', finalScore)

        const currentEstado = rec.getString('estado')
        if (faixa === 'recente') {
          if (currentEstado !== 'reativado') {
            rec.set('estado', 'reativado')
            rec.set('operador', '')
            rec.set('lock_timestamp', null)
            countReconciliadosFaturaram++
          }
        } else if (isNew) {
          rec.set('estado', 'na_base')
          rec.set('origem', 'importacao')
        }

        const pedidoSalvo = rec.getString('pedido_reativacao')
        const pedidoPlanilha = String(row.pedido || row.numero_pedido || '').trim()
        if (pedidoSalvo) {
          if (pedidoPlanilha && pedidoPlanilha === pedidoSalvo) {
            rec.set('pedido_confirmado', true)
            countPedidosValidados++
          } else if (pedidoPlanilha && pedidoPlanilha !== pedidoSalvo) {
            countPedidosDivergentes++
            divergencias.push({
              codigo: rawCodigo,
              nome: rawNome,
              pedidoEsperado: pedidoSalvo,
              pedidoPlanilha: pedidoPlanilha,
            })
          }
        }

        $app.save(rec)

        // Atualizar cache em memória para próximos chunks do mesmo envio
        clientsByCode[rawCodigo] = rec

        if (isNew) countNovas++
        else countAtualizadas++
      }

      // Se substituição total ativada: quem estava na base e não veio na planilha é marcado como suspenso
      if (substituicaoTotal && modoImportacao === 'base_mestre') {
        const allActive = $app.findRecordsByFilter('clientes', "estado = 'na_base'", '', 500, 0)
        for (let j = 0; j < allActive.length; j++) {
          const item = allActive[j]
          if (!importedCodigos.has(item.getString('codigo'))) {
            item.set('estado', 'suspenso')
            $app.save(item)
          }
        }
      }

      // Registrar histórico da importação
      const impRec = new Record(colImportacoes)
      impRec.set('nome_arquivo', fileName)
      impRec.set('modo_importacao', modoImportacao)
      impRec.set('linhas_total', rows.length)
      impRec.set('linhas_importadas', countNovas)
      impRec.set('linhas_atualizadas', countAtualizadas)
      impRec.set('linhas_rejeitadas', countRejeitadas)
      impRec.set('matches_nome', countMatchesNome)
      impRec.set('sem_correspondencia', countSemCorrespondencia)
      impRec.set('reconciliados_faturaram', countReconciliadosFaturaram)
      impRec.set('pedidos_validados', countPedidosValidados)
      impRec.set('pedidos_divergentes', countPedidosDivergentes)
      impRec.set(
        'status',
        countRejeitadas > 0 && countNovas === 0 && countAtualizadas === 0 ? 'erro' : 'concluida',
      )
      impRec.set('detalhes_erro', erros)
      impRec.set('divergencias_pedidos', divergencias)
      impRec.set('substituicao_total', substituicaoTotal)
      impRec.set('criado_por', userId)
      $app.save(impRec)

      return e.json(200, {
        ok: true,
        importacao_id: impRec.id,
        resumo: {
          total: rows.length,
          modo: modoImportacao,
          novas: countNovas,
          atualizadas: countAtualizadas,
          rejeitadas: countRejeitadas,
          matchesNome: countMatchesNome,
          semCorrespondencia: countSemCorrespondencia,
          semCorrespondenciaLista: semCorrespondenciaLista,
          reconciliadosFaturaram: countReconciliadosFaturaram,
          pedidosValidados: countPedidosValidados,
          pedidosDivergentes: countPedidosDivergentes,
          erros: erros,
          divergencias: divergencias,
        },
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
