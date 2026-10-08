/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Adicionar campo 'retomada_servida_em' na coleção 'clientes'
    const clientes = app.findCollectionByNameOrId('clientes')

    if (!clientes.fields.getByName('retomada_servida_em')) {
      clientes.fields.add(
        new DateField({
          name: 'retomada_servida_em',
          required: false,
        }),
      )
      app.save(clientes)
    }

    // 2. Sanear clientes incoerentes: estado='na_base' que possuem reagendado_para preenchido
    // Para esses clientes, o estado correto é 'reagendado'
    try {
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'reagendado',
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE estado = 'na_base'
            AND reagendado_para IS NOT NULL
            AND reagendado_para != ''
            AND (pedido_em_aberto IS NOT 1)
        `)
        .execute()
    } catch (errSanear) {
      console.log(
        '[0097_migration] Aviso ao sanear clientes estado na_base com reagendado_para: ' +
          errSanear.message,
      )
    }

    // 3. Caso específico do FINO SABOR (C002605, id x48olwzb5m67wtl)
    try {
      const finoSabor = app.findFirstRecordByData('clientes', 'codigo', 'C002605')
      if (finoSabor) {
        finoSabor.set('estado', 'reagendado')
        finoSabor.set('operador', '')
        finoSabor.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
        app.save(finoSabor)
        console.log(
          '[0097_migration] FINO SABOR C002605 saneado para estado=reagendado com lock limpo.',
        )
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      if (clientes.fields.getByName('retomada_servida_em')) {
        clientes.fields.removeByName('retomada_servida_em')
        app.save(clientes)
      }
    } catch (_) {}
  },
)
