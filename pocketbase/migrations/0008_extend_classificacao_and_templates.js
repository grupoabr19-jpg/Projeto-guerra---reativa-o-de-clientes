migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('bases_referencia')

    // 1. Estender os valores do select 'classificacao' para incluir 'faturamento'
    const classField = col.fields.getByName('classificacao')
    if (classField) {
      classField.values = ['margem', 'clientes', 'faturamento', 'outra']
    } else {
      col.fields.add(
        new SelectField({
          name: 'classificacao',
          values: ['margem', 'clientes', 'faturamento', 'outra'],
          maxSelect: 1,
        }),
      )
    }
    app.save(col)

    // 2. Atualizar registro 85kmj7y9a6fqjp6 (Clientes Inativos.xlsx)
    try {
      const recClientes = app.findFirstRecordByData('bases_referencia', 'id', '85kmj7y9a6fqjp6')
      recClientes.set('classificacao', 'clientes')
      recClientes.set('status', 'mapeado')
      recClientes.set(
        'notas',
        'LAYOUT MAPEADO: Clientes Inativos (23.095 linhas, 15 colunas).\n' +
          '• Chave única / Upsert: "Cód. Cliente" (ex: C020106)\n' +
          '• Identificação & Contato: "Nome do Cliente", "Cidade", "Estado", "Celular", "E-mail"\n' +
          '• Vendedor & Território: "Vendedor" (ex: ATR - ACOS ITELEM), "Região", "Código Região", "Tipo de Vendedor"\n' +
          '• Crédito & Segmento: "Limite de Crédito", "Segmento", "Data Criação PN"\n' +
          '• Inatividade & Score: "Menor dias última venda" (dias sem faturar ou PN NOVO), "Faixa última compra" (Sem Venda, 90 dias e acima, 60-89 dias).\n' +
          'Alimenta a coleção `clientes` e define a esteira de reativação.',
      )
      app.save(recClientes)
    } catch (_) {}

    // 3. Atualizar registro koa79knm8bcevom (Gestão da Produção.xlsx)
    try {
      const recFat = app.findFirstRecordByData('bases_referencia', 'id', 'koa79knm8bcevom')
      recFat.set('classificacao', 'faturamento')
      recFat.set('status', 'mapeado')
      recFat.set(
        'notas',
        'LAYOUT MAPEADO: Gestão da Produção — Faturamento & Pedidos (46.489 linhas, 59 colunas).\n' +
          '• Identificação do Pedido: "Pedido" (número do pedido/PV), "Cliente" (razão ou nome), "Cidade", "UF"\n' +
          '• Faturamento & NF: "Data Nota Fiscal", "NF", "Fat R$" (valor faturado), "Peso NF" (ton/kg), "Total", "Preço Após Desconto", "Data Documento Pedido", "Data Entrada Pedido"\n' +
          '• Equipe Comercial: "Vendedor" (ex: VARE - PAOLA SANTOS, ATR - HERNANE ALVES), "Região", "CanaL" (VAREJO, ATACADO), "Unidade" (STEEL MINAS, RBA)\n' +
          '• Operação & Logística: "Status" (NF Emitida), "Status da Linha", "Tipo Frete", "Forma Pagamento", "Condição Pagamento", "Familia", "Descrição do PA", "Romaneio", "Transportadora"\n' +
          'Fonte de reconciliação: quem emitiu NF/faturou recentemente sai da fila de reativação com status "reativado".',
      )
      app.save(recFat)
    } catch (_) {}

    // 4. Salvar templates de mapeamento na coleção configuracoes (chave: 'templates_mapeamento_importacao')
    const cfgCol = app.findCollectionByNameOrId('configuracoes')
    let cfgRecord
    try {
      cfgRecord = app.findFirstRecordByData(
        'configuracoes',
        'chave',
        'templates_mapeamento_importacao',
      )
    } catch (_) {
      cfgRecord = new Record(cfgCol)
      cfgRecord.set('chave', 'templates_mapeamento_importacao')
    }

    const templates = [
      {
        id: 'template_clientes_inativos',
        nome: 'Clientes Inativos',
        tipo_base: 'clientes',
        descricao:
          'Layout da planilha de inativos do ERP com Código CXXXXXX, dias sem faturar e faixa',
        // Cabeçalhos assinatura para auto-detecção
        headers_assinatura: [
          'cód. cliente',
          'nome do cliente',
          'menor dias última venda',
          'faixa última compra',
        ],
        mapeamento: {
          codigo: 'Cód. Cliente',
          nome: 'Nome do Cliente',
          telefone: 'Celular',
          whatsapp: 'Celular',
          email: 'E-mail',
          regiao: 'Região',
          vendedor: 'Vendedor',
          segmento: 'Segmento',
          ultima_compra: 'Data Criação PN',
          valor_ultima_compra: 'Limite de Crédito',
          toneladas_historico: '',
          valor_historico: '',
          compras_count: '',
          pedido: '',
          dias_sem_faturar: 'Menor dias última venda',
          faixa: 'Faixa última compra',
          cidade: 'Cidade',
          estado_uf: 'Estado',
        },
      },
      {
        id: 'template_gestao_producao_faturamento',
        nome: 'Gestão da Produção — Faturamento',
        tipo_base: 'faturamento',
        descricao: 'Layout de faturamento, pedidos e notas fiscais para reconciliação automática',
        headers_assinatura: ['pedido', 'cliente', 'fat r$', 'data nota fiscal', 'canal'],
        mapeamento: {
          codigo: '',
          nome: 'Cliente',
          telefone: '',
          whatsapp: '',
          email: '',
          regiao: 'Região',
          vendedor: 'Vendedor',
          segmento: 'Familia',
          ultima_compra: 'Data Nota Fiscal',
          valor_ultima_compra: 'Fat R$',
          toneladas_historico: 'Peso NF',
          valor_historico: 'Total',
          compras_count: '',
          pedido: 'Pedido',
          cidade: 'Cidade',
          estado_uf: 'UF',
          nf: 'NF',
          canal: 'CanaL',
        },
      },
    ]

    cfgRecord.set('valor', templates)
    cfgRecord.set(
      'descricao',
      'Templates pré-configurados de mapeamento de planilhas para importação e reconciliação',
    )
    app.save(cfgRecord)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bases_referencia')
      const classField = col.fields.getByName('classificacao')
      if (classField) {
        classField.values = ['margem', 'clientes', 'outra']
        app.save(col)
      }
    } catch (_) {}
  },
)
