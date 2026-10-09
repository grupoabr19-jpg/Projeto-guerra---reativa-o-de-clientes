/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      console.log(
        '[0102_sanear_toneladas_unit_normalizer] Iniciando migração de saneamento de toneladas...',
      )

      function parseNumeroLimpo(val, rawStr) {
        var str = ''
        if (rawStr !== undefined && rawStr !== null && String(rawStr).trim() !== '') {
          str = String(rawStr).trim()
        } else if (val !== undefined && val !== null) {
          str = String(val).trim()
        }
        if (!str) return 0
        if (str.indexOf('.') !== -1 && str.indexOf(',') !== -1) {
          str = str.replace(/\./g, '').replace(',', '.')
        } else if (str.indexOf(',') !== -1) {
          str = str.replace(',', '.')
        }
        str = str.replace(/[^\d.]/g, '')
        var n = parseFloat(str)
        return isNaN(n) ? 0 : n
      }

      function normalizarPeso(v, p) {
        var unidade = 'ton'
        var toneladas = p
        if (p > 0) {
          if (v > 0) {
            var ratio = v / p
            if (ratio >= 2 && ratio <= 60) {
              unidade = 'kg'
              toneladas = Number((p / 1000).toFixed(6))
            } else if (ratio < 2 && p >= 50) {
              unidade = 'kg'
              toneladas = Number((p / 1000).toFixed(6))
            } else if (p >= 50 && ratio > 60 && ratio < 500) {
              unidade = 'kg'
              toneladas = Number((p / 1000).toFixed(6))
            } else {
              unidade = 'ton'
              toneladas = p
            }
          } else {
            if (p >= 50) {
              unidade = 'kg'
              toneladas = Number((p / 1000).toFixed(6))
            } else {
              unidade = 'ton'
              toneladas = p
            }
          }
        }
        return { toneladas: toneladas, unidade: unidade }
      }

      // (a) Corrigir cfnnihzk0oz9vbu explicitamente
      try {
        const fichaAlvo = app.findFirstRecordByData('respostas_formulario', 'id', 'cfnnihzk0oz9vbu')
        fichaAlvo.set('toneladas_potencial', 0.31905)
        const respAlvo = fichaAlvo.get('respostas') || {}
        if (respAlvo && typeof respAlvo === 'object') {
          respAlvo.q16 = '319,05'
          respAlvo.q16_toneladas_normalizadas = 0.31905
          respAlvo.q16_unidade_detectada = 'kg'
          fichaAlvo.set('respostas', respAlvo)
        }
        app.save(fichaAlvo)
        console.log(
          '[0102_sanear_toneladas_unit_normalizer] Ficha cfnnihzk0oz9vbu corrigida para 0.31905 ton',
        )
      } catch (errFichaAlvo) {
        console.log(
          '[0102_sanear_toneladas_unit_normalizer] Ficha cfnnihzk0oz9vbu aviso: ' +
            errFichaAlvo.message,
        )
      }

      // (b) Ajustar cliente 59xre5tcsmdypon se toneladas_historico estiver inflado
      try {
        const cliAlvo = app.findFirstRecordByData('clientes', 'id', '59xre5tcsmdypon')
        const tonCliAlvo = cliAlvo.getFloat('toneladas_historico')
        if (tonCliAlvo > 10 || Math.abs(tonCliAlvo - 319.05) < 0.1) {
          cliAlvo.set('toneladas_historico', 0.31905)
          app.save(cliAlvo)
          console.log(
            '[0102_sanear_toneladas_unit_normalizer] Cliente 59xre5tcsmdypon corrigido para 0.31905 ton',
          )
        }
      } catch (errCliAlvo) {
        console.log(
          '[0102_sanear_toneladas_unit_normalizer] Cliente 59xre5tcsmdypon aviso: ' +
            errCliAlvo.message,
        )
      }

      // (c) Varrer TODAS as fichas de respostas_formulario onde valor_potencial > 0 e toneladas_potencial > 0
      // e razão < 100 R$/ton (ou seja v / (t * 1000) < 0.10 ou v / t < 100)
      const todasFichas = app.findRecordsByFilter(
        'respostas_formulario',
        'valor_potencial > 0 && toneladas_potencial > 0',
        '-created',
        1000,
        0,
      )

      console.log(
        '[0102_sanear_toneladas_unit_normalizer] Avaliando ' +
          todasFichas.length +
          ' fichas com valor e toneladas > 0...',
      )

      let fichasAjustadas = 0
      let clientesAjustados = 0

      for (let i = 0; i < todasFichas.length; i++) {
        const f = todasFichas[i]
        const v = f.getFloat('valor_potencial')
        const t = f.getFloat('toneladas_potencial')
        if (v <= 0 || t <= 0) continue

        // Razão R$/tonelada registrada atualmente
        const razaoPorTon = v / t

        // Se a razão for menor que 100 R$/ton (aço por menos de R$ 0,10/kg é erro de unidade kg gravado como ton)
        if (razaoPorTon < 100) {
          // Ex: R$ 2600 / 319.05 ton = R$ 8.14/ton -> claramente o peso digitado era 319.05 kg
          const novoPesoTon = Number((t / 1000).toFixed(6))
          console.log(
            '[0102_sanear_toneladas_unit_normalizer] Ficha ' +
              f.id +
              ' com razão ' +
              razaoPorTon.toFixed(2) +
              ' R$/ton detectada em kg: ' +
              t +
              ' -> ' +
              novoPesoTon +
              ' ton',
          )

          f.set('toneladas_potencial', novoPesoTon)
          const resp = f.get('respostas') || {}
          if (resp && typeof resp === 'object') {
            resp.q16_unidade_detectada = 'kg'
            resp.q16_toneladas_normalizadas = novoPesoTon
            f.set('respostas', resp)
          }
          app.save(f)
          fichasAjustadas++

          // (d) Idem para toneladas_historico no cliente correspondente
          const clienteId = f.getString('cliente')
          if (clienteId) {
            try {
              const cli = app.findFirstRecordByData('clientes', 'id', clienteId)
              const tonCli = cli.getFloat('toneladas_historico')
              // Se toneladas_historico estiver igual a t ou > 10 e com razão suspeita
              if (tonCli > 0 && (Math.abs(tonCli - t) < 0.01 || tonCli / novoPesoTon > 500)) {
                cli.set('toneladas_historico', novoPesoTon)
                app.save(cli)
                clientesAjustados++
                console.log(
                  '[0102_sanear_toneladas_unit_normalizer] Cliente ' +
                    clienteId +
                    ' toneladas_historico corrigido de ' +
                    tonCli +
                    ' para ' +
                    novoPesoTon,
                )
              }
            } catch (_) {}
          }
        }
      }

      console.log(
        '[0102_sanear_toneladas_unit_normalizer] Concluído com sucesso. Fichas ajustadas: ' +
          fichasAjustadas +
          ', Clientes ajustados: ' +
          clientesAjustados,
      )
    } catch (err) {
      console.log('[0102_sanear_toneladas_unit_normalizer] Erro geral: ' + err.message)
    }
  },
  () => {},
)
