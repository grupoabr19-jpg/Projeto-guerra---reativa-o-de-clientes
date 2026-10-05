/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const clientes = app.findCollectionByNameOrId('clientes')

    if (!clientes.fields.getByName('reativado_em')) {
      clientes.fields.add(
        new DateField({
          name: 'reativado_em',
          required: false,
        }),
      )
    }

    if (!clientes.fields.getByName('standby_ate')) {
      clientes.fields.add(
        new DateField({
          name: 'standby_ate',
          required: false,
        }),
      )
    }

    app.save(clientes)

    try {
      clientes.addIndex('idx_clientes_standby_ate', false, 'standby_ate', '')
      app.save(clientes)
    } catch (e) {
      console.log('Aviso ao criar idx_clientes_standby_ate:', e)
    }

    // Backfill: para todos os clientes com estado='reativado',
    // calcular reativado_em = data da última interação de desfecho 'reativado' (ou updated se não houver)
    // e standby_ate = reativado_em + 60 dias.
    try {
      const reativados = app.findRecordsByFilter(
        'clientes',
        "estado = 'reativado'",
        '-updated',
        5000,
        0,
      )

      console.log(
        `[0056_migration] Iniciando backfill de ${reativados.length} clientes reativados...`,
      )

      for (let i = 0; i < reativados.length; i++) {
        const c = reativados[i]
        let dataReativacao = null

        // Tenta buscar a data da interação com desfecho 'reativado' mais recente deste cliente
        try {
          const interacoes = app.findRecordsByFilter(
            'interacoes',
            `cliente = '${c.id}' && desfecho = 'reativado'`,
            '-created',
            1,
            0,
          )
          if (interacoes && interacoes.length > 0) {
            const rawCreated = interacoes[0].getString('created')
            if (rawCreated) {
              dataReativacao = new Date(rawCreated)
            }
          }
        } catch (_) {}

        // Fallback: se não achou em interacoes, usa o updated do cliente (ou ultima_compra se recente)
        if (!dataReativacao || isNaN(dataReativacao.getTime())) {
          const rawUpdated = c.getString('updated')
          if (rawUpdated) {
            dataReativacao = new Date(rawUpdated)
          } else {
            dataReativacao = new Date()
          }
        }

        const dataReativacaoIso = dataReativacao.toISOString()
        const standbyDate = new Date(dataReativacao.getTime() + 60 * 24 * 60 * 60 * 1000)
        const standbyIso = standbyDate.toISOString()

        c.set('reativado_em', dataReativacaoIso)
        c.set('standby_ate', standbyIso)
        app.save(c)
      }

      console.log(
        `[0056_migration] Backfill concluído com sucesso para ${reativados.length} clientes.`,
      )
    } catch (err) {
      console.error('[0056_migration] Erro no backfill de reativados:', err)
    }
  },
  (app) => {
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      try {
        clientes.removeIndex('idx_clientes_standby_ate')
      } catch (_) {}

      if (clientes.fields.getByName('reativado_em')) {
        clientes.fields.removeByName('reativado_em')
      }
      if (clientes.fields.getByName('standby_ate')) {
        clientes.fields.removeByName('standby_ate')
      }
      app.save(clientes)
    } catch (_) {}
  },
)
