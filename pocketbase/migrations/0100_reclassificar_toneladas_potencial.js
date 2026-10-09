/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      console.log(
        '[0100_reclassificar_toneladas] Iniciando normalização geral de peso/toneladas...',
      )

      // 1. Saneamento explícito dos 5 registros vindos do importador do Forms com "Kgs"
      // Na migração 0099 eles foram normalizados incorretamente como ~220 ton (dividiu por 1000 achando que 220049 era kg).
      // Mas o valor era ~220 kg de fato -> deve ser 0.220 / 0.221 ton!
      // Alvos:
      // nyebzc9hrduuxua: 221.049 kg -> 0.221 ton
      // o1dsofyeetov0iv: 220.644 kg -> 0.221 ton
      // 0syuguzupk6tg9k: 220.482 kg -> 0.220 ton
      // anzjscotr7tr1ts: 219.122 kg -> 0.219 ton
      // pr3lro5mnmwoj6c: 20.993 kg -> 0.021 ton
      const alvosFormsKgs = [
        { id: 'nyebzc9hrduuxua', ton: 0.221, rawKg: 221.049 },
        { id: 'o1dsofyeetov0iv', ton: 0.221, rawKg: 220.644 },
        { id: '0syuguzupk6tg9k', ton: 0.22, rawKg: 220.482 },
        { id: 'anzjscotr7tr1ts', ton: 219.122, rawKg: 219.122 }, // se for 219 kg -> 0.219 ton
        { id: 'pr3lro5mnmwoj6c', ton: 0.021, rawKg: 20.993 },
      ]
      // Nota sobre anzjscotr7tr1ts: verificar se é 219 kg -> ton: 0.219
      alvosFormsKgs[3].ton = 0.219

      for (let i = 0; i < alvosFormsKgs.length; i++) {
        const item = alvosFormsKgs[i]
        try {
          const rec = app.findFirstRecordByData('respostas_formulario', 'id', item.id)
          rec.set('toneladas_potencial', item.ton)
          const resp = rec.get('respostas') || {}
          if (resp && typeof resp === 'object') {
            resp.q16 = item.rawKg
            resp.q16_unidade_detectada = 'kg'
            resp.q16_toneladas_normalizadas = item.ton
            rec.set('respostas', resp)
          }
          app.save(rec)
          console.log(
            `[0100_reclassificar_toneladas] Registro Forms-Kgs ${item.id} corrigido para ${item.ton} ton`,
          )

          // Se cliente correspondente teve toneladas_historico ajustado na 0099 para o valor corrompido, corrigir também
          const clienteId = rec.getString('cliente')
          if (clienteId) {
            try {
              const cliRec = app.findFirstRecordByData('clientes', 'id', clienteId)
              const tonCli = cliRec.getFloat('toneladas_historico')
              // Se o cliente tem toneladas_historico correspondente ao valor de ~20-221 da migração 0099
              if (tonCli > 10 && (tonCli === item.rawKg || Math.abs(tonCli - item.rawKg) < 1)) {
                cliRec.set('toneladas_historico', item.ton)
                app.save(cliRec)
                console.log(
                  `[0100_reclassificar_toneladas] Cliente ${clienteId} toneladas_historico saneado para ${item.ton}`,
                )
              }
            } catch (_) {}
          }
        } catch (findErr) {
          console.log(
            `[0100_reclassificar_toneladas] Registro ${item.id} não encontrado ou erro: ${findErr.message}`,
          )
        }
      }

      // 2. Reclassificação heurística para TODAS as respostas_formulario com peso informado > 0
      // Buscar todas as respostas_formulario com toneladas_potencial > 0
      const todasRespostas = app.findRecordsByFilter(
        'respostas_formulario',
        'toneladas_potencial > 0',
        '-created',
        500,
        0,
      )

      console.log(
        `[0100_reclassificar_toneladas] Avaliando ${todasRespostas.length} registros com toneladas_potencial > 0`,
      )

      let alteradosKgParaTon = 0
      let mantidosTon = 0
      let indefinidos = 0

      for (let j = 0; j < todasRespostas.length; j++) {
        const r = todasRespostas[j]
        // Se já foi ajustado no passo 1 acima, pular
        if (alvosFormsKgs.some((a) => a.id === r.id)) {
          continue
        }

        const pesoAtual = r.getFloat('toneladas_potencial')
        const valor = r.getFloat('valor_potencial')
        const respostasObj = r.get('respostas') || {}
        const rawQ16 = respostasObj.q16 !== undefined ? respostasObj.q16 : pesoAtual

        if (pesoAtual <= 0) continue

        let unidadeDetectada = null
        let novoPesoTon = pesoAtual

        if (valor > 0) {
          // Heurística de razão: R$ / unidade
          const ratio = valor / pesoAtual

          if (ratio >= 2 && ratio <= 60) {
            // Claramente o valor foi informado em R$ e o peso em KG!
            // Ex: R$ 41.579,90 / 5552,1 kg = R$ 7,49/kg
            // R$ 1.375,14 / 106,6 kg = R$ 12,90/kg
            unidadeDetectada = 'kg'
            novoPesoTon = Number((pesoAtual / 1000).toFixed(4))
          } else if (ratio >= 500 && ratio <= 150000) {
            // O ratio já está na casa de R$/ton! (Ex: R$ 13.211,40 / 2,6 ton = R$ 5.081,30/ton)
            unidadeDetectada = 'ton'
            novoPesoTon = pesoAtual
          } else if (ratio < 2 && pesoAtual > 50) {
            // Exemplo ratio muito baixo (< 2): se pesoAtual > 50 kg, dividir por 1000 (preço do kg seria < 2 ou peso muito alto)
            unidadeDetectada = 'kg'
            novoPesoTon = Number((pesoAtual / 1000).toFixed(4))
          } else {
            // Fora dos intervalos claros
            // Se pesoAtual > 50 kg e não tem evidência de toneladas, geralmente aço varejo é digitado em kg
            if (pesoAtual >= 50) {
              unidadeDetectada = 'kg'
              novoPesoTon = Number((pesoAtual / 1000).toFixed(4))
            } else {
              unidadeDetectada = 'ton'
              novoPesoTon = pesoAtual
            }
          }
        } else {
          // valor_potencial ausente ou 0
          // Se string original no JSON contém "kg" ou "kilo"
          const rawStr = String(rawQ16).toLowerCase()
          if (rawStr.includes('kg') || rawStr.includes('kilo')) {
            unidadeDetectada = 'kg'
            novoPesoTon = Number((pesoAtual / 1000).toFixed(4))
          } else if (pesoAtual > 50) {
            // Peso alto sem menção (ex: 525.4): operadores preenchem em kg
            unidadeDetectada = 'kg'
            novoPesoTon = Number((pesoAtual / 1000).toFixed(4))
          } else {
            // Valores pequenos como 2.6, 1.5 podem ser toneladas
            unidadeDetectada = 'ton'
            novoPesoTon = pesoAtual
          }
        }

        if (unidadeDetectada === 'kg') {
          alteradosKgParaTon++
          console.log(
            `[0100_reclassificar_toneladas] Registro ${r.id} (cliente ${r.getString('cliente')}): valor=${valor}, pesoAntigo=${pesoAtual} -> novoPesoTon=${novoPesoTon} (unidade=kg)`,
          )
          r.set('toneladas_potencial', novoPesoTon)
          if (respostasObj && typeof respostasObj === 'object') {
            respostasObj.q16_unidade_detectada = 'kg'
            respostasObj.q16_toneladas_normalizadas = novoPesoTon
            r.set('respostas', respostasObj)
          }
          app.save(r)

          // Verificar se o cliente foi reativado por essa resposta e tem toneladas_historico igual ao peso antigo
          const clienteId = r.getString('cliente')
          if (clienteId) {
            try {
              const cliRec = app.findFirstRecordByData('clientes', 'id', clienteId)
              const tonCli = cliRec.getFloat('toneladas_historico')
              // Se o cliente tem toneladas_historico correspondente ao peso bruto digitado em kg (ex: 131, 48, 31.22, 18.5)
              if (tonCli > 0 && Math.abs(tonCli - pesoAtual) < 0.01) {
                cliRec.set('toneladas_historico', novoPesoTon)
                app.save(cliRec)
                console.log(
                  `[0100_reclassificar_toneladas] Cliente ${clienteId} toneladas_historico atualizado de ${tonCli} para ${novoPesoTon} ton`,
                )
              }
            } catch (_) {}
          }
        } else if (unidadeDetectada === 'ton') {
          mantidosTon++
          if (respostasObj && typeof respostasObj === 'object') {
            respostasObj.q16_unidade_detectada = 'ton'
            respostasObj.q16_toneladas_normalizadas = novoPesoTon
            r.set('respostas', respostasObj)
            app.save(r)
          }
        } else {
          indefinidos++
        }
      }

      console.log(
        `[0100_reclassificar_toneladas] Concluído: ${alteradosKgParaTon} convertidos de kg para ton, ${mantidosTon} mantidos como ton, ${indefinidos} indefinidos.`,
      )
    } catch (err) {
      console.log(`[0100_reclassificar_toneladas] Erro geral: ${err.message}`)
    }
  },
  () => {},
)
