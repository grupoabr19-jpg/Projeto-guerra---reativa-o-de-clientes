// pocketbase/hooks/editar_peso_admin.js
// Edição de peso/tonelagem por ADMIN (e somente admin).
// Rota: POST /backend/v1/queue/editar-peso-admin
// Body: { cliente_id, peso, unidade, observacao }
//   - peso: valor BRUTO digitado pelo admin (ex.: 6.89 para 6,89 t)
//   - unidade: 'kg' | 't' (aceita ainda kg/quilo(s)/ton/tonelada(s)) — default kg
// - Grava SEMPRE em kg canônico (clientes.toneladas_historico).
// - Auditoria em eventos_log: acao='edicao_peso_admin' com kg_anterior, kg_novo,
//   unidade_informada, admin e observação (ex. "conferido no ERP, NF 389041").
// - Regra vigente: ERP vence a ficha — esta edição atualiza o dado gravado do cliente
//   (toneladas_historico) e NÃO cria bypass: se o ERP depois reportar peso, a esteira
//   de replicação (peso_nf_tonelagem → toneladas_historico) continua vencendo.
// NOTA Goja: NÃO usar $apis.* (não existe no JSVM do PocketBase v0.23+). Auth e body
// vêm de e.auth / e.requestInfo() — padrão dos demais hooks do projeto.

routerAdd('POST', '/backend/v1/queue/editar-peso-admin', (e) => {
  const info = e.requestInfo()
  const authRecord = e.auth

  if (!authRecord || !authRecord.id) {
    return e.json(401, { error: 'Autenticação necessária.' })
  }
  if (authRecord.getString('role') !== 'admin') {
    return e.json(403, { error: 'Apenas administradores podem editar o peso.' })
  }

  const body = (info && info.body) || {}
  const clienteId = String(body.cliente_id || '').trim()
  const observacao = String(body.observacao || '').trim()

  // Valor bruto digitado + unidade explícita (o backend NUNCA adivinha quando a unidade vem do frontend)
  let pesoBruto = NaN
  if (body.peso !== undefined && body.peso !== null && String(body.peso).trim() !== '') {
    pesoBruto = parseFloat(String(body.peso).replace(/\./g, '').replace(',', '.'))
    if (isNaN(pesoBruto)) pesoBruto = Number(body.peso)
  } else if (
    body.peso_kg !== undefined &&
    body.peso_kg !== null &&
    String(body.peso_kg).trim() !== ''
  ) {
    // Compatibilidade: valor já em kg canônico
    pesoBruto = Number(body.peso_kg)
  }

  const unidadeRaw = String(body.unidade || body.unidade_peso || 'kg')
    .toLowerCase()
    .trim()
  let unidadeInformada = 'kg'
  if (
    unidadeRaw === 't' ||
    unidadeRaw === 'ton' ||
    unidadeRaw === 'tonelada' ||
    unidadeRaw === 'toneladas'
  ) {
    unidadeInformada = 'ton'
  } else if (
    unidadeRaw === 'kg' ||
    unidadeRaw === 'quilo' ||
    unidadeRaw === 'quilos' ||
    unidadeRaw === ''
  ) {
    unidadeInformada = 'kg'
  } else {
    return e.json(400, { error: 'unidade deve ser "kg" ou "t".' })
  }

  if (!clienteId) {
    return e.json(400, { error: 'cliente_id é obrigatório.' })
  }
  if (isNaN(pesoBruto) || pesoBruto < 0) {
    return e.json(400, { error: 'peso inválido (deve ser número >= 0).' })
  }

  // Conversão para kg canônico (kg é a unidade canônica do sistema)
  const novoPesoKg =
    unidadeInformada === 'ton'
      ? Number((pesoBruto * 1000).toFixed(6))
      : Number(pesoBruto.toFixed(6))

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
        kg_anterior: pesoAnteriorKg,
        kg_novo: novoPesoKg,
        unidade_informada: unidadeInformada,
        valor_bruto_informado: pesoBruto,
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
        ' kg (informado: ' +
        pesoBruto +
        ' ' +
        unidadeInformada +
        ') | admin: ' +
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
        kg_anterior: pesoAnteriorKg,
        kg_novo: novoPesoKg,
        unidade_informada: unidadeInformada,
      },
    })
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err)
    console.error('[editar_peso_admin] Erro: ' + errMsg)
    const notFound = errMsg && errMsg.toLowerCase().indexOf('sql: no rows') !== -1
    return e.json(notFound ? 404 : 500, {
      error: notFound ? 'Cliente não encontrado.' : 'Erro ao editar peso: ' + errMsg,
    })
  }
})
