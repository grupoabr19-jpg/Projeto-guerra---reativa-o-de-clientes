import pb from '@/lib/pocketbase/client'

export interface AppVersionInfo {
  version: string
  buildId: string
  buildTime?: string
  mensagem?: string
  forceReload?: boolean
}

// Versão da build atual rodando nesta aba do navegador
export const CLIENT_BUILD_INFO: AppVersionInfo = {
  version: '1.0.0',
  buildId: 'v1.0.0-20260401',
  buildTime: new Date().toISOString(),
}

/**
 * Consulta a versão do frontend no arquivo estático /version.json
 * Se falhar, consulta o backend /backend/v1/app/version como fallback.
 */
export async function checkLatestAppVersion(): Promise<AppVersionInfo> {
  const cacheBust = `?t=${Date.now()}`

  // 1. Tenta buscar do arquivo estático /version.json com cache-busting
  try {
    const res = await fetch(`/version.json${cacheBust}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    })
    if (res.ok) {
      const data = await res.json()
      if (data && (data.version || data.buildId)) {
        return {
          version: String(data.version || '1.0.0'),
          buildId: String(data.buildId || data.build_id || data.version || ''),
          buildTime: data.buildTime || data.build_time,
          mensagem: data.mensagem,
          forceReload: Boolean(data.forceReload || data.force_reload),
        }
      }
    }
  } catch (staticErr) {
    console.debug('Falha ao checar /version.json estático, usando backend:', staticErr)
  }

  // 2. Fallback: Endpoint do backend PocketBase
  try {
    const res = await pb.send<{
      ok: boolean
      version: string
      build_id?: string
      mensagem?: string
      force_reload?: boolean
      published_at?: string
    }>('/backend/v1/app/version', {
      method: 'GET',
    })

    return {
      version: res.version || '1.0.0',
      buildId: res.build_id || res.version || '',
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
