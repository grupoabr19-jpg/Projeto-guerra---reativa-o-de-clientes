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
    // Não se aplica a 'sem_contato', 'duplicado' ou edições especiais de admin
    if (desfecho !== 'sem_contato' && desfecho !== 'duplicado') {
      const valor = record.getFloat('valor_potencial')
      const peso = record.getFloat('toneladas_potencial')
      const respostas = record.get('respostas') || {}
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
  } catch (err) {
    if (err instanceof BadRequestError || (err && err.name === 'BadRequestError')) {
      throw err
    }
    console.log('[standby_integrity] Erro em onRecordUpdateRequest clientes:', err.message)
  }

  e.next()
}, 'clientes')
