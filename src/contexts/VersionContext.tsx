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
}

const VersionContext = createContext<VersionContextType | undefined>(undefined)

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos
const AUTO_RELOAD_COUNTDOWN_SECONDS = 10

export function VersionProvider({ children }: { children: ReactNode }) {
  const [currentVersion] = useState<AppVersionInfo>(CLIENT_BUILD_INFO)
  const [latestVersion, setLatestVersion] = useState<AppVersionInfo | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const [isAtendimentoAtivo, setIsAtendimentoAtivoState] = useState<boolean>(false)

  const countdownTimerRef = useRef<number | null>(null)
  const pollTimerRef = useRef<number | null>(null)

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
      window.location.reload()
    } catch (_) {
      window.location.replace(window.location.pathname + window.location.search)
    }
  }, [])

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true)
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setSecondsRemaining(null)
  }, [])

  // Verifica versão
  const checkNow = useCallback(async () => {
    try {
      const latest = await checkLatestAppVersion()
      // Detecta diferença por buildId ou versão
      const isDifferent =
        (latest.buildId && latest.buildId !== currentVersion.buildId) ||
        (latest.version && latest.version !== currentVersion.version)

      if (isDifferent) {
        setLatestVersion(latest)
        setUpdateAvailable(true)
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
            // Dispara checagem imediata e reabre o banner
            checkNow()
            setBannerDismissed(false)
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
    if (!updateAvailable || bannerDismissed) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setSecondsRemaining(null)
      return
    }

    // Se estiver em atendimento ativo, NUNCA auto-recarregar!
    if (isAtendimentoAtivo) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      setSecondsRemaining(null)
      return
    }

    // Se NÃO estiver em atendimento, inicia contagem regressiva de 10s
    setSecondsRemaining(AUTO_RELOAD_COUNTDOWN_SECONDS)

    countdownTimerRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = null
          }
          // Dispara reload
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
  }, [updateAvailable, bannerDismissed, isAtendimentoAtivo, applyUpdateNow])

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
        bannerDismissed,
        checkNow,
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
