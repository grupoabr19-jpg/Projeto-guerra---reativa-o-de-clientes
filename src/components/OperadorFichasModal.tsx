import React, { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search,
  FileText,
  User,
  MapPin,
  Calendar,
  DollarSign,
  Package,
  Layers,
  PhoneCall,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Tag,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Briefcase,
  X,
  Loader2,
} from 'lucide-react'
import { formatarDataHoraBrasilia } from '@/lib/expediente'
import { fetchFichasAtendimentoPorOperador } from '@/services/api'
import type { RespostaFormulario, PeriodoAtendimentoFiltro } from '@/types'

interface OperadorDetalhesModalProps {
  isOpen: boolean
  onClose: () => void
  operador: {
    operadorId: string
    operadorNome: string
    operadorEmail?: string
    regiao: string
    role: string
  } | null
  periodo: PeriodoAtendimentoFiltro
  regiao: string
}

/**
 * Retorna estilo e label visual do desfecho conforme padrão oficial do sistema:
 * - Verde Reativado
 * - Âmbar Reagendado
 * - Rosa/Vermelho Venda Perdida
 * - Roxo Duplicado
 * - Azul Ativo Fora da Base
 */
function getDesfechoVisualBadge(desfechoRaw?: string | null) {
  const d = (desfechoRaw || '').trim().toLowerCase()

  if (d === 'reativado' || d === 'reativado_com_pedido' || d === 'fechou_pedido') {
    return {
      label: 'Reativado',
      bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
      icon: CheckCircle2,
    }
  }

  if (d === 'reagendado') {
    return {
      label: 'Reagendado',
      bgClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      icon: Clock,
    }
  }

  if (
    d === 'compra_terceiros' ||
    d === 'nao_quer_negociar' ||
    d === 'venda_perdida' ||
    d === 'sem_contato' ||
    d === 'restricao_financeira'
  ) {
    let lbl = 'Venda Perdida'
    if (d === 'compra_terceiros') lbl = 'Compra Terceiros'
    else if (d === 'nao_quer_negociar') lbl = 'Não Quer Negociar'
    else if (d === 'restricao_financeira') lbl = 'Restrição Financeira'
    else if (d === 'sem_contato') lbl = 'Sem Contato'

    return {
      label: lbl,
      bgClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      icon: XCircle,
    }
  }

  if (d === 'duplicado') {
    return {
      label: 'Registro Duplicado',
      bgClass: 'bg-purple-100 text-purple-800 border-purple-300 font-bold',
      icon: Layers,
    }
  }

  if (d === 'ativo_fora_base' || d === 'cliente_ativo') {
    return {
      label: 'Ativo Fora da Base',
      bgClass: 'bg-blue-100 text-blue-800 border-blue-300 font-bold',
      icon: ShieldCheck,
    }
  }

  if (d === 'contatado') {
    return {
      label: 'Contatado',
      bgClass: 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold',
      icon: PhoneCall,
    }
  }

  return {
    label: desfechoRaw || 'Outro',
    bgClass: 'bg-slate-100 text-slate-700 border-slate-300 font-medium',
    icon: HelpCircle,
  }
}

/**
 * Helper para extrair valor com suporte a Q_outros
 */
function getRespostaComOutros(respostas: Record<string, unknown>, chaveBase: string): string {
  const valBase = respostas[chaveBase]
  const valOutros = respostas[`${chaveBase}_outros`]

  if (valBase === undefined || valBase === null || valBase === '') {
    if (valOutros) return String(valOutros).trim()
    return '—'
  }

  const strBase = String(valBase).trim()
  if (strBase === 'Outros' || strBase === 'Outro') {
    if (valOutros) return `Outros (${String(valOutros).trim()})`
    return 'Outros'
  }

  return strBase
}

export const OperadorFichasModal: React.FC<OperadorDetalhesModalProps> = ({
  isOpen,
  onClose,
  operador,
  periodo,
  regiao,
}) => {
  const [fichas, setFichas] = useState<RespostaFormulario[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [termoBusca, setTermoBusca] = useState<string>('')

  useEffect(() => {
    if (!isOpen || !operador) {
      setFichas([])
      setTermoBusca('')
      return
    }

    let isMounted = true
    setLoading(true)

    fetchFichasAtendimentoPorOperador({
      operadorId: operador.operadorId,
      periodo,
      regiao,
    })
      .then((data) => {
        if (isMounted) {
          setFichas(data)
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar fichas do operador:', err)
        if (isMounted) setFichas([])
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, operador, periodo, regiao])

  // Filtro textual local por código ou nome do cliente
  const fichasFiltradas = useMemo(() => {
    const q = termoBusca.trim().toLowerCase()
    if (!q) return fichas

    return fichas.filter((ficha) => {
      const cli = ficha.expand?.cliente
      const resp = (ficha.respostas || {}) as Record<string, unknown>
      const codCliente = ((cli?.codigo || resp.q1 || '') as string).toLowerCase()
      const nomeCliente = ((cli?.nome || resp.q2 || '') as string).toLowerCase()

      return codCliente.includes(q) || nomeCliente.includes(q)
    })
  }, [fichas, termoBusca])

  if (!operador) return null

  const periodoLabel =
    periodo === 'hoje'
      ? 'Hoje'
      : periodo === '7dias'
        ? 'Últimos 7 dias'
        : periodo === '30dias'
          ? 'Últimos 30 dias'
          : 'Todo o Período'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50/50 border-slate-200">
        {/* Cabeçalho Institucional ABR (Azul #253575 dominante) */}
        <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-[#253575] to-[#142758] text-white space-y-2 border-b border-blue-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F18800] bg-white/10 px-2 py-0.5 rounded">
                  Ficha a Ficha do Operador
                </span>
                <Badge
                  variant="outline"
                  className="bg-white/10 text-white border-white/20 text-[10px] capitalize"
                >
                  {operador.role}
                </Badge>
              </div>

              <DialogTitle className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <User className="h-5 w-5 text-[#F18800]" />
                <span>{operador.operadorNome}</span>
              </DialogTitle>

              <DialogDescription className="text-xs text-blue-100/80 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-blue-300" />
                  <strong>Rota/Região:</strong> {operador.regiao || 'Sem Região'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-blue-300" />
                  <strong>Período:</strong> {periodoLabel}
                </span>
              </DialogDescription>
            </div>

            {/* Contador de Fichas em Destaque */}
            <div className="bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl px-4 py-2.5 text-right self-start sm:self-auto shrink-0 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-200 block">
                Fichas no período
              </span>
              <div className="text-2xl font-black text-white font-mono">
                {loading ? '…' : fichas.length}
              </div>
            </div>
          </div>

          {/* Barra de Busca Interna */}
          <div className="pt-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscar por código (ex: C001021) ou nome do cliente..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                className="h-9 pl-9 pr-8 text-xs bg-white text-slate-900 border-none shadow-inner placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#F18800]"
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => setTermoBusca('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Lista de Fichas em Acordeão */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-[#253575]" />
              <p className="text-xs font-semibold text-slate-600">
                Carregando fichas de atendimento do operador...
              </p>
            </div>
          ) : fichasFiltradas.length === 0 ? (
            <div className="py-12 bg-white rounded-xl border border-dashed border-slate-200 text-center space-y-2 p-6">
              <FileText className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                {termoBusca
                  ? 'Nenhuma ficha encontrada para esta busca'
                  : 'Nenhuma ficha registrada no período'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {termoBusca
                  ? 'Verifique se o código ou nome do cliente foi digitado corretamente.'
                  : 'Este operador não possui respostas de atendimento salvas com os filtros atuais.'}
              </p>
              {termoBusca && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTermoBusca('')}
                  className="text-xs mt-2"
                >
                  Limpar busca
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>
                  Exibindo <strong>{fichasFiltradas.length}</strong> de{' '}
                  <strong>{fichas.length}</strong> fichas
                </span>
                <span className="text-[11px] text-slate-400">
                  Mais recentes primeiro • Fuso de Brasília
                </span>
              </div>

              <Accordion type="multiple" className="space-y-2.5">
                {fichasFiltradas.map((ficha) => {
                  const respostas = (ficha.respostas || {}) as Record<string, unknown>
                  const cliente = ficha.expand?.cliente

                  const codigoCliente = cliente?.codigo || (respostas.q1 as string) || 'S/ CÓDIGO'
                  const nomeCliente =
                    cliente?.nome || (respostas.q2 as string) || 'Cliente não identificado'

                  const desfechoInfo = getDesfechoVisualBadge(ficha.desfecho)
                  const DesfechoIcon = desfechoInfo.icon

                  const isForms = Boolean(
                    respostas.importado_forms ||
                    ficha.q3_arquivo?.startsWith('http') ||
                    respostas.data_conclusao_forms,
                  )

                  const valorPotencial =
                    ficha.valor_potencial !== undefined && ficha.valor_potencial !== null
                      ? Number(ficha.valor_potencial)
                      : Number(respostas.q15) || 0

                  const volumeTon =
                    ficha.toneladas_potencial !== undefined && ficha.toneladas_potencial !== null
                      ? Number(ficha.toneladas_potencial)
                      : Number(respostas.q16_toneladas_normalizadas) || Number(respostas.q16) || 0

                  const numeroPedido =
                    (respostas.numero_pedido as string) || (respostas.pedido_numero as string) || ''

                  return (
                    <AccordionItem
                      key={ficha.id}
                      value={ficha.id}
                      className="border border-slate-200/90 rounded-xl bg-white shadow-2xs overflow-hidden transition-all data-[state=open]:border-[#253575]/40 data-[state=open]:shadow-sm"
                    >
                      {/* Cabeçalho do Acordeão */}
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/70 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2 text-left pr-2">
                          {/* Identificação Principal: Código + Nome */}
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                                {codigoCliente}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 truncate max-w-md">
                                {nomeCliente}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                              <span>
                                {formatarDataHoraBrasilia(ficha.created, { incluirHora: true })}
                              </span>
                              {cliente?.regiao && (
                                <>
                                  <span>•</span>
                                  <span>{cliente.regiao}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Badges e Destaques Financeiros */}
                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {isForms && (
                              <Badge
                                variant="outline"
                                className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-semibold"
                              >
                                Origem: Formulário Forms
                              </Badge>
                            )}

                            {/* Badge Desfecho Oficial */}
                            <Badge
                              variant="outline"
                              className={`text-[11px] flex items-center gap-1 ${desfechoInfo.bgClass}`}
                            >
                              <DesfechoIcon className="h-3 w-3 shrink-0" />
                              <span>{desfechoInfo.label}</span>
                            </Badge>

                            {/* Destaque Valor / Volume */}
                            {valorPotencial > 0 && (
                              <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded text-xs font-bold font-mono">
                                <DollarSign className="h-3 w-3 text-emerald-600" />
                                <span>
                                  {valorPotencial.toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </span>
                              </div>
                            )}

                            {volumeTon > 0 && (
                              <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 px-2 py-0.5 rounded text-xs font-bold font-mono">
                                <Package className="h-3 w-3 text-blue-600" />
                                <span>{volumeTon.toLocaleString('pt-BR')} t</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>

                      {/* Conteúdo Expandido da Ficha: Q1..Q17 em blocos temáticos */}
                      <AccordionContent className="px-4 pb-4 pt-1 bg-slate-50/40 border-t border-slate-100 text-xs">
                        <div className="space-y-4 pt-2">
                          {/* BLOCO 1: Identificação */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <Tag className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>1. Identificação do Cliente</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q1 — Código do Cliente
                                </span>
                                <span className="font-mono font-bold text-slate-800">
                                  {(respostas.q1 as string) || codigoCliente}
                                </span>
                              </div>
                              <div className="sm:col-span-2">
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q2 — Razão Social / Nome Fantasia
                                </span>
                                <span className="font-bold text-slate-900">
                                  {(respostas.q2 as string) || nomeCliente}
                                </span>
                              </div>
                              <div className="sm:col-span-3">
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q4 — Rota / Vendedor de Origem
                                </span>
                                <span className="text-slate-700">
                                  {(respostas.q4 as string) ||
                                    `${cliente?.regiao || 'Sem Região'} — Vendedor: ${cliente?.vendedor || 'Não atribuído'}`}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* BLOCO 2: Diagnóstico Comercial */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <Briefcase className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>2. Diagnóstico Comercial</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q3 — Fez Orçamento?
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    respostas.q3 === 'Sim'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                      : 'bg-slate-100 text-slate-700 border-slate-300 font-medium'
                                  }
                                >
                                  {(respostas.q3 as string) || 'Não'}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q5 — Motivo da Inatividade
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q5')}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q6 — Sensibilidade a Preço
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q6')}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q7 — Concorrência Principal
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q7')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* BLOCO 3: Qualidade & Operação */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>3. Qualidade & Operação</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q8 — Ocorrência / Histórico
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q8')}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q9 — Tipo de Falha / Erro
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q9')}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q10 — Ação Corretiva
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q10')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* BLOCO 4: Retomada & Contato */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <PhoneCall className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>4. Retomada & Contato</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q12 — Disposição para Retorno
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q12')}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q13 — Canal Preferencial
                                </span>
                                <span className="text-slate-800 font-medium">
                                  {getRespostaComOutros(respostas, 'q13')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* BLOCO 5: Valores & Métricas */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <TrendingUp className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>5. Valores & Projeção Comercial</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q15 — Valor Potencial (R$)
                                </span>
                                {valorPotencial > 0 ? (
                                  <span className="text-emerald-700 font-bold font-mono text-sm">
                                    {valorPotencial.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Não informado / Sem orçamento
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q16 — Volume Estimado
                                </span>
                                {volumeTon > 0 ? (
                                  <span className="text-blue-700 font-bold font-mono text-sm">
                                    {volumeTon.toLocaleString('pt-BR')} t
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Não informado / Sem orçamento
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Número do Pedido (se reativado)
                                </span>
                                {numeroPedido ? (
                                  <Badge className="bg-emerald-600 text-white font-mono text-xs font-bold">
                                    PED: {numeroPedido}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* BLOCO 6: Conclusão & Observações */}
                          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#253575] uppercase tracking-wider border-b border-slate-100 pb-1.5">
                              <FileCheck className="h-3.5 w-3.5 text-[#F18800]" />
                              <span>6. Conclusão & Observações</span>
                            </div>
                            <div className="pt-1 space-y-2">
                              <div>
                                <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                                  Q17 — Observações Gerais e Conclusão
                                </span>
                                <p className="text-slate-700 bg-slate-50 p-2.5 rounded-md border border-slate-200/80 whitespace-pre-wrap leading-relaxed mt-1">
                                  {(respostas.q17_obs as string) ||
                                    (respostas.q17 as string) ||
                                    (respostas.observacao as string) ||
                                    (respostas.observacoes as string) ||
                                    'Nenhuma observação registrada.'}
                                </p>
                              </div>

                              {/* Link anexo se houver */}
                              {ficha.q3_arquivo && ficha.q3_arquivo.startsWith('http') && (
                                <div className="pt-1">
                                  <a
                                    href={ficha.q3_arquivo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 underline font-medium"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>Ver anexo enviado no formulário</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </>
          )}
        </div>

        {/* Rodapé com botão de fechar */}
        <div className="p-3 bg-white border-t border-slate-200 flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs text-slate-700">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
