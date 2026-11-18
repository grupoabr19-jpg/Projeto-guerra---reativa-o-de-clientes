import React, { useEffect, useState, useMemo, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Users,
  Search,
  Loader2,
  AlertCircle,
  Calendar,
  Scale,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  Download,
  CheckCircle2,
} from 'lucide-react'
import { fetchAuditoriaPeso, editarPesoAdmin } from '@/services/api'
import type { AuditoriaPesoItem } from '@/types'

// ─── Faixa plausível de R$/kg para material de construção / aço ──────────────
// Fora dessa faixa a linha aparece marcada em vermelho como "suspeita".
export const AUDITORIA_RS_KG_PISO = 1.0
export const AUDITORIA_RS_KG_TETO = 500.0

type Marcação = { tipo: 'ok' | 'suspeito' | 'peso_ausente'; texto: string }

function classificar(item: AuditoriaPesoItem): Marcação {
  const kg = Number(item.peso_kg || 0)
  const valor = Number(item.valor || 0)
  if (kg <= 0) {
    return valor > 0
      ? { tipo: 'peso_ausente', texto: 'Peso ausente' }
      : { tipo: 'ok', texto: 'Sem valor' }
  }
  const rsKg = valor / kg
  if (valor <= 0) return { tipo: 'ok', texto: 'Sem valor' }
  if (rsKg < AUDITORIA_RS_KG_PISO || rsKg > AUDITORIA_RS_KG_TETO) {
    return { tipo: 'suspeito', texto: 'Suspeito' }
  }
  return { tipo: 'ok', texto: 'OK' }
}

function rsPorKg(item: AuditoriaPesoItem): number | null {
  const kg = Number(item.peso_kg || 0)
  if (kg <= 0) return null
  return (Number(item.valor || 0) || 0) / kg
}

export function formatarKgPtBr(kg: number): string {
  const v = kg || 0
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}

function origemLabel(origem: string): string {
  switch (origem) {
    case 'esteira_erp':
      return 'ERP / esteira'
    case 'nf_erp':
      return 'NF ERP'
    case 'manual_admin':
      return 'Manual (admin)'
    case 'ausente':
      return 'Ausente'
    default:
      return origem || '—'
  }
}

export interface AuditoriaPesoModalProps {
  isOpen: boolean
  onClose: () => void
  regiao?: string
  baseCategoria?: string
  dataInicial?: string
  dataFinal?: string
  periodoDescricao?: string
  onPesoCorrigido?: (clienteId: string, kgNovo: number) => void
}

export function AuditoriaPesoModal({
  isOpen,
  onClose,
  regiao,
  baseCategoria,
  dataInicial,
  dataFinal,
  periodoDescricao,
  onPesoCorrigido,
}: AuditoriaPesoModalProps) {
  const [itens, setItens] = useState<AuditoriaPesoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [somenteSuspeitas, setSomenteSuspeitas] = useState(false)

  // Edição inline
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pesoEdicao, setPesoEdicao] = useState('')
  const [obsEdicao, setObsEdicao] = useState('')
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAuditoriaPeso({ regiao, baseCategoria, dataInicial, dataFinal })
      setItens(res.itens || [])
    } catch (err: any) {
      console.error('[AuditoriaPesoModal] Erro ao carregar auditoria:', err)
      setError(err?.message || 'Falha ao carregar auditoria de peso.')
    } finally {
      setLoading(false)
    }
  }, [regiao, baseCategoria, dataInicial, dataFinal])

  useEffect(() => {
    if (!isOpen) return
    setSomenteSuspeitas(false)
    setSearchTerm('')
    setEditandoId(null)
    carregar()
  }, [isOpen, carregar])

  const classificados = useMemo(
    () =>
      itens.map((it) => ({
        item: it,
        marcação: classificar(it),
        rsKg: rsPorKg(it),
      })),
    [itens],
  )

  const filtrados = useMemo(() => {
    let lista = classificados
    if (somenteSuspeitas) {
      lista = lista.filter(
        (c) => c.marcação.tipo === 'suspeito' || c.marcação.tipo === 'peso_ausente',
      )
    }
    const term = searchTerm.toLowerCase().trim()
    if (!term) return lista
    return lista.filter(
      (c) =>
        c.item.nome?.toLowerCase().includes(term) ||
        c.item.codigo?.toLowerCase().includes(term) ||
        c.item.operador?.toLowerCase().includes(term) ||
        c.item.regiao?.toLowerCase().includes(term),
    )
  }, [classificados, searchTerm, somenteSuspeitas])

  const totalSuspeitas = classificados.filter(
    (c) => c.marcação.tipo === 'suspeito' || c.marcação.tipo === 'peso_ausente',
  ).length

  const handleExportCsv = () => {
    const header = [
      'Cliente',
      'Código',
      'Operador Reativação',
      'Valor Faturado (R$)',
      'Peso Atual (kg)',
      'R$/kg',
      'Origem do Peso',
      'Marcação',
    ]
    const escape = (v: string | number) => {
      const s = String(v ?? '')
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const linhas = classificados.map((c) =>
      [
        c.item.nome,
        c.item.codigo,
        c.item.operador,
        (Number(c.item.valor) || 0).toFixed(2).replace('.', ','),
        (Number(c.item.peso_kg) || 0).toFixed(1).replace('.', ','),
        c.rsKg === null ? '' : c.rsKg.toFixed(2).replace('.', ','),
        origemLabel(c.item.origem),
        c.marcação.texto,
      ]
        .map(escape)
        .join(';'),
    )
    const csv = '\uFEFF' + header.join(';') + '\n' + linhas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const hoje = new Date()
    const ymd = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`
    a.download = `auditoria-peso-reativados-${ymd}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const abrirEdicao = (item: AuditoriaPesoItem) => {
    setEditandoId(item.id)
    setErroEdicao(null)
    setPesoEdicao(item.peso_kg > 0 ? String(Number(item.peso_kg.toFixed(2))).replace('.', ',') : '')
    setObsEdicao('')
  }

  const cancelarEdicao = () => {
    setEditandoId(null)
    setPesoEdicao('')
    setObsEdicao('')
    setErroEdicao(null)
  }

  const salvarEdicao = async (item: AuditoriaPesoItem) => {
    setErroEdicao(null)
    const bruto = pesoEdicao.trim()
    if (!bruto) {
      setErroEdicao('Informe o peso (em kg).')
      return
    }
    const kg = Number(bruto.replace(/\./g, '').replace(',', '.'))
    if (isNaN(kg) || kg < 0) {
      setErroEdicao('Peso inválido.')
      return
    }
    setSalvandoId(item.id)
    try {
      const res = await editarPesoAdmin({
        cliente_id: item.id,
        peso: kg,
        unidade: 'kg',
        observacao: obsEdicao.trim(),
      })
      // Atualiza a linha na lista sem recarregar a página
      setItens((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, peso_kg: res.cliente.kg_novo, origem: 'manual_admin' } : it,
        ),
      )
      if (onPesoCorrigido) onPesoCorrigido(item.id, res.cliente.kg_novo)
      cancelarEdicao()
    } catch (err: any) {
      setErroEdicao(err?.message || 'Falha ao salvar o peso.')
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        {/* Header no padrão Grupo ABR: Azul dominante #253575 */}
        <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-[#253575] via-[#1e2b5e] to-[#142758] text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1 rounded-md bg-white/10 text-white">
                  <Scale className="h-4 w-4" />
                </span>
                <DialogTitle className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Auditoria de Peso — Reativados
                </DialogTitle>
                {totalSuspeitas > 0 && (
                  <Badge className="bg-rose-500 hover:bg-rose-500 text-white font-mono text-xs px-2 py-0.5 border-0">
                    ⚠️ {totalSuspeitas} suspeita{totalSuspeitas > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-blue-100/80 flex items-center gap-3 flex-wrap">
                <span>Conferência contra o ERP — mesmo período do Dashboard</span>
                {periodoDescricao && (
                  <span className="flex items-center gap-1 font-mono text-blue-200">
                    <Calendar className="h-3 w-3" />
                    {periodoDescricao}
                  </span>
                )}
              </DialogDescription>
            </div>
            <Badge className="bg-[#F18800] text-white hover:bg-[#d97706] font-mono text-xs px-2 py-0.5 border-0 shrink-0">
              {loading ? '...' : `${itens.length} clientes`}
            </Badge>
          </div>
        </DialogHeader>

        {/* Barra de ações */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por nome, código ou operador..."
              className="h-8 pl-8 text-xs bg-white border-slate-200 rounded-md focus-visible:ring-[#253575]"
            />
          </div>
          <Button
            size="sm"
            variant={somenteSuspeitas ? 'default' : 'outline'}
            onClick={() => setSomenteSuspeitas((v) => !v)}
            className={`h-8 text-xs ${
              somenteSuspeitas ? 'bg-rose-600 hover:bg-rose-600 text-white' : 'border-slate-300'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Somente suspeitas
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="h-8 text-xs border-slate-300"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={carregar}
            className="h-8 text-xs text-slate-500 hover:text-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap ml-auto hidden md:block">
            Faixa plausível: R$ {AUDITORIA_RS_KG_PISO.toFixed(2)}–R${' '}
            {AUDITORIA_RS_KG_TETO.toFixed(2)}/kg
          </span>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto min-h-[260px] p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-[#253575]" />
              <p className="text-xs font-medium">Carregando auditoria...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-600 gap-3 px-4">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <p className="text-xs text-rose-600 font-semibold text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={carregar} className="h-7 text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                Tentar novamente
              </Button>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2 p-6 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-300" />
              <p className="text-sm font-semibold text-slate-600">
                {somenteSuspeitas
                  ? 'Nenhuma linha suspeita no período'
                  : 'Nenhum cliente reativado com faturamento no período'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                {somenteSuspeitas
                  ? 'Todos os pesos estão dentro da faixa plausível de R$/kg.'
                  : 'Abra o Dashboard no período desejado para auditar os reativados.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider z-10">
                  <tr>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Operador</th>
                    <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                    <th className="py-2.5 px-3 text-right">Peso (kg)</th>
                    <th className="py-2.5 px-3 text-right">R$/kg</th>
                    <th className="py-2.5 px-3">Origem do Peso</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrados.map(({ item, marcação, rsKg }) => {
                    const suspeito = marcação.tipo === 'suspeito'
                    const pesoAusente = marcação.tipo === 'peso_ausente'
                    const destacado = suspeito || pesoAusente
                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          className={`transition-colors group ${
                            destacado ? 'bg-rose-50/70 hover:bg-rose-100/70' : 'hover:bg-blue-50/60'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div
                              className={`font-semibold line-clamp-1 ${
                                destacado ? 'text-rose-900' : 'text-slate-900'
                              }`}
                            >
                              {item.nome}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Cód: {item.codigo || '—'} • {item.regiao || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {item.operador || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                            {(Number(item.valor) || 0) > 0
                              ? `R$ ${(Number(item.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            <span
                              className={pesoAusente ? 'text-rose-600 font-bold' : 'text-slate-700'}
                            >
                              {item.peso_kg > 0 ? formatarKgPtBr(item.peso_kg) : '0 kg'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            <span
                              className={suspeito ? 'text-rose-600 font-bold' : 'text-slate-700'}
                            >
                              {rsKg === null
                                ? '—'
                                : `R$ ${rsKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {origemLabel(item.origem)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {suspeito ? (
                              <Badge className="bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-100 text-[10px] font-semibold px-2 py-0.5">
                                ⚠️ Suspeito
                              </Badge>
                            ) : pesoAusente ? (
                              <Badge className="bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100 text-[10px] font-semibold px-2 py-0.5">
                                Peso ausente
                              </Badge>
                            ) : marcação.tipo === 'ok' ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-[10px] font-medium px-2 py-0.5">
                                <CheckCircle2 className="h-3 w-3 mr-1 inline" />
                                OK
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                Sem valor
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {editandoId === item.id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelarEdicao}
                                className="h-6 text-[10px] text-slate-500"
                              >
                                Cancelar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => abrirEdicao(item)}
                                className="h-6 w-6 p-0 text-slate-400 hover:text-[#253575] hover:bg-blue-100/60"
                                title="Editar peso (conferido no ERP)"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                        {editandoId === item.id && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={8} className="py-3 px-4">
                              <div className="flex flex-wrap items-start gap-3">
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                                    Novo peso (kg)
                                  </label>
                                  <Input
                                    value={pesoEdicao}
                                    onChange={(e) => setPesoEdicao(e.target.value)}
                                    placeholder="Ex.: 13,85"
                                    inputMode="decimal"
                                    className="h-8 w-36 text-xs font-mono bg-white border-slate-200"
                                  />
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                  <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                                    Observação (ex.: confirmação no ERP)
                                  </label>
                                  <Textarea
                                    value={obsEdicao}
                                    onChange={(e) => setObsEdicao(e.target.value)}
                                    placeholder="Ex.: conferido no ERP, NF 389041 — valor gravado como tonelada"
                                    rows={2}
                                    className="text-xs bg-white border-slate-200 min-h-[32px]"
                                  />
                                </div>
                                <div className="flex items-center gap-2 self-end">
                                  <Button
                                    size="sm"
                                    onClick={() => salvarEdicao(item)}
                                    disabled={salvandoId === item.id}
                                    className="h-8 text-xs bg-[#F18800] hover:bg-[#d97706] text-white font-semibold"
                                  >
                                    {salvandoId === item.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    )}
                                    Salvar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelarEdicao}
                                    className="h-8 text-xs border-slate-300"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                              {erroEdicao && (
                                <p className="text-[11px] text-rose-600 font-medium mt-2">
                                  {erroEdicao}
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400 mt-2">
                                Grava em kg canônico (clientes.toneladas_historico) com auditoria em
                                eventos_log. A esteira do ERP continua vencendo em faturamentos
                                futuros.
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
            Exibindo <strong className="font-mono text-slate-700">{filtrados.length}</strong> de{' '}
            <strong className="font-mono text-slate-700">{itens.length}</strong> clientes •{' '}
            {totalSuspeitas} suspeita{totalSuspeitas === 1 ? '' : 's'}
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
