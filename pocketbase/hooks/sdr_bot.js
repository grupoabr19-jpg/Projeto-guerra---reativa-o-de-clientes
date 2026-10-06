/// <reference path="../pb_data/types.d.ts" />

/**
 * sdr_bot.js
 *
 * Módulo de backend do Bot SDR Grupo ABR:
 * Endpoints:
 * 1. GET  /backend/v1/sdr/config       -> Retorna as configurações vigentes do bot SDR
 * 2. POST /backend/v1/sdr/config       -> Atualiza configurações do bot SDR (nome, tom, saudacao, prompt, regras, status ativo)
 * 3. POST /backend/v1/sdr/test         -> Simulação/Área de Teste do Admin: roda triagem e decisão sem afetar clientes reais
 * 4. GET  /backend/v1/sdr/logs         -> Lista auditoria/histórico recente de triagens reais ou simuladas
 * 5. POST /backend/v1/sdr/toggle       -> Ligar/desligar rápido o bot SDR
 *
 * NOTA CRÍTICA DE ESCOPO: Todas as funções auxiliares residem DENTRO do corpo de cada callback routerAdd
 * para respeitar a arquitetura multi-VM pool do PocketBase/Goja.
 */

routerAdd(
  'GET',
  '/backend/v1/sdr/config',
  (e) => {
    try {
      const auth = e.auth
      if (!auth || !auth.id) return e.unauthorizedError('Autenticação necessária.')
      const role = auth.getString('role')
      if (role !== 'admin' && role !== 'supervisor') {
        return e.forbiddenError('Acesso restrito ao administrador ou supervisor.')
      }

      let cfgRec = null
      try {
        cfgRec = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      } catch (_) {}

      const configData = cfgRec ? cfgRec.get('valor') : null
      return e.json(200, {
        ok: true,
        config: configData || {
          ativo: true,
          nome_sdr: 'SDR Virtual Grupo ABR',
          saudacao:
            'Olá! Sou o assistente SDR do Grupo ABR, seu parceirAço em aço e soluções siderúrgicas. Como posso ajudar com sua obra, empresa ou indústria hoje?',
          tom: 'profissional, ágil e focado em fechamento',
          instrucoes:
            'Qualifique se é compra para obra própria/reforma (Varejo) ou empresa/indústria/revenda (Corporativo). Identifique cidade e produto. NUNCA prometa preço ou prazo fechado. Transfira rapidamente para o vendedor especialista da rota.',
          mensagem_fora_expediente:
            'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!',
          regras_rotas: {},
          regras_atacado_ddd: {},
          fallback_admin: { nome: 'Thiago Almeida', role: 'admin' },
        },
      })
    } catch (err) {
      console.log('[sdr_bot] Erro ao obter config: ' + err.message)
      return e.json(500, { ok: false, error: err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/sdr/config',
  (e) => {
    try {
      const auth = e.auth
      if (!auth || !auth.id) return e.unauthorizedError('Autenticação necessária.')
      const role = auth.getString('role')
      if (role !== 'admin') {
        return e.forbiddenError('Apenas administradores podem alterar as configurações do Bot SDR.')
      }

      const body = e.requestInfo().body || {}
      const configCol = $app.findCollectionByNameOrId('configuracoes')
      let cfgRec = null
      try {
        cfgRec = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      } catch (_) {}

      if (!cfgRec) {
        cfgRec = new Record(configCol)
        cfgRec.set('chave', 'sdr_bot_config')
        cfgRec.set(
          'descricao',
          'Configurações de comportamento, prompt e regras do Bot SDR Grupo ABR',
        )
      }

      const currentVal = cfgRec.get('valor') || {}
      const payload = body.config || body || {}
      const updatedVal = Object.assign({}, currentVal, payload)

      cfgRec.set('valor', updatedVal)
      $app.save(cfgRec)

      // Registrar auditoria
      try {
        const evCol = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(evCol)
        ev.set('usuario', auth.id)
        ev.set('acao', 'sdr_config_atualizada')
        ev.set('detalhes', {
          ativo: updatedVal.ativo,
          nome_sdr: updatedVal.nome_sdr,
          alterado_por: auth.getString('name'),
          data: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: 'Configurações do Bot SDR salvas com sucesso!',
        config: updatedVal,
      })
    } catch (err) {
      console.log('[sdr_bot] Erro ao salvar config: ' + err.message)
      return e.json(500, { ok: false, error: err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/sdr/toggle',
  (e) => {
    try {
      const auth = e.auth
      if (!auth || !auth.id) return e.unauthorizedError('Autenticação necessária.')
      if (auth.getString('role') !== 'admin') {
        return e.forbiddenError('Apenas administradores podem ativar/desativar o Bot SDR.')
      }

      const body = e.requestInfo().body || {}
      const configCol = $app.findCollectionByNameOrId('configuracoes')
      let cfgRec = null
      try {
        cfgRec = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      } catch (_) {}

      if (!cfgRec) {
        cfgRec = new Record(configCol)
        cfgRec.set('chave', 'sdr_bot_config')
        cfgRec.set(
          'descricao',
          'Configurações de comportamento, prompt e regras do Bot SDR Grupo ABR',
        )
      }

      const currentVal = cfgRec.get('valor') || {}
      const novoAtivo = typeof body.ativo === 'boolean' ? body.ativo : !currentVal.ativo

      const updatedVal = Object.assign({}, currentVal, { ativo: novoAtivo })

      cfgRec.set('valor', updatedVal)
      $app.save(cfgRec)

      // Auditoria
      try {
        const evCol = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(evCol)
        ev.set('usuario', auth.id)
        ev.set('acao', novoAtivo ? 'sdr_bot_ativado' : 'sdr_bot_desativado')
        ev.set('detalhes', {
          ativo: novoAtivo,
          alterado_por: auth.getString('name'),
          data: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        ativo: novoAtivo,
        message: novoAtivo
          ? 'Bot SDR ativado com sucesso! As novas conversas da linha WhatsApp serão qualificadas e direcionadas.'
          : 'Bot SDR pausado. Conversas da linha WhatsApp cairão diretamente com o Administrador Thiago Almeida.',
      })
    } catch (err) {
      console.log('[sdr_bot] Erro ao alternar status do bot: ' + err.message)
      return e.json(500, { ok: false, error: err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/sdr/test',
  (e) => {
    try {
      const auth = e.auth
      if (!auth || !auth.id) return e.unauthorizedError('Autenticação necessária.')
      const role = auth.getString('role')
      if (role !== 'admin' && role !== 'supervisor') {
        return e.forbiddenError('Acesso exclusivo ao administrador para testes do SDR.')
      }

      const body = e.requestInfo().body || {}
      const mensagem = (body.mensagem || body.message || '').toString().trim()
      const telefone = (body.telefone || '').toString().trim()
      const documento = (body.documento || '').toString().trim()
      const nomeCliente = (body.nome || body.nomeCliente || 'Cliente Teste').toString().trim()

      if (!mensagem && !telefone && !documento) {
        return e.badRequestError(
          'Envie pelo menos uma mensagem, telefone ou documento para simulação.',
        )
      }

      // Executa o AI Agent Skip Cloud nativo 'sdr-triagem-bot' para gerar a resposta conversacional do SDR
      let aiResponseText = ''
      try {
        const agentRes = $ai.agent('sdr-triagem-bot').chat({
          user_id: auth.id,
          message: `[SIMULAÇÃO SDR TESTE] Cliente: "${nomeCliente}". Telefone: "${telefone}". Documento: "${documento}". Mensagem do cliente: "${mensagem}". Como SDR do Grupo ABR, responda educadamente qualificando se é Varejo ou Corporativo e confirmando para qual especialista direcionará.`,
        })
        aiResponseText = agentRes && agentRes.content ? agentRes.content.trim() : ''
      } catch (aiErr) {
        console.log('[sdr_bot_test] Agente AI Skip Cloud fallback: ' + aiErr.message)
        aiResponseText = `Olá ${nomeCliente}! Sou o assistente SDR do Grupo ABR. Recebi sua solicitação de aço e já estou direcionando seu atendimento para o especialista responsável.`
      }

      // Se o teste indicar simulação de fora de expediente
      const simularForaExpediente = body.fora_expediente === true
      let msgForaExpConfig = ''
      try {
        const cfgObj = $app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
        if (cfgObj) {
          const val = cfgObj.get('valor') || {}
          if (val.mensagem_fora_expediente) msgForaExpConfig = val.mensagem_fora_expediente
        }
      } catch (_) {}

      if (simularForaExpediente) {
        const respFora =
          msgForaExpConfig ||
          'Olá! Nosso atendimento é de segunda a sexta, das 7h às 18h. Sua mensagem já foi registrada e retornaremos no início do próximo dia útil!'

        return e.json(200, {
          ok: true,
          simulacao: true,
          resposta_sdr: respFora,
          decisao: {
            classificacao: 'FORA_EXPEDIENTE',
            rota_destino: 'MATRIZ / ADMIN',
            operador_destino_id: auth.id,
            operador_destino_nome: 'Thiago Almeida (Admin)',
            kommo_user_id: '',
            regra_aplicada: 'Regra Fora de Expediente (após 18h / fim de semana / feriado)',
            motivo_decisao:
              'Contato simulado fora do expediente comercial. Mensagem automática enviada e lead retido para o próximo dia útil às 7h.',
            nota_kommo_preview:
              '[SDR Grupo ABR]: Contato fora do expediente. Retido para próximo dia útil.',
            status_transferencia: 'agendado_proximo_expediente',
          },
        })
      }
      // Executa a triagem analítica inline
      const cleanPhone = String(telefone).replace(/\D/g, '')
      const cleanDoc = String(documento).replace(/\D/g, '')

      let clienteRecord = null
      let motivoBusca = ''

      if (cleanDoc && (cleanDoc.length === 11 || cleanDoc.length === 14)) {
        try {
          const docRecs = $app.findRecordsByFilter(
            'clientes',
            `cpf_cnpj ~ '${cleanDoc}'`,
            '-created',
            1,
          )
          if (docRecs && docRecs.length > 0) {
            clienteRecord = docRecs[0]
            motivoBusca = `Cliente localizado na base por CPF/CNPJ: ${cleanDoc}`
          }
        } catch (_) {}
      }

      if (!clienteRecord && cleanPhone && cleanPhone.length >= 8) {
        try {
          const suffix = cleanPhone.length >= 9 ? cleanPhone.slice(-9) : cleanPhone.slice(-8)
          const telRecs = $app.findRecordsByFilter(
            'clientes',
            `telefone ~ '${suffix}' || whatsapp ~ '${suffix}'`,
            '-created',
            1,
          )
          if (telRecs && telRecs.length > 0) {
            clienteRecord = telRecs[0]
            motivoBusca = `Cliente localizado na base pelo telefone: ${cleanPhone}`
          }
        } catch (_) {}
      }

      let ddd = ''
      if (cleanPhone.length >= 10) {
        const s = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone
        ddd = s.slice(0, 2)
      }

      let adminRecord = null
      try {
        adminRecord = $app.findFirstRecordByData('users', 'email', 'thiago.almeida@grupoabr.com.br')
      } catch (_) {
        try {
          adminRecord = $app.findFirstRecordByData('users', 'role', 'admin')
        } catch (_) {}
      }

      let classificacao = 'SEM_ROTA'
      let rotaDestino = ''
      let operadorAlvo = null
      let regraAplicada = ''
      let motivoDecisao = ''
      let notaKommo = ''

      const textoCompleto = `${mensagem} ${nomeCliente}`.toLowerCase()

      if (clienteRecord) {
        const vendedorBase = (clienteRecord.getString('vendedor') || '').trim()
        const regiaoCliente = (clienteRecord.getString('regiao') || '').trim()
        const tipoVendedor = (clienteRecord.getString('tipo_vendedor') || '').toUpperCase()
        const dddCliente = (clienteRecord.getString('ddd_telefone') || ddd).trim()

        if (regiaoCliente.toUpperCase() === 'ATACADO') {
          classificacao = 'ATACADO'
          rotaDestino = 'ATACADO'
          let alvoNome = ''
          if (['11', '12', '13'].includes(dddCliente)) alvoNome = 'Larissa Terra'
          else if (['15', '19'].includes(dddCliente)) alvoNome = 'Julio Melo'
          else if (['14', '16', '17', '18'].includes(dddCliente)) alvoNome = 'Wilson Neto'
          else alvoNome = 'Anderson Silva'

          if (alvoNome) {
            try {
              const uRecs = $app.findRecordsByFilter(
                'users',
                `name ~ '${alvoNome.split(' ')[0]}' && (regioes ~ 'ATACADO' || role = 'operador' || role = 'lider')`,
                '-created',
                1,
              )
              if (uRecs && uRecs.length > 0) operadorAlvo = uRecs[0]
            } catch (_) {}
          }

          regraAplicada = `Base Clientes -> Região ATACADO (DDD ${dddCliente || 'N/D'})`
          motivoDecisao = `Cliente com cadastro ativo na região ATACADO. Encaminhado ao especialista do canal Atacado.`
          notaKommo = `SDR Grupo ABR: Cliente de ATACADO identificado (DDD ${dddCliente}). Rota Atacado -> ${operadorAlvo ? operadorAlvo.getString('name') : alvoNome}.`
        } else if (vendedorBase) {
          let nomeLimpo = vendedorBase
          const pfxList = ['VARE - ', 'VCORP - ', 'VAREXT - ', 'ATR - ']
          for (let px = 0; px < pfxList.length; px++) {
            if (nomeLimpo.startsWith(pfxList[px])) {
              nomeLimpo = nomeLimpo.slice(pfxList[px].length).trim()
              break
            }
          }

          if (vendedorBase.startsWith('VCORP') || tipoVendedor === 'CORPORATIVO') {
            classificacao = 'VCORP'
          } else {
            classificacao = 'VARE'
          }
          rotaDestino = regiaoCliente || 'Geral'

          try {
            const uMatches = $app.findRecordsByFilter(
              'users',
              `name ~ '${nomeLimpo}' && (role = 'operador' || role = 'lider' || role = 'supervisor')`,
              '-created',
              1,
            )
            if (uMatches && uMatches.length > 0) operadorAlvo = uMatches[0]
          } catch (_) {}

          regraAplicada = `Base Clientes -> Carteira Prévia (${classificacao} - ${vendedorBase} / Rota: ${rotaDestino})`
          motivoDecisao = `${motivoBusca}. Carteira atribuída ao vendedor especialista ${vendedorBase} na rota ${rotaDestino}.`
          notaKommo = `SDR Grupo ABR: Cliente qualificado (${classificacao}) com carteira existente na rota ${rotaDestino} (${vendedorBase}).`
        }
      }

      if (!operadorAlvo) {
        const keywordsVcorp = [
          'empresa',
          'cnpj',
          'indústria',
          'industria',
          'revenda',
          'construtora',
          'serralheria',
          'serralheiro',
          'estruturista',
          'metalurgica',
          'metalúrgica',
          'tonelada',
          'toneladas',
          'lajeiro',
          'galpão',
          'galpao',
          'corporativo',
        ]
        const isVcorpText = keywordsVcorp.some((k) => textoCompleto.includes(k))

        const mapaRotas = [
          {
            rota: 'BRAGANÇA',
            cidades: [
              'bragança',
              'braganca',
              'atibaia',
              'piracaia',
              'nazaré',
              'vargem',
              'mairiporã',
              'joanópolis',
            ],
          },
          {
            rota: 'JUNDIAÍ',
            cidades: [
              'jundiaí',
              'jundiai',
              'itatiba',
              'jarinu',
              'várzea paulista',
              'varzea paulista',
              'campo limpo',
              'itupeva',
              'cajamar',
              'vinhedo',
            ],
          },
          {
            rota: 'VARGINHA',
            cidades: [
              'varginha',
              'três pontas',
              'tres pontas',
              'três corações',
              'tres coracoes',
              'elói mendes',
              'paraguaçu',
              'campanha',
              'cambuquira',
            ],
          },
          {
            rota: 'POUSO ALEGRE',
            cidades: [
              'pouso alegre',
              'jacutinga',
              'borda da mata',
              'bueno brandão',
              'lambari',
              'caxambu',
              'são lourenço',
              'careaçu',
            ],
          },
          {
            rota: 'POÇOS DE CALDAS',
            cidades: [
              'poços de caldas',
              'pocos de caldas',
              'alfenas',
              'machado',
              'caldas',
              'santa rita de caldas',
              'congonhal',
              'poço fundo',
              'ouro fino',
            ],
          },
          {
            rota: 'ITAJUBÁ',
            cidades: [
              'itajubá',
              'itajuba',
              'santa rita do sapucaí',
              'santa rita sapucai',
              'piranguinho',
              'maria da fé',
              'pedralva',
              'delfim moreira',
              'andradas',
            ],
          },
          {
            rota: 'EXTREMA',
            cidades: [
              'extrema',
              'toledo',
              'munhoz',
              'pedra bela',
              'pinhalzinho',
              'socorro',
              'serra negra',
              'monte sião',
              'monte siao',
            ],
          },
          {
            rota: 'CAMBUÍ',
            cidades: [
              'cambuí',
              'cambui',
              'bom repouso',
              'senador amaral',
              'estiva',
              'camanducaia',
              'itapeva',
              'monte verde',
            ],
          },
        ]

        let rotaEncontrada = null
        for (let r = 0; r < mapaRotas.length; r++) {
          const item = mapaRotas[r]
          if (item.cidades.some((c) => textoCompleto.includes(c))) {
            rotaEncontrada = item.rota
            break
          }
        }

        if (rotaEncontrada) {
          rotaDestino = rotaEncontrada
          classificacao = isVcorpText ? 'VCORP' : 'VARE'

          try {
            const regRecs = $app.findRecordsByFilter(
              'regioes',
              `nome = '${rotaDestino}'`,
              '-created',
              1,
            )
            if (regRecs && regRecs.length > 0) {
              const regObj = regRecs[0]
              const targetName = isVcorpText
                ? regObj.getString('corporativo') || regObj.getString('especialista')
                : regObj.getString('especialista') || regObj.getString('vendedor_externo')

              if (targetName) {
                const uRecs = $app.findRecordsByFilter(
                  'users',
                  `name ~ '${targetName.trim().split(' ')[0]}'`,
                  '-created',
                  1,
                )
                if (uRecs && uRecs.length > 0) {
                  operadorAlvo = uRecs[0]
                }
              }
            }
          } catch (_) {}

          regraAplicada = `Detecção Geográfica -> Rota ${rotaDestino} (${classificacao})`
          motivoDecisao = `Cidade detectada na conversa pertence à rota ${rotaDestino}. Classificação: ${classificacao === 'VCORP' ? 'Corporativo (indústria/empresa)' : 'Varejo (obra própria/pequena empresa)'}.`
          notaKommo = `SDR Grupo ABR: Lead triado para ${classificacao} na rota ${rotaDestino}. Especialista: ${operadorAlvo ? operadorAlvo.getString('name') : 'Especialista da rota'}.`
        } else if (ddd && ['11', '12', '13', '14', '15', '16', '17', '18', '19'].includes(ddd)) {
          classificacao = 'ATACADO'
          rotaDestino = 'ATACADO'
          let alvoNome = ''
          if (['11', '12', '13'].includes(ddd)) alvoNome = 'Larissa Terra'
          else if (['15', '19'].includes(ddd)) alvoNome = 'Julio Melo'
          else alvoNome = 'Wilson Neto'

          try {
            const uRecs = $app.findRecordsByFilter(
              'users',
              `name ~ '${alvoNome.split(' ')[0]}'`,
              '-created',
              1,
            )
            if (uRecs && uRecs.length > 0) operadorAlvo = uRecs[0]
          } catch (_) {}

          regraAplicada = `Fila ATACADO por DDD -> (${ddd})`
          motivoDecisao = `Cliente sem rota de varejo detectada, enquadrado no canal Atacado pelo prefixo telefônico DDD ${ddd}.`
          notaKommo = `SDR Grupo ABR: Lead enquadrado no Atacado (DDD ${ddd}) -> ${operadorAlvo ? operadorAlvo.getString('name') : alvoNome}.`
        } else {
          classificacao = 'SEM_ROTA'
          rotaDestino = 'ADMIN / MATRIZ'
          operadorAlvo = adminRecord
          regraAplicada = 'Sem rota/cadastro -> Admin Thiago Almeida'
          motivoDecisao =
            'Lead sem identificação de rota geográfica ou DDD de atacado. Mantido sob a responsabilidade do administrador para triagem manual.'
          notaKommo = 'SDR Grupo ABR: Lead sem rota definida. Encaminhado ao Admin Thiago Almeida.'
        }
      }

      if (!operadorAlvo) operadorAlvo = adminRecord
      const operadorNome = operadorAlvo ? operadorAlvo.getString('name') : 'Thiago Almeida (Admin)'
      const kommoUserId = operadorAlvo ? operadorAlvo.getString('kommo_user_id') || '' : ''

      // Registrar o log da simulação na coleção sdr_triagens_log (eh_simulacao = true)
      let logId = ''
      try {
        const logCol = $app.findCollectionByNameOrId('sdr_triagens_log')
        const logRec = new Record(logCol)
        logRec.set('cliente_nome', `${nomeCliente} [SIMULAÇÃO]`)
        logRec.set('telefone', telefone)
        logRec.set('telefone_limpo', cleanPhone)
        logRec.set('documento', documento)
        logRec.set('canal', 'Área de Teste Admin')
        logRec.set('classificacao', classificacao)
        logRec.set('regiao_nome', rotaDestino)
        logRec.set('rota_destino', rotaDestino)
        if (operadorAlvo) logRec.set('operador_destino', operadorAlvo.id)
        logRec.set('operador_nome', operadorNome)
        logRec.set('kommo_user_id', kommoUserId)
        logRec.set('motivo_decisao', motivoDecisao)
        logRec.set('regra_aplicada', regraAplicada)
        logRec.set('status_transferencia', 'simulado')
        logRec.set('nota_kommo', notaKommo)
        logRec.set('conversa_resumo', `Cliente: ${mensagem}\nSDR: ${aiResponseText}`)
        logRec.set('eh_simulacao', true)
        $app.save(logRec)
        logId = logRec.id
      } catch (logErr) {
        console.log('[sdr_bot_test] Erro ao gravar log de teste: ' + logErr.message)
      }

      return e.json(200, {
        ok: true,
        simulacao: true,
        resposta_sdr: aiResponseText,
        decisao: {
          classificacao, // VARE | VCORP | ATACADO | SEM_ROTA
          rota_destino: rotaDestino,
          operador_destino_id: operadorAlvo ? operadorAlvo.id : '',
          operador_destino_nome: operadorNome,
          kommo_user_id: kommoUserId,
          regra_aplicada: regraAplicada,
          motivo_decisao: motivoDecisao,
          nota_kommo_preview: notaKommo,
          status_transferencia: 'simulado (sem impacto no Kommo ou clientes reais)',
        },
        log_id: logId,
      })
    } catch (err) {
      console.log('[sdr_bot_test] Erro na simulação: ' + err.message)
      return e.json(500, { ok: false, error: err.message })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/sdr/logs',
  (e) => {
    try {
      const auth = e.auth
      if (!auth || !auth.id) return e.unauthorizedError('Autenticação necessária.')
      const role = auth.getString('role')
      if (role !== 'admin' && role !== 'supervisor') {
        return e.forbiddenError('Acesso restrito ao administrador ou supervisor.')
      }

      const query = e.requestInfo().query || {}
      const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 100)
      const apenasReais = query.reais === 'true'

      let filter = ''
      if (apenasReais) {
        filter = 'eh_simulacao = false'
      }

      let logs = []
      try {
        logs = $app.findRecordsByFilter('sdr_triagens_log', filter, '-created', limit)
      } catch (_) {}

      const resultado = logs.map((l) => ({
        id: l.id,
        cliente_nome: l.getString('cliente_nome'),
        telefone: l.getString('telefone'),
        telefone_limpo: l.getString('telefone_limpo'),
        documento: l.getString('documento'),
        canal: l.getString('canal'),
        classificacao: l.getString('classificacao'),
        regiao_nome: l.getString('regiao_nome'),
        rota_destino: l.getString('rota_destino'),
        operador_destino: l.getString('operador_destino'),
        operador_nome: l.getString('operador_nome'),
        kommo_user_id: l.getString('kommo_user_id'),
        kommo_lead_id: l.getString('kommo_lead_id'),
        motivo_decisao: l.getString('motivo_decisao'),
        regra_aplicada: l.getString('regra_aplicada'),
        status_transferencia: l.getString('status_transferencia'),
        nota_kommo: l.getString('nota_kommo'),
        conversa_resumo: l.getString('conversa_resumo'),
        eh_simulacao: l.getBool('eh_simulacao'),
        created: l.getString('created'),
      }))

      return e.json(200, {
        ok: true,
        total: resultado.length,
        logs: resultado,
      })
    } catch (err) {
      console.log('[sdr_bot_logs] Erro ao listar logs: ' + err.message)
      return e.json(500, { ok: false, error: err.message })
    }
  },
  $apis.requireAuth(),
)
