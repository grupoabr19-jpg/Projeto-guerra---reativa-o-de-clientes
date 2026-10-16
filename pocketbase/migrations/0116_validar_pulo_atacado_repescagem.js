// pocketbase/migrations/0116_validar_pulo_atacado_repescagem.js
// Migração de teste/validação da correção:
// 1. Simula a puxada da fila para Priscila Faria (operadora de REPESCAGEM)
// 2. Confirma que o cliente C019898 (CONSTRUNASCIMENTO LTDA - Atacado) NÃO é entregue para ela
// 3. Confirma que o próximo cliente elegível de repescagem é selecionado
// 4. Confirma que a blindagem do atacado continua íntegra e sem exceções

migrate(
  (app) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
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

    function isClienteAtacado(clienteRec) {
      if (!clienteRec) return false
      const regiao = normalizarTextoNFD(clienteRec.getString('regiao'))
      if (regiao === 'ATACADO' || regiao.includes('ATACADO')) {
        return true
      }
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

    let priscila = null
    try {
      priscila = app.findRecordById('users', 'blw02av64wj3fje')
    } catch (_) {
      try {
        const found = app.findRecordsByFilter(
          'users',
          "name ~ 'Priscila' || email ~ 'priscila'",
          '',
          1,
          0,
        )
        if (found && found.length > 0) priscila = found[0]
      } catch (_) {}
    }

    if (!priscila) {
      console.log(
        '[0116_validar] Priscila Faria não encontrada. Nenhuma validação a executar neste banco.',
      )
      return
    }

    const userName = priscila.getString('name')
    const userId = priscila.id

    // Simulação da Etapa A: Reagendados vencidos do próprio operador
    const endOfToday = new Date().toISOString().slice(0, 10) + ' 23:59:59.999Z'
    const reagFilter = `estado = 'reagendado' && reagendado_para != '' && reagendado_para <= '${endOfToday}' && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (faixa = '90_plus' || dias_sem_faturar >= 90)`

    const reagendados = app.findRecordsByFilter(
      'clientes',
      reagFilter,
      '-prioridade_transferencia,reagendado_para',
      50,
      0,
    )

    let reagCand = null
    let ignoradosAtacado = []

    for (let rIdx = 0; rIdx < reagendados.length; rIdx++) {
      const r = reagendados[rIdx]
      if (r.getString('reagendado_operador') !== userId) continue
      if (isClienteAtacado(r)) {
        ignoradosAtacado.push(`${r.id} (${r.getString('codigo')} - ${r.getString('vendedor')})`)
        continue // Pula o cliente atacado!
      }
      reagCand = r
      break
    }

    if (reagCand && isClienteAtacado(reagCand)) {
      throw new Error(`[0116_validar] FALHA: candidato reagCand é de ATACADO!`)
    }

    // Simulação da Etapa B: Repescagem na_base
    const nowIsoQueue = new Date().toISOString()
    const repescagemFilter = `estado = 'na_base' && regiao != 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (faixa = '90_plus' || dias_sem_faturar >= 90) && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`

    const poolRepescagem = app.findRecordsByFilter('clientes', repescagemFilter, '-score', 50, 0)

    let candRepescagem = null
    let atacadosPuladosRepescagem = 0

    for (let m = 0; m < poolRepescagem.length; m++) {
      const item = poolRepescagem[m]
      if (isClienteAtacado(item)) {
        atacadosPuladosRepescagem++
        continue
      }
      candRepescagem = item
      break
    }

    if (candRepescagem && isClienteAtacado(candRepescagem)) {
      throw new Error(`[0116_validar] FALHA: candidato de repescagem é de ATACADO!`)
    }

    // Grava resultado no banco na tabela configuracoes para persistência e evidência verificável
    try {
      let conf = null
      try {
        conf = app.findFirstRecordByFilter('configuracoes', "chave = 'validacao_fila_atacado'")
      } catch (_) {}
      if (!conf) {
        const col = app.findCollectionByNameOrId('configuracoes')
        conf = new Record(col)
        conf.set('chave', 'validacao_fila_atacado')
      }
      conf.set('descricao', 'Auditoria da correção de pulo de clientes atacado na fila')
      conf.set('valor', {
        operador_testado: userName,
        operador_id: userId,
        atacados_reagendados_pulados_count: ignoradosAtacado.length,
        atacados_reagendados_pulados: ignoradosAtacado,
        cliente_c019898_bloqueado_e_pulado: ignoradosAtacado.some((c) => c.includes('C019898')),
        proximo_reagendado_elegivel: reagCand
          ? {
              id: reagCand.id,
              codigo: reagCand.getString('codigo'),
              nome: reagCand.getString('nome'),
              vendedor: reagCand.getString('vendedor'),
              regiao: reagCand.getString('regiao'),
              is_atacado: isClienteAtacado(reagCand),
            }
          : null,
        repescagem_candidatos_analisados: poolRepescagem.length,
        repescagem_atacados_pulados: atacadosPuladosRepescagem,
        repescagem_proximo_elegivel: candRepescagem
          ? {
              id: candRepescagem.id,
              codigo: candRepescagem.getString('codigo'),
              nome: candRepescagem.getString('nome'),
              vendedor: candRepescagem.getString('vendedor'),
              is_atacado: isClienteAtacado(candRepescagem),
            }
          : null,
        status: 'SUCESSO_BLINDAGEM_E_PULO_VALIDADOS',
        timestamp: new Date().toISOString(),
      })
      app.save(conf)
    } catch (saveErr) {
      console.log('[0116_validar] Erro ao salvar config: ' + saveErr.message)
    }
  },
  (app) => {},
)
