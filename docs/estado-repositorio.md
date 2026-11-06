# Estado do repositório — Projeto Guerra

- Branch de trabalho: `main`
- Migrações aplicadas no backend: até `0140_censo_resumo_eventos_log.js` (nenhuma pendente)
- Módulo único de métricas: `pocketbase/hooks/regua_metricas.js` (via `require` dentro do routerAdd)
- Dedupe de clientes: migração `0138_dedupe_clientes_merge_auditoria.js` (267 mesclados, 0 apagados; auditoria em `eventos_log`, ação `dedupe_clientes_0138`)
- Pendências conhecidas (a depurar pelo usuário):
  - Exportação CSV de relatórios não funciona; resultado real do dashboard divergente
  - `dias_sem_faturar` capado em 180 no lote de importação 07/10 (C023xxx)
  - Confronto tela↔CSV do Painel Executivo de Reativação (código já unificado em `regua_metricas.js`)

Documento gerado para a sincronização do código no GitHub; nada além dele foi alterado nesta rodada.
