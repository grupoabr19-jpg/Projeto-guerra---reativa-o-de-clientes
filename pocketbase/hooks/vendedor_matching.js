// pocketbase/hooks/vendedor_matching.js
// Utilitários compartilhados de normalização de região e matching tolerante de vendedor
// Executado no Goja runtime do PocketBase (sem imports/exports ES6)

/**
 * Normaliza string removendo acentos, convertendo para maiúsculas e trim.
 */
function normalizarTextoNFD(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

/**
 * Normaliza o nome da região para as grafias canônicas oficiais.
 */
function normalizarRegiaoCanonica(r) {
  const norm = normalizarTextoNFD(r)
  if (!norm) return ''
  if (norm === 'BRAGANCA' || norm === 'BRAGANCA PAULISTA' || norm.includes('BRAGANCA')) {
    return 'BRAGANÇA'
  }
  if (
    norm === 'CAMBUI' ||
    norm === 'MICRO-REGIAO' ||
    norm === 'MICRO REGIAO' ||
    norm === 'MICROREGIAO' ||
    norm.includes('CAMBUI')
  ) {
    return 'CAMBUÍ'
  }
  if (
    norm === 'POCOS DE CALDAS' ||
    norm === 'POCOS CALDAS' ||
    norm === 'POCOS' ||
    norm.includes('POCOS') ||
    norm.includes('CALDAS')
  ) {
    return 'POÇOS DE CALDAS'
  }
  if (norm === 'JUNDIAI' || norm.includes('JUNDIAI')) {
    return 'JUNDIAÍ'
  }
  if (norm === 'ITAJUBA' || norm.includes('ITAJUBA')) {
    return 'ITAJUBÁ'
  }
  if (norm === 'VARGINHA' || norm.includes('VARGINHA')) {
    return 'VARGINHA'
  }
  if (norm === 'POUSO ALEGRE' || norm.includes('POUSO')) {
    return 'POUSO ALEGRE'
  }
  if (norm === 'EXTREMA' || norm.includes('EXTREMA')) {
    return 'EXTREMA'
  }
  if (norm === 'ATACADO') {
    return 'ATACADO'
  }
  if (norm === 'REPESCAGEM') {
    return 'REPESCAGEM'
  }
  return norm
}

/**
 * Constrói condição SQLite/PocketBase para filtrar região com todas as variantes.
 */
function buildRegiaoSqlFilter(regiaoStr) {
  const norm = normalizarTextoNFD(regiaoStr)
  if (norm === 'BRAGANCA' || norm === 'BRAGANCA PAULISTA' || norm.includes('BRAGANCA')) {
    return "(regiao = 'BRAGANÇA' || regiao = 'BRAGANCA' || regiao = 'BRAGANÇA PAULISTA' || regiao = 'BRAGANCA PAULISTA' || regiao ~ 'BRAGANCA' || regiao ~ 'BRAGANÇA')"
  }
  if (
    norm === 'CAMBUI' ||
    norm === 'MICRO-REGIAO' ||
    norm === 'MICRO REGIAO' ||
    norm.includes('CAMBUI')
  ) {
    return "(regiao = 'CAMBUÍ' || regiao = 'CAMBUI' || regiao = 'MICRO-REGIÃO' || regiao = 'MICRO REGIAO' || regiao ~ 'CAMBUI' || regiao ~ 'CAMBUÍ')"
  }
  if (
    norm === 'POCOS DE CALDAS' ||
    norm === 'POCOS CALDAS' ||
    norm === 'POCOS' ||
    norm.includes('POCOS') ||
    norm.includes('CALDAS')
  ) {
    return "(regiao = 'POÇOS DE CALDAS' || regiao = 'POCOS DE CALDAS' || regiao = 'POÇOS CALDAS' || regiao = 'POCOS CALDAS' || regiao ~ 'POCOS' || regiao ~ 'POÇOS')"
  }
  if (norm === 'JUNDIAI' || norm.includes('JUNDIAI')) {
    return "(regiao = 'JUNDIAÍ' || regiao = 'JUNDIAI' || regiao ~ 'JUNDIAI' || regiao ~ 'JUNDIAÍ')"
  }
  if (norm === 'ITAJUBA' || norm.includes('ITAJUBA')) {
    return "(regiao = 'ITAJUBÁ' || regiao = 'ITAJUBA' || regiao ~ 'ITAJUBA' || regiao ~ 'ITAJUBÁ')"
  }
  if (norm === 'VARGINHA' || norm.includes('VARGINHA')) {
    return "(regiao = 'VARGINHA' || regiao ~ 'VARGINHA')"
  }
  if (norm === 'POUSO ALEGRE' || norm.includes('POUSO')) {
    return "(regiao = 'POUSO ALEGRE' || regiao ~ 'POUSO ALEGRE')"
  }
  if (norm === 'EXTREMA' || norm.includes('EXTREMA')) {
    return "(regiao = 'EXTREMA' || regiao ~ 'EXTREMA')"
  }
  if (norm === 'ATACADO') {
    return "regiao = 'ATACADO'"
  }
  if (norm === 'REPESCAGEM') {
    return "regiao = 'REPESCAGEM'"
  }
  return `(regiao = '${norm}' || regiao ~ '${norm}')`
}

/**
 * Remove prefixos de canais de venda da coluna vendedor.
 * Ex: "VARE - RAFAELA RESENDE" -> "RAFAELA RESENDE"
 *     "VCORP - JESSIKA NASCIMENTO" -> "JESSIKA NASCIMENTO"
 *     "VAREXT - ALESSANDRO FARIAS (BRAG.PTA)" -> "ALESSANDRO FARIAS (BRAG.PTA)"
 *     "ATR - JULIO MELO" -> "JULIO MELO"
 */
function limparPrefixoVendedor(vendedorStr) {
  let v = normalizarTextoNFD(vendedorStr)
  const prefixos = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ', 'VARC - ', 'ADMV - ', 'ATF - ']
  for (let i = 0; i < prefixos.length; i++) {
    const p = normalizarTextoNFD(prefixos[i])
    if (v.startsWith(p)) {
      v = v.slice(p.length).trim()
      break
    }
  }
  return v
}

/**
 * Retorna os tokens canônicos, apelidos e sinônimos conhecidos de um operador ou vendedor.
 * Ex: ALESSANDRO <-> JAPA
 *     JESSICA <-> JESSIKA
 *     JOSE FELIPE <-> FELIPE <-> JOSE
 *     ARIANE <-> CONSTRUCAO CIVIL <-> CONSTRUCAO
 */
function obterVariantesVendedor(nomeOuToken) {
  const norm = normalizarTextoNFD(nomeOuToken)
  const variantes = new Set()
  if (!norm) return []

  variantes.add(norm)

  // Sinônimos explícitos da auditoria 0080
  if (norm.includes('ALESSANDRO') || norm.includes('JAPA')) {
    variantes.add('ALESSANDRO')
    variantes.add('JAPA')
  }
  if (norm.includes('JESSICA') || norm.includes('JESSIKA')) {
    variantes.add('JESSICA')
    variantes.add('JESSIKA')
  }
  if (norm.includes('JOSE FELIPE') || norm.includes('FELIPE') || norm.includes('JOSE')) {
    variantes.add('JOSE FELIPE')
    variantes.add('FELIPE')
    variantes.add('JOSE')
  }
  if (norm.includes('ARIANE') || norm.includes('CONSTRUCAO CIVIL') || norm.includes('CONSTRUCAO')) {
    variantes.add('ARIANE')
    variantes.add('CONSTRUCAO CIVIL')
    variantes.add('CONSTRUCAO')
  }

  // Decompõe palavras com 3 ou mais letras (primeiro nome, sobrenome)
  const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 3)
  for (let i = 0; i < partes.length; i++) {
    variantes.add(partes[i])
    if (partes[i] === 'JAPA') variantes.add('ALESSANDRO')
    if (partes[i] === 'ALESSANDRO') variantes.add('JAPA')
    if (partes[i] === 'JESSIKA') variantes.add('JESSICA')
    if (partes[i] === 'JESSICA') variantes.add('JESSIKA')
    if (partes[i] === 'FELIPE') {
      variantes.add('JOSE FELIPE')
      variantes.add('JOSE')
    }
  }

  return Array.from(variantes)
}

/**
 * Checa se o registro de cliente pertence à carteira do vendedor/operador informado.
 * Suporta nome completo, primeiro nome, sobrenome, remoção de prefixos e sinônimos.
 */
function matchesCarteiraVendedorTolerante(clienteRec, userName) {
  if (!userName) return true
  const vRaw = clienteRec.getString('vendedor') || ''
  const tipoVendRaw = clienteRec.getString('tipo_vendedor') || ''
  if (!vRaw && !tipoVendRaw) return false

  const vLimpo = limparPrefixoVendedor(vRaw)
  const tipoLimpo = normalizarTextoNFD(tipoVendRaw)
  const vTextoCompleto = `${vLimpo} ${tipoLimpo}`

  const userNorm = normalizarTextoNFD(userName)
  const userVariantes = obterVariantesVendedor(userNorm)

  // 1. Checagem direta de igualdade ou inclusão com nome completo
  if (vLimpo === userNorm || vLimpo.includes(userNorm) || userNorm.includes(vLimpo)) {
    return true
  }

  // 2. Checagem através das variantes e sinônimos
  for (let i = 0; i < userVariantes.length; i++) {
    const varItem = userVariantes[i]
    if (varItem.length < 3) continue

    // Checa se a variante está contida no nome limpo do vendedor ou tipo_vendedor
    if (
      vLimpo.includes(varItem) ||
      tipoLimpo.includes(varItem) ||
      vTextoCompleto.includes(varItem)
    ) {
      return true
    }
  }

  return false
}

/**
 * Constrói lista de termos para busca SQL no PocketBase (vendedor ~ 'X' || vendedor ~ 'Y')
 */
function buildVendedorSqlTerms(userName) {
  const variantes = obterVariantesVendedor(userName)
  // Filtra tokens relevantes (mínimo 3 letras e remove stopwords muito genéricas)
  const tokens = []
  for (let i = 0; i < variantes.length; i++) {
    const v = variantes[i]
    if (v.length >= 3 && v !== 'DOS' && v !== 'DAS' && v !== 'SILVA') {
      tokens.push(v)
    }
  }
  return tokens
}

/**
 * Extrai DDD do telefone ou whatsapp do cliente.
 */
function extrairDddCliente(clienteRec) {
  const dddGravado = clienteRec.getString('ddd_telefone')
  if (dddGravado && dddGravado.length >= 2) return dddGravado.slice(0, 2)
  const telRaw = (
    clienteRec.getString('telefone') ||
    clienteRec.getString('whatsapp') ||
    ''
  ).replace(/\D/g, '')
  if (!telRaw) return ''
  let s = telRaw
  if (s.startsWith('0')) s = s.slice(1)
  if (s.startsWith('55') && s.length >= 12) s = s.slice(2)
  return s.slice(0, 2)
}

/**
 * Realiza expurgo atômico e imediato de locks expirados (> 30 min) na tabela clientes.
 * Retorna o número de registros liberados.
 */
function expurgarLocksExpiradosAtomicamente(appInstance) {
  const now = new Date()
  const cutoffLock = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()

  let liberados = 0
  try {
    // 1A. Quem NÃO está em standby no futuro volta para 'na_base' e desvincula operador anterior
    const resBase = appInstance
      .db()
      .newQuery(
        `UPDATE clientes
         SET estado = 'na_base', operador = '', lock_timestamp = NULL
         WHERE (estado = 'reservado' OR estado = 'em_atendimento')
           AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp < {:cutoff})
           AND (standby_ate IS NULL OR standby_ate = '' OR datetime(standby_ate) <= datetime({:now}))`,
      )
      .bind({ cutoff: cutoffLock, now: nowIso })
      .execute()

    if (resBase && typeof resBase.rowsAffected === 'function') {
      liberados += resBase.rowsAffected()
    }

    // 1B. Quem ESTÁ em standby no futuro volta para 'reativado' (respeitando a blindagem de 60 dias)
    const resStandby = appInstance
      .db()
      .newQuery(
        `UPDATE clientes
         SET estado = 'reativado', operador = '', lock_timestamp = NULL
         WHERE (estado = 'reservado' OR estado = 'em_atendimento')
           AND (lock_timestamp IS NULL OR lock_timestamp = '' OR lock_timestamp < {:cutoff})
           AND standby_ate IS NOT NULL AND standby_ate != '' AND datetime(standby_ate) > datetime({:now})`,
      )
      .bind({ cutoff: cutoffLock, now: nowIso })
      .execute()

    if (resStandby && typeof resStandby.rowsAffected === 'function') {
      liberados += resStandby.rowsAffected()
    }
  } catch (err) {
    console.log('[expurgo_locks] Erro ao executar expurgo de locks: ' + err.message)
  }
  return liberados
}

module.exports = {
  normalizarTextoNFD,
  normalizarRegiaoCanonica,
  buildRegiaoSqlFilter,
  limparPrefixoVendedor,
  obterVariantesVendedor,
  matchesCarteiraVendedorTolerante,
  buildVendedorSqlTerms,
  extrairDddCliente,
  expurgarLocksExpiradosAtomicamente,
}
