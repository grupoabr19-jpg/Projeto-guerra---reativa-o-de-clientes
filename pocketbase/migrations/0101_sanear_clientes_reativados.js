/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      console.log(
        '[0101_sanear_clientes_reativados] Iniciando saneamento da tabela clientes para reativados reais...',
      )

      // 1. Buscar todos os clientes com estado='reativado' e reativação real (operador ou pedido_reativacao preenchidos)
      const clientesReativados = app.findRecordsByFilter(
        'clientes',
        "estado = 'reativado' && (operador != '' || pedido_reativacao != '' || operador_reativacao != '')",
        '-created',
        500,
        0,
      )

      console.log(
        `[0101_sanear_clientes_reativados] Avaliando ${clientesReativados.length} clientes reativados reais...`,
      )

      let totalAjustados = 0

      for (let i = 0; i < clientesReativados.length; i++) {
        const cliente = clientesReativados[i]
        const clienteId = cliente.id
        const codigo = cliente.getString('codigo')

        let valorCompraAtual = cliente.getFloat('valor_ultima_compra')
        let tonHistoricoAtual = cliente.getFloat('toneladas_historico')
        let pesoNfAtual = cliente.getFloat('peso_nf_tonelagem')
        const fat12m = cliente.getFloat('fat_12m_reais')

        let alterado = false
        let novoValor = valorCompraAtual
        let novoTon = tonHistoricoAtual
        let novoPesoNf = pesoNfAtual

        // Buscar a ficha mais recente em respostas_formulario vinculada a este cliente
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
            `[0101_sanear_clientes_reativados] Aviso busca ficha cliente ${codigo}: ${errFicha.message}`,
          )
        }

        // Se houver ficha com desfecho e dados de valor_potencial / toneladas_potencial
        let vFicha = 0
        let tFicha = 0
        if (fichaMaisRecente) {
          vFicha = fichaMaisRecente.getFloat('valor_potencial')
          tFicha = fichaMaisRecente.getFloat('toneladas_potencial')
        }

        // A) SANEAMENTO DE PESO (toneladas_historico e peso_nf_tonelagem)
        // Heurística de peso:
        // Se temos valor de compra > 0 e toneladas_historico > 0:
        //   ratio = valor / peso. Se ratio estiver entre 2 e 60, o peso foi registrado em KG (ex: R$ 3000 / 48 = 62,5 ou similar)
        // Ou se peso > 10 (ex: 48, 131, 647.5, 31.22) e compra correspondente em reais é ordens de grandeza inferior a R$ 7.000/ton
        if (novoTon > 0) {
          let converterKgParaTon = false
          if (novoValor > 0) {
            const ratio = novoValor / novoTon
            // Ex: R$ 803 / 131 = 6,12 (R$/kg) -> peso era 131 kg!
            // Ex: R$ 3755,50 / 647,5 = 5,80 (R$/kg) -> peso era 647,5 kg!
            // Ex: R$ 1375,14 / 30,63 = 44,89 (R$/kg) -> peso era 30,63 kg!
            if (ratio >= 2 && ratio <= 60) {
              converterKgParaTon = true
            } else if (ratio < 2 && novoTon >= 10) {
              // Ex: R$ 511 / 31,22 ton = R$ 16/ton (absurdo) -> era 31,22 kg
              converterKgParaTon = true
            }
          } else {
            // Sem valor de compra ou valor zerado: se peso > 10 e não parece toneladas reais para cliente de varejo
            if (novoTon >= 10) {
              converterKgParaTon = true
            }
          }

          if (converterKgParaTon) {
            novoTon = Number((novoTon / 1000).toFixed(4))
            alterado = true
          }
        }

        // Também sanear peso_nf_tonelagem se estiver em kg (mesma lógica)
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
          }
        }

        // B) SANEAMENTO DE VALOR (valor_ultima_compra)
        // Erro de parse de pt-BR ou valores absurdos:
        // Caso 1: C012237 (valor = 400.000, fat_12m = 136.80, ficha = 10.000)
        // Caso 2: C009813 (valor = 200.000, fat_12m = 7.966, ficha = 8.225,13)
        // Condição: se valor > 100x fat_12m quando fat_12m > 0 e valor >= 50.000
        let valorSuspeito = false
        if (novoValor >= 50000) {
          if (fat12m > 0 && novoValor > fat12m * 10) {
            valorSuspeito = true
          }
          if (vFicha > 0 && novoValor > vFicha * 5) {
            valorSuspeito = true
          }
        }

        // Se o valor for suspeito ou absurdo, priorizar os dados da ficha de atendimento
        if (valorSuspeito) {
          if (vFicha > 0) {
            novoValor = vFicha
            alterado = true
          }
        }

        // C) Se a ficha de atendimento tiver ambos os números (vFicha e tFicha) e fecharem com precisão na faixa R$ 2-60/kg
        // e o cliente estiver com peso zerado ou valor zerado mas reativado pela equipe, alinhar
        if (vFicha > 0 && tFicha > 0) {
          const ratioFicha = vFicha / tFicha / 1000 // R$ por kg
          if (ratioFicha >= 2 && ratioFicha <= 60) {
            // Se cliente estiver com ton=0, adotar a da ficha
            if (novoTon <= 0) {
              novoTon = tFicha
              alterado = true
            }
            // Se cliente estiver com valor=0, adotar o da ficha
            if (novoValor <= 0) {
              novoValor = vFicha
              alterado = true
            }
          }
        }

        // Se houve alteração, salvar o registro de cliente
        if (alterado) {
          console.log(
            `[0101_sanear_clientes_reativados] Ajustando cliente ${codigo} (${cliente.getString('nome')}): ` +
              `valor: ${valorCompraAtual} -> ${novoValor}, ` +
              `ton: ${tonHistoricoAtual} -> ${novoTon}, ` +
              `peso_nf: ${pesoNfAtual} -> ${novoPesoNf}`,
          )
          cliente.set('valor_ultima_compra', novoValor)
          cliente.set('toneladas_historico', novoTon)
          cliente.set('peso_nf_tonelagem', novoPesoNf)
          app.save(cliente)
          totalAjustados++
        }
      }

      console.log(
        `[0101_sanear_clientes_reativados] Concluído: ${totalAjustados} clientes ajustados com sucesso.`,
      )
    } catch (err) {
      console.log(`[0101_sanear_clientes_reativados] Erro geral: ${err.message}`)
    }
  },
  () => {},
)
