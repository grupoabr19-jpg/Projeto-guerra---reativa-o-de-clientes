import React, { useState } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Layers,
  ArrowRight,
  Database,
  UserCheck,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { parseSpreadsheetWithSheetJS } from '@/lib/sheetParser'
import {
  type MapeamentoColunasForms,
  sugerirMapeamentoColunasForms,
  converterLinhasFormsParaPayload,
  extrairCodigoCliente,
  normalizarValorReais,
  normalizarPesoToneladas,
} from '@/lib/formsImportParser'
import {
  importarRespostasFormulario,
  type RespostaImportacaoFormularioResultado,
} from '@/services/api'
import { toast } from '@/hooks/use-toast'

export function ImportacaoRespostasFormularioTab() {
  const [file, setFile] = useState<File | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState<{ percent: number; message: string }>({
    percent: 0,
    message: '',
  })
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')

  // Mapeamento de colunas
  const [mapeamento, setMapeamento] = useState<MapeamentoColunasForms>({
    colunaCodigoCliente: '',
    colunaNomeCliente: '',
    colunaOperadorEmail: '',
    colunaOperadorNome: '',
    colunaDataInicio: '',
    colunaDataConclusao: '',
    colunaMotivoInterrupcao: '',
    colunaAvaliacaoGeral: '',
    colunaHouveErro: '',
    colunaNaturezaFalha: '',
    colunaSetorFalha: '',
    colunaAnexoUrl: '',
    colunaNecessarioVoltar: '',
    colunaProbabilidadeRetomada: '',
    colunaDesfecho: '',
    colunaValorCotacao: '',
    colunaPesoFaturado: '',
  })

  // Estado de envio e resultado
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespostaImportacaoFormularioResultado | null>(null)
  const [copiedCodes, setCopiedCodes] = useState(false)

  // Leitura do arquivo
  const parseFile = async (selected: File, targetSheet?: string) => {
    setFile(selected)
    setIsParsing(true)
    setUploadError(null)
    setResultado(null)
    setParseProgress({ percent: 10, message: 'Iniciando leitura da planilha de respostas...' })

    try {
      const parsed = await parseSpreadsheetWithSheetJS(
        selected,
        50,
        (p) => {
          setParseProgress({
            percent: p.percent,
            message: p.message,
          })
        },
        { mode: 'full_rows', targetSheet },
      )

      const colunas = parsed.colunasDetectadas || []
      const rows =
        parsed.allRows && parsed.allRows.length > 0 ? parsed.allRows : parsed.amostraLinhas || []

      setHeaders(colunas)
      setRawRows(rows)
      setAvailableSheets(parsed.sheetNames || [])
      setSelectedSheet(
        targetSheet || parsed.selectedSheet || (parsed.sheetNames ? parsed.sheetNames[0] : ''),
      )

      // Mapeamento sugerido inteligente
      const sugerido = sugerirMapeamentoColunasForms(colunas)
      setMapeamento(sugerido)

      toast({
        title: 'Planilha carregada!',
        description: `${rows.length.toLocaleString('pt-BR')} respostas lidas com ${colunas.length} colunas detectadas.`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo'
      setUploadError(msg)
      toast({
        variant: 'destructive',
        title: 'Erro ao ler arquivo',
        description: msg,
      })
    } finally {
      setIsParsing(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    parseFile(selected)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (!dropped) return
    parseFile(dropped)
  }

  // Executar a importação definitiva
  const handleExecutarImportacao = async () => {
    if (!mapeamento.colunaCodigoCliente) {
      toast({
        variant: 'destructive',
        title: 'Coluna de código obrigatória',
        description: 'Vincule a coluna que contém o Código do Cliente ou identificação C000xxx.',
      })
      return
    }

    setIsProcessing(true)
    setUploadError(null)

    try {
      // Converte todas as linhas brutas com os normalizadores
      const itemsPayload = converterLinhasFormsParaPayload(rawRows, mapeamento)

      if (itemsPayload.length === 0) {
        throw new Error('Nenhum registro com código de cliente válido foi encontrado nas linhas.')
      }

      const res = await importarRespostasFormulario({
        items: itemsPayload,
        dryRun: false,
      })

      setResultado(res)

      toast({
        title: 'Importação concluída com sucesso!',
        description: `${res.importadas} respostas gravadas (${res.reativacoesCompletas} clientes reativados).`,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na gravação dos dados'
      setUploadError(msg)
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description: msg,
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Copiar códigos de clientes não encontrados
  const handleCopyCodigosNaoEncontrados = () => {
    if (!resultado?.clientesNaoEncontrados || resultado.clientesNaoEncontrados.length === 0) return
    const texto = resultado.clientesNaoEncontrados.join('\n')
    navigator.clipboard.writeText(texto)
    setCopiedCodes(true)
    setTimeout(() => setCopiedCodes(false), 2000)
    toast({
      title: 'Códigos copiados',
      description: `${resultado.clientesNaoEncontrados.length} códigos copiados para a área de transferência.`,
    })
  }

  // Amostra de preview (primeiras 10 linhas)
  const previewRows = rawRows.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Informações da funcionalidade */}
      <Card className="border-slate-200 shadow-sm bg-gradient-to-r from-blue-50/60 via-white to-amber-50/30">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-[#253575] flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#F18800]" />
                <span>Importação de Respostas do Formulário (Microsoft Forms / CSV / XLSX)</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 mt-1">
                Importa respostas da pesquisa/ficha de atendimento de 17 perguntas exportadas pelo
                Microsoft Forms. Reconhece operadores pelo e-mail/nome, vincula ao cliente existente
                por código (C000xxx) e grava a ficha completa em transação atômica.
              </CardDescription>
            </div>
            <Badge className="bg-[#253575] text-white text-xs px-2.5 py-1">Admin Exclusivo</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Upload Zone */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <UploadCloud className="h-4 w-4 text-[#253575]" />
            <span>Upload do Arquivo de Respostas (.CSV ou .XLSX)</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Aceita arquivos CSV (com ponto-e-vírgula <code>;</code> ou vírgula <code>,</code>) e
            planilhas Excel (.xlsx). Arraste ou clique para selecionar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-slate-50/50 flex flex-col items-center justify-center ${
              isParsing
                ? 'border-blue-400 bg-blue-50/40 cursor-wait'
                : 'border-slate-200 hover:border-[#253575] hover:bg-slate-50 cursor-pointer'
            }`}
            onClick={() => !isParsing && document.getElementById('file-forms-upload')?.click()}
          >
            <input
              id="file-forms-upload"
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              disabled={isParsing || isProcessing}
              onChange={handleFileChange}
            />
            <div className="h-12 w-12 rounded-full bg-blue-50 text-[#253575] flex items-center justify-center mb-3 shadow-inner">
              {isParsing ? (
                <RefreshCw className="h-6 w-6 animate-spin text-[#253575]" />
              ) : (
                <FileSpreadsheet className="h-6 w-6" />
              )}
            </div>

            {isParsing ? (
              <div className="space-y-2.5 w-full max-w-sm">
                <div>
                  <p className="text-sm font-semibold text-[#253575]">
                    Lendo arquivo de respostas do formulário
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{parseProgress.message}</p>
                </div>
                <Progress value={parseProgress.percent} className="h-2 bg-blue-100" />
              </div>
            ) : file ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {rawRows.length.toLocaleString('pt-BR')} linhas prontas para mapeamento e
                  importação.
                  {availableSheets.length > 1 && ` (Aba ativa: "${selectedSheet}")`}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  Clique para selecionar ou arraste o arquivo do Microsoft Forms aqui
                </p>
                <p className="text-xs text-slate-400">
                  Suporta arquivos .CSV (com delimitador ; ou ,) e planilhas .XLSX
                </p>
              </div>
            )}
          </div>

          {/* Seletor de Aba caso tenha múltiplas */}
          {availableSheets.length > 1 && file && (
            <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">Aba da Planilha:</span>
              <Select
                value={selectedSheet}
                onValueChange={(val) => {
                  setSelectedSheet(val)
                  if (file) parseFile(file, val)
                }}
                disabled={isParsing || isProcessing}
              >
                <SelectTrigger className="h-8 text-xs w-48 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSheets.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <span className="font-semibold block">Erro na importação:</span>
                <p className="text-[11px] text-rose-700 leading-relaxed font-mono">{uploadError}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Relatório Final após Execução */}
      {resultado && (
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm animate-in fade-in-50">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-sm font-bold text-emerald-950">
                Resultado do Processamento das Respostas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[11px] text-slate-500 uppercase font-semibold block">
                  Linhas Lidas
                </span>
                <span className="text-xl font-bold text-slate-800">{resultado.totalLidos}</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[11px] text-emerald-600 uppercase font-semibold block">
                  Importadas com Sucesso
                </span>
                <span className="text-xl font-bold text-emerald-700">{resultado.importadas}</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[11px] text-blue-600 uppercase font-semibold block">
                  Reativações Reais
                </span>
                <span className="text-xl font-bold text-[#253575]">
                  {resultado.reativacoesCompletas}
                </span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-emerald-100 shadow-2xs">
                <span className="text-[11px] text-amber-600 uppercase font-semibold block">
                  Duplicadas Ignoradas
                </span>
                <span className="text-xl font-bold text-amber-700">{resultado.duplicadas}</span>
              </div>
            </div>

            {/* Clientes Não Encontrados */}
            {resultado.clientesNaoEncontrados && resultado.clientesNaoEncontrados.length > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>
                      {resultado.clientesNaoEncontrados.length} cliente(s) não encontrado(s) na
                      base:
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyCodigosNaoEncontrados}
                    className="h-7 text-xs border-amber-300 text-amber-900 bg-white hover:bg-amber-100"
                  >
                    {copiedCodes ? (
                      <>
                        <Check className="h-3 w-3 mr-1 text-emerald-600" />
                        Copiados!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar Códigos
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-white/70 rounded border border-amber-200/80 font-mono text-[11px]">
                  {resultado.clientesNaoEncontrados.map((cod) => (
                    <Badge
                      key={cod}
                      variant="outline"
                      className="bg-amber-100/60 border-amber-300 text-amber-900"
                    >
                      {cod}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mapeamento de Colunas com Dropdowns */}
      {headers.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#253575]" />
                  <span>Mapeamento de Colunas ({headers.length} detectadas)</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  O sistema sugeriu automaticamente o mapeamento baseado nos títulos das perguntas
                  do Microsoft Forms. Ajuste se necessário antes de importar.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="text-xs text-emerald-700 bg-emerald-50 border-emerald-300"
              >
                Sugerido por Similaridade
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-slate-50/60 p-4 rounded-xl border border-slate-200 text-xs">
              {/* Código Cliente */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Identificação / Código Cliente</span>
                  <span className="text-[10px] text-red-600 font-bold">Obrigatório</span>
                </Label>
                <Select
                  value={mapeamento.colunaCodigoCliente}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaCodigoCliente: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300 font-mono">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">
                  Extrai C000xxx mesmo grudado no nome
                </span>
              </div>

              {/* Nome Cliente */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Nome de Cliente</Label>
                <Select
                  value={mapeamento.colunaNomeCliente}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaNomeCliente: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Email Respondente */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Email do Respondente</Label>
                <Select
                  value={mapeamento.colunaOperadorEmail}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaOperadorEmail: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">
                  Identifica o operador em users
                </span>
              </div>

              {/* Nome Respondente */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Nome do Respondente</Label>
                <Select
                  value={mapeamento.colunaOperadorNome}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaOperadorNome: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hora de início */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Hora de início</Label>
                <Select
                  value={mapeamento.colunaDataInicio}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaDataInicio: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hora de conclusão */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Hora de conclusão</Label>
                <Select
                  value={mapeamento.colunaDataConclusao}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaDataConclusao: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">
                  Usado para data e deduplicação
                </span>
              </div>

              {/* Motivo Interrupção */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Motivo da Interrupção
                </Label>
                <Select
                  value={mapeamento.colunaMotivoInterrupcao}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaMotivoInterrupcao: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Avaliação Geral */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Avaliação da Experiência Geral
                </Label>
                <Select
                  value={mapeamento.colunaAvaliacaoGeral}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaAvaliacaoGeral: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Houve Erro */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Houve Algum Erro?</Label>
                <Select
                  value={mapeamento.colunaHouveErro}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaHouveErro: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Natureza da Falha */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Natureza da Falha</Label>
                <Select
                  value={mapeamento.colunaNaturezaFalha}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaNaturezaFalha: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Setor ou Área */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Setor ou Área que Falhou
                </Label>
                <Select
                  value={mapeamento.colunaSetorFalha}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaSetorFalha: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Anexo URL */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Link de Anexo (URL)</Label>
                <Select
                  value={mapeamento.colunaAnexoUrl}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaAnexoUrl: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Necessário para Voltar */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  O que Seria Necessário para Voltar?
                </Label>
                <Select
                  value={mapeamento.colunaNecessarioVoltar}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaNecessarioVoltar: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Probabilidade de Retomada */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Probabilidade de Retomada (30d)
                </Label>
                <Select
                  value={mapeamento.colunaProbabilidadeRetomada}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaProbabilidadeRetomada: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Desfecho do Atendimento */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Desfecho do Atendimento</span>
                  <span className="text-[10px] text-amber-600 font-bold">Importante</span>
                </Label>
                <Select
                  value={mapeamento.colunaDesfecho}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaDesfecho: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300 font-semibold">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">Reativado, Agendado, etc.</span>
              </div>

              {/* Valor da Cotação */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Valor da Cotação (R$)
                </Label>
                <Select
                  value={mapeamento.colunaValorCotacao}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaValorCotacao: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">
                  Limpa R$, pontos e vírgulas
                </span>
              </div>

              {/* Peso Faturado */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Peso Faturado (Toneladas/Kg)
                </Label>
                <Select
                  value={mapeamento.colunaPesoFaturado}
                  onValueChange={(val) =>
                    setMapeamento((prev) => ({ ...prev, colunaPesoFaturado: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                    <SelectValue placeholder="Selecione a coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 block">
                  Converte kg/toneladas e isola obs
                </span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pt-2 border-t border-slate-100">
            <Button
              onClick={handleExecutarImportacao}
              disabled={isProcessing || !mapeamento.colunaCodigoCliente}
              className="bg-[#253575] hover:bg-[#142758] text-white font-semibold text-xs shadow-sm h-9 px-5"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Processando Respostas em Transação...
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5 mr-2 text-[#F18800]" />
                  Importar {rawRows.length.toLocaleString('pt-BR')} Respostas para o Sistema
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Tabela de Pré-visualização (Primeiras 10 Linhas) */}
      {previewRows.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center justify-between">
              <span>Pré-visualização das Primeiras 10 Respostas com Normalização</span>
              <span className="text-xs text-slate-400 font-normal">
                Exibindo amostra de {previewRows.length} de {rawRows.length} linhas
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Código Extraído</th>
                    <th className="py-2.5 px-3">Nome Cliente</th>
                    <th className="py-2.5 px-3">Respondente</th>
                    <th className="py-2.5 px-3">Data Conclusão</th>
                    <th className="py-2.5 px-3">Motivo</th>
                    <th className="py-2.5 px-3">Desfecho</th>
                    <th className="py-2.5 px-3 text-right">Valor Cotação</th>
                    <th className="py-2.5 px-3 text-right">Peso/Ton</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, idx) => {
                    const rawCod = row[mapeamento.colunaCodigoCliente]
                    const codExtraido = extrairCodigoCliente(rawCod)
                    const rawNome = row[mapeamento.colunaNomeCliente]
                    const rawEmail = row[mapeamento.colunaOperadorEmail]
                    const rawData = row[mapeamento.colunaDataConclusao]
                    const rawMotivo = row[mapeamento.colunaMotivoInterrupcao]
                    const rawDesfecho = row[mapeamento.colunaDesfecho]
                    const rawValor = row[mapeamento.colunaValorCotacao]
                    const valNum = normalizarValorReais(rawValor)
                    const rawPeso = row[mapeamento.colunaPesoFaturado]
                    const pesoNum = normalizarPesoToneladas(rawPeso)

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#253575]">
                          {codExtraido ? (
                            <Badge
                              variant="outline"
                              className="bg-blue-50 border-blue-200 text-[#253575]"
                            >
                              {codExtraido}
                            </Badge>
                          ) : (
                            <span className="text-rose-500 font-semibold">Não identificado</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[150px] truncate">
                          {String(rawNome || '—')}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-600 max-w-[140px] truncate"
                          title={String(rawEmail || '')}
                        >
                          {String(rawEmail || '—')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono whitespace-nowrap">
                          {String(rawData || '—')}
                        </td>
                        <td
                          className="py-2.5 px-3 text-slate-600 max-w-[160px] truncate"
                          title={String(rawMotivo || '')}
                        >
                          {String(rawMotivo || '—')}
                        </td>
                        <td className="py-2.5 px-3">
                          {rawDesfecho ? (
                            <Badge
                              variant="outline"
                              className={
                                String(rawDesfecho).toLowerCase().includes('reativado')
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : String(rawDesfecho).toLowerCase().includes('agendado')
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                              }
                            >
                              {String(rawDesfecho)}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                          {valNum > 0 ? `R$ ${valNum.toLocaleString('pt-BR')}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                          {pesoNum > 0 ? `${pesoNum.toLocaleString('pt-BR')} t` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
