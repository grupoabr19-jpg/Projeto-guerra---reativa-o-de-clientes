# RELATÓRIO DE AUDITORIA COMPLETA DO SISTEMA

## Projeto Guerra — Reativação de Clientes (Grupo ABR)

**Data:** Outubro de 2026  
**Escopo:** Auditoria 100% Somente-Leitura (Arquitetura, Regras de Negócio, UI/UX, Robustez Operacional e Oportunidades de Evolução)  
**Versão do Sistema:** ~55 versões entregues | React + Vite + TypeScript + Tailwind/shadcn + PocketBase (Skip Cloud)  
**Tamanho da Base Operacional:** ~22.707 clientes cadastrados

---

## SUMÁRIO EXECUTIVO

O **Projeto Guerra** é uma solução de alta relevância estratégica para o Grupo ABR, construída com arquitetura moderna, suporte a processamento de planilhas em Web Worker, controle de presença e locks atômicos de concorrência. Após ~55 iterações de desenvolvimento rápido para atender às rotas do Varejo e Atacado, o sistema atingiu maturidade operacional, mas acumula divergências pontuais de métricas entre telas, gargalos de escalabilidade para bases acima de 20 mil clientes e oportunidades críticas de ergonomia na rotina diária dos operadores (07h às 17h).

Abaixo está o diagnóstico completo dividido nas seções requeridas:

- **A. Achados Críticos (com evidência de arquivo e linha)**
- **B. Inconsistências de Métrica / Regra de Negócio**
- **C. Redundâncias Elimináveis (Telas, Endpoints e Dados)**
- **D. Melhorias de UI/UX Priorizadas (Impacto × Esforço)**
- **E. Funcionalidades Novas Sugeridas (Alto Valor Operacional)**
- **F. Plano de Ação Proposto em Fases (Fase 1, 2 e 3)**

---

## A. ACHADOS CRÍTICOS (COM EVIDÊNCIA EM CÓDIGO E BANCO)

### 1. [BUG CRÍTICO DE UI] Coluna "Score" na Tabela de Clientes Exibe o Código do Cliente

- **Arquivo:** `src/pages/Clientes.tsx` (linhas 297–301)
- **Código atual:**
  ```tsx
  <td className="py-3 px-3 text-center">
    <span className="font-mono font-bold text-[#253575] bg-[#253575]/10 px-2 py-0.5 rounded border border-[#253575]/20">
      {item.codigo}
    </span>
  </td>
  ```
- **Evidência:** Na coluna cabeçalho `<th>Score</th>`, o valor renderizado é `{item.codigo}` em vez de `{item.score ?? 0}`.
- **Impacto:** O supervisor e o administrador não conseguem ver o Score calculado do cliente na listagem da carteira, vendo o código cadastral repetido duas vezes lado a lado.

---

### 2. [GARGALO DE ESCALABILIDADE] Listagem de Clientes Carrega Apenas 150 Registros Sem Paginação Real

- **Arquivo:** `src/pages/Clientes.tsx` (linha 81)
- **Código atual:** `fetchClientes({ perPage: 150 })`
- **Evidência:** A base real possui **22.707 registros** (conforme constatado no cron diário e consultas de banco). A tela busca apenas 150 registros fixos e realiza a busca (`searchTerm`) e os filtros (`selectedRegiao`, `selectedEstado`, `selectedCategoria`) apenas na memória do navegador (`clientes.filter(...)`).
- **Impacto:** Mais de **99% da base fica inacessível** para consulta do supervisor na tela de Clientes. Se o cliente procurado não estiver entre os 150 primeiros, o sistema informa erroneamente que "Nenhum cliente atende aos filtros".

---

### 3. [SOBRECARGA DE MEMÓRIA NO BACKEND] Leitura de 50.000 Registros a Cada Lote de Importação

- **Arquivo:** `pocketbase/hooks/import_planilha.js` (linhas 93–97)
- **Código atual:**
  ```javascript
  const existingClientes = $app.findRecordsByFilter('clientes', '1=1', '', 50000, 0)
  ```
- **Evidência:** A cada requisição HTTP de envio de lote (chunks de 500 linhas vindos do front-end), o hook executa uma consulta completa carregando até 50.000 registros na memória RAM do PocketBase para construir o cache de busca `clientsByCode` e `clientsByNameKey`.
- **Impacto:** Ao importar uma planilha com 5.000 linhas dividida em 10 lotes, o backend busca a base inteira de 22.700 registros **10 vezes seguidas** em menos de 1 minuto, causando picos de CPU/RAM e risco de timeout (504 Gateway Timeout).

---

### 4. [RISCO DE PERDA DE DADOS] Questionário de 17 Etapas Não Possui Salvamento Automático por Passo

- **Arquivo:** `src/pages/Atendimento.tsx` (linhas 85–100, 427–475)
- **Evidência:** O estado do questionário (`answers`) é mantido exclusivamente no `useState` do React no navegador. O envio ao backend só é disparado ao final do fluxo na chamada de `handleFinalizeAtendimento()` (Step 17) ou ao clicar em abandonar atendimento.
- **Impacto:** Se o operador estiver na pergunta 15 e a conexão oscilar, a aba for fechada acidentalmente, ou houver recarregamento, todas as respostas detalhadas da ligação são perdidas.

---

### 5. [PERFORMANCE DO CRON DAS 03:00] Atualização Diária Salva 22.700 Registros Um por Um

- **Arquivo:** `pocketbase/hooks/crons_manutencao.js` (linhas 103–211)
- **Evidência nos logs:** Em `2026-10-02 03:00:40.264Z`, o log registrou: `"Job diário concluído: 22707 clientes processados"`. A rotina executa um loop com `$app.save(c)` unitário para cada cliente da base.
- **Impacto:** O cron levou mais de 40 segundos para executar. Conforme a base crescer para 50k+ clientes, essa rotina unitária ultrapassará o limite de timeout e poderá travar requisições concorrentes no banco SQLite do PocketBase.

---

## B. INCONSISTÊNCIAS DE MÉTRICA E REGRA DE NEGÓCIO

### 1. Discrepância na Contagem de "Conversões / Reativações" entre Telas

- **Dashboard (`Dashboard.tsx`):**
  Lê do endpoint de KPIs (`/backend/v1/metrics/base-kpis`), segregando rigorosamente:
  - **Reativações Reais da Equipe:** Clientes com `estado = 'reativado' AND operador != '' AND ...`
  - **Faturamento Recente (Cruzamento):** Clientes com faturamento <60 dias importados via ERP sem operador direto.
- **Meu Painel (`MeuPainel.tsx` linhas 145–146 e 231–232):**
  Conta como conversão do operador qualquer registro na coleção `interacoes` onde `desfecho === 'reativado' || desfecho === 'reativado_com_pedido'`. Não cruza com o estado atual do cliente no banco nem com a reconciliação do pedido.
- **Equipe do Líder (`Equipe.tsx` linhas 218–222):**
  Soma conversões baseando-se estritamente nas interações filtradas por data no front-end.
- **Problema de Negócio:** Se um operador registrou uma reativação com número de pedido, mas o supervisor reverteu o status ou a importação subsequente identificou cancelamento da nota, o Meu Painel continua pontuando a conversão, enquanto o Dashboard e o Relatório Executivo mostram números divergentes.

---

### 2. Definição de "Hoje" e Deslocamento de Fuso Horário (Brasília vs UTC)

- **Arquivo de Referência:** `src/lib/expediente.ts` define corretamente as funções de fuso `America/Sao_Paulo` (`getBrasiliaParts`, `getBrasiliaMidnight`).
- **Inconsistência:**
  - Em `src/pages/MeuPainel.tsx` e `src/pages/Dashboard.tsx`, diversas filtragens de data comparam interações usando:
    `new Date(i.created).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)`
  - **Falha:** A data ISO UTC vira o dia às 21:00 no horário de Brasília (UTC-3). Atendimentos realizados ou agendados entre 21h e 23h59 são contabilizados no dia seguinte ou omitidos na aba "Hoje".

---

### 3. Fila da "Repescagem" Inacessível nos Filtros de Supervisão

- **Regra de Negócio (Memória do Projeto):** A Rota especial "Repescagem" atende clientes com 90+ dias sem faturar de qualquer região, exceto os contatados pelo vendedor original da rota.
- **Implementação no Backend:** O motor de reserva (`queue_reserve.js`) implementa perfeitamente a regra para operadores vinculados à região `REPESCAGEM`.
- **Inconsistência no Front-end:**
  - A constante `TODAS_REGIOES_FILTRO` em `src/types/index.ts` lista apenas as 8 rotas do Varejo + ATACADO.
  - A tela de `Clientes.tsx` e a tela de `Fila.tsx` não possuem a opção "Repescagem" em seus filtros de região, impedindo que o supervisor ou admin visualize especificamente a esteira transversal da Repescagem.

---

### 4. Filtros Especiais da Base Presentes em Clientes, mas Ausentes em Fila e Relatórios

- **Contexto:** Foram criadas três categorias de segregação estratégica:
  1. `Base Cliente Final` (`base_categoria = 'cliente_final'`)
  2. `ATACADO Fora do Mapa` (`base_categoria = 'atacado_fora_mapa'`)
  3. `Vendedor sem dono na equipe` (`sem_dono_equipe = true`)
- **Inconsistência:**
  - Em `src/pages/Clientes.tsx`, o dropdown permite isolar essas 4 categorias com precisão.
  - Porém, em `src/pages/Fila.tsx` (supervisão da fila), esses filtros **não existem**. O supervisor da fila não consegue auditar quantos clientes estão fora da fila por serem "Cliente Final" ou "Fora do Mapa".
  - Em `src/pages/Relatorios.tsx`, o relatório executivo não possui filtros para cruzar desempenho excluindo ou incluindo a base de Cliente Final.

---

## C. REDUNDÂNCIAS ELIMINÁVEIS

### 1. Duplicação de Consultas entre `metrics_base_kpis.js` e `reports_analytics.js`

- **Evidência:** `src/pages/Relatorios.tsx` (linhas 271–285) dispara simultaneamente `fetchMetricasBaseKpis` e `fetchReportsAnalytics`.
- Ambos os hooks no PocketBase executam queries SQL pesadas na tabela `clientes` para calcular exatamente os mesmos agregadores (`totalBase`, `naFila`, `reativadosReais`, `faturamentoRecenteCruzamento`, agrupamento por faixas).
- **Ação de Otimização:** Unificar os dois endpoints em uma única chamada consolidada `/backend/v1/metrics/analytics` ou reaproveitar a resposta, reduzindo a carga do banco pela metade.

---

### 2. Tela `Fila.tsx` Redundante com `Clientes.tsx`

- **Evidência:** Operadores já não têm acesso à tela `Fila.tsx` (são redirecionados para `MeuPainel` ou `Atendimento`). Para supervisores, a tela `Fila.tsx` renderiza apenas uma listagem simplificada de até 50 clientes da fila com botões de lock manual que raramente são usados.
- **Ação:** As ações úteis de governança de fila (desbloquear lock, ver clientes em atendimento e priorizar) podem ser integradas como uma aba dedicada dentro de `Clientes.tsx` ("Fila & Locks"), eliminando uma rota e simplificando a barra de navegação.

---

### 3. Redundância de Campos de Datas e Valores na Tabela `clientes`

- No schema do PocketBase (`clientes`):
  - `ultima_compra` (datetime ISO)
  - `ultimo_faturamento_data` (datetime ISO)
  - `ultimo_pedido_data` (date YYYY-MM-DD)
  - `valor_historico` vs `fat_12m_reais` vs `valor_ultima_compra`
  - `toneladas_historico` vs `peso_nf_tonelagem`
- **Problema:** A importação e os crons precisam verificar 2 ou 3 campos alternativos para a mesma finalidade.
- **Ação:** Padronizar um dicionário de dados único: `ultima_compra_data` (data), `faturamento_12m_reais` (valor anual acumulado), `ultimo_pedido_valor` (valor do último pedido) e `ultimo_pedido_peso_ton` (volume).

---

### 4. Código Redundante de Cálculo de Diagnóstico no Front-end

- **Evidência:** `src/services/diagnostico.ts` possui **731 linhas de código** processando agregações no navegador. Grande parte desses cálculos já é feita no servidor via `reports_analytics.js`.

---

## D. USABILIDADE / UI-UX (MELHORES PRÁTICAS)

| Item   | Área                           | Problema Atual                                                                                                                                                   | Impacto                                                            | Esforço                                                                                     |
| :----- | :----------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **D1** | **Atendimento (Ficha)**        | Assistente com 17 telas sucessivas (1 pergunta por tela). Perguntas Q1, Q2 e Q4 são somente-leitura e obrigam o operador a avançar 3 telas em branco.            | **Alto** (lentidão no atendimento, meta de 40 ligações/dia)        | **Baixo** (agrupar Q1–Q4 em cabeçalho fixo e reduzir fluxo para 4 blocos lógicos)           |
| **D2** | **Atendimento**                | Ausência de auto-save no formulário durante o preenchimento.                                                                                                     | **Alto** (perda de anotações da chamada se conexão cair)           | **Médio** (salvar rascunho em `localStorage` e via patch a cada resposta)                   |
| **D3** | **Clientes**                   | Limite rígido de 150 registros carregados e ausência de paginação real.                                                                                          | **Crítico** (visão cega de 99% da base)                            | **Médio** (implementar paginação server-side com limite de 50 por página e busca remota)    |
| **D4** | **Identidade Visual ABR**      | Botões e CTAs com excesso de cores simultâneas (roxo, ciano, verde, âmbar, azul). Regra ABR: Laranja `#F18800` exclusivamente para CTAs de ação comercial.       | **Médio** (poluição visual e inconsistência de marca)              | **Baixo** (padronizar botões primários com `#F18800` e secundários com `#253575` / outline) |
| **D5** | **Mobile / Tablet**            | Tabelas de relatórios e equipe possuem 10+ colunas horizontais sem modo de visualização em cartões (_cards view_) para celular.                                  | **Médio** (dificuldade de uso por líderes e supervisores em campo) | **Médio** (renderizar cards verticais expansíveis quando `< 768px`)                         |
| **D6** | **Acessibilidade & Contraste** | Textos com tamanho `text-[9px]` e `text-[10px]` em badges de dados importantes (CNPJ, status de quarentena, motivo de recusa).                                   | **Médio** (fadiga visual no expediente de 8 horas)                 | **Baixo** (elevar tamanho mínimo para `text-[11px]` e ajustar contraste WCAG AA)            |
| **D7** | **Feedback Operacional**       | Mensagens de sucesso usam diálogos nativos do navegador (`window.alert()` e `window.confirm()`) em vez dos componentes estilizados `Dialog` e `Toast` do shadcn. | **Médio** (quebra de imersão e bloqueio de UI)                     | **Baixo** (substituir alerts nativos por `toast()` com ações)                               |

---

## E. O QUE FALTA PARA FICAR "PERFEITO" (NOVOS RECURSOS DE ALTO VALOR)

Sugestões voltadas especificamente para a operação real de reativação (expediente das 07h às 17h, equipe comercial ativa):

1. **Central de Follow-ups do Dia com Notificações Sonoras e Badge no Topo:**
   - O operador inicia o dia às 07h00. O sistema deve abrir automaticamente uma aba ou banner com a lista prioritária dos retornos agendados para a data de hoje, ordenados pelo horário de Brasília.
   - Disparar lembrete visual na barra superior 5 minutos antes do horário combinado com o cliente.

2. **Busca Global Instantânea (Atalho `Ctrl + K` / `Cmd + K`):**
   - Modal rápido acessível de qualquer tela que pesquisa simultaneamente por:
     - Código do cliente (ex.: `C010992`)
     - Razão Social / Nome Fantasia
     - Telefone / WhatsApp (busca por qualquer pedaço do número)
     - CNPJ ou CPF
   - Permite ao operador ou supervisor abrir a ficha do cliente em 1 clique sem navegar até a lista.

3. **Histórico e Audit Trail Completo por Cliente:**
   - Hoje o cliente possui a aba "Histórico de Contatos", mas não exibe histórico de:
     - Quando foi importado e de qual planilha veio;
     - Quando e por quem foi transferido de vendedor/operador;
     - Quando entrou ou saiu da quarentena;
     - Alterações cadastrais realizadas.

4. **Painel de Ativação Rápida de Script e Objeções Comerciais:**
   - Na tela de Atendimento, adicionar uma gaveta lateral com "Argumentos Rápidos contra Objeções" específicos para o setor de aço/metalurgia (ex.: Objeção de Preço do Frete, Reclamação de Atraso de Carreta, Bonificação de Lote, Tabela de Prazos).

5. **Exportação Agendada / Relatório Consolidado para a Diretoria:**
   - Exportação em 1 clique para planilha Excel (.xlsx formatada com abas separadas) contendo:
     - Aba 1: Reativações Reais com Pedido e Vendedor
     - Aba 2: Clientes Reconciliados pelo ERP
     - Aba 3: Motivos de Recusa e Perda de Venda agrupados por Região

---

## F. PLANO DE AÇÃO PROPOSTO EM FASES (PARA VALIDAÇÃO)

### FASE 1 — Correções Rápidas de Alto Impacto (Quick Wins & Integridade)

_Estimativa de Esforço: 1 a 2 dias | Risco: Baixo_

1. **Correção do Score na Tabela de Clientes:**
   - Corrigir a linha 299 de `src/pages/Clientes.tsx` para exibir `{item.score ?? 0}` em vez de `{item.codigo}`.
2. **Substituição de `alert()` e `confirm()` nativos por `toast` e `Dialog`:**
   - Padronizar feedbacks amigáveis na tela de Atendimento e Clientes.
3. **Agrupamento dos Steps 1 a 4 na Ficha de Atendimento:**
   - Manter dados cadastrais pré-preenchidos fixos no topo e iniciar o formulário diretamente nas perguntas qualificatórias (reduzindo de 17 para 13 telas).
4. **Adição da Região "REPESCAGEM" no Seletor de Filtros:**
   - Adicionar a opção nos dropdowns para supervisores auditarem a fila transversal.
5. **Correção do Fuso de Brasília nos Filtros Diários:**
   - Substituir `toISOString().slice(0, 10)` pelas funções de `src/lib/expediente.ts` para contagens exatas de "Hoje".

---

### FASE 2 — Robustez de Dados, Performance e Governança

_Estimativa de Esforço: 3 a 5 dias | Risco: Médio_

1. **Paginação Server-side e Busca Remota na Tela de Clientes:**
   - Alterar `Clientes.tsx` para paginar no servidor (`perPage: 50`) com busca de texto direto no banco via PocketBase filter, permitindo visualizar os 22.707 clientes com velocidade e sem travar o navegador.
2. **Otimização do Importador e Cache do Backend:**
   - Modificar `pocketbase/hooks/import_planilha.js` para buscar apenas os clientes correspondentes aos códigos/nomes do lote atual (`codigo IN (...)`) em vez de dar `getFullList` de 50.000 clientes a cada lote.
3. **Otimização do Cron Diário das 03:00:**
   - Processar atualização de scores e faixas em lotes com transação SQLite direta, reduzindo o tempo de execução de 40s para <3 segundos.
4. **Auto-save de Respostas no Atendimento:**
   - Salvar respostas a cada campo alterado em `localStorage` e atualizar o campo `rascunho_respostas` no cliente, garantindo recuperação total em caso de desconexão.
5. **Harmonização das Métricas de Conversão:**
   - Alinhar o cálculo de conversões em `MeuPainel.tsx` e `Equipe.tsx` para respeitar a mesma segregação de "Reativações Reais" do Dashboard.

---

### FASE 3 — Novos Recursos e Experiência Operacional Premium

_Estimativa de Esforço: 5 a 7 dias | Risco: Baixo_

1. **Central de Follow-ups do Dia com Notificações Ativas:**
   - Alertas visuais e sonoros para compromissos agendados no expediente (07h–17h).
2. **Busca Global Instantânea (`Ctrl + K`):**
   - Acesso rápido a qualquer cliente por Código, Nome, Telefone ou CNPJ.
3. **Guia de Objeções e Script Comercial Integrado:**
   - Gaveta com apoio tático para o operador contornar recusas durante a ligação.
4. **Unificação da Fila em Aba Dedicada dentro de Clientes:**
   - Remover rota redundante `/fila` e consolidar a governança de carteira em uma experiência única para supervisores.
5. **Exportador Executivo Excel Formatado:**
   - Geração de relatórios consolidados em `.xlsx` com gráficos de fechamento para a diretoria.

---

## CONCLUSÃO E PRÓXIMOS PASSOS

O sistema encontra-se em estado funcional avançado, estável em produção e com todas as regras de negócio das 9 regiões e distribuição por DDD implementadas.

Os achados levantados nesta auditoria mostram que o sistema está pronto para ser elevado ao padrão de excelência de software corporativo: com a correção do bug de exibição de Score, a introdução de paginação server-side na carteira de 22k clientes, a otimização de queries no backend e o agrupamento das perguntas do atendimento, a ferramenta atingirá o nível de usabilidade e confiabilidade ideal para a operação comercial do Grupo ABR.

**Aguardando validação do plano de ação pelo usuário para início das implementações.**
