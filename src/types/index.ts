export type UserRole = 'operador' | 'supervisor' | 'admin' | 'lider'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  regioes?: string[]
  telefone?: string
  avatar?: string
  created: string
  updated: string
}

export type ClienteEstado =
  | 'na_base'
  | 'reservado'
  | 'em_atendimento'
  | 'reativado'
  | 'reagendado'
  | 'contatado'
  | 'compra_terceiros'
  | 'nao_quer_negociar'
  | 'duplicado'
  | 'sem_contato'
  | 'suspenso'
  | 'ativo_fora_base'

export type FaixaInatividade = 'recente' | '60_89' | '90_plus'

export interface Cliente {
  id: string
  codigo: string
  nome: string
  cpf_cnpj?: string
  telefone?: string
  whatsapp?: string
  telefone_invalido?: boolean
  email?: string
  regiao: string
  vendedor?: string
  segmento?: string
  endereco?: string
  ultima_compra?: string
  valor_ultima_compra?: number
  toneladas_historico?: number
  valor_historico?: number
  compras_count?: number
  dias_sem_faturar?: number
  faixa: FaixaInatividade
  score: number
  estado: ClienteEstado
  operador?: string
  expand?: {
    operador?: User
  }
  lock_timestamp?: string
  reagendado_para?: string
  reagendado_operador?: string
  prioridade_transferencia?: boolean
  tentativas_sem_contato?: number
  ciclos_followup?: number
  quarentena_ate?: string
  pedido_reativacao?: string
  pedido_confirmado?: boolean
  kommo_id?: string
  kommo_lead_id?: string
  origem?: 'importacao' | 'kommo' | 'manual'
  duplicado_de_codigo?: string
  notas?: string
  rascunho_respostas?: Record<string, unknown>
  ativo_fora_base?: boolean
  motivo_ativo_fora_base?: string
  // Gatilhos de fechamento / cruzamento de planilhas
  ultimo_faturamento_data?: string
  fat_12m_reais?: number
  peso_nf_tonelagem?: number
  ultimo_pedido_numero?: string
  ultimo_pedido_data?: string
  canal?: string
  margem_media_perc?: number
  margem_reais?: number
  frequencia_compras_12m?: number
  tipo_vendedor?: string
  gatilhos_fechamento?: Record<string, unknown>
  created: string
  updated: string
}

export interface Interacao {
  id: string
  cliente: string
  operador: string
  expand?: {
    operador?: User
    cliente?: Cliente
  }
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'status' | 'nota' | 'formulario'
  conteudo?: string
  desfecho?: string
  motivo?: string
  reagendado_para?: string
  numero_pedido?: string
  estado_anterior?: string
  estado_novo?: string
  created: string
  updated: string
}

export interface RespostaFormulario {
  id: string
  cliente: string
  interacao?: string
  operador: string
  respostas: Record<string, unknown>
  desfecho: string
  valor_potencial?: number
  toneladas_potencial?: number
  anexos?: string[]
  created: string
  expand?: {
    cliente?: Cliente
    operador?: User
    interacao?: Interacao
  }
}

export type ModoImportacao = 'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'

export interface Importacao {
  id: string
  nome_arquivo: string
  modo_importacao?: ModoImportacao
  linhas_total: number
  linhas_importadas: number
  linhas_atualizadas: number
  linhas_inalteradas?: number
  linhas_rejeitadas: number
  matches_nome?: number
  sem_correspondencia?: number
  reconciliados_faturaram: number
  pedidos_validados: number
  pedidos_divergentes: number
  linhas_puladas_ativo_fora_base?: number
  status: 'processando' | 'concluida' | 'erro'
  detalhes_erro?: Array<{ linha: number; codigo: string; erro: string }>
  divergencias_pedidos?: Array<{
    codigo: string
    nome: string
    pedidoEsperado: string
    pedidoPlanilha: string
  }>
  substituicao_total?: boolean
  criado_por?: string
  expand?: {
    criado_por?: User
  }
  created: string
}

export interface Configuracao {
  id: string
  chave: string
  valor: Record<string, unknown>
  descricao?: string
  created: string
  updated: string
}

export type RegiaoTipo = 'comercial' | 'repescagem'

export interface Regiao {
  id: string
  nome: string
  ordem?: number
  ativo?: boolean
  tipo?: RegiaoTipo
  vendedor_externo?: string
  especialista?: string
  corporativo?: string
  construcao_civil?: string
  cidades_rota?: string[]
  municipios_potenciais?: string
  observacao?: string
  created: string
  updated: string
}

export type BaseClassificacao = 'margem' | 'clientes' | 'faturamento' | 'outra'

export interface AbaReferencia {
  nome: string
  total_linhas: number
  colunas: string[]
  amostra: Record<string, unknown>[]
  is_pivot?: boolean
  tipo_aba?: 'dados' | 'tabela_dinamica' | 'referencia' | 'resumo'
}

export interface BaseReferencia {
  id: string
  nome_arquivo: string
  arquivo?: string
  enviado_por?: string
  expand?: {
    enviado_por?: User
  }
  total_linhas: number
  colunas_detectadas: string[]
  amostra_linhas: Record<string, unknown>[]
  analise_abas?: AbaReferencia[]
  status: 'aguardando_analise' | 'em_analise' | 'mapeado' | 'arquivado'
  classificacao?: BaseClassificacao
  tamanho_bytes?: number
  notas?: string
  created: string
  updated: string
}

export const REGIOES_PADRAO: readonly string[] = [
  'BRAGANÇA',
  'JUNDIAÍ',
  'VARGINHA',
  'POUSO ALEGRE',
  'POÇOS DE CALDAS',
  'ITAJUBÁ',
  'EXTREMA',
  'CAMBUÍ',
  'ATACADO',
] as const

export const TODAS_REGIOES_FILTRO: readonly string[] = [...REGIOES_PADRAO, 'REPESCAGEM'] as const

export type TituloNivel = 'bronze' | 'prata' | 'ouro' | 'platina' | 'diamante'

export interface TituloCatalogo {
  id: string
  codigo: string
  nome: string
  emoji: string
  nivel: TituloNivel
  ordem: number
  pontos_necessarios: number
  descricao?: string
  categoria?: string
  cor_hex?: string
  created: string
  updated: string
}

export interface ConquistaUsuario {
  id: string
  usuario: string
  titulo: string
  pontos_no_momento?: number
  data_conquista?: string
  expand?: {
    usuario?: User
    titulo?: TituloCatalogo
  }
  created: string
  updated: string
}

export type ConcursoMetricaTipo = 'conversoes' | 'toneladas' | 'atendimentos' | 'pontos'
export type ConcursoStatus = 'ativo' | 'encerrado' | 'planejado'

export interface ConcursoSazonal {
  id: string
  titulo: string
  descricao?: string
  data_inicio: string
  data_fim: string
  metrica_tipo: ConcursoMetricaTipo
  meta_quantidade: number
  premio_descricao: string
  badge_exclusiva_nome?: string
  badge_exclusiva_emoji?: string
  status: ConcursoStatus
  vencedor?: string
  resultado_vencedor?: string
  criado_por?: string
  expand?: {
    vencedor?: User
    criado_por?: User
  }
  created: string
  updated: string
}

export interface PesosGamificacao {
  atendimento_ligacao: number
  atendimento_formulario: number
  conversao_reativacao: number
  reagendamento_qualificado: number
  venda_perdida_com_motivo: number
  pontos_por_tonelada: number
}

export interface RankingUserRow {
  posicao: number
  usuario: User
  pontos: number
  atendimentos: number
  conversoes: number
  reagendados: number
  toneladas: number
  tituloAtual: TituloCatalogo
  proximoTitulo?: TituloCatalogo
  progressoProximoPerc: number
  totalTitulosDesbloqueados: number
  isCurrentUser: boolean
}

export type PeriodoAtendimentoFiltro = 'hoje' | '7dias' | '30dias' | 'total'

export interface MetricasAtendimentoOperador {
  operadorId: string
  operadorNome: string
  operadorEmail: string
  regiao: string
  role: UserRole
  atendimentos: number
  ligacoes: number
  conversoes: number
  reagendamentos: number
  followUpsHoje: number
  vendasPerdidas: number
  taxaConversao: number
  pontosGamificacao: number
  tituloGamificacao?: {
    nome: string
    emoji: string
  }
}

export interface MetricasAtendimentosDashboard {
  gerais: {
    totalAtendimentos: number
    ligacoesFeitas: number
    conversoes: number
    reagendamentos: number
    followUpsHoje: number
    followUpsPendentes: number
    vendasPerdidas: number
    taxaConversao: number
  }
  operadores: MetricasAtendimentoOperador[]
  ativosRemovidos?: MetricasAtivosRemovidos
}

export interface ClienteAtivoRemovidoItem {
  id: string
  codigo: string
  nome: string
  regiao: string
  motivo_completo: string
  motivo_categoria: string
  observacao: string
  operador_nome: string
  operador_id?: string
  data_remocao: string
}

export interface MetricasAtivosRemovidos {
  total: number
  breakdown: Record<string, number>
  itens: ClienteAtivoRemovidoItem[]
}

// Categoria diagnóstica para "Por que o cliente não está comprando?"
export type CategoriaDiagnostico =
  | 'preco_condicoes'
  | 'concorrencia'
  | 'credito_capital'
  | 'sem_necessidade_obra'
  | 'frete_prazo'
  | 'qualidade_operacional'
  | 'relacionamento_vendedor'
  | 'nao_localizado_telefone'
  | 'recusa_formal'
  | 'ativo_outro_cadastro'
  | 'outros'

export interface DiagnosticoItemMotivo {
  id: string
  categoria: CategoriaDiagnostico
  titulo: string
  descricao: string
  corBadge: string
  icone: string
  totalOcorrencias: number
  percentual: number
  // Distribuições
  porRegiao: Record<string, number>
  porVendedorOrigem: Record<string, number>
  porPeriodo: {
    hoje: number
    ultimos7dias: number
    ultimos30dias: number
    anterior30dias: number
  }
  // Amostra de clientes para drill-down
  clientes: Array<{
    id: string
    codigo: string
    nome: string
    regiao: string
    vendedorOrigem?: string
    operadorNome: string
    dataRegistro: string
    desfecho: string
    perguntaOrigem: string
    respostaBruta: string
    observacao?: string
    valorPotencial?: number
    toneladasPotencial?: number
  }>
}

export interface RelatorioDiagnosticoCompleto {
  totalRespondidos: number
  totalClientesAnalisados: number
  rankingMotivos: DiagnosticoItemMotivo[]
  distribuicaoPorRegiao: Record<string, number>
  distribuicaoPorVendedorOrigem: Record<string, number>
  evolucaoTemporal: {
    hoje: number
    ultimos7dias: number
    ultimos30dias: number
    total: number
  }
}

export interface MetricasBaseKpisResponse {
  kpis: {
    totalBase: number
    naFila: number
    reativados: number
    taxaReativacao: number
    valorRecuperado: number
    toneladasRecuperadas: number
  }
  estadosContagem: {
    na_base: number
    em_atendimento: number
    reagendado: number
    contatado: number
    reativado: number
    compra_terceiros: number
    nao_quer_negociar: number
    sem_contato: number
  }
  regioesMap: Record<
    string,
    {
      total: number
      scoreSum: number
      avgScore?: number
    }
  >
}

// Filtros Combinados Avançados de Relatórios
export interface FiltrosRelatoriosAvancados {
  periodo: PeriodoAtendimentoFiltro
  regiao: string
  segmento?: string
  vendedor?: string
  operador?: string
  faixaInatividade?: string
  faixaScore?: string
  faixaFaturamento?: string
  desfecho?: string
}

// Cruzamento Comercial: Conversão por Segmento
export interface CruzamentoConversaoSegmento {
  segmento: string
  totalClientes: number
  reativados: number
  taxaConversao: number
  valorRecuperado: number
  toneladasRecuperadas: number
  perdidos: number
  reagendados: number
}

// Cruzamento Comercial: Conversão por Faixa de Inatividade
export interface CruzamentoConversaoInatividade {
  faixa: string
  totalClientes: number
  reativados: number
  taxaConversao: number
  valorRecuperado: number
  perdidos: number
}

// Cruzamento Comercial: Conversão por Score vs. Resultado
export interface CruzamentoConversaoScore {
  faixaScore: string
  scoreMedio: number
  totalClientes: number
  reativados: number
  taxaConversao: number
  valorRecuperado: number
}

// Cruzamento Comercial: Ticket & Volume por Região
export interface CruzamentoRecuperacaoRegiao {
  regiao: string
  totalClientes: number
  reativados: number
  taxaConversao: number
  valorRecuperado: number
  toneladasRecuperadas: number
  ticketMedio: number
}

// Cruzamento Cadastro/Marketing: Top Vendedores com Carteira Morta
export interface CruzamentoCarteiraMorta {
  vendedor: string
  totalCarteira: number
  inativos90NaBase: number
  percentualMorto: number
  reativados: number
  emTrabalho: number
}

// Resposta do Endpoint de Analytics
export interface ReportsAnalyticsResponse {
  kpis: {
    totalBase: number
    naFila: number
    reativados: number
    taxaReativacao: number
    valorRecuperado: number
    toneladasRecuperadas: number
  }
  estadosContagem: {
    na_base: number
    em_atendimento: number
    reagendado: number
    contatado: number
    reativado: number
    compra_terceiros: number
    nao_quer_negociar: number
    sem_contato: number
  }
  cruzamentos: {
    conversaoPorSegmento: CruzamentoConversaoSegmento[]
    conversaoPorFaixaInatividade: CruzamentoConversaoInatividade[]
    conversaoPorScore: CruzamentoConversaoScore[]
    recuperacaoPorRegiao: CruzamentoRecuperacaoRegiao[]
    rankingCarteiraMorta: CruzamentoCarteiraMorta[]
  }
  opcoesFiltros: {
    segmentos: string[]
    vendedores: string[]
  }
}
