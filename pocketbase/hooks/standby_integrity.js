// Hook de integridade para fechamento de atendimentos e proteção de clientes em standby
// Impede que clientes reativados em standby válido sejam sobrescritos, reagendados ou reativados em duplicidade.

// 1. Hook ao criar registro na coleção "respostas_formulario"
onRecordCreateRequest((e) => {
  const authRecord = e.auth
  const userRole = authRecord ? authRecord.getString('role') : ''
  const record = e.record
  const clienteId = record.getString('cliente')
  const desfecho = record.getString('desfecho')

  if (!clienteId) {
    e.next()
    return
  }

  try {
    const cliente = $app.findRecordById('clientes', clienteId)
    if (!cliente) {
      e.next()
      return
    }

    const agora = new Date()
    const agoraMs = agora.getTime()
    const standbyAteStr = cliente.getString('standby_ate')
    const reativadoEmStr = cliente.getString('reativado_em')

    let emStandby = false
    if (standbyAteStr) {
      const parsedStandby = new Date(standbyAteStr)
      if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > agoraMs) {
        emStandby = true
      }
    }

    // Se o cliente foi reativado nos últimos 30 dias
    let reativadoRecentemente = false
    if (reativadoEmStr) {
      const parsedReat = new Date(reativadoEmStr)
      if (!isNaN(parsedReat.getTime())) {
        const diffDias = (agoraMs - parsedReat.getTime()) / (1000 * 60 * 60 * 24)
        if (diffDias >= 0 && diffDias < 30) {
          reativadoRecentemente = true
        }
      }
    }

    // REGRA 1: Se o operador tenta fechar como 'reativado', mas o cliente já foi reativado nos últimos 30 dias ou está em standby
    if (desfecho === 'reativado' && (emStandby || reativadoRecentemente)) {
      if (userRole !== 'admin') {
        throw new BadRequestError(
          'Duplicidade bloqueada: Este cliente já foi reativado recentemente (dentro de 30 dias ou período de standby vigente). Não é permitido registrar uma nova reativação duplicada.',
        )
      }
    }

    // REGRA 2: Se o cliente está reativado em standby válido, não pode ter formulário fechado por não-admin
    if (emStandby && userRole !== 'admin') {
      throw new BadRequestError(
        'Este cliente está em período de standby de 60 dias. Ficha bloqueada para novos desfechos.',
      )
    }

    // REGRA 3: Validação de valor e peso obrigatórios para garantir mensuração de métricas
    // Regra Q3 ("Fez orçamento?"):
    // - SOMENTE quando Q3 = "Sim" (ou 'sim'), Q15 (valor) e Q16 (peso) são OBRIGATÓRIOS.
    // - Quando Q3 = "Não", Q15 e Q16 não são exigidos (e devem ser limpos se preenchidos).
    // - Se Q3 vier vazia (ficha aberta antes da mudança), tratar como não respondida sem travar.
    // - Isenções existentes mantidas: sem_contato, duplicado e restricao_financeira nunca exigem.
    if (
      desfecho !== 'sem_contato' &&
      desfecho !== 'duplicado' &&
      desfecho !== 'restricao_financeira'
    ) {
      const respostas = record.get('respostas') || {}
      const q3Val =
        respostas.q3 !== undefined && respostas.q3 !== null ? String(respostas.q3).trim() : ''
      const fezOrcamento = q3Val.toLowerCase() === 'sim'

      if (fezOrcamento) {
        const valor = record.getFloat('valor_potencial')
        const peso = record.getFloat('toneladas_potencial')
        const rawValor = respostas.q15 !== undefined ? respostas.q15 : valor
        const rawPeso = respostas.q16 !== undefined ? respostas.q16 : peso

        const numValor = parseFloat(
          String(rawValor || '')
            .replace(/[^\d.,]/g, '')
            .replace(',', '.'),
        )
        const numPeso = parseFloat(
          String(rawPeso || '')
            .replace(/[^\d.,]/g, '')
            .replace(',', '.'),
        )

        if (isNaN(numValor) || numValor < 0 || String(rawValor || '').trim() === '') {
          throw new BadRequestError(
            'O preenchimento do Valor Potencial (Q15) é imprescindível para termos um bom retorno das métricas.',
          )
        }
        if (isNaN(numPeso) || numPeso < 0 || String(rawPeso || '').trim() === '') {
          throw new BadRequestError(
            'O preenchimento do Volume em Toneladas (Q16) é imprescindível para termos um bom retorno das métricas.',
          )
        }

        // Heurística de normalização de unidade (kg vs ton) com helper centralizado:
        var normRes =
          typeof normalizarPesoEUnidade === 'function'
            ? normalizarPesoEUnidade(numValor, numPeso, rawValor, rawPeso)
            : null

        var unidadeDetectada = normRes ? normRes.unidade_detectada : 'ton'
        var pesoNormalizadoTon = normRes ? normRes.toneladas : numPeso

        if (!normRes) {
          if (numValor > 0 && numPeso > 0) {
            var ratio = numValor / numPeso
            if (ratio >= 2 && ratio <= 60) {
              unidadeDetectada = 'kg'
              pesoNormalizadoTon = Number((numPeso / 1000).toFixed(6))
            } else if (ratio < 2 && numPeso >= 50) {
              unidadeDetectada = 'kg'
              pesoNormalizadoTon = Number((numPeso / 1000).toFixed(6))
            } else if (numPeso >= 50) {
              unidadeDetectada = 'kg'
              pesoNormalizadoTon = Number((numPeso / 1000).toFixed(6))
            }
          } else if (numPeso >= 50) {
            unidadeDetectada = 'kg'
            pesoNormalizadoTon = Number((numPeso / 1000).toFixed(6))
          }
        }

        record.set('toneladas_potencial', pesoNormalizadoTon)
        const novasResp = Object.assign({}, respostas)
        novasResp.q16 = rawPeso !== undefined ? rawPeso : numPeso
        novasResp.q16_unidade_detectada = unidadeDetectada
        novasResp.q16_toneladas_normalizadas = pesoNormalizadoTon
        record.set('respostas', novasResp)
      } else if (q3Val.toLowerCase() === 'não' || q3Val.toLowerCase() === 'nao') {
        // Se Q3 = "Não", garante que valor e peso não fiquem gravados (limpa dados órfãos)
        record.set('valor_potencial', null)
        record.set('toneladas_potencial', null)
        if (respostas.q15 !== undefined || respostas.q16 !== undefined) {
          const novasRespostas = Object.assign({}, respostas)
          delete novasRespostas.q15
          delete novasRespostas.q16
          record.set('respostas', novasRespostas)
        }
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
      throw err
    }
    console.log(
      '[standby_integrity] Erro em onRecordCreateRequest respostas_formulario:',
      err.message,
    )
  }

  e.next()
}, 'respostas_formulario')

// 1.0b Hook ao atualizar registro na coleção "respostas_formulario"
onRecordUpdateRequest((e) => {
  const record = e.record
  try {
    const respostas = record.get('respostas') || {}
    const q3Val =
      respostas.q3 !== undefined && respostas.q3 !== null ? String(respostas.q3).trim() : ''
    const fezOrcamento = q3Val.toLowerCase() === 'sim'

    const rawValor =
      respostas.q15 !== undefined ? respostas.q15 : record.getFloat('valor_potencial')
    const rawPeso =
      respostas.q16 !== undefined ? respostas.q16 : record.getFloat('toneladas_potencial')
    const vCur = record.getFloat('valor_potencial')
    const pCur = record.getFloat('toneladas_potencial')

    if (fezOrcamento || pCur > 0 || rawPeso) {
      var normRes =
        typeof normalizarPesoEUnidade === 'function'
          ? normalizarPesoEUnidade(vCur, pCur, rawValor, rawPeso)
          : null

      if (normRes) {
        record.set('toneladas_potencial', normRes.toneladas)
        const novasResp = Object.assign({}, respostas)
        novasResp.q16 = rawPeso !== undefined ? rawPeso : normRes.peso_bruto
        novasResp.q16_unidade_detectada = normRes.unidade_detectada
        novasResp.q16_toneladas_normalizadas = normRes.toneladas
        record.set('respostas', novasResp)
      }
    }
  } catch (err) {
    console.log(
      '[standby_integrity] Erro em onRecordUpdateRequest respostas_formulario:',
      err.message,
    )
  }
  e.next()
}, 'respostas_formulario')

// 1.1 Hook após criação de resposta de formulário: blindagem atômica server-side da transição do cliente
// Garante transição imediata de estado e liberação de lock/operador no banco, eliminando clientes presos em 'em_atendimento'
onRecordAfterCreateSuccess((e) => {
  const record = e.record
  const clienteId = record.getString('cliente')
  const desfecho = record.getString('desfecho')

  if (!clienteId || !desfecho) {
    e.next()
    return
  }

  const desfechosTransitar = [
    'reativado',
    'reagendado',
    'sem_contato',
    'venda_perdida',
    'compra_terceiros',
    'nao_quer_negociar',
    'restricao_financeira',
    'duplicado',
    'ativo_fora_base',
  ]

  if (!desfechosTransitar.includes(desfecho)) {
    e.next()
    return
  }

  try {
    const cliente = $app.findRecordById('clientes', clienteId)
    if (!cliente) {
      e.next()
      return
    }

    const temPedidoEmAberto = cliente.getBool('pedido_em_aberto')

    // Se houver pedido em aberto, o operador mantém o vínculo legitimamente conforme fluxo existente
    if (temPedidoEmAberto) {
      cliente.set('estado', desfecho)
      cliente.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
      $app.save(cliente)
      console.log(
        '[standby_integrity] Transição atômica server-side com pedido em aberto: ' +
          clienteId +
          ' -> ' +
          desfecho,
      )
      e.next()
      return
    }

    // Transição atômica completa: estado correto, lock_timestamp zerado, operador desvinculado
    cliente.set('estado', desfecho)
    cliente.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
    cliente.set('operador', '')
    if (desfecho !== 'reagendado') {
      cliente.set('reagendado_para', null)
      cliente.set('reagendado_operador', '')
    }
    $app.save(cliente)
    console.log(
      '[standby_integrity] Transição atômica server-side aplicada: ' +
        clienteId +
        ' -> ' +
        desfecho +
        ' (lock e operador zerados)',
    )
  } catch (err) {
    if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
      throw err
    }
    console.log(
      '[standby_integrity] Erro em onRecordCreateRequest respostas_formulario:',
      err.message,
    )

    // Em caso de erro inesperado, NÃO deixar passar valor bruto não normalizado
    // Aplica o fallback seguro com o raw do JSON respostas.q16
    try {
      const respostasFallback = record.get('respostas') || {}
      const rawQ16 = respostasFallback.q16
      const rawQ15 = respostasFallback.q15
      const vCur = record.getFloat('valor_potencial')
      const pCur = record.getFloat('toneladas_potencial')
      if (typeof normalizarPesoEUnidade === 'function') {
        const fallbackNorm = normalizarPesoEUnidade(vCur, pCur, rawQ15, rawQ16)
        record.set('toneladas_potencial', fallbackNorm.toneladas)
        const nResp = Object.assign({}, respostasFallback)
        nResp.q16_unidade_detectada = fallbackNorm.unidade_detectada
        nResp.q16_toneladas_normalizadas = fallbackNorm.toneladas
        record.set('respostas', nResp)
      }
    } catch (fbErr) {
      console.log('[standby_integrity] Falha no fallback seguro:', fbErr.message)
    }
  }

  e.next()
}, 'respostas_formulario')
// 2. Hook ao criar registro na coleção "interacoes"
onRecordCreateRequest((e) => {
  const authRecord = e.auth
  const userRole = authRecord ? authRecord.getString('role') : ''
  const record = e.record
  const clienteId = record.getString('cliente')
  const desfecho = record.getString('desfecho')
  const tipo = record.getString('tipo')

  if (!clienteId || tipo === 'edicao_admin' || tipo === 'correcao_duplicidade') {
    e.next()
    return
  }

  try {
    const cliente = $app.findRecordById('clientes', clienteId)
    if (!cliente) {
      e.next()
      return
    }

    const agora = new Date()
    const agoraMs = agora.getTime()
    const standbyAteStr = cliente.getString('standby_ate')
    const reativadoEmStr = cliente.getString('reativado_em')

    let emStandby = false
    if (standbyAteStr) {
      const parsedStandby = new Date(standbyAteStr)
      if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > agoraMs) {
        emStandby = true
      }
    }

    let reativadoRecentemente = false
    if (reativadoEmStr) {
      const parsedReat = new Date(reativadoEmStr)
      if (!isNaN(parsedReat.getTime())) {
        const diffDias = (agoraMs - parsedReat.getTime()) / (1000 * 60 * 60 * 24)
        if (diffDias >= 0 && diffDias < 30) {
          reativadoRecentemente = true
        }
      }
    }

    // Impede nova interação de reativação se já foi reativado nos últimos 30 dias / em standby
    if (desfecho === 'reativado' && (emStandby || reativadoRecentemente)) {
      if (userRole !== 'admin') {
        throw new BadRequestError(
          'Duplicidade bloqueada: Este cliente já foi reativado recentemente (dentro de 30 dias ou período de standby vigente).',
        )
      }
    }

    // Impede operador de fechar atendimento de cliente em standby
    if (emStandby && tipo === 'formulario' && userRole !== 'admin') {
      throw new BadRequestError(
        'Este cliente está em período de standby de 60 dias. Ficha bloqueada para novos atendimentos.',
      )
    }
  } catch (err) {
    if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
      throw err
    }
    console.log('[standby_integrity] Erro em onRecordCreateRequest interacoes:', err.message)
  }

  e.next()
}, 'interacoes')

// 3. Hook de proteção direta ao atualizar "clientes"
onRecordUpdateRequest((e) => {
  const authRecord = e.auth
  const userRole = authRecord ? authRecord.getString('role') : ''
  const record = e.record

  // Se for superuser / backend hook interno, permite
  if (!authRecord) {
    e.next()
    return
  }

  try {
    const recordOriginal = $app.findRecordById('clientes', record.id)
    if (!recordOriginal) {
      e.next()
      return
    }

    const agora = new Date()
    const agoraMs = agora.getTime()
    const standbyAteOriginal = recordOriginal.getString('standby_ate')
    const estadoOriginal = recordOriginal.getString('estado')

    let estavaEmStandby = false
    if (standbyAteOriginal) {
      const parsedStandby = new Date(standbyAteOriginal)
      if (!isNaN(parsedStandby.getTime()) && parsedStandby.getTime() > agoraMs) {
        estavaEmStandby = true
      }
    }

    // Se o cliente original ESTAVA em standby válido (estado 'reativado' ou standby_ate no futuro):
    if (estavaEmStandby || estadoOriginal === 'reativado') {
      const novoEstado = record.getString('estado')

      // Não-admin NUNCA pode alterar o estado de um cliente em standby (ex: para 'reagendado', 'na_base')
      if (userRole !== 'admin') {
        if (
          novoEstado !== 'reativado' &&
          novoEstado !== 'em_atendimento' &&
          novoEstado !== 'reservado'
        ) {
          // Bloqueia sobrescrita do estado reativado por reagendamento, na_base, etc.
          throw new BadRequestError(
            'Operação não permitida: Cliente reativado em período de standby não pode ter seu estado alterado.',
          )
        }
      } else {
        // Se for admin, a menos que ele explicitamente zere standby_ate (destrave),
        // preserva o standby_ate e reativado_em se eles forem enviados vazios ou corrompidos acidentalmente
        if (novoEstado === 'reativado' && !record.getString('standby_ate') && standbyAteOriginal) {
          record.set('standby_ate', standbyAteOriginal)
        }
        if (
          novoEstado === 'reativado' &&
          !record.getString('reativado_em') &&
          recordOriginal.getString('reativado_em')
        ) {
          record.set('reativado_em', recordOriginal.getString('reativado_em'))
        }
      }
    }

    // REGRA DE BLINDAGEM ATÔMICA DO DESFECHO (Requisito D):
    // Toda transição de 'em_atendimento' ou 'reservado' para qualquer desfecho
    // reseta lock_timestamp e desvincula operador atomicamente no backend,
    // preservando o vínculo do operador apenas se houver pedido em aberto pendente de faturamento.
    const novoEstadoTrans = record.getString('estado')
    const eraAtendimentoOuReservado =
      estadoOriginal === 'em_atendimento' || estadoOriginal === 'reservado'
    const estadosConclusaoDesfecho = [
      'reativado',
      'reagendado',
      'sem_contato',
      'venda_perdida',
      'nao_quer_negociar',
      'restricao_financeira',
      'compra_terceiros',
      'sem_perfil',
      'duplicado',
      'ativo_fora_base',
      'na_base',
    ]

    if (eraAtendimentoOuReservado && estadosConclusaoDesfecho.includes(novoEstadoTrans)) {
      const temPedidoEmAberto = record.getBool('pedido_em_aberto')
      // Sempre remove o lock_timestamp da sessão
      record.set('lock_timestamp', null)

      // Só mantém operador vinculado se for pedido em aberto pendente de faturamento
      if (!temPedidoEmAberto) {
        record.set('operador', '')
      }

      // Se o desfecho não for 'reagendado', limpa reagendado_para e reagendado_operador
      if (novoEstadoTrans !== 'reagendado') {
        record.set('reagendado_para', null)
        record.set('reagendado_operador', '')
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
      throw err
    }
    console.log('[standby_integrity] Erro em onRecordUpdateRequest clientes:', err.message)
  }

  e.next()
}, 'clientes')
