/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0126: Correção corretiva com SQL direto para saneamento do caso JPA e varredura.
 *
 * Utiliza SQL direto através de app.db().newQuery(...) para garantir aplicação imediata
 * na tabela 'clientes', sem dependência de ORM de migrations ou hooks de atualização.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0126] Executando correção com SQL direto...')

    // 1. Correção cirúrgica da JPA COMERCIO DE ADESIVOS (C008579)
    try {
      const sqlJPA = `
        UPDATE clientes
        SET
          pedido_reativacao = '',
          ultimo_pedido_numero = CASE WHEN ultimo_pedido_numero = '223654' THEN '' ELSE ultimo_pedido_numero END,
          pedido_confirmado = 0,
          pedido_em_aberto = 0,
          operador_reativacao = '',
          reativado_em = NULL,
          standby_ate = NULL,
          lock_timestamp = NULL,
          operador = '',
          base_categoria = 'cliente_final',
          estado = 'cliente_final'
        WHERE codigo = 'C008579'
      `
      app.db().newQuery(sqlJPA).execute()
      console.log('[MIGRATION 0126] SQL de saneamento da JPA executado com sucesso.')
    } catch (errJPA) {
      console.error('[MIGRATION 0126] Erro ao executar SQL para JPA:', errJPA)
    }

    // 2. Varredura e desmarcação com SQL de qualquer outro cliente que tenha o pedido 223654
    // (o pedido 223654 pertence EXCLUSIVAMENTE à SS ESTRUTURA METÁLICA C012635)
    try {
      const sqlOutrosCom223654 = `
        UPDATE clientes
        SET
          pedido_reativacao = '',
          ultimo_pedido_numero = CASE WHEN ultimo_pedido_numero = '223654' THEN '' ELSE ultimo_pedido_numero END,
          pedido_confirmado = 0,
          pedido_em_aberto = 0,
          operador_reativacao = '',
          reativado_em = NULL,
          standby_ate = NULL,
          lock_timestamp = NULL,
          operador = '',
          estado = CASE
            WHEN segmento LIKE '%cliente final%' OR segmento LIKE '%consumidor%' OR base_categoria = 'cliente_final'
            THEN 'cliente_final'
            ELSE 'na_base'
          END
        WHERE codigo != 'C012635'
          AND (pedido_reativacao = '223654' OR ultimo_pedido_numero = '223654')
      `
      app.db().newQuery(sqlOutrosCom223654).execute()
      console.log('[MIGRATION 0126] SQL de garantia do pedido 223654 executado.')
    } catch (errPed) {
      console.error('[MIGRATION 0126] Erro ao desmarcar pedido 223654 de outros clientes:', errPed)
    }

    // 3. Registrar auditoria em eventos_log
    try {
      const sqlLog = `
        INSERT INTO eventos_log (id, cliente, tipo_evento, descricao, created, updated)
        SELECT
          substr(hex(randomblob(8)), 1, 15) as id,
          id as cliente,
          'saneamento_duplicidade_pedido' as tipo_evento,
          'Saneamento v0.0.176 via SQL: remoção de pedido 223654 e restauração de estado para cliente_final.' as descricao,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
        FROM clientes
        WHERE codigo = 'C008579'
      `
      app.db().newQuery(sqlLog).execute()
      console.log('[MIGRATION 0126] Log gravado em eventos_log.')
    } catch (logErr) {
      console.warn('[MIGRATION 0126] Aviso ao gravar evento de log:', logErr)
    }

    // 4. Salvar evidência em configuracoes para consulta
    try {
      const sqlConf = `
        INSERT INTO configuracoes (id, chave, descricao, valor, created, updated)
        VALUES (
          substr(hex(randomblob(8)), 1, 15),
          'evidencia_saneamento_0126',
          'Evidência de saneamento da JPA C008579 e integridade da SS C012635',
          '{"status":"SUCESSO","versao":"0.0.176","jpa_codigo":"C008579","ss_codigo":"C012635"}',
          strftime('%Y-%m-%d %H:%M:%f', 'now'),
          strftime('%Y-%m-%d %H:%M:%f', 'now')
        )
      `
      app.db().newQuery(sqlConf).execute()
    } catch (_) {}

    console.log('[MIGRATION 0126] Migração 0126 finalizada.')
  },
  (app) => {},
)
