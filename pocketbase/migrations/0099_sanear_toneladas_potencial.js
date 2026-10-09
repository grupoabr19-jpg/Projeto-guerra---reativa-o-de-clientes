/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      // 1. Sanar os 4 registros confirmados com toneladas absurdas causadas por ponto de milhar em Kgs
      // id nyebzc9hrduuxua: 221049 -> 221.049
      // id o1dsofyeetov0iv: 220644 -> 220.644
      // id anzjscotr7tr1ts: 219122 -> 219.122
      // id pr3lro5mnmwoj6c: 20993  -> 20.993

      const alvos = [
        { id: 'nyebzc9hrduuxua', ton: 221.049 },
        { id: 'o1dsofyeetov0iv', ton: 220.644 },
        { id: 'anzjscotr7tr1ts', ton: 219.122 },
        { id: 'pr3lro5mnmwoj6c', ton: 20.993 },
      ]

      for (let i = 0; i < alvos.length; i++) {
        const item = alvos[i]
        try {
          const rec = app.findFirstRecordByData('respostas_formulario', 'id', item.id)
          rec.set('toneladas_potencial', item.ton)

          // Também atualiza no JSON respostas.q16 se existir
          const respostas = rec.get('respostas') || {}
          if (respostas && typeof respostas === 'object') {
            respostas.q16 = item.ton
            rec.set('respostas', respostas)
          }

          app.save(rec)
          console.log(`[0099_sanear_toneladas] Registro ${item.id} corrigido para ${item.ton} ton`)
        } catch (findErr) {
          console.log(`[0099_sanear_toneladas] Aviso ao buscar ${item.id}: ${findErr.message}`)
        }
      }

      // 2. Critério geral de sanidade: nenhum registro com toneladas_potencial > 10000
      // Buscar se ainda existe algum registro com toneladas_potencial > 10000
      const aberrantes = app.findRecordsByFilter(
        'respostas_formulario',
        'toneladas_potencial > 10000',
        '',
        100,
        0,
      )

      for (let j = 0; j < aberrantes.length; j++) {
        const recAberrante = aberrantes[j]
        const valAtual = recAberrante.getFloat('toneladas_potencial')
        console.log(
          `[0099_sanear_toneladas] Registro excedente ${recAberrante.id} encontrado com ${valAtual} ton`,
        )

        // Se for na casa de milhar de Kgs (> 10000), divide por 1000
        let novoVal = Number((valAtual / 1000).toFixed(3))
        if (novoVal > 10000) {
          // Se ainda for > 10000, zera com log
          novoVal = 0
          console.log(
            `[0099_sanear_toneladas] Registro ${recAberrante.id} zerado por inconsistência`,
          )
        }

        recAberrante.set('toneladas_potencial', novoVal)
        const respObj = recAberrante.get('respostas') || {}
        if (respObj && typeof respObj === 'object') {
          respObj.q16 = novoVal
          recAberrante.set('respostas', respObj)
        }
        app.save(recAberrante)
      }

      // 3. Atualizar também toneladas_historico no cliente caso tenha sido gravado com o valor corrompido
      for (let k = 0; k < alvos.length; k++) {
        const item = alvos[k]
        try {
          const rec = app.findFirstRecordByData('respostas_formulario', 'id', item.id)
          const clienteId = rec.getString('cliente')
          if (clienteId) {
            const clienteRec = app.findFirstRecordByData('clientes', 'id', clienteId)
            const tonCli = clienteRec.getFloat('toneladas_historico')
            if (tonCli > 10000) {
              clienteRec.set('toneladas_historico', item.ton)
              app.save(clienteRec)
              console.log(
                `[0099_sanear_toneladas] Cliente ${clienteId} toneladas_historico saneado para ${item.ton}`,
              )
            }
          }
        } catch (_) {}
      }

      console.log('[0099_sanear_toneladas] Migração concluída com sucesso.')
    } catch (err) {
      console.log(`[0099_sanear_toneladas] Erro geral: ${err.message}`)
    }
  },
  () => {},
)
