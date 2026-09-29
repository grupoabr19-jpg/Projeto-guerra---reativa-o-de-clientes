import React, { useState, useEffect } from 'react'
import {
  Users,
  UserCheck,
  TrendingUp,
  Percent,
  Clock,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
  Building2,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchClientes, fetchImportacoes, fetchRegioes } from '@/services/api'
import type { Cliente, Importacao, Regiao } from '@/types'
import { REGIOES_PADRAO } from '@/types'

export default function Dashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [regioesList, setRegioesList] = useState<string[]>([...REGIOES_PADRAO])
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<string>('todas')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [resClientes, resImp, resRegioes] = await Promise.all([
        fetchClientes({ perPage: 200 }),
        fetchImportacoes(),
        fetchRegioes().catch(() => [] as Regiao[]),
      ])
      setClientes(resClientes.items)
      setImportacoes(resImp)
      if (resRegioes.length > 0) {
        setRegioesList(resRegioes.map((r) => r.nome))
      }
    } catch (err) {
      console.error('Erro ao carregar métricas:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtragem
  const filteredClientes = clientes.filter((c) => {
    if (selectedRegion !== 'todas' && c.regiao !== selectedRegion) return false
    return true
  })

  // KPIs
  const totalBase = filteredClientes.length
  const naFila = filteredClientes.filter(
    (c) => c.estado === 'na_base' || c.estado === 'reservado',
  ).length
  const reativados = filteredClientes.filter((c) => c.estado === 'reativado').length
  const taxaReativacao = totalBase > 0 ? Math.round((reativados / totalBase) * 100) : 0

  const valorRecuperado = filteredClientes
    .filter((c) => c.estado === 'reativado')
    .reduce((acc, c) => acc + (c.valor_ultima_compra || 0), 0)

  const toneladasRecuperadas = filteredClientes
    .filter((c) => c.estado === 'reativado')
    .reduce((acc, c) => acc + (c.toneladas_historico || 0), 0)

  // Distribuição por estado
  const estadosContagem = {
    na_base: filteredClientes.filter((c) => c.estado === 'na_base').length,
    em_atendimento: filteredClientes.filter(
      (c) => c.estado === 'em_atendimento' || c.estado === 'reservado',
    ).length,
    reagendado: filteredClientes.filter((c) => c.estado === 'reagendado').length,
    contatado: filteredClientes.filter((c) => c.estado === 'contatado').length,
    reativado: reativados,
    compra_terceiros: filteredClientes.filter((c) => c.estado === 'compra_terceiros').length,
    nao_quer_negociar: filteredClientes.filter((c) => c.estado === 'nao_quer_negociar').length,
    sem_contato: filteredClientes.filter((c) => c.estado === 'sem_contato').length,
  }

  // Agrupamento por região
  const regioesMap: Record<string, { total: number; scoreSum: number }> = {}
  filteredClientes.forEach((c) => {
    const r = c.regiao || 'Sem Região'
    if (!regioesMap[r]) regioesMap[r] = { total: 0, scoreSum: 0 }
    regioesMap[r].total += 1
    regioesMap[r].scoreSum += c.score || 0
  })

  return (
    <div className="space-y-6">
      {/* Top Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Painel Executivo de Reativação
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhamento de recuperação de carteira inativa e taxa de conversão.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Região:</span>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent focus:ring-0 w-36">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Regiões</SelectItem>
                {regioesList.map((reg) => (
                  <SelectItem key={reg} value={reg}>
                    {reg}
                  </SelectItem>
                ))}
                <SelectItem value="Sem Região">Sem Região</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="h-8 text-xs">
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Inativos Base
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 tabular-nums">{totalBase}</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center">
              Aguardando contato ou reconciliação
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Na Fila de Trabalho
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 tabular-nums">{naFila}</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center">
              Clientes disponíveis para novo contato
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Clientes Reativados
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{reativados}</div>
            <p className="text-[11px] text-emerald-600 mt-1 flex items-center font-medium">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              R$ {valorRecuperado.toLocaleString('pt-BR')} ({toneladasRecuperadas} ton)
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Taxa de Recuperação
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 tabular-nums">{taxaReativacao}%</div>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center">
              Meta da operação: &ge; 18%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid Charts & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Máquina de Estados / Funil */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>Distribuição por Estágio do Funil de Reativação</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Visualização da esteira operacional de contatos e desfechos registrados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  label: 'Na Base (Disponível)',
                  count: estadosContagem.na_base,
                  color: 'bg-blue-500',
                  barBg: 'bg-blue-100',
                },
                {
                  label: 'Em Atendimento / Reservado',
                  count: estadosContagem.em_atendimento,
                  color: 'bg-purple-500',
                  barBg: 'bg-purple-100',
                },
                {
                  label: 'Reagendados',
                  count: estadosContagem.reagendado,
                  color: 'bg-amber-500',
                  barBg: 'bg-amber-100',
                },
                {
                  label: 'Contatados (Follow-up)',
                  count: estadosContagem.contatado,
                  color: 'bg-cyan-500',
                  barBg: 'bg-cyan-100',
                },
                {
                  label: 'Reativados (Sucesso)',
                  count: estadosContagem.reativado,
                  color: 'bg-emerald-500',
                  barBg: 'bg-emerald-100',
                },
                {
                  label: 'Comprando Terceiros',
                  count: estadosContagem.compra_terceiros,
                  color: 'bg-rose-500',
                  barBg: 'bg-rose-100',
                },
                {
                  label: 'Não Quer Negociar (Quarentena)',
                  count: estadosContagem.nao_quer_negociar,
                  color: 'bg-slate-400',
                  barBg: 'bg-slate-200',
                },
                {
                  label: 'Sem Contato (Esgotado)',
                  count: estadosContagem.sem_contato,
                  color: 'bg-orange-500',
                  barBg: 'bg-orange-100',
                },
              ].map((item) => {
                const pct = totalBase > 0 ? Math.round((item.count / totalBase) * 100) : 0
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-slate-500 font-mono">
                        {item.count} ({pct}%)
                      </span>
                    </div>
                    <div className={`h-2.5 w-full rounded-full ${item.barBg} overflow-hidden`}>
                      <div
                        className={`h-full ${item.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(pct, item.count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição Regional */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-slate-600" />
              <span>Desempenho por Região</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Volume e score médio da carteira
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.keys(regioesMap).length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Nenhuma região encontrada</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(regioesMap).map(([reg, data]) => {
                  const avgScore = data.total > 0 ? Math.round(data.scoreSum / data.total) : 0
                  return (
                    <div
                      key={reg}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-xs text-slate-800">{reg}</div>
                        <div className="text-[11px] text-slate-500">{data.total} clientes</div>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            avgScore >= 75
                              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                              : avgScore >= 60
                                ? 'border-amber-500 text-amber-700 bg-amber-50'
                                : 'border-slate-300 text-slate-700'
                          }`}
                        >
                          Score Médio: {avgScore}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico Recente de Importações */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span>Últimas Cargas de Planilhas e Reconciliações</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Registro das planilhas importadas para atualização de saldos
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {importacoes.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Nenhuma planilha real subida ainda. A base iniciou com a amostra de teste e aguarda a
              importação do usuário.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Arquivo</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Total Linhas</th>
                    <th className="py-2.5 px-3">Novos / Atualizados</th>
                    <th className="py-2.5 px-3">Reconciliados</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importacoes.slice(0, 5).map((imp) => (
                    <tr key={imp.id} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 font-medium text-slate-800">{imp.nome_arquivo}</td>
                      <td className="py-2 px-3 text-slate-500 font-mono">
                        {new Date(imp.created).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{imp.linhas_total}</td>
                      <td className="py-2 px-3 text-slate-600">
                        <span className="text-emerald-600 font-semibold">
                          {imp.linhas_importadas}
                        </span>{' '}
                        / <span className="text-blue-600">{imp.linhas_atualizadas}</span>
                      </td>
                      <td className="py-2 px-3 text-emerald-600 font-medium">
                        {imp.reconciliados_faturaram || 0} faturaram
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={
                            imp.status === 'concluida'
                              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                              : 'border-red-500 text-red-700 bg-red-50'
                          }
                        >
                          {imp.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
