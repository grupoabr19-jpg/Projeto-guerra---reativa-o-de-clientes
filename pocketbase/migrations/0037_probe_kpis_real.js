/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Probe real counts and DynamicModel output from base-kpis
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

    console.log(
      '[PROBE_KPIS] total_base=' +
        kpiModel.total_base +
        ' totalBase=' +
        kpiModel.totalBase +
        ' na_base=' +
        kpiModel.na_base +
        ' naBase=' +
        kpiModel.naBase +
        ' reservado=' +
        kpiModel.reservado,
    )
  },
  (app) => {},
)
