// Hook de processamento em lote para importação de Respostas do Formulário (CSV/XLSX - Forms)
// Rota: POST /backend/v1/import/respostas-formulario
// Acesso restrito: admin (e supervisor se autenticado como admin/gestor)

routerAdd(
  'POST',
  '/backend/v1/import/respostas-formulario',
  (e) => {
    try {
      const auth = e.auth
      if (!auth) {
        return e.json(401, { error: 'Autenticação necessária.' })
      }

      const userRole = auth.getString('role')
      if (userRole !== 'admin') {
        return e.json(403, {
          error: 'Acesso restrito. Apenas administradores podem importar respostas de formulário.',
        })
      }

      const body = e.requestInfo().body || {}
      const items = body.items || []
      const dryRun = Boolean(body.dryRun)

      if (!Array.isArray(items) || items.length === 0) {
        return e.json(400, { error: 'Nenhum registro para importação foi enviado.' })
      }

      // Carregar cache de usuários para vinculação de operador
      const usersList = $app.findRecordsByFilter('users', '1=1', '', 200, 0)
      const userByEmail = {}
      const userByNameNorm = {}
      for (let u = 0; u < usersList.length; u++) {
        const uRec = usersList[u]
        const email = (uRec.getString('email') || '').trim().toLowerCase()
        const name = (uRec.getString('name') || '').trim()
        if (email) userByEmail[email] = uRec
        if (name) {
          const normName = name
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (normName) userByNameNorm[normName] = uRec
        }
      }

      // Função inline para normalizar strings
      const normalizeClean = (str) => {
        if (!str) return ''
        return String(str)
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Formatação de moeda BRL compatível com Goja (sem toLocaleString/Intl)
      const formatarMoedaBrlSeguro = (num) => {
        const val = Number(num) || 0
        const fixed = val.toFixed(2)
        const parts = fixed.split('.')
        const inteira = parts[0]
        const decimal = parts[1] || '00'
        let formatada = ''
        const len = inteira.length
        for (let i = 0; i < len; i++) {
          if (i > 0 && (len - i) % 3 === 0) {
            formatada += '.'
          }
          formatada += inteira.charAt(i)
        }
        return formatada + ',' + decimal
      }

      // Coletar todos os códigos de clientes referenciados para busca em lote
      const codigosSet = new Set()
      for (let i = 0; i < items.length; i++) {
        const cod = String(items[i].codigoCliente || '')
          .trim()
          .toUpperCase()
        if (cod) codigosSet.add(cod)
      }

      const clientsByCode = {}
      const codigosArr = Array.from(codigosSet)
      const CHUNK_SIZE = 80
      for (let cIdx = 0; cIdx < codigosArr.length; cIdx += CHUNK_SIZE) {
        const sliceCod = codigosArr.slice(cIdx, cIdx + CHUNK_SIZE)
        const filterCod = sliceCod.map((c) => `codigo = '${c.replace(/'/g, "''")}'`).join(' || ')
        if (filterCod) {
          try {
            const foundRecs = $app.findRecordsByFilter(
              'clientes',
              filterCod,
              '',
              sliceCod.length * 2,
              0,
            )
            for (let f = 0; f < foundRecs.length; f++) {
              const rec = foundRecs[f]
              const code = rec.getString('codigo')
              if (code) clientsByCode[code.toUpperCase()] = rec
            }
          } catch (findErr) {
            console.log(
              '[respostas_formulario_import] Erro ao buscar clientes por código: ' +
                findErr.message,
            )
          }
        }
      }

      // Buscar respostas existentes para deduplicação (mesmo cliente + mesma data_conclusao)
      const colRespostas = $app.findCollectionByNameOrId('respostas_formulario')
      const colInteracoes = $app.findCollectionByNameOrId('interacoes')

      let totalLidos = items.length
      let importadas = 0
      let duplicadas = 0
      let clientesNaoEncontrados = []
      let reativacoesCompletas = 0
      let erros = []

      // Preparar lote validado antes de persistir
      const registrosValidados = []
      const chavesDedupe = new Set()

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const linhaNum = item.linha || idx + 2
        const rawCodigo = String(item.codigoCliente || '')
          .trim()
          .toUpperCase()

        if (!rawCodigo) {
          erros.push({ linha: linhaNum, erro: 'Código do cliente ausente nesta linha.' })
          continue
        }

        const clienteRec = clientsByCode[rawCodigo]
        if (!clienteRec) {
          if (!clientesNaoEncontrados.includes(rawCodigo)) {
            clientesNaoEncontrados.push(rawCodigo)
          }
          continue
        }

        // Identificar operador
        let operadorRec = null
        const rawEmail = String(item.operadorEmail || '')
          .trim()
          .toLowerCase()
        const rawNome = String(item.operadorNome || '').trim()

        if (rawEmail && userByEmail[rawEmail]) {
          operadorRec = userByEmail[rawEmail]
        } else if (rawNome) {
          const normNome = normalizeClean(rawNome)
          if (userByNameNorm[normNome]) {
            operadorRec = userByNameNorm[normNome]
          }
        }

        // Se não achou operador em users, fallback para o admin logado como criador técnico
        const operadorId = operadorRec ? operadorRec.id : auth.id
        const operadorNomeIdentificado = operadorRec
          ? operadorRec.getString('name')
          : rawNome || rawEmail || 'Operador não identificado'

        // Data de conclusão (ISO ou formato dd/MM/yyyy HH:mm)
        const dataConclusaoRaw = item.dataConclusao || item.dataInicio || ''
        let dataConclusaoIso = ''
        if (dataConclusaoRaw) {
          const d = new Date(dataConclusaoRaw)
          if (!isNaN(d.getTime())) {
            dataConclusaoIso = d.toISOString()
          }
        }

        // Chave de deduplicação em memória (mesmo cliente + mesma data de conclusão)
        const chaveDedupeMem = `${clienteRec.id}::${dataConclusaoIso || dataConclusaoRaw}`
        if (chavesDedupe.has(chaveDedupeMem)) {
          duplicadas++
          continue
        }
        chavesDedupe.add(chaveDedupeMem)

        // Deduplicação no banco: verificar se já existe resposta desse cliente com essa data exata
        let jaExisteNoBanco = false
        if (dataConclusaoIso) {
          try {
            // Janela de tolerância de 2 minutos para datas de gravação
            const dObj = new Date(dataConclusaoIso)
            const minTime = new Date(dObj.getTime() - 2 * 60 * 1000)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19)
            const maxTime = new Date(dObj.getTime() + 2 * 60 * 1000)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19)
            const existing = $app.findRecordsByFilter(
              'respostas_formulario',
              `cliente = '${clienteRec.id}' && created >= '${minTime}' && created <= '${maxTime}'`,
              '',
              1,
              0,
            )
            if (existing && existing.length > 0) {
              jaExisteNoBanco = true
            }
          } catch (_) {}
        }

        if (jaExisteNoBanco) {
          duplicadas++
          continue
        }

        registrosValidados.push({
          linhaNum,
          clienteRec,
          operadorId,
          operadorNomeIdentificado,
          operadorRec,
          rawEmail,
          rawNome,
          dataConclusaoIso,
          dataConclusaoRaw,
          desfechoNormalizado: item.desfechoNormalizado || '',
          desfechoCru: item.desfechoCru || '',
          valorPotencial: Number(item.valorPotencial) || 0,
          toneladasPotencial: Number(item.toneladasPotencial) || 0,
          anexoUrl: item.anexoUrl || '',
          motivoInterrupcao: item.motivoInterrupcao || '',
          avaliacaoGeral: item.avaliacaoGeral || '',
          houveErro: item.houveErro || '',
          naturezaFalha: item.naturezaFalha || '',
          setorFalha: item.setorFalha || '',
          necessarioVoltar: item.necessarioVoltar || '',
          probabilidadeRetomada: item.probabilidadeRetomada || '',
          observacaoGeral: item.observacaoGeral || '',
          respostasPayload: item.respostasPayload || {},
        })
      }

      if (dryRun) {
        return e.json(200, {
          dryRun: true,
          totalLidos,
          prontosParaImportar: registrosValidados.length,
          duplicadas,
          clientesNaoEncontrados,
          erros,
        })
      }

      // Execução transacional atômica
      $app.runInTransaction((txApp) => {
        const colRespTx = txApp.findCollectionByNameOrId('respostas_formulario')
        const colInteracTx = txApp.findCollectionByNameOrId('interacoes')

        for (let r = 0; r < registrosValidados.length; r++) {
          const item = registrosValidados[r]
          const cRec = item.clienteRec

          // Montar o objeto json respostas com compatibilidade completa para a ficha de 17 perguntas
          // Usando Object.assign e atribuição direta sem spread para total compatibilidade com Goja runtime
          const jsonRespostas = Object.assign(
            {},
            {
              q1: cRec.getString('codigo'),
              q2: cRec.getString('nome'),
              q3: item.valorPotencial > 0 ? 'Sim' : 'Não',
              q4: `${cRec.getString('regiao')} — Vendedor: ${cRec.getString('vendedor') || 'Não atribuído'}`,
              q5: item.motivoInterrupcao || '',
              q6: item.probabilidadeRetomada || '',
              q7: 'Nenhum / Não informado',
              q8:
                item.naturezaFalha ||
                (item.houveErro === 'Não'
                  ? 'Nenhum erro relatado no histórico recente'
                  : item.houveErro || ''),
              q9:
                item.naturezaFalha ||
                (item.houveErro === 'Não' ? 'Nenhum erro ocorrido' : 'Outros'),
              q10: item.necessarioVoltar || 'Sem necessidade de ação reparatória',
              q11_anexo: item.anexoUrl || '',
              q12: item.probabilidadeRetomada || '',
              q13: 'Telefone / Ligação',
              q14_desfecho: item.desfechoNormalizado || item.desfechoCru || '',
              q17_obs: item.observacaoGeral || '',
              importado_forms: true,
              operador_email: item.rawEmail,
              operador_nome: item.rawNome,
              data_conclusao_forms: item.dataConclusaoRaw,
            },
            item.respostasPayload || {},
          )

          // Heurística de normalização de unidade (kg vs ton) para importação
          let pesoTonNormalizado = item.toneladasPotencial > 0 ? item.toneladasPotencial : 0
          let unidadeDetectada = 'ton'

          if (item.valorPotencial > 0 && item.toneladasPotencial > 0) {
            const ratio = item.valorPotencial / item.toneladasPotencial
            if (ratio >= 2 && ratio <= 60) {
              unidadeDetectada = 'kg'
              pesoTonNormalizado = Number((item.toneladasPotencial / 1000).toFixed(4))
            } else if (ratio >= 500 && ratio <= 150000) {
              unidadeDetectada = 'ton'
              pesoTonNormalizado = item.toneladasPotencial
            } else if (ratio < 2 && item.toneladasPotencial > 50) {
              unidadeDetectada = 'kg'
              pesoTonNormalizado = Number((item.toneladasPotencial / 1000).toFixed(4))
            } else if (item.toneladasPotencial >= 50) {
              unidadeDetectada = 'kg'
              pesoTonNormalizado = Number((item.toneladasPotencial / 1000).toFixed(4))
            }
          } else if (item.toneladasPotencial >= 50) {
            unidadeDetectada = 'kg'
            pesoTonNormalizado = Number((item.toneladasPotencial / 1000).toFixed(4))
          }

          if (item.valorPotencial > 0) {
            jsonRespostas.q15 = item.valorPotencial
          }
          if (item.toneladasPotencial > 0) {
            jsonRespostas.q16 = item.toneladasPotencial // raw digitado mantido em q16
            jsonRespostas.q16_unidade_detectada = unidadeDetectada
            jsonRespostas.q16_toneladas_normalizadas = pesoTonNormalizado
          }

          // 1. Criar respostas_formulario
          const recResp = new Record(colRespTx)
          recResp.set('cliente', cRec.id)
          recResp.set('operador', item.operadorId)
          recResp.set('respostas', jsonRespostas)
          recResp.set('desfecho', item.desfechoNormalizado || 'contatado')
          recResp.set('valor_potencial', item.valorPotencial > 0 ? item.valorPotencial : 0)
          recResp.set('toneladas_potencial', pesoTonNormalizado)
          if (item.anexoUrl) {
            recResp.set('q3_arquivo', item.anexoUrl)
          }
          if (item.dataConclusaoIso) {
            recResp.set('created', item.dataConclusaoIso.replace('T', ' ').slice(0, 19))
          }
          txApp.save(recResp)

          // 2. Criar registro correspondente em interacoes
          const recInterac = new Record(colInteracTx)
          recInterac.set('cliente', cRec.id)
          recInterac.set('operador', item.operadorId)
          recInterac.set('tipo', 'formulario')
          recInterac.set('desfecho', item.desfechoNormalizado || item.desfechoCru || 'contatado')
          recInterac.set('motivo', item.motivoInterrupcao || '')
          recInterac.set('estado_anterior', cRec.getString('estado'))
          recInterac.set(
            'estado_novo',
            item.desfechoNormalizado === 'reativado' && item.valorPotencial > 0
              ? 'reativado'
              : cRec.getString('estado'),
          )

          const conteudoLinhas = [
            `[IMPORTAÇÃO MICROSOFT FORMS] Resposta registrada por ${item.operadorNomeIdentificado} (${item.rawEmail || 'sem e-mail'})`,
            item.dataConclusaoRaw ? `Data de Conclusão: ${item.dataConclusaoRaw}` : '',
            item.desfechoCru ? `Desfecho Informado no Forms: "${item.desfechoCru}"` : '',
            item.motivoInterrupcao ? `Motivo Interrupção: ${item.motivoInterrupcao}` : '',
            item.avaliacaoGeral ? `Avaliação Geral: ${item.avaliacaoGeral}/5` : '',
            item.houveErro ? `Houve Erro: ${item.houveErro}` : '',
            item.naturezaFalha ? `Natureza da Falha: ${item.naturezaFalha}` : '',
            item.setorFalha ? `Setor: ${item.setorFalha}` : '',
            item.necessarioVoltar ? `Necessário para Voltar: ${item.necessarioVoltar}` : '',
            item.probabilidadeRetomada
              ? `Probabilidade de Retomada: ${item.probabilidadeRetomada}`
              : '',
            item.valorPotencial > 0
              ? 'Valor Cotação: R$ ' + formatarMoedaBrlSeguro(item.valorPotencial)
              : '',
            item.toneladasPotencial > 0 ? `Peso/Toneladas: ${item.toneladasPotencial} t` : '',
            item.anexoUrl ? `Anexo Comprobatório: ${item.anexoUrl}` : '',
            item.observacaoGeral ? `Observações Adicionais: ${item.observacaoGeral}` : '',
          ].filter(Boolean)

          recInterac.set('conteudo', conteudoLinhas.join('\n'))
          if (item.dataConclusaoIso) {
            recInterac.set('created', item.dataConclusaoIso.replace('T', ' ').slice(0, 19))
          }
          txApp.save(recInterac)

          // 3. Atualização do Cliente:
          // Se o desfecho for 'reativado' E valor preenchido > 0:
          // Atualiza o cliente para o estado de reativação real coerente com relatórios e máquina de estados:
          // - estado = 'reativado'
          // - operador_reativacao = operadorId
          // - operador = operadorId (para garantir consistência em isReativacaoRealCond)
          // - reativado_em = dataConclusaoIso || agora
          // - standby_ate = reativado_em + 60 dias
          // - pedido_reativacao = item.numeroPedido || 'FORMS'
          // - pedido_confirmado = false
          // - valor_ultima_compra = item.valorPotencial se maior que 0
          // - toneladas_historico = item.toneladasPotencial se maior que 0
          // Em TODOS os desfechos importados: garantir limpeza de lock e consistência de estado
          if (item.desfechoNormalizado === 'reativado' && item.valorPotencial > 0) {
            const dataBase = item.dataConclusaoIso ? new Date(item.dataConclusaoIso) : new Date()
            const standbyBase = new Date(dataBase.getTime() + 60 * 24 * 60 * 60 * 1000)

            cRec.set('estado', 'reativado')
            cRec.set('operador', item.operadorId)
            cRec.set('operador_reativacao', item.operadorId)
            cRec.set('reativado_em', dataBase.toISOString().replace('T', ' ').slice(0, 19))
            cRec.set('standby_ate', standbyBase.toISOString().replace('T', ' ').slice(0, 19))
            cRec.set('pedido_reativacao', item.numeroPedido || 'FORMS-IMPORT')
            cRec.set('pedido_confirmado', false)
            cRec.set('lock_timestamp', '1970-01-01 00:00:00.000Z') // libera qualquer lock residual

            if (item.valorPotencial > 0) {
              cRec.set('valor_ultima_compra', item.valorPotencial)
            }
            if (pesoTonNormalizado > 0) {
              cRec.set('toneladas_historico', pesoTonNormalizado)
            }

            txApp.save(cRec)
            reativacoesCompletas++
          } else if (item.desfechoNormalizado) {
            // Outros desfechos importados: limpar lock e transitar estado se estiver em_atendimento/reservado
            const estadoAtual = cRec.getString('estado')
            if (estadoAtual === 'em_atendimento' || estadoAtual === 'reservado') {
              cRec.set('estado', item.desfechoNormalizado)
              cRec.set('operador', '')
              cRec.set('lock_timestamp', '1970-01-01 00:00:00.000Z')
              txApp.save(cRec)
            }
          }

          importadas++
        }
      })

      return e.json(200, {
        ok: true,
        totalLidos,
        importadas,
        duplicadas,
        reativacoesCompletas,
        clientesNaoEncontrados,
        totalNaoEncontrados: clientesNaoEncontrados.length,
        erros,
      })
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err)
      console.log('[respostas_formulario_import] Erro na importação: ' + errMsg)
      return e.json(500, { error: 'Falha interna na importação das respostas: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)
