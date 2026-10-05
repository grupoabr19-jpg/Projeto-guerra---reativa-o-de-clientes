/// <reference path="../pb_data/types.d.ts" />

/**
 * kommo_client.js
 *
 * Cliente centralizado para a integração com a API da Kommo (amoCRM).
 *
 * ATENÇÃO - DIRETRIZ DO SISTEMA:
 * O modo somente-leitura (KOMMO_READONLY_MODE) foi DESATIVADO a pedido do usuário (admin Thiago Almeida)
 * para permitir o envio e a sincronização de mensagens do WhatsApp SDR e escrita no CRM.
 * A flag foi mantida centralizada aqui neste módulo para auditoria e controle fino de reversão se necessário.
 *
 * Credenciais são lidas estritamente de secrets do backend ($os.getenv):
 * - KOMMO_SUBDOMAIN
 * - KOMMO_ACCESS_TOKEN
 * - KOMMO_API_BASE_URL (opcional para sandbox / proxy)
 *
 * Toda escrita no Kommo é auditada via eventos_log e console.log.
 */

// Centralização de controle de escrita. Se setado para true, bloqueia qualquer escrita.
// Padrão atual: false (escrita permitida conforme solicitação do usuário)
const KOMMO_READONLY_OVERRIDE = false

/**
 * Normaliza número de telefone removendo qualquer caractere não numérico
 * Ex: "+55 (35) 99770-9232" -> "5535997709232"
 */
function cleanPhoneNumber(phone) {
  if (!phone) return ''
  return String(phone).replace(/\D/g, '')
}

/**
 * Compara dois números de telefone ignorando DDI (+55), espaços, pontuações e nono dígito quando cabível
 */
function isPhoneMatch(phoneA, phoneB) {
  const cleanA = cleanPhoneNumber(phoneA)
  const cleanB = cleanPhoneNumber(phoneB)
  if (!cleanA || !cleanB) return false
  if (cleanA === cleanB) return true

  // Tirar 55 se houver
  const shortA = cleanA.startsWith('55') && cleanA.length >= 12 ? cleanA.slice(2) : cleanA
  const shortB = cleanB.startsWith('55') && cleanB.length >= 12 ? cleanB.slice(2) : cleanB
  if (shortA === shortB) return true

  // Comparação sem o nono dígito (ex: 35 99770 9232 vs 35 9770 9232)
  if (shortA.length === 11 && shortB.length === 10) {
    return shortA.slice(0, 2) === shortB.slice(0, 2) && shortA.slice(3) === shortB.slice(2)
  }
  if (shortB.length === 11 && shortA.length === 10) {
    return shortB.slice(0, 2) === shortA.slice(0, 2) && shortB.slice(3) === shortA.slice(2)
  }

  return false
}

// Número oficial da linha SDR do Projeto Guerra
const KOMMO_SDR_PHONE_TARGET = '35997709232'

function isSdrPhone(phone) {
  return isPhoneMatch(phone, KOMMO_SDR_PHONE_TARGET)
}

function getKommoConfig() {
  const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
  const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''
  const apiBaseUrlSecret = $os.getenv('KOMMO_API_BASE_URL') || ''
  const readonlyEnv = $os.getenv('KOMMO_READONLY_MODE') || 'false'

  const isReadonly = KOMMO_READONLY_OVERRIDE || readonlyEnv.toLowerCase() === 'true'

  const baseUrl = apiBaseUrlSecret
    ? apiBaseUrlSecret.endsWith('/')
      ? apiBaseUrlSecret.slice(0, -1)
      : apiBaseUrlSecret
    : subdomain
      ? `https://${subdomain}.kommo.com`
      : ''

  return {
    subdomain: subdomain,
    accessToken: accessToken,
    baseUrl: baseUrl,
    isConfigured: Boolean(subdomain && accessToken),
    isReadonly: isReadonly,
  }
}

function getKommoHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/**
 * Auditoria de escrita no Kommo registrada em eventos_log
 */
function auditKommoAction(action, details, userId) {
  try {
    console.log(`[kommo_client] [AUDIT] ${action}: ` + JSON.stringify(details))
    const colEv = $app.findCollectionByNameOrId('eventos_log')
    const ev = new Record(colEv)
    if (userId) {
      ev.set('usuario', userId)
    }
    ev.set('acao', `kommo_${action}`)
    ev.set('detalhes', {
      action: action,
      ...details,
      timestamp: new Date().toISOString(),
    })
    $app.save(ev)
  } catch (err) {
    console.log('[kommo_client] Falha ao registrar log de auditoria: ' + err.message)
  }
}

/**
 * Busca o usuário admin oficial (Thiago Almeida)
 */
function getAdminUser() {
  try {
    return $app.findFirstRecordByData('users', 'role', 'admin')
  } catch (_) {
    return null
  }
}

module.exports = {
  cleanPhoneNumber: cleanPhoneNumber,
  isPhoneMatch: isPhoneMatch,
  KOMMO_SDR_PHONE_TARGET: KOMMO_SDR_PHONE_TARGET,
  isSdrPhone: isSdrPhone,
  getKommoConfig: getKommoConfig,
  getKommoHeaders: getKommoHeaders,
  auditKommoAction: auditKommoAction,
  getAdminUser: getAdminUser,
}
