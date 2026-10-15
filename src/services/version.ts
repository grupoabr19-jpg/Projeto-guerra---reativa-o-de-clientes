import pb from '@/lib/pocketbase/client'

export interface AppVersionInfo {
  version: string
  buildId: string
  buildTime?: string
  mensagem?: string
  forceReload?: boolean
}

// Versão da build atual rodando nesta aba do navegador
// Injetado em tempo de build pelo vite.config.ts se disponível
declare const __APP_VERSION__: string | undefined
declare const __APP_BUILD_ID__: string | undefined
declare const __APP_BUILD_TIME__: string | undefined

const resolvedVersion = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '0.0.149'
const resolvedBuildId =
  (typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__) || `v${resolvedVersion}`
const resolvedBuildTime =
  (typeof __APP_BUILD_TIME__ !== 'undefined' && __APP_BUILD_TIME__) || new Date().toISOString()

// Versão da build atual rodando nesta aba do navegador
export const CLIENT_BUILD_INFO: AppVersionInfo = {
  version: resolvedVersion,
  buildId: resolvedBuildId,
  buildTime: resolvedBuildTime,
}

/**
 * Consulta a versão do frontend no arquivo estático /version.json
 * Se falhar, consulta o backend /backend/v1/app/version como fallback.
 */
export async function checkLatestAppVersion(): Promise<AppVersionInfo> {
  const cacheBust = `?t=${Date.now()}`

  // 1. Tenta buscar do arquivo estático /version.json com cache-busting robusto
  try {
    const res = await fetch(`/version.json${cacheBust}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
    if (res.ok) {
      const data = await res.json()
      if (data && (data.version || data.buildId || data.build_id)) {
        return {
          version: String(data.version || resolvedVersion),
          buildId: String(data.buildId || data.build_id || data.version || resolvedBuildId),
          buildTime: data.buildTime || data.build_time,
          mensagem: data.mensagem,
          forceReload: Boolean(data.forceReload || data.force_reload),
        }
      }
    }
  } catch (staticErr) {
    console.debug('Falha ao checar /version.json estático, usando backend:', staticErr)
  }

  // 2. Fallback: Endpoint do backend PocketBase com timestamp cache-busting
  try {
    const res = await pb.send<{
      ok: boolean
      version: string
      build_id?: string
      mensagem?: string
      force_reload?: boolean
      published_at?: string
    }>(`/backend/v1/app/version${cacheBust}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })

    return {
      version: res.version || resolvedVersion,
      buildId: res.build_id || res.version || resolvedBuildId,
      buildTime: res.published_at,
      mensagem: res.mensagem,
      forceReload: Boolean(res.force_reload),
    }
  } catch (pbErr) {
    console.warn('Falha ao consultar versão no backend:', pbErr)
    return CLIENT_BUILD_INFO
  }
}

/**
 * Disparar atualização de versão pelo painel de admin
 */
export async function emitirAtualizacaoVersaoAdmin(params: {
  version: string
  mensagem?: string
  forceReload?: boolean
  dispararChatAviso?: boolean
}): Promise<{ ok: boolean; version: string; build_id: string }> {
  return await pb.send('/backend/v1/app/version', {
    method: 'POST',
    body: {
      version: params.version,
      build_id: `v${params.version}-${Date.now()}`,
      mensagem: params.mensagem || 'Nova versão do sistema liberada!',
      force_reload: Boolean(params.forceReload),
      disparar_chat_aviso: Boolean(params.dispararChatAviso),
    },
  })
}
