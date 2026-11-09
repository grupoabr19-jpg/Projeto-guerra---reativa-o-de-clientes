# Estado do repositório — Projeto Guerra

- Branch de trabalho: `main`
- Versão atual: v0.0.193 ou superior (a versão exata é a que o app reporta em runtime; não foi lida nesta rodada)
- Migrações aplicadas no backend: de `updated_users.js` e `0001` até `0140_censo_resumo_eventos_log.js`. Nenhuma pendente. Próximo número disponível: `0141`.

## Módulos principais

- `pocketbase/hooks/regua_metricas.js`: módulo único da régua de métricas, carregado via `require` dentro do `routerAdd` (helpers top-level e `globalThis` não funcionam no Goja).
- `pocketbase/hooks/reports_export.js`: exportação CSV de relatórios.
- `pocketbase/hooks/metrics_base_kpis.js`: KPIs da base.
- `pocketbase/hooks/reports_analytics.js`: analytics do Dashboard (janela De/Até).

## Dedupe de clientes

- Migração `0138_dedupe_clientes_merge_auditoria.js`: 267 clientes mesclados, 0 apagados. Campos `merge_em` / `merge_motivo`, estado `duplicado`. Auditoria em `eventos_log` com ação `dedupe_clientes_0138`.

## Pendências conhecidas (a depurar)

- (a) Exportação CSV de relatórios não gera saída para o usuário.
- (b) Dashboard não reflete resultados reais. Janela De/Até suspeita em `sqlReativacaoReal`, `sqlJanelaInteracoes` e `parseJanela` (em `regua_metricas.js` / `reports_analytics.js`).
- (c) Lote de importação de 07/10 gravou `dias_sem_faturar` capado em 180 (clientes C023xxx); idade real mascarada; correção pendente.
- (d) Confronto tela ↔ CSV do Painel Executivo de Reativação: código já unificado em `regua_metricas.js`, mas a comparação com download real não foi feita.

## Observação

Documento de snapshot para a sincronização do código com o GitHub conectado à plataforma. Não descreve correções: apenas o estado e as pendências acima.
