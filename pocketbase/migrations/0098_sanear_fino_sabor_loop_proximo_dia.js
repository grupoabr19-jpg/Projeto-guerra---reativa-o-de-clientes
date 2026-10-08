/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Saneamento pontual da Fino Sabor (C002605) e clientes devolvidos hoje
    // Garante que Fino Sabor receba reagendado_para = 07:00 BRT do próximo dia útil,
    // estado = 'reagendado', operador = '', lock limpo e retomada_servida_em gravada,
    // evitando que volte a cair no loop antes do próximo dia útil.
    try {
      const now = new Date()
      const nowMs = now.getTime()
      const brtMs = nowMs - 3 * 60 * 60 * 1000
      const brtDate = new Date(brtMs)
      const dayOfWeek = brtDate.getUTCDay()
      let diasAdd = 1
      if (dayOfWeek === 5) diasAdd = 3
      else if (dayOfWeek === 6) diasAdd = 2

      const proxBrt = new Date(brtMs + diasAdd * 24 * 60 * 60 * 1000)
      const proximaAberturaIso = new Date(
        Date.UTC(
          proxBrt.getUTCFullYear(),
          proxBrt.getUTCMonth(),
          proxBrt.getUTCDate(),
          10,
          0,
          0,
          0,
        ),
      ).toISOString()

      // 1. Sanear FINO SABOR C002605
      try {
        const finoSabor = app.findFirstRecordByData('clientes', 'codigo', 'C002605')
        if (finoSabor) {
          finoSabor.set('reagendado_para', proximaAberturaIso)
          finoSabor.set('retomada_servida_em', now.toISOString())
          finoSabor.set('estado', 'reagendado')
          finoSabor.set('operador', '')
          finoSabor.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
          app.save(finoSabor)
          console.log('[0098_migration] FINO SABOR C002605 adiado para ' + proximaAberturaIso)
        }
      } catch (errFino) {
        console.log('[0098_migration] Aviso FINO SABOR: ' + errFino.message)
      }

      // 2. Sanear qualquer cliente preso em estado 'na_base' que possua retomada_servida_em gravada hoje
      app
        .db()
        .newQuery(`
          UPDATE clientes
          SET estado = 'reagendado',
              reagendado_para = {:proxAbertura},
              operador = '',
              lock_timestamp = '1970-01-01 00:00:00.000Z'
          WHERE estado = 'na_base'
            AND retomada_servida_em IS NOT NULL
            AND retomada_servida_em != ''
            AND (pedido_em_aberto IS NOT 1)
        `)
        .bind({ proxAbertura: proximaAberturaIso })
        .execute()
    } catch (err) {
      console.log('[0098_migration] Erro saneamento: ' + err.message)
    }
  },
  () => {
    // Reversão não necessária para saneamento de dados
  },
)
