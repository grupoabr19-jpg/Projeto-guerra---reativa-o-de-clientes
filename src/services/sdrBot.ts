import pb from '@/lib/pocketbase/client'
import type { SdrBotConfig, SdrTriagemLogItem, SdrSimulacaoResponse } from '@/types'

/**
 * Consulta a configuração atual do Bot SDR (comportamento, prompt, regras de rota e ddd)
 */
export async function fetchSdrBotConfig(): Promise<SdrBotConfig> {
  const res = await pb.send<{ ok: boolean; config: SdrBotConfig }>('/backend/v1/sdr/config', {
    method: 'GET',
  })
  return res.config
}

/**
 * Salva as configurações de comportamento, prompt e regras do Bot SDR
 */
export async function saveSdrBotConfig(config: Partial<SdrBotConfig>): Promise<SdrBotConfig> {
  const res = await pb.send<{ ok: boolean; message: string; config: SdrBotConfig }>(
    '/backend/v1/sdr/config',
    {
      method: 'POST',
      body: { config },
    },
  )
  return res.config
}

/**
 * Liga ou desliga o Bot SDR com chave rápida
 */
export async function toggleSdrBot(
  ativo?: boolean,
): Promise<{ ok: boolean; ativo: boolean; message: string }> {
  return await pb.send<{ ok: boolean; ativo: boolean; message: string }>('/backend/v1/sdr/toggle', {
    method: 'POST',
    body: typeof ativo === 'boolean' ? { ativo } : {},
  })
}

/**
 * Executa uma simulação na Área de Teste: o admin simula ser um cliente e recebe a resposta do SDR
 * nativo do Skip Cloud e a decisão completa de roteamento SEM afetar clientes reais ou o Kommo CRM.
 */
export async function testSdrBotSimulacao(params: {
  mensagem: string
  telefone?: string
  documento?: string
  nomeCliente?: string
  fora_expediente?: boolean
  tipo_mensagem?: 'texto' | 'audio' | 'imagem'
  media_url?: string
}): Promise<SdrSimulacaoResponse> {
  return await pb.send<SdrSimulacaoResponse>('/backend/v1/sdr/test', {
    method: 'POST',
    body: params,
  })
}

/**
 * Consulta o histórico de triagens e auditorias do Bot SDR (reais e simuladas)
 */
export async function fetchSdrTriagensLogs(params?: {
  limit?: number
  reais?: boolean
}): Promise<SdrTriagemLogItem[]> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.reais) searchParams.set('reais', 'true')

  const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const res = await pb.send<{ ok: boolean; total: number; logs: SdrTriagemLogItem[] }>(
    `/backend/v1/sdr/logs${queryStr}`,
    { method: 'GET' },
  )
  return res.logs || []
}
