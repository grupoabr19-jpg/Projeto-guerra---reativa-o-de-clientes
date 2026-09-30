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
  Sparkles,
  Layers,
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
import { fetchImportacoes, processSpreadsheetRows, fetchConfiguracoes } from '@/services/api'
import { parseSpreadsheetWithSheetJS, type ParseProgress } from '@/lib/sheetParser'
import type { Importacao } from '@/types'
import { normalizarSegmento } from '@/lib/segmentos'
import { Progress } from '@/components/ui/progress'

// Normaliza strings para comparação case/espaço/acento insensitive
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos)
    .replace(/[^a-z0-9]/g, ' ') // substitui pontuação por espaço
    .replace(/\s+/g, ' ')
    .trim()
}

// Mapeamento padrão esperado das colunas
interface ColumnMapping {
  codigo: string
  nome: string
  telefone: string
  whatsapp: string
  email: string
  cidade: string
  estado_uf: string
  regiao: string
  vendedor: string
  segmento: string
  ultima_compra: string
  valor_ultima_compra: string
  toneladas_historico: string
  valor_historico: string
  compras_count: string
  pedido: string
  dias_sem_faturar: string
  faixa: string
}

import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ImportacaoPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Upload & Preview State
  const [file, setFile] = useState<File | null>(null)
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [detectedLayout, setDetectedLayout] = useState<{
    nome: string
    tipo_base: string
    descricao: string
  } | null>(null)
  const [modoImportacao, setModoImportacao] = useState<
    'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'
  >('base_mestre')
  const [modoAlteradoManualmente, setModoAlteradoManualmente] = useState(false)
  const [templatesConfig, setTemplatesConfig] = useState<any[]>([])

  const [mapping, setMapping] = useState<ColumnMapping>({
    codigo: '',
    nome: '',
    telefone: '',
    whatsapp: '',
    email: '',
    cidade: '',
    estado_uf: '',
    regiao: '',
    vendedor: '',
    segmento: '',
    ultima_compra: '',
    valor_ultima_compra: '',
    toneladas_historico: '',
    valor_historico: '',
    compras_count: '',
    pedido: '',
    dias_sem_faturar: '',
    faixa: '',
  })
  const [substituicaoTotal, setSubstituicaoTotal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState<{
    percent: number
    message: string
  }>({ percent: 0, message: '' })
  const [processProgress, setProcessProgress] = useState<{
    percent: number
    message: string
    processed: number
    total: number
  }>({ percent: 0, message: '', processed: 0, total: 0 })
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    total: number
    modo: string
    novas: number
    atualizadas: number
    inalteradas: number
    rejeitadas: number
    matchesNome: number
    semCorrespondencia: number
    semCorrespondenciaLista?: Array<{
      linha: number
      nome: string
      cidade: string
      uf: string
      pedido: string
      valor: number
    }>
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
    if (user && user.role === 'operador') {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    // Redirecionamento estrito de operadores e líderes de rota: não têm acesso ao módulo de importação
    if (user && (user.role === 'operador' || user.role === 'lider')) {
      navigate('/meu-painel', { replace: true })
    }
  }, [user, navigate])

  if (user?.role === 'operador' || user?.role === 'lider') {
    return null
  }
  const loadTemplates = async () => {
    try {
      const configs = await fetchConfiguracoes()
      const tplCfg = configs.find((c) => c.chave === 'templates_mapeamento_importacao')
      if (tplCfg && Array.isArray(tplCfg.valor)) {
        setTemplatesConfig(tplCfg.valor)
      }
    } catch (err) {
      console.error('Falha ao carregar templates de mapeamento:', err)
    }
  }

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

  const matchTemplate = (rawHeaders: string[]) => {
    const normalizedHeaders = rawHeaders.map((h) => ({
      original: h,
      norm: normalizeHeader(h),
    }))

    // Template 0: Consolidado Projeto Guerra / Cruzamento
    // Assinatura: 'cod cliente', 'fat 12m', 'peso nf', 'margem media', 'freq compras'
    const hasConsolidadoGuerra = normalizedHeaders.some(
      (h) =>
        (h.norm.includes('fat 12m') ||
          h.norm.includes('peso nf') ||
          h.norm.includes('margem media')) &&
        normalizedHeaders.some(
          (item) => item.norm.includes('cod') && item.norm.includes('cliente'),
        ),
    )

    if (hasConsolidadoGuerra) {
      setDetectedLayout({
        nome: 'Base Consolidada Projeto Guerra (Cruzada)',
        tipo_base: 'clientes',
        descricao:
          'Planilha consolidada detectada: Código, Razão Social, Região, Vendedor, Segmento, Fat 12M R$, Peso NF, Margem %, Frequência e Último Pedido.',
      })

      const findHeader = (predicate: (norm: string) => boolean) =>
        normalizedHeaders.find((h) => predicate(h.norm))?.original || ''

      return {
        codigo: findHeader((n) => n.includes('cod') && n.includes('cliente')),
        nome: findHeader((n) => n.includes('nome') || n.includes('razao')),
        telefone: findHeader(
          (n) => n.includes('celular') || n.includes('telefone') || n.includes('contato'),
        ),
        whatsapp: findHeader((n) => n.includes('whatsapp') || n.includes('celular')),
        email: findHeader((n) => n.includes('mail')),
        cidade: findHeader((n) => n === 'cidade' || n.includes('cidade')),
        estado_uf: findHeader((n) => n === 'estado' || n === 'uf'),
        regiao: findHeader(
          (n) => n === 'regiao' || (n.includes('regiao') && !n.includes('codigo')),
        ),
        vendedor: findHeader(
          (n) => n === 'vendedor' || (n.includes('vendedor') && !n.includes('tipo')),
        ),
        segmento: findHeader((n) => n.includes('segmento')),
        ultima_compra: findHeader(
          (n) =>
            n.includes('ultima venda') ||
            n.includes('ultimo faturamento') ||
            n.includes('ultima compra'),
        ),
        valor_ultima_compra: findHeader(
          (n) => n.includes('fat 12m') || n.includes('fat r') || n.includes('faturamento'),
        ),
        toneladas_historico: findHeader(
          (n) => n.includes('peso nf') || n.includes('tonelagem') || n.includes('peso'),
        ),
        valor_historico: findHeader((n) => n.includes('fat 12m') || n.includes('valor historico')),
        compras_count: findHeader((n) => n.includes('freq') || n.includes('pedidos 12m')),
        pedido: findHeader((n) => n.includes('ultimo pedido') || n === 'pedido'),
        dias_sem_faturar: findHeader((n) => n.includes('dias sem') || n.includes('menor dias')),
        faixa: findHeader((n) => n.includes('faixa')),
      }
    }

    // Template 1: Clientes Inativos
    // Assinatura: 'cod cliente', 'nome do cliente', 'menor dias ultima venda', 'faixa ultima compra'
    const hasCodCliente = normalizedHeaders.some(
      (h) => h.norm.includes('cod') && h.norm.includes('cliente'),
    )
    const hasNomeCliente = normalizedHeaders.some(
      (h) => h.norm.includes('nome') && h.norm.includes('cliente'),
    )
    const hasMenorDias = normalizedHeaders.some(
      (h) => h.norm.includes('menor dias') || (h.norm.includes('dias') && h.norm.includes('venda')),
    )
    const hasFaixaCompra = normalizedHeaders.some(
      (h) => h.norm.includes('faixa') && h.norm.includes('compra'),
    )

    if (hasCodCliente && (hasNomeCliente || hasMenorDias || hasFaixaCompra)) {
      setDetectedLayout({
        nome: 'Clientes Inativos',
        tipo_base: 'clientes',
        descricao:
          'Layout de clientes inativos detectado automaticamente: Cód. Cliente como chave única, Menor dias última venda, Celular e Região pré-configurados.',
      })

      const findHeader = (predicate: (norm: string) => boolean) =>
        normalizedHeaders.find((h) => predicate(h.norm))?.original || ''

      return {
        codigo: findHeader((n) => n.includes('cod') && n.includes('cliente')),
        nome: findHeader(
          (n) => n.includes('nome do cliente') || (n.includes('nome') && !n.includes('vendedor')),
        ),
        telefone: findHeader((n) => n.includes('celular') || n.includes('telefone')),
        whatsapp: findHeader((n) => n.includes('celular') || n.includes('whatsapp')),
        email: findHeader((n) => n.includes('mail')),
        cidade: findHeader((n) => n === 'cidade' || n.includes('cidade')),
        estado_uf: findHeader((n) => n === 'estado' || n === 'uf'),
        regiao: findHeader(
          (n) => n === 'regiao' || (n.includes('regiao') && !n.includes('codigo')),
        ),
        vendedor: findHeader(
          (n) => n === 'vendedor' || (n.includes('vendedor') && !n.includes('tipo')),
        ),
        segmento: findHeader((n) => n.includes('segmento')),
        ultima_compra: findHeader(
          (n) =>
            n.includes('criacao pn') || n.includes('ultima venda') || n.includes('ultima compra'),
        ),
        valor_ultima_compra: findHeader((n) => n.includes('limite') && n.includes('credito')),
        toneladas_historico: '',
        valor_historico: '',
        compras_count: '',
        pedido: '',
        dias_sem_faturar: findHeader((n) => n.includes('menor dias')),
        faixa: findHeader((n) => n.includes('faixa') && n.includes('compra')),
      }
    }

    // Template 2: Gestão da Produção — Faturamento
    // Assinatura: 'pedido', 'fat r', 'data nota fiscal', 'canal', 'cliente'
    const hasPedido = normalizedHeaders.some(
      (h) => h.norm === 'pedido' || h.norm.includes('pedido'),
    )
    const hasFat = normalizedHeaders.some(
      (h) => h.norm.includes('fat r') || h.norm.includes('faturamento'),
    )
    const hasNF = normalizedHeaders.some((h) => h.norm === 'nf' || h.norm.includes('nota fiscal'))
    const hasCanal = normalizedHeaders.some((h) => h.norm === 'canal' || h.norm.includes('canal'))

    if (hasFat || (hasPedido && (hasNF || hasCanal))) {
      setDetectedLayout({
        nome: 'Gestão da Produção — Faturamento',
        tipo_base: 'faturamento',
        descricao:
          'Layout de faturamento detectado: "Cliente" mapeado para Razão Social / Nome. Sem código de cliente — importação no modo Faturamento/Reconciliação.',
      })

      const findHeader = (predicate: (norm: string) => boolean) =>
        normalizedHeaders.find((h) => predicate(h.norm))?.original || ''

      return {
        codigo: '',
        nome: findHeader(
          (n) =>
            n === 'cliente' ||
            n === 'nome do cliente' ||
            (n.includes('cliente') && !n.includes('cod')),
        ),
        telefone: '',
        whatsapp: '',
        email: '',
        cidade: findHeader((n) => n === 'cidade'),
        estado_uf: findHeader((n) => n === 'uf' || n === 'estado'),
        regiao: findHeader((n) => n === 'regiao'),
        vendedor: findHeader((n) => n === 'vendedor'),
        segmento: findHeader(
          (n) => n === 'familia' || n.includes('familia') || n.includes('segmento'),
        ),
        ultima_compra: findHeader(
          (n) =>
            n.includes('data documento') ||
            n.includes('data entrada') ||
            n.includes('data nota fiscal') ||
            n.includes('data entrega romaneio'),
        ),
        valor_ultima_compra: findHeader((n) => n.includes('fat r') || n === 'total'),
        toneladas_historico: findHeader((n) => n.includes('peso nf') || n === 'peso'),
        valor_historico: findHeader((n) => n === 'total'),
        compras_count: '',
        pedido: findHeader((n) => n === 'pedido' || n.includes('pedido')),
        dias_sem_faturar: '',
        faixa: '',
      }
    }

    // Template 3: Margem GABR (Enriquecimento)
    const isMargemFile =
      (file?.name && /margem/i.test(file.name)) ||
      normalizedHeaders.some(
        (h) =>
          h.norm.includes('margem') ||
          h.norm.includes('mb %') ||
          h.norm.includes('mrg') ||
          h.norm.includes('rentabilidade') ||
          h.norm.includes('lucro') ||
          (h.norm.includes('mb') && h.norm.includes('reais')),
      )
    if (isMargemFile) {
      setDetectedLayout({
        nome: 'Margem GABR (Enriquecimento)',
        tipo_base: 'margem',
        descricao:
          'Planilha de Margem detectada: atualização de margem média (%) e margem em reais em clientes existentes (sem criar novos clientes nem alterar fila de atendimento).',
      })

      const findHeader = (predicate: (norm: string) => boolean) =>
        normalizedHeaders.find((h) => predicate(h.norm))?.original || ''

      return {
        codigo: findHeader(
          (n) =>
            (n.includes('cod') && n.includes('cliente')) || n === 'codigo' || n === 'cod_cliente',
        ),
        nome: findHeader(
          (n) =>
            (n.includes('cliente') && !n.includes('cod') && !n.includes('tipo')) ||
            n.includes('nome') ||
            n.includes('razao'),
        ),
        telefone: '',
        whatsapp: '',
        email: '',
        cidade: findHeader((n) => n === 'cidade' || n.includes('municipio')),
        estado_uf: findHeader((n) => n === 'uf' || n === 'estado'),
        regiao: findHeader(
          (n) => n === 'regiao' || (n.includes('regiao') && !n.includes('codigo')),
        ),
        vendedor: findHeader(
          (n) => n === 'vendedor' || (n.includes('vendedor') && !n.includes('tipo')),
        ),
        segmento: findHeader((n) => n.includes('segmento')),
        ultima_compra: '',
        valor_ultima_compra: '',
        toneladas_historico: findHeader(
          (n) => n.includes('peso nf') || n.includes('peso') || n.includes('volume'),
        ),
        valor_historico: findHeader(
          (n) => n.includes('fat r') || n.includes('faturamento') || n.includes('valor'),
        ),
        compras_count: '',
        pedido: '',
        dias_sem_faturar: '',
        faixa: '',
      }
    }

    // Fallback genérico inteligente
    setDetectedLayout(null)
    const findHeader = (regex: RegExp) => rawHeaders.find((h) => regex.test(h)) || ''
    return {
      codigo: findHeader(/c[oó]d|id|cliente/i),
      nome: findHeader(/nome|raz[aã]o|empresa/i),
      telefone: findHeader(/tel|fone/i),
      whatsapp: findHeader(/whats|celular|wpp/i),
      email: findHeader(/mail/i),
      cidade: findHeader(/cidade|munic[ií]pio/i),
      estado_uf: findHeader(/^uf$|^estado$/i),
      regiao: findHeader(/regi[aã]o|territ[oó]rio/i),
      vendedor: findHeader(/vendedor|consultor|rep/i),
      segmento: findHeader(/segmento|setor|ramo/i),
      ultima_compra: findHeader(/[uú]ltim.*(compra|fatur|venda)/i),
      valor_ultima_compra: findHeader(/valor.*[uú]ltim|r\$|ticket/i),
      toneladas_historico: findHeader(/ton|peso|volume/i),
      valor_historico: findHeader(/valor.*hist|total.*comp/i),
      compras_count: findHeader(/freq|compras|qtd/i),
      pedido: findHeader(/pedido|nf|fatura/i),
      dias_sem_faturar: findHeader(/dias.*sem|menor.*dias/i),
      faixa: findHeader(/faixa/i),
    }
  }

  const parseFile = async (f: File, overrideSheet?: string) => {
    setFile(f)
    setImportResult(null)
    setDetectedLayout(null)
    setModoAlteradoManualmente(false)
    setUploadError(null)
    setIsParsing(true)
    setParseProgress({ percent: 10, message: 'Iniciando leitura em segundo plano (Web Worker)...' })

    try {
      // Se não houver overrideSheet explícito mas houver uma selectedSheet anterior do mesmo arquivo, respeita
      const sheetToParse = overrideSheet || selectedSheet || undefined
      const parsed = await parseSpreadsheetWithSheetJS(
        f,
        20,
        (p: ParseProgress) => {
          setParseProgress({
            percent: p.percent,
            message: p.message,
          })
        },
        { mode: 'full_rows', targetSheet: sheetToParse },
      )

      const rows =
        parsed.allRows && parsed.allRows.length > 0 ? parsed.allRows : parsed.amostraLinhas

      if (!rows || rows.length === 0) {
        throw new Error('A planilha selecionada está vazia ou não contém dados válidos.')
      }

      setHeaders(parsed.colunasDetectadas)
      setRawRows(rows)
      setAvailableSheets(parsed.sheetNames || [])
      setSelectedSheet(parsed.selectedSheet || overrideSheet || parsed.sheetNames?.[0] || '')

      const autoMap = matchTemplate(parsed.colunasDetectadas)
      setMapping(autoMap)

      // Inferência inicial de modo com base no layout detectado e mapeamento
      // Note que se o arquivo for de Margem ou contiver layout 'margem', deve priorizar Enriquecimento (Margem)
      const isMargem =
        (f.name && /margem/i.test(f.name)) ||
        parsed.colunasDetectadas.some((c) => /margem|mb %|mrg/i.test(c))
      if (isMargem) {
        setModoImportacao('enriquecimento_margem')
      } else if (autoMap.codigo && autoMap.nome) {
        setModoImportacao('base_mestre')
      } else if (!autoMap.codigo && autoMap.nome) {
        setModoImportacao('faturamento_reconciliacao')
      }
    } catch (err: unknown) {
      console.error('Erro ao ler planilha na Importação:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao processar arquivo'
      setUploadError(msg)
    } finally {
      setIsParsing(false)
    }
  }

  // Determinar o modo efetivo de importação: se o usuário não escolheu explicitamente, inferir
  const getEffectiveModo = () => {
    if (modoAlteradoManualmente) return modoImportacao
    if (detectedLayout?.tipo_base === 'margem' || (file?.name && /margem/i.test(file.name))) {
      return 'enriquecimento_margem'
    }
    if (mapping.codigo && mapping.nome) return 'base_mestre'
    if (!mapping.codigo && mapping.nome) return 'faturamento_reconciliacao'
    return modoImportacao
  }

  const effectiveModo = getEffectiveModo()

  // Enviar para o backend em chunks seguros com atualização de progresso contínua
  const handleConfirmImport = async () => {
    if (!file || rawRows.length === 0) return

    // Validação flexível: pelo menos UM dos dois (Código ou Nome) é obrigatório
    if (!mapping.codigo && !mapping.nome) {
      setUploadError(
        'Mapeamento incompleto: pelo menos um dos campos "Código do Cliente" ou "Razão Social / Nome" deve ser vinculado!',
      )
      return
    }

    // Se o modo for Base Mestre explicitamente, exige ambos
    if (effectiveModo === 'base_mestre' && (!mapping.codigo || !mapping.nome)) {
      setUploadError(
        'Para importação como "Base Mestre", tanto o Código do Cliente quanto a Razão Social / Nome são obrigatórios.',
      )
      return
    }

    setIsProcessing(true)
    setUploadError(null)

    try {
      // Converte rawRows usando o mapping escolhido + dados adicionais de cruzamento (gatilhos de fechamento)
      const mappedRows = rawRows.map((r) => {
        const findVal = (terms: string[]) => {
          for (const key of Object.keys(r)) {
            const lk = key.toLowerCase()
            if (terms.some((t) => lk.includes(t))) return r[key]
          }
          return undefined
        }

        const canalVal = findVal(['canal'])
        const margemMediaVal = findVal(['margem media', 'margem %', 'margem_media'])
        const margemReaisVal = findVal(['margem r$', 'margem reais', 'margem_reais'])
        const pesoNfVal = findVal(['peso nf', 'tonelagem', 'peso_nf'])
        const fat12mVal = findVal(['fat 12m', 'fat r$', 'faturamento 12m'])
        const freqComprasVal = findVal(['freq compras', 'frequencia', 'freq 12m'])
        const tipoVendedorVal = findVal(['tipo vendedor', 'tipo de vendedor'])

        return {
          codigo: r[mapping.codigo] || '',
          nome: r[mapping.nome] || '',
          telefone: mapping.telefone ? r[mapping.telefone] : '',
          whatsapp: mapping.whatsapp ? r[mapping.whatsapp] : '',
          email: mapping.email ? r[mapping.email] : '',
          cidade: mapping.cidade ? r[mapping.cidade] : '',
          estado: mapping.estado_uf ? r[mapping.estado_uf] : '',
          regiao: mapping.regiao
            ? String(r[mapping.regiao] || '')
                .trim()
                .toUpperCase()
            : 'Sem Região',
          vendedor: mapping.vendedor ? r[mapping.vendedor] : '',
          segmento: mapping.segmento ? normalizarSegmento(String(r[mapping.segmento] || '')) : '',
          ultima_compra: mapping.ultima_compra ? r[mapping.ultima_compra] : '',
          valor_ultima_compra: mapping.valor_ultima_compra ? r[mapping.valor_ultima_compra] : 0,
          toneladas_historico: mapping.toneladas_historico
            ? r[mapping.toneladas_historico]
            : pesoNfVal || 0,
          valor_historico: mapping.valor_historico ? r[mapping.valor_historico] : fat12mVal || 0,
          compras_count: mapping.compras_count ? r[mapping.compras_count] : freqComprasVal || 1,
          pedido: mapping.pedido ? r[mapping.pedido] : '',
          dias_sem_faturar: mapping.dias_sem_faturar ? r[mapping.dias_sem_faturar] : '',
          faixa: mapping.faixa ? r[mapping.faixa] : '',
          canal: canalVal ? String(canalVal) : undefined,
          margem_media_perc: margemMediaVal
            ? Number(String(margemMediaVal).replace('%', '').replace(',', '.'))
            : undefined,
          margem_reais: margemReaisVal
            ? Number(String(margemReaisVal).replace(',', '.'))
            : undefined,
          peso_nf_tonelagem: pesoNfVal ? Number(String(pesoNfVal).replace(',', '.')) : undefined,
          fat_12m_reais: fat12mVal ? Number(String(fat12mVal).replace(',', '.')) : undefined,
          frequencia_compras_12m: freqComprasVal ? Number(freqComprasVal) : undefined,
          tipo_vendedor: tipoVendedorVal ? String(tipoVendedorVal) : undefined,
        }
      })

      // Envio em lotes (chunks) de 2.000 linhas para garantir que não estoure tempo limite HTTP do backend
      const CHUNK_SIZE = 2000
      const totalRows = mappedRows.length
      const totalChunks = Math.ceil(totalRows / CHUNK_SIZE)

      const consolidatedResumo = {
        total: totalRows,
        modo: effectiveModo,
        novas: 0,
        atualizadas: 0,
        inalteradas: 0,
        rejeitadas: 0,
        matchesNome: 0,
        semCorrespondencia: 0,
        semCorrespondenciaLista: [] as Array<{
          linha: number
          nome: string
          cidade: string
          uf: string
          pedido: string
          valor: number
        }>,
        reconciliadosFaturaram: 0,
        pedidosValidados: 0,
        pedidosDivergentes: 0,
        erros: [] as Array<{ linha: number; codigo: string; erro: string }>,
        divergencias: [] as Array<{
          codigo: string
          nome: string
          pedidoEsperado: string
          pedidoPlanilha: string
        }>,
      }

      for (let c = 0; c < totalChunks; c++) {
        const start = c * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, totalRows)
        const chunk = mappedRows.slice(start, end)

        const pct = Math.round(((c + 1) / totalChunks) * 100)
        setProcessProgress({
          percent: pct,
          message: `Enviando lote ${c + 1} de ${totalChunks} (${start.toLocaleString('pt-BR')} a ${end.toLocaleString('pt-BR')} linhas)...`,
          processed: end,
          total: totalRows,
        })

        // Apenas no último chunk aplicamos a substituição total se habilitada
        const isLastChunk = c === totalChunks - 1
        const response = await processSpreadsheetRows({
          rows: chunk,
          fileName: `${file.name} (Lote ${c + 1}/${totalChunks})`,
          substituicaoTotal: substituicaoTotal && isLastChunk,
          modoImportacao: effectiveModo,
        })

        if (response.resumo) {
          consolidatedResumo.novas += response.resumo.novas || 0
          consolidatedResumo.atualizadas += response.resumo.atualizadas || 0
          consolidatedResumo.inalteradas += response.resumo.inalteradas || 0
          consolidatedResumo.rejeitadas += response.resumo.rejeitadas || 0
          consolidatedResumo.matchesNome += response.resumo.matchesNome || 0
          consolidatedResumo.semCorrespondencia += response.resumo.semCorrespondencia || 0
          consolidatedResumo.reconciliadosFaturaram += response.resumo.reconciliadosFaturaram || 0
          consolidatedResumo.pedidosValidados += response.resumo.pedidosValidados || 0
          consolidatedResumo.pedidosDivergentes += response.resumo.pedidosDivergentes || 0
          if (Array.isArray(response.resumo.erros)) {
            consolidatedResumo.erros.push(...response.resumo.erros)
          }
          if (Array.isArray(response.resumo.divergencias)) {
            consolidatedResumo.divergencias.push(...response.resumo.divergencias)
          }
          if (Array.isArray(response.resumo.semCorrespondenciaLista)) {
            consolidatedResumo.semCorrespondenciaLista.push(
              ...response.resumo.semCorrespondenciaLista,
            )
          }
        }
      }

      setImportResult(consolidatedResumo)
      loadHistory()
    } catch (err: unknown) {
      console.error('Falha no envio de lotes da importação:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao processar importação'
      setUploadError(msg)
    } finally {
      setIsProcessing(false)
      setProcessProgress({ percent: 0, message: '', processed: 0, total: 0 })
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
            duplicar). Reenviar a mesma planilha não duplica clientes — o sistema sobrepõe por
            código e grava só o que é novo ou mudou.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-slate-50/50 flex flex-col items-center justify-center ${
              isParsing
                ? 'border-blue-400 bg-blue-50/40 cursor-wait'
                : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50 cursor-pointer'
            }`}
            onClick={() => !isParsing && document.getElementById('file-upload-input')?.click()}
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              disabled={isParsing || isProcessing}
              onChange={handleFileChange}
            />
            <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-inner">
              {isParsing ? (
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              ) : (
                <FileSpreadsheet className="h-6 w-6" />
              )}
            </div>
            {isParsing ? (
              <div className="space-y-2.5 w-full max-w-sm">
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    Lendo arquivo em segundo plano (Web Worker)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{parseProgress.message}</p>
                </div>
                <Progress value={parseProgress.percent} className="h-2 bg-blue-100" />
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>Processando sem travar interface</span>
                  <span>{parseProgress.percent}%</span>
                </div>
              </div>
            ) : file ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {rawRows.length.toLocaleString('pt-BR')} linhas prontas para importação.
                  {availableSheets.length > 1 && ` (Aba ativa: "${selectedSheet}")`}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  Clique para selecionar ou arraste o arquivo .XLSX ou .CSV aqui
                </p>
                <p className="text-xs text-slate-400">
                  Suporte nativo a planilhas pesadas com processamento fora da thread principal (Web
                  Worker).
                </p>
              </div>
            )}
          </div>
          {/* Seletor de Aba (se arquivo tiver múltiplas abas) */}
          {availableSheets.length > 1 && file && (
            <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700">Selecionar Aba da Planilha:</span>
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
              <span className="text-[11px] text-slate-500">
                Alterne a aba caso os dados brutos estejam em &ldquo;BD&rdquo; ou
                &ldquo;Dados&rdquo;.
              </span>
            </div>
          )}
          {/* Feedback de Erro Visível */}
          {uploadError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Ocorreu um erro no processamento:</span>
                <p className="text-[11px] text-rose-700 leading-relaxed">{uploadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUploadError(null)}
                  className="h-6 text-[10px] border-rose-300 text-rose-700 hover:bg-rose-100"
                >
                  Fechar Aviso
                </Button>
              </div>
            </div>
          )}
          {/* Barra de Progresso do Envio em Chunks */}
          {isProcessing && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-900 font-semibold">
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Enviando dados em lotes para o servidor...</span>
                </span>
                <span className="font-mono">{processProgress.percent}%</span>
              </div>
              <Progress value={processProgress.percent} className="h-2.5 bg-blue-100" />
              <p className="text-[11px] text-blue-700">{processProgress.message}</p>
            </div>
          )}
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
          {/* Seletor do Modo de Importação e Explicação */}
          {headers.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Modo de Importação em Uso:
                  </span>
                  <Badge
                    className={
                      effectiveModo === 'base_mestre'
                        ? 'bg-blue-600 text-white text-xs'
                        : effectiveModo === 'faturamento_reconciliacao'
                          ? 'bg-amber-600 text-white text-xs'
                          : 'bg-emerald-600 text-white text-xs'
                    }
                  >
                    {effectiveModo === 'base_mestre'
                      ? 'Base Mestre (Upsert)'
                      : effectiveModo === 'faturamento_reconciliacao'
                        ? 'Faturamento / Reconciliação'
                        : 'Enriquecimento (Margem)'}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-500">Alterar modo:</span>
                  <Select
                    value={effectiveModo}
                    onValueChange={(val: any) => {
                      setModoImportacao(val)
                      setModoAlteradoManualmente(true)
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs w-56 bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base_mestre" className="text-xs">
                        Base Mestre (Cria e atualiza)
                      </SelectItem>
                      <SelectItem value="faturamento_reconciliacao" className="text-xs">
                        Faturamento / Reconciliação
                      </SelectItem>
                      <SelectItem value="enriquecimento_margem" className="text-xs">
                        Enriquecimento (Margem)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Descrição e Regras do Modo Selecionado */}
              <div className="text-xs rounded-lg p-3 border">
                {effectiveModo === 'base_mestre' && (
                  <div className="space-y-1 text-blue-900 bg-blue-50/60 p-2.5 rounded border border-blue-100">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                      Modo Base Mestre (requer Código + Razão Social)
                    </p>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Realiza upsert por código único (ex: C020106). Cria novos clientes inativos,
                      atualiza cadastros existentes, recalcula o score ponderado e alimenta a fila
                      de reativação.
                    </p>
                  </div>
                )}
                {effectiveModo === 'faturamento_reconciliacao' && (
                  <div className="space-y-1 text-amber-900 bg-amber-50/70 p-2.5 rounded border border-amber-200">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      Planilha sem código de cliente — Modo Faturamento / Reconciliação
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Clientes existentes serão atualizados por{' '}
                      <strong>Razão Social / Nome normalizado</strong> (+ cidade/UF).{' '}
                      <strong>Nenhum cliente novo será criado.</strong> Atualiza último pedido,
                      notas fiscais, faturamento R$, peso e canal. Clientes que faturaram saem
                      imediatamente da fila de reativação.
                    </p>
                  </div>
                )}
                {effectiveModo === 'enriquecimento_margem' && (
                  <div className="space-y-1 text-emerald-900 bg-emerald-50/70 p-2.5 rounded border border-emerald-200">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                      Modo Enriquecimento (Margem)
                    </p>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      Match por código ou nome normalizado. Atualiza apenas métricas de margem (%) e
                      valor que alimentam o bônus de score e gatilhos de fechamento.{' '}
                      <strong>Não cria clientes novos nem altera a fila.</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Alerta de Layout Detectado Automaticamente */}
          {detectedLayout && (
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-lg flex items-start space-x-3 text-xs text-blue-900">
              <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-blue-950">
                    Layout detectado: {detectedLayout.nome}
                  </span>
                  <Badge className="bg-blue-600 text-white text-[10px]">Auto-Mapeado</Badge>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  {detectedLayout.descricao} Todos os campos abaixo já foram vinculados às colunas
                  originais e permanecem editáveis manualmente.
                </p>
              </div>
            </div>
          )}
          {/* Mapeamento de Colunas */}
          {headers.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                    Mapeamento de Colunas Detectadas ({headers.length} encontradas)
                  </h4>
                  {detectedLayout && (
                    <span className="text-[11px] font-mono text-emerald-600 font-medium">
                      ✓ Layout compatível: {detectedLayout.nome}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Pelo menos um dos dois (Código ou Nome) é obrigatório.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                {/* Código */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span>Código do Cliente</span>
                    {effectiveModo === 'base_mestre' ? (
                      <span className="text-[10px] text-red-500 font-bold">Obrigatório</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">Opcional</span>
                    )}
                  </Label>
                  <Select
                    value={mapping.codigo || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, codigo: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                    <span>Razão Social / Nome</span>
                    <span className="text-[10px] text-red-500 font-bold">
                      {effectiveModo === 'faturamento_reconciliacao'
                        ? 'Chave de Match'
                        : 'Obrigatório'}
                    </span>
                  </Label>
                  <Select
                    value={mapping.nome || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, nome: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                    value={mapping.regiao || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, regiao: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                    value={mapping.vendedor || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, vendedor: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                    value={mapping.telefone || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, telefone: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                    value={mapping.whatsapp || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, whatsapp: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
                  <Label className="text-xs font-medium text-slate-700">
                    Último Faturamento / Data
                  </Label>
                  <Select
                    value={mapping.ultima_compra || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, ultima_compra: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Valor R$ / Limite */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Valor R$ / Faturamento / Limite
                  </Label>
                  <Select
                    value={mapping.valor_ultima_compra || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, valor_ultima_compra: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Cidade */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Cidade</Label>
                  <Select
                    value={mapping.cidade || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, cidade: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Estado / UF */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Estado / UF</Label>
                  <Select
                    value={mapping.estado_uf || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, estado_uf: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dias Sem Faturar */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Dias Sem Faturar (Recência)
                  </Label>
                  <Select
                    value={mapping.dias_sem_faturar || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, dias_sem_faturar: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Faixa Última Compra */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">Faixa de Inatividade</Label>
                  <Select
                    value={mapping.faixa || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, faixa: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pedido */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-700">
                    Número do Pedido (Reconciliação)
                  </Label>
                  <Select
                    value={mapping.pedido || '__none__'}
                    onValueChange={(val) =>
                      setMapping({ ...mapping, pedido: val === '__none__' ? '' : val })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                        (Nenhum / Deixar Vazio)
                      </SelectItem>
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
            <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 text-emerald-900 font-bold text-sm">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Carga e Processamento Concluídos!</span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-white border-emerald-300 text-emerald-800 text-xs"
                >
                  Modo:{' '}
                  {importResult.modo === 'base_mestre'
                    ? 'Base Mestre'
                    : importResult.modo === 'faturamento_reconciliacao'
                      ? 'Faturamento / Reconciliação'
                      : 'Enriquecimento (Margem)'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block text-[11px]">Total de Linhas</span>
                  <span className="font-bold text-slate-800 text-base">{importResult.total}</span>
                </div>
                {importResult.modo === 'base_mestre' ? (
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                    <span className="text-slate-500 block text-[11px]">Novos</span>
                    <span className="font-bold text-emerald-600 text-base">
                      {importResult.novas}
                    </span>
                  </div>
                ) : (
                  <div className="bg-white p-2.5 rounded-lg border border-amber-100">
                    <span className="text-slate-500 block text-[11px]">Matches por Nome</span>
                    <span className="font-bold text-amber-700 text-base">
                      {importResult.matchesNome}
                    </span>
                  </div>
                )}
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block text-[11px]">Atualizados</span>
                  <span className="font-bold text-blue-600 text-base">
                    {importResult.atualizadas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[11px]">Inalterados (Pulados)</span>
                  <span className="font-bold text-slate-700 text-base">
                    {importResult.inalteradas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block text-[11px]">Reconciliados</span>
                  <span className="font-bold text-purple-600 text-base">
                    {importResult.reconciliadosFaturaram}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block text-[11px]">Sem Match</span>
                  <span className="font-bold text-slate-600 text-base">
                    {importResult.semCorrespondencia}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block text-[11px]">Rejeitadas</span>
                  <span
                    className={`font-bold text-base ${importResult.rejeitadas > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                  >
                    {importResult.rejeitadas}
                  </span>
                </div>
              </div>

              {/* Relatório de Divergências no Modo Faturamento: quem faturou mas não estava na base */}
              {importResult.modo === 'faturamento_reconciliacao' &&
                importResult.semCorrespondencia > 0 && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center space-x-1.5 font-semibold text-amber-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        Relatório de Divergências: Faturaram mas não estão cadastrados na Base (
                        {importResult.semCorrespondencia})
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Estes registros foram faturados pelo ERP mas não encontraram cliente
                      correspondente por Razão Social/Nome normalizado. Conforme a regra de
                      reconciliação, nenhum cliente novo foi criado.
                    </p>
                    {importResult.semCorrespondenciaLista &&
                      importResult.semCorrespondenciaLista.length > 0 && (
                        <div className="max-h-32 overflow-y-auto space-y-1 bg-white p-2 rounded border border-amber-200 text-[11px]">
                          {importResult.semCorrespondenciaLista.map((sc, i) => (
                            <div
                              key={i}
                              className="text-slate-700 flex justify-between border-b border-slate-100 pb-0.5"
                            >
                              <span>
                                • Linha {sc.linha}: <strong>{sc.nome}</strong>{' '}
                                {sc.cidade ? `(${sc.cidade}/${sc.uf})` : ''}
                              </span>
                              <span className="text-slate-500 font-mono">
                                Pedido: {sc.pedido || 's/n'}{' '}
                                {sc.valor ? `| R$ ${Number(sc.valor).toLocaleString('pt-BR')}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}

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
          )}{' '}
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
                    <th className="py-2.5 px-3">Modo</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3">Novos</th>
                    <th className="py-2.5 px-3">Atualizados</th>
                    <th className="py-2.5 px-3">Inalterados</th>
                    <th className="py-2.5 px-3">Matches/Sem Match</th>
                    <th className="py-2.5 px-3">Reconciliados</th>
                    <th className="py-2.5 px-3">Rejeitadas</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importacoes.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td
                        className="py-2.5 px-3 font-medium text-slate-800 max-w-[180px] truncate"
                        title={item.nome_arquivo}
                      >
                        {item.nome_arquivo}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={
                            item.modo_importacao === 'faturamento_reconciliacao'
                              ? 'border-amber-300 bg-amber-50 text-amber-800 text-[10px]'
                              : item.modo_importacao === 'enriquecimento_margem'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]'
                                : 'border-blue-300 bg-blue-50 text-blue-800 text-[10px]'
                          }
                        >
                          {item.modo_importacao === 'faturamento_reconciliacao'
                            ? 'Faturamento'
                            : item.modo_importacao === 'enriquecimento_margem'
                              ? 'Margem'
                              : 'Base Mestre'}
                        </Badge>
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
                      <td className="py-2.5 px-3 text-slate-500 font-medium">
                        {item.linhas_inalteradas ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {item.matches_nome ? `${item.matches_nome} nome` : '—'}
                        {item.sem_correspondencia ? ` / ${item.sem_correspondencia} s/ match` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-purple-600 font-medium">
                        {item.reconciliados_faturaram || 0} faturaram
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span
                          className={
                            item.linhas_rejeitadas > 0
                              ? 'text-rose-600 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {item.linhas_rejeitadas || 0}
                        </span>
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
