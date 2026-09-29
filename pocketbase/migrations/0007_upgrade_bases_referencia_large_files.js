migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bases_referencia')

    // 1. Atualizar campo 'arquivo' para aceitar até 200MB (209715200 bytes)
    const arquivoField = col.fields.getByName('arquivo')
    if (arquivoField) {
      arquivoField.maxSize = 209715200 // 200MB
    }

    // 2. Adicionar campo opcional de classificação: 'margem' | 'clientes' | 'outra'
    if (!col.fields.getByName('classificacao')) {
      col.fields.add(
        new SelectField({
          name: 'classificacao',
          values: ['margem', 'clientes', 'outra'],
          maxSelect: 1,
        }),
      )
    }

    // 3. Adicionar campo opcional para tamanho do arquivo em bytes (auxiliar visual)
    if (!col.fields.getByName('tamanho_bytes')) {
      col.fields.add(
        new NumberField({
          name: 'tamanho_bytes',
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bases_referencia')
      const arquivoField = col.fields.getByName('arquivo')
      if (arquivoField) {
        arquivoField.maxSize = 52428800 // 50MB
      }
      if (col.fields.getByName('classificacao')) {
        col.fields.removeByName('classificacao')
      }
      if (col.fields.getByName('tamanho_bytes')) {
        col.fields.removeByName('tamanho_bytes')
      }
      app.save(col)
    } catch (_) {}
  },
)
