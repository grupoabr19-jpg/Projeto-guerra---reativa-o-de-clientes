/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter('respostas_formulario', '', '-created', 5000, 0)
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
        `[0084_copiar_q3_antiga_para_q3_arquivo] Migrados ${count} registros antigos para q3_arquivo.`,
      )
    } catch (err) {
      console.log(`[0084_copiar_q3_antiga_para_q3_arquivo] Erro: ${err.message}`)
    }
  },
  () => {},
)
