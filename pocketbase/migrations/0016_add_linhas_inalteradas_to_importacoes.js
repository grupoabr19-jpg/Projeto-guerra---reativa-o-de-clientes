migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('importacoes')

    if (!col.fields.getByName('linhas_inalteradas')) {
      col.fields.add(
        new NumberField({
          name: 'linhas_inalteradas',
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('importacoes')
    col.fields.removeByName('linhas_inalteradas')
    app.save(col)
  },
)
