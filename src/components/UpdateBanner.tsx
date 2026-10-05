import { useVersion } from '@/contexts/VersionContext'
import { Sparkles, RefreshCw, X, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UpdateBanner() {
  const {
    updateAvailable,
    latestVersion,
    secondsRemaining,
    isAtendimentoAtivo,
    applyUpdateNow,
    dismissBanner,
    bannerDismissed,
  } = useVersion()

  if (!updateAvailable || bannerDismissed) {
    return null
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full bg-gradient-to-r from-[#142758] via-[#253575] to-[#142758] text-white shadow-lg border-b-2 border-[#F18800] transition-all animate-in slide-in-from-top duration-300"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-xs">
        {/* Esquerda: Ícone + Mensagem descritiva */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="h-8 w-8 rounded-full bg-[#F18800] text-white flex items-center justify-center shrink-0 shadow-md">
            <Sparkles className="h-4 w-4 animate-spin-slow" />
          </div>

          <div className="min-w-0 flex-1 sm:flex-initial">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="font-bold tracking-tight text-white uppercase text-[11px] bg-white/10 px-2 py-0.5 rounded border border-white/20">
                Nova Versão Disponível
              </span>
              {latestVersion?.version && (
                <span className="font-mono text-[10px] text-amber-300 font-semibold">
                  v{latestVersion.version}
                </span>
              )}
            </div>
            <p className="text-slate-200 text-[11px] mt-0.5 truncate sm:max-w-xl">
              {latestVersion?.mensagem ||
                'O sistema foi atualizado com melhorias recentes. Atualize para aplicar.'}
            </p>
          </div>
        </div>

        {/* Direita: Status de proteção de atendimento e botão de ação */}
        <div className="flex items-center justify-between sm:justify-end space-x-2.5 w-full sm:w-auto shrink-0">
          {isAtendimentoAtivo ? (
            <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[11px]">
              <ShieldAlert className="h-3.5 w-3.5 text-[#F18800]" />
              <span className="font-medium">
                Atendimento em andamento: atualize manualmente ao concluir
              </span>
            </div>
          ) : secondsRemaining !== null && secondsRemaining > 0 ? (
            <span className="text-[11px] text-slate-300 font-mono hidden md:inline">
              Atualizando em <strong className="text-amber-300">{secondsRemaining}s</strong>...
            </span>
          ) : null}

          <Button
            size="sm"
            onClick={applyUpdateNow}
            className="h-8 px-3.5 bg-[#F18800] hover:bg-[#d97b00] text-white font-bold text-xs shadow-md flex items-center space-x-1.5 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5 animate-spin-slow" />
            <span>Atualizar Agora</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={dismissBanner}
            title="Dispensar aviso desta versão"
            className="h-8 px-2 text-slate-300 hover:text-white hover:bg-white/10 text-xs shrink-0 flex items-center space-x-1"
          >
            <span>Dispensar</span>
            <X className="h-3.5 w-3.5 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
