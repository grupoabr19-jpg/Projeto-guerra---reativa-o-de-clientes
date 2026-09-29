import React, { useState, useEffect } from 'react'
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  FileText,
  RefreshCw,
  HelpCircle,
  Download,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchImportacoes, processSpreadsheetRows } from '@/services/api'
import type { Importacao } from '@/types'

// Mapeamento padrão esperado das colunas
interface ColumnMapping {
  codigo: string
  nome: string
  telefone: string
  whatsapp: string
  email: string
  regiao: string
  vendedor: string
  segmento: string
  ultima_compra: string
  valor_ultima_compra: string
  toneladas_historico: string
  valor_historico: string
  compras_count: string
  pedido: string
}

export default function ImportacaoPage() {
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Upload & Preview State
  const [file, setFile] = useState<File | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({
    codigo: '',
    nome: '',
    telefone: '',
    whatsapp: '',
    email: '',
    regiao: '',
    vendedor: '',
    segmento: '',
    ultima_compra: '',
    valor_ultima_compra: '',
    toneladas_historico: '',
    valor_historico: '',
    compras_count: '',
    pedido: '',
  })
  const [substituicaoTotal, setSubstituicaoTotal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<{
    total: number
    novas: number
    atualizadas: number
    rejeitadas: number
    reconciliadosFaturaram: number
    pedidosValidados: number
    pedidosDivergentes: number
    erros: Array<{ linha: number; codigo: string; erro: string }>
    divergencias: Array<{
      codigo: string
      nome: string
      pedidoEsperado: string
      pedidoPlanilha: string
    }>
  } | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const data = await fetchImportacoes()
      setImportacoes(data)
    } catch (err) {
      console.error('Falha ao carregar histórico:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  // Parse de arquivo CSV ou XLSX puro no navegador
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

  const parseFile = async (f: File) => {
    setFile(f)
    setImportResult(null)

    // Se for CSV ou arquivo texto delimitado:
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      if (!content) return

      // Trata CSV com delimitador vírgula ou ponto-e-vírgula
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length < 2) {
        alert('O arquivo não contém linhas de dados válidas.')
        return
      }

      // Descobre delimitador
      const firstLine = lines[0]
      const delimiter = firstLine.includes(';') ? ';' : ','

      // Split com suporte a aspas
      const parseCSVLine = (line: string) => {
        const result = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes
          } else if (char === delimiter && !inQuotes) {
            result.push(current.trim().replace(/^["']|["']$/g, ''))
            current = ''
          } else {
            current += char
          }
        }
        result.push(current.trim().replace(/^["']|["']$/g, ''))
        return result
      }

      const rawHeaders = parseCSVLine(lines[0])
      setHeaders(rawHeaders)

      const parsedRows: Record<string, unknown>[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.length === 0 || cols.every((c) => !c)) continue
        const rowObj: Record<string, unknown> = {}
        rawHeaders.forEach((h, idx) => {
          rowObj[h] = cols[idx] !== undefined ? cols[idx] : ''
        })
        parsedRows.push(rowObj)
      }

      setRawRows(parsedRows)

      // Auto-detect mappings baseado nos nomes das colunas
      const autoMap: ColumnMapping = {
        codigo: rawHeaders.find((h) => /c[oó]d|id|cliente/i.test(h)) || '',
        nome: rawHeaders.find((h) => /nome|raz[aã]o|empresa/i.test(h)) || '',
        telefone: rawHeaders.find((h) => /tel|fone/i.test(h) && !/whats/i.test(h)) || '',
        whatsapp: rawHeaders.find((h) => /whats|celular|wpp/i.test(h)) || '',
        email: rawHeaders.find((h) => /mail/i.test(h)) || '',
        regiao: rawHeaders.find((h) => /regi[aã]o|uf|estado|territ[oó]rio/i.test(h)) || '',
        vendedor: rawHeaders.find((h) => /vendedor|consultor|rep/i.test(h)) || '',
        segmento: rawHeaders.find((h) => /segmento|setor|ramo/i.test(h)) || '',
        ultima_compra: rawHeaders.find((h) => /[uú]ltim.*(compra|fatur)/i.test(h)) || '',
        valor_ultima_compra: rawHeaders.find((h) => /valor.*[uú]ltim|r\$|ticket/i.test(h)) || '',
        toneladas_historico: rawHeaders.find((h) => /ton|peso|volume/i.test(h)) || '',
        valor_historico: rawHeaders.find((h) => /valor.*hist|total.*comp/i.test(h)) || '',
        compras_count: rawHeaders.find((h) => /freq|compras|qtd/i.test(h)) || '',
        pedido: rawHeaders.find((h) => /pedido|nf|fatura/i.test(h)) || '',
      }

      setMapping(autoMap)
    }

    reader.readAsText(f, 'ISO-8859-1') // Suporta acentos típicos de planilhas exportadas de ERPs brasileiros
  }

  // Enviar para o backend com processamento atômico e upsert por código CXXXXXX
  const handleConfirmImport = async () => {
    if (!file || rawRows.length === 0) return

    if (!mapping.codigo || !mapping.nome) {
      alert(
        'As colunas de Código do Cliente e Nome são estritamente obrigatórias para o mapeamento!',
      )
      return
    }

    setIsProcessing(true)
    try {
      // Converte rawRows usando o mapping escolhido
      const mappedRows = rawRows.map((r) => ({
        codigo: r[mapping.codigo] || '',
        nome: r[mapping.nome] || '',
        telefone: mapping.telefone ? r[mapping.telefone] : '',
        whatsapp: mapping.whatsapp ? r[mapping.whatsapp] : '',
        email: mapping.email ? r[mapping.email] : '',
        regiao: mapping.regiao
          ? String(r[mapping.regiao] || '')
              .trim()
              .toUpperCase()
          : 'Sem Região',
        vendedor: mapping.vendedor ? r[mapping.vendedor] : '',
        segmento: mapping.segmento ? r[mapping.segmento] : '',
        ultima_compra: mapping.ultima_compra ? r[mapping.ultima_compra] : '',
        valor_ultima_compra: mapping.valor_ultima_compra ? r[mapping.valor_ultima_compra] : 0,
        toneladas_historico: mapping.toneladas_historico ? r[mapping.toneladas_historico] : 0,
        valor_historico: mapping.valor_historico ? r[mapping.valor_historico] : 0,
        compras_count: mapping.compras_count ? r[mapping.compras_count] : 1,
        pedido: mapping.pedido ? r[mapping.pedido] : '',
      }))

      const response = await processSpreadsheetRows({
        rows: mappedRows,
        fileName: file.name,
        substituicaoTotal,
      })

      setImportResult(response.resumo)
      loadHistory()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar importação'
      alert(`Erro: ${msg}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Baixar modelo de planilha
  const downloadSampleTemplate = () => {
    const csvContent =
      'codigo;nome;telefone;whatsapp;email;regiao;vendedor;segmento;ultima_compra;valor_ultima_compra;toneladas_historico;valor_historico;compras_count\n' +
      'C009001;Metalúrgica Vanguarda SA;11988880000;11988880000;compras@vanguarda.ind.br;POÇOS DE CALDAS;JOSÉ FELIPE;Metalurgia;2024-06-10;45000.00;30.5;180000.00;6\n' +
      'C009002;Obras & Fundações Triângulo;31977771111;31977771111;diretoria@trianguloobras.com;POUSO ALEGRE;PAOLA;Construção;2024-08-20;62000.00;45.0;250000.00;8\n' +
      'C009003;Mineração Rio Verde;41999992222;41999992222;suprimentos@rioverde.com;BRAGANÇA;ALESSANDRO;Mineração;2024-05-15;88000.00;70.0;380000.00;12'

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'modelo_importacao_projeto_guerra.csv'
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Importação e Reconciliação de Planilhas
          </h2>
          <p className="text-xs text-slate-500">
            Upload de arquivos CSV/XLSX com validação por código (CXXXXXX), sem duplicidade e com
            reconciliação automática.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadSampleTemplate}
          className="h-8 text-xs"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Baixar Planilha Modelo
        </Button>
      </div>

      {/* Upload Zone Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <UploadCloud className="h-4 w-4 text-blue-600" />
            <span>Upload de Nova Planilha de Inativos</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Arraste ou selecione a planilha do ERP. A chave única é o Código do Cliente (upsert sem
            duplicar).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 text-center transition-colors bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer"
            onClick={() => document.getElementById('file-upload-input')?.click()}
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-inner">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            {file ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {rawRows.length} linhas detectadas no arquivo. Pronto para mapear e processar.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  Clique para selecionar ou arraste o arquivo CSV/XLSX aqui
                </p>
                <p className="text-xs text-slate-400">
                  Suporta arquivos delimitados por vírgula ou ponto-e-vírgula com codificação padrão
                  brasileira.
                </p>
              </div>
            )}
          </div>

          {/* Configuração de substituição total */}
          <div className="flex items-start space-x-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <Checkbox
              id="subst-total"
              checked={substituicaoTotal}
              onCheckedChange={(checked) => setSubstituicaoTotal(Boolean(checked))}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label
                htmlFor="subst-total"
                className="text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Esta planilha substitui os dados existentes da base?
              </Label>
              <p className="text-[11px] text-slate-500">
                Se ativado, clientes que estavam no status "Na Base" mas NÃO constarem nesta nova
                planilha serão marcados automaticamente como "Suspenso".
              </p>
            </div>
          </div>

          {/* Mapeamento de Colunas */}
          {headers.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  Mapeamento de Colunas Detectadas
                </h4>
                <span className="text-[11px] text-slate-400">
                  Ajuste os vínculos caso as colunas da sua planilha tenham nomes diferentes.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                {/* Código */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span>Código do Cliente *</span>
                    <span className="text-[10px] text-red-500 font-bold">Obrigatório</span>
                  </Label>
                  <Select
                    value={mapping.codigo}
                    onValueChange={(val) => setMapping({ ...mapping, codigo: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Nome */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span>Razão Social / Nome *</span>
                    <span className="text-[10px] text-red-500 font-bold">Obrigatório</span>
                  </Label>
                  <Select
                    value={mapping.nome}
                    onValueChange={(val) => setMapping({ ...mapping, nome: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Região */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Região / Território</Label>
                  <Select
                    value={mapping.regiao}
                    onValueChange={(val) => setMapping({ ...mapping, regiao: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Vendedor */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Vendedor Carteira</Label>
                  <Select
                    value={mapping.vendedor}
                    onValueChange={(val) => setMapping({ ...mapping, vendedor: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Telefone */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Telefone Fixo / PABX</Label>
                  <Select
                    value={mapping.telefone}
                    onValueChange={(val) => setMapping({ ...mapping, telefone: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* WhatsApp */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">WhatsApp / Celular</Label>
                  <Select
                    value={mapping.whatsapp}
                    onValueChange={(val) => setMapping({ ...mapping, whatsapp: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Data Última Compra */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Último Faturamento</Label>
                  <Select
                    value={mapping.ultima_compra}
                    onValueChange={(val) => setMapping({ ...mapping, ultima_compra: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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

                {/* Valor R$ / Toneladas */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Valor R$ Última Compra
                  </Label>
                  <Select
                    value={mapping.valor_ultima_compra}
                    onValueChange={(val) => setMapping({ ...mapping, valor_ultima_compra: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
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
              </div>
            </div>
          )}

          {/* Prévia das primeiras 5 linhas */}
          {rawRows.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Prévia das Primeiras Linhas Carregadas
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 text-slate-600 font-medium sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5 border-b">#</th>
                      {headers.slice(0, 7).map((h) => (
                        <th key={h} className="py-2 px-2.5 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 text-slate-400">{idx + 1}</td>
                        {headers.slice(0, 7).map((h) => (
                          <td
                            key={h}
                            className="py-1.5 px-2.5 text-slate-700 truncate max-w-[150px]"
                          >
                            {String(row[h] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Relatório do resultado da importação */}
          {importResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Importação e Reconciliação Concluída com Sucesso!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Total Processado</span>
                  <span className="font-bold text-slate-800 text-base">{importResult.total}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Novos Clientes</span>
                  <span className="font-bold text-emerald-600 text-base">{importResult.novas}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Atualizados (Upsert)</span>
                  <span className="font-bold text-blue-600 text-base">
                    {importResult.atualizadas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Reconciliados (Faturaram)</span>
                  <span className="font-bold text-purple-600 text-base">
                    {importResult.reconciliadosFaturaram}
                  </span>
                </div>
              </div>

              {/* Erros por linha */}
              {importResult.erros && importResult.erros.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-rose-700">
                    Linhas rejeitadas ({importResult.rejeitadas}):
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] bg-rose-50/80 p-2 rounded border border-rose-200">
                    {importResult.erros.map((err, i) => (
                      <div key={i} className="text-rose-700">
                        • Linha {err.linha} (Código {err.codigo || 'vazio'}): {err.erro}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end space-x-3 border-t border-slate-100 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFile(null)
              setRawRows([])
              setHeaders([])
              setImportResult(null)
            }}
            disabled={!file || isProcessing}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmImport}
            disabled={!file || rawRows.length === 0 || isProcessing}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Processando e Validando...
              </>
            ) : (
              'Confirmar e Executar Importação'
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Histórico de Cargas Anteriores */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <span>Histórico de Planilhas Subidas</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Registro das importações, reconciliações e divergências de pedidos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="py-6 text-center text-xs text-slate-400">Carregando histórico...</div>
          ) : importacoes.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">
              Nenhuma planilha importada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Nome do Arquivo</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3">Novos</th>
                    <th className="py-2.5 px-3">Atualizados</th>
                    <th className="py-2.5 px-3">Reconciliados</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importacoes.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {item.nome_arquivo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {new Date(item.created).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{item.linhas_total}</td>
                      <td className="py-2.5 px-3 text-emerald-600 font-semibold">
                        {item.linhas_importadas}
                      </td>
                      <td className="py-2.5 px-3 text-blue-600 font-medium">
                        {item.linhas_atualizadas}
                      </td>
                      <td className="py-2.5 px-3 text-purple-600 font-medium">
                        {item.reconciliados_faturaram || 0} faturaram
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={
                            item.status === 'concluida'
                              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                              : 'border-red-500 text-red-700 bg-red-50'
                          }
                        >
                          {item.status}
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
