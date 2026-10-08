/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('respostas_formulario')
    let field = col.fields.getByName('anexos')

    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.ms-excel',
    ]

    if (field) {
      field.maxSelect = 3
      field.maxSize = 10485760 // 10 MB
      field.mimeTypes = allowedMimes
    } else {
      col.fields.add(
        new FileField({
          name: 'anexos',
          maxSelect: 3,
          maxSize: 10485760,
          mimeTypes: allowedMimes,
        }),
      )
    }

    app.save(col)
    console.log(
      '[0094_limites_anexos_respostas] Campo anexos configurado com sucesso (maxSelect: 3, maxSize: 10MB).',
    )
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('respostas_formulario')
      const field = col.fields.getByName('anexos')
      if (field) {
        field.maxSelect = 5
        field.maxSize = 10485760
        field.mimeTypes = []
        app.save(col)
      }
    } catch (_) {}
  },
)
