# Auditoria Estatística Completa e Dicionário de Fórmulas do Dashboard

**Projeto Guerra — Painel Executivo de Reativação**  
_Auditoria Data-Driven e Rastreamento de Origem de Dados (v0.0.158)_

---

## 1. Visão Geral e Princípios Estatísticos

Esta auditoria documenta formalmente a origem de cada indicador presente no **Painel Executivo de Reativação**, especificando:

- **Coleção e campos de origem**
- **Filtros e critérios de inclusão/exclusão**
- **Regras de deduplicação e janela temporal (Fuso de Brasília)**
- **Padronização de unidades de massa** ($1 \text{ ton} = 1.000 \text{ kg}$)
- **Separação conceitual entre eventos de atendimento e clientes únicos da carteira**

---

## 2. Dicionário de Fórmulas por Seção e Card

### Seção 1: Métricas de Atendimento (Consolidação em Tempo Real)

#### Card 1: Total Atendimentos

- **Hook/Função:** `fetchMetricasAtendimentosDashboard` (`src/services/api.ts`)
- **Fonte:** Coleção `interacoes`
- **Fórmula:** $\text{COUNT}(\text{interacoes.id})$
- **Filtro:** `created >= inicio_periodo_brasilia` e filtros regionais/segmento.
- **Deduplicação:** Nenhuma (representa o total de eventos/atividades registradas pelos operadores).

#### Card 2: Ligações Feitas

- **Hook/Função:** `fetchMetricasAtendimentosDashboard` via `isLigacaoOuChamada(it)` (`src/lib/conversao.ts`)
- **Fonte:** Coleção `interacoes`
- **Fórmula:** $\text{COUNT}(\text{interacoes})$ onde `tipo IN ('ligacao', 'formulario') OR (desfecho IS NOT NULL AND desfecho != '')`
- **Deduplicação:** Nenhuma (volume total de contatos ativos e formulários executados).

#### Card 3: Conversões (Atendimento)

- **Hook/Função:** `fetchMetricasAtendimentosDashboard` via `isConversao(it)` (`src/lib/conversao.ts`)
- **Fonte:** Coleção `interacoes`
- **Fórmula:** $\text{COUNT}(\text{interacoes})$ onde operador está preenchido, cliente expandido está em `estado = 'reativado'` e `desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido') OR numero_pedido != ''`
- **Distinção Conceitual:** Mede **eventos de conversão** em ligações/atendimentos. Um cliente pode ter tido mais de um atendimento registrado ou pedido associado durante a esteira. Diferencia-se de **Clientes Reativados (Real Equipe)**, que conta estritamente clientes únicos da carteira.

#### Card 4: Taxa de Conversão

- **Hook/Função:** `calcularTaxaConversao` (`src/lib/conversao.ts`)
- **Fórmula:** $\text{Taxa} = \text{ROUND}\left(\frac{\text{Conversões}}{\text{Ligações Feitas}} \times 100\right)$

#### Card 5: Reagendamentos

- **Hook/Função:** `fetchMetricasAtendimentosDashboard`
- **Fonte:** Coleção `interacoes`
- **Fórmula:** $\text{COUNT}(\text{interacoes})$ onde `desfecho = 'reagendado' OR reagendado_para IS NOT NULL`

#### Card 6: Follow-ups Hoje

- **Hook/Função:** `fetchMetricasAtendimentosDashboard`
- **Fonte:** Coleção `clientes`
- **Fórmula:** $\text{COUNT}(\text{clientes})$ onde `(reagendado_para != '' OR estado = 'reagendado') AND DATE(reagendado_para, 'America/Sao_Paulo') = HOJE`

#### Card 7: Follow-ups Pendentes Acumulados

- **Hook/Função:** `fetchMetricasAtendimentosDashboard`
- **Fonte:** Coleção `clientes`
- **Fórmula:** $\text{COUNT}(\text{clientes})$ onde `reagendado_para != '' AND DATE(reagendado_para, 'America/Sao_Paulo') <= HOJE`

#### Card 8: Vendas Perdidas

- **Hook/Função:** `fetchMetricasAtendimentosDashboard`
- **Fonte:** Coleção `interacoes`
- **Fórmula:** $\text{COUNT}(\text{interacoes})$ onde `desfecho IN ('compra_terceiros', 'nao_quer_negociar', 'restricao_financeira', 'sem_contato')`

---

### Seção 2: Métricas de Carteira e Recuperação da Base

#### Card 1: Total Inativos Base

- **Hook/Função:** `metrics_base_kpis.js` (`/backend/v1/metrics/base-kpis`)
- **Fonte:** Coleção `clientes`
- **Filtro Base:** `estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0)`
- **Fórmula:** $\text{COUNT}(*)$ sobre a base de inativos sob gestão.

#### Card 2: Na Fila de Trabalho

- **Hook/Função:** `metrics_base_kpis.js`
- **Fórmula:** $\text{Na Fila} = \text{COUNT}(\text{estado = 'na_base'}) + \text{COUNT}(\text{estado = 'reservado'})$
- **Conciliação da Base:** Os clientes fora da fila correspondem exatamente à soma de:
  - `reagendados` (com data futura de retorno)
  - `em_atendimento` (atualmente com operador em tela)
  - `contatados` (ciclo de follow-up em andamento)
  - `reativados` (clientes reativados pela equipe)
  - `compra_terceiros`, `nao_quer_negociar`, `restricao_financeira`, `sem_contato` (desfechos conclusivos)
  - `ativo_fora_base` e `cliente_final` (bases isoladas que não entram na contagem de inativos da fila)

#### Card 3: Clientes Reativados (Real Equipe)

- **Hook/Função:** `metrics_base_kpis.js` e `base_kpis_core.js`
- **Regra Unificada:** `SQL_IS_REATIVACAO_REAL`
- **Condição:**
  ```sql
  estado = 'reativado'
  AND operador IS NOT NULL AND TRIM(operador) != ''
  AND EXISTS (
    SELECT 1 FROM interacoes i_chk
    WHERE i_chk.cliente = clientes.id
      AND (
        i_chk.desfecho IN ('reativado', 'reativado_com_pedido', 'fechou_pedido')
        OR (i_chk.numero_pedido IS NOT NULL AND TRIM(i_chk.numero_pedido) != '' AND TRIM(i_chk.numero_pedido) != '-')
      )
  )
  ```
- **Fórmula de Valor e Toneladas:**
  - Calculados a partir de `respostas_formulario` (fichas de atendimento reais preenchidas pelo operador).
  - Deduplicação: Ficha mais recente por cliente (`ORDER BY rf.created DESC`).
  - Normalização de unidade: $1 \text{ ton} = 1.000 \text{ kg}$. Valores $> 500$ informados como peso são tratados como kg e convertidos para toneladas dividindo por $1.000$.
  - Cinto de segurança estatístico: descartar fichas espúrias com $\frac{\text{valor}}{\text{ton}} < 100 \text{ R\$/ton}$.
- **Clientes Reativados Reais Legítimos no Banco:**
  1. `C012635` — SS Estrutura Metálica (Pedido 223654, NF 158708, R$ 6.767,50)
  2. `C002334` — Vital Aço
  3. `C020260` — Wellington (Pedido 223787, R$ 2.191,13)

#### Card 4: Taxa de Recuperação

- **Hook/Função:** `metrics_base_kpis.js`
- **Fórmula:**
  $$\text{Taxa de Recuperação} = \frac{\text{Reativados Reais Equipe}}{\text{Total Inativos Base}} \times 100$$

#### Card 5: Pedidos em Aberto

- **Hook/Função:** `metrics_base_kpis.js`
- **Fonte:** Coleção `clientes`
- **Fórmula:** $\text{COUNT}(*)$ e $\text{SUM}(\text{valor\_ultima\_compra})$ onde `pedido_em_aberto = 1`.
- **Deduplicação:** Por cliente com pedido ativo aguardando faturamento.

#### Card 6: Faturamento Recente (Cruzamento)

- **Hook/Função:** `metrics_base_kpis.js`
- **Definição:** Cadastros que faturaram no ERP sem operador e sem atendimento da equipe.
- **Saneamento Definitivo (Migrações 0132, 0133, 0134, 0135):**
  - Todos os clientes sem operador que faturaram no ERP foram reclassificados como `ativo_fora_base`.
  - O card não agrega mais registros sem operador na esteira ativa.

#### Card 7: Ativos Fora da Base

- **Hook/Função:** `fetchMetricasAtendimentosDashboard` (`src/services/api.ts`)
- **Fonte:** Coleção `clientes` onde `ativo_fora_base = true OR estado = 'ativo_fora_base'`.
- **Deduplicação:** Por cliente único, com breakdown por motivo de exclusão.

---

### Seção 3: Métricas da Ficha de Atendimento

#### Cards de Potencial (Q15 / Q16)

- **Hook/Função:** `fetchMetricasRespostasFormulario` (`pocketbase/hooks/metrics_respostas_formulario.js`)
- **Fonte:** Coleção `respostas_formulario`
- **Padronização:**
  - Soma de Valor Potencial: $\text{SUM}(\text{valor\_potencial})$
  - Ticket Médio Potencial: $\frac{\text{Soma Valor}}{\text{Fichas com Valor}}$
  - Volume Potencial: $\text{SUM}(\text{toneladas\_potencial})$ em toneladas, com indicação explícita da conversão para kg ($\text{ton} \times 1.000$).
  - Taxa de Orçamento Q3: $\frac{\text{Fichas com Orçamento = Sim}}{\text{Total Fichas com Q3 respondida}} \times 100$

---

## 3. Conclusão da Auditoria

Todos os cálculos e fontes do banco foram alinhados, as migrações de saneamento aplicadas e as fórmulas documentadas sem deixar buracos ou duplicações.
