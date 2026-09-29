import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  Download,
  Filter,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  Building2,
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
import { fetchClientes, fetchImportacoes } from '@/services/api'
import type { Cliente, Importacao } from '@/types'

export default function RelatoriosPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegiao, setSelectedRegiao] = useState<string>('todas')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const resC = await fetchClientes({ perPage: 250 })
      const resI = await fetchImportacoes()
      setClientes(resC.items)
      setImportacoes(resI)
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = clientes.filter((c) => {
    if (selectedRegiao !== 'todas' && c.regiao !== selectedRegiao) return false
    return true
  })

  // Agrupamento de Motivos de Perda / Não Reativação
  const perdasPorMotivo: Record<string, number> = {}
  filtered.forEach((c) => {
    if (['compra_terceiros', 'nao_quer_negociar', 'sem_contato'].includes(c.estado)) {
      const label =
        c.estado === 'compra_terceiros'
          ? 'Comprando de Terceiros / Concorrente'
          : c.estado === 'nao_quer_negociar'
            ? 'Recusa Formal / Não Quer Negociar'
            : 'Sem Contato (Telefone Inválido ou Caixa)'
      perdasPorMotivo[label] = (perdasPorMotivo[label] || 0) + 1
    }
  })

  // Produtividade e Conversão por Região
  const regioesMetricas: Record<
    string,
    { total: number; reativados: number; valorTotal: number; toneladas: number }
  > = {}
  filtered.forEach((c) => {
    const reg = c.regiao || 'Sem Região'
    if (!regioesMetricas[reg]) {
      regioesMetricas[reg] = { total: 0, reativados: 0, valorTotal: 0, toneladas: 0 }
    }
    regioesMetricas[reg].total += 1
    if (c.estado === 'reativado') {
      regioesMetricas[reg].reativados += 1
      regioesMetricas[reg].valorTotal += c.valor_ultima_compra || 0
      regioesMetricas[reg].toneladas += c.toneladas_historico || 0
    }
  })

  // Divergências de Pedidos Reativados
  const divergencias = importacoes.flatMap((imp) => imp.divergencias_pedidos || [])

  // Exportar Relatório para CSV
  const handleExportCSV = () => {
    let csv =
      'Codigo;Nome;Regiao;Vendedor;Segmento;Dias_Sem_Faturar;Faixa;Score;Status;Valor_Recuperado\n'
    filtered.forEach((c) => {
      csv += `${c.codigo};${c.nome};${c.regiao};${c.vendedor || ''};${c.segmento || ''};${
        c.dias_sem_faturar || 0
      };${c.faixa};${c.score || 0};${c.estado};${c.estado === 'reativado' ? c.valor_ultima_compra || 0 : 0}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `relatorio_reativacao_guerra_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Relatórios e Auditoria de Conversão
          </h2>
          <p className="text-xs text-slate-500">
            Métricas de fechamento, faturamento recuperado e conciliação de pedidos da reativação.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={selectedRegiao} onValueChange={setSelectedRegiao}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Região" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Regiões</SelectItem>
              <SelectItem value="Sudeste">Sudeste</SelectItem>
              <SelectItem value="Sul">Sul</SelectItem>
              <SelectItem value="Norte">Norte</SelectItem>
              <SelectItem value="Nordeste">Nordeste</SelectItem>
              <SelectItem value="Centro-Oeste">Centro-Oeste</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleExportCSV}
            size="sm"
            className="bg-slate-900 text-white h-8 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Grid de Desempenho Regional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span>Desempenho por Território Regional</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Taxa de recuperação e valores faturados por região
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(regioesMetricas).map(([reg, item]) => {
                const taxa = item.total > 0 ? Math.round((item.reativados / item.total) * 100) : 0
                return (
                  <div
                    key={reg}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">{reg}</span>
                      <span className="font-mono text-emerald-600 font-semibold">
                        R$ {item.valorTotal.toLocaleString('pt-BR')} ({item.toneladas} ton)
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>
                        {item.reativados} de {item.total} clientes reativados
                      </span>
                      <span>Conversão: {taxa}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.max(taxa, item.reativados > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Motivos de Perda */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>Principais Motivos de Perda e Desistência</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Causas de insucesso apontadas durante o contato
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(perdasPorMotivo).length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                Nenhuma perda catalogada ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(perdasPorMotivo).map(([motivo, count]) => (
                  <div
                    key={motivo}
                    className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-xs font-medium text-rose-900">{motivo}</span>
                    <Badge
                      variant="outline"
                      className="border-rose-400 text-rose-700 bg-white font-mono text-xs"
                    >
                      {count} clientes
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Relatório de Divergências de Pedidos Informados */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Auditoria e Divergências de Pedidos Reativados</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Validação cruzada dos números de pedido digitados pelo operador contra as planilhas
            reais importadas do ERP
          </CardDescription>
        </CardHeader>
        <CardContent>
          {divergencias.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Nenhuma divergência registrada. Todos os pedidos confirmados foram validados com
              sucesso nas planilhas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3">Pedido Declarado pelo Operador</th>
                    <th className="py-2.5 px-3">Pedido Faturado no ERP</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {divergencias.map((div, idx) => (
                    <tr key={idx} className="hover:bg-amber-50/50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{div.codigo}</td>
                      <td className="py-2 px-3 text-slate-700 font-medium">{div.nome}</td>
                      <td className="py-2 px-3 font-mono text-amber-700">{div.pedidoEsperado}</td>
                      <td className="py-2 px-3 font-mono text-rose-600 font-bold">
                        {div.pedidoPlanilha}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-amber-700 bg-amber-50 text-[10px]"
                        >
                          Divergência
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
