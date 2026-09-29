import pb from '@/lib/pocketbase/client'
import type { Cliente, Interacao, RespostaFormulario, Importacao, Configuracao } from '@/types'

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

// Queue API calls
export async function reserveNextQueueClient() {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/queue/reserve-next`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Falha ao reservar cliente na fila')
  }
  return res.json() as Promise<{ cliente: Cliente | null; ja_reservado: boolean; message: string }>
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
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/status`, {
    headers: {
      Authorization: pb.authStore.token,
    },
  })
  return res.json() as Promise<{
    configured: boolean
    subdomain: string
    status: string
    message: string
  }>
}

export async function testKommoConnection() {
  const res = await fetch(`${import.meta.env.VITE_POCKETBASE_URL}/backend/v1/kommo/test`, {
    method: 'POST',
    headers: {
      Authorization: pb.authStore.token,
    },
  })
  return res.json() as Promise<{
    ok: boolean
    status: string
    message: string
    account?: string
    testedAt: string
  }>
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
