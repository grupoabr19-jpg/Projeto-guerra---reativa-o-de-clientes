// pocketbase/hooks/admin_destrava.js
// Superpoder Admin: Destravar cliente fechado como "não quer negociar" (venda perdida)
// ou outro desfecho fechado, devolvendo-o à fila/carteira para novo trabalho.
//
// Regras respeitadas (decisão de produto):
// - Exclusivo do perfil ADMIN (operador/líder/supervisor recebem 403).
// - Histórico NUNCA é apagado: fichas, interações e desfechos anteriores permanecem.
// - Blindagem anti-duplicidade de reativação (30 dias) NÃO é burlada: a destrava
//   apenas devolve o cliente para novo atendimento/follow-up; ela não cria
//   reativação nem toca em interacoes/pedido_reativacao.
// - Atacado segue com donos por DDD (a destrava não muda regiao/ddd_telefone) e
//   cliente_final permanece fora da fila de reativação (base_categoria intacta).
// - Toda destrava grava auditoria em eventos_log com estado/desfecho anterior.
routerAdd(
  'POST',
  '/backend/v1/queue/admin-destravar-cliente',
  (e) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação obrigatória' })
      }

      const userRole = authRecord.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error: 'Ação exclusiva do Administrador: destravar cliente de venda perdida.',
        })
      }

      const userId = authRecord.id
      const userName = authRecord.getString('name') || authRecord.getString('email') || 'Admin'

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const clienteId = body.cliente_id ? String(body.cliente_id).trim() : ''
      const novoVendedor = body.novo_vendedor ? String(body.novo_vendedor).trim() : ''
      const motivo = body.motivo ? String(body.motivo).trim() : ''

      if (!clienteId) {
        return e.json(400, { error: 'cliente_id é obrigatório' })
      }

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) {
        return e.json(404, { error: 'Cliente não encontrado' })
      }

      const estadoAnterior = cliente.getString('estado') || 'na_base'
      const desfechoAnterior = cliente.getString('desfecho') || ''
      const quarentenaAnterior = cliente.getString('quarentena_ate') || ''
      const standbyAnterior = cliente.getString('standby_ate') || ''
      const vendedorAnterior = cliente.getString('vendedor') || ''

      // Blindagem: cliente em atendimento/reservado ativo não pode ser destravado
      // (evita conflito de cadeira); primeiro o lock precisa expirar ou ser liberado.
      if (estadoAnterior === 'em_atendimento' || estadoAnterior === 'reservado') {
        return e.json(400, {
          error:
            'Cliente está em atendimento/reservado neste momento. Libere o atendimento antes de destravar.',
        })
      }

      // Estado anterior capturado para auditoria
      const detalhes = {
        codigo: cliente.getString('codigo'),
        nome: cliente.getString('nome'),
        regiao: cliente.getString('regiao'),
        estado_anterior: estadoAnterior,
        desfecho_anterior: desfechoAnterior,
        quarentena_anterior: quarentenaAnterior,
        standby_anterior: standbyAnterior,
        vendedor_anterior: vendedorAnterior,
        vendedor_novo: novoVendedor ? normalizarTextoNFD(novoVendedor) : vendedorAnterior,
        motivo: motivo || 'Destrava manual autorizada pelo Administrador',
        base_categoria: cliente.getString('base_categoria') || '',
        nota: 'Destrava para novo atendimento; histórico e blindagem anti-duplicidade preservados',
      }

      // Destrava: devolve o cliente à fila/carteira trabalhável
      cliente.set('estado', 'na_base')
      cliente.set('quarentena_ate', null)
      cliente.set('standby_ate', null)
      cliente.set('reativado_em', null)
      cliente.set('operador', '')
      cliente.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
      cliente.set('prioridade_transferencia', false)

      // Reatribuição opcional a qualquer vendedor, a critério do admin
      if (novoVendedor) {
        cliente.set('vendedor', normalizarTextoNFD(novoVendedor))
      }

      $app.save(cliente)

      // Auditoria obrigatória em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', userId)
        ev.set('acao', 'admin_destrava_venda_perdida')
        ev.set('detalhes', detalhes)
        $app.save(ev)
      } catch (evErr) {
        console.error('[admin_destrava] Falha ao gravar eventos_log: ' + evErr.message)
      }

      console.log(
        `[admin_destrava] Admin ${userName} destravou cliente ${detalhes.codigo} (estado anterior: ${estadoAnterior}, desfecho: ${desfechoAnterior || 'n/a'})`,
      )

      return e.json(200, {
        ok: true,
        message: `Cliente destravado: voltou para "Na Base"${novoVendedor ? ` e foi reatribuído a ${normalizarTextoNFD(novoVendedor)}` : ''}. O histórico anterior foi preservado.`,
        cliente: cliente,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[admin_destrava] Erro crítico: ' + errMsg)
      return e.json(500, { error: 'Falha ao destravar cliente: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
