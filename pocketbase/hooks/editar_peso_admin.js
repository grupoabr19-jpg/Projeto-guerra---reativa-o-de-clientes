// pocketbase/hooks/editar_peso_admin.js
// Edição de peso/tonelagem por ADMIN (e somente admin).
// - Grava SEMPRE em kg canônico (o frontend envia valor + unidade explícita).
// - Auditoria completa em eventos_log: acao='edicao_peso_admin' com valor anterior,
//   novo valor, quem editou e a observação (ex. "conferido no ERP, NF 389041").
// - Regra vigente: ERP vence a ficha — esta edição atualiza o dado gravado do cliente
//   (toneladas_historico) e NÃO cria bypass: se o ERP depois reportar peso, a esteira
//   de replicação (peso_nf_tonelagem → toneladas_historico) continua vencendo.

routerAdd(
  'POST',
  '/backend/v1/clientes/editar-peso-admin',
  (e) => {
    const info = $apis.requestInfo(e)
    const authRecord = info.auth

    if (!authRecord) {
      return e.json(401, { error: 'Autenticação necessária.' })
    }
    if (authRecord.getString('role') !== 'admin') {
      return e.json(403, { error: 'Apenas administradores podem editar o peso.' })
    }

    const body = info.body || {}
    const clienteId = String(body.cliente_id || '').trim()
    const novoPesoKg = Number(body.peso_kg)
    const unidadeFront = String(body.unidade_peso || 'kg').toLowerCase()
    const observacao = String(body.observacao || '').trim()

    if (!clienteId) {
      return e.json(400, { error: 'cliente_id é obrigatório.' })
    }
    if (isNaN(novoPesoKg) || novoPesoKg < 0) {
      return e.json(400, { error: 'peso_kg inválido (deve ser número em kg, >= 0).' })
    }
    if (unidadeFront !== 'kg' && unidadeFront !== 'ton') {
      return e.json(400, { error: 'unidade_peso deve ser "kg" ou "ton".' })
    }

    try {
      const cliente = $app.findRecordById('clientes', clienteId)

      const pesoAnteriorKg = cliente.getFloat('toneladas_historico')
      const pesoNfKg = cliente.getFloat('peso_nf_tonelagem') * 1000

      // Gravar em kg canônico
      cliente.set('toneladas_historico', novoPesoKg)
      $app.save(cliente)

      const adminId = authRecord.id
      const adminNome =
        authRecord.getString('name') || authRecord.getString('email') || 'Administrador'

      // Auditoria em eventos_log (valor anterior, novo valor, quem editou e observação)
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('cliente', cliente.id)
        ev.set('usuario', adminId)
        ev.set('acao', 'edicao_peso_admin')
        ev.set('detalhes', {
          cliente_id: cliente.id,
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          peso_anterior_kg: pesoAnteriorKg,
          peso_novo_kg: novoPesoKg,
          peso_anterior_ton: Number((pesoAnteriorKg / 1000).toFixed(6)),
          peso_novo_ton: Number((novoPesoKg / 1000).toFixed(6)),
          unidade_informada: unidadeFront,
          observacao: observacao,
          peso_nf_erp_kg: pesoNfKg,
          admin_id: adminId,
          admin_nome: adminNome,
          timestamp: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (evErr) {
        console.log('[editar_peso_admin] Aviso ao registrar auditoria: ' + evErr.message)
      }

      console.log(
        '[editar_peso_admin] ' +
          cliente.getString('codigo') +
          ' | ' +
          pesoAnteriorKg +
          ' kg -> ' +
          novoPesoKg +
          ' kg | admin: ' +
          adminNome +
          ' | obs: ' +
          (observacao || '—'),
      )

      return e.json(200, {
        ok: true,
        message: 'Peso atualizado com sucesso.',
        cliente: {
          id: cliente.id,
          codigo: cliente.getString('codigo'),
          nome: cliente.getString('nome'),
          peso_anterior_kg: pesoAnteriorKg,
          peso_novo_kg: novoPesoKg,
        },
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.error('[editar_peso_admin] Erro: ' + errMsg)
      return e.json(500, { error: 'Erro ao editar peso: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
