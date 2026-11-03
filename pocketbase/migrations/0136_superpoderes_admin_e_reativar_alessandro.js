migrate(
  (app) => {
    // 1. Limpar ativo_fora_base do caso real Alessandro da Silva (C016154)
    try {
      const alessandro = app.findFirstRecordByFilter(
        'clientes',
        "codigo = 'C016154' || nome ~ 'ALESSANDRO DA SILVA 04596786631'",
      )
      if (alessandro) {
        alessandro.set('ativo_fora_base', false)
        alessandro.set('motivo_ativo_fora_base', '')
        // Garantir reagendamento para Milena (k987jw3wh2pc401)
        alessandro.set('estado', 'reagendado')
        alessandro.set('reagendado_operador', 'k987jw3wh2pc401')
        alessandro.set('prioridade_transferencia', true)
        app.save(alessandro)

        // Registrar auditoria
        try {
          const colEv = app.findCollectionByNameOrId('eventos_log')
          const ev = new Record(colEv)
          ev.set('cliente', alessandro.id)
          ev.set('usuario', '8ug71b12p1ect6u') // Thiago Almeida admin
          ev.set('acao', 'admin_reativar_blacklist')
          ev.set('detalhes', {
            motivo:
              'Superpoderes do Admin - Liberado da blacklist e ativo_fora_base limpo para atendimento por Milena Vaz',
            codigo: 'C016154',
            operador_destino: 'k987jw3wh2pc401',
            data: new Date().toISOString(),
          })
          app.save(ev)
        } catch (_) {}
      }
    } catch (err) {
      console.log('[migration_0136] Aviso ao reativar Alessandro: ' + err.message)
    }
  },
  (app) => {
    // Revert opcional
  },
)
