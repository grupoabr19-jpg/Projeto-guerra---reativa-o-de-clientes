routerAdd('POST', '/backend/v1/kommo/webhook', (e) => {
  try {
    const rawBody = e.requestInfo().body || {}
    // Kommo envia webhooks de leads e contatos alterados externamente
    const leads = rawBody.leads?.status || rawBody.leads?.update || rawBody.leads?.add || []

    let processed = 0
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      const leadId = String(lead.id)

      try {
        const cliente = $app.findFirstRecordByData('clientes', 'kommo_lead_id', leadId)
        if (cliente) {
          // Grava evento de auditoria
          const colEventos = $app.findCollectionByNameOrId('eventos_log')
          const ev = new Record(colEventos)
          ev.set('cliente', cliente.id)
          ev.set('acao', 'kommo_webhook_update')
          ev.set('detalhes', {
            leadId: leadId,
            status_id: lead.status_id,
            pipeline_id: lead.pipeline_id,
          })
          $app.save(ev)
          processed++
        }
      } catch (_) {}
    }

    return e.json(200, { ok: true, processed: processed })
  } catch (err) {
    return e.json(500, { error: err.message })
  }
})
