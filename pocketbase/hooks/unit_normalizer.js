// pocketbase/hooks/unit_normalizer.js
// Helper centralizado em JS puro para normalização de unidade (kg vs ton).
// Compatível com Goja (sem Spread, sem toLocaleString, sem construtos ES modernos conflitantes).

/**
 * Normaliza peso e unidade a partir de valor e peso (numéricos ou raw strings).
 *
 * Regras:
 * - Parse tolerando vírgula e ponto decimal tanto para valor quanto para peso.
 * - Se valor/peso entre R$ 2 e R$ 60/kg => peso está em kg => toneladas = peso / 1000.
 * - Se peso >= 50 e (valor <= 0 ou razão < 2) => tratar como kg também => toneladas = peso / 1000.
 * - Caso contrário => manter peso em toneladas.
 *
 * Retorna { toneladas, unidade_detectada, valor_bruto, peso_bruto }
 */
function normalizarPesoEUnidade(valorInput, pesoInput, rawValorStr, rawPesoStr) {
  function parseNumeroLimpo(val, rawStr) {
    var str = ''
    if (rawStr !== undefined && rawStr !== null && String(rawStr).trim() !== '') {
      str = String(rawStr).trim()
    } else if (val !== undefined && val !== null) {
      str = String(val).trim()
    }
    if (!str) return 0

    // Se tem ponto e vírgula (ex: 1.250,50)
    if (str.indexOf('.') !== -1 && str.indexOf(',') !== -1) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else if (str.indexOf(',') !== -1) {
      str = str.replace(',', '.')
    }

    // Remove caracteres não numéricos exceto ponto e dígitos
    str = str.replace(/[^\d.]/g, '')
    var n = parseFloat(str)
    return isNaN(n) ? 0 : n
  }

  var v = parseNumeroLimpo(valorInput, rawValorStr)
  var p = parseNumeroLimpo(pesoInput, rawPesoStr)

  var unidade = 'ton'
  var toneladas = p

  if (p > 0) {
    if (v > 0) {
      var ratio = v / p
      if (ratio >= 2 && ratio <= 60) {
        // Ex: R$ 2.600 / 319,05 = R$ 8,15/kg -> kg
        unidade = 'kg'
        toneladas = Number((p / 1000).toFixed(6))
      } else if (ratio < 2 && p >= 50) {
        // Ex: razão < 2 e peso alto -> kg
        unidade = 'kg'
        toneladas = Number((p / 1000).toFixed(6))
      } else if (p >= 50 && ratio > 60 && ratio < 500) {
        // Faixa intermediária suspeita com peso alto
        unidade = 'kg'
        toneladas = Number((p / 1000).toFixed(6))
      } else {
        // ratio >= 500 ou tonelagem coerente
        unidade = 'ton'
        toneladas = p
      }
    } else {
      // valor = 0 ou não informado
      if (p >= 50) {
        unidade = 'kg'
        toneladas = Number((p / 1000).toFixed(6))
      } else {
        unidade = 'ton'
        toneladas = p
      }
    }
  }

  return {
    toneladas: toneladas,
    unidade_detectada: unidade,
    valor_bruto: v,
    peso_bruto: p,
  }
}

// Exportação global para ambiente Goja e compatibilidade Node se aplicável
if (typeof globalThis !== 'undefined') {
  globalThis.normalizarPesoEUnidade = normalizarPesoEUnidade
}
