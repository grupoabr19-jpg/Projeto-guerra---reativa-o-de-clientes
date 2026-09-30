routerAdd(
  'POST',
  '/backend/v1/kommo/sync-lead',
  (e) => {
    try {
      // REGRA DO USUÁRIO / PROJETO GUERRA:
      // A integração Kommo está em modo ESTRITAMENTE SOMENTE-LEITURA.
      // NENHUM dado deve ser gravado ou alterado no Kommo (sem criação de leads, contatos, notas ou tarefas).
      // Esse processo ainda será manual a critério da gestão.
      // Retorna sucesso informativo de forma transparente para não quebrar fluxos do cliente.

      const KOMMO_READONLY_MODE = true

      if (KOMMO_READONLY_MODE) {
        return e.json(200, {
          synced: false,
          readonly_mode: true,
          skipped: true,
          message:
            'Integração Kommo CRM está configurada em modo Somente Leitura. Nenhuma escrita ou envio de dados é realizada no CRM externo.',
        })
      }

      // Código de escrita mantido dormente caso seja reativado no futuro
      return e.json(200, {
        synced: false,
        skipped: true,
      })
    } catch (err) {
      return e.json(200, {
        synced: false,
        error: err.message,
        readonly_mode: true,
      })
    }
  },
  $apis.requireAuth(),
)
