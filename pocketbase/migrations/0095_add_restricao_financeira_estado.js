migrate(
  (app) => {
    const clientes = app.findCollectionByNameOrId('clientes')
    const estadoField = clientes.fields.getByName('estado')
    if (estadoField) {
      const currentValues = estadoField.values || []
      if (!currentValues.includes('restricao_financeira')) {
        estadoField.values = [...currentValues, 'restricao_financeira']
        estadoField.maxSelect = 1
        app.save(clientes)
      }
    }
  },
  (app) => {
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      const estadoField = clientes.fields.getByName('estado')
      if (estadoField && estadoField.values) {
        estadoField.values = estadoField.values.filter((v) => v !== 'restricao_financeira')
        estadoField.maxSelect = 1
        app.save(clientes)
      }
    } catch (_) {}
  },
)
