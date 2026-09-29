import React, { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  Layers,
  Eye,
  Trash2,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  Clock,
  Code2,
  Table,
  Info,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchBasesReferencia, createBaseReferencia, deleteBaseReferencia } from '@/services/api'
import { parseSpreadsheetWithSheetJS } from '@/lib/sheetParser'
import type { BaseReferencia } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

export function BasesReferenciaTab() {
  const { user } = useAuth()
  const [bases, setBases] = useState<BaseReferencia[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgressMsg, setUploadProgressMsg] = useState('')
  const [previewBase, setPreviewBase] = useState<BaseReferencia | null>(null)
  const [previewMode, setPreviewMode] = useState<'table' | 'json' | 'columns'>('table')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadBases()
  }, [])

  const loadBases = async () => {
    setLoading(true)
    try {
      const data = await fetchBasesReferencia()
      setBases(data)
    } catch (err) {
      console.error('Erro ao carregar bases de referência:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (file: File) => {
    if (!file) return

    setUploading(true)
    setUploadProgressMsg('Lendo e analisando colunas da planilha com SheetJS...')

    try {
      // 1. Parse no navegador usando SheetJS (XLSX, XLS, CSV)
      const parsed = await parseSpreadsheetWithSheetJS(file, 50)

      setUploadProgressMsg('Enviando arquivo e metadados ao servidor...')

      // 2. Cria FormData para envio ao PocketBase (campo file + JSONs)
      const formData = new FormData()
      formData.append('arquivo', file)
      formData.append('nome_arquivo', file.name)
      if (user?.id) {
        formData.append('enviado_por', user.id)
      }
      formData.append('total_linhas', String(parsed.totalLinhas))
      formData.append('colunas_detectadas', JSON.stringify(parsed.colunasDetectadas))
      formData.append('amostra_linhas', JSON.stringify(parsed.amostraLinhas))
      formData.append('status', 'aguardando_analise')
      formData.append(
        'notas',
        `Arquivo cru recebido para análise de layout. ${parsed.sheetNames.length > 1 ? `Abas: ${parsed.sheetNames.join(', ')}` : ''}`,
      )

      await createBaseReferencia(formData)

      alert(
        `Base de Referência "${file.name}" subida com sucesso!\n${parsed.totalLinhas} linhas e ${parsed.colunasDetectadas.length} colunas detectadas.`,
      )
      loadBases()
    } catch (err: unknown) {
      console.error('Falha no upload da base de referência:', err)
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao processar planilha'
      alert(`Erro: ${msg}`)
    } finally {
      setUploading(false)
      setUploadProgressMsg('')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) {
      handleFileSelect(dropped)
    }
  }

  const handleDelete = async (base: BaseReferencia) => {
    if (
      !confirm(
        `Tem certeza que deseja remover o registro da planilha de referência "${base.nome_arquivo}"?`,
      )
    ) {
      return
    }

    try {
      await deleteBaseReferencia(base.id)
      setBases((prev) => prev.filter((b) => b.id !== base.id))
      if (previewBase?.id === base.id) {
        setPreviewBase(null)
      }
    } catch (err) {
      console.error('Falha ao remover base:', err)
      alert('Falha ao remover registro da base.')
    }
  }

  const filteredBases = bases.filter((b) =>
    b.nome_arquivo.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getStatusBadge = (status: BaseReferencia['status']) => {
    switch (status) {
      case 'aguardando_analise':
        return (
          <Badge
            variant="outline"
            className="border-amber-400 text-amber-700 bg-amber-50 text-[10px] font-mono"
          >
            Aguardando Análise
          </Badge>
        )
      case 'em_analise':
        return (
          <Badge
            variant="outline"
            className="border-blue-400 text-blue-700 bg-blue-50 text-[10px] font-mono"
          >
            Em Análise
          </Badge>
        )
      case 'mapeado':
        return (
          <Badge
            variant="outline"
            className="border-emerald-400 text-emerald-700 bg-emerald-50 text-[10px] font-mono"
          >
            Mapeado
          </Badge>
        )
      case 'arquivado':
        return (
          <Badge variant="outline" className="text-slate-400 text-[10px] font-mono">
            Arquivado
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-5">
      {/* Informação contextual */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-950 flex items-start space-x-2.5">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold">
            Área Exclusiva de Engenharia & Estruturação do BD:{' '}
          </strong>
          Suba aqui as planilhas <strong>cruas</strong> (.xlsx, .xls ou .csv) que servirão de
          referência para leitura da estrutura de dados e definição exata de como a base deve ser
          alimentada.
          <span className="block mt-1 text-[11px] text-blue-800">
            ⚠ <strong>Importante:</strong> Planilhas enviadas nesta aba NÃO entram na fila
            operacional, NÃO tocam no banco de clientes e NÃO disparam reconciliação comercial —
            ficam armazenadas exclusivamente para análise técnica de layout de colunas e mapeamento.
          </span>
        </div>
      </div>

      {/* Upload Zone Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <UploadCloud className="h-4 w-4 text-blue-600" />
            <span>Upload de Planilha de Referência</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Arraste ou selecione planilhas (.xlsx, .xls, .csv). O sistema detecta automaticamente os
            cabeçalhos e guarda uma amostra inicial de até 50 linhas para inspeção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('ref-file-input')?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer ${
              uploading
                ? 'opacity-60 pointer-events-none border-blue-400 bg-blue-50/30'
                : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
            }`}
          >
            <input
              id="ref-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
                e.target.value = ''
              }}
            />
            <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-inner">
              {uploading ? (
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              ) : (
                <FileSpreadsheet className="h-6 w-6" />
              )}
            </div>

            {uploading ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-700">Processando planilha...</p>
                <p className="text-xs text-slate-500 font-mono">{uploadProgressMsg}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  Clique para selecionar ou arraste sua planilha de referência aqui
                </p>
                <p className="text-xs text-slate-400">
                  Formatos aceitos: <strong>.xlsx</strong>, <strong>.xls</strong> e{' '}
                  <strong>.csv</strong> (até 50MB)
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Listagem de Bases Subidas */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Planilhas Armazenadas para Análise ({bases.length})</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Histórico de arquivos de referência disponíveis no backend para visualização de
                estrutura
              </CardDescription>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Filtrar por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadBases}
                disabled={loading}
                className="h-8 px-2.5 text-xs text-slate-600"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading && bases.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Carregando bases de referência...
            </div>
          ) : filteredBases.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-1">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">
                Nenhuma planilha de referência encontrada
              </p>
              <p className="text-[11px] text-slate-400">
                Suba uma planilha no quadro acima para começar a mapear a estrutura do banco.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Nome do Arquivo</th>
                    <th className="py-2.5 px-3">Data de Envio</th>
                    <th className="py-2.5 px-3">Enviado Por</th>
                    <th className="py-2.5 px-3 text-center">Linhas</th>
                    <th className="py-2.5 px-3 text-center">Colunas</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBases.map((b) => {
                    const colunasCount = Array.isArray(b.colunas_detectadas)
                      ? b.colunas_detectadas.length
                      : 0
                    const autor =
                      b.expand?.enviado_por?.name || b.expand?.enviado_por?.email || 'Admin'

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="font-semibold text-slate-800">{b.nome_arquivo}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                          {b.created ? new Date(b.created).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <UserIcon className="h-3 w-3 text-slate-400" />
                            {autor}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-medium text-slate-800">
                          {b.total_linhas?.toLocaleString('pt-BR') || 0}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200"
                          >
                            {colunasCount} colunas
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">{getStatusBadge(b.status)}</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewBase(b)}
                            className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Pré-visualizar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(b)}
                            className="h-7 text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Dialog de Pré-visualização de Colunas e Amostra */}
      {previewBase && (
        <Dialog open={Boolean(previewBase)} onOpenChange={(open) => !open && setPreviewBase(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
            <DialogHeader className="border-b pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                    <span>{previewBase.nome_arquivo}</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-1">
                    {previewBase.total_linhas?.toLocaleString('pt-BR')} linhas totais •{' '}
                    {(previewBase.colunas_detectadas || []).length} colunas detectadas • Amostra de{' '}
                    {(previewBase.amostra_linhas || []).length} linhas
                  </DialogDescription>
                </div>
                <div>{getStatusBadge(previewBase.status)}</div>
              </div>
            </DialogHeader>

            <Tabs
              value={previewMode}
              onValueChange={(v: any) => setPreviewMode(v)}
              className="flex-1 flex flex-col min-h-0 pt-2"
            >
              <div className="flex items-center justify-between border-b pb-2">
                <TabsList className="h-8 bg-slate-100 p-0.5">
                  <TabsTrigger value="table" className="text-xs h-7 px-3 flex items-center gap-1.5">
                    <Table className="h-3.5 w-3.5" />
                    Tabela de Amostra
                  </TabsTrigger>
                  <TabsTrigger
                    value="columns"
                    className="text-xs h-7 px-3 flex items-center gap-1.5"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Lista de Colunas ({(previewBase.colunas_detectadas || []).length})
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs h-7 px-3 flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    JSON Amostra
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* MODO TABELA */}
              <TabsContent value="table" className="flex-1 overflow-auto min-h-0 pt-3">
                <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10 text-slate-700 font-semibold border-b border-slate-200 shadow-sm">
                      <tr>
                        <th className="py-2 px-3 border-r border-slate-200 w-12 text-center text-slate-400">
                          #
                        </th>
                        {(previewBase.colunas_detectadas || []).map((col, idx) => (
                          <th
                            key={idx}
                            className="py-2 px-3 border-r border-slate-200 whitespace-nowrap text-slate-800"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(previewBase.amostra_linhas || []).map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-blue-50/40">
                          <td className="py-1.5 px-3 border-r border-slate-200 text-center text-[10px] text-slate-400 font-mono bg-slate-50/50">
                            {rowIdx + 1}
                          </td>
                          {(previewBase.colunas_detectadas || []).map((col, colIdx) => {
                            const val = row[col]
                            return (
                              <td
                                key={colIdx}
                                className="py-1.5 px-3 border-r border-slate-100 max-w-xs truncate font-mono text-[11px] text-slate-700"
                                title={String(val ?? '')}
                              >
                                {val !== undefined && val !== null && String(val).trim() !== '' ? (
                                  String(val)
                                ) : (
                                  <span className="text-slate-300 italic">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* MODO COLUNAS */}
              <TabsContent value="columns" className="flex-1 overflow-auto min-h-0 pt-3">
                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    Ordem exata das colunas identificadas na primeira linha da planilha:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto pr-1">
                    {(previewBase.colunas_detectadas || []).map((col, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-slate-800 truncate" title={col}>
                          {col}
                        </span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px] bg-white text-slate-500 border-slate-200"
                        >
                          col {idx + 1}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* MODO JSON */}
              <TabsContent value="json" className="flex-1 overflow-auto min-h-0 pt-3">
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-[11px] font-mono overflow-auto max-h-[55vh] leading-relaxed">
                  {JSON.stringify(
                    {
                      nome_arquivo: previewBase.nome_arquivo,
                      total_linhas: previewBase.total_linhas,
                      colunas_detectadas: previewBase.colunas_detectadas,
                      amostra_primeiras_linhas: previewBase.amostra_linhas,
                    },
                    null,
                    2,
                  )}
                </pre>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
