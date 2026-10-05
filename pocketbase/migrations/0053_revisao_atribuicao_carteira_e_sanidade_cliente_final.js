migrate(
  (app) => {
    // =========================================================================
    // 1. Atualizar registro da região POUSO ALEGRE na coleção 'regioes'
    // Garantir nome completo ou padronizado da Especialista para Rafaela Resende
    // =========================================================================
    try {
      const regiaoRec = app.findFirstRecordByData('regioes', 'nome', 'POUSO ALEGRE')
      if (regiaoRec) {
        regiaoRec.set('especialista', 'RAFAELA RESENDE')
        app.save(regiaoRec)
      }
    } catch (_) {}

    // =========================================================================
    // 2. Sanidade da Base Cliente Final (Item E):
    // Clientes comerciais (CNPJ com 14 dígitos, ou segmento comercial / razão social com LTDA/ME/EPP/DISTRIBUIDORA)
    // que caíram em 'cliente_final' por erro de parsing do documento (ex: documento não identificado ou cpf_cnpj vazio)
    // DEVEM voltar para base_categoria = 'normal' se NÃO foram desfechados como cliente final por atendimento manual.
    // =========================================================================
    const resComerciais = app
      .db()
      .newQuery(`
      UPDATE clientes
      SET base_categoria = 'normal'
      WHERE base_categoria = 'cliente_final'
        AND (
          motivo_ativo_fora_base IS NULL
          OR (
            motivo_ativo_fora_base NOT LIKE '%cliente_final%'
            AND motivo_ativo_fora_base NOT LIKE '%Cliente final%'
            AND motivo_ativo_fora_base NOT LIKE '%uso pessoal%'
          )
        )
        AND (
          (segmento IS NOT NULL AND segmento != '' AND LOWER(segmento) NOT LIKE '%cliente final%' AND LOWER(segmento) NOT LIKE '%consumidor%')
          OR LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '-', ''), '/', ''), ' ', '')) = 14
          OR UPPER(nome) LIKE '% LTDA%'
          OR UPPER(nome) LIKE '% S/A%'
          OR UPPER(nome) LIKE '% S.A.%'
          OR UPPER(nome) LIKE '% ME%'
          OR UPPER(nome) LIKE '% EPP%'
          OR UPPER(nome) LIKE '%DISTRIBUIDORA%'
          OR UPPER(nome) LIKE '%CONSTRUCOES%'
          OR UPPER(nome) LIKE '%COMERCIO%'
          OR UPPER(nome) LIKE '%SUPERMERCADO%'
          OR UPPER(nome) LIKE '%POSTO %'
          OR COALESCE(compras_count, 1) > 2
        )
    `)
      .execute()

    const linhasCorrigidasClienteFinal =
      resComerciais && resComerciais.rowsAffected ? resComerciais.rowsAffected() : 0

    // =========================================================================
    // 3. Recálculo em Lote da bandeira sem_dono_equipe (Item A e B):
    // Todo cliente cujo vendedor de origem casa com uma conta ativa da equipe
    // volta para sem_dono_equipe = 0 (false).
    // Casos específicos contemplados:
    // - Rafaela Resende / Rafaela em todas as variantes ("VARE - RAFAELA RESENDE", "VCORP - RAFAELA RESENDE", "RAFAELA")
    // - Nomes da equipe ativa no varejo e atacado:
    //   ALESSANDRO, LEIZ, HELOA, DYOVANA, JOSIANE, KAYLANE, PETERSON, BRUNA, THAIS,
    //   PAOLA, VITORIA, JOSE, FELIPE, MILENA, CAMILA, JENNIFER, GABRIELA, JESSICA,
    //   GUSTAVO, INAYARA, TAINARA, JULIANO, EDMILA, ARIANE, MATHEUS, JULIO, LARISSA,
    //   WILSON, PRISCILA, ANDERSON, RAFAELA
    // - Casamento por papel no mapa da região:
    //   POUSO ALEGRE: especialista = RAFAELA/RAFAELA RESENDE, vendedor_externo = PAOLA, corporativo = VITORIA
    // =========================================================================
    const resOrfaos = app
      .db()
      .newQuery(`
      UPDATE clientes
      SET sem_dono_equipe = 0
      WHERE sem_dono_equipe = 1
        AND (
          UPPER(COALESCE(vendedor, '')) LIKE '%RAFAELA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%BRUNA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%PETERSON%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%THAIS%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%ALESSANDRO%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%LEIZ%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%HELOA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%DYOVANA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JOSIANE%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%KAYLANE%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%PAOLA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%VITORIA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JOSE%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JOSÉ%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%FELIPE%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%MILENA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%CAMILA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JENNIFER%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%GABRIELA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JESSICA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JÉSSICA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%GUSTAVO%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%INAYARA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%TAINARA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JULIANO%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%EDMILA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%ARIANE%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%MATHEUS%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%JULIO%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%LARISSA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%WILSON%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%PRISCILA%'
          OR UPPER(COALESCE(vendedor, '')) LIKE '%ANDERSON%'
          OR (regiao = 'POUSO ALEGRE' AND UPPER(COALESCE(tipo_vendedor, '')) = 'ESPECIALISTA')
          OR (regiao = 'POUSO ALEGRE' AND UPPER(COALESCE(tipo_vendedor, '')) = 'VARE')
          OR (regiao = 'POUSO ALEGRE' AND UPPER(COALESCE(tipo_vendedor, '')) = 'VCORP')
        )
    `)
      .execute()

    const linhasRecuperadasOrfaos =
      resOrfaos && resOrfaos.rowsAffected ? resOrfaos.rowsAffected() : 0

    // =========================================================================
    // 4. Auditoria do evento
    // =========================================================================
    try {
      const colEv = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEv)
      ev.set('acao', 'revisao_atribuicao_e_sanidade_concluida')
      ev.set('detalhes', {
        executado_em: new Date().toISOString(),
        linhas_corrigidas_cliente_final: linhasCorrigidasClienteFinal,
        linhas_recuperadas_orfaos: linhasRecuperadasOrfaos,
      })
      app.save(ev)
    } catch (_) {}
  },
  (app) => {
    // Rollback não-destrutivo
  },
)
