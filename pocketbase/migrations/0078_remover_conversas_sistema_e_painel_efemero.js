/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0078_remover_conversas_sistema_e_painel_efemero.js
 *
 * 1. Evolui a coleção `notificacoes_enviadas` para alimentar o Painel Efêmero de Notificações:
 *    - Adiciona campos:
 *      * titulo (text)
 *      * texto (text)
 *      * lida (bool)
 *      * descartada (bool)
 *      * lida_em (date)
 *    - Ajusta regras de acesso:
 *      * listRule: @request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')
 *      * viewRule: @request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')
 *      * createRule: @request.auth.id != ''
 *      * updateRule: @request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')
 *      * deleteRule: @request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')
 *    - Adiciona índice para filtros rápidos do painel efêmero:
 *      * idx_notif_usuario_lida_descartada (usuario, descartada, created DESC)
 *
 * 2. Saneamento rigoroso do banco de dados:
 *    - Localiza o usuário 'sistema@grupoabr.com.br' (se existir).
 *    - Identifica TODAS as conversas do chat_conversas do tipo 'dm' que envolvam o Sistema
 *      (por chave_dm contendo o id do Sistema, por participantes contendo o id do Sistema ou título iniciando com 'Sistema &').
 *    - Deleta as mensagens (chat_mensagens) vinculadas a essas conversas do Sistema.
 *    - Deleta as leituras (chat_leituras) vinculadas a essas conversas do Sistema.
 *    - Deleta as próprias conversas do Sistema (chat_conversas).
 *    - O Canal Geral ('geral') e quaisquer DMs reais entre colaboradores permanecem 100% intactos!
 *
 * 3. Migração retroativa dos dados existentes em `notificacoes_enviadas`:
 *    - Preenche titulo e texto a partir dos dados json ou de mensagens prévias.
 *    - Marca como lida = false e descartada = false.
 */
migrate(
  (app) => {
    // 1. Atualizar schema da coleção notificacoes_enviadas
    try {
      const colNotif = app.findCollectionByNameOrId('notificacoes_enviadas')

      if (!colNotif.fields.getByName('titulo')) {
        colNotif.fields.add(
          new TextField({
            name: 'titulo',
            required: false,
          }),
        )
      }

      if (!colNotif.fields.getByName('texto')) {
        colNotif.fields.add(
          new TextField({
            name: 'texto',
            required: false,
          }),
        )
      }

      if (!colNotif.fields.getByName('lida')) {
        colNotif.fields.add(
          new BoolField({
            name: 'lida',
            required: false,
          }),
        )
      }

      if (!colNotif.fields.getByName('descartada')) {
        colNotif.fields.add(
          new BoolField({
            name: 'descartada',
            required: false,
          }),
        )
      }

      if (!colNotif.fields.getByName('lida_em')) {
        colNotif.fields.add(
          new DateField({
            name: 'lida_em',
            required: false,
          }),
        )
      }

      // Permissões para que o próprio usuário possa marcar como lida e descartar
      colNotif.listRule =
        "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')"
      colNotif.viewRule =
        "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')"
      colNotif.createRule = "@request.auth.id != ''"
      colNotif.updateRule =
        "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')"
      colNotif.deleteRule =
        "@request.auth.id != '' && (usuario = @request.auth.id || @request.auth.role = 'admin')"

      colNotif.addIndex('idx_notif_usuario_efemero', false, 'usuario, descartada, created', '')

      app.save(colNotif)
      console.log('[0078_migration] Schema de notificacoes_enviadas atualizado com sucesso.')
    } catch (err) {
      console.log(
        '[0078_migration] Erro ao atualizar schema de notificacoes_enviadas: ' + err.message,
      )
    }

    // 2. Saneamento do banco de dados: Remoção de todas as conversas do Sistema no CA
    let totalConversasRemovidas = 0
    let totalMensagensRemovidas = 0
    let totalLeiturasRemovidas = 0

    let sistemaId = ''
    try {
      const sistemaUser = app.findFirstRecordByData('users', 'email', 'sistema@grupoabr.com.br')
      if (sistemaUser) {
        sistemaId = sistemaUser.id
      }
    } catch (_) {}

    try {
      // Buscar todas as conversas tipo DM
      const dms = app.findRecordsByFilter('chat_conversas', "tipo = 'dm'", '', 1000, 0)
      for (let i = 0; i < dms.length; i++) {
        const conv = dms[i]
        const titulo = conv.getString('titulo') || ''
        const chave = conv.getString('chave_dm') || ''
        let parts = []
        try {
          parts = conv.getStringSlice('participantes') || []
        } catch (_) {}

        const ehSistema =
          (sistemaId && parts.includes(sistemaId)) ||
          (sistemaId && chave.includes(sistemaId)) ||
          titulo.startsWith('Sistema &') ||
          titulo.endsWith('& Sistema') ||
          titulo.toLowerCase().includes('sistema projeto guerra')

        if (ehSistema) {
          const convId = conv.id

          // 2.1 Remover mensagens desta conversa
          try {
            const msgs = app.findRecordsByFilter(
              'chat_mensagens',
              "conversa = '" + convId + "'",
              '',
              2000,
              0,
            )
            for (let m = 0; m < msgs.length; m++) {
              app.delete(msgs[m])
              totalMensagensRemovidas++
            }
          } catch (mErr) {
            console.log('[0078_migration] Erro ao remover mensagens: ' + mErr.message)
          }

          // 2.2 Remover leituras desta conversa
          try {
            const leituras = app.findRecordsByFilter(
              'chat_leituras',
              "conversa = '" + convId + "'",
              '',
              500,
              0,
            )
            for (let l = 0; l < leituras.length; l++) {
              app.delete(leituras[l])
              totalLeiturasRemovidas++
            }
          } catch (lErr) {
            console.log('[0078_migration] Erro ao remover leituras: ' + lErr.message)
          }

          // 2.3 Desvincular relação conversa em notificacoes_enviadas antes de apagar a conversa
          try {
            const notifs = app.findRecordsByFilter(
              'notificacoes_enviadas',
              "conversa = '" + convId + "'",
              '',
              1000,
              0,
            )
            for (let n = 0; n < notifs.length; n++) {
              const notifRec = notifs[n]
              notifRec.set('conversa', null)
              notifRec.set('mensagem_id', '')
              app.save(notifRec)
            }
          } catch (nErr) {
            console.log(
              '[0078_migration] Erro ao desvincular notificacoes_enviadas: ' + nErr.message,
            )
          }

          // 2.4 Remover a conversa
          try {
            app.delete(conv)
            totalConversasRemovidas++
          } catch (cErr) {
            console.log('[0078_migration] Erro ao remover conversa ' + convId + ': ' + cErr.message)
          }
        }
      }

      console.log(
        '[0078_migration] Saneamento concluído: ' +
          totalConversasRemovidas +
          ' conversas do Sistema removidas, ' +
          totalMensagensRemovidas +
          ' mensagens apagadas, ' +
          totalLeiturasRemovidas +
          ' leituras limpas.',
      )
    } catch (err) {
      console.log('[0078_migration] Erro geral no saneamento: ' + err.message)
    }

    // 3. Preenchimento retroativo de título e texto das notificações existentes
    try {
      const todasNotifs = app.findRecordsByFilter('notificacoes_enviadas', '', '-created', 1000, 0)
      for (let i = 0; i < todasNotifs.length; i++) {
        const nr = todasNotifs[i]
        let alterou = false

        if (!nr.getString('titulo')) {
          const t = nr.getString('tipo')
          let tit = 'Notificação do Sistema'
          if (t === 'followup_dia') tit = '📅 Lembrete de Follow-up'
          else if (t === 'followup_atrasado') tit = '⚠️ Follow-up Pendente / Atrasado'
          else if (t === 'resumo_matinal') tit = '☀️ Resumo Matinal das 7h'
          else if (t === 'ranking_conquista' || t === 'ranking_subida')
            tit = '🏆 Conquista de Ranking'
          else if (t === 'cliente_devolvido') tit = '↩️ Cliente Devolvido'
          nr.set('titulo', tit)
          alterou = true
        }

        if (!nr.getString('texto')) {
          let dadosObj = {}
          try {
            dadosObj = nr.get('dados') || {}
          } catch (_) {}

          const cliNome = dadosObj.cliente_nome || ''
          const cliCod = dadosObj.cliente_codigo || ''
          const regiao = dadosObj.regiao || ''
          const horario = dadosObj.horario || ''

          if (cliNome) {
            nr.set(
              'texto',
              `Retorno agendado com ${cliNome}${cliCod ? ` (${cliCod})` : ''} - Região: ${regiao || 'Geral'}${horario ? ` às ${horario}` : ''}. Acesse Atendimento para interagir.`,
            )
          } else {
            nr.set('texto', 'Você tem uma atualização de rotina operacional do Projeto Guerra.')
          }
          alterou = true
        }

        if (alterou) {
          try {
            app.save(nr)
          } catch (_) {}
        }
      }
    } catch (popErr) {
      console.log('[0078_migration] Erro ao popular títulos/textos retroativos: ' + popErr.message)
    }
  },
  (app) => {
    // Reverter campos se necessário
    try {
      const colNotif = app.findCollectionByNameOrId('notificacoes_enviadas')
      colNotif.removeIndex('idx_notif_usuario_efemero')
      app.save(colNotif)
    } catch (_) {}
  },
)
