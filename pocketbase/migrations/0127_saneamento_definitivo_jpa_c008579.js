/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Saneamento JPA COMERCIO DE ADESIVOS (C008579)
    const jpa = app.findFirstRecordByFilter('clientes', "codigo = 'C008579'")
    if (jpa) {
      jpa.set('pedido_reativacao', '')
      if (jpa.getString('ultimo_pedido_numero') === '223654') {
        jpa.set('ultimo_pedido_numero', '')
      }
      jpa.set('pedido_confirmado', false)
      jpa.set('pedido_em_aberto', false)
      jpa.set('operador_reativacao', '')
      jpa.set('reativado_em', null)
      jpa.set('standby_ate', null)
      jpa.set('lock_timestamp', null)
      jpa.set('operador', '')
      jpa.set('status_faturamento', 'nenhum')
      jpa.set('base_categoria', 'cliente_final')
      jpa.set('estado', 'na_base')
      app.save(jpa)
    }

    // 2. Garantir integridade de SS ESTRUTURA METALICA (C012635)
    const ss = app.findFirstRecordByFilter('clientes', "codigo = 'C012635'")
    if (ss) {
      if (!ss.getString('pedido_reativacao')) {
        ss.set('pedido_reativacao', '223654')
      }
      if (!ss.getString('numero_nf_fatura')) {
        ss.set('numero_nf_fatura', '158708')
      }
      if (ss.getFloat('valor_faturado') <= 0) {
        ss.set('valor_faturado', 6767.5)
      }
      app.save(ss)
    }
  },
  (app) => {},
)
