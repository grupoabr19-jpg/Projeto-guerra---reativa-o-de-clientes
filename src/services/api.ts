import pb from '@/lib/pocketbase/client'
import type {
  Cliente,
  Interacao,
  RespostaFormulario,
  Importacao,
  Configuracao,
  Regiao,
} from '@/types'

export async function fetchClientes(params?: {
  page?: number
  perPage?: number
  filter?: string
  sort?: string
  expand?: string
}) {
  return pb.collection('clientes').getList<Cliente>(params?.page || 1, params?.perPage || 20, {
    filter: params?.filter,
    sort: params?.sort || '-score',
    expand: params?.expand || 'operador',
  })
}

export async function fetchClienteById(id: string) {
  return pb.collection('clientes').getOne<Cliente>(id, {
    expand: 'operador',
  })
}

export async function updateCliente(id: string, data: Partial<Cliente>) {
  return pb.collection('clientes').update<Cliente>(id, data)
}

export async function fetchInteracoesByCliente(clienteId: string) {
  return pb.collection('interacoes').getFullList<Interacao>({
    filter: `cliente = '${clienteId}'`,
    sort: '-created',
    expand: 'operador',
  })
}

export async function createInteracao(data: {
  cliente: string
  operador: string
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'status' | 'nota' | 'formulario'
  conteudo?: string
  desfecho?: string
  motivo?: string
  reagendado_para?: string
  numero_pedido?: string
  estado_anterior?: string
  estado_novo?: string
}) {
  return pb.collection('interacoes').create<Interacao>(data)
}

export async function saveRespostasFormulario(data: {
  cliente: string
  operador: string
  interacao?: string
  respostas: Record<string, unknown>
  desfecho: string
  valor_potencial?: number
  toneladas_potencial?: number
}) {
  return pb.collection('respostas_formulario').create<RespostaFormulario>(data)
}

export async function fetchImportacoes() {
  return pb.collection('importacoes').getFullList<Importacao>({
    sort: '-created',
    expand: 'criado_por',
  })
}

export async function fetchConfiguracoes() {
  return pb.collection('configuracoes').getFullList<Configuracao>()
}

export async function updateConfiguracao(chave: string, valor: Record<string, unknown>) {
  const existing = await pb
    .collection('configuracoes')
    .getFirstListItem<Configuracao>(`chave = '${chave}'`)
  return pb.collection('configuracoes').update<Configuracao>(existing.id, { valor })
}

// Regiões de Atendimento
export async function fetchRegioes() {
  return pb.collection('regioes').getFullList<Regiao>({
    sort: 'ordem',
  })
}

export async function updateRegiao(id: string, data: Partial<Regiao>) {
  return pb.collection('regioes').update<Regiao>(id, data)
}

export async function createRegiao(data: Partial<Regiao>) {
  return pb.collection('regioes').create<Regiao>(data)
}

// Queue API calls
export async function reserveNextQueueClient(options?: {
  segmento?: string
  ordenacao?: 'score' | 'antigos' | 'novos'
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/reserve-next`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(options || {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Falha ao reservar cliente na fila')
  }
  return res.json() as Promise<{ cliente: Cliente | null; ja_reservado: boolean; message: string }>
}

export async function fetchInteracoesByOperador(operadorId: string) {
  return pb.collection('interacoes').getFullList<Interacao>({
    filter: `operador = '${operadorId}'`,
    sort: '-created',
    expand: 'cliente',
  })
}

export async function fetchClientesReagendadosOperador(operadorId: string) {
  return pb.collection('clientes').getFullList<Cliente>({
    filter: `reagendado_operador = '${operadorId}' && reagendado_para != ''`,
    sort: 'reagendado_para',
  })
}

export async function releaseQueueLock(clienteId: string, rascunho?: Record<string, unknown>) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/release-lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify({ cliente_id: clienteId, rascunho_respostas: rascunho }),
  })
  return res.json()
}

// Kommo API calls
export async function checkKommoStatus() {
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/status`, {
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch (_) {
      return {
        configured: true,
        connected: false,
        subdomain: 'ederbueno.kommo.com',
        mode: 'readonly',
        somente_leitura: true,
        status: 'timeout',
        message:
          'Servidor Kommo demorou para responder ou retornou formato texto. A integração opera em modo Somente Leitura.',
      }
    }
  } catch (err: unknown) {
    return {
      configured: true,
      connected: false,
      subdomain: 'ederbueno.kommo.com',
      mode: 'readonly',
      somente_leitura: true,
      status: 'error',
      message: err instanceof Error ? err.message : 'Falha na conexão com a API',
    }
  }
}

export async function testKommoConnection() {
  try {
    const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/test`, {
      method: 'POST',
      headers: {
        Authorization: pb.authStore.token,
      },
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch (_) {
      return {
        ok: false,
        status: 'timeout',
        mode: 'readonly',
        somente_leitura: true,
        message:
          'Tempo limite na chamada Kommo CRM (Backend timeout). Em modo Somente Leitura, dados continuam disponíveis para consulta.',
        testedAt: new Date().toISOString(),
      }
    }
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'error',
      mode: 'readonly',
      somente_leitura: true,
      message: err instanceof Error ? err.message : 'Falha de comunicação com o servidor',
      testedAt: new Date().toISOString(),
    }
  }
}

export async function syncKommoLead(data: {
  cliente_id: string
  action: 'reserve' | 'finalize'
  desfecho?: string
  observacoes?: string
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/sync-lead`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(data),
  })
  return res.json()
}

// Process spreadsheet rows
export async function processSpreadsheetRows(data: {
  rows: Record<string, unknown>[]
  fileName: string
  substituicaoTotal: boolean
  modoImportacao?: 'base_mestre' | 'faturamento_reconciliacao' | 'enriquecimento_margem'
}) {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/import/process-rows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Falha ao processar planilha no servidor')
  }
  return res.json()
}

// Bases de Referência (armzenamento de planilhas cruas para definição do mapeamento do banco)
export async function fetchBasesReferencia() {
  return pb.collection('bases_referencia').getFullList<import('@/types').BaseReferencia>({
    sort: '-created',
    expand: 'enviado_por',
  })
}

export async function createBaseReferencia(formData: FormData) {
  return pb.collection('bases_referencia').create<import('@/types').BaseReferencia>(formData, {
    expand: 'enviado_por',
  })
}

export async function updateBaseReferencia(
  id: string,
  data: Partial<import('@/types').BaseReferencia>,
) {
  return pb.collection('bases_referencia').update<import('@/types').BaseReferencia>(id, data, {
    expand: 'enviado_por',
  })
}

export async function deleteBaseReferencia(id: string) {
  return pb.collection('bases_referencia').delete(id)
}

// Re-export gamificação APIs
export * from './gamificacao'
