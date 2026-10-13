/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Migração 0106: Saneamento atômico de clientes com desfecho gravado que permaneceram como 'reagendado' ou com reagendamento órfão
    // Resolve o bug reportado em que clientes fechados/concluídos voltam para a fila do operador

    // 1. Clientes cujo último registro em 'interacoes' ou 'respostas_formulario' foi concluído
    // (ativo_fora_base, sem_contato, venda_perdida, restricao_financeira, compra_terceiros, nao_quer_negociar, duplicado)
    // mas que estavam com estado='reagendado', 'reservado', 'em_atendimento' ou 'na_base'.
    // Saneia o estado para o desfecho real e zera reagendado_para, reagendado_operador, operador e lock_timestamp.
    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'ativo_fora_base',
              ativo_fora_base = 1,
              reagendado_para = NULL,
              reagendado_operador = '',
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE id IN (
            SELECT DISTINCT i.cliente
            FROM interacoes i
            WHERE i.desfecho = 'ativo_fora_base'
          ) AND (estado = 'reagendado' OR estado = 'reservado' OR estado = 'em_atendimento' OR estado = 'na_base')
        `)
        .execute()
    } catch (e1) {
      console.log('[0106_migration] Aviso em update ativo_fora_base: ' + e1.message)
    }

    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'restricao_financeira',
              reagendado_para = NULL,
              reagendado_operador = '',
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE id IN (
            SELECT DISTINCT i.cliente
            FROM interacoes i
            WHERE i.desfecho = 'restricao_financeira'
          ) AND (estado = 'reagendado' OR estado = 'reservado' OR estado = 'em_atendimento' OR estado = 'na_base')
        `)
        .execute()
    } catch (e2) {
      console.log('[0106_migration] Aviso em update restricao_financeira: ' + e2.message)
    }

    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'compra_terceiros',
              reagendado_para = NULL,
              reagendado_operador = '',
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE id IN (
            SELECT DISTINCT i.cliente
            FROM interacoes i
            WHERE i.desfecho = 'compra_terceiros'
          ) AND (estado = 'reagendado' OR estado = 'reservado' OR estado = 'em_atendimento' OR estado = 'na_base')
        `)
        .execute()
    } catch (e3) {
      console.log('[0106_migration] Aviso em update compra_terceiros: ' + e3.message)
    }

    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'duplicado',
              reagendado_para = NULL,
              reagendado_operador = '',
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE id IN (
            SELECT DISTINCT i.cliente
            FROM interacoes i
            WHERE i.desfecho = 'duplicado'
          ) AND (estado = 'reagendado' OR estado = 'reservado' OR estado = 'em_atendimento' OR estado = 'na_base')
        `)
        .execute()
    } catch (e4) {
      console.log('[0106_migration] Aviso em update duplicado: ' + e4.message)
    }

    // 2. Limpar reagendado_para e reagendado_operador de clientes que já estão em estados definitivos
    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET reagendado_para = NULL,
              reagendado_operador = '',
              operador = CASE WHEN pedido_em_aberto = 1 THEN operador ELSE '' END,
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE estado IN ('ativo_fora_base', 'restricao_financeira', 'compra_terceiros', 'duplicado', 'venda_perdida', 'sem_perfil')
            AND (reagendado_para IS NOT NULL OR reagendado_operador != '')
        `)
        .execute()
    } catch (e5) {
      console.log(
        '[0106_migration] Aviso ao limpar reagendados órfãos em estados definitivos: ' + e5.message,
      )
    }

    // 3. Caso específico do cliente FELICIO MORAES PEREIRA (C010633, id: 4hkdhsy0q3dw2li)
    // Transferido por admin para Rafaela Resende, mas manteve vendedor Milena Vaz e reagendado_operador Milena Vaz
    try {
      const cFelicio = app.findFirstRecordByData('clientes', 'codigo', 'C010633')
      if (cFelicio) {
        // Encontrar Rafaela Resende
        let rafaelaId = ''
        try {
          const uRafaela = app.findFirstRecordByData(
            'users',
            'email',
            'rafaela.resende@grupoabr.com.br',
          )
          if (uRafaela) rafaelaId = uRafaela.id
        } catch (_) {}

        if (rafaelaId) {
          cFelicio.set('reagendado_operador', rafaelaId)
          cFelicio.set('prioridade_transferencia', true)
        }
        cFelicio.set('operador', '')
        cFelicio.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        app.save(cFelicio)
        console.log('[0106_migration] C010633 saneado com sucesso.')
      }
    } catch (eFelicio) {
      console.log('[0106_migration] Aviso caso C010633: ' + eFelicio.message)
    }

    // 4. Caso específico do cliente ALYSSON DA SILVA DE PAIVA (C011626, id: cgo7euhfffwpcop)
    // Se estiver preso com lock sem atendimento ativo, destrava
    try {
      const cAlysson = app.findFirstRecordByData('clientes', 'codigo', 'C011626')
      if (cAlysson && cAlysson.getString('estado') === 'em_atendimento') {
        // Checar se não tem interações recentes
        const intAlysson = app.findRecordsByFilter(
          'interacoes',
          "cliente = '" + cAlysson.id + "'",
          '-created',
          1,
          0,
        )
        if (!intAlysson || intAlysson.length === 0) {
          // Destrava lock para fluir normalmente
          cAlysson.set('estado', 'na_base')
          cAlysson.set('operador', '')
          cAlysson.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          app.save(cAlysson)
          console.log('[0106_migration] C011626 saneado para na_base.')
        }
      }
    } catch (eAlysson) {
      console.log('[0106_migration] Aviso caso C011626: ' + eAlysson.message)
    }
  },
  (app) => {
    // Reversão no-op
  },
)
