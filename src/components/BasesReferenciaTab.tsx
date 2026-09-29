import React, { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  Layers,
  Eye,
  Trash2,
  User as UserIcon,
  Code2,
  Table,
  Info,
  RefreshCw,
  Search,
  HardDrive,
  Tag,
  AlertTriangle,
  FileCheck,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchBasesReferencia, createBaseReferencia, deleteBaseReferencia } from '@/services/api'
import { parseSpreadsheetWithSheetJS, type ParseProgress } from '@/lib/sheetParser'
import type { BaseReferencia, BaseClassificacao } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`
  }
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export function BasesReferenciaTab() {
  const { user } = useAuth()
  const [bases, setBases] = useState<BaseReferencia[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedClassification, setSelectedClassification] = useState<BaseClassificacao>('margem')

  // Estado detalhado de progresso para planilhas pesadas (100MB+)
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number
    message: string
    stage: 'reading' | 'parsing' | 'uploading' | 'complete' | 'idle'
    fileName?: string
    fileSizeStr?: string
    processedRows?: number
  }>({
    percent: 0,
    message: '',
    stage: 'idle',
  })

  const [previewBase, setPreviewBase] = useState<BaseReferencia | null>(null)
  const [previewMode, setPreviewMode] = useState<'abas' | 'table' | 'json' | 'columns'>('abas')
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0)
  const [tableSheetIndex, setTableSheetIndex] = useState<number>(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [classificationFilter, setClassificationFilter] = useState<'all' | BaseClassificacao>('all')

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

    const fileSizeMb = file.size / (1024 * 1024)
    if (fileSizeMb > 250) {
      alert(
        `O arquivo possui ${fileSizeMb.toFixed(1)} MB. O limite máximo absoluto suportado é de 250 MB.`,
      )
      return
    }

    // Limiar inteligente: arquivos acima de 60 MB não são enviados como anexo bruto multipart
    // para evitar estouro de timeout do servidor ou limite de payload HTTP.
    // O parsing completo roda localmente no navegador (Web Worker) e salvamos metadados + contagem + amostra.
    const isLargeFileWithoutAttachment = fileSizeMb >= 60

    setUploading(true)
    setUploadProgress({
      percent: 5,
      message: 'Iniciando leitura em segundo plano...',
      stage: 'reading',
      fileName: file.name,
      fileSizeStr: formatBytes(file.size),
    })

    try {
      // 1. Parse em segundo plano (Web Worker para XLSX / streaming para CSV)
      // Mantém apenas cabeçalhos, contagem total e 50 linhas de amostra na memória
      const parsed = await parseSpreadsheetWithSheetJS(file, 50, (p: ParseProgress) => {
        setUploadProgress((prev) => ({
          ...prev,
          percent: Math.min(85, Math.max(prev.percent, p.percent)),
          message: p.message,
          stage: p.stage === 'reading' ? 'reading' : 'parsing',
          processedRows: p.processedRows,
        }))
      })

      // 2. Envio para o backend
      setUploadProgress((prev) => ({
        ...prev,
        percent: 88,
        message: isLargeFileWithoutAttachment
          ? 'Gravando metadados, estrutura e amostra no servidor (modo arquivo grande)...'
          : 'Enviando arquivo original e metadados ao servidor...',
        stage: 'uploading',
        processedRows: parsed.totalLinhas,
      }))

      const formData = new FormData()
      if (!isLargeFileWithoutAttachment) {
        formData.append('arquivo', file)
      }
      formData.append('nome_arquivo', file.name)
      if (user?.id) {
        formData.append('enviado_por', user.id)
      }
      formData.append('total_linhas', String(parsed.totalLinhas))
      formData.append('colunas_detectadas', JSON.stringify(parsed.colunasDetectadas))
      formData.append('amostra_linhas', JSON.stringify(parsed.amostraLinhas))
      if (parsed.analiseAbas && parsed.analiseAbas.length > 0) {
        formData.append('analise_abas', JSON.stringify(parsed.analiseAbas))
      }
      formData.append('status', 'aguardando_analise')
      formData.append('classificacao', selectedClassification)
      formData.append('tamanho_bytes', String(file.size))

      const notaGrande = isLargeFileWithoutAttachment
        ? ` [Arquivo grande: ${fileSizeMb.toFixed(1)} MB - Análise realizada via Web Worker local sem anexo bruto no servidor para evitar timeout]`
        : ''

      formData.append(
        'notas',
        `Arquivo de referência (${selectedClassification.toUpperCase()}) - ${parsed.sheetNames.length > 1 ? `Abas: ${parsed.sheetNames.join(', ')}` : 'Planilha única'}.${notaGrande}`,
      )

      await createBaseReferencia(formData)

      setUploadProgress({
        percent: 100,
        message: isLargeFileWithoutAttachment
          ? 'Estrutura, contagem e amostra da planilha grande gravadas com sucesso!'
          : 'Planilha processada e salva com sucesso!',
        stage: 'complete',
        fileName: file.name,
        fileSizeStr: formatBytes(file.size),
        processedRows: parsed.totalLinhas,
      })

      loadBases()
    } catch (err: unknown) {
      console.error('Falha no upload da base de referência:', err)
      let userFriendlyMessage = 'Não foi possível salvar o registro da planilha no servidor.'

      if (err instanceof Error) {
        const rawMsg = err.message.toLowerCase()
        if (
          rawMsg.includes('failed to fetch') ||
          rawMsg.includes('network') ||
          rawMsg.includes('timeout') ||
          rawMsg.includes('abort')
        ) {
          userFriendlyMessage = `Tempo limite esgotado ou falha de conexão durante o envio (${formatBytes(file.size)}). Para arquivos grandes, a extração no navegador funcionou, mas o gateway do servidor recusou o volume ou demorou além do limite.`
        } else if (
          rawMsg.includes('413') ||
          rawMsg.includes('too large') ||
          rawMsg.includes('payload')
        ) {
          userFriendlyMessage = `O arquivo (${formatBytes(file.size)}) excedeu o limite máximo de corpo de requisição do servidor HTTP. O sistema salvará apenas a amostra estrutural e metadados.`
        } else {
          userFriendlyMessage = `Erro: ${err.message}`
        }
      }
      alert(
        `Falha no upload:\n${userFriendlyMessage}\n\nRecomendação: certifique-se de que a conexão esteja estável. O sistema agora isola planilhas acima de 60 MB automaticamente para garantir que sejam lidas sem estourar o servidor.`,
      )
    } finally {
      // Pequeno delay para usuário ver o 100% concluído
      setTimeout(() => {
        setUploading(false)
        setUploadProgress({
          percent: 0,
          message: '',
          stage: 'idle',
        })
      }, 1800)
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

  const filteredBases = bases.filter((b) => {
    const matchesSearch = b.nome_arquivo.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClass =
      classificationFilter === 'all' ||
      b.classificacao === classificationFilter ||
      (!b.classificacao && classificationFilter === 'outra')
    return matchesSearch && matchesClass
  })

  const getClassificacaoBadge = (classificacao?: BaseClassificacao) => {
    switch (classificacao) {
      case 'margem':
        return (
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-mono">
            Margem
          </Badge>
        )
      case 'clientes':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 text-[10px] font-mono">
            Clientes
          </Badge>
        )
      case 'faturamento':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px] font-mono">
            Faturamento
          </Badge>
        )
      case 'outra':
      default:
        return (
          <Badge
            variant="outline"
            className="text-slate-500 border-slate-200 text-[10px] font-mono"
          >
            Outra
          </Badge>
        )
    }
  }

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
            ⚡ <strong>Suporte a Planilhas Pesadas (até 150-200 MB):</strong> O processamento é
            feito em Web Worker e streaming sem congelar o navegador. São extraídos os cabeçalhos, a
            contagem de linhas e uma amostra de 50 registros para inspeção imediata.
          </span>
        </div>
      </div>

      {/* Upload Zone Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                <span>Upload de Planilha de Referência</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Arraste ou selecione planilhas (.xlsx, .xls, .csv). O sistema detecta
                automaticamente os cabeçalhos e guarda uma amostra inicial de até 50 linhas para
                inspeção.
              </CardDescription>
            </div>

            {/* Seletor de Tipo de Base */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 shrink-0">
              <Tag className="h-3.5 w-3.5 text-slate-500 ml-1" />
              <span className="text-xs font-medium text-slate-700">Tipo de Base:</span>
              <Select
                value={selectedClassification}
                onValueChange={(val: BaseClassificacao) => setSelectedClassification(val)}
                disabled={uploading}
              >
                <SelectTrigger className="h-7 text-xs w-36 bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="margem" className="text-xs">
                    📊 Margem
                  </SelectItem>
                  <SelectItem value="clientes" className="text-xs">
                    👥 Clientes
                  </SelectItem>
                  <SelectItem value="faturamento" className="text-xs">
                    💰 Faturamento
                  </SelectItem>
                  <SelectItem value="outra" className="text-xs">
                    📁 Outra
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById('ref-file-input')?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-slate-50/50 flex flex-col items-center justify-center ${
              uploading
                ? 'border-blue-400 bg-blue-50/40 cursor-wait'
                : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50 cursor-pointer'
            }`}
          >
            <input
              id="ref-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={uploading}
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
              <div className="space-y-3 w-full max-w-md">
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    Processando {uploadProgress.fileName} ({uploadProgress.fileSizeStr})
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{uploadProgress.message}</p>
                </div>

                <div className="space-y-1">
                  <Progress value={uploadProgress.percent} className="h-2.5 bg-blue-100" />
                  <div className="flex justify-between text-[11px] font-mono text-slate-500">
                    <span>
                      {uploadProgress.processedRows
                        ? `${uploadProgress.processedRows.toLocaleString('pt-BR')} linhas identificadas`
                        : 'Calculando estrutura...'}
                    </span>
                    <span>{uploadProgress.percent}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-center space-x-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md py-1 px-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Planilhas grandes (100+ MB) podem levar alguns minutos. Não feche esta página.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  Clique para selecionar ou arraste sua planilha de referência aqui
                </p>
                <p className="text-xs text-slate-400">
                  Formatos aceitos: <strong>.xlsx</strong>, <strong>.xls</strong> e{' '}
                  <strong>.csv</strong> (suporte a arquivos pesados até <strong>200MB</strong>)
                </p>
                <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-mono">
                  <span className="inline-flex items-center gap-1">
                    <FileCheck className="h-3 w-3 text-emerald-600" />
                    Web Worker ativo
                  </span>
                  <span>•</span>
                  <span>Streaming de memória</span>
                  <span>•</span>
                  <span>Amostra de 50 linhas</span>
                </div>
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

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro de classificação */}
              <Select
                value={classificationFilter}
                onValueChange={(val: any) => setClassificationFilter(val)}
              >
                <SelectTrigger className="h-8 text-xs w-32 bg-white border-slate-200">
                  <SelectValue placeholder="Todas as bases" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    Todos os Tipos
                  </SelectItem>
                  <SelectItem value="margem" className="text-xs">
                    Margem
                  </SelectItem>
                  <SelectItem value="clientes" className="text-xs">
                    Clientes
                  </SelectItem>
                  <SelectItem value="faturamento" className="text-xs">
                    Faturamento
                  </SelectItem>
                  <SelectItem value="outra" className="text-xs">
                    Outra
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Busca por nome */}
              <div className="relative w-40 sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
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
                    <th className="py-2.5 px-3">Tipo / Base</th>
                    <th className="py-2.5 px-3">Tamanho</th>
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

                    const hasAnaliseAbas =
                      Array.isArray(b.analise_abas) && b.analise_abas.length > 0
                    const isLegacyLargeWithoutAttachment = !b.arquivo && !hasAnaliseAbas

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" />
                            <div className="flex flex-col">
                              <span
                                className="font-semibold text-slate-800 truncate max-w-xs"
                                title={b.nome_arquivo}
                              >
                                {b.nome_arquivo}
                              </span>
                              {hasAnaliseAbas && (
                                <span className="text-[10px] text-blue-700 font-medium">
                                  {b.analise_abas!.length} abas analisadas
                                </span>
                              )}
                              {isLegacyLargeWithoutAttachment && (
                                <span
                                  className="text-[10px] text-amber-700 font-sans"
                                  title="Arquivo grande analisado no formato antigo de aba única. A análise completa multi-aba será gerada em um novo upload."
                                >
                                  Análise por aba disponível em novo upload
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">{getClassificacaoBadge(b.classificacao)}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{formatBytes(b.tamanho_bytes)}</span>
                            {!b.arquivo && (
                              <span
                                className="text-[9px] text-amber-600 font-sans font-medium"
                                title="Metadados e amostra gravados sem retenção do binário pesado"
                              >
                                sem anexo
                              </span>
                            )}
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
                            onClick={() => {
                              setPreviewBase(b)
                              setSelectedSheetIndex(0)
                              setTableSheetIndex(0)
                              // Se tiver analise_abas, abre na visualização de abas por padrão
                              if (Array.isArray(b.analise_abas) && b.analise_abas.length > 0) {
                                setPreviewMode('abas')
                              } else {
                                setPreviewMode('table')
                              }
                            }}
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
                    {getClassificacaoBadge(previewBase.classificacao)}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span>{previewBase.total_linhas?.toLocaleString('pt-BR')} linhas totais</span>
                    <span>•</span>
                    <span>{(previewBase.colunas_detectadas || []).length} colunas detectadas</span>
                    <span>•</span>
                    <span>Amostra de {(previewBase.amostra_linhas || []).length} linhas</span>
                    {previewBase.tamanho_bytes ? (
                      <>
                        <span>•</span>
                        <span className="font-mono">{formatBytes(previewBase.tamanho_bytes)}</span>
                      </>
                    ) : null}
                    {!previewBase.arquivo && (
                      <>
                        <span>•</span>
                        <span className="text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                          Arquivo grande — análise sem anexo bruto
                        </span>
                      </>
                    )}
                  </DialogDescription>
                </div>
                <div>{getStatusBadge(previewBase.status)}</div>
              </div>
              {previewBase.notas && (
                <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                  <div className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-blue-600" />
                    Mapeamento & Notas do Layout:
                  </div>
                  {previewBase.notas}
                </div>
              )}
            </DialogHeader>

            {(() => {
              const abasDisponiveis = Array.isArray(previewBase.analise_abas)
                ? previewBase.analise_abas
                : []
              const hasMultiAba = abasDisponiveis.length > 0

              // Dados da aba selecionada para a tabela
              const activeAba = hasMultiAba
                ? abasDisponiveis[tableSheetIndex] || abasDisponiveis[0]
                : null

              const activeCols = activeAba
                ? activeAba.colunas
                : previewBase.colunas_detectadas || []
              const activeAmostra = activeAba ? activeAba.amostra : previewBase.amostra_linhas || []
              const activeTotalLinhas = activeAba
                ? activeAba.total_linhas
                : previewBase.total_linhas

              return (
                <Tabs
                  value={previewMode}
                  onValueChange={(v: any) => setPreviewMode(v)}
                  className="flex-1 flex flex-col min-h-0 pt-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                    <TabsList className="h-8 bg-slate-100 p-0.5">
                      {hasMultiAba && (
                        <TabsTrigger
                          value="abas"
                          className="text-xs h-7 px-3 flex items-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Visão das Abas ({abasDisponiveis.length})
                        </TabsTrigger>
                      )}
                      <TabsTrigger
                        value="table"
                        className="text-xs h-7 px-3 flex items-center gap-1.5"
                      >
                        <Table className="h-3.5 w-3.5" />
                        Tabela de Amostra{' '}
                        {hasMultiAba ? `(${activeAba?.nome || 'Aba'})` : '(Geral)'}
                      </TabsTrigger>
                      <TabsTrigger
                        value="columns"
                        className="text-xs h-7 px-3 flex items-center gap-1.5"
                      >
                        <Tag className="h-3.5 w-3.5" />
                        Colunas ({activeCols.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="json"
                        className="text-xs h-7 px-3 flex items-center gap-1.5"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        JSON Estrutura
                      </TabsTrigger>
                    </TabsList>

                    {previewBase.arquivo ? (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                        <span>Arquivo arquivado no backend</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>Arquivo grande sem binário bruto</span>
                      </div>
                    )}
                  </div>

                  {/* SEÇÃO ABAS (NOVO MODO) */}
                  {hasMultiAba && (
                    <TabsContent value="abas" className="flex-1 overflow-auto min-h-0 pt-3">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-600">
                            Todas as abas detectadas no arquivo. Clique em{' '}
                            <strong>Ver Tabela</strong> em qualquer aba para inspecionar seus
                            cabeçalhos e amostra:
                          </p>
                          <Badge variant="outline" className="text-[10px] font-mono text-slate-600">
                            {abasDisponiveis.length} abas encontradas
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                          {abasDisponiveis.map((aba, idx) => {
                            const isSelected = tableSheetIndex === idx
                            const isPivot = aba.is_pivot
                            const isData =
                              !isPivot &&
                              (aba.nome.toLowerCase() === 'bd' ||
                                aba.nome.toLowerCase().includes('base'))

                            return (
                              <div
                                key={idx}
                                className={`border rounded-lg p-3.5 transition-all flex flex-col justify-between space-y-2.5 ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2 truncate">
                                      <FileSpreadsheet
                                        className={`h-4 w-4 shrink-0 ${
                                          isData
                                            ? 'text-emerald-600'
                                            : isPivot
                                              ? 'text-purple-600'
                                              : 'text-blue-600'
                                        }`}
                                      />
                                      <span
                                        className="font-bold text-xs text-slate-800 truncate"
                                        title={aba.nome}
                                      >
                                        {aba.nome}
                                      </span>
                                    </div>
                                    <div className="flex items-center space-x-1 shrink-0">
                                      {isPivot && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[9px] font-mono bg-purple-50 text-purple-700 border-purple-200"
                                        >
                                          Tabela Dinâmica / Pivô
                                        </Badge>
                                      )}
                                      {isData && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200"
                                        >
                                          Base Bruta (BD)
                                        </Badge>
                                      )}
                                      {aba.tipo_aba === 'resumo' && (
                                        <Badge
                                          variant="secondary"
                                          className="text-[9px] font-mono bg-slate-100 text-slate-600"
                                        >
                                          Resumo
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center space-x-3 text-[11px] text-slate-500 font-mono">
                                    <span>
                                      <strong>
                                        {aba.total_linhas?.toLocaleString('pt-BR') || 0}
                                      </strong>{' '}
                                      linhas
                                    </span>
                                    <span>•</span>
                                    <span>
                                      <strong>{aba.colunas?.length || 0}</strong> colunas
                                    </span>
                                    <span>•</span>
                                    <span>
                                      <strong>{aba.amostra?.length || 0}</strong> amostras
                                    </span>
                                  </div>

                                  <div className="mt-2 text-[11px] text-slate-600 line-clamp-2">
                                    <strong className="text-slate-500 font-medium">Colunas:</strong>{' '}
                                    <span className="font-mono text-[10px] text-slate-700">
                                      {aba.colunas && aba.colunas.length > 0
                                        ? aba.colunas.slice(0, 7).join(', ') +
                                          (aba.colunas.length > 7
                                            ? ` (+${aba.colunas.length - 7})`
                                            : '')
                                        : 'Nenhuma coluna identificada'}
                                    </span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Aba #{idx + 1}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant={isSelected ? 'default' : 'outline'}
                                    onClick={() => {
                                      setTableSheetIndex(idx)
                                      setPreviewMode('table')
                                    }}
                                    className={`h-7 px-3 text-xs ${
                                      isSelected
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'text-slate-700 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    <Table className="h-3 w-3 mr-1" />
                                    Ver Tabela & Amostra
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </TabsContent>
                  )}

                  {/* MODO TABELA COM SELETOR DE ABA */}
                  <TabsContent value="table" className="flex-1 overflow-auto min-h-0 pt-3">
                    <div className="space-y-3">
                      {/* Seletor de aba para a tabela quando há múltiplas abas */}
                      {hasMultiAba && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-xs font-semibold text-slate-700">
                              Aba Selecionada:
                            </span>
                            <Select
                              value={String(tableSheetIndex)}
                              onValueChange={(val) => setTableSheetIndex(Number(val))}
                            >
                              <SelectTrigger className="h-7 text-xs w-56 bg-white border-slate-200 font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {abasDisponiveis.map((aba, idx) => (
                                  <SelectItem key={idx} value={String(idx)} className="text-xs">
                                    {aba.nome}{' '}
                                    <span className="text-slate-400 font-mono text-[10px]">
                                      ({aba.total_linhas?.toLocaleString('pt-BR')} lin,{' '}
                                      {aba.colunas?.length} cols)
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                            {activeAba?.is_pivot ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono bg-purple-50 text-purple-700 border-purple-200"
                              >
                                Tabela Dinâmica / Pivô
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200"
                              >
                                Aba de Dados
                              </Badge>
                            )}
                            <span>{activeAmostra.length} linhas de amostra exibidas</span>
                          </div>
                        </div>
                      )}

                      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[50vh]">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-slate-100 sticky top-0 z-10 text-slate-700 font-semibold border-b border-slate-200 shadow-sm">
                            <tr>
                              <th className="py-2 px-3 border-r border-slate-200 w-12 text-center text-slate-400">
                                #
                              </th>
                              {activeCols.map((col, idx) => (
                                <th
                                  key={idx}
                                  className="py-2 px-3 border-r border-slate-200 whitespace-nowrap text-slate-800 font-semibold"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeAmostra.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={Math.max(1, activeCols.length + 1)}
                                  className="py-8 text-center text-slate-400 text-xs italic"
                                >
                                  Nenhuma linha de amostra disponível nesta aba.
                                </td>
                              </tr>
                            ) : (
                              activeAmostra.map((row, rowIdx) => (
                                <tr key={rowIdx} className="hover:bg-blue-50/40">
                                  <td className="py-1.5 px-3 border-r border-slate-200 text-center text-[10px] text-slate-400 font-mono bg-slate-50/50">
                                    {rowIdx + 1}
                                  </td>
                                  {activeCols.map((col, colIdx) => {
                                    const val = row[col]
                                    return (
                                      <td
                                        key={colIdx}
                                        className="py-1.5 px-3 border-r border-slate-100 max-w-xs truncate font-mono text-[11px] text-slate-700"
                                        title={String(val ?? '')}
                                      >
                                        {val !== undefined &&
                                        val !== null &&
                                        String(val).trim() !== '' ? (
                                          String(val)
                                        ) : (
                                          <span className="text-slate-300 italic">—</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </TabsContent>

                  {/* MODO COLUNAS */}
                  <TabsContent value="columns" className="flex-1 overflow-auto min-h-0 pt-3">
                    <div className="space-y-3">
                      {hasMultiAba && (
                        <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                          <span>
                            Exibindo colunas da aba:{' '}
                            <strong>{activeAba?.nome || 'Aba Atual'}</strong>
                          </span>
                          <span className="font-mono text-slate-500">
                            {activeCols.length} colunas
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        Ordem exata das colunas identificadas na linha de cabeçalho:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                        {activeCols.map((col, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-slate-800 truncate" title={col}>
                              {col}
                            </span>
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px] bg-white text-slate-500 border-slate-200 shrink-0 ml-2"
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
                          classificacao: previewBase.classificacao || 'outra',
                          tamanho_bytes: previewBase.tamanho_bytes,
                          total_linhas: previewBase.total_linhas,
                          colunas_detectadas: previewBase.colunas_detectadas,
                          analise_abas: previewBase.analise_abas || null,
                          amostra_primeiras_linhas: previewBase.amostra_linhas,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </TabsContent>
                </Tabs>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
