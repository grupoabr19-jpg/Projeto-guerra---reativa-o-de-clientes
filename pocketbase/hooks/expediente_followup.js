// Hook de garantia e ajuste automático de expediente para follow-ups e reagendamentos
// Expediente oficial da equipe: Segunda a Sexta, das 07:00 às 17:00 (America/Sao_Paulo / UTC-3).
// Se um atendimento for reagendado fora deste horário ou fim de semana,
// a data/hora é automaticamente ajustada para o primeiro momento útil seguinte (ex: próximo dia útil às 07:00).

// 1. Hook ao criar Cliente (se reagendado_para for preenchido)
onRecordCreate((e) => {
  try {
    var record = e.record
    var reagPara = record.getString('reagendado_para')
    if (reagPara) {
      var parsed = new Date(reagPara)
      if (!isNaN(parsed.getTime())) {
        var utcMs = parsed.getTime()
        var brtMs = utcMs - 3 * 60 * 60 * 1000
        var brtDate = new Date(brtMs)

        var year = brtDate.getUTCFullYear()
        var month = brtDate.getUTCMonth()
        var day = brtDate.getUTCDate()
        var hour = brtDate.getUTCHours()
        var minute = brtDate.getUTCMinutes()
        var dayOfWeek = brtDate.getUTCDay()

        var foiAjustado = false
        var targetYear = year
        var targetMonth = month
        var targetDay = day
        var targetHour = hour
        var targetMinute = minute

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          var diasParaSegunda = dayOfWeek === 6 ? 2 : 1
          var segBrtMs = brtMs + diasParaSegunda * 24 * 60 * 60 * 1000
          var segDate = new Date(segBrtMs)
          targetYear = segDate.getUTCFullYear()
          targetMonth = segDate.getUTCMonth()
          targetDay = segDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour < 7) {
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour >= 17) {
          var diasAdd = dayOfWeek === 5 ? 3 : 1
          var proxBrtMs = brtMs + diasAdd * 24 * 60 * 60 * 1000
          var proxDate = new Date(proxBrtMs)
          targetYear = proxDate.getUTCFullYear()
          targetMonth = proxDate.getUTCMonth()
          targetDay = proxDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        }

        if (foiAjustado) {
          var correctedUtcMs = Date.UTC(
            targetYear,
            targetMonth,
            targetDay,
            targetHour + 3,
            targetMinute,
            0,
            0,
          )
          var ajustada = new Date(correctedUtcMs).toISOString()
          record.set('reagendado_para', ajustada)
        }
      }
    }
  } catch (err) {
    console.log('[expediente_followup] Erro em onRecordCreate clientes:', err)
  }
  e.next()
}, 'clientes')

// 2. Hook ao atualizar Cliente (se reagendado_para for preenchido)
onRecordUpdate((e) => {
  try {
    var record = e.record
    var reagPara = record.getString('reagendado_para')
    if (reagPara) {
      var parsed = new Date(reagPara)
      if (!isNaN(parsed.getTime())) {
        var utcMs = parsed.getTime()
        var brtMs = utcMs - 3 * 60 * 60 * 1000
        var brtDate = new Date(brtMs)

        var year = brtDate.getUTCFullYear()
        var month = brtDate.getUTCMonth()
        var day = brtDate.getUTCDate()
        var hour = brtDate.getUTCHours()
        var minute = brtDate.getUTCMinutes()
        var dayOfWeek = brtDate.getUTCDay()

        var foiAjustado = false
        var targetYear = year
        var targetMonth = month
        var targetDay = day
        var targetHour = hour
        var targetMinute = minute

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          var diasParaSegunda = dayOfWeek === 6 ? 2 : 1
          var segBrtMs = brtMs + diasParaSegunda * 24 * 60 * 60 * 1000
          var segDate = new Date(segBrtMs)
          targetYear = segDate.getUTCFullYear()
          targetMonth = segDate.getUTCMonth()
          targetDay = segDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour < 7) {
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour >= 17) {
          var diasAdd = dayOfWeek === 5 ? 3 : 1
          var proxBrtMs = brtMs + diasAdd * 24 * 60 * 60 * 1000
          var proxDate = new Date(proxBrtMs)
          targetYear = proxDate.getUTCFullYear()
          targetMonth = proxDate.getUTCMonth()
          targetDay = proxDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        }

        if (foiAjustado) {
          var correctedUtcMs = Date.UTC(
            targetYear,
            targetMonth,
            targetDay,
            targetHour + 3,
            targetMinute,
            0,
            0,
          )
          var ajustada = new Date(correctedUtcMs).toISOString()
          record.set('reagendado_para', ajustada)
        }
      }
    }
  } catch (err) {
    console.log('[expediente_followup] Erro em onRecordUpdate clientes:', err)
  }
  e.next()
}, 'clientes')

// 3. Hook ao registrar Interação com reagendado_para
onRecordCreate((e) => {
  try {
    var record = e.record
    var reagPara = record.getString('reagendado_para')
    if (reagPara) {
      var parsed = new Date(reagPara)
      if (!isNaN(parsed.getTime())) {
        var utcMs = parsed.getTime()
        var brtMs = utcMs - 3 * 60 * 60 * 1000
        var brtDate = new Date(brtMs)

        var year = brtDate.getUTCFullYear()
        var month = brtDate.getUTCMonth()
        var day = brtDate.getUTCDate()
        var hour = brtDate.getUTCHours()
        var minute = brtDate.getUTCMinutes()
        var dayOfWeek = brtDate.getUTCDay()

        var foiAjustado = false
        var targetYear = year
        var targetMonth = month
        var targetDay = day
        var targetHour = hour
        var targetMinute = minute

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          var diasParaSegunda = dayOfWeek === 6 ? 2 : 1
          var segBrtMs = brtMs + diasParaSegunda * 24 * 60 * 60 * 1000
          var segDate = new Date(segBrtMs)
          targetYear = segDate.getUTCFullYear()
          targetMonth = segDate.getUTCMonth()
          targetDay = segDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour < 7) {
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        } else if (hour >= 17) {
          var diasAdd = dayOfWeek === 5 ? 3 : 1
          var proxBrtMs = brtMs + diasAdd * 24 * 60 * 60 * 1000
          var proxDate = new Date(proxBrtMs)
          targetYear = proxDate.getUTCFullYear()
          targetMonth = proxDate.getUTCMonth()
          targetDay = proxDate.getUTCDate()
          targetHour = 7
          targetMinute = 0
          foiAjustado = true
        }

        if (foiAjustado) {
          var correctedUtcMs = Date.UTC(
            targetYear,
            targetMonth,
            targetDay,
            targetHour + 3,
            targetMinute,
            0,
            0,
          )
          var ajustada = new Date(correctedUtcMs).toISOString()
          record.set('reagendado_para', ajustada)
        }
      }
    }
  } catch (err) {
    console.log('[expediente_followup] Erro em onRecordCreate interacoes:', err)
  }
  e.next()
}, 'interacoes')
