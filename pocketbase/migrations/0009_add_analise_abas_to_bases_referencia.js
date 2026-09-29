migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bases_referencia')

    // Adicionar campo JSON analise_abas para armazenar estrutura por aba:
    // [
    //   {
    //     nome: string,
    //     total_linhas: number,
    //     colunas: string[],
    //     amostra: Record<string, unknown>[],
    //     is_pivot?: boolean,
    //     header_row_index?: number
    //   }
    // ]
    if (!col.fields.getByName('analise_abas')) {
      col.fields.add(
        new JSONField({
          name: 'analise_abas',
          maxSize: 5242880, // 5MB para acomodar amostras de até 20 linhas por aba em múltiplas abas
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bases_referencia')
      if (col.fields.getByName('analise_abas')) {
        col.fields.removeByName('analise_abas')
        app.save(col)
      }
    } catch (_) {}
  },
)
