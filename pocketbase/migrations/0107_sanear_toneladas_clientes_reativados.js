/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      console.log(
        '[0107_sanear_toneladas_clientes_reativados] Iniciando saneamento de toneladas_historico e peso_nf_tonelagem em clientes reativados...',
      )

      // Buscar todos os clientes em estado = 'reativado' em lotes
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

          let tonAtual = cliente.getFloat('toneladas_historico')
          let pesoNfAtual = cliente.getFloat('peso_nf_tonelagem')
          const valorAtual = cliente.getFloat('valor_ultima_compra')
          const fat12m = cliente.getFloat('fat_12m_reais')

          let alterado = false
          let novoTon = tonAtual
          let novoPesoNf = pesoNfAtual
          let motivos = []

          // Valor de referência para preço do aço (preferir valor_ultima_compra se > 0, senão fat_12m_reais)
          const valorRef = valorAtual > 0 ? valorAtual : fat12m > 0 ? fat12m : 0

          // 1. Saneamento de toneladas_historico
          if (novoTon > 0) {
            let converterKgParaTon = false

            if (valorRef > 0) {
              const ratioKg = valorRef / novoTon // preço por suposto kg
              const ratioTon = valorRef / (novoTon * 1000) // preço por suposto kg se novoTon já for toneladas (ou valorRef / gramas)

              // Se o valor / novoTon cai na faixa plausível do aço (R$ 2 a R$ 60 por kg),
              // então novoTon está gravado em QUILOS e deve ser dividido por 1000.
              if (ratioKg >= 2 && ratioKg <= 60) {
                converterKgParaTon = true
              } else if (novoTon >= 10 && ratioKg < 2) {
                // Preço < R$ 2 / kg com peso >= 10: como toneladas daria menos de R$ 0,002/kg (absurdo total)
                converterKgParaTon = true
              }
            } else {
              // Sem valor financeiro: clientes de varejo com peso >= 50 kg gravados como toneladas
              if (novoTon >= 50) {
                converterKgParaTon = true
              }
            }

            if (converterKgParaTon) {
              const tonAntigo = novoTon
              novoTon = Number((novoTon / 1000).toFixed(4))
              alterado = true
              motivos.push(`ton_kg_para_ton(${tonAntigo}->${novoTon})`)
            }
          }

          // 2. Saneamento de peso_nf_tonelagem (mesma lógica caso venha da mesma fonte ERP em kg)
          if (novoPesoNf > 0) {
            let converterKgParaTonNf = false

            if (valorRef > 0) {
              const ratioKgNf = valorRef / novoPesoNf
              if (ratioKgNf >= 2 && ratioKgNf <= 60) {
                converterKgParaTonNf = true
              } else if (novoPesoNf >= 10 && ratioKgNf < 2) {
                converterKgParaTonNf = true
              }
            } else if (novoPesoNf >= 50) {
              converterKgParaTonNf = true
            }

            if (converterKgParaTonNf) {
              const pesoNfAntigo = novoPesoNf
              novoPesoNf = Number((novoPesoNf / 1000).toFixed(4))
              alterado = true
              motivos.push(`peso_nf_kg_para_ton(${pesoNfAntigo}->${novoPesoNf})`)
            }
          }

          if (alterado) {
            console.log(
              `[0107_sanear_toneladas_clientes_reativados] Cliente ${codigo} (${nome}): ` +
                `motivos=[${motivos.join('; ')}], ` +
                `ton: ${tonAtual} -> ${novoTon}, ` +
                `peso_nf: ${pesoNfAtual} -> ${novoPesoNf}`,
            )
            cliente.set('toneladas_historico', novoTon)
            cliente.set('peso_nf_tonelagem', novoPesoNf)
            app.save(cliente)
            totalAjustados++
          }
        }

        offset += batch.length
      }

      console.log(
        `[0107_sanear_toneladas_clientes_reativados] Concluído com sucesso! ` +
          `Total clientes reativados avaliados: ${totalProcessados}, total ajustados: ${totalAjustados}.`,
      )
    } catch (err) {
      console.log(
        `[0107_sanear_toneladas_clientes_reativados] Erro geral na migração: ${err && err.message ? err.message : String(err)}`,
      )
    }
  },
  () => {},
)
