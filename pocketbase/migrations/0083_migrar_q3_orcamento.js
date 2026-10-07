/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Adicionar campo q3_arquivo à coleção respostas_formulario
    try {
      const col = app.findCollectionByNameOrId('respostas_formulario')
      if (!col.fields.getByName('q3_arquivo')) {
        col.fields.add(
          new TextField({
            name: 'q3_arquivo',
            required: false,
          }),
        )
        app.save(col)
      }
    } catch (err) {
      console.log(`[0083_migrar_q3_orcamento] Aviso ao adicionar q3_arquivo: ${err.message}`)
    }

    // 2. Preservar as respostas antigas da Q3 ("Situação Operacional") movendo-as para q3_arquivo
    // e também dentro do JSON respostas.q3_arquivo para garantir preservação histórica completa.
    try {
      const records = app.findRecordsByFilter(
        'respostas_formulario',
        "respostas ~ 'q3'",
        '-created',
        5000,
        0,
      )
      let count = 0

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const respostas = rec.get('respostas') || {}
        const q3Antigo =
          respostas.q3 !== undefined && respostas.q3 !== null ? String(respostas.q3) : ''

        // Se o registro possuía resposta na Q3 antiga (texto de situação operacional)
        if (q3Antigo && q3Antigo !== 'Sim' && q3Antigo !== 'Não') {
          // Copia para o campo q3_arquivo da coleção
          rec.set('q3_arquivo', q3Antigo)

          // Preserva dentro do objeto respostas
          const novasRespostas = { ...respostas }
          novasRespostas.q3_arquivo = q3Antigo
          // Remove a chave q3 antiga para não confundir com a nova pergunta booleana (Sim/Não)
          delete novasRespostas.q3
          if (novasRespostas.q3_outros !== undefined) {
            novasRespostas.q3_outros_arquivo = novasRespostas.q3_outros
            delete novasRespostas.q3_outros
          }

          rec.set('respostas', novasRespostas)
          app.save(rec)
          count++
        }
      }

      console.log(
        `[0083_migrar_q3_orcamento] Preservados ${count} registros antigos da Q3 em q3_arquivo.`,
      )
    } catch (err) {
      console.log(`[0083_migrar_q3_orcamento] Erro ao preservar respostas antigas: ${err.message}`)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('respostas_formulario')
      const field = col.fields.getByName('q3_arquivo')
      if (field) {
        col.fields.removeByName('q3_arquivo')
        app.save(col)
      }
    } catch (err) {
      console.log(`[0083_migrar_q3_orcamento] Erro no rollback: ${err.message}`)
    }
  },
)
