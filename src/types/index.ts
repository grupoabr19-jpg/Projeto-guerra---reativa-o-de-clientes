export type UserRole = 'operador' | 'supervisor' | 'admin'

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
}

export type ModoImportacao = 'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'

export interface Importacao {
  id: string
  nome_arquivo: string
  modo_importacao?: ModoImportacao
  linhas_total: number
  linhas_importadas: number
  linhas_atualizadas: number
  linhas_rejeitadas: number
  matches_nome?: number
  sem_correspondencia?: number
  reconciliados_faturaram: number
  pedidos_validados: number
  pedidos_divergentes: number
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
