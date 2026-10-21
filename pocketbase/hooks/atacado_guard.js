// pocketbase/hooks/atacado_guard.js
// Módulo compartilhado para detecção e blindagem de clientes do perfil ATACADO
// Compatível com o runtime Goja do PocketBase (sem imports/exports ES6)

function normalizarTextoNFD(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function extrairDddCliente(clienteRec) {
  if (!clienteRec) return ''
  var dddGravado = clienteRec.getString('ddd_telefone')
  if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
  var telRaw = (clienteRec.getString('telefone') || clienteRec.getString('whatsapp') || '').replace(
    /\D/g,
    '',
  )
  if (!telRaw) return ''
  var s = telRaw
  if (s.startsWith('0')) s = s.slice(1)
  if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
  return s.slice(0, 2)
}

/**
 * Blindagem de ATACADO unificada e estrita:
 * 1. Região cadastrada explícita: 'ATACADO'
 * 2. Vendedor ou tipo de vendedor com prefixo ou menção de atacado (ATR-, ATACADO-, etc.)
 * 3. DDD pertencente ao mapa de atacado (11 a 19) com canal/perfil atacado
 */
function isClienteAtacado(clienteRec) {
  if (!clienteRec) return false

  // 1. Região cadastrada explícita
  var regiao = normalizarTextoNFD(clienteRec.getString('regiao'))
  if (regiao === 'ATACADO' || regiao.includes('ATACADO')) {
    return true
  }

  // 2. Vendedor ou tipo de vendedor com prefixo ou menção de atacado
  var vendRaw = normalizarTextoNFD(clienteRec.getString('vendedor'))
  var tipoVend = normalizarTextoNFD(clienteRec.getString('tipo_vendedor'))
  var canalRaw = normalizarTextoNFD(clienteRec.getString('canal'))
  if (
    vendRaw.startsWith('ATR -') ||
    vendRaw.startsWith('ATR-') ||
    vendRaw.startsWith('ATACADO -') ||
    vendRaw.startsWith('ATACADO-') ||
    vendRaw.includes('ATACADO') ||
    tipoVend === 'ATACADO' ||
    tipoVend.includes('ATACADO') ||
    canalRaw === 'ATACADO' ||
    canalRaw.includes('ATACADO')
  ) {
    return true
  }

  // 3. DDD pertencente ao mapa de atacado (11 a 19) com canal/perfil atacado
  var ddd = extrairDddCliente(clienteRec)
  var dddsAtacado = ['11', '12', '13', '14', '15', '16', '17', '18', '19']
  if (
    dddsAtacado.includes(ddd) &&
    (canalRaw === 'ATACADO' ||
      tipoVend === 'ATACADO' ||
      vendRaw.startsWith('ATR') ||
      vendRaw.includes('ATACADO'))
  ) {
    return true
  }

  return false
}

// Registro no escopo global para consumo transparente em todos os hooks
if (typeof globalThis !== 'undefined') {
  globalThis.isClienteAtacado = isClienteAtacado
  globalThis.extrairDddClienteAtacado = extrairDddCliente
  globalThis.atacadoGuard = {
    isClienteAtacado: isClienteAtacado,
    extrairDddCliente: extrairDddCliente,
    normalizarTextoNFD: normalizarTextoNFD,
  }
}
