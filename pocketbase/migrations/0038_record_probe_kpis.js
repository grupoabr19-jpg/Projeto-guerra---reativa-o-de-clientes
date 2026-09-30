/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const baseFilterSql =
      "estado != 'ativo_fora_base' AND (ativo_fora_base IS NULL OR ativo_fora_base = 0)"

    const kpisQuery = `
      SELECT
        COUNT(*) as total_base,
        SUM(CASE WHEN estado = 'na_base' THEN 1 ELSE 0 END) as na_base,
        SUM(CASE WHEN estado = 'reservado' THEN 1 ELSE 0 END) as reservado,
        SUM(CASE WHEN estado = 'em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
        SUM(CASE WHEN estado = 'reagendado' THEN 1 ELSE 0 END) as reagendado,
        SUM(CASE WHEN estado = 'contatado' THEN 1 ELSE 0 END) as contatado,
        SUM(CASE WHEN estado = 'reativado' THEN 1 ELSE 0 END) as reativado,
        SUM(CASE WHEN estado = 'compra_terceiros' THEN 1 ELSE 0 END) as compra_terceiros,
        SUM(CASE WHEN estado = 'nao_quer_negociar' THEN 1 ELSE 0 END) as nao_quer_negociar,
        SUM(CASE WHEN estado = 'sem_contato' THEN 1 ELSE 0 END) as sem_contato,
        SUM(CASE WHEN estado = 'reativado' THEN COALESCE(valor_ultima_compra, 0) ELSE 0 END) as valor_recuperado,
        SUM(CASE WHEN estado = 'reativado' THEN COALESCE(toneladas_historico, 0) ELSE 0 END) as toneladas_recuperadas
      FROM clientes
      WHERE ${baseFilterSql}
    `

    const kpiModel = new DynamicModel({
      total_base: 0,
      na_base: 0,
      reservado: 0,
      em_atendimento: 0,
      reagendado: 0,
      contatado: 0,
      reativado: 0,
      compra_terceiros: 0,
      nao_quer_negociar: 0,
      sem_contato: 0,
      valor_recuperado: -0,
      toneladas_recuperadas: -0,
    })

    app.db().newQuery(kpisQuery).one(kpiModel)

    const total = Number(kpiModel.total_base || kpiModel.totalBase || 0)
    const naBase = Number(kpiModel.na_base || kpiModel.naBase || 0)
    const reservado = Number(kpiModel.reservado || 0)

    const confCol = app.findCollectionByNameOrId('configuracoes')
    let rec
    try {
      rec = app.findFirstRecordByData('configuracoes', 'chave', 'kpis_probe_result')
    } catch (_) {
      rec = new Record(confCol)
      rec.set('chave', 'kpis_probe_result')
    }
    rec.set('valor', {
      totalBase: total,
      naBase: naBase,
      reservado: reservado,
      naFila: naBase + reservado,
      rawFields: {
        total_base: kpiModel.total_base,
        totalBase: kpiModel.totalBase,
        na_base: kpiModel.na_base,
        naBase: kpiModel.naBase,
      },
    })
    rec.set('descricao', 'Resultado do teste de KPIs reais para verificação')
    app.save(rec)
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByData('configuracoes', 'chave', 'kpis_probe_result')
      app.delete(rec)
    } catch (_) {}
  },
)
