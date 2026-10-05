migrate(
  (app) => {
    // 1. Operadores a auditar com suas respectivas regiões e regras de filtro
    const operadores = [
      { nome: 'Rafaela Resende', regiao: 'POUSO ALEGRE', matchName: 'RAFAELA' },
      { nome: 'Bruna Pereira', regiao: 'VARGINHA', matchName: 'BRUNA' },
      { nome: 'Peterson Seixas', regiao: 'VARGINHA', matchName: 'PETERSON' },
      { nome: 'Thais Oliveira', regiao: 'VARGINHA', matchName: 'THAIS' },
      { nome: 'Alessandro Farias (Japa)', regiao: 'BRAGANÇA', matchName: 'ALESSANDRO' },
      { nome: 'Leiz Torso', regiao: 'BRAGANÇA', matchName: 'LEIZ' },
      { nome: 'Heloá Leite', regiao: 'BRAGANÇA', matchName: 'HELOA' },
      { nome: 'Dyovana Silva', regiao: 'JUNDIAÍ', matchName: 'DYOVANA' },
      { nome: 'Josiane Lima', regiao: 'JUNDIAÍ', matchName: 'JOSIANE' },
      { nome: 'Kaylane Silva', regiao: 'JUNDIAÍ', matchName: 'KAYLANE' },
      { nome: 'Paola Santos', regiao: 'POUSO ALEGRE', matchName: 'PAOLA' },
      { nome: 'Vitoria Tavares', regiao: 'POUSO ALEGRE', matchName: 'VITORIA' },
      { nome: 'José Felipe', regiao: 'POÇOS DE CALDAS', matchName: 'JOSE' },
      { nome: 'Camila Guimenti', regiao: 'POÇOS DE CALDAS', matchName: 'CAMILA' },
      { nome: 'Milena Vaz', regiao: 'POÇOS DE CALDAS', matchName: 'MILENA' },
      { nome: 'Jennifer Silva', regiao: 'ITAJUBÁ', matchName: 'JENNIFER' },
      { nome: 'Gabriela Cunha', regiao: 'ITAJUBÁ', matchName: 'GABRIELA' },
      { nome: 'Jéssica Santos', regiao: 'ITAJUBÁ', matchName: 'JESSICA' },
      { nome: 'Gustavo Araujo', regiao: 'EXTREMA', matchName: 'GUSTAVO' },
      { nome: 'Inayara Cunha', regiao: 'EXTREMA', matchName: 'INAYARA' },
      { nome: 'Tainara Matilde', regiao: 'EXTREMA', matchName: 'TAINARA' },
      { nome: 'Juliano Pereira', regiao: 'CAMBUÍ', matchName: 'JULIANO' },
      { nome: 'Edmila Melo', regiao: 'CAMBUÍ', matchName: 'EDMILA' },
      { nome: 'Ariane Souza', regiao: 'CAMBUÍ', matchName: 'ARIANE' },
      { nome: 'Matheus Teixeira', regiao: 'CAMBUÍ', matchName: 'MATHEUS' },
      { nome: 'Larissa Terra', regiao: 'ATACADO', ddds: ['11', '12', '13'] },
      { nome: 'Julio Melo', regiao: 'ATACADO', ddds: ['15', '19'] },
      { nome: 'Wilson Neto', regiao: 'ATACADO', ddds: ['14', '16', '17', '18'] },
      { nome: 'Priscila Faria', regiao: 'REPESCAGEM', repescagem: true },
    ]

    const resultados = []

    for (let i = 0; i < operadores.length; i++) {
      const op = operadores[i]
      let count60_89 = 0
      let count90_plus = 0

      if (op.repescagem) {
        const row90 = new DynamicModel({ total: 0 })
        app
          .db()
          .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE estado = 'na_base'
            AND telefone_invalido != 1
            AND ativo_fora_base != 1
            AND base_categoria != 'cliente_final'
            AND base_categoria != 'atacado_fora_mapa'
            AND (faixa = '90_plus' OR dias_sem_faturar >= 90)
        `)
          .one(row90)
        count90_plus = row90.total || 0
      } else if (op.regiao === 'ATACADO') {
        const dddList = op.ddds.map((d) => `'${d}'`).join(',')
        const row60 = new DynamicModel({ total: 0 })
        app
          .db()
          .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE regiao = 'ATACADO'
            AND estado = 'na_base'
            AND telefone_invalido != 1
            AND ativo_fora_base != 1
            AND base_categoria = 'normal'
            AND (faixa = '60_89' OR (dias_sem_faturar >= 60 AND dias_sem_faturar <= 89))
            AND ddd_telefone IN (${dddList})
        `)
          .one(row60)
        count60_89 = row60.total || 0

        const row90 = new DynamicModel({ total: 0 })
        app
          .db()
          .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE regiao = 'ATACADO'
            AND estado = 'na_base'
            AND telefone_invalido != 1
            AND ativo_fora_base != 1
            AND base_categoria = 'normal'
            AND (faixa = '90_plus' OR dias_sem_faturar >= 90)
            AND ddd_telefone IN (${dddList})
        `)
          .one(row90)
        count90_plus = row90.total || 0
      } else {
        const regLike = `%${op.regiao}%`
        const vendLike = `%${op.matchName}%`

        const row60 = new DynamicModel({ total: 0 })
        app
          .db()
          .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE UPPER(regiao) LIKE {:reg}
            AND UPPER(vendedor) LIKE {:vend}
            AND estado = 'na_base'
            AND telefone_invalido != 1
            AND ativo_fora_base != 1
            AND base_categoria = 'normal'
            AND sem_dono_equipe != 1
            AND (faixa = '60_89' OR (dias_sem_faturar >= 60 AND dias_sem_faturar <= 89))
        `)
          .bind({ reg: regLike, vend: vendLike })
          .one(row60)
        count60_89 = row60.total || 0

        const row90 = new DynamicModel({ total: 0 })
        app
          .db()
          .newQuery(`
          SELECT COUNT(*) as total
          FROM clientes
          WHERE UPPER(regiao) LIKE {:reg}
            AND UPPER(vendedor) LIKE {:vend}
            AND estado = 'na_base'
            AND telefone_invalido != 1
            AND ativo_fora_base != 1
            AND base_categoria = 'normal'
            AND sem_dono_equipe != 1
            AND (faixa = '90_plus' OR dias_sem_faturar >= 90)
        `)
          .bind({ reg: regLike, vend: vendLike })
          .one(row90)
        count90_plus = row90.total || 0
      }

      resultados.push({
        operador: op.nome,
        regiao: op.regiao,
        faixa_60_89: count60_89,
        faixa_90_plus: count90_plus,
        total_carteira: count60_89 + count90_plus,
      })
    }

    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'auditoria_carteiras_operadores')
      ev.set('detalhes', {
        executado_em: new Date().toISOString(),
        resultados: resultados,
      })
      app.save(ev)
    } catch (_) {}
  },
  (app) => {},
)
