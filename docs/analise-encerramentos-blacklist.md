# Análise dos encerramentos de atendimento e regra da blacklist

Documento para revisão do usuário. Fonte: `interacoes.desfecho` (gravado pela ficha de atendimento como
"Atendimento finalizado com desfecho: ...") e as regras de bloqueio em `queue_search.js`,
`queue_reserve.js`, `crons_manutencao.js` e `admin_destrava.js`.

## 1. Desfechos encontrados

Valores de `interacoes.desfecho` observados no banco (amostra das interações mais recentes):

| Desfecho (`desfecho`) | Estado gravado em `clientes.estado` | Gera blacklist?                                   |
| --------------------- | ----------------------------------- | ------------------------------------------------- |
| `contatado`           | `contatado`                         | Não                                               |
| `nao_quer_negociar`   | `nao_quer_negociar`                 | Sim — blacklist de venda perdida, sem prazo       |
| `reagendado`          | `reagendado`                        | Não (volta para a fila na data marcada)           |
| `sem_contato`         | `sem_contato`                       | Não (conta tentativas; volta a ser atendível)     |
| `compra_terceiros`    | `compra_terceiros`                  | Não encontrado na blindagem do motor — ver item 4 |

Desfechos de reativação (constante `DESFECHOS_REATIVACAO` das régua): `reativado`,
`reativado_com_pedido`, `fechou_pedido`. Eles contam como reativação real, não são blacklist.
O bloco de métricas novo também conta `faturamento_concluido` como faturamento; esse valor
não apareceu na amostra e precisa ser confirmado (item 4).

## 2. Regra da blacklist (como o código aplica hoje)

- **Quem entra:** cliente finalizado com `nao_quer_negociar` vira `estado = 'nao_quer_negociar'`.
- **Duração:** sem prazo. Não há data de fim para este estado.
- **Quem sai:** nenhuma rotina automática o retira. O motor de fila (`queue_search.js`,
  `queue_reserve.js`) exclui `estado != 'nao_quer_negociar'` em todos os caminhos.
- **Quarentena:** `clientes.quarentena_ate` também bloqueia a oferta até a data. O cron
  `crons_manutencao.js` limpa `quarentena_ate` quando vence, apenas para clientes em
  `nao_quer_negociar`. O motor só oferta quando `quarentena_ate` está vazia ou já vencida.
- **Quem pode destravar:** `admin_destrava.js` (ação de administrador). Guarda a quarentena anterior
  no evento de auditoria antes de limpar.

## 3. Redundâncias a revisar

- `nao_quer_negociar` (estado) e `nao_quer_negociar` (desfecho) são o mesmo conceito gravado em dois
  lugares. Se o estado for alterado sem o desfecho, a contagem por desfecho diverge do estado.
- `reagendado` aparece como desfecho e como estado; a data real fica em `reagendado_para`.
- `sem_contato` e `tentativas_sem_contato` contam a mesma coisa por caminhos diferentes.
- `contatado` não tem efeito no motor: é só registro. Confirmar se isso é intencional.

## 4. Pendências de verificação

- Não foi conferido se `compra_terceiros` está na lista de bloqueio do motor. Pela leitura atual,
  ele não gera blacklist. Decisão do usuário.
- `faturamento_concluido` foi usado no bloco de métricas, mas não apareceu na amostra. Confirmar
  o nome real do desfecho de faturamento antes de confiar no número.
- A amostra cobriu só as 30 interações mais recentes. A contagem completa por desfecho está no
  bloco `atendimento.porDesfecho` do endpoint `/backend/v1/metrics/base-kpis`.
