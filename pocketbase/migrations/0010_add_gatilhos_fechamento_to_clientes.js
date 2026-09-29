migrate(
  (app) => {
    const colClientes = app.findCollectionByNameOrId('clientes')

    const newFields = [
      { name: 'ultimo_faturamento_data', type: 'date' },
      { name: 'fat_12m_reais', type: 'number' },
      { name: 'peso_nf_tonelagem', type: 'number' },
      { name: 'ultimo_pedido_numero', type: 'text' },
      { name: 'ultimo_pedido_data', type: 'date' },
      { name: 'canal', type: 'text' },
      { name: 'margem_media_perc', type: 'number' },
      { name: 'margem_reais', type: 'number' },
      { name: 'frequencia_compras_12m', type: 'number' },
      { name: 'tipo_vendedor', type: 'text' },
      { name: 'gatilhos_fechamento', type: 'json' },
    ]

    for (let i = 0; i < newFields.length; i++) {
      const f = newFields[i]
      if (!colClientes.fields.getByName(f.name)) {
        if (f.type === 'text') {
          colClientes.fields.add(new TextField({ name: f.name }))
        } else if (f.type === 'number') {
          colClientes.fields.add(new NumberField({ name: f.name }))
        } else if (f.type === 'date') {
          colClientes.fields.add(new DateField({ name: f.name }))
        } else if (f.type === 'json') {
          colClientes.fields.add(new JSONField({ name: f.name, maxSize: 524288 }))
        }
      }
    }
    app.save(colClientes)
  },
  (app) => {
    try {
      const colClientes = app.findCollectionByNameOrId('clientes')
      const fieldsToRemove = [
        'ultimo_faturamento_data',
        'fat_12m_reais',
        'peso_nf_tonelagem',
        'ultimo_pedido_numero',
        'ultimo_pedido_data',
        'canal',
        'margem_media_perc',
        'margem_reais',
        'frequencia_compras_12m',
        'tipo_vendedor',
        'gatilhos_fechamento',
      ]
      for (let i = 0; i < fieldsToRemove.length; i++) {
        if (colClientes.fields.getByName(fieldsToRemove[i])) {
          colClientes.fields.removeByName(fieldsToRemove[i])
        }
      }
      app.save(colClientes)
    } catch (_) {}
  },
)
