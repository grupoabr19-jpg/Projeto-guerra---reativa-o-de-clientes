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

export interface Importacao {
  id: string
  nome_arquivo: string
  linhas_total: number
  linhas_importadas: number
  linhas_atualizadas: number
  linhas_rejeitadas: number
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

export interface Regiao {
  id: string
  nome: string
  ordem?: number
  ativo?: boolean
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
