import React, { useState, useEffect } from 'react'
import {
  Trophy,
  Medal,
  Crown,
  Flame,
  Star,
  Award,
  Calendar,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Edit2,
  CheckCircle2,
  Clock,
  TrendingUp,
  Target,
  Gift,
  Shield,
  Layers,
  PhoneCall,
  UserCheck,
  ChevronRight,
  Info,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { TODAS_REGIOES_FILTRO } from '@/types'
import type {
  TituloCatalogo,
  ConcursoSazonal,
  RankingUserRow,
  PesosGamificacao,
  TituloNivel,
} from '@/types'
import {
  calculateRankingData,
  createConcursoSazonal,
  updateConcursoSazonal,
} from '@/services/gamificacao'

export function RankingPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [periodo, setPeriodo] = useState<'hoje' | '7dias' | '30dias' | 'total'>('total')
  const [regiaoFiltro, setRegiaoFiltro] = useState<string>('todas')
  const [buscaNome, setBuscaNome] = useState('')
  const [loading, setLoading] = useState(true)

  const [rankingRows, setRankingRows] = useState<RankingUserRow[]>([])
  const [currentUserRow, setCurrentUserRow] = useState<RankingUserRow | undefined>()
  const [catalogoTitulos, setCatalogoTitulos] = useState<TituloCatalogo[]>([])
  const [concursos, setConcursos] = useState<ConcursoSazonal[]>([])
  const [pesos, setPesos] = useState<PesosGamificacao | null>(null)

  // Modais
  const [modalNovoConcursoOpen, setModalNovoConcursoOpen] = useState(false)
  const [modalCatalogoOpen, setModalCatalogoOpen] = useState(false)
  const [concursoParaEncerrar, setConcursoParaEncerrar] = useState<ConcursoSazonal | null>(null)
  const [selectedUserModal, setSelectedUserModal] = useState<RankingUserRow | null>(null)

  // Formulário de Concurso Sazonal
  const [novoConcurso, setNovoConcurso] = useState<{
    titulo: string
    descricao: string
    data_inicio: string
    data_fim: string
    metrica_tipo: 'conversoes' | 'toneladas' | 'atendimentos' | 'pontos'
    meta_quantidade: number
    premio_descricao: string
    badge_exclusiva_nome: string
    badge_exclusiva_emoji: string
  }>({
    titulo: '',
    descricao: '',
    data_inicio: new Date().toISOString().slice(0, 10),
    data_fim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    metrica_tipo: 'conversoes',
    meta_quantidade: 10,
    premio_descricao: '',
    badge_exclusiva_nome: '',
    badge_exclusiva_emoji: '🎖️',
  })
  const [salvandoConcurso, setSalvandoConcurso] = useState(false)

  // Filtro de nível no catálogo de títulos
  const [filtroNivelCatalogo, setFiltroNivelCatalogo] = useState<string>('todos')

  useEffect(() => {
    loadData()
  }, [periodo, regiaoFiltro])

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await calculateRankingData({
        periodo,
        regiao: regiaoFiltro,
        currentUserId: user?.id,
      })
      setRankingRows(data.ranking)
      setCurrentUserRow(data.currentUserRow)
      setCatalogoTitulos(data.catalogoTitulos)
      setConcursos(data.concursos)
      setPesos(data.pesos)
    } catch (err) {
      console.error('Erro ao calcular ranking:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtrar busca por nome
  const rowsFiltradas = rankingRows.filter((r) => {
    if (!buscaNome.trim()) return true
    const term = buscaNome.toLowerCase()
    return (
      r.usuario.name?.toLowerCase().includes(term) ||
      r.usuario.email?.toLowerCase().includes(term) ||
      r.tituloAtual.nome.toLowerCase().includes(term)
    )
  })

  // Top 3 do pódio
  const top1 = rankingRows[0]
  const top2 = rankingRows[1]
  const top3 = rankingRows[2]

  const getNivelBadgeClass = (nivel: TituloNivel) => {
    switch (nivel) {
      case 'diamante':
        return 'bg-blue-600 text-white border-blue-400 shadow-sm'
      case 'platina':
        return 'bg-cyan-600 text-white border-cyan-400'
      case 'ouro':
        return 'bg-amber-500 text-slate-950 font-bold border-amber-300'
      case 'prata':
        return 'bg-slate-300 text-slate-800 border-slate-400'
      case 'bronze':
      default:
        return 'bg-amber-800 text-amber-100 border-amber-700'
    }
  }

  const getNivelBorderCard = (nivel: TituloNivel) => {
    switch (nivel) {
      case 'diamante':
        return 'border-blue-500/40 bg-gradient-to-b from-blue-50/50 to-white'
      case 'platina':
        return 'border-cyan-500/40 bg-gradient-to-b from-cyan-50/50 to-white'
      case 'ouro':
        return 'border-amber-400/50 bg-gradient-to-b from-amber-50/60 to-white'
      case 'prata':
        return 'border-slate-300 bg-slate-50/40'
      case 'bronze':
      default:
        return 'border-amber-700/20 bg-white'
    }
  }

  const handleCreateConcurso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoConcurso.titulo || !novoConcurso.premio_descricao) return

    setSalvandoConcurso(true)
    try {
      await createConcursoSazonal({
        titulo: novoConcurso.titulo,
        descricao: novoConcurso.descricao,
        data_inicio: new Date(novoConcurso.data_inicio).toISOString(),
        data_fim: new Date(novoConcurso.data_fim).toISOString(),
        metrica_tipo: novoConcurso.metrica_tipo,
        meta_quantidade: Number(novoConcurso.meta_quantidade),
        premio_descricao: novoConcurso.premio_descricao,
        badge_exclusiva_nome: novoConcurso.badge_exclusiva_nome || 'Distinção Especial',
        badge_exclusiva_emoji: novoConcurso.badge_exclusiva_emoji || '🎖️',
        status: 'ativo',
        criado_por: user?.id,
      })
      setModalNovoConcursoOpen(false)
      setNovoConcurso({
        titulo: '',
        descricao: '',
        data_inicio: new Date().toISOString().slice(0, 10),
        data_fim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        metrica_tipo: 'conversoes',
        meta_quantidade: 10,
        premio_descricao: '',
        badge_exclusiva_nome: '',
        badge_exclusiva_emoji: '🎖️',
      })
      loadData()
      toast({
        title: 'Concurso publicado',
        description: 'Concurso sazonal publicado com sucesso!',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar concurso'
      toast({
        variant: 'destructive',
        title: 'Erro ao criar concurso',
        description: msg,
      })
    } finally {
      setSalvandoConcurso(false)
    }
  }

  const handleConfirmEncerrarConcurso = async () => {
    if (!isAdmin || !concursoParaEncerrar) return
    const concurso = concursoParaEncerrar

    try {
      // Determinar o usuário com melhor desempenho no concurso
      const sortedRows = [...rankingRows].sort((a, b) => {
        if (concurso.metrica_tipo === 'conversoes') return b.conversoes - a.conversoes
        if (concurso.metrica_tipo === 'toneladas') return b.toneladas - a.toneladas
        if (concurso.metrica_tipo === 'atendimentos') return b.atendimentos - a.atendimentos
        return b.pontos - a.pontos
      })
      const winner = sortedRows[0]

      await updateConcursoSazonal(concurso.id, {
        status: 'encerrado',
        vencedor: winner?.usuario?.id,
        resultado_vencedor: winner
          ? `${winner.usuario.name} (${
              concurso.metrica_tipo === 'conversoes'
                ? `${winner.conversoes} reativações`
                : concurso.metrica_tipo === 'toneladas'
                  ? `${winner.toneladas}t`
                  : `${winner.pontos} pts`
            })`
          : 'Sem participantes',
      })
      toast({
        title: 'Concurso encerrado!',
        description: `Vencedor consagrado: ${winner?.usuario?.name || '—'}`,
      })
      setConcursoParaEncerrar(null)
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao encerrar concurso'
      toast({
        variant: 'destructive',
        title: 'Erro ao encerrar concurso',
        description: msg,
      })
    }
  }

  // Filtrar catálogo de títulos
  const titulosCatalogoFiltrados = catalogoTitulos.filter((t) => {
    if (filtroNivelCatalogo === 'todos') return true
    return t.nivel === filtroNivelCatalogo
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header com Banner e Destaque Pessoal */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Trophy className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Ranking & Gamificação da Guerra
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-amber-300 bg-amber-50 text-amber-800"
            >
              100 Títulos
            </Badge>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Acompanhe o placar geral, títulos conquistados por pontuação em reativações reais e os
            concursos sazonais da diretoria.
          </p>
        </div>

        {/* Minha Posição Resumida (Destaque do Operador logado) */}
        {currentUserRow && (
          <div className="flex items-center space-x-3 bg-gradient-to-r from-slate-900 to-blue-950 text-white p-3 px-4 rounded-xl shadow-md border border-slate-800">
            <div className="text-center pr-3 border-r border-slate-700/80">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-mono">
                Sua Posição
              </span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                #{currentUserRow.posicao}
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center space-x-1.5">
                <span className="text-base">{currentUserRow.tituloAtual.emoji}</span>
                <span className="text-xs font-bold truncate max-w-[180px]">
                  {currentUserRow.tituloAtual.nome}
                </span>
                <Badge
                  className={`text-[9px] px-1.5 py-0 uppercase ${getNivelBadgeClass(
                    currentUserRow.tituloAtual.nivel,
                  )}`}
                >
                  {currentUserRow.tituloAtual.nivel}
                </Badge>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-slate-300 font-mono">
                <span className="text-amber-300 font-bold">
                  {currentUserRow.pontos.toLocaleString('pt-BR')} pts
                </span>
                <span>• {currentUserRow.conversoes} reativações</span>
              </div>
              {currentUserRow.proximoTitulo && (
                <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                  <span>Próximo: {currentUserRow.proximoTitulo.nome}</span>
                  <span className="text-cyan-400 font-mono font-semibold">
                    ({currentUserRow.progressoProximoPerc}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Barra de Filtros e Controles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Período */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(
              [
                ['hoje', 'Hoje'],
                ['7dias', '7 Dias'],
                ['30dias', '30 Dias'],
                ['total', 'Tempo Integral'],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  periodo === p
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filtro por Região */}
          <Select value={regiaoFiltro} onValueChange={setRegiaoFiltro}>
            <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
              <SelectValue placeholder="Todas as Regiões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as 8 Regiões</SelectItem>
              {TODAS_REGIOES_FILTRO.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Busca por Operador */}
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar operador ou título..."
              value={buscaNome}
              onChange={(e) => setBuscaNome(e.target.value)}
              className="h-8 pl-8 text-xs bg-slate-50 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Botão Ver Catálogo Completo dos 100 Títulos */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalCatalogoOpen(true)}
            className="h-8 text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
          >
            <Award className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
            Catálogo de 100 Títulos
          </Button>

          {/* Botão Novo Concurso Sazonal (ADMIN ONLY) */}
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setModalNovoConcursoOpen(true)}
              className="h-8 text-xs bg-[#F18800] hover:bg-[#d97b00] text-white font-semibold shadow-xs shadow-[#F18800]/25"
            >
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
              Ver Prêmios do Mês
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 px-2 text-slate-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* PÓDIO — TOP 3 COLABORADORES */}
      {rankingRows.length >= 3 && !buscaNome && regiaoFiltro === 'todas' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
          {/* 2º LUGAR — PRATA */}
          <Card
            className={`border-slate-300 order-2 md:order-1 relative overflow-hidden shadow-sm transition-all hover:shadow-md ${
              top2.isCurrentUser ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-slate-400" />
            <CardContent className="p-5 text-center space-y-3">
              <div className="relative inline-block mx-auto">
                <div className="h-16 w-16 rounded-full bg-slate-200 border-2 border-slate-400 flex items-center justify-center font-bold text-lg text-slate-700 mx-auto shadow-inner">
                  {top2.usuario.name ? top2.usuario.name.slice(0, 2).toUpperCase() : 'US'}
                </div>
                <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-slate-400 text-white font-black text-xs flex items-center justify-center shadow-md">
                  2º
                </div>
              </div>

              <div>
                <h3 className="font-bold text-sm text-slate-900 truncate">
                  {top2.usuario.name || top2.usuario.email}
                  {top2.isCurrentUser && <span className="text-blue-600 ml-1 text-xs">(Você)</span>}
                </h3>
                <div className="flex items-center justify-center space-x-1 mt-1">
                  <span>{top2.tituloAtual.emoji}</span>
                  <span className="text-xs font-semibold text-slate-700 truncate max-w-[170px]">
                    {top2.tituloAtual.nome}
                  </span>
                </div>
                <Badge
                  className={`mt-1 text-[9px] px-1.5 py-0 uppercase ${getNivelBadgeClass(
                    top2.tituloAtual.nivel,
                  )}`}
                >
                  {top2.tituloAtual.nivel}
                </Badge>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-around text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Pontos</span>
                  <span className="font-black text-slate-800 text-sm">
                    {top2.pontos.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Reativados</span>
                  <span className="font-bold text-emerald-600 text-sm">{top2.conversoes}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Ligações</span>
                  <span className="font-medium text-slate-600 text-sm">{top2.atendimentos}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 1º LUGAR — OURO (DESTAQUE CENTRAL) */}
          <Card
            className={`border-amber-400/80 order-1 md:order-2 relative overflow-hidden shadow-lg transition-all hover:shadow-xl bg-gradient-to-b from-amber-50/40 via-white to-white md:-translate-y-2 ${
              top1.isCurrentUser ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500" />
            <div className="absolute top-2 right-3">
              <Crown className="h-6 w-6 text-amber-500 animate-bounce" />
            </div>

            <CardContent className="p-6 text-center space-y-3.5">
              <div className="relative inline-block mx-auto">
                <div className="h-20 w-20 rounded-full bg-amber-100 border-3 border-amber-400 flex items-center justify-center font-black text-xl text-amber-900 mx-auto shadow-md">
                  {top1.usuario.name ? top1.usuario.name.slice(0, 2).toUpperCase() : 'US'}
                </div>
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-sm flex items-center justify-center shadow-lg border border-amber-200">
                  1º
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full inline-block mb-1">
                  Líder da Classificação
                </span>
                <h3 className="font-black text-base text-slate-900 truncate">
                  {top1.usuario.name || top1.usuario.email}
                  {top1.isCurrentUser && <span className="text-blue-600 ml-1 text-xs">(Você)</span>}
                </h3>
                <div className="flex items-center justify-center space-x-1.5 mt-1">
                  <span className="text-lg">{top1.tituloAtual.emoji}</span>
                  <span className="text-sm font-bold text-slate-800">{top1.tituloAtual.nome}</span>
                </div>
                <Badge
                  className={`mt-1 text-[10px] px-2 py-0.5 uppercase ${getNivelBadgeClass(
                    top1.tituloAtual.nivel,
                  )}`}
                >
                  {top1.tituloAtual.nivel}
                </Badge>
              </div>

              <div className="pt-3 border-t border-amber-100 flex justify-around text-xs font-mono">
                <div>
                  <span className="text-[10px] text-amber-800/80 block uppercase font-sans font-bold">
                    Pontos
                  </span>
                  <span className="font-black text-amber-950 text-base">
                    {top1.pontos.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-800/80 block uppercase font-sans font-bold">
                    Reativados
                  </span>
                  <span className="font-black text-emerald-600 text-base">{top1.conversoes}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">
                    Toneladas
                  </span>
                  <span className="font-bold text-slate-700 text-base">{top1.toneladas}t</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3º LUGAR — BRONZE */}
          <Card
            className={`border-amber-800/30 order-3 relative overflow-hidden shadow-sm transition-all hover:shadow-md ${
              top3.isCurrentUser ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-amber-800" />
            <CardContent className="p-5 text-center space-y-3">
              <div className="relative inline-block mx-auto">
                <div className="h-16 w-16 rounded-full bg-amber-100/60 border-2 border-amber-700 flex items-center justify-center font-bold text-lg text-amber-900 mx-auto shadow-inner">
                  {top3.usuario.name ? top3.usuario.name.slice(0, 2).toUpperCase() : 'US'}
                </div>
                <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-amber-800 text-amber-100 font-black text-xs flex items-center justify-center shadow-md">
                  3º
                </div>
              </div>

              <div>
                <h3 className="font-bold text-sm text-slate-900 truncate">
                  {top3.usuario.name || top3.usuario.email}
                  {top3.isCurrentUser && <span className="text-blue-600 ml-1 text-xs">(Você)</span>}
                </h3>
                <div className="flex items-center justify-center space-x-1 mt-1">
                  <span>{top3.tituloAtual.emoji}</span>
                  <span className="text-xs font-semibold text-slate-700 truncate max-w-[170px]">
                    {top3.tituloAtual.nome}
                  </span>
                </div>
                <Badge
                  className={`mt-1 text-[9px] px-1.5 py-0 uppercase ${getNivelBadgeClass(
                    top3.tituloAtual.nivel,
                  )}`}
                >
                  {top3.tituloAtual.nivel}
                </Badge>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-around text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Pontos</span>
                  <span className="font-black text-slate-800 text-sm">
                    {top3.pontos.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Reativados</span>
                  <span className="font-bold text-emerald-600 text-sm">{top3.conversoes}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Ligações</span>
                  <span className="font-medium text-slate-600 text-sm">{top3.atendimentos}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABAS PRINCIPAIS: TABELA CLASSIFICADA & CONCURSOS SAZONAIS */}
      <Tabs defaultValue="tabela" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="tabela" className="text-xs font-semibold flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-600" />
            <span>Classificação Geral ({rowsFiltradas.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="concursos"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <Gift className="h-3.5 w-3.5 text-blue-600" />
            <span>Concursos Sazonais ({concursos.length})</span>
            {concursos.some((c) => c.status === 'ativo') && (
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="regras" className="text-xs font-semibold flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-slate-500" />
            <span>Como Funciona a Pontuação</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TABELA CLASSIFICADA */}
        <TabsContent value="tabela" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Tabela de Classificação dos Guerreiros
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Pontuação acumulada de acordo com as ações reais registradas no período
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono text-slate-600">
                  Período:{' '}
                  {periodo === 'hoje'
                    ? 'Hoje'
                    : periodo === '7dias'
                      ? 'Últimos 7 dias'
                      : periodo === '30dias'
                        ? 'Últimos 30 dias'
                        : 'Tempo Integral'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <RefreshCw className="h-5 w-5 mx-auto animate-spin text-blue-600" />
                  <p>Calculando ranking em tempo real...</p>
                </div>
              ) : rowsFiltradas.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Nenhum colaborador encontrado com os filtros aplicados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        <th className="py-3 px-3 text-center w-12">#</th>
                        <th className="py-3 px-4">Guerreiro / Usuário</th>
                        <th className="py-3 px-3">Título & Badge Atual</th>
                        <th className="py-3 px-3 text-right">Pontos</th>
                        <th className="py-3 px-3 text-center">Reativações</th>
                        <th className="py-3 px-3 text-center">Ligações</th>
                        <th className="py-3 px-3 text-center">Reagendados</th>
                        <th className="py-3 px-3 text-center">Toneladas</th>
                        <th className="py-3 px-4">Próximo Título</th>
                        <th className="py-3 px-3 text-right">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rowsFiltradas.map((r) => {
                        const isSelf = r.isCurrentUser
                        return (
                          <tr
                            key={r.usuario.id}
                            className={`transition-colors ${
                              isSelf
                                ? 'bg-[#253575]/10 font-semibold border-l-4 border-l-[#253575] hover:bg-[#253575]/15'
                                : 'hover:bg-slate-50/70'
                            }`}
                          >
                            {/* Posição */}
                            <td className="py-3 px-3 text-center font-mono">
                              {r.posicao === 1 ? (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-xs">
                                  1
                                </span>
                              ) : r.posicao === 2 ? (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-300 text-slate-900 font-bold text-xs">
                                  2
                                </span>
                              ) : r.posicao === 3 ? (
                                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-800 text-amber-100 font-bold text-xs">
                                  3
                                </span>
                              ) : (
                                <span className="text-slate-500 font-bold">#{r.posicao}</span>
                              )}
                            </td>

                            {/* Usuário */}
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-2.5">
                                <div className="h-8 w-8 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  {r.usuario.name ? r.usuario.name.slice(0, 2).toUpperCase() : 'US'}
                                </div>
                                <div className="truncate">
                                  <div className="font-bold text-slate-900 truncate flex items-center space-x-1.5">
                                    <span>{r.usuario.name || r.usuario.email}</span>
                                    {isSelf && (
                                      <Badge className="bg-[#253575] text-white text-[9px] px-1 py-0">
                                        Você
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate flex items-center space-x-1">
                                    <span className="uppercase font-mono text-[10px]">
                                      {r.usuario.role}
                                    </span>
                                    {r.usuario.regioes && r.usuario.regioes.length > 0 && (
                                      <span>• {r.usuario.regioes.join(', ')}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Título & Badge Atual */}
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-base">{r.tituloAtual.emoji}</span>
                                <div className="truncate">
                                  <span className="font-bold text-slate-800 truncate block max-w-[170px]">
                                    {r.tituloAtual.nome}
                                  </span>
                                  <Badge
                                    className={`text-[9px] px-1.5 py-0 uppercase ${getNivelBadgeClass(
                                      r.tituloAtual.nivel,
                                    )}`}
                                  >
                                    {r.tituloAtual.nivel}
                                  </Badge>
                                </div>
                              </div>
                            </td>

                            {/* Pontos */}
                            <td className="py-3 px-3 text-right font-mono">
                              <span className="font-black text-slate-900 text-sm">
                                {r.pontos.toLocaleString('pt-BR')}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-sans">
                                pts
                              </span>
                            </td>

                            {/* Reativações */}
                            <td className="py-3 px-3 text-center font-mono">
                              <span className="font-bold text-emerald-600 text-sm">
                                {r.conversoes}
                              </span>
                            </td>

                            {/* Ligações */}
                            <td className="py-3 px-3 text-center font-mono text-slate-700">
                              {r.atendimentos}
                            </td>

                            {/* Reagendados */}
                            <td className="py-3 px-3 text-center font-mono text-amber-600">
                              {r.reagendados}
                            </td>

                            {/* Toneladas */}
                            <td className="py-3 px-3 text-center font-mono text-slate-600">
                              {r.toneladas > 0 ? `${r.toneladas}t` : '—'}
                            </td>

                            {/* Próximo Título & Barra de Progresso */}
                            <td className="py-3 px-4 min-w-[170px]">
                              {r.proximoTitulo ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="truncate text-slate-600 max-w-[120px]">
                                      {r.proximoTitulo.emoji} {r.proximoTitulo.nome}
                                    </span>
                                    <span className="font-mono text-slate-400 text-[10px]">
                                      {r.progressoProximoPerc}%
                                    </span>
                                  </div>
                                  <Progress value={r.progressoProximoPerc} className="h-1.5" />
                                </div>
                              ) : (
                                <span className="text-amber-600 font-bold text-[11px] flex items-center">
                                  👑 Topo Alcançado!
                                </span>
                              )}
                            </td>

                            {/* Botão Ver Conquistas */}
                            <td className="py-3 px-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedUserModal(r)}
                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                Ver Badges
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: CONCURSOS SAZONAIS */}
        <TabsContent value="concursos" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {concursos.map((c) => {
              const isAtivo = c.status === 'ativo'
              const dtFim = new Date(c.data_fim)
              const diffDays = Math.ceil((dtFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

              // Mini-ranking do concurso
              const sortedParticipantes = [...rankingRows].sort((a, b) => {
                if (c.metrica_tipo === 'conversoes') return b.conversoes - a.conversoes
                if (c.metrica_tipo === 'toneladas') return b.toneladas - a.toneladas
                if (c.metrica_tipo === 'atendimentos') return b.atendimentos - a.atendimentos
                return b.pontos - a.pontos
              })

              return (
                <Card
                  key={c.id}
                  className={`border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between ${
                    isAtivo ? 'border-blue-300 ring-1 ring-blue-100' : 'opacity-90'
                  }`}
                >
                  <CardHeader className="pb-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xl">{c.badge_exclusiva_emoji || '🎖️'}</span>
                          <CardTitle className="text-sm font-bold text-white truncate">
                            {c.titulo}
                          </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-slate-300 line-clamp-2">
                          {c.descricao || 'Desafio comercial especial.'}
                        </CardDescription>
                      </div>

                      <Badge
                        className={
                          isAtivo
                            ? 'bg-emerald-500 text-white uppercase text-[10px]'
                            : 'bg-slate-700 text-slate-300 uppercase text-[10px]'
                        }
                      >
                        {isAtivo ? 'Em Andamento' : 'Encerrado'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4 flex-1">
                    {/* Metas e Recompensa */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">
                          Meta Oficial
                        </span>
                        <span className="font-bold text-slate-800">
                          {c.meta_quantidade}{' '}
                          {c.metrica_tipo === 'conversoes'
                            ? 'reativações'
                            : c.metrica_tipo === 'toneladas'
                              ? 'toneladas'
                              : c.metrica_tipo === 'atendimentos'
                                ? 'ligações'
                                : 'pontos'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">
                          Prazo Restante
                        </span>
                        <span className="font-bold text-blue-700">
                          {isAtivo
                            ? diffDays > 0
                              ? `${diffDays} dias restantes`
                              : 'Termina hoje!'
                            : 'Finalizado'}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200">
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">
                          Premiação & Badge
                        </span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <Gift className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="font-semibold text-slate-900 text-xs">
                            {c.premio_descricao}
                          </span>
                        </div>
                        {c.badge_exclusiva_nome && (
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-400 bg-amber-50 text-amber-900"
                            >
                              Badge: {c.badge_exclusiva_emoji} {c.badge_exclusiva_nome}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vencedor histórico se encerrado */}
                    {!isAtivo && c.resultado_vencedor && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2">
                        <Crown className="h-4 w-4 text-amber-600 shrink-0" />
                        <div className="text-xs">
                          <span className="font-bold text-amber-900 block">Vencedor Oficial:</span>
                          <span className="text-amber-800">{c.resultado_vencedor}</span>
                        </div>
                      </div>
                    )}

                    {/* Mini-ranking dos 3 primeiros concorrentes */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                        Líderes no Desafio
                      </span>
                      <div className="space-y-1">
                        {sortedParticipantes.slice(0, 3).map((p, idx) => {
                          const valorAtual =
                            c.metrica_tipo === 'conversoes'
                              ? p.conversoes
                              : c.metrica_tipo === 'toneladas'
                                ? p.toneladas
                                : c.metrica_tipo === 'atendimentos'
                                  ? p.atendimentos
                                  : p.pontos
                          const percMeta = Math.min(
                            100,
                            Math.round((valorAtual / (c.meta_quantidade || 1)) * 100),
                          )

                          return (
                            <div
                              key={p.usuario.id}
                              className={`p-2 rounded-md text-xs flex items-center justify-between border ${
                                p.isCurrentUser
                                  ? 'bg-blue-50 border-blue-200 font-semibold'
                                  : 'bg-white border-slate-100'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate">
                                <span className="font-mono font-bold text-slate-500 w-4">
                                  #{idx + 1}
                                </span>
                                <span className="truncate">{p.usuario.name}</span>
                                {p.isCurrentUser && (
                                  <Badge className="bg-blue-600 text-white text-[9px] px-1 py-0">
                                    Você
                                  </Badge>
                                )}
                              </div>
                              <div className="text-right font-mono shrink-0">
                                <span className="font-bold text-slate-800">
                                  {valorAtual} / {c.meta_quantidade}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({percMeta}%)
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </CardContent>

                  {/* Ações do Admin */}
                  {isAdmin && isAtivo && (
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConcursoParaEncerrar(c)}
                        className="h-7 text-xs text-rose-600 hover:text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        Encerrar Concurso & Eleger Vencedor
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* TAB 3: REGRAS E PESOS DA PONTUAÇÃO */}
        <TabsContent value="regras" className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Target className="h-4 w-4 text-blue-600" />
                <span>Como Ganhar Pontos no Projeto Guerra</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                A pontuação reflete o esforço e resultado direto em reativar clientes inativos do
                ERP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-emerald-900">
                      Reativação com Pedido
                    </span>
                    <Badge className="bg-emerald-600 text-white font-mono text-xs">
                      +{pesos?.conversao_reativacao || 150} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Maior pontuação! Concedida quando o cliente compra novamente e tem pedido
                    emitido.
                  </p>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-blue-900">
                      Questionário Qualificado
                    </span>
                    <Badge className="bg-blue-600 text-white font-mono text-xs">
                      +{pesos?.atendimento_formulario || 25} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-blue-700">
                    Preenchimento completo das 17 perguntas da ficha de atendimento.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-amber-900">Reagendamento c/ Data</span>
                    <Badge className="bg-amber-600 text-white font-mono text-xs">
                      +{pesos?.reagendamento_qualificado || 20} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Agendamento assertivo de retorno com data e horário definidos pelo cliente.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-800">Ligação / Contato</span>
                    <Badge className="bg-slate-700 text-white font-mono text-xs">
                      +{pesos?.atendimento_ligacao || 10} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Tentativa registrada e contato ativo realizado pelo operador.
                  </p>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-purple-900">Tonelada Reativada</span>
                    <Badge className="bg-purple-600 text-white font-mono text-xs">
                      +{pesos?.pontos_por_tonelada || 5} pts / ton
                    </Badge>
                  </div>
                  <p className="text-[11px] text-purple-700">
                    Bônus proporcional ao volume faturado ou potencial declarado na compra.
                  </p>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-rose-900">
                      Motivo de Recusa Detalhado
                    </span>
                    <Badge className="bg-rose-600 text-white font-mono text-xs">
                      +{pesos?.venda_perdida_com_motivo || 5} pts
                    </Badge>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    Alimenta a inteligência da empresa mesmo quando o cliente opta por terceiros.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="p-3 bg-slate-100 rounded-lg text-xs text-slate-600 flex items-center justify-between">
                  <span>
                    Como administrador, você pode ajustar esses pesos e valores na aba{' '}
                    <strong>Configurações &gt; Gamificação</strong>.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: CATÁLOGO DOS 100 TÍTULOS E BADGES */}
      <Dialog open={modalCatalogoOpen} onOpenChange={setModalCatalogoOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center space-x-2">
              <Award className="h-5 w-5 text-amber-500" />
              <span>Catálogo Completo de Títulos & Badges (100 Títulos)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Todos os títulos disponíveis no Projeto Guerra, divididos por escalões de pontuação
            </DialogDescription>
          </DialogHeader>

          {/* Filtro por Nível */}
          <div className="flex items-center space-x-2 pb-2 border-b">
            <span className="text-xs text-slate-500 font-medium">Filtrar Escalão:</span>
            {(
              [
                ['todos', 'Todos (100)'],
                ['bronze', 'Bronze (1-20)'],
                ['prata', 'Prata (21-40)'],
                ['ouro', 'Ouro (41-65)'],
                ['platina', 'Platina (66-85)'],
                ['diamante', 'Diamante (86-100)'],
              ] as const
            ).map(([n, lbl]) => (
              <button
                key={n}
                onClick={() => setFiltroNivelCatalogo(n)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  filtroNivelCatalogo === n
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
            {titulosCatalogoFiltrados.map((t) => {
              const userUnlocked = currentUserRow && currentUserRow.pontos >= t.pontos_necessarios

              return (
                <div
                  key={t.id}
                  className={`p-3 rounded-lg border text-xs transition-all ${
                    userUnlocked
                      ? 'bg-white border-emerald-300 shadow-xs ring-1 ring-emerald-100'
                      : 'bg-slate-50/70 border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xl">{t.emoji}</span>
                      <div>
                        <span className="font-bold text-slate-900 block truncate max-w-[150px]">
                          {t.nome}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          #{t.ordem} • {t.categoria || 'Geral'}
                        </span>
                      </div>
                    </div>
                    <Badge
                      className={`text-[9px] px-1.5 py-0 uppercase shrink-0 ${getNivelBadgeClass(
                        t.nivel,
                      )}`}
                    >
                      {t.nivel}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                    {t.descricao || 'Título de mérito comercial.'}
                  </p>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="font-mono font-bold text-slate-700">
                      {t.pontos_necessarios.toLocaleString('pt-BR')} pts
                    </span>
                    {userUnlocked ? (
                      <span className="text-emerald-600 font-bold text-[10px] flex items-center">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" />
                        Conquistado
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Bloqueado</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalCatalogoOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: DETALHES DE BADGES DO GUERREIRO */}
      <Dialog
        open={Boolean(selectedUserModal)}
        onOpenChange={(op) => !op && setSelectedUserModal(null)}
      >
        <DialogContent className="max-w-md">
          {selectedUserModal && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm font-bold flex items-center space-x-2">
                  <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                    {selectedUserModal.usuario.name
                      ? selectedUserModal.usuario.name.slice(0, 2).toUpperCase()
                      : 'US'}
                  </div>
                  <div>
                    <span>{selectedUserModal.usuario.name}</span>
                    <span className="block text-xs font-normal text-slate-400">
                      {selectedUserModal.usuario.email}
                    </span>
                  </div>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Desempenho no ranking e títulos conquistados permanentemente
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Título Atual */}
                <div className="p-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Título Atual
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xl">{selectedUserModal.tituloAtual.emoji}</span>
                      <span className="font-bold text-sm">
                        {selectedUserModal.tituloAtual.nome}
                      </span>
                    </div>
                  </div>
                  <Badge
                    className={`text-[9px] uppercase ${getNivelBadgeClass(
                      selectedUserModal.tituloAtual.nivel,
                    )}`}
                  >
                    {selectedUserModal.tituloAtual.nivel}
                  </Badge>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-slate-50 border rounded-md">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Pontos Acumulados
                    </span>
                    <span className="font-bold text-slate-900 text-sm">
                      {selectedUserModal.pontos.toLocaleString('pt-BR')} pts
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border rounded-md">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Reativações Totais
                    </span>
                    <span className="font-bold text-emerald-600 text-sm">
                      {selectedUserModal.conversoes}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border rounded-md">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Ligações Realizadas
                    </span>
                    <span className="font-bold text-slate-700 text-sm">
                      {selectedUserModal.atendimentos}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border rounded-md">
                    <span className="text-[10px] text-slate-400 block font-sans">
                      Títulos Desbloqueados
                    </span>
                    <span className="font-bold text-blue-600 text-sm">
                      {selectedUserModal.totalTitulosDesbloqueados} de 100
                    </span>
                  </div>
                </div>

                {/* Próximo Objetivo */}
                {selectedUserModal.proximoTitulo && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-blue-900">
                        Próximo: {selectedUserModal.proximoTitulo.emoji}{' '}
                        {selectedUserModal.proximoTitulo.nome}
                      </span>
                      <span className="font-mono text-blue-700">
                        {selectedUserModal.progressoProximoPerc}%
                      </span>
                    </div>
                    <Progress
                      value={selectedUserModal.progressoProximoPerc}
                      className="h-2 bg-blue-100"
                    />
                    <span className="text-[10px] text-slate-500 block">
                      Faltam{' '}
                      {(
                        selectedUserModal.proximoTitulo.pontos_necessarios -
                        selectedUserModal.pontos
                      ).toLocaleString('pt-BR')}{' '}
                      pontos para desbloquear
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUserModal(null)}
                  className="text-xs"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: CRIAR CONCURSO SAZONAL (ADMIN ONLY) */}
      {isAdmin && (
        <Dialog open={modalNovoConcursoOpen} onOpenChange={setModalNovoConcursoOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center space-x-2">
                <Gift className="h-5 w-5 text-blue-600" />
                <span>Publicar Novo Concurso Sazonal</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Somente o administrador cria concursos. Todos os operadores e supervisores
                visualizam a disputa no ranking.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateConcurso} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <Label className="text-xs text-slate-700">Título do Concurso / Desafio</Label>
                <Input
                  placeholder="Ex: Promoção Semana X — Corrida do Aço"
                  value={novoConcurso.titulo}
                  onChange={(e) => setNovoConcurso({ ...novoConcurso, titulo: e.target.value })}
                  required
                  className="h-8 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-700">Descrição e Regras</Label>
                <textarea
                  placeholder="Explique o desafio para a equipe..."
                  value={novoConcurso.descricao}
                  onChange={(e) => setNovoConcurso({ ...novoConcurso, descricao: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Data de Início</Label>
                  <Input
                    type="date"
                    value={novoConcurso.data_inicio}
                    onChange={(e) =>
                      setNovoConcurso({ ...novoConcurso, data_inicio: e.target.value })
                    }
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Data de Término</Label>
                  <Input
                    type="date"
                    value={novoConcurso.data_fim}
                    onChange={(e) => setNovoConcurso({ ...novoConcurso, data_fim: e.target.value })}
                    required
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Métrica Alvo</Label>
                  <Select
                    value={novoConcurso.metrica_tipo}
                    onValueChange={(val: any) =>
                      setNovoConcurso({ ...novoConcurso, metrica_tipo: val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conversoes">Reativações de Clientes</SelectItem>
                      <SelectItem value="toneladas">Toneladas Faturadas</SelectItem>
                      <SelectItem value="atendimentos">Ligações Realizadas</SelectItem>
                      <SelectItem value="pontos">Pontuação Total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Meta Numérica</Label>
                  <Input
                    type="number"
                    value={novoConcurso.meta_quantidade}
                    onChange={(e) =>
                      setNovoConcurso({
                        ...novoConcurso,
                        meta_quantidade: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    required
                    min={1}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-700">Prêmio Oferecido</Label>
                <Input
                  placeholder="Ex: Vale R$ 500 + Jantar de gala com diretoria"
                  value={novoConcurso.premio_descricao}
                  onChange={(e) =>
                    setNovoConcurso({ ...novoConcurso, premio_descricao: e.target.value })
                  }
                  required
                  className="h-8 text-xs font-semibold text-amber-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs text-slate-700">Título / Badge Exclusiva</Label>
                  <Input
                    placeholder="Ex: Campeão da Quinzena"
                    value={novoConcurso.badge_exclusiva_nome}
                    onChange={(e) =>
                      setNovoConcurso({
                        ...novoConcurso,
                        badge_exclusiva_nome: e.target.value,
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-700">Emoji da Badge</Label>
                  <Input
                    placeholder="🎖️"
                    value={novoConcurso.badge_exclusiva_emoji}
                    onChange={(e) =>
                      setNovoConcurso({
                        ...novoConcurso,
                        badge_exclusiva_emoji: e.target.value,
                      })
                    }
                    className="h-8 text-xs text-center text-base"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalNovoConcursoOpen(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={salvandoConcurso}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  {salvandoConcurso ? 'Publicando...' : 'Lançar Concurso'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 4: CONFIRMAÇÃO DE ENCERRAMENTO DE CONCURSO (SHADCN ALERTDIALOG) */}
      <AlertDialog
        open={Boolean(concursoParaEncerrar)}
        onOpenChange={(op) => !op && setConcursoParaEncerrar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">
              Encerrar Concurso Sazonal?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              Deseja realmente encerrar o concurso{' '}
              <strong className="text-slate-900">
                &ldquo;{concursoParaEncerrar?.titulo}&rdquo;
              </strong>
              ? O operador com melhor pontuação será consagrado vencedor e o concurso será
              arquivado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEncerrarConcurso}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
            >
              Confirmar e Eleger Vencedor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default RankingPage
