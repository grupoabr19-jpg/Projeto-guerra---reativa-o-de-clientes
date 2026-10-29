/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0125: Saneamento de cruzamento de pedidos e auditoria de duplicidades.
 *
 * Itens atendidos:
 * 1. Correção cirúrgica do caso JPA COMERCIO DE ADESIVOS (C008579):
 *    - Remover vínculo cruzado com pedido 223654 (pertence legitimamente à SS ESTRUTURA METALICA C012635).
 *    - Limpar campos de reativação fantasma (pedido_reativacao, pedido_confirmado, pedido_em_aberto,
 *      operador_reativacao, reativado_em, standby_ate).
 *    - Restaurar estado coerente com o histórico: base_categoria='cliente_final', estado='cliente_final'.
 *    - Registrar evento no histórico de eventos_log para rastreabilidade de auditoria.
 *    - Preservar integridade da SS ESTRUTURA METALICA (C012635): NF 158708, pedido 223654, R$ 6.767,50 intocados.
 *
 * 2. Varredura idempotente de todas as duplicidades de pedidos no banco:
 *    - Localiza qualquer número de pedido (pedido_reativacao ou ultimo_pedido_numero) associado a > 1 cliente.
 *    - Critério de resolução: o pedido fica com o cliente que possui atendimento real/interação/resposta de formulário
 *      com desfecho legítimo. O outro cliente (sem atendimento) é saneado e desmarcado.
 *
 * 3. Varredura e proteção das reativações fantasmas apontadas na auditoria anterior
 *    (NELSON RICARDO C023347, MARIA CECILIA C023355, M B ACOS, POLEODUTO, RIVERTEC):
 *    - Se houver pedido cruzado neles, aplicar o saneamento. Se não houver, manter intocados.
 *
 * Idempotência total: segura para rodar em base vazia ou em múltiplas execuções.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0125] Iniciando saneamento de cruzamento de pedidos...')

    // -----------------------------------------------------------------
    // 1. CASO ESPECÍFICO: JPA COMERCIO DE ADESIVOS (C008579)
    // -----------------------------------------------------------------
    try {
      const jpa = app.findFirstRecordByFilter('clientes', "codigo = 'C008579'")
      if (jpa) {
        const pedJPA = jpa.getString('pedido_reativacao') || jpa.getString('ultimo_pedido_numero')
        const estadoJPA = jpa.getString('estado')

        if (pedJPA === '223654' || estadoJPA === 'reativado') {
          console.log(
            `[MIGRATION 0125] Sanando JPA COMERCIO DE ADESIVOS (C008579): estado atual=${estadoJPA}, pedido=${pedJPA}`,
          )

          // Limpa campos de reativação fantasma e pedido cruzado
          jpa.set('pedido_reativacao', '')
          if (jpa.getString('ultimo_pedido_numero') === '223654') {
            jpa.set('ultimo_pedido_numero', '')
          }
          jpa.set('pedido_confirmado', false)
          jpa.set('pedido_em_aberto', false)
          jpa.set('operador_reativacao', '')
          jpa.set('reativado_em', null)
          jpa.set('standby_ate', null)
          jpa.set('lock_timestamp', null)
          jpa.set('operador', '')

          // Restaura estado coerente: JPA é Cliente Final (C008579, Atibaia, segmento Cliente final)
          jpa.set('base_categoria', 'cliente_final')
          jpa.set('estado', 'cliente_final')

          app.save(jpa)
          console.log(
            '[MIGRATION 0125] JPA COMERCIO DE ADESIVOS sanada com sucesso para estado "cliente_final".',
          )

          // Grava evento de auditoria em eventos_log
          try {
            const colEventos = app.findCollectionByNameOrId('eventos_log')
            if (colEventos) {
              const ev = new Record(colEventos)
              ev.set('cliente', jpa.id)
              ev.set('tipo_evento', 'saneamento_duplicidade_pedido')
              ev.set(
                'descricao',
                'Saneamento v0.0.176: Remoção de pedido cruzado 223654 (pertence à SS Estrutura Metálica C012635) e restauração do estado para cliente_final sem reativação fantasma.',
              )
              app.save(ev)
            }
          } catch (evErr) {
            console.warn('[MIGRATION 0125] Aviso ao gravar evento de log para JPA:', evErr)
          }
        } else {
          console.log(
            `[MIGRATION 0125] JPA COMERCIO DE ADESIVOS (C008579) já estava sanada (estado=${estadoJPA}, pedido=${pedJPA}).`,
          )
        }
      } else {
        console.log(
          '[MIGRATION 0125] Cliente JPA COMERCIO DE ADESIVOS (C008579) não encontrado no banco (base vazia ou diferente).',
        )
      }
    } catch (err) {
      console.error('[MIGRATION 0125] Erro ao processar JPA COMERCIO DE ADESIVOS:', err)
    }

    // -----------------------------------------------------------------
    // 2. PRESERVAÇÃO EXPLÍCITA DA SS ESTRUTURA METÁLICA (C012635)
    // -----------------------------------------------------------------
    try {
      const ss = app.findFirstRecordByFilter('clientes', "codigo = 'C012635'")
      if (ss) {
        console.log(
          `[MIGRATION 0125] SS ESTRUTURA METÁLICA (C012635) preservada: pedido_reativacao=${ss.getString('pedido_reativacao')}, estado=${ss.getString('estado')}, fat=${ss.getFloat('valor_ultima_compra')}`,
        )
      }
    } catch (err) {
      console.warn('[MIGRATION 0125] Aviso ao consultar SS ESTRUTURA METÁLICA:', err)
    }

    // -----------------------------------------------------------------
    // 3. VARREDURA IDEMPOTENTE DE DUPLICIDADES DE PEDIDOS NO BANCO
    // -----------------------------------------------------------------
    try {
      console.log('[MIGRATION 0125] Iniciando varredura geral de números de pedidos duplicados...')
      const clientesComPedido = app.findRecordsByFilter(
        'clientes',
        "pedido_reativacao != '' || ultimo_pedido_numero != ''",
        '+created',
        10000,
      )

      // Mapear clientes por número de pedido
      const pedidosMap = {}
      for (let i = 0; i < clientesComPedido.length; i++) {
        const c = clientesComPedido[i]
        const pReat = String(c.getString('pedido_reativacao') || '').trim()
        const pUlt = String(c.getString('ultimo_pedido_numero') || '').trim()

        const nums = []
        if (pReat) nums.push({ num: pReat, campo: 'pedido_reativacao' })
        if (pUlt && pUlt !== pReat) nums.push({ num: pUlt, campo: 'ultimo_pedido_numero' })

        for (let j = 0; j < nums.length; j++) {
          const item = nums[j]
          if (!pedidosMap[item.num]) {
            pedidosMap[item.num] = []
          }
          pedidosMap[item.num].push({
            cliente: c,
            campo: item.campo,
          })
        }
      }

      let totalDuplicidadesSanadas = 0

      const pedidoKeys = Object.keys(pedidosMap)
      for (let k = 0; k < pedidoKeys.length; k++) {
        const numPed = pedidoKeys[k]
        const ocorrencias = pedidosMap[numPed]

        // Identifica se múltiplos clientes diferentes compartilham o mesmo número de pedido
        const clienteIdsUnicos = {}
        for (let oc = 0; oc < ocorrencias.length; oc++) {
          clienteIdsUnicos[ocorrencias[oc].cliente.id] = ocorrencias[oc].cliente
        }

        const ids = Object.keys(clienteIdsUnicos)
        if (ids.length > 1) {
          console.warn(
            `[MIGRATION 0125] Conflito detectado: pedido ${numPed} compartilhado por ${ids.length} clientes.`,
          )

          // Avaliar cada cliente: quem tem atendimento real?
          let donoLegitimo = null
          const candidatos = []

          for (let ci = 0; ci < ids.length; ci++) {
            const clienteObj = clienteIdsUnicos[ids[ci]]
            let interacoesCount = 0
            try {
              const its = app.findRecordsByFilter(
                'interacoes',
                `cliente = '${clienteObj.id}'`,
                '-created',
                10,
              )
              interacoesCount = its.length
            } catch (_) {}

            let respostasCount = 0
            try {
              const resps = app.findRecordsByFilter(
                'respostas_formulario',
                `cliente = '${clienteObj.id}'`,
                '-created',
                10,
              )
              respostasCount = resps.length
            } catch (_) {}

            const temAtendimento = interacoesCount > 0 || respostasCount > 0
            const opReat = clienteObj.getString('operador_reativacao')
            const scoreLegitimidade = (temAtendimento ? 100 : 0) + (opReat ? 50 : 0)

            candidatos.push({
              cliente: clienteObj,
              interacoesCount,
              respostasCount,
              temAtendimento,
              scoreLegitimidade,
            })
          }

          // Ordenar decrescente pelo score de legitimidade
          candidatos.sort((a, b) => b.scoreLegitimidade - a.scoreLegitimidade)

          donoLegitimo = candidatos[0].cliente
          console.log(
            `[MIGRATION 0125] Pedido ${numPed} atribuído como legítimo a ${donoLegitimo.getString('codigo')} (${donoLegitimo.getString('nome')})`,
          )

          // Sanar os outros candidatos que cruzaram por erro
          for (let oi = 1; oi < candidatos.length; oi++) {
            const fakeCand = candidatos[oi].cliente
            console.log(
              `[MIGRATION 0125] Desmarcando pedido ${numPed} do cliente indevido ${fakeCand.getString('codigo')} (${fakeCand.getString('nome')})`,
            )

            let mudou = false
            if (fakeCand.getString('pedido_reativacao') === numPed) {
              fakeCand.set('pedido_reativacao', '')
              mudou = true
            }
            if (fakeCand.getString('ultimo_pedido_numero') === numPed) {
              fakeCand.set('ultimo_pedido_numero', '')
              mudou = true
            }

            // Se não tinha atendimento e estava marcado como reativado, reverter estado
            if (!candidatos[oi].temAtendimento && fakeCand.getString('estado') === 'reativado') {
              const segNorm = (fakeCand.getString('segmento') || '').toLowerCase()
              const isClienteFinal =
                segNorm.includes('cliente final') ||
                segNorm.includes('consumidor') ||
                fakeCand.getString('base_categoria') === 'cliente_final'

              fakeCand.set('estado', isClienteFinal ? 'cliente_final' : 'na_base')
              fakeCand.set('pedido_confirmado', false)
              fakeCand.set('pedido_em_aberto', false)
              fakeCand.set('operador_reativacao', '')
              fakeCand.set('reativado_em', null)
              fakeCand.set('standby_ate', null)
              fakeCand.set('operador', '')
              fakeCand.set('lock_timestamp', null)
              mudou = true
            }

            if (mudou) {
              app.save(fakeCand)
              totalDuplicidadesSanadas++

              try {
                const colEventos = app.findCollectionByNameOrId('eventos_log')
                if (colEventos) {
                  const ev = new Record(colEventos)
                  ev.set('cliente', fakeCand.id)
                  ev.set('tipo_evento', 'saneamento_duplicidade_pedido')
                  ev.set(
                    'descricao',
                    `Saneamento v0.0.176: Remoção de pedido cruzado ${numPed} (dono legítimo: ${donoLegitimo.getString('codigo')}) e ajuste de estado.`,
                  )
                  app.save(ev)
                }
              } catch (_) {}
            }
          }
        }
      }

      console.log(
        `[MIGRATION 0125] Varredura de duplicidades concluída. Total de correções aplicadas: ${totalDuplicidadesSanadas}`,
      )
    } catch (varrErr) {
      console.error('[MIGRATION 0125] Erro na varredura de duplicidades:', varrErr)
    }

    console.log('[MIGRATION 0125] Migração concluída com sucesso.')
  },
  (app) => {
    // Rollback idempotente: sem necessidade de reintroduzir duplicidades
    console.log('[MIGRATION 0125] Rollback executado (no-op para integridade dos dados).')
  },
)
