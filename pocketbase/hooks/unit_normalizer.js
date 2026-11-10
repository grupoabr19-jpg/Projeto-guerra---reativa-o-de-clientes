// pocketbase/hooks/unit_normalizer.js
// Helper centralizado em JS puro para normalização de unidade (canônica: kg).
// Compatível com Goja (sem Spread, sem toLocaleString, sem construtos ES modernos conflitantes).
// Unidade canônica do sistema Projeto Guerra: QUILOGRAMAS (kg).
// Tudo gravado, somado, comparado e exibido com base em kg.

/**
 * Normaliza peso e unidade a partir de valor e peso (numéricos ou raw strings).
 * Se unidadeForcada for passada ('kg' ou 'ton'/'t'), ela tem precedência absoluta.
 * Heurística de adivinhação por tamanho do número (ex: p >= 50 => kg) FOI REMOVIDA.
 *
 * Retorna:
 * {
 *   kg: number (canônico),
 *   toneladas: number,
 *   unidade_detectada: 'kg' | 'ton',
 *   valor_bruto: number,
 *   peso_bruto: number,
 *   preco_por_kg: number,
 *   preco_por_ton: number
 * }
 */
function normalizarPesoEUnidade(valorInput, pesoInput, rawValorStr, rawPesoStr, unidadeForcada) {
  function parseNumeroLimpoPtBr(val, rawStr) {
    var str = ''
    if (rawStr !== undefined && rawStr !== null && String(rawStr).trim() !== '') {
      str = String(rawStr).trim()
    } else if (val !== undefined && val !== null) {
      str = String(val).trim()
    }
    if (!str) return 0

    // Se tem ponto e vírgula (ex: 1.250,50 ou 1,250.50)
    if (str.indexOf('.') !== -1 && str.indexOf(',') !== -1) {
      if (str.indexOf('.') < str.indexOf(',')) {
        // Padrão pt-BR: 1.250,50
        str = str.replace(/\./g, '').replace(',', '.')
      } else {
        // Padrão en-US: 1,250.50
        str = str.replace(/,/g, '')
      }
    } else if (str.indexOf(',') !== -1) {
      // Somente vírgula: 253,08
      str = str.replace(',', '.')
    } else if (str.indexOf('.') !== -1) {
      // Somente ponto: ex: 1.200 (se 3 dígitos após ponto e sem outro ponto, pode ser milhar pt-BR)
      // Se for decimal direto (ex 253.08)
      var partes = str.split('.')
      if (
        partes.length === 2 &&
        partes[1].length === 3 &&
        partes[0].length >= 1 &&
        partes[0].length <= 3
      ) {
        // Milhar pt-BR sem vírgula decimal: ex "1.200" => 1200
        str = partes[0] + partes[1]
      }
    }

    str = str.replace(/[^\d.]/g, '')
    var n = parseFloat(str)
    return isNaN(n) ? 0 : Number(n.toFixed(6))
  }

  var v = parseNumeroLimpoPtBr(valorInput, rawValorStr)
  var rawPStr = String(
    rawPesoStr !== undefined && rawPesoStr !== null ? rawPesoStr : pesoInput || '',
  ).trim()

  var matchKg = rawPStr.match(/(\d+([.,]\d+)?)\s*(?:kg|quilos?|kilos?)/i)
  var matchTon = rawPStr.match(/(\d+([.,]\d+)?)\s*(?:t|ton|tons|toneladas?)/i)

  var p = parseNumeroLimpoPtBr(pesoInput, rawPesoStr)

  var unidade = 'kg' // Unidade canônica padrão agora é kg

  var uForcada = String(unidadeForcada || '')
    .toLowerCase()
    .trim()
  if (
    uForcada === 'ton' ||
    uForcada === 'tonelada' ||
    uForcada === 'toneladas' ||
    uForcada === 't'
  ) {
    unidade = 'ton'
  } else if (uForcada === 'kg' || uForcada === 'quilo' || uForcada === 'quilos') {
    unidade = 'kg'
  } else if (matchTon) {
    unidade = 'ton'
    if (matchTon[1]) {
      p = parseNumeroLimpoPtBr(null, matchTon[1])
    }
  } else if (matchKg) {
    unidade = 'kg'
    if (matchKg[1]) {
      p = parseNumeroLimpoPtBr(null, matchKg[1])
    }
  }

  var pesoKg = 0
  var pesoTon = 0

  if (p > 0) {
    if (unidade === 'ton') {
      pesoTon = Number(p.toFixed(6))
      pesoKg = Number((p * 1000).toFixed(6))
    } else {
      pesoKg = Number(p.toFixed(6))
      pesoTon = Number((p / 1000).toFixed(6))
    }
  }

  var precoKg = v > 0 && pesoKg > 0 ? Number((v / pesoKg).toFixed(4)) : 0
  var precoTon = v > 0 && pesoTon > 0 ? Number((v / pesoTon).toFixed(2)) : 0

  return {
    kg: pesoKg,
    toneladas: pesoTon,
    unidade_detectada: unidade,
    valor_bruto: v,
    peso_bruto: p,
    preco_por_kg: precoKg,
    preco_por_ton: precoTon,
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.normalizarPesoEUnidade = normalizarPesoEUnidade
}
