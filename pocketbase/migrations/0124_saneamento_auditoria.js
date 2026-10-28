// pocketbase/migrations/0124_saneamento_auditoria.js
// Tarefa 1: Saneamento e Auditoria Projeto Guerra
// 1. Reciclagem de reagendados vencidos há 3+ dias (blindagem atacado: nunca caem para varejo)
// 2. Limpeza de locks inválidos (< 2024) e EMERSON (C004355) para base cliente_final
// 3. Normalização VARC -> VARE no campo vendedor

migrate(
  (app) => {
    function normalizarTextoNFD(str) {
      if (!str) return ''
      return String(str)
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

    const now = new Date()
    const cutoff3Dias = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const dddsAtacadoValidos = ['11', '12', '13', '14', '15', '16', '17', '18', '19']

    console.log(`[0124_saneamento] Iniciando auditoria e saneamento. Cutoff 3 dias: ${cutoff3Dias}`)

    // =========================================================================
    // 1. RECICLAGEM DE REAGENDADOS VENCIDOS HÁ 3 DIAS OU MAIS
    // =========================================================================
    let countReagRecicladosVarejo = 0
    let countReagAtacadoMapa = 0
    let countReagAtacadoForaMapa = 0
    let countReagClienteFinal = 0

    let reagendados = []
    try {
      reagendados = app.findRecordsByFilter(
        'clientes',
        `estado = 'reagendado' && reagendado_para != '' && reagendado_para <= '${cutoff3Dias}'`,
        'reagendado_para',
        2000,
        0,
      )
    } catch (errReag) {
      console.log('[0124_saneamento] Erro ao buscar reagendados: ' + errReag.message)
    }

    for (let i = 0; i < reagendados.length; i++) {
      const c = reagendados[i]
      const codigo = c.getString('codigo')
      const isAtacado = isClienteAtacado(c)
      const ddd = extrairDddCliente(c)
      const isClienteFinal =
        c.getString('base_categoria') === 'cliente_final' ||
        c.getString('segmento') === 'Cliente final'

      // Caso especial: cliente_final vai para a base separada de cliente final (base_categoria = 'cliente_final', estado = 'na_base' sem operador/lock)
      if (isClienteFinal) {
        c.set('base_categoria', 'cliente_final')
        c.set('estado', 'na_base')
        c.set('operador', '')
        c.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        c.set('reagendado_operador', '')
        c.set('reagendado_para', null)
        c.set('retomada_servida_em', null)
        c.set('rascunho_respostas', null)
        app.save(c)
        countReagClienteFinal++
        console.log(
          `[0124_saneamento] Reagendado vencido ${codigo} movido para base cliente_final.`,
        )
        continue
      }

      // Blindagem Atacado: NUNCA cai para fila de varejo
      if (isAtacado) {
        if (dddsAtacadoValidos.includes(ddd)) {
          // Atacado dentro do mapa (ex: PROTECNICA C020074 com DDD 16):
          // Vai para a fila de Atacado por DDD (regiao = 'ATACADO', base_categoria = 'normal', estado = 'na_base')
          c.set('regiao', 'ATACADO')
          c.set('base_categoria', 'normal')
          c.set('estado', 'na_base')
          c.set('operador', '')
          c.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          c.set('reagendado_operador', '')
          c.set('reagendado_para', null)
          c.set('retomada_servida_em', null)
          c.set('rascunho_respostas', null)
          app.save(c)
          countReagAtacadoMapa++
          console.log(
            `[0124_saneamento] Reagendado vencido ATACADO mapa ${codigo} (DDD ${ddd}) liberado para na_base do Atacado.`,
          )
        } else {
          // Atacado fora do mapa (ex: ELLUX C013099 DDD 32, VIA BRASILEIRA C010051 DDD 21):
          // Fica na base separada atacado_fora_mapa, fora da fila dos operadores de varejo
          c.set('base_categoria', 'atacado_fora_mapa')
          c.set('estado', 'na_base')
          c.set('operador', '')
          c.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          c.set('reagendado_operador', '')
          c.set('reagendado_para', null)
          c.set('retomada_servida_em', null)
          c.set('rascunho_respostas', null)
          app.save(c)
          countReagAtacadoForaMapa++
          console.log(
            `[0124_saneamento] Reagendado vencido ATACADO fora mapa ${codigo} (DDD ${ddd}) movido para atacado_fora_mapa.`,
          )
        }
      } else {
        // Varejo regular vencido há 3+ dias: volta para fila elegível (na_base)
        c.set('estado', 'na_base')
        c.set('operador', '')
        c.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        c.set('reagendado_operador', '')
        c.set('reagendado_para', null)
        c.set('retomada_servida_em', null)
        c.set('rascunho_respostas', null)
        app.save(c)
        countReagRecicladosVarejo++
        console.log(`[0124_saneamento] Reagendado vencido varejo ${codigo} reciclado para na_base.`)
      }
    }

    // =========================================================================
    // 2. LIMPEZA DE LOCKS INVÁLIDOS (< 01/01/2024) E EMERSON (C004355)
    // =========================================================================
    // Garantir explicitamente o caso EMERSON (C004355)
    try {
      const emerson = app.findFirstRecordByData('clientes', 'codigo', 'C004355')
      if (emerson) {
        emerson.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        emerson.set('operador', '')
        emerson.set('reagendado_operador', '')
        emerson.set('reagendado_para', null)
        emerson.set('retomada_servida_em', null)
        emerson.set('rascunho_respostas', null)
        emerson.set('base_categoria', 'cliente_final')
        emerson.set('estado', 'na_base')
        const vAtual = emerson.getString('vendedor')
        if (vAtual.startsWith('VARC - ')) {
          emerson.set('vendedor', 'VARE - ' + vAtual.slice(7))
        } else if (vAtual.startsWith('VARC-')) {
          emerson.set('vendedor', 'VARE - ' + vAtual.slice(5).trim())
        }
        app.save(emerson)
        console.log(
          '[0124_saneamento] EMERSON (C004355) limpo e movido para base de cliente_final (base_categoria=cliente_final, estado=na_base).',
        )
      }
    } catch (emErr) {
      console.log('[0124_saneamento] Aviso ao processar EMERSON: ' + emErr.message)
    }

    // Clientes com base_categoria = 'cliente_final' que ainda estejam em estados de fila ativa com lock ou reagendamento
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET estado = 'na_base',
          operador = '',
          lock_timestamp = '1970-01-01 00:00:00.000Z',
          reagendado_operador = '',
          reagendado_para = NULL
      WHERE base_categoria = 'cliente_final'
        AND estado IN ('reservado', 'em_atendimento', 'reagendado')
    `)
      .execute()

    // Zerar lock_timestamp e operador de clientes com data de lock inferior a 01/01/2024
    // (preserva quem tem pedido_em_aberto)
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET lock_timestamp = '1970-01-01 00:00:00.000Z',
          operador = ''
      WHERE lock_timestamp IS NOT NULL
        AND lock_timestamp != ''
        AND lock_timestamp < '2024-01-01 00:00:00.000Z'
        AND (pedido_em_aberto IS NOT 1)
    `)
      .execute()

    // =========================================================================
    // 3. NORMALIZAÇÃO VARC NOS DADOS (trocar VARC - por VARE -)
    // =========================================================================
    // Casos: "VARC - ARIANE SOUZA", "VARC - KAUANE ARAUJO", "VARC - FERNANDA SANTOS - ITAJUBÁ"
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET vendedor = 'VARE - ' || SUBSTR(vendedor, 8)
      WHERE vendedor LIKE 'VARC - %'
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET vendedor = 'VARE - ' || SUBSTR(vendedor, 6)
      WHERE vendedor LIKE 'VARC-%' AND vendedor NOT LIKE 'VARC - %'
    `)
      .execute()

    // Varredura adicional JS para garantir idempotência em caso de espaços extras
    try {
      const varcList = app.findRecordsByFilter('clientes', "vendedor ~ 'VARC'", '', 1000, 0)
      for (let vI = 0; vI < varcList.length; vI++) {
        const vRec = varcList[vI]
        const vStr = vRec.getString('vendedor')
        if (vStr.startsWith('VARC - ')) {
          vRec.set('vendedor', 'VARE - ' + vStr.slice(7))
          app.save(vRec)
        } else if (vStr.startsWith('VARC-')) {
          vRec.set('vendedor', 'VARE - ' + vStr.slice(5).trim())
          app.save(vRec)
        }
      }
    } catch (_) {}

    // Registrar evento de log
    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'saneamento_auditoria_0124')
      ev.set('detalhes', {
        reagendados_varejo_reciclados: countReagRecicladosVarejo,
        reagendados_atacado_mapa: countReagAtacadoMapa,
        reagendados_atacado_fora_mapa: countReagAtacadoForaMapa,
        reagendados_cliente_final: countReagClienteFinal,
        timestamp: new Date().toISOString(),
      })
      app.save(ev)
    } catch (_) {}

    console.log(
      `[0124_saneamento] Concluído: ${countReagRecicladosVarejo} varejo reciclados, ${countReagAtacadoMapa} atacado mapa, ${countReagAtacadoForaMapa} atacado fora mapa, ${countReagClienteFinal} cliente final.`,
    )
  },
  (app) => {
    // Migração de saneamento de dados: rollback é no-op
  },
)
