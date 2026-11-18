/**
 * Normalização de números pt-BR / en-US para valores numéricos canônicos.
 *
 * Usada nos caminhos onde o ERP entrega pesos/valores em formato brasileiro:
 * - Modal de faturamento (peso da NF em kg)
 * - Importação de planilhas de faturamento (peso/valor por linha)
 *
 * Exemplos suportados: "253,08" → 253.08 | "1.234,56" → 1234.56 |
 * "1,234.56" → 1234.56 | "R$ 1 234,56" → 1234.56 | 253.08 → 253.08
 */
export function parseNumeroPtBr(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  let s = String(v ?? '')
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (!s) return 0
  const hasComma = s.indexOf(',') >= 0
  const hasDot = s.indexOf('.') >= 0
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.') // pt-BR: 1.234,56
    } else {
      s = s.replace(/,/g, '') // en-US: 1,234.56
    }
  } else if (hasComma) {
    s = s.replace(/,/g, '.') // pt-BR decimal: 253,08
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}
