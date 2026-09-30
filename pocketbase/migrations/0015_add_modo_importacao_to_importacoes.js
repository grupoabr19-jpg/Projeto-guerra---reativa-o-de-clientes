migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('importacoes')

    if (!col.fields.getByName('modo_importacao')) {
      col.fields.add(
        new SelectField({
          name: 'modo_importacao',
          values: ['base_mestre', 'faturamento_reconciliacao', 'enriquecimento_margem'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('matches_nome')) {
      col.fields.add(
        new NumberField({
          name: 'matches_nome',
        }),
      )
    }

    if (!col.fields.getByName('sem_correspondencia')) {
      col.fields.add(
        new NumberField({
          name: 'sem_correspondencia',
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('importacoes')
    col.fields.removeByName('modo_importacao')
    col.fields.removeByName('matches_nome')
    col.fields.removeByName('sem_correspondencia')
    app.save(col)
  },
)
