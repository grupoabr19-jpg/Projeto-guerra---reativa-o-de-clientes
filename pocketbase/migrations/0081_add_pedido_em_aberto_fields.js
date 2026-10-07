/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const clientes = app.findCollectionByNameOrId('clientes')

    // 1. Adicionar novos campos na coleção clientes
    if (!clientes.fields.getByName('pedido_em_aberto')) {
      clientes.fields.add(
        new BoolField({
          name: 'pedido_em_aberto',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('status_faturamento')) {
      clientes.fields.add(
        new SelectField({
          name: 'status_faturamento',
          required: false,
          values: ['nenhum', 'pendente', 'faturado'],
          maxSelect: 1,
        }),
      )
    }

    if (!clientes.fields.getByName('data_faturamento')) {
      clientes.fields.add(
        new DateField({
          name: 'data_faturamento',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('valor_faturado')) {
      clientes.fields.add(
        new NumberField({
          name: 'valor_faturado',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('numero_nf_fatura')) {
      clientes.fields.add(
        new TextField({
          name: 'numero_nf_fatura',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('operador_reativacao')) {
      clientes.fields.add(
        new RelationField({
          name: 'operador_reativacao',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    app.save(clientes)

    try {
      clientes.addIndex('idx_clientes_pedido_em_aberto', false, 'pedido_em_aberto', '')
      app.save(clientes)
    } catch (e) {
      console.log('Aviso ao criar idx_clientes_pedido_em_aberto:', e)
    }

    try {
      clientes.addIndex('idx_clientes_status_faturamento', false, 'status_faturamento', '')
      app.save(clientes)
    } catch (e) {
      console.log('Aviso ao criar idx_clientes_status_faturamento:', e)
    }

    const agoraIso = new Date().toISOString()

    // 2. Backfill do caso 1: CALHAS TARDELI LTDA (khc5jz3jkbogfcv)
    try {
      const c1 = app.findRecordById('clientes', 'khc5jz3jkbogfcv')
      c1.set('pedido_em_aberto', true)
      c1.set('status_faturamento', 'pendente')
      c1.set('operador_reativacao', 't1uvqnaa4av72ni') // Leiz Torso
      app.save(c1)

      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev1 = new Record(colEv)
      ev1.set('cliente', 'khc5jz3jkbogfcv')
      ev1.set('usuario', 't1uvqnaa4av72ni')
      ev1.set('acao', 'backfill_pedido_em_aberto_0081')
      ev1.set('detalhes', {
        motivo: 'Backfill do caso CALHAS TARDELI LTDA com pedido em aberto pendente de faturamento',
        codigo: 'C006194',
        pedido: 'pedido 221872',
        operador_reativacao: 't1uvqnaa4av72ni',
        status_faturamento: 'pendente',
        data_execucao: agoraIso,
      })
      app.save(ev1)
    } catch (e1) {
      console.log('Aviso backfill c1 (khc5jz3jkbogfcv):', e1)
    }

    // 3. Backfill do caso 2: RAFAEL AFONSO TEIXEIRA E CIA LTDA (ueufcq7pq3zi2bx)
    try {
      const c2 = app.findRecordById('clientes', 'ueufcq7pq3zi2bx')
      c2.set('pedido_em_aberto', true)
      c2.set('status_faturamento', 'pendente')
      c2.set('operador_reativacao', 'tqktt4golrvjhwt') // Jéssica Santos
      app.save(c2)

      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev2 = new Record(colEv)
      ev2.set('cliente', 'ueufcq7pq3zi2bx')
      ev2.set('usuario', 'tqktt4golrvjhwt')
      ev2.set('acao', 'backfill_pedido_em_aberto_0081')
      ev2.set('detalhes', {
        motivo:
          'Backfill do caso RAFAEL AFONSO TEIXEIRA E CIA LTDA com pedido em aberto pendente de faturamento',
        codigo: 'C013858',
        pedido: 'fechando pedido, pelo cadastro do cliente',
        operador_reativacao: 'tqktt4golrvjhwt',
        status_faturamento: 'pendente',
        data_execucao: agoraIso,
      })
      app.save(ev2)
    } catch (e2) {
      console.log('Aviso backfill c2 (ueufcq7pq3zi2bx):', e2)
    }
  },
  (app) => {
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      try {
        clientes.removeIndex('idx_clientes_pedido_em_aberto')
      } catch (_) {}
      try {
        clientes.removeIndex('idx_clientes_status_faturamento')
      } catch (_) {}

      if (clientes.fields.getByName('pedido_em_aberto')) {
        clientes.fields.removeByName('pedido_em_aberto')
      }
      if (clientes.fields.getByName('status_faturamento')) {
        clientes.fields.removeByName('status_faturamento')
      }
      if (clientes.fields.getByName('data_faturamento')) {
        clientes.fields.removeByName('data_faturamento')
      }
      if (clientes.fields.getByName('valor_faturado')) {
        clientes.fields.removeByName('valor_faturado')
      }
      if (clientes.fields.getByName('numero_nf_fatura')) {
        clientes.fields.removeByName('numero_nf_fatura')
      }
      if (clientes.fields.getByName('operador_reativacao')) {
        clientes.fields.removeByName('operador_reativacao')
      }
      app.save(clientes)
    } catch (_) {}
  },
)
