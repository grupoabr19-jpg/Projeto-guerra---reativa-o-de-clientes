// pocketbase/hooks/carteira_transfer.js
// Funcionalidade de Transferência de Carteira e Gestão de Status de Colaboradores (Admin)
//
// 1. POST /backend/v1/admin/carteira-preview
//    Consulta quantos clientes serão impactados na transferência de origem -> destino
//    (filtra por vendedor contendo nome do operador de origem, vínculos ativos, reagendamentos, locks).
//
// 2. POST /backend/v1/admin/transfer-carteira
//    Executa a transferência completa preservando prefixos em vendedor,
//    transferindo vínculos vivos, limpando locks e registrando auditoria em eventos_log.
//    Permite transferir APENAS para colaborador ativo.
//
// 3. POST /backend/v1/admin/toggle-user-status
//    Ativa ou desativa um colaborador. Ao desativar, limpa locks presos e devolve clientes reservados à base.

// 1. PREVIEW DE TRANSFERÊNCIA DE CARTEIRA
routerAdd(
  'POST',
  '/backend/v1/admin/carteira-preview',
  (e) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function obterVariantesNomeOrigem(nomeCompleto) {
      const norm = normalizarTextoNFD(nomeCompleto)
      const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 2)
      const variantes = new Set()

      if (norm) {
        variantes.add(norm)
      }

      if (partes.length > 0 && partes[0].length >= 3) {
        variantes.add(partes[0])
      }

      if (partes.length >= 2) {
        variantes.add(partes[0] + ' ' + partes[1])
      }

      const stopWords = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']
      const partesSignificativas = partes.filter((p) => !stopWords.includes(p) && p.length >= 3)
      for (let i = 0; i < partesSignificativas.length; i++) {
        variantes.add(partesSignificativas[i])
      }

      return Array.from(variantes).sort((a, b) => b.length - a.length)
    }

    function substituirNomeNoVendedor(vendedorOriginal, nomeOrigem, nomeDestino) {
      if (!vendedorOriginal) return ''

      const prefixoMatch = vendedorOriginal.match(/^([A-Za-z0-9_/]+(?:\s*-\s*|\s*:\s*|\s+))(.+)$/)
      let prefixo = ''
      let restoNome = vendedorOriginal.trim()

      if (prefixoMatch) {
        prefixo = prefixoMatch[1]
        restoNome = prefixoMatch[2].trim()
      }

      const variantes = obterVariantesNomeOrigem(nomeOrigem)
      const restoNorm = normalizarTextoNFD(restoNome)

      let casou = false
      for (let i = 0; i < variantes.length; i++) {
        const v = variantes[i]
        if (v.length < 3) continue
        if (restoNorm.includes(v)) {
          casou = true
          break
        }
      }

      if (casou) {
        return (prefixo + normalizarTextoNFD(nomeDestino)).trim()
      }

      const vendNorm = normalizarTextoNFD(vendedorOriginal)
      for (let j = 0; j < variantes.length; j++) {
        const v = variantes[j]
        if (v.length >= 3 && vendNorm.includes(v)) {
          if (prefixo) {
            return (prefixo + normalizarTextoNFD(nomeDestino)).trim()
          }
          return normalizarTextoNFD(nomeDestino)
        }
      }

      return vendedorOriginal
    }

    function clientePertenceAOrigem(clienteRec, origemId, variantesOrigem, regiaoFiltro) {
      if (regiaoFiltro && regiaoFiltro !== 'todas') {
        const cliRegiao = normalizarTextoNFD(clienteRec.getString('regiao'))
        const filRegiao = normalizarTextoNFD(regiaoFiltro)
        if (cliRegiao !== filRegiao && !cliRegiao.includes(filRegiao)) {
          return false
        }
      }

      if (origemId) {
        if (clienteRec.getString('operador') === origemId) return true
        if (clienteRec.getString('reagendado_operador') === origemId) return true
        if (clienteRec.getString('operador_reativacao') === origemId) return true
      }

      const vRaw = clienteRec.getString('vendedor') || ''
      if (!vRaw) return false

      const vNorm = normalizarTextoNFD(vRaw)
      for (let i = 0; i < variantesOrigem.length; i++) {
        const varTerm = variantesOrigem[i]
        if (varTerm.length < 3) continue
        if (vNorm.includes(varTerm)) {
          return true
        }
      }

      return false
    }

    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária' })
      }
      if (authRecord.getString('role') !== 'admin') {
        return e.json(403, {
          error: 'Apenas administradores podem consultar transferência de carteira.',
        })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const origemId = (body.origem_id || '').toString().trim()
      const origemNome = (body.origem_nome || '').toString().trim()
      const destinoId = (body.destino_id || '').toString().trim()
      const regiaoFiltro = (body.regiao || '').toString().trim()

      if (!origemId && !origemNome) {
        return e.json(400, { error: 'Colaborador de origem é obrigatório.' })
      }
      if (!destinoId) {
        return e.json(400, { error: 'Colaborador de destino é obrigatório.' })
      }
      if (origemId && origemId === destinoId) {
        return e.json(400, { error: 'Origem e destino não podem ser o mesmo usuário.' })
      }

      let destinoUser
      try {
        destinoUser = $app.findRecordById('users', destinoId)
      } catch (_) {
        return e.json(404, { error: 'Colaborador de destino não encontrado.' })
      }

      // Validar se destino está ativo
      const destinoAtivo = destinoUser.getBool('ativo')
      if (destinoAtivo === false) {
        return e.json(400, {
          error: 'O colaborador de destino está desativado. Selecione um colaborador ativo.',
        })
      }

      let nomeOrigemFinal = origemNome
      if (origemId) {
        try {
          const origemUser = $app.findRecordById('users', origemId)
          if (origemUser) {
            nomeOrigemFinal = origemUser.getString('name') || nomeOrigemFinal
          }
        } catch (_) {}
      }

      const variantesOrigem = obterVariantesNomeOrigem(nomeOrigemFinal)
      const nomeDestino =
        destinoUser.getString('name') || destinoUser.getString('email') || 'Destino'

      // Buscar clientes candidatos
      let orParts = []
      if (origemId) {
        orParts.push(`operador = '${origemId}'`)
        orParts.push(`reagendado_operador = '${origemId}'`)
        orParts.push(`operador_reativacao = '${origemId}'`)
      }
      for (let i = 0; i < variantesOrigem.length; i++) {
        const v = variantesOrigem[i]
        if (v.length >= 3 && v !== 'DOS' && v !== 'DAS' && v !== 'SILVA') {
          orParts.push(`vendedor ~ '${v}'`)
        }
      }

      if (orParts.length === 0) {
        return e.json(200, {
          total: 0,
          por_tipo: {
            por_vendedor: 0,
            reservados_ou_atendimento: 0,
            reagendados: 0,
            reativados: 0,
          },
          amostra: [],
          origem_nome: nomeOrigemFinal,
          destino_nome: nomeDestino,
        })
      }

      const pbFilter = orParts.join(' || ')
      const candidates = $app.findRecordsByFilter('clientes', pbFilter, '-updated', 2000, 0)

      let total = 0
      let porVendedor = 0
      let reservadosOuAtendimento = 0
      let reagendados = 0
      let reativados = 0
      const amostra = []

      for (let j = 0; j < candidates.length; j++) {
        const c = candidates[j]
        if (!clientePertenceAOrigem(c, origemId, variantesOrigem, regiaoFiltro)) {
          continue
        }

        total++
        const est = c.getString('estado')
        const opId = c.getString('operador')
        const reagOpId = c.getString('reagendado_operador')
        const reatOpId = c.getString('operador_reativacao')

        let matchTipo = []
        if (opId === origemId || est === 'reservado' || est === 'em_atendimento') {
          reservadosOuAtendimento++
          matchTipo.push('em_atendimento/reservado')
        }
        if (reagOpId === origemId || est === 'reagendado') {
          reagendados++
          matchTipo.push('reagendado')
        }
        if (reatOpId === origemId || est === 'reativado') {
          reativados++
          matchTipo.push('reativado')
        }

        const vAtual = c.getString('vendedor') || ''
        const vNovo = substituirNomeNoVendedor(vAtual, nomeOrigemFinal, nomeDestino)
        if (vAtual !== vNovo) {
          porVendedor++
          matchTipo.push('vendedor')
        }

        if (amostra.length < 10) {
          amostra.push({
            id: c.id,
            codigo: c.getString('codigo'),
            nome: c.getString('nome'),
            regiao: c.getString('regiao'),
            estado: est,
            vendedor_atual: vAtual,
            vendedor_novo: vNovo,
            motivo: matchTipo.join(', ') || 'carteira',
          })
        }
      }

      return e.json(200, {
        ok: true,
        origem_id: origemId,
        origem_nome: nomeOrigemFinal,
        destino_id: destinoId,
        destino_nome: nomeDestino,
        regiao_filtro: regiaoFiltro || 'todas',
        total: total,
        por_tipo: {
          por_vendedor: porVendedor,
          reservados_ou_atendimento: reservadosOuAtendimento,
          reagendados: reagendados,
          reativados: reativados,
        },
        amostra: amostra,
      })
    } catch (err) {
      console.log('[carteira-preview] Erro: ' + (err && err.message ? err.message : String(err)))
      return e.json(500, {
        error:
          'Erro ao gerar prévia da transferência: ' +
          (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)

// 2. EXECUÇÃO DA TRANSFERÊNCIA DE CARTEIRA
routerAdd(
  'POST',
  '/backend/v1/admin/transfer-carteira',
  (e) => {
    function normalizarTextoNFD(str) {
      return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
    }

    function obterVariantesNomeOrigem(nomeCompleto) {
      const norm = normalizarTextoNFD(nomeCompleto)
      const partes = norm.split(/[\s,()/-]+/).filter((p) => p.length >= 2)
      const variantes = new Set()

      if (norm) {
        variantes.add(norm)
      }

      if (partes.length > 0 && partes[0].length >= 3) {
        variantes.add(partes[0])
      }

      if (partes.length >= 2) {
        variantes.add(partes[0] + ' ' + partes[1])
      }

      const stopWords = ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']
      const partesSignificativas = partes.filter((p) => !stopWords.includes(p) && p.length >= 3)
      for (let i = 0; i < partesSignificativas.length; i++) {
        variantes.add(partesSignificativas[i])
      }

      return Array.from(variantes).sort((a, b) => b.length - a.length)
    }

    function substituirNomeNoVendedor(vendedorOriginal, nomeOrigem, nomeDestino) {
      if (!vendedorOriginal) return ''

      const prefixoMatch = vendedorOriginal.match(/^([A-Za-z0-9_/]+(?:\s*-\s*|\s*:\s*|\s+))(.+)$/)
      let prefixo = ''
      let restoNome = vendedorOriginal.trim()

      if (prefixoMatch) {
        prefixo = prefixoMatch[1]
        restoNome = prefixoMatch[2].trim()
      }

      const variantes = obterVariantesNomeOrigem(nomeOrigem)
      const restoNorm = normalizarTextoNFD(restoNome)

      let casou = false
      for (let i = 0; i < variantes.length; i++) {
        const v = variantes[i]
        if (v.length < 3) continue
        if (restoNorm.includes(v)) {
          casou = true
          break
        }
      }

      if (casou) {
        return (prefixo + normalizarTextoNFD(nomeDestino)).trim()
      }

      const vendNorm = normalizarTextoNFD(vendedorOriginal)
      for (let j = 0; j < variantes.length; j++) {
        const v = variantes[j]
        if (v.length >= 3 && vendNorm.includes(v)) {
          if (prefixo) {
            return (prefixo + normalizarTextoNFD(nomeDestino)).trim()
          }
          return normalizarTextoNFD(nomeDestino)
        }
      }

      return vendedorOriginal
    }

    function clientePertenceAOrigem(clienteRec, origemId, variantesOrigem, regiaoFiltro) {
      if (regiaoFiltro && regiaoFiltro !== 'todas') {
        const cliRegiao = normalizarTextoNFD(clienteRec.getString('regiao'))
        const filRegiao = normalizarTextoNFD(regiaoFiltro)
        if (cliRegiao !== filRegiao && !cliRegiao.includes(filRegiao)) {
          return false
        }
      }

      if (origemId) {
        if (clienteRec.getString('operador') === origemId) return true
        if (clienteRec.getString('reagendado_operador') === origemId) return true
        if (clienteRec.getString('operador_reativacao') === origemId) return true
      }

      const vRaw = clienteRec.getString('vendedor') || ''
      if (!vRaw) return false

      const vNorm = normalizarTextoNFD(vRaw)
      for (let i = 0; i < variantesOrigem.length; i++) {
        const varTerm = variantesOrigem[i]
        if (varTerm.length < 3) continue
        if (vNorm.includes(varTerm)) {
          return true
        }
      }

      return false
    }

    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária' })
      }
      if (authRecord.getString('role') !== 'admin') {
        return e.json(403, {
          error: 'Apenas administradores podem executar transferência de carteira.',
        })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const origemId = (body.origem_id || '').toString().trim()
      const origemNome = (body.origem_nome || '').toString().trim()
      const destinoId = (body.destino_id || '').toString().trim()
      const regiaoFiltro = (body.regiao || '').toString().trim()
      const desativarOrigem = Boolean(body.desativar_origem)

      if (!origemId && !origemNome) {
        return e.json(400, { error: 'Colaborador de origem é obrigatório.' })
      }
      if (!destinoId) {
        return e.json(400, { error: 'Colaborador de destino é obrigatório.' })
      }
      if (origemId && origemId === destinoId) {
        return e.json(400, { error: 'Origem e destino não podem ser o mesmo usuário.' })
      }

      let destinoUser
      try {
        destinoUser = $app.findRecordById('users', destinoId)
      } catch (_) {
        return e.json(404, { error: 'Colaborador de destino não encontrado.' })
      }

      // Validar colaborador de destino ativo
      const destinoAtivo = destinoUser.getBool('ativo')
      if (destinoAtivo === false) {
        return e.json(400, {
          error:
            'O colaborador de destino está desativado. Só é permitido transferir para colaboradores ativos.',
        })
      }

      let nomeOrigemFinal = origemNome
      let origemUserRecord = null
      if (origemId) {
        try {
          origemUserRecord = $app.findRecordById('users', origemId)
          if (origemUserRecord) {
            nomeOrigemFinal = origemUserRecord.getString('name') || nomeOrigemFinal
          }
        } catch (_) {}
      }

      const variantesOrigem = obterVariantesNomeOrigem(nomeOrigemFinal)
      const nomeDestino =
        destinoUser.getString('name') || destinoUser.getString('email') || 'Destino'

      // Buscar clientes candidatos
      let orParts = []
      if (origemId) {
        orParts.push(`operador = '${origemId}'`)
        orParts.push(`reagendado_operador = '${origemId}'`)
        orParts.push(`operador_reativacao = '${origemId}'`)
      }
      for (let i = 0; i < variantesOrigem.length; i++) {
        const v = variantesOrigem[i]
        if (v.length >= 3 && v !== 'DOS' && v !== 'DAS' && v !== 'SILVA') {
          orParts.push(`vendedor ~ '${v}'`)
        }
      }

      if (orParts.length === 0) {
        return e.json(200, {
          ok: true,
          message: 'Nenhum cliente elegível encontrado para transferência.',
          total_transferidos: 0,
          origem_nome: nomeOrigemFinal,
          destino_nome: nomeDestino,
        })
      }

      const pbFilter = orParts.join(' || ')
      const candidates = $app.findRecordsByFilter('clientes', pbFilter, '-updated', 5000, 0)

      let totalTransferidos = 0
      let countVendedorReescrito = 0
      let countVinculoOperador = 0
      let countReagendado = 0
      let countReativacao = 0
      let countLocksLiberados = 0

      for (let idx = 0; idx < candidates.length; idx++) {
        const cliente = candidates[idx]
        if (!clientePertenceAOrigem(cliente, origemId, variantesOrigem, regiaoFiltro)) {
          continue
        }

        let modificado = false

        // 1. Reescrever campo vendedor preservando prefixo
        const vAtual = cliente.getString('vendedor') || ''
        const vNovo = substituirNomeNoVendedor(vAtual, nomeOrigemFinal, nomeDestino)
        if (vNovo && vNovo !== vAtual) {
          cliente.set('vendedor', vNovo)
          countVendedorReescrito++
          modificado = true
        }

        // 2. Transferir vínculos vivos:
        // Se cliente está com operador = origem (em atendimento / reservado)
        const opAtual = cliente.getString('operador')
        if (origemId && opAtual === origemId) {
          cliente.set('operador', '')
          cliente.set('lock_timestamp', null)
          cliente.set('reagendado_operador', destinoId)
          cliente.set('prioridade_transferencia', true)
          if (
            cliente.getString('estado') === 'reservado' ||
            cliente.getString('estado') === 'em_atendimento'
          ) {
            cliente.set('estado', 'reagendado')
            cliente.set('reagendado_para', new Date().toISOString())
          }
          countVinculoOperador++
          countLocksLiberados++
          modificado = true
        }

        // Reagendado para origem
        const reagOpAtual = cliente.getString('reagendado_operador')
        if (origemId && reagOpAtual === origemId) {
          cliente.set('reagendado_operador', destinoId)
          cliente.set('prioridade_transferencia', true)
          countReagendado++
          modificado = true
        }

        // Operador de reativação (carteira reativada atribuída)
        const reatOpAtual = cliente.getString('operador_reativacao')
        if (origemId && reatOpAtual === origemId) {
          cliente.set('operador_reativacao', destinoId)
          countReativacao++
          modificado = true
        }

        if (modificado) {
          $app.save(cliente)
          totalTransferidos++
        }
      }

      // Se solicitado, desativar a conta de origem
      let origemDesativada = false
      if (desativarOrigem && origemUserRecord) {
        origemUserRecord.set('ativo', false)
        $app.save(origemUserRecord)
        origemDesativada = true
      }

      // 4. Registrar auditoria em eventos_log
      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', 'transferencia_carteira')
        ev.set('detalhes', {
          executado_por_id: authRecord.id,
          executado_por_nome: authRecord.getString('name') || authRecord.getString('email'),
          origem_id: origemId,
          origem_nome: nomeOrigemFinal,
          destino_id: destinoId,
          destino_nome: nomeDestino,
          regiao_filtro: regiaoFiltro || 'todas',
          total_clientes_transferidos: totalTransferidos,
          detalhes_contagem: {
            vendedor_reescrito: countVendedorReescrito,
            vinculo_operador_transferido: countVinculoOperador,
            reagendados_transferidos: countReagendado,
            reativacoes_transferidas: countReativacao,
            locks_liberados: countLocksLiberados,
          },
          origem_desativada: origemDesativada,
          executado_em: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (logErr) {
        console.log('[transfer-carteira] Erro ao registrar log de auditoria: ' + logErr.message)
      }

      return e.json(200, {
        ok: true,
        message: `Carteira transferida com sucesso de ${nomeOrigemFinal} para ${nomeDestino}!`,
        origem_nome: nomeOrigemFinal,
        destino_nome: nomeDestino,
        total_transferidos: totalTransferidos,
        por_tipo: {
          vendedor_reescrito: countVendedorReescrito,
          vinculo_operador: countVinculoOperador,
          reagendados: countReagendado,
          reativacoes: countReativacao,
          locks_liberados: countLocksLiberados,
        },
        origem_desativada: origemDesativada,
      })
    } catch (err) {
      console.log('[transfer-carteira] Erro: ' + (err && err.message ? err.message : String(err)))
      return e.json(500, {
        error:
          'Erro ao executar transferência de carteira: ' +
          (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)

// 3. ATIVAÇÃO / DESATIVAÇÃO DE COLABORADOR (SUBSTITUI EXCLUSÃO)
routerAdd(
  'POST',
  '/backend/v1/admin/toggle-user-status',
  (e) => {
    try {
      const authRecord = e.auth
      if (!authRecord || !authRecord.id) {
        return e.json(401, { error: 'Autenticação necessária' })
      }
      if (authRecord.getString('role') !== 'admin') {
        return e.json(403, {
          error: 'Apenas administradores podem alterar o status de ativação de colaboradores.',
        })
      }

      let body = {}
      try {
        body = e.requestInfo().body || {}
      } catch (_) {}

      const targetUserId = (body.userId || '').toString().trim()
      const novoStatusAtivo = body.ativo !== undefined ? Boolean(body.ativo) : false

      if (!targetUserId) {
        return e.json(400, { error: 'userId é obrigatório.' })
      }

      if (authRecord.id === targetUserId && !novoStatusAtivo) {
        return e.json(400, {
          error: 'Você não pode desativar a sua própria conta de administrador.',
        })
      }

      let targetUser
      try {
        targetUser = $app.findRecordById('users', targetUserId)
      } catch (_) {
        return e.json(404, { error: 'Usuário não encontrado.' })
      }

      const targetUserName =
        targetUser.getString('name') || targetUser.getString('email') || targetUserId

      targetUser.set('ativo', novoStatusAtivo)
      $app.save(targetUser)

      let clientesLiberados = 0
      if (!novoStatusAtivo) {
        try {
          const reserv = $app.findRecordsByFilter(
            'clientes',
            `operador = '${targetUserId}'`,
            '',
            500,
            0,
          )
          for (let i = 0; i < reserv.length; i++) {
            const cl = reserv[i]
            const st = cl.getString('estado')
            if (st === 'reservado' || st === 'em_atendimento') {
              cl.set('estado', 'na_base')
            }
            cl.set('operador', '')
            cl.set('lock_timestamp', null)
            $app.save(cl)
            clientesLiberados++
          }
        } catch (_) {}
      }

      try {
        const colEv = $app.findCollectionByNameOrId('eventos_log')
        const ev = new Record(colEv)
        ev.set('usuario', authRecord.id)
        ev.set('acao', novoStatusAtivo ? 'usuario_ativado' : 'usuario_desativado')
        ev.set('detalhes', {
          alvo_id: targetUserId,
          alvo_nome: targetUserName,
          alvo_email: targetUser.getString('email'),
          novo_status_ativo: novoStatusAtivo,
          clientes_reservados_liberados: clientesLiberados,
          alterado_por: authRecord.getString('email') || authRecord.id,
          alterado_em: new Date().toISOString(),
        })
        $app.save(ev)
      } catch (_) {}

      return e.json(200, {
        ok: true,
        message: `Colaborador ${targetUserName} foi ${novoStatusAtivo ? 'ativado' : 'desativado'} com sucesso.`,
        userId: targetUserId,
        userName: targetUserName,
        ativo: novoStatusAtivo,
        clientes_liberados: clientesLiberados,
      })
    } catch (err) {
      console.log('[toggle-user-status] Erro: ' + (err && err.message ? err.message : String(err)))
      return e.json(500, {
        error:
          'Erro ao alterar status do colaborador: ' +
          (err && err.message ? err.message : String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
