routerAdd(
  'POST',
  '/backend/v1/kommo/sync-lead',
  (e) => {
    try {
      const body = e.requestInfo().body || {}
      const clienteId = body.cliente_id
      if (!clienteId) return e.badRequestError('cliente_id é obrigatório')

      const cliente = $app.findRecordById('clientes', clienteId)
      if (!cliente) return e.notFoundError('Cliente não encontrado')

      const subdomain = $os.getenv('KOMMO_SUBDOMAIN') || ''
      const accessToken = $os.getenv('KOMMO_ACCESS_TOKEN') || ''

      if (!subdomain || !accessToken) {
        // Degrada graciosamente quando os secrets do Kommo ainda não estiverem fornecidos pelo usuário
        return e.json(200, {
          synced: false,
          skipped: true,
          message: 'Secrets do Kommo não configurados no backend. Sincronização pendente.',
        })
      }

      const action = body.action || 'reserve' // "reserve" | "finalize"
      const desfecho = body.desfecho || cliente.getString('estado')
      const observacoes = body.observacoes || ''

      let kommoId = cliente.getString('kommo_id')
      let kommoLeadId = cliente.getString('kommo_lead_id')

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }

      // 1. Se não tiver contato no Kommo, busca ou cria
      if (!kommoId) {
        const searchPhone = cliente.getString('telefone') || cliente.getString('whatsapp')
        let foundContact = null
        if (searchPhone) {
          const cleanPhone = searchPhone.replace(/\D/g, '')
          const searchRes = $http.send({
            url: `https://${subdomain}.kommo.com/api/v4/contacts?query=${cleanPhone}`,
            method: 'GET',
            headers: headers,
            timeout: 10,
          })
          if (searchRes.statusCode === 200 && searchRes.json?._embedded?.contacts?.length > 0) {
            foundContact = searchRes.json._embedded.contacts[0]
            kommoId = String(foundContact.id)
          }
        }

        if (!kommoId) {
          // Criar contato
          const createContactRes = $http.send({
            url: `https://${subdomain}.kommo.com/api/v4/contacts`,
            method: 'POST',
            headers: headers,
            body: JSON.stringify([
              {
                name: cliente.getString('nome'),
                custom_fields_values: [
                  {
                    field_code: 'PHONE',
                    values: [
                      {
                        value: cliente.getString('telefone') || cliente.getString('whatsapp'),
                        enum_code: 'WORK',
                      },
                    ],
                  },
                  {
                    field_code: 'EMAIL',
                    values: [{ value: cliente.getString('email'), enum_code: 'WORK' }],
                  },
                ],
              },
            ]),
            timeout: 10,
          })
          if (createContactRes.statusCode >= 200 && createContactRes.statusCode < 300) {
            const created = createContactRes.json?._embedded?.contacts?.[0]
            if (created) kommoId = String(created.id)
          }
        }
      }

      // 2. Se não tiver Lead no funil "Reativação", cria
      if (!kommoLeadId && kommoId) {
        // Obter vendedor externo de referência da região
        let vendedorRef = cliente.getString('vendedor') || ''
        const clienteRegiao = cliente.getString('regiao')
        if (!vendedorRef && clienteRegiao) {
          try {
            const regRecord = $app.findFirstRecordByData('regioes', 'nome', clienteRegiao)
            if (regRecord) {
              vendedorRef = regRecord.getString('vendedor_externo') || ''
            }
          } catch (_) {}
        }

        const leadPayload = {
          name: `Reativação: [${cliente.getString('codigo')}] ${cliente.getString('nome')}`,
          price: cliente.getInt('valor_ultima_compra') || 0,
          _embedded: {
            contacts: [{ id: parseInt(kommoId, 10) }],
          },
          custom_fields_values: [
            ...(clienteRegiao
              ? [
                  {
                    field_name: 'Região',
                    values: [{ value: clienteRegiao }],
                  },
                ]
              : []),
            ...(vendedorRef
              ? [
                  {
                    field_name: 'Vendedor Externo',
                    values: [{ value: vendedorRef }],
                  },
                ]
              : []),
          ],
        }

        const createLeadRes = $http.send({
          url: `https://${subdomain}.kommo.com/api/v4/leads`,
          method: 'POST',
          headers: headers,
          body: JSON.stringify([leadPayload]),
          timeout: 10,
        })
        if (createLeadRes.statusCode >= 200 && createLeadRes.statusCode < 300) {
          const createdLead = createLeadRes.json?._embedded?.leads?.[0]
          if (createdLead) kommoLeadId = String(createdLead.id)
        }
      }
      // 3. Gravar nota no lead com resumo do atendimento se foi finalização
      if (action === 'finalize' && kommoLeadId) {
        $http.send({
          url: `https://${subdomain}.kommo.com/api/v4/leads/${kommoLeadId}/notes`,
          method: 'POST',
          headers: headers,
          body: JSON.stringify([
            {
              note_type: 'common',
              params: {
                text: `[Projeto Guerra] Atendimento Finalizado:\nDesfecho: ${desfecho}\nObservações: ${observacoes}\nData: ${new Date().toLocaleString('pt-BR')}`,
              },
            },
          ]),
          timeout: 10,
        })

        // Se reagendado, criar tarefa de follow-up
        if (desfecho === 'reagendado' && cliente.getString('reagendado_para')) {
          const completeTill = Math.floor(
            new Date(cliente.getString('reagendado_para')).getTime() / 1000,
          )
          $http.send({
            url: `https://${subdomain}.kommo.com/api/v4/tasks`,
            method: 'POST',
            headers: headers,
            body: JSON.stringify([
              {
                text: `Follow-up de reativação: ${cliente.getString('nome')}`,
                complete_till: completeTill,
                entity_id: parseInt(kommoLeadId, 10),
                entity_type: 'leads',
              },
            ]),
            timeout: 10,
          })
        }
      }

      // Salva IDs no cliente
      if (kommoId) cliente.set('kommo_id', kommoId)
      if (kommoLeadId) cliente.set('kommo_lead_id', kommoLeadId)
      $app.save(cliente)

      return e.json(200, {
        synced: true,
        kommo_id: kommoId,
        kommo_lead_id: kommoLeadId,
        message: 'Sincronizado com o Kommo com sucesso.',
      })
    } catch (err) {
      return e.json(500, { error: err.message })
    }
  },
  $apis.requireAuth(),
)
