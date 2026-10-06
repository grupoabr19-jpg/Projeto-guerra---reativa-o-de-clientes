migrate(
  (app) => {
    console.log('=== [0077_consolidar_saneamento_casos] INÍCIO ===')
    const agoraIso = new Date().toISOString()
    const colEv = app.findCollectionByNameOrId('eventos_log')

    // 1. SANEAMENTO UELTON JOAO DONIZETE DE GODOY (C017545)
    // Duas interações com desfecho 'reativado' (03/10 e 05/10) com o mesmo pedido 220423
    try {
      const itSegunda = app.findRecordById('interacoes', 'qdau6cmv957hjdy')
      if (itSegunda) {
        itSegunda.set('desfecho', 'reativacao_duplicada_consolidada')
        itSegunda.set(
          'conteudo',
          '[CONSOLIDADO - DUPLICIDADE] Atendimento redundante realizado após o cliente já estar reativado (1ª reativação em 2026-10-03 16:26:19, pedido PED 220423). Registro preservado para auditoria operacional.',
        )
        app.save(itSegunda)
        console.log('[0077] Uelton: 2ª interação consolidada')
      }

      const cliUelton = app.findRecordById('clientes', '92lgg2ryzrgravm')
      if (cliUelton) {
        cliUelton.set('estado', 'reativado')
        cliUelton.set('operador', '')
        cliUelton.set('lock_timestamp', null)
        cliUelton.set('reagendado_para', null)
        cliUelton.set('reagendado_operador', '')
        cliUelton.set('pedido_reativacao', 'PED 220423')
        cliUelton.set('reativado_em', '2026-10-03 16:26:19.361Z')
        cliUelton.set('standby_ate', '2026-12-02 16:26:19.361Z')
        app.save(cliUelton)
        console.log('[0077] Uelton: cliente consolidado com data original')
      }

      const ev1 = new Record(colEv)
      ev1.set('cliente', '92lgg2ryzrgravm')
      ev1.set('acao', 'correcao_duplicidade_reativacao')
      ev1.set('detalhes', {
        motivo:
          'Consolidação de 2º atendimento de reativação redundante em cliente já reativado (UELTON C017545)',
        interacao_duplicada_id: 'qdau6cmv957hjdy',
        interacao_original_id: 'yqbbxaj6pu1okn4',
        pedido: 'PED 220423',
        timestamp: agoraIso,
      })
      app.save(ev1)
    } catch (errUelton) {
      console.log('[0077] Erro no saneamento Uelton: ' + errUelton.message)
    }

    // 2. SANEAMENTO PRAIA MATERIAIS DE CONSTRUCAO LTDA (C006844)
    // Foi reativado em 2026-10-06 16:22 (standby até 2026-12-05) mas foi transferido/reagendado indevidamente
    try {
      const cliPraia = app.findRecordById('clientes', '73ljzprrcq6ncc2')
      if (cliPraia) {
        cliPraia.set('estado', 'reativado')
        cliPraia.set('operador', '')
        cliPraia.set('lock_timestamp', null)
        cliPraia.set('reagendado_para', null)
        cliPraia.set('reagendado_operador', '')
        cliPraia.set('prioridade_transferencia', false)
        app.save(cliPraia)
        console.log('[0077] Praia Materiais: estado restaurado para reativado, reagendamento limpo')
      }

      const ev2 = new Record(colEv)
      ev2.set('cliente', '73ljzprrcq6ncc2')
      ev2.set('acao', 'correcao_duplicidade_reativacao')
      ev2.set('detalhes', {
        motivo:
          'Restauração de PRAIA MATERIAIS (C006844) com standby de reativação vigente até 2026-12-05. Reagendamento indevido limpo.',
        timestamp: agoraIso,
      })
      app.save(ev2)
    } catch (errPraia) {
      console.log('[0077] Erro no saneamento Praia: ' + errPraia.message)
    }

    // 3. SANEAMENTO ODAIR NATALINO MARTINS (C023063)
    // Reativado em 2026-10-05 03:00 (standby até 2026-12-04), mas sofreu timeout lock e virou na_base
    try {
      const cliOdair = app.findRecordById('clientes', 'vitwkf8xcl8hc89')
      if (cliOdair) {
        cliOdair.set('estado', 'reativado')
        cliOdair.set('operador', '')
        cliOdair.set('lock_timestamp', null)
        cliOdair.set('reagendado_para', null)
        cliOdair.set('reagendado_operador', '')
        cliOdair.set('prioridade_transferencia', false)
        app.save(cliOdair)
        console.log('[0077] Odair: estado restaurado para reativado')
      }

      const ev3 = new Record(colEv)
      ev3.set('cliente', 'vitwkf8xcl8hc89')
      ev3.set('acao', 'correcao_duplicidade_reativacao')
      ev3.set('detalhes', {
        motivo:
          'Restauração de ODAIR (C023063) com standby de reativação vigente até 2026-12-04. Retornado de na_base para reativado.',
        timestamp: agoraIso,
      })
      app.save(ev3)
    } catch (errOdair) {
      console.log('[0077] Erro no saneamento Odair: ' + errOdair.message)
    }

    // 4. LOTE ATACADO (C019709, C022994, C012450, C014088, C019628, C010738, C022076, C022438, C022672)
    // Garantir que todos estejam com estado='reativado', operador='', lock_timestamp=null
    const loteAtacadoCodigos = [
      'C019709',
      'C022994',
      'C012450',
      'C014088',
      'C019628',
      'C010738',
      'C022076',
      'C022438',
      'C022672',
    ]
    for (let i = 0; i < loteAtacadoCodigos.length; i++) {
      const cod = loteAtacadoCodigos[i]
      try {
        const cliRec = app.findFirstRecordByData('clientes', 'codigo', cod)
        if (cliRec) {
          cliRec.set('estado', 'reativado')
          cliRec.set('operador', '')
          cliRec.set('lock_timestamp', null)
          cliRec.set('reagendado_para', null)
          cliRec.set('reagendado_operador', '')
          cliRec.set('prioridade_transferencia', false)
          app.save(cliRec)
        }
      } catch (errCod) {
        console.log('[0077] Erro ao blindar código ' + cod + ': ' + errCod.message)
      }
    }

    // 5. Auditoria de encerramento do saneamento
    try {
      const evFin = new Record(colEv)
      evFin.set('acao', 'saneamento_duplicidades_consolidado_0077')
      evFin.set('detalhes', {
        executado_em: agoraIso,
        casos: [
          'C017545 Uelton',
          'C006844 Praia Materiais',
          'C023063 Odair',
          'Lote Atacado (9 clientes)',
        ],
      })
      app.save(evFin)
    } catch (_) {}

    console.log('=== [0077_consolidar_saneamento_casos] CONCLUÍDO COM SUCESSO ===')
  },
  () => {},
)
