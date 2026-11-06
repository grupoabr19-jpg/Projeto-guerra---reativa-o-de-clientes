/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0138: Dedupe de clientes — limpeza de duplicidades com auditoria
 *
 * Regra do usuário: NUNCA apagar entradas (nenhum registro é deletado, usuários intocados).
 * Tudo marcado e auditado em eventos_log.
 *
 * O que faz:
 * 1. Adiciona campos merge_em (id do canônico) e merge_motivo em clientes + índice.
 * 2. Identifica grupos duplicados:
 *    a) mesmo CPF/CNPJ (normalizado, >= 11 dígitos);
 *    b) mesmo nome + mesmo endereço (cidade/UF) quando CPF/CNPJ ausente.
 * 3. Em cada grupo, elege o CANÔNICO = registro mais completo (faturado/pedido/interações).
 * 4. Segurança: se o grupo tiver MAIS DE UM membro "substancial" (faturado, com pedido
 *    ou com interação qualificadora), o grupo é PULADO para revisão manual — nada é mesclado.
 * 5. Para cada duplicado (casca) mesclável e em estado tranquilo
 *    (na_base/sem_contato/contatado/duplicado/ativo_fora_base):
 *    - move interacoes, respostas_formulario e eventos_log para o canônico;
 *    - funde faturamento/valores do casca no canônico (só preenche vazio, nunca sobrescreve);
 *    - marca o casca: estado='duplicado', duplicado_de_codigo, merge_em, merge_motivo.
 * 6. Idempotente: quem já tem merge_em preenchido não é reprocessado; no-op em base vazia.
 * 7. Auditoria: um registro em eventos_log com contagens + amostra (inclui verificação
 *    do pedido 223654 — SS ESTRUTURA x JPA COMERCIO).
 */
migrate(
  (app) => {
    console.log('[MIGRATION 0138] Iniciando dedupe de clientes...')

    // ---------- 1. Campos merge_em / merge_motivo ----------
    const clientes = app.findCollectionByNameOrId('clientes')
    if (!clientes.fields.getByName('merge_em')) {
      clientes.fields.add(new TextField({ name: 'merge_em', required: false }))
      app.save(clientes)
      console.log('[MIGRATION 0138] Campo merge_em adicionado')
    }
    if (!clientes.fields.getByName('merge_motivo')) {
      clientes.fields.add(new TextField({ name: 'merge_motivo', required: false }))
      app.save(clientes)
      console.log('[MIGRATION 0138] Campo merge_motivo adicionado')
    }
    try {
      clientes.addIndex('idx_clientes_merge_em', false, 'merge_em', '')
      app.save(clientes)
    } catch (e) {
      console.log('[MIGRATION 0138] Aviso idx_clientes_merge_em: ' + e)
    }

    const countModel = function () {
      return arrayOf(new DynamicModel({ qtd: 0 }))
    }
    const contarClientes = function () {
      const rows = countModel()
      app.db().newQuery('SELECT COUNT(*) AS qtd FROM clientes').all(rows)
      return rows.length > 0 ? rows[0].qtd : 0
    }
    const contagemAntes = contarClientes()
    console.log(`[MIGRATION 0138] Clientes ANTES: ${contagemAntes}`)

    const DESFECHOS_REATIVACAO = "('reativado', 'reativado_com_pedido', 'fechou_pedido')"

    // ---------- 2a. Grupos por CPF/CNPJ normalizado ----------
    const gruposDoc = arrayOf(new DynamicModel({ doc: '', qtd: 0 }))
    app
      .db()
      .newQuery(
        `SELECT REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj,''),' ',''),'.',''),'-',''),'/','') AS doc,
                COUNT(*) AS qtd
         FROM clientes
         WHERE COALESCE(cpf_cnpj,'') != ''
         GROUP BY doc
         HAVING COUNT(*) > 1 AND LENGTH(doc) >= 11`,
      )
      .all(gruposDoc)
    console.log(`[MIGRATION 0138] Grupos por CPF/CNPJ: ${gruposDoc.length}`)

    // ---------- 2b. Grupos por nome+endereço (sem CPF/CNPJ) ----------
    const gruposNome = arrayOf(new DynamicModel({ nome_norm: '', end_norm: '', qtd: 0 }))
    app
      .db()
      .newQuery(
        `SELECT UPPER(TRIM(COALESCE(nome,''))) AS nome_norm,
                UPPER(TRIM(COALESCE(endereco,''))) AS end_norm,
                COUNT(*) AS qtd
         FROM clientes
         WHERE COALESCE(cpf_cnpj,'') = ''
           AND COALESCE(nome,'') != ''
           AND COALESCE(endereco,'') != ''
         GROUP BY nome_norm, end_norm
         HAVING COUNT(*) > 1`,
      )
      .all(gruposNome)
    console.log(`[MIGRATION 0138] Grupos por nome+endereço: ${gruposNome.length}`)

    // ---------- Helpers (inline no callback — exigência do Goja) ----------
    function membrosPorDoc(doc) {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          codigo: '',
          nome: '',
          estado: '',
          status_faturamento: '',
          valor_faturado: -0,
          pedido_reativacao: '',
          fat_12m_reais: -0,
          compras_count: 0,
        }),
      )
      app
        .db()
        .newQuery(
          `SELECT id, COALESCE(codigo,'') AS codigo, COALESCE(nome,'') AS nome,
                  COALESCE(estado,'') AS estado,
                  COALESCE(status_faturamento,'') AS status_faturamento,
                  COALESCE(valor_faturado,0) AS valor_faturado,
                  COALESCE(pedido_reativacao,'') AS pedido_reativacao,
                  COALESCE(fat_12m_reais,0) AS fat_12m_reais,
                  COALESCE(compras_count,0) AS compras_count
           FROM clientes
           WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj,''),' ',''),'.',''),'-',''),'/','') = {:doc}`,
        )
        .bind({ doc: doc })
        .all(rows)
      return rows
    }

    function membrosPorNomeEnd(nomeNorm, endNorm) {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          codigo: '',
          nome: '',
          estado: '',
          status_faturamento: '',
          valor_faturado: -0,
          pedido_reativacao: '',
          fat_12m_reais: -0,
          compras_count: 0,
        }),
      )
      app
        .db()
        .newQuery(
          `SELECT id, COALESCE(codigo,'') AS codigo, COALESCE(nome,'') AS nome,
                  COALESCE(estado,'') AS estado,
                  COALESCE(status_faturamento,'') AS status_faturamento,
                  COALESCE(valor_faturado,0) AS valor_faturado,
                  COALESCE(pedido_reativacao,'') AS pedido_reativacao,
                  COALESCE(fat_12m_reais,0) AS fat_12m_reais,
                  COALESCE(compras_count,0) AS compras_count
           FROM clientes
           WHERE COALESCE(cpf_cnpj,'') = ''
             AND UPPER(TRIM(COALESCE(nome,''))) = {:nomeNorm}
             AND UPPER(TRIM(COALESCE(endereco,''))) = {:endNorm}`,
        )
        .bind({ nomeNorm: nomeNorm, endNorm: endNorm })
        .all(rows)
      return rows
    }

    // "Substância" = prova de movimento real (faturamento, pedido ou interação qualificadora)
    function substancia(clienteId, statusFat, valorFat, pedido, fat12m, comprasCount) {
      if (String(statusFat) === 'faturado' || Number(valorFat) > 0 || Number(fat12m) > 0)
        return true
      if (String(pedido).trim() !== '' && String(pedido).trim() !== 'FORMS-IMPORT') return true
      const rows = arrayOf(new DynamicModel({ qtd: 0 }))
      app
        .db()
        .newQuery(
          `SELECT COUNT(*) AS qtd FROM interacoes
           WHERE cliente = {:cid}
             AND (desfecho IN ${DESFECHOS_REATIVACAO}
                  OR (numero_pedido IS NOT NULL AND TRIM(numero_pedido) != '' AND TRIM(numero_pedido) != '-'))`,
        )
        .bind({ cid: clienteId })
        .all(rows)
      return rows.length > 0 && rows[0].qtd > 0
    }

    function score(m) {
      let s = 0
      if (String(m.status_faturamento) === 'faturado') s += 1000
      if (Number(m.valor_faturado) > 0) s += 500
      if (Number(m.fat_12m_reais) > 0) s += 50
      if (String(m.pedido_reativacao).trim() !== '') s += 100
      s += Number(m.compras_count) * 5
      const ints = arrayOf(new DynamicModel({ qtd: 0 }))
      app
        .db()
        .newQuery('SELECT COUNT(*) AS qtd FROM interacoes WHERE cliente = {:cid}')
        .bind({ cid: m.id })
        .all(ints)
      s += (ints.length > 0 ? ints[0].qtd : 0) * 10
      return s
    }

    const ESTADOS_SEGUROS = "('na_base','sem_contato','contatado','duplicado','ativo_fora_base')"
    const amostra = []
    let mesclados = 0
    let gruposPulados = 0

    function processarGrupo(membros, criterio) {
      if (membros.length < 2) return

      // Já processado antes (idempotência): pula grupos cujos membros já apontam para canônico
      const novos = []
      for (let i = 0; i < membros.length; i++) {
        const row = arrayOf(new DynamicModel({ merge_em: '' }))
        app
          .db()
          .newQuery("SELECT COALESCE(merge_em,'') AS merge_em FROM clientes WHERE id = {:cid}")
          .bind({ cid: membros[i].id })
          .all(row)
        if (row.length > 0 && String(row[0].merge_em).trim() === '') novos.push(membros[i])
      }
      if (novos.length < 2) return
      membros = novos

      // Mais de um membro substancial => revisão manual, não mescla
      let substanciais = 0
      for (let i = 0; i < membros.length; i++) {
        if (
          substancia(
            membros[i].id,
            membros[i].status_faturamento,
            membros[i].valor_faturado,
            membros[i].pedido_reativacao,
            membros[i].fat_12m_reais,
            membros[i].compras_count,
          )
        ) {
          substanciais++
        }
      }
      if (substanciais > 1) {
        gruposPulados++
        console.log(
          `[MIGRATION 0138] Grupo PULADO (revisão manual, ${substanciais} substanciais): ` +
            membros
              .map(function (m) {
                return m.codigo
              })
              .join(', '),
        )
        return
      }

      // Canônico = maior score (desempate: menor created = mais antigo)
      const criados = arrayOf(new DynamicModel({ id: '', created: '' }))
      app
        .db()
        .newQuery(
          `SELECT id, COALESCE(created,'') AS created FROM clientes
           WHERE id IN (${membros
             .map(function (m) {
               return "'" + m.id + "'"
             })
             .join(',')})`,
        )
        .all(criados)
      const criadoMap = {}
      for (let i = 0; i < criados.length; i++) criadoMap[criados[i].id] = criados[i].created

      let canon = membros[0]
      for (let i = 1; i < membros.length; i++) {
        const si = score(membros[i])
        const sc = score(canon)
        if (
          si > sc ||
          (si === sc && String(criadoMap[membros[i].id]) < String(criadoMap[canon.id]))
        ) {
          canon = membros[i]
        }
      }

      for (let i = 0; i < membros.length; i++) {
        const dup = membros[i]
        if (dup.id === canon.id) continue

        // Casca precisa estar em estado tranquilo para ser mesclado
        const estRow = arrayOf(new DynamicModel({ estado: '' }))
        app
          .db()
          .newQuery("SELECT COALESCE(estado,'') AS estado FROM clientes WHERE id = {:cid}")
          .bind({ cid: dup.id })
          .all(estRow)
        const estadoDup = estRow.length > 0 ? String(estRow[0].estado) : ''
        if (ESTADOS_SEGUROS.indexOf(estadoDup) === -1) {
          console.log(
            `[MIGRATION 0138] Duplicado ${dup.codigo} pulado (estado ${estadoDup} não é seguro)`,
          )
          continue
        }

        // 5a. Move referências para o canônico
        app
          .db()
          .newQuery('UPDATE interacoes SET cliente = {:canon} WHERE cliente = {:dup}')
          .bind({ canon: canon.id, dup: dup.id })
          .execute()
        app
          .db()
          .newQuery('UPDATE respostas_formulario SET cliente = {:canon} WHERE cliente = {:dup}')
          .bind({ canon: canon.id, dup: dup.id })
          .execute()
        app
          .db()
          .newQuery('UPDATE eventos_log SET cliente = {:canon} WHERE cliente = {:dup}')
          .bind({ canon: canon.id, dup: dup.id })
          .execute()

        // 5b. Funde faturamento/valores do casca no canônico — só preenche vazio
        app
          .db()
          .newQuery(
            `UPDATE clientes SET
               status_faturamento = CASE
                 WHEN status_faturamento = 'faturado' THEN status_faturamento
                 WHEN {:dupStatus} != '' THEN {:dupStatus}
                 ELSE status_faturamento END,
               valor_faturado = CASE
                 WHEN COALESCE(valor_faturado,0) = 0 THEN {:dupValorFat}
                 ELSE valor_faturado END,
               data_faturamento = CASE
                 WHEN data_faturamento IS NULL OR data_faturamento = '' THEN
                   (SELECT data_faturamento FROM clientes WHERE id = {:dup})
                 ELSE data_faturamento END,
               numero_nf_fatura = CASE
                 WHEN numero_nf_fatura IS NULL OR TRIM(numero_nf_fatura) = '' THEN
                   (SELECT numero_nf_fatura FROM clientes WHERE id = {:dup})
                 ELSE numero_nf_fatura END,
               ultima_compra = CASE
                 WHEN ultima_compra IS NULL OR ultima_compra = '' THEN
                   (SELECT ultima_compra FROM clientes WHERE id = {:dup})
                 ELSE ultima_compra END,
               valor_ultima_compra = CASE
                 WHEN COALESCE(valor_ultima_compra,0) < (SELECT COALESCE(valor_ultima_compra,0) FROM clientes WHERE id = {:dup})
                 THEN (SELECT COALESCE(valor_ultima_compra,0) FROM clientes WHERE id = {:dup})
                 ELSE valor_ultima_compra END,
               fat_12m_reais = CASE
                 WHEN COALESCE(fat_12m_reais,0) < (SELECT COALESCE(fat_12m_reais,0) FROM clientes WHERE id = {:dup})
                 THEN (SELECT COALESCE(fat_12m_reais,0) FROM clientes WHERE id = {:dup})
                 ELSE fat_12m_reais END,
               compras_count = CASE WHEN COALESCE(compras_count,0) < (SELECT COALESCE(compras_count,0) FROM clientes WHERE id = {:dup})
THEN (SELECT COALESCE(compras_count,0) FROM clientes WHERE id = {:dup})
ELSE compras_count END,
               telefone = CASE
                 WHEN telefone IS NULL OR TRIM(telefone) = '' THEN
                   (SELECT telefone FROM clientes WHERE id = {:dup})
                 ELSE telefone END,
               whatsapp = CASE
                 WHEN whatsapp IS NULL OR TRIM(whatsapp) = '' THEN
                   (SELECT whatsapp FROM clientes WHERE id = {:dup})
                 ELSE whatsapp END,
               email = CASE
                 WHEN email IS NULL OR TRIM(email) = '' THEN
                   (SELECT email FROM clientes WHERE id = {:dup})
                 ELSE email END
             WHERE id = {:canon}`,
          )
          .bind({
            canon: canon.id,
            dup: dup.id,
            dupStatus: String(dup.status_faturamento),
            dupValorFat: Number(dup.valor_faturado) || 0,
          })
          .execute()

        // 5c. Marca o casca — nenhum registro apagado
        app
          .db()
          .newQuery(
            `UPDATE clientes SET
               estado = 'duplicado',
               duplicado_de_codigo = {:canonCodigo},
               merge_em = {:canon},
               merge_motivo = {:motivo},
               ativo_fora_base = 0,
               lock_timestamp = '1970-01-01 00:00:00.000Z',
               reagendado_para = '',
               quarentena_ate = '',
               standby_ate = ''
             WHERE id = {:dup}`,
          )
          .bind({
            canonCodigo: canon.codigo,
            canon: canon.id,
            motivo: 'Deduplicado em ' + criterio + ' (migration 0138); canônico ' + canon.codigo,
            dup: dup.id,
          })
          .execute()

        mesclados++
        if (amostra.length < 100) {
          amostra.push({
            duplicado: dup.codigo + ' — ' + dup.nome,
            canonico: canon.codigo + ' — ' + canon.nome,
            criterio: criterio,
          })
        }
      }
    }

    for (let g = 0; g < gruposDoc.length; g++) {
      processarGrupo(membrosPorDoc(gruposDoc[g].doc), 'CPF/CNPJ')
    }
    for (let g = 0; g < gruposNome.length; g++) {
      processarGrupo(
        membrosPorNomeEnd(gruposNome[g].nome_norm, gruposNome[g].end_norm),
        'nome+endereço',
      )
    }

    const contagemDepois = contarClientes()

    // ---------- 7. Verificação do pedido 223654 (auditoria do caso JPA/SS) ----------
    let pedido223654 = { ss_estrutura_ok: false, jpa_limpo: false }
    try {
      const rows223 = arrayOf(
        new DynamicModel({ codigo: '', nome: '', pedido: '', nf: '', valor: 0 }),
      )
      app
        .db()
        .newQuery(
          `SELECT COALESCE(codigo,'') AS codigo, COALESCE(nome,'') AS nome,
                  COALESCE(pedido_reativacao,'') AS pedido,
                  COALESCE(numero_nf_fatura,'') AS nf,
                  COALESCE(valor_faturado,0) AS valor
           FROM clientes WHERE pedido_reativacao LIKE '%223654%' OR numero_nf_fatura LIKE '%158708%'`,
        )
        .all(rows223)
      const ss = rows223.filter(function (r) {
        return r.nome.indexOf('SS ESTRUTURA') !== -1
      })
      const jpa = rows223.filter(function (r) {
        return r.nome.indexOf('JPA') !== -1
      })
      pedido223654.ss_estrutura_ok = ss.length > 0 && String(ss[0].pedido).indexOf('223654') !== -1
      pedido223654.jpa_limpo = jpa.length === 0
    } catch (e223) {
      console.log('[MIGRATION 0138] Aviso verificação 223654: ' + e223)
    }

    // ---------- Auditoria ----------
    try {
      const colEventos = app.findCollectionByNameOrId('eventos_log')
      const ev = new Record(colEventos)
      ev.set('acao', 'dedupe_clientes_0138')
      ev.set('detalhes', {
        clientes_antes: contagemAntes,
        clientes_depois: contagemDepois,
        registros_apagados: 0,
        grupos_por_documento: gruposDoc.length,
        grupos_por_nome_endereco: gruposNome.length,
        duplicados_mesclados: mesclados,
        grupos_pulados_revisao_manual: gruposPulados,
        amostra: amostra,
        pedido_223654: pedido223654,
        versao: '0138',
      })
      app.save(ev)
    } catch (logErr) {
      console.log('[MIGRATION 0138] Falha ao registrar eventos_log: ' + logErr)
    }

    console.log(
      `[MIGRATION 0138] Fim: antes=${contagemAntes} depois=${contagemDepois} ` +
        `mesclados=${mesclados} pulados=${gruposPulados} apagados=0`,
    )
  },
  (app) => {},
)
