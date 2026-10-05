import pb from '@/lib/pocketbase/client'
import type { ChatConversa, ChatMensagem, ChatUnreadCountsResponse, User } from '@/types'

/**
 * Service do Chat Interno do Projeto Guerra.
 * Gerencia canais, DMs 1:1, avisos broadcast de admin, contagem de não-lidas e realtime.
 */

// 1. Buscar todas as conversas disponíveis para o usuário
export async function fetchConversasUsuario(
  userRole: string,
  userRegioes: string[] = [],
  userId: string,
): Promise<ChatConversa[]> {
  // Buscar conversas ordenadas por atividade recente
  const allConversas = await pb.collection('chat_conversas').getFullList<ChatConversa>({
    sort: '-updated',
    expand: 'participantes,regiao',
  })

  // Filtrar de acordo com o escopo:
  // - 'geral': todos veem
  // - 'canal_rota': admin e supervisor veem todas; operador/lider veem se a região pertencer a eles
  // - 'dm': admin tem visão de supervisão total (pode ver e auditar conversas de qualquer vendedor);
  //         não-admin (operador, líder, supervisor) acessa APENAS conversas onde é participante
  return allConversas.filter((c) => {
    if (c.tipo === 'geral') return true
    if (c.tipo === 'canal_rota') {
      if (userRole === 'admin' || userRole === 'supervisor') return true
      if (!c.regiao_nome) return true
      return userRegioes.includes(c.regiao_nome)
    }
    if (c.tipo === 'dm') {
      if (userRole === 'admin') return true
      return Array.isArray(c.participantes) && c.participantes.includes(userId)
    }
    return false
  })
}

// 2. Buscar mensagens de uma conversa (com paginação / últimas N)
export async function fetchMensagensConversa(
  conversaId: string,
  page = 1,
  perPage = 30,
): Promise<{ items: ChatMensagem[]; totalItems: number; totalPages: number }> {
  const result = await pb.collection('chat_mensagens').getList<ChatMensagem>(page, perPage, {
    filter: `conversa = '${conversaId}'`,
    sort: '-created', // Busca as mais recentes primeiro
    expand: 'autor',
  })

  // Retorna ordenado do mais antigo para o mais recente para exibição linear no chat
  const itemsAsc = [...result.items].reverse()
  return {
    items: itemsAsc,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  }
}

// 3. Enviar mensagem normal ou aviso broadcast
export async function enviarMensagemChat(params: {
  conversaId: string
  texto: string
  tipo?: 'normal' | 'aviso'
  autorId: string
  autorNome: string
  autorRole: string
}): Promise<ChatMensagem> {
  return pb.collection('chat_mensagens').create<ChatMensagem>({
    conversa: params.conversaId,
    autor: params.autorId,
    autor_nome: params.autorNome,
    autor_role: params.autorRole,
    texto: params.texto.trim(),
    tipo: params.tipo || 'normal',
  })
}

// 4. Iniciar ou obter conversa DM 1:1
export async function getOrCreateDm(
  targetUserId: string,
  options?: { userAId?: string; userBId?: string },
): Promise<ChatConversa> {
  const body: Record<string, string> = { target_user_id: targetUserId }
  if (options?.userAId && options?.userBId) {
    body.user_a_id = options.userAId
    body.user_b_id = options.userBId
  }
  const res = await pb.send<{ conversa: ChatConversa; is_new: boolean }>(
    '/backend/v1/chat/get-or-create-dm',
    {
      method: 'POST',
      body,
    },
  )
  return res.conversa
}

// 5. Marcar conversa como lida
export async function marcarConversaLida(conversaId: string): Promise<void> {
  try {
    await pb.send('/backend/v1/chat/mark-read', {
      method: 'POST',
      body: { conversa_id: conversaId },
    })
  } catch (err) {
    console.warn('Falha ao registrar leitura de conversa:', err)
  }
}

// 6. Consultar contadores de mensagens não lidas
export async function fetchUnreadCounts(): Promise<ChatUnreadCountsResponse> {
  try {
    return await pb.send<ChatUnreadCountsResponse>('/backend/v1/chat/unread-counts', {
      method: 'GET',
    })
  } catch (err) {
    console.warn('Falha ao obter contador de não lidas:', err)
    return { total_unread: 0, by_conversation: {} }
  }
}

// 7. Buscar lista de colaboradores para iniciar DM (excluindo a si mesmo)
export async function fetchColaboradoresParaDm(currentUserId: string): Promise<User[]> {
  const users = await pb.collection('users').getFullList<User>({
    sort: 'name',
  })
  return users.filter((u) => u.id !== currentUserId)
}

// 8. Obter a conversa Geral (para broadcast ou atalho)
export async function fetchCanalGeral(): Promise<ChatConversa | null> {
  try {
    const geral = await pb
      .collection('chat_conversas')
      .getFirstListItem<ChatConversa>("tipo = 'geral'")
    return geral
  } catch {
    return null
  }
}
