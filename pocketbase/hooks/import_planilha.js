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
      let countInalteradas = 0
      let countRejeitadas = 0
      let countMatchesNome = 0
      let countSemCorrespondencia = 0
      let countReconciliadosFaturaram = 0
      let countPedidosValidados = 0
      let countPedidosDivergentes = 0
      let countPuladosAtivoForaBase = 0
      const erros = []
      const divergencias = []
      const semCorrespondenciaLista = []
      const importedCodigos = new Set()

      // Helper inline para normalizar strings de texto (remove acentos, pontuação e espaços múltiplos)
      const normalizeClean = (str) => {
        if (!str) return ''
        return String(str)
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Helper inline para comparação de números (trata null/undefined como 0 ou compara com tolerância)
      const numbersDifferent = (a, b) => {
        const numA = a === null || a === undefined || a === '' ? 0 : Number(a)
        const numB = b === null || b === undefined || b === '' ? 0 : Number(b)
        return Math.abs(numA - numB) > 0.0001
      }

      // Helper inline para comparar strings ignorando espaços extras
      const stringsDifferent = (a, b) => {
        const sA = a === null || a === undefined ? '' : String(a).trim()
        const sB = b === null || b === undefined ? '' : String(b).trim()
        return sA !== sB
      }

      // Helper inline para comparar datas (formato YYYY-MM-DD ou ISO)
      const datesDifferent = (a, b) => {
        if (!a && !b) return false
        if (!a || !b) return true
        const sA = String(a).slice(0, 10)
        const sB = String(b).slice(0, 10)
        return sA !== sB
      }

      // Helper inline seguro para sanitização e validação de datas
      const safeParseDate = (raw) => {
        if (!raw) return null
        const str = String(raw).trim()
        if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null
        // Se parece número puro ou formato estranho
        const d = new Date(str)
        if (isNaN(d.getTime())) return null
        const yr = d.getFullYear()
        if (yr < 1990 || yr > 2100) return null
        return d
      }

      // Cache em memória de clientes existentes para busca rápida
      const existingClientes = $app.findRecordsByFilter('clientes', '1=1', '', 50000, 0)
      const clientsByCode = {}
      const clientsByNameKey = {}
      const clientsByNameOnly = {}

      for (let k = 0; k < existingClientes.length; k++) {
        const cRec = existingClientes[k]
        const cCode = cRec.getString('codigo')
        const cNome = cRec.getString('nome')
        const cEndereco = cRec.getString('endereco')

        if (cCode) {
          clientsByCode[cCode.toUpperCase()] = cRec
        }

        const normNome = normalizeClean(cNome)
        if (normNome) {
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

      // Cache de regiões para atribuição de vendedor externo padrão
      const regioesList = $app.findRecordsByFilter('regioes', '1=1', '', 100, 0)
      const regioesMap = {}
      for (let r = 0; r < regioesList.length; r++) {
        const rRec = regioesList[r]
        const rNome = rRec.getString('nome')
        if (rNome) regioesMap[rNome.toUpperCase()] = rRec
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

        try {
          const rawCodigo = String(row.codigo || '')
            .trim()
            .toUpperCase()
          const rawNome = String(row.nome || '').trim()
          const rawCidade = String(row.cidade || '').trim()
          const rawEstado = String(row.estado || row.uf || '').trim()

          // Validação conforme modo
          if (modoImportacao === 'base_mestre') {
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
            // Modos Faturamento e Margem: ao menos um dos dois
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

          // Busca do cliente existente:
          // No modo Base Mestre a correspondência é feita prioritariamente por CÓDIGO
          // Nos modos Faturamento/Reconciliação e Margem, também por código se existir ou por NOME (+ cidade/UF)
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

          // REGRA MANDATÓRIA: Se o cliente foi marcado como "Cliente Ativo - Fora da Base" (ativo_fora_base = true ou estado = 'ativo_fora_base'),
          // a importação DEVE PRESERVAR essa flag e NÃO pode reativá-lo, nem trazê-lo de volta para a fila/base de inativos.
          // O cliente é pulado em TODOS os modos.
          if (
            targetRec &&
            (targetRec.getString('estado') === 'ativo_fora_base' ||
              targetRec.getBool('ativo_fora_base'))
          ) {
            countPuladosAtivoForaBase++
            countInalteradas++
            if (modoImportacao === 'base_mestre') {
              importedCodigos.add(rawCodigo)
            }
            continue
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
            let rawDataPedido = String(row.ultima_compra || row.ultimo_pedido_data || '').trim()

            // Detecção de mudanças / dados alterados para gravação cirúrgica
            let mudou = false

            if (fatValor > 0) {
              if (numbersDifferent(targetRec.getFloat('valor_ultima_compra'), fatValor)) {
                targetRec.set('valor_ultima_compra', fatValor)
                mudou = true
              }
              if (numbersDifferent(targetRec.getFloat('fat_12m_reais'), fatValor)) {
                targetRec.set('fat_12m_reais', fatValor)
                mudou = true
              }
            }

            if (pesoVal > 0) {
              if (numbersDifferent(targetRec.getFloat('toneladas_historico'), pesoVal)) {
                targetRec.set('toneladas_historico', pesoVal)
                mudou = true
              }
              if (numbersDifferent(targetRec.getFloat('peso_nf_tonelagem'), pesoVal)) {
                targetRec.set('peso_nf_tonelagem', pesoVal)
                mudou = true
              }
            }

            if (
              numPedido &&
              stringsDifferent(targetRec.getString('ultimo_pedido_numero'), numPedido)
            ) {
              targetRec.set('ultimo_pedido_numero', numPedido)
              mudou = true
            }

            let diasCalculados = targetRec.getInt('dias_sem_faturar')

            if (rawDataPedido) {
              const parsed = safeParseDate(rawDataPedido)
              if (parsed) {
                const isoFull = parsed.toISOString()
                const isoDate = isoFull.split('T')[0]
                if (datesDifferent(targetRec.getString('ultima_compra'), isoFull)) {
                  targetRec.set('ultima_compra', isoFull)
                  mudou = true
                }
                if (datesDifferent(targetRec.getString('ultimo_faturamento_data'), isoFull)) {
                  targetRec.set('ultimo_faturamento_data', isoFull)
                  mudou = true
                }
                if (datesDifferent(targetRec.getString('ultimo_pedido_data'), isoDate)) {
                  targetRec.set('ultimo_pedido_data', isoDate)
                  mudou = true
                }
                const diffMs = now.getTime() - parsed.getTime()
                diasCalculados = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
                if (targetRec.getInt('dias_sem_faturar') !== diasCalculados) {
                  targetRec.set('dias_sem_faturar', diasCalculados)
                  mudou = true
                }
                const novaFaixa =
                  diasCalculados < 60 ? 'recente' : diasCalculados <= 89 ? '60_89' : '90_plus'
                if (targetRec.getString('faixa') !== novaFaixa) {
                  targetRec.set('faixa', novaFaixa)
                  mudou = true
                }
              }
            }

            if (
              row.canal &&
              stringsDifferent(targetRec.getString('canal'), String(row.canal).trim())
            ) {
              targetRec.set('canal', String(row.canal).trim())
              mudou = true
            }
            if (
              row.vendedor &&
              stringsDifferent(targetRec.getString('vendedor'), String(row.vendedor).trim())
            ) {
              targetRec.set('vendedor', String(row.vendedor).trim())
              mudou = true
            }
            if (row.regiao) {
              let regStr = String(row.regiao).trim().toUpperCase()
              if (regStr === 'BRAGANÇA PAULISTA' || regStr === 'BRAGANCA PAULISTA') {
                regStr = 'BRAGANÇA'
              } else if (
                regStr === 'MICRO-REGIÃO' ||
                regStr === 'MICRO REGIAO' ||
                regStr === 'MICRO-REGIAO'
              ) {
                regStr = 'CAMBUÍ'
              } else if (regStr === 'ATACADO') {
                regStr = 'ATACADO'
              }
              if (regStr && stringsDifferent(targetRec.getString('regiao'), regStr)) {
                targetRec.set('regiao', regStr)
                mudou = true
              }
            }

            // Reconciliação: APENAS clientes com faturamento recente (<60 dias) saem da fila (estado = 'reativado').
            // Clientes com última compra há 60 dias ou mais permanecem elegíveis para a esteira de reativação ('na_base').
            const estadoAtual = targetRec.getString('estado')
            const isRecente = diasCalculados < 60
            if (isRecente) {
              if (estadoAtual !== 'reativado') {
                targetRec.set('estado', 'reativado')
                targetRec.set('operador', '')
                targetRec.set('lock_timestamp', null)
                countReconciliadosFaturaram++
                mudou = true
              }
            } else {
              // Se tem 60+ dias, e estava marcado indevidamente como 'reativado', restaura para 'na_base'
              if (estadoAtual === 'reativado') {
                targetRec.set('estado', 'na_base')
                targetRec.set('operador', '')
                targetRec.set('lock_timestamp', null)
                mudou = true
              }
            }

            // Validação de divergência de pedido de reativação salvo
            const pedidoSalvo = targetRec.getString('pedido_reativacao')
            if (pedidoSalvo && numPedido) {
              if (numPedido === pedidoSalvo) {
                if (!targetRec.getBool('pedido_confirmado')) {
                  targetRec.set('pedido_confirmado', true)
                  mudou = true
                }
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

            if (mudou) {
              $app.save(targetRec)
              countAtualizadas++
            } else {
              countInalteradas++
            }
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

            let mudou = false

            let targetMargemPerc = null
            if (row.margem_media_perc !== undefined && row.margem_media_perc !== null) {
              targetMargemPerc = Number(row.margem_media_perc)
            } else if (row.margem_perc !== undefined && row.margem_perc !== null) {
              targetMargemPerc = Number(row.margem_perc)
            }

            let targetMargemReais = null
            if (row.margem_reais !== undefined && row.margem_reais !== null) {
              targetMargemReais = Number(row.margem_reais)
            } else if (row.margem_valor !== undefined && row.margem_valor !== null) {
              targetMargemReais = Number(row.margem_valor)
            }

            if (
              targetMargemPerc !== null &&
              !isNaN(targetMargemPerc) &&
              numbersDifferent(targetRec.getFloat('margem_media_perc'), targetMargemPerc)
            ) {
              targetRec.set('margem_media_perc', targetMargemPerc)
              mudou = true
            }

            if (
              targetMargemReais !== null &&
              !isNaN(targetMargemReais) &&
              numbersDifferent(targetRec.getFloat('margem_reais'), targetMargemReais)
            ) {
              targetRec.set('margem_reais', targetMargemReais)
              mudou = true
            }

            // Bônus de score se tiver margem > 20%
            const currentScore = targetRec.getInt('score') || 50
            const effMargemPerc =
              targetMargemPerc !== null
                ? targetMargemPerc
                : targetRec.getFloat('margem_media_perc') || 0
            if (effMargemPerc > 20) {
              const novoScore = Math.min(100, currentScore + 10)
              if (novoScore !== currentScore) {
                targetRec.set('score', novoScore)
                mudou = true
              }
            }

            if (mudou) {
              $app.save(targetRec)
              countAtualizadas++
            } else {
              countInalteradas++
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
            const parsed = safeParseDate(row.ultima_compra)
            if (parsed) {
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
          const isNew = !rec

          if (isNew) {
            rec = new Record(colClientes)
            rec.set('codigo', rawCodigo)
            rec.set('nome', rawNome)
            if (row.cpf_cnpj) rec.set('cpf_cnpj', String(row.cpf_cnpj).trim())
            if (row.telefone) rec.set('telefone', String(row.telefone).replace(/\D/g, ''))
            if (row.whatsapp) rec.set('whatsapp', String(row.whatsapp).replace(/\D/g, ''))
            if (row.email) rec.set('email', String(row.email).trim())

            let locStr = ''
            if (rawCidade || rawEstado) {
              locStr = [rawCidade, rawEstado].filter(Boolean).join(' - ')
            } else if (row.endereco) {
              locStr = String(row.endereco).trim()
            }
            if (locStr) rec.set('endereco', locStr)

            const rawReg = String(row.regiao || '').trim()
            let parsedReg = rawReg ? rawReg.toUpperCase() : 'Sem Região'
            if (parsedReg === 'BRAGANÇA PAULISTA' || parsedReg === 'BRAGANCA PAULISTA') {
              parsedReg = 'BRAGANÇA'
            } else if (
              parsedReg === 'MICRO-REGIÃO' ||
              parsedReg === 'MICRO REGIAO' ||
              parsedReg === 'MICRO-REGIAO'
            ) {
              parsedReg = 'CAMBUÍ'
            } else if (parsedReg === 'ATACADO') {
              parsedReg = 'ATACADO'
            }
            rec.set('regiao', parsedReg)

            let vendedorRow = String(row.vendedor || '').trim()
            if (!vendedorRow && parsedReg !== 'Sem Região' && regioesMap[parsedReg]) {
              const vExt = regioesMap[parsedReg].getString('vendedor_externo')
              if (vExt) vendedorRow = vExt
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

            if (ultimaCompraDate) {
              rec.set('ultima_compra', ultimaCompraDate)
              rec.set('ultimo_faturamento_data', ultimaCompraDate)
            }
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
              const dPed = safeParseDate(row.ultimo_pedido_data)
              if (dPed) {
                rec.set('ultimo_pedido_data', dPed.toISOString().split('T')[0])
              }
            }

            rec.set('score', calcScore)

            if (faixa === 'recente') {
              rec.set('estado', 'reativado')
              countReconciliadosFaturaram++
            } else {
              rec.set('estado', 'na_base')
            }
            rec.set('origem', 'importacao')

            $app.save(rec)
            clientsByCode[rawCodigo] = rec
            countNovas++
          } else {
            // Cliente existente: comparação campo a campo (importação incremental real)
            let mudou = false

            if (stringsDifferent(rec.getString('nome'), rawNome)) {
              rec.set('nome', rawNome)
              mudou = true
            }
            if (
              row.cpf_cnpj &&
              stringsDifferent(rec.getString('cpf_cnpj'), String(row.cpf_cnpj).trim())
            ) {
              rec.set('cpf_cnpj', String(row.cpf_cnpj).trim())
              mudou = true
            }
            if (row.telefone) {
              const cleanTel = String(row.telefone).replace(/\D/g, '')
              if (cleanTel && stringsDifferent(rec.getString('telefone'), cleanTel)) {
                rec.set('telefone', cleanTel)
                mudou = true
              }
            }
            if (row.whatsapp) {
              const cleanWpp = String(row.whatsapp).replace(/\D/g, '')
              if (cleanWpp && stringsDifferent(rec.getString('whatsapp'), cleanWpp)) {
                rec.set('whatsapp', cleanWpp)
                mudou = true
              }
            }
            if (row.email && stringsDifferent(rec.getString('email'), String(row.email).trim())) {
              rec.set('email', String(row.email).trim())
              mudou = true
            }

            let newLoc = ''
            if (rawCidade || rawEstado) {
              newLoc = [rawCidade, rawEstado].filter(Boolean).join(' - ')
            } else if (row.endereco) {
              newLoc = String(row.endereco).trim()
            }
            if (newLoc && stringsDifferent(rec.getString('endereco'), newLoc)) {
              rec.set('endereco', newLoc)
              mudou = true
            }

            const rawReg = String(row.regiao || '').trim()
            let parsedReg = rawReg ? rawReg.toUpperCase() : 'Sem Região'
            if (parsedReg === 'BRAGANÇA PAULISTA' || parsedReg === 'BRAGANCA PAULISTA') {
              parsedReg = 'BRAGANÇA'
            } else if (
              parsedReg === 'MICRO-REGIÃO' ||
              parsedReg === 'MICRO REGIAO' ||
              parsedReg === 'MICRO-REGIAO'
            ) {
              parsedReg = 'CAMBUÍ'
            } else if (parsedReg === 'ATACADO') {
              parsedReg = 'ATACADO'
            }
            if (stringsDifferent(rec.getString('regiao'), parsedReg)) {
              rec.set('regiao', parsedReg)
              mudou = true
            }

            let vendedorRow = String(row.vendedor || '').trim()
            if (!vendedorRow && parsedReg !== 'Sem Região' && regioesMap[parsedReg]) {
              const vExt = regioesMap[parsedReg].getString('vendedor_externo')
              if (vExt) vendedorRow = vExt
            }
            if (vendedorRow && stringsDifferent(rec.getString('vendedor'), vendedorRow)) {
              rec.set('vendedor', vendedorRow)
              mudou = true
            }

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
              if (stringsDifferent(rec.getString('segmento'), finalSeg)) {
                rec.set('segmento', finalSeg)
                mudou = true
              }
            }

            if (
              ultimaCompraDate &&
              datesDifferent(rec.getString('ultima_compra'), ultimaCompraDate)
            ) {
              rec.set('ultima_compra', ultimaCompraDate)
              rec.set('ultimo_faturamento_data', ultimaCompraDate)
              mudou = true
            }

            if (numbersDifferent(rec.getFloat('valor_ultima_compra'), valorUltimaCompra)) {
              rec.set('valor_ultima_compra', valorUltimaCompra)
              mudou = true
            }
            if (numbersDifferent(rec.getFloat('toneladas_historico'), toneladasHistorico)) {
              rec.set('toneladas_historico', toneladasHistorico)
              mudou = true
            }
            if (numbersDifferent(rec.getFloat('valor_historico'), valorHistorico)) {
              rec.set('valor_historico', valorHistorico)
              mudou = true
            }
            if (rec.getInt('compras_count') !== comprasCount) {
              rec.set('compras_count', comprasCount)
              mudou = true
            }
            if (rec.getInt('dias_sem_faturar') !== diasSemFaturar) {
              rec.set('dias_sem_faturar', diasSemFaturar)
              mudou = true
            }
            if (stringsDifferent(rec.getString('faixa'), faixa)) {
              rec.set('faixa', faixa)
              mudou = true
            }

            if (row.canal && stringsDifferent(rec.getString('canal'), String(row.canal).trim())) {
              rec.set('canal', String(row.canal).trim())
              mudou = true
            }
            if (
              row.margem_media_perc !== undefined &&
              row.margem_media_perc !== null &&
              numbersDifferent(rec.getFloat('margem_media_perc'), Number(row.margem_media_perc))
            ) {
              rec.set('margem_media_perc', Number(row.margem_media_perc))
              mudou = true
            }
            if (
              row.margem_reais !== undefined &&
              row.margem_reais !== null &&
              numbersDifferent(rec.getFloat('margem_reais'), Number(row.margem_reais))
            ) {
              rec.set('margem_reais', Number(row.margem_reais))
              mudou = true
            }
            if (
              row.peso_nf_tonelagem !== undefined &&
              row.peso_nf_tonelagem !== null &&
              numbersDifferent(rec.getFloat('peso_nf_tonelagem'), Number(row.peso_nf_tonelagem))
            ) {
              rec.set('peso_nf_tonelagem', Number(row.peso_nf_tonelagem))
              mudou = true
            }
            if (
              row.fat_12m_reais !== undefined &&
              row.fat_12m_reais !== null &&
              numbersDifferent(rec.getFloat('fat_12m_reais'), Number(row.fat_12m_reais))
            ) {
              rec.set('fat_12m_reais', Number(row.fat_12m_reais))
              mudou = true
            }
            if (
              row.frequencia_compras_12m !== undefined &&
              row.frequencia_compras_12m !== null &&
              numbersDifferent(
                rec.getFloat('frequencia_compras_12m'),
                Number(row.frequencia_compras_12m),
              )
            ) {
              rec.set('frequencia_compras_12m', Number(row.frequencia_compras_12m))
              mudou = true
            }
            if (
              row.tipo_vendedor &&
              stringsDifferent(rec.getString('tipo_vendedor'), String(row.tipo_vendedor).trim())
            ) {
              rec.set('tipo_vendedor', String(row.tipo_vendedor).trim())
              mudou = true
            }
            const numPed = String(row.ultimo_pedido_numero || row.pedido || '').trim()
            if (numPed && stringsDifferent(rec.getString('ultimo_pedido_numero'), numPed)) {
              rec.set('ultimo_pedido_numero', numPed)
              mudou = true
            }
            if (row.ultimo_pedido_data) {
              const dPed = safeParseDate(row.ultimo_pedido_data)
              if (dPed) {
                const sPed = dPed.toISOString().split('T')[0]
                if (datesDifferent(rec.getString('ultimo_pedido_data'), sPed)) {
                  rec.set('ultimo_pedido_data', sPed)
                  mudou = true
                }
              }
            }

            const tentativas = rec.getInt('tentativas_sem_contato') || 0
            const finalScore = Math.max(0, calcScore - tentativas * 5)
            if (rec.getInt('score') !== finalScore) {
              rec.set('score', finalScore)
              mudou = true
            }

            const currentEstado = rec.getString('estado')
            if (faixa === 'recente' && currentEstado !== 'reativado') {
              rec.set('estado', 'reativado')
              rec.set('operador', '')
              rec.set('lock_timestamp', null)
              countReconciliadosFaturaram++
              mudou = true
            }

            const pedidoSalvo = rec.getString('pedido_reativacao')
            const pedidoPlanilha = String(row.pedido || row.numero_pedido || '').trim()
            if (pedidoSalvo) {
              if (pedidoPlanilha && pedidoPlanilha === pedidoSalvo) {
                if (!rec.getBool('pedido_confirmado')) {
                  rec.set('pedido_confirmado', true)
                  mudou = true
                }
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

            if (mudou) {
              $app.save(rec)
              countAtualizadas++
            } else {
              countInalteradas++
            }
            clientsByCode[rawCodigo] = rec
          }
        } catch (rowErr) {
          // Resiliência de registro individual: falhas em campos inválidos ou validação de formato
          // NÃO derrubam o lote inteiro. Rejeitam a linha com detalhe e continuam o lote.
          countRejeitadas++
          const cId = String(row?.codigo || '')
            .trim()
            .toUpperCase()
          console.error(
            `[import_planilha] Erro na linha ${linhaNum} (código: ${cId}): ${rowErr.message} | Dados: ${JSON.stringify(row)}`,
          )
          erros.push({
            linha: linhaNum,
            codigo: cId,
            erro: rowErr.message || 'Erro inesperado ao salvar registro',
          })
        }
      }

      // Se substituição total ativada: quem estava na base e não veio na planilha é marcado como 'nao_quer_negociar'
      // (nota: 'suspenso' não é um valor válido do enum estado; o enum aceita 'na_base', 'reservado', 'em_atendimento',
      // 'reativado', 'reagendado', 'contatado', 'compra_terceiros', 'nao_quer_negociar', 'duplicado', 'sem_contato', 'ativo_fora_base')
      if (substituicaoTotal && modoImportacao === 'base_mestre') {
        try {
          const allActive = $app.findRecordsByFilter('clientes', "estado = 'na_base'", '', 50000, 0)
          for (let j = 0; j < allActive.length; j++) {
            const item = allActive[j]
            const cod = item.getString('codigo')
            if (cod && !importedCodigos.has(cod.toUpperCase())) {
              item.set('estado', 'sem_contato')
              try {
                $app.save(item)
              } catch (substSaveErr) {
                console.error(
                  `[import_planilha] Erro ao suspender cliente ${cod} na substituição total:`,
                  substSaveErr,
                )
              }
            }
          }
        } catch (substErr) {
          console.error('[import_planilha] Erro na rotina de substituição total:', substErr)
        }
      }

      // Registrar histórico da importação
      const impRec = new Record(colImportacoes)
      impRec.set('nome_arquivo', fileName)
      impRec.set('modo_importacao', modoImportacao)
      impRec.set('linhas_total', rows.length)
      impRec.set('linhas_importadas', countNovas)
      impRec.set('linhas_atualizadas', countAtualizadas)
      impRec.set('linhas_inalteradas', countInalteradas)
      impRec.set('linhas_rejeitadas', countRejeitadas)
      impRec.set('matches_nome', countMatchesNome)
      impRec.set('sem_correspondencia', countSemCorrespondencia)
      impRec.set('reconciliados_faturaram', countReconciliadosFaturaram)
      impRec.set('pedidos_validados', countPedidosValidados)
      impRec.set('pedidos_divergentes', countPedidosDivergentes)
      impRec.set('linhas_puladas_ativo_fora_base', countPuladosAtivoForaBase)
      impRec.set(
        'status',
        countRejeitadas > 0 && countNovas === 0 && countAtualizadas === 0 && countInalteradas === 0
          ? 'erro'
          : 'concluida',
      )
      impRec.set('detalhes_erro', erros)
      impRec.set('divergencias_pedidos', divergencias)
      impRec.set('substituicao_total', substituicaoTotal)
      impRec.set('criado_por', userId)
      try {
        $app.save(impRec)
      } catch (impSaveErr) {
        console.error(
          `[import_planilha] Falha ao gravar registro em importacoes (${fileName}):`,
          impSaveErr,
        )
      }

      return e.json(200, {
        ok: true,
        importacao_id: impRec.id,
        resumo: {
          total: rows.length,
          modo: modoImportacao,
          novas: countNovas,
          atualizadas: countAtualizadas,
          inalteradas: countInalteradas,
          rejeitadas: countRejeitadas,
          matchesNome: countMatchesNome,
          semCorrespondencia: countSemCorrespondencia,
          semCorrespondenciaLista: semCorrespondenciaLista,
          reconciliadosFaturaram: countReconciliadosFaturaram,
          pedidosValidados: countPedidosValidados,
          pedidosDivergentes: countPedidosDivergentes,
          puladosAtivoForaBase: countPuladosAtivoForaBase,
          erros: erros,
          divergencias: divergencias,
        },
      })
    } catch (err) {
      console.error(
        `[import_planilha] ERRO FATAL no endpoint /backend/v1/import/process-rows: ${err.message}`,
        err.stack,
      )
      return e.json(500, { error: err.message, stack: err.stack })
    }
  },
  $apis.requireAuth(),
)
