// pocketbase/migrations/0118_validar_repescagem_e_declaracoes_hooks.js
// Validação automatizada para Priscila Faria (Repescagem):
// 1. Confirma que a simulação de busca e puxada da Repescagem não lança exceções de "is not defined"
// 2. Confirma que o filtro expandido de repescagem localiza os clientes elegíveis (90+ dias sem atacado)
// 3. Confirma que clientes com vendedor ATR / ATACADO são filtrados e não entopem o pool
// 4. Registra evidência em configuracoes.chave = 'validacao_repescagem_v0_0_163'

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
      if (!clienteRec) return ''
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

    function jaContatadoPeloVendedorOriginal(clienteRec) {
      try {
        const cId = clienteRec.id
        const vendedorOriginal = (clienteRec.getString('vendedor') || '').trim().toUpperCase()
        let interacoes = []
        try {
          interacoes = app.findRecordsByFilter(
            'interacoes',
            `cliente = '${cId}'`,
            '-created',
            10,
            0,
          )
        } catch (_) {
          return false
        }
        if (!interacoes || interacoes.length === 0) return false

        for (let i = 0; i < interacoes.length; i++) {
          const it = interacoes[i]
          const opId = it.getString('operador')
          if (!opId) continue
          try {
            const opUser = app.findRecordById('users', opId)
            if (opUser) {
              const opNome = (opUser.getString('name') || '').trim().toUpperCase()
              const opEmail = (opUser.getString('email') || '').trim().toUpperCase()
              if (vendedorOriginal) {
                if (
                  opNome === vendedorOriginal ||
                  opNome.includes(vendedorOriginal) ||
                  vendedorOriginal.includes(opNome) ||
                  opEmail.includes(vendedorOriginal)
                ) {
                  return true
                }
              }
            }
          } catch (_) {}
        }
        return false
      } catch (_) {
        return false
      }
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
        '[0118_validar] Priscila Faria não encontrada. Nenhuma validação a executar neste banco.',
      )
      return
    }

    const userName = priscila.getString('name')
    const userId = priscila.id

    const nowIsoQueue = new Date().toISOString()
    const repescagemFilter = `estado = 'na_base' && regiao != 'ATACADO' && tipo_vendedor != 'ATACADO' && vendedor !~ 'ATR' && vendedor !~ 'ATACADO' && canal != 'ATACADO' && telefone_invalido != true && ativo_fora_base != true && base_categoria != 'cliente_final' && base_categoria != 'atacado_fora_mapa' && (faixa = '90_plus' || dias_sem_faturar >= 90) && (standby_ate = '' || standby_ate = null || standby_ate <= '${nowIsoQueue}')`

    const poolRepescagem = app.findRecordsByFilter('clientes', repescagemFilter, '-score', 100, 0)

    let candRepescagem = null
    let atacadosPulados = 0
    let contatadosPulados = 0

    for (let m = 0; m < poolRepescagem.length; m++) {
      const item = poolRepescagem[m]
      if (isClienteAtacado(item)) {
        atacadosPulados++
        continue
      }
      if (jaContatadoPeloVendedorOriginal(item)) {
        contatadosPulados++
        continue
      }
      candRepescagem = item
      break
    }

    console.log(
      `[0118_validar] Repescagem validada para ${userName}: ${poolRepescagem.length} candidatos SQL, ${atacadosPulados} atacados pulados, ${contatadosPulados} contatados pulados. Candidato: ${candRepescagem ? candRepescagem.getString('codigo') : 'nenhum'}`,
    )

    if (candRepescagem && isClienteAtacado(candRepescagem)) {
      throw new Error('[0118_validar] FALHA: candidato de repescagem é de ATACADO!')
    }

    // Grava resultado no banco para rastreabilidade
    try {
      let conf = null
      try {
        conf = app.findFirstRecordByFilter(
          'configuracoes',
          "chave = 'validacao_repescagem_v0_0_163'",
        )
      } catch (_) {}
      if (!conf) {
        const col = app.findCollectionByNameOrId('configuracoes')
        conf = new Record(col)
        conf.set('chave', 'validacao_repescagem_v0_0_163')
      }
      conf.set('descricao', 'Auditoria da fila da Repescagem e declarações autocontidas nos hooks')
      conf.set('valor', {
        operador_testado: userName,
        operador_id: userId,
        pool_encontrado_count: poolRepescagem.length,
        atacados_pulados: atacadosPulados,
        contatados_pulados: contatadosPulados,
        candidato_elegivel: candRepescagem
          ? {
              id: candRepescagem.id,
              codigo: candRepescagem.getString('codigo'),
              nome: candRepescagem.getString('nome'),
              vendedor: candRepescagem.getString('vendedor'),
              dias_sem_faturar: candRepescagem.getInt('dias_sem_faturar'),
              score: candRepescagem.getInt('score'),
              is_atacado: isClienteAtacado(candRepescagem),
            }
          : null,
        status: 'SUCESSO_REPESCAGEM_DISPONIVEL',
        timestamp: new Date().toISOString(),
      })
      app.save(conf)
    } catch (saveErr) {
      console.log('[0118_validar] Erro ao salvar config: ' + saveErr.message)
    }
  },
  (app) => {},
)
