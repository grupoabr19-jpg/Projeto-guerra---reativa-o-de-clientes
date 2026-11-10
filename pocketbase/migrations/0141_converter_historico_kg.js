/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0141: Padronização da unidade canônica de peso em QUILOGRAMAS (kg).
 *
 * 1. respostas_formulario:
 *    - registros com toneladas_potencial > 0 estão em toneladas (ex.: 0.2078 = 207,8 kg; 1.3525 = 1.352,5 kg).
 *    - Multiplica toneladas_potencial por 1000.
 *    - Multiplica respostas.q16_toneladas_normalizadas por 1000 dentro do JSON respostas.
 *    - Marca respostas.migrado_kg_0141 = true para idempotência.
 *
 * 2. clientes:
 *    - registros com toneladas_historico > 0 estão em toneladas (ex.: 3.23, 4.12, 12.14).
 *    - Multiplica toneladas_historico por 1000.
 *    - Registros com rascunho_respostas gravam rascunho_respostas.migrado_kg_0141 = true (ou marcação equivalente).
 *    - Para idempotência de clientes sem rascunho_respostas, se rascunho_respostas for nulo, inicializa objeto { migrado_kg_0141: true }.
 *
 * 3. Auditoria:
 *    - Grava resumo completo em eventos_log com acao='migracao_0141_kg'.
 *    - Zero exclusões.
 */
migrate(
  (app) => {
    const T = '[0141_converter_historico_kg]'

    let totalRespostasConvertidas = 0
    let totalRespostasPuladas = 0
    let totalClientesConvertidos = 0
    let totalClientesPulados = 0

    // 1. Converter respostas_formulario
    try {
      const colRespostas = app.findCollectionByNameOrId('respostas_formulario')
      // Busca todos os registros onde toneladas_potencial > 0
      const registrosRespostas = app.findRecordsByFilter(
        'respostas_formulario',
        'toneladas_potencial > 0',
        'created',
        5000,
        0,
      )

      for (let i = 0; i < registrosRespostas.length; i++) {
        const rec = registrosRespostas[i]
        let respObj = {}
        try {
          const rawResp = rec.get('respostas')
          if (rawResp && typeof rawResp === 'object') {
            respObj = rawResp
          } else if (typeof rawResp === 'string' && rawResp.trim() !== '') {
            respObj = JSON.parse(rawResp)
          }
        } catch (_) {
          respObj = {}
        }

        // Idempotência
        if (respObj && respObj.migrado_kg_0141 === true) {
          totalRespostasPuladas++
          continue
        }

        const tonAtual = Number(rec.get('toneladas_potencial') || 0)
        if (tonAtual > 0) {
          const novoKg = Number((tonAtual * 1000).toFixed(4))
          rec.set('toneladas_potencial', novoKg)

          if (
            respObj.q16_toneladas_normalizadas !== undefined &&
            respObj.q16_toneladas_normalizadas !== null
          ) {
            const rawNorm = Number(respObj.q16_toneladas_normalizadas)
            if (!isNaN(rawNorm) && rawNorm > 0) {
              respObj.q16_toneladas_normalizadas = Number((rawNorm * 1000).toFixed(4))
            }
          }
          respObj.migrado_kg_0141 = true
          respObj.data_migracao_kg = new Date().toISOString()
          rec.set('respostas', respObj)

          app.save(rec)
          totalRespostasConvertidas++
        } else {
          totalRespostasPuladas++
        }
      }
    } catch (errRespostas) {
      console.log(T + ' Erro ao converter respostas_formulario: ' + errRespostas)
    }

    // 2. Converter clientes
    try {
      const registrosClientes = app.findRecordsByFilter(
        'clientes',
        'toneladas_historico > 0',
        'created',
        10000,
        0,
      )

      for (let j = 0; j < registrosClientes.length; j++) {
        const cli = registrosClientes[j]
        let rascunho = {}
        try {
          const rawRascunho = cli.get('rascunho_respostas')
          if (rawRascunho && typeof rawRascunho === 'object') {
            rascunho = rawRascunho
          } else if (typeof rawRascunho === 'string' && rawRascunho.trim() !== '') {
            rascunho = JSON.parse(rawRascunho)
          }
        } catch (_) {
          rascunho = {}
        }

        // Idempotência
        if (rascunho && rascunho.migrado_kg_0141 === true) {
          totalClientesPulados++
          continue
        }

        const tonCli = Number(cli.get('toneladas_historico') || 0)
        if (tonCli > 0) {
          const novoKgCli = Number((tonCli * 1000).toFixed(4))
          cli.set('toneladas_historico', novoKgCli)

          if (!rascunho || typeof rascunho !== 'object') {
            rascunho = {}
          }
          rascunho.migrado_kg_0141 = true
          rascunho.data_migracao_kg = new Date().toISOString()
          cli.set('rascunho_respostas', rascunho)

          app.save(cli)
          totalClientesConvertidos++
        } else {
          totalClientesPulados++
        }
      }
    } catch (errClientes) {
      console.log(T + ' Erro ao converter clientes: ' + errClientes)
    }

    // 3. Auditoria em eventos_log
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEventos)
      ev.set('acao', 'migracao_0141_kg')
      ev.set('detalhes', {
        respostas_formulario: {
          convertidas: totalRespostasConvertidas,
          puladas: totalRespostasPuladas,
        },
        clientes: {
          convertidos: totalClientesConvertidos,
          pulados: totalClientesPulados,
        },
        data_execucao: new Date().toISOString(),
        descricao: 'Valores historicos multiplicados por 1000 para padronizacao canonica em kg',
      })
      app.save(ev)
      console.log(
        T +
          ' Sucesso! Respostas convertidas: ' +
          totalRespostasConvertidas +
          ', Clientes convertidos: ' +
          totalClientesConvertidos,
      )
    } catch (errLog) {
      console.log(T + ' Falha ao registrar log de auditoria: ' + errLog)
    }
  },
  (app) => {
    // Reversão (down): caso seja necessário reverter
    const registrosRespostas = app.findRecordsByFilter(
      'respostas_formulario',
      'toneladas_potencial > 0',
      'created',
      5000,
      0,
    )
    for (let i = 0; i < registrosRespostas.length; i++) {
      const rec = registrosRespostas[i]
      let respObj = {}
      try {
        respObj = rec.get('respostas') || {}
      } catch (_) {}
      if (respObj && respObj.migrado_kg_0141 === true) {
        const kg = Number(rec.get('toneladas_potencial') || 0)
        rec.set('toneladas_potencial', Number((kg / 1000).toFixed(6)))
        if (respObj.q16_toneladas_normalizadas) {
          respObj.q16_toneladas_normalizadas = Number(
            (respObj.q16_toneladas_normalizadas / 1000).toFixed(6),
          )
        }
        delete respObj.migrado_kg_0141
        delete respObj.data_migracao_kg
        rec.set('respostas', respObj)
        app.save(rec)
      }
    }

    const registrosClientes = app.findRecordsByFilter(
      'clientes',
      'toneladas_historico > 0',
      'created',
      10000,
      0,
    )
    for (let j = 0; j < registrosClientes.length; j++) {
      const cli = registrosClientes[j]
      let rascunho = {}
      try {
        rascunho = cli.get('rascunho_respostas') || {}
      } catch (_) {}
      if (rascunho && rascunho.migrado_kg_0141 === true) {
        const kgCli = Number(cli.get('toneladas_historico') || 0)
        cli.set('toneladas_historico', Number((kgCli / 1000).toFixed(6)))
        delete rascunho.migrado_kg_0141
        delete rascunho.data_migracao_kg
        cli.set('rascunho_respostas', rascunho)
        app.save(cli)
      }
    }
  },
)
