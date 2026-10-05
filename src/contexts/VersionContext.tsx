import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react'
import { CLIENT_BUILD_INFO, checkLatestAppVersion, AppVersionInfo } from '@/services/version'
import pb from '@/lib/pocketbase/client'

interface VersionContextType {
  updateAvailable: boolean
  currentVersion: AppVersionInfo
  latestVersion: AppVersionInfo | null
  secondsRemaining: number | null
  isAutoReloadActive: boolean
  isAtendimentoAtivo: boolean
  setAtendimentoAtivo: (ativo: boolean) => void
  applyUpdateNow: () => void
  dismissBanner: () => void
  bannerDismissed: boolean
  checkNow: () => Promise<void>
  versionDismissed: boolean
  dismissVersionForever: () => void
}

const VersionContext = createContext<VersionContextType | undefined>(undefined)

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos
const AUTO_RELOAD_COUNTDOWN_SECONDS = 10
const STORAGE_KEY_DISMISSED = 'guerra_app_version_dismissed'
const STORAGE_KEY_RELOAD_ATTEMPT = 'guerra_app_reload_attempt'

function getDismissedVersionIdentifier(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(STORAGE_KEY_DISMISSED)
  } catch {
    return null
  }
}

function setDismissedVersionIdentifier(id: string) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_DISMISSED, id)
    }
  } catch {
    /* ignore storage errors */
  }
}

function getReloadAttempt(id: string): number {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return 0
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY_RELOAD_ATTEMPT}_${id}`)
    return raw ? parseInt(raw, 10) || 0 : 0
  } catch {
    return 0
  }
}

function incrementReloadAttempt(id: string): number {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return 1
    const current = getReloadAttempt(id)
    const next = current + 1
    window.sessionStorage.setItem(`${STORAGE_KEY_RELOAD_ATTEMPT}_${id}`, String(next))
    return next
  } catch {
    return 1
  }
}

export function VersionProvider({ children }: { children: ReactNode }) {
  const [currentVersion] = useState<AppVersionInfo>(CLIENT_BUILD_INFO)
  const [latestVersion, setLatestVersion] = useState<AppVersionInfo | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const [isAtendimentoAtivo, setIsAtendimentoAtivoState] = useState<boolean>(false)

  const countdownTimerRef = useRef<number | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const autoReloadTriggeredRef = useRef<boolean>(false)

  // Setter seguro para atendimento ativo
  const setAtendimentoAtivo = useCallback((ativo: boolean) => {
    setIsAtendimentoAtivoState(ativo)
    try {
      if (typeof window !== 'undefined') {
        ;(window as unknown as { __ATENDIMENTO_ATIVO__?: boolean }).__ATENDIMENTO_ATIVO__ = ativo
      }
    } catch {
      /* intentionally ignored */
    }
  }, [])

  // Executa o reload seguro limpando cache
  const applyUpdateNow = useCallback(() => {
    try {
      if (latestVersion) {
        const targetId = latestVersion.buildId || latestVersion.version
        incrementReloadAttempt(targetId)
      }
      window.location.reload()
    } catch (_) {
      window.location.replace(window.location.pathname + window.location.search)
    }
  }, [latestVersion])

  // Dispensa temporária (para a sessão atual)
  const dismissBanner = useCallback(() => {
    setBannerDismissed(true)
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setSecondsRemaining(null)
    if (latestVersion) {
      const targetId = latestVersion.buildId || latestVersion.version
      if (targetId) {
        setDismissedVersionIdentifier(targetId)
      }
    }
  }, [latestVersion])

  // Dispensa permanente para a versão
  const dismissVersionForever = useCallback(() => {
    setBannerDismissed(true)
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setSecondsRemaining(null)
    if (latestVersion) {
      const targetId = latestVersion.buildId || latestVersion.version
      if (targetId) {
        setDismissedVersionIdentifier(targetId)
      }
    }
  }, [latestVersion])

  // Identificador da versão mais recente detectada
  const latestTargetId = latestVersion ? latestVersion.buildId || latestVersion.version : null
  const isVersionDismissed = Boolean(
    latestTargetId && getDismissedVersionIdentifier() === latestTargetId,
  )

  // Verifica versão
  const checkNow = useCallback(async () => {
    try {
      const latest = await checkLatestAppVersion()
      // Detecta diferença por buildId ou versão
      const isDifferent =
        (latest.buildId && latest.buildId !== currentVersion.buildId) ||
        (latest.version && latest.version !== currentVersion.version)

      if (isDifferent) {
        const targetId = latest.buildId || latest.version
        // Verifica se essa versão já foi dispensada pelo usuário
        const previouslyDismissed = getDismissedVersionIdentifier() === targetId
        // Verifica quantas vezes tentou auto-recarregar esta mesma versão sem mudar a build local
        const attempts = getReloadAttempt(targetId)

        setLatestVersion(latest)
        setUpdateAvailable(true)

        if (previouslyDismissed || attempts >= 2) {
          // Já dispensado pelo usuário ou já recarregou 2x sem o client mudar (cache de CDN/navegador).
          // Não reabre banner nem dispara contagem regressiva para não prender em loop.
          setBannerDismissed(true)
        }
      } else {
        // Se a versão atual já é igual à versão detectada, fecha o aviso
        setUpdateAvailable(false)
        setBannerDismissed(false)
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
        setSecondsRemaining(null)
      }
    } catch (err) {
      console.debug('[VersionCheck] Erro silencioso ao checar versão:', err)
    }
  }, [currentVersion.buildId, currentVersion.version])

  // 1. Polling a cada 5 minutos e ao voltar foco da aba
  useEffect(() => {
    // Checagem inicial após 3s do boot da aplicação
    const initTimer = setTimeout(() => {
      checkNow()
    }, 3000)

    pollTimerRef.current = window.setInterval(() => {
      checkNow()
    }, POLL_INTERVAL_MS)

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkNow()
      }
    }

    window.addEventListener('visibilitychange', handleVisibilityOrFocus)
    window.addEventListener('focus', handleVisibilityOrFocus)

    return () => {
      clearTimeout(initTimer)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      window.removeEventListener('focus', handleVisibilityOrFocus)
    }
  }, [checkNow])

  // 2. Real-time subscription no PocketBase para mensagens de aviso com gatilho de atualização
  useEffect(() => {
    let unsubPromise: Promise<() => void> | null = null

    try {
      unsubPromise = pb.collection('chat_mensagens').subscribe('*', (e) => {
        if (e.action === 'create' && e.record) {
          const tipo = e.record.tipo
          const texto = (e.record.texto || '').toLowerCase()
          // Verifica se é aviso ou mensagem com palavras-chave de atualização
          const isAviso = tipo === 'aviso'
          const containsUpdateKeyword =
            texto.includes('relogue') ||
            texto.includes('atualize') ||
            texto.includes('atualização') ||
            texto.includes('atualizacao') ||
            texto.includes('nova versão') ||
            texto.includes('nova versao') ||
            texto.includes('f5')

          if (isAviso && containsUpdateKeyword) {
            // Dispara checagem imediata
            checkNow()
          }
        }
      })
    } catch (err) {
      console.warn('[VersionProvider] Realtime chat não pôde ser inscrito:', err)
    }

    return () => {
      if (unsubPromise) {
        unsubPromise.then((unsub) => unsub()).catch(() => {})
      }
    }
  }, [checkNow])

  // 3. Regra de Auto-Recarregar (10s) vs Banner Manual quando em atendimento ativo
  useEffect(() => {
    if (!updateAvailable || bannerDismissed || isVersionDismissed) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setSecondsRemaining(null)
      return
    }

    // Se estiver em atendimento ativo, NUNCA auto-recarregar! Fica apenas o banner estático manual
    if (isAtendimentoAtivo) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setSecondsRemaining(null)
      return
    }

    // Proteção anti-loop: se já tentou auto-recarregar essa mesma versão nesta sessão e a página continuou
    // com a build antiga (ex: cache de browser/proxy), NUNCA dispara a contagem nem auto-recarrega de novo
    const targetId = latestVersion?.buildId || latestVersion?.version || ''
    if (targetId && getReloadAttempt(targetId) >= 1) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setSecondsRemaining(null)
      return
    }

    // Se já disparou o auto-reload nesta montagem, não inicia outro timer
    if (autoReloadTriggeredRef.current) {
      return
    }

    // Se NÃO estiver em atendimento e nunca auto-recarregou para esta versão: inicia contagem única de 10s
    setSecondsRemaining(AUTO_RELOAD_COUNTDOWN_SECONDS)

    countdownTimerRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = null
          }
          autoReloadTriggeredRef.current = true
          // Dispara reload seguro
          applyUpdateNow()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [
    updateAvailable,
    bannerDismissed,
    isVersionDismissed,
    isAtendimentoAtivo,
    latestVersion,
    applyUpdateNow,
  ])

  return (
    <VersionContext.Provider
      value={{
        updateAvailable,
        currentVersion,
        latestVersion,
        secondsRemaining,
        isAutoReloadActive:
          !isAtendimentoAtivo && secondsRemaining !== null && secondsRemaining > 0,
        isAtendimentoAtivo,
        setAtendimentoAtivo,
        applyUpdateNow,
        dismissBanner,
        bannerDismissed: bannerDismissed || isVersionDismissed,
        checkNow,
        versionDismissed: isVersionDismissed,
        dismissVersionForever,
      }}
    >
      {children}
    </VersionContext.Provider>
  )
}

export function useVersion() {
  const context = useContext(VersionContext)
  if (!context) {
    throw new Error('useVersion must be used within a VersionProvider')
  }
  return context
}
