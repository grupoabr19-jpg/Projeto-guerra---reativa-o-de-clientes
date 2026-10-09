/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      console.log(
        '[0103_sanear_valores_reativados_todos] Iniciando saneamento universal de valor_ultima_compra e toneladas_historico para todos os clientes em estado=reativado...',
      )

      // Buscar todos os clientes com estado='reativado' em lotes (sem limite estrito que corte registros)
      let offset = 0
      const batchSize = 200
      let totalProcessados = 0
      let totalAjustados = 0

      while (true) {
        const batch = app.findRecordsByFilter(
          'clientes',
          "estado = 'reativado'",
          'id',
          batchSize,
          offset,
        )

        if (!batch || batch.length === 0) {
          break
        }

        for (let i = 0; i < batch.length; i++) {
          totalProcessados++
          const cliente = batch[i]
          const clienteId = cliente.id
          const codigo = cliente.getString('codigo')
          const nome = cliente.getString('nome')

          let valorAtual = cliente.getFloat('valor_ultima_compra')
          let tonAtual = cliente.getFloat('toneladas_historico')
          let pesoNfAtual = cliente.getFloat('peso_nf_tonelagem')
          const fat12m = cliente.getFloat('fat_12m_reais')

          let alterado = false
          let novoValor = valorAtual
          let novoTon = tonAtual
          let novoPesoNf = pesoNfAtual
          let motivoAjuste = []

          // Buscar a ficha mais recente em respostas_formulario para este cliente
          let fichaMaisRecente = null
          try {
            const fichas = app.findRecordsByFilter(
              'respostas_formulario',
              `cliente = '${clienteId}'`,
              '-created',
              1,
              0,
            )
            if (fichas && fichas.length > 0) {
              fichaMaisRecente = fichas[0]
            }
          } catch (errFicha) {
            console.log(
              `[0103_sanear_valores_reativados_todos] Erro busca ficha cliente ${codigo}: ${errFicha.message}`,
            )
          }

          let vFicha = 0
          let tFicha = 0
          let desfechoFicha = ''
          if (fichaMaisRecente) {
            vFicha = fichaMaisRecente.getFloat('valor_potencial')
            tFicha = fichaMaisRecente.getFloat('toneladas_potencial')
            desfechoFicha = String(fichaMaisRecente.getString('desfecho') || '').trim()
          }

          // -------------------------------------------------------------
          // 1. SANEAMENTO DE PESO (toneladas_historico e peso_nf_tonelagem)
          // Se peso foi registrado em kg: ratio = valor / peso entre 2 e 60 R$/kg -> dividir por 1000
          // Ou se peso >= 10 e valor <= 0 ou ratio < 2
          // -------------------------------------------------------------
          if (novoTon > 0) {
            let converterKgParaTon = false
            if (novoValor > 0) {
              const ratio = novoValor / novoTon
              if (ratio >= 2 && ratio <= 60) {
                converterKgParaTon = true
              } else if (ratio < 2 && novoTon >= 10) {
                converterKgParaTon = true
              }
            } else if (novoTon >= 10) {
              converterKgParaTon = true
            }

            if (converterKgParaTon) {
              const tonAntigo = novoTon
              novoTon = Number((novoTon / 1000).toFixed(4))
              alterado = true
              motivoAjuste.push(`ton_kg_para_ton(${tonAntigo}->${novoTon})`)
            }
          }

          if (novoPesoNf > 0) {
            let converterKgParaTonNf = false
            if (novoValor > 0) {
              const ratioNf = novoValor / novoPesoNf
              if (ratioNf >= 2 && ratioNf <= 60) {
                converterKgParaTonNf = true
              } else if (ratioNf < 2 && novoPesoNf >= 10) {
                converterKgParaTonNf = true
              }
            } else if (novoPesoNf >= 10) {
              converterKgParaTonNf = true
            }

            if (converterKgParaTonNf) {
              novoPesoNf = Number((novoPesoNf / 1000).toFixed(4))
              alterado = true
              motivoAjuste.push(`peso_nf_kg_para_ton`)
            }
          }

          // -------------------------------------------------------------
          // 2. SANEAMENTO DE VALOR (valor_ultima_compra)
          // Critérios de implausibilidade / corrupção:
          // A) valor_ultima_compra > 3x fat_12m_reais (quando fat_12m_reais > 0)
          // B) Preço implícito fora da faixa do aço:
          //    - Se novoTon > 0: precoPorTon = valor / novoTon; se precoPorTon < 2000 ou > 60000 (fora de R$ 2 - 60/kg)
          //    - Se novoPesoNf > 0 e novoTon == 0: se valor / novoPesoNf < 2000 ou > 60000 (quando peso já em ton)
          // C) valor_ultima_compra excessivo (>= 50.000) sem respaldo:
          //    - fat_12m_reais == 0 e não há ficha correspondente com valor equivalente
          //    - ou valor >= 50.000 e valor > 1.5x fat_12m
          //    - ou valor >= 200.000 sem ficha que confirme
          // -------------------------------------------------------------
          let valorCorrompido = false
          let detalheMotivo = ''

          if (novoValor > 0) {
            // Regra 1: Comparação com fat_12m_reais
            if (fat12m > 0 && novoValor > fat12m * 3) {
              valorCorrompido = true
              detalheMotivo = `valor(${novoValor}) > 3x fat12m(${fat12m})`
            }

            // Regra 2: Preço implícito do aço com base em toneladas_historico
            if (!valorCorrompido && novoTon > 0) {
              const precoPorTon = novoValor / novoTon
              if (precoPorTon < 2000 || precoPorTon > 60000) {
                valorCorrompido = true
                detalheMotivo = `preco_impl_ton(${precoPorTon.toFixed(2)} R$/ton fora 2k-60k)`
              }
            }

            // Regra 3: Se valor >= 50.000
            if (!valorCorrompido && novoValor >= 50000) {
              if (vFicha > 0) {
                if (novoValor > vFicha * 2) {
                  valorCorrompido = true
                  detalheMotivo = `valor(${novoValor}) > 2x vFicha(${vFicha})`
                }
              } else {
                // Sem ficha de atendimento: valores >= 50.000 em clientes reativados sem ficha são artefatos de parse de ERP
                // A equipe nunca registrou isso em atendimento
                valorCorrompido = true
                detalheMotivo = `valor_alto_sem_ficha(${novoValor})`
              }
            }
          }

          // Se valor foi considerado corrompido, corrigir pela ordem de prioridade estrita:
          // (a) Ficha correspondente em respostas_formulario (valor_potencial) se plausível (> 0)
          // (b) fat_12m_reais quando coerente (ex: se > 0 e coerente com tonelagem)
          // (c) Zerar (0) — preferir ZERAR a inventar valor!
          if (valorCorrompido) {
            const valorAntigo = novoValor
            let valorSubstituto = 0
            let fonteSubstituta = 'zerado'

            if (vFicha > 0) {
              // Validar se ficha é plausível (preço implícito se tiver tonelada)
              if (tFicha > 0 && vFicha / tFicha < 100) {
                // Ficha com razão < 100 R$/ton é inválida
                valorSubstituto = 0
                fonteSubstituta = 'ficha_invalida_zerado'
              } else {
                valorSubstituto = vFicha
                fonteSubstituta = `ficha_respostas(${vFicha})`
                // Se cliente tiver ton=0 e ficha tiver tFicha > 0 válida, alinhar também
                if (novoTon <= 0 && tFicha > 0) {
                  novoTon = tFicha
                  motivoAjuste.push(`ton_alinhada_ficha(${tFicha})`)
                }
              }
            } else if (fat12m > 0 && fat12m <= 150000 && novoTon > 0) {
              // Se fat12m é coerente com o peso do aço (ex: fat12m / novoTon na faixa 2000-60000)
              const precoFatTon = fat12m / novoTon
              if (precoFatTon >= 2000 && precoFatTon <= 60000) {
                valorSubstituto = fat12m
                fonteSubstituta = `fat12m_coerente(${fat12m})`
              } else {
                valorSubstituto = 0
                fonteSubstituta = 'zerado_fat12m_incoerente'
              }
            } else {
              valorSubstituto = 0
              fonteSubstituta = 'zerado_sem_fonte_confiavel'
            }

            novoValor = valorSubstituto
            alterado = true
            motivoAjuste.push(
              `valor_corrompido[${detalheMotivo}](${valorAntigo}->${novoValor} via ${fonteSubstituta})`,
            )
          } else {
            // Se o valor não era corrompido mas a ficha de atendimento tem valor e cliente estava zerado
            if (novoValor <= 0 && vFicha > 0) {
              novoValor = vFicha
              if (novoTon <= 0 && tFicha > 0) {
                novoTon = tFicha
              }
              alterado = true
              motivoAjuste.push(`valor_preenchido_da_ficha(${vFicha})`)
            }
          }

          // Se houve alteração em qualquer campo, gravar e logar
          if (alterado) {
            console.log(
              `[0103_sanear_valores_reativados_todos] Cliente ${codigo} (${nome}): ` +
                `motivo=[${motivoAjuste.join('; ')}], ` +
                `valor: ${valorAtual} -> ${novoValor}, ` +
                `ton: ${tonAtual} -> ${novoTon}, ` +
                `peso_nf: ${pesoNfAtual} -> ${novoPesoNf}`,
            )
            cliente.set('valor_ultima_compra', novoValor)
            cliente.set('toneladas_historico', novoTon)
            cliente.set('peso_nf_tonelagem', novoPesoNf)
            app.save(cliente)
            totalAjustados++
          }
        }

        offset += batch.length
      }

      console.log(
        `[0103_sanear_valores_reativados_todos] Concluído com sucesso! ` +
          `Total clientes reativados avaliados: ${totalProcessados}, total ajustados: ${totalAjustados}.`,
      )
    } catch (err) {
      console.log(
        `[0103_sanear_valores_reativados_todos] Erro geral na migração: ${err && err.message ? err.message : String(err)}`,
      )
    }
  },
  () => {},
)
