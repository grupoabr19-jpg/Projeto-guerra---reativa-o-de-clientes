import pb from '@/lib/pocketbase/client'
import type {
  AtendimentoFunil,
  AtendimentoFunilEtapa,
  AtendimentoFunilCard,
  KommoBridgeResponse,
} from '@/types'

/**
 * Service para a aba "Atendimento" (Hub de Atendimento Conversacional — Fase 1 Admin).
 * Gerencia funis e etapas de atendimento, além da consulta de atividade recente do Bridge Kommo (somente leitura).
 */

// 1. Listar funis de atendimento com suas respectivas etapas
export async function fetchAtendimentoFunis(): Promise<AtendimentoFunil[]> {
  const funis = await pb.collection('atendimento_funis').getFullList<AtendimentoFunil>({
    sort: 'ordem,created',
  })

  // Buscar todas as etapas para enriquecer cada funil
  const etapas = await pb
    .collection('atendimento_funil_etapas')
    .getFullList<AtendimentoFunilEtapa>({
      sort: 'ordem,created',
    })

  const etapasByFunil: Record<string, AtendimentoFunilEtapa[]> = {}
  for (const etapa of etapas) {
    if (!etapasByFunil[etapa.funil]) {
      etapasByFunil[etapa.funil] = []
    }
    etapasByFunil[etapa.funil].push(etapa)
  }

  return funis.map((f) => ({
    ...f,
    etapas: etapasByFunil[f.id] || [],
  }))
}

// 2. Criar novo funil
export async function createAtendimentoFunil(dados: {
  nome: string
  descricao?: string
  ordem?: number
  cor_hex?: string
  ativo?: boolean
}): Promise<AtendimentoFunil> {
  const adminId = pb.authStore.record?.id || ''
  return pb.collection('atendimento_funis').create<AtendimentoFunil>({
    nome: dados.nome.trim(),
    descricao: dados.descricao?.trim() || '',
    ordem: dados.ordem ?? 1,
    cor_hex: dados.cor_hex || '#253575',
    ativo: dados.ativo ?? true,
    criado_por: adminId,
  })
}

// 3. Renomear / Atualizar funil
export async function updateAtendimentoFunil(
  funilId: string,
  dados: {
    nome?: string
    descricao?: string
    ordem?: number
    cor_hex?: string
    ativo?: boolean
  },
): Promise<AtendimentoFunil> {
  return pb.collection('atendimento_funis').update<AtendimentoFunil>(funilId, {
    ...(dados.nome ? { nome: dados.nome.trim() } : {}),
    ...(dados.descricao !== undefined ? { descricao: dados.descricao.trim() } : {}),
    ...(dados.ordem !== undefined ? { ordem: dados.ordem } : {}),
    ...(dados.cor_hex ? { cor_hex: dados.cor_hex } : {}),
    ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
  })
}

// 4. Excluir funil (e etapas via cascade no PB)
export async function deleteAtendimentoFunil(funilId: string): Promise<boolean> {
  await pb.collection('atendimento_funis').delete(funilId)
  return true
}

// 5. Criar etapa dentro de um funil
export async function createAtendimentoFunilEtapa(dados: {
  funilId: string
  nome: string
  ordem?: number
  cor_hex?: string
  descricao?: string
  tipo_desfecho?: 'normal' | 'sucesso' | 'perda'
}): Promise<AtendimentoFunilEtapa> {
  return pb.collection('atendimento_funil_etapas').create<AtendimentoFunilEtapa>({
    funil: dados.funilId,
    nome: dados.nome.trim(),
    ordem: dados.ordem ?? 1,
    cor_hex: dados.cor_hex || '#3b82f6',
    descricao: dados.descricao?.trim() || '',
    tipo_desfecho: dados.tipo_desfecho || 'normal',
  })
}

// 6. Atualizar etapa
export async function updateAtendimentoFunilEtapa(
  etapaId: string,
  dados: {
    nome?: string
    ordem?: number
    cor_hex?: string
    descricao?: string
    tipo_desfecho?: 'normal' | 'sucesso' | 'perda'
  },
): Promise<AtendimentoFunilEtapa> {
  return pb.collection('atendimento_funil_etapas').update<AtendimentoFunilEtapa>(etapaId, {
    ...(dados.nome ? { nome: dados.nome.trim() } : {}),
    ...(dados.ordem !== undefined ? { ordem: dados.ordem } : {}),
    ...(dados.cor_hex ? { cor_hex: dados.cor_hex } : {}),
    ...(dados.descricao !== undefined ? { descricao: dados.descricao.trim() } : {}),
    ...(dados.tipo_desfecho ? { tipo_desfecho: dados.tipo_desfecho } : {}),
  })
}

// 7. Excluir etapa
export async function deleteAtendimentoFunilEtapa(etapaId: string): Promise<boolean> {
  await pb.collection('atendimento_funil_etapas').delete(etapaId)
  return true
}

// ==========================================
// CARDS DO PIPELINE / KANBAN
// ==========================================

export async function fetchAtendimentoFunilCards(funilId: string): Promise<AtendimentoFunilCard[]> {
  try {
    return await pb.collection('atendimento_funil_cards').getFullList<AtendimentoFunilCard>({
      filter: `funil = "${funilId}"`,
      sort: 'ordem,created',
    })
  } catch (err) {
    console.warn('Erro ao buscar cards do funil:', err)
    return []
  }
}

export async function createAtendimentoFunilCard(dados: {
  funil: string
  etapa: string
  titulo: string
  contato_nome?: string
  telefone?: string
  email?: string
  valor?: number
  ordem?: number
  origem?: string
  kommo_id?: string
  cliente_id?: string
  notas?: string
  responsavel?: string
}): Promise<AtendimentoFunilCard> {
  const adminId = pb.authStore.record?.id || ''
  return pb.collection('atendimento_funil_cards').create<AtendimentoFunilCard>({
    ...dados,
    responsavel: dados.responsavel || adminId || undefined,
    historico_etapas: [
      {
        para_etapa_id: dados.etapa,
        data: new Date().toISOString(),
        usuario_nome: pb.authStore.record?.name || 'Administrador',
      },
    ],
  })
}

export async function updateAtendimentoFunilCard(
  cardId: string,
  dados: Partial<AtendimentoFunilCard>,
): Promise<AtendimentoFunilCard> {
  return pb.collection('atendimento_funil_cards').update<AtendimentoFunilCard>(cardId, dados)
}

export async function moverCardEtapa(
  card: AtendimentoFunilCard,
  novaEtapaId: string,
  novaEtapaNome?: string,
): Promise<AtendimentoFunilCard> {
  const historicoAtual = card.historico_etapas || []
  const novoHistorico = [
    ...historicoAtual,
    {
      de_etapa_id: card.etapa,
      para_etapa_id: novaEtapaId,
      para_etapa_nome: novaEtapaNome,
      data: new Date().toISOString(),
      usuario_nome: pb.authStore.record?.name || 'Administrador',
    },
  ]

  return pb.collection('atendimento_funil_cards').update<AtendimentoFunilCard>(card.id, {
    etapa: novaEtapaId,
    historico_etapas: novoHistorico,
  })
}

export async function deleteAtendimentoFunilCard(cardId: string): Promise<boolean> {
  await pb.collection('atendimento_funil_cards').delete(cardId)
  return true
}

// 8. Consultar leads e contatos recentes do Bridge Kommo (com escrita liberada)
export async function fetchKommoRecentActivity(): Promise<KommoBridgeResponse> {
  try {
    const res = await pb.send<KommoBridgeResponse>('/backend/v1/kommo/recent-activity', {
      method: 'GET',
    })
    return res
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      configured: false,
      somente_leitura: false,
      error_code: 'FETCH_ERROR',
      message: `Não foi possível carregar os dados recentes do Kommo: ${msg}`,
      items: [],
      total: 0,
    }
  }
}

// 9. Obter status do Kommo CRM (conexão, permissões de escrita, SDR)
export async function fetchKommoStatus(): Promise<KommoStatusResponse | null> {
  try {
    return await pb.send<KommoStatusResponse>('/backend/v1/kommo/status', {
      method: 'GET',
    })
  } catch (err) {
    console.warn('Erro ao consultar status Kommo:', err)
    return null
  }
}

// 10. Disparar sincronização manual de atividades SDR
export async function triggerKommoSdrSync(): Promise<{
  ok: boolean
  message: string
  processadas?: number
}> {
  try {
    return await pb.send('/backend/v1/kommo/sync-sdr', {
      method: 'POST',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Falha na sincronização SDR: ${msg}` }
  }
}

// 11. Enviar mensagem de resposta do Hub via Kommo WhatsApp
export async function sendKommoChatMessage(
  conversaId: string,
  texto: string,
): Promise<KommoSendMessageResponse> {
  try {
    const res = await pb.send<KommoSendMessageResponse>('/backend/v1/kommo/send-message', {
      method: 'POST',
      body: {
        conversaId,
        texto,
      },
    })
    return res
  } catch (err: unknown) {
    const errObj = err as { response?: { error?: string; detalhe?: string }; message?: string }
    const backendMsg = errObj?.response?.error || errObj?.message || String(err)
    const detalhe = errObj?.response?.detalhe || ''
    return {
      ok: false,
      message: backendMsg,
      error: backendMsg,
      detalhe,
    }
  }
}
