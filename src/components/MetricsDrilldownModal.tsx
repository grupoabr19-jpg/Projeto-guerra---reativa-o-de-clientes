import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users,
  Search,
  ExternalLink,
  Loader2,
  AlertCircle,
  Calendar,
  MapPin,
  TrendingUp,
  Scale,
  RefreshCw,
} from 'lucide-react'
import { fetchMetricsDrilldown } from '@/services/api'
import type { MetricsDrilldownItem } from '@/types'

export interface MetricsDrilldownModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  tipo: string
  regiao?: string
  baseCategoria?: string
  dataInicial?: string
  dataFinal?: string
  desfecho?: string
  canal?: string
  periodoDescricao?: string
}

export function formatarPesoPtBr(pesoEmKg: number): string {
  const kg = pesoEmKg || 0
  if (kg === 0) return '0,0 kg'
  if (kg >= 1000) {
    const t = kg / 1000
    return `${t.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`
  }
  return `${kg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}

export function formatarMoedaPtBr(valor: number): string {
  return `R$ ${(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatarDesfechoAmigavel(desfecho: string): {
  label: string
  variant: 'default' | 'outline' | 'secondary' | 'destructive'
} {
  const d = (desfecho || '').toLowerCase().trim()
  switch (d) {
    case 'reativado':
    case 'reativado_com_pedido':
    case 'fechou_pedido':
      return { label: 'Reativado c/ Pedido', variant: 'default' }
    case 'pedido_em_aberto':
      return { label: 'Pedido Aberto', variant: 'secondary' }
    case 'faturamento_cruzamento':
      return { label: 'Cruzamento ERP', variant: 'outline' }
    case 'reagendado':
      return { label: 'Reagendado', variant: 'outline' }
    case 'compra_terceiros':
      return { label: 'Compra Terceiros', variant: 'destructive' }
    case 'nao_quer_negociar':
      return { label: 'Não Quer Negociar', variant: 'destructive' }
    case 'restricao_financeira':
      return { label: 'Restrição Financeira', variant: 'destructive' }
    case 'sem_contato':
      return { label: 'Sem Contato', variant: 'secondary' }
    case 'contatado':
      return { label: 'Contatado', variant: 'outline' }
    case 'na_base':
      return { label: 'Na Base', variant: 'secondary' }
    case 'reservado':
      return { label: 'Reservado', variant: 'secondary' }
    case 'ativo_fora_base':
      return { label: 'Ativo Fora Base', variant: 'outline' }
    default:
      return { label: desfecho || '—', variant: 'outline' }
  }
}

export function MetricsDrilldownModal({
  isOpen,
  onClose,
  title,
  subtitle,
  tipo,
  regiao,
  baseCategoria,
  dataInicial,
  dataFinal,
  desfecho,
  canal,
  periodoDescricao,
}: MetricsDrilldownModalProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<MetricsDrilldownItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!isOpen || !tipo) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setSearchTerm('')

    fetchMetricsDrilldown({
      tipo,
      regiao,
      baseCategoria,
      dataInicial,
      dataFinal,
      desfecho,
      canal,
    })
      .then((res) => {
        if (!cancelled) {
          setItems(res.items || [])
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error('[MetricsDrilldownModal] Erro ao carregar drilldown:', err)
          setError(err?.message || 'Falha ao carregar lista de clientes.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, tipo, regiao, baseCategoria, dataInicial, dataFinal, desfecho, canal])

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items
    const term = searchTerm.toLowerCase().trim()
    return items.filter(
      (it) =>
        (it.nome && it.nome.toLowerCase().includes(term)) ||
        (it.codigo && it.codigo.toLowerCase().includes(term)) ||
        (it.operador && it.operador.toLowerCase().includes(term)) ||
        (it.regiao && it.regiao.toLowerCase().includes(term)) ||
        (it.numero_pedido && it.numero_pedido.toLowerCase().includes(term)),
    )
  }, [items, searchTerm])

  const totals = useMemo(() => {
    let valorTotal = 0
    let pesoTotalKg = 0
    for (const it of filteredItems) {
      valorTotal += Number(it.valor || 0)
      pesoTotalKg += Number(it.toneladas || 0)
    }
    return {
      count: filteredItems.length,
      valorTotal,
      pesoTotalKg,
    }
  }, [filteredItems])

  const handleOpenCliente = (clienteId: string) => {
    if (!clienteId) return
    onClose()
    navigate(`/atendimento/${clienteId}`)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        {/* Header no padrão Grupo ABR: Azul dominante #253575 */}
        <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-[#253575] via-[#1e2b5e] to-[#142758] text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1 rounded-md bg-white/10 text-white">
                  <Users className="h-4 w-4" />
                </span>
                <DialogTitle className="text-lg sm:text-xl font-black tracking-tight text-white">
                  {title}
                </DialogTitle>
                <Badge className="bg-[#F18800] text-white hover:bg-[#d97706] font-mono text-xs px-2 py-0.5 border-0">
                  {loading
                    ? '...'
                    : `${items.length} ${items.length === 1 ? 'cliente' : 'clientes'}`}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-blue-100/80 flex items-center gap-3 flex-wrap">
                {subtitle && <span>{subtitle}</span>}
                {periodoDescricao && (
                  <span className="flex items-center gap-1 font-mono text-blue-200">
                    <Calendar className="h-3 w-3" />
                    {periodoDescricao}
                  </span>
                )}
                {regiao && regiao !== 'todas' && (
                  <span className="flex items-center gap-1 text-blue-200">
                    <MapPin className="h-3 w-3" />
                    Região: {regiao}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>

          {/* Resumo rápido no cabeçalho quando houver dados com valor ou volume */}
          {!loading && items.length > 0 && (totals.valorTotal > 0 || totals.pesoTotalKg > 0) && (
            <div className="mt-3 pt-3 border-t border-white/15 flex items-center gap-4 text-xs">
              {totals.valorTotal > 0 && (
                <div className="flex items-center gap-1.5 text-emerald-300">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-blue-100/70">Total Faturado/Orçado:</span>
                  <span className="font-bold font-mono">
                    {formatarMoedaPtBr(totals.valorTotal)}
                  </span>
                </div>
              )}
              {totals.pesoTotalKg > 0 && (
                <div className="flex items-center gap-1.5 text-amber-300">
                  <Scale className="h-3.5 w-3.5" />
                  <span className="text-blue-100/70">Volume Total:</span>
                  <span className="font-bold font-mono">
                    {formatarPesoPtBr(totals.pesoTotalKg)}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Barra de Busca rápida */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por nome, código ou operador..."
              className="h-8 pl-8 text-xs bg-white border-slate-200 rounded-md focus-visible:ring-[#253575]"
            />
          </div>
          <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
            Clique na linha para abrir a ficha de atendimento
          </span>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto min-h-[260px] p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-[#253575]" />
              <p className="text-xs font-medium">Carregando lista de clientes...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-600 gap-3 px-4">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <p className="text-xs text-rose-600 font-semibold text-center">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  setLoading(true)
                  fetchMetricsDrilldown({
                    tipo,
                    regiao,
                    baseCategoria,
                    dataInicial,
                    dataFinal,
                    desfecho,
                    canal,
                  })
                    .then((res) => setItems(res.items || []))
                    .catch((e: any) => setError(e?.message || 'Erro ao carregar'))
                    .finally(() => setLoading(false))
                }}
                className="h-7 text-xs border-slate-300"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Tentar novamente
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2 p-6 text-center">
              <Users className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Nenhum cliente encontrado</p>
              <p className="text-xs text-slate-400 max-w-sm">
                {searchTerm
                  ? 'Nenhum resultado corresponde ao filtro digitado.'
                  : 'Nenhum cliente cadastrado ou registrado com os critérios e período selecionados.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider z-10">
                  <tr>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Região</th>
                    <th className="py-2.5 px-3">Operador</th>
                    <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                    <th className="py-2.5 px-3 text-right">Volume</th>
                    <th className="py-2.5 px-3">Desfecho / Status</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const desfechoInfo = formatarDesfechoAmigavel(item.desfecho || item.estado)
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenCliente(item.id)}
                        className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 group-hover:text-[#253575] line-clamp-1">
                            {item.nome}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Cód: {item.codigo || '—'}
                            {item.numero_pedido && ` • Pedido: ${item.numero_pedido}`}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {item.regiao || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                          {item.operador || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                          {item.valor > 0 ? formatarMoedaPtBr(item.valor) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                          {item.toneladas > 0 ? formatarPesoPtBr(item.toneladas) : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge
                            variant={desfechoInfo.variant}
                            className={`text-[10px] font-medium px-2 py-0.5 ${
                              desfechoInfo.variant === 'default'
                                ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                                : desfechoInfo.variant === 'secondary'
                                  ? 'bg-amber-100 text-amber-900 border-amber-200'
                                  : ''
                            }`}
                          >
                            {desfechoInfo.label}
                          </Badge>
                          {item.canal && (
                            <span className="text-[10px] text-slate-400 ml-1.5 capitalize">
                              via {item.canal}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenCliente(item.id)
                            }}
                            className="h-6 w-6 p-0 text-slate-400 hover:text-[#253575] hover:bg-blue-100/60"
                            title="Abrir ficha de atendimento"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Exibindo <strong className="font-mono text-slate-700">{filteredItems.length}</strong> de{' '}
            <strong className="font-mono text-slate-700">{items.length}</strong> clientes
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="h-7 text-xs border-slate-300 text-slate-700"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
