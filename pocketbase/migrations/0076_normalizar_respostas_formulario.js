/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Normalização das respostas das perguntas que antes eram texto livre (Q7, Q8, Q10)
    // para as opções padronizadas com fallback para "Outros: <texto>"
    try {
      const normalizarQ7 = (texto) => {
        if (!texto) return ''
        const t = String(texto).trim().toLowerCase()
        if (
          t === 'nenhum' ||
          t === 'nenhuma' ||
          t === 'não informado' ||
          t === 'nao informado' ||
          t === 'n/a' ||
          t === 'nao' ||
          t === 'não' ||
          t === '-' ||
          t === 'sem concorrente' ||
          t === 'nenhum concorrente'
        ) {
          return 'Nenhum / Não informado'
        }
        if (t.includes('distribuidor') || t.includes('distribuidora')) {
          return 'Distribuidores Locais'
        }
        if (
          t.includes('loja') ||
          t.includes('deposito') ||
          t.includes('depósito') ||
          t.includes('material de construcao') ||
          t.includes('material de construção') ||
          t.includes('varejo')
        ) {
          return 'Lojas de Materiais de Construção / Varejo'
        }
        if (
          t.includes('direto da usina') ||
          t.includes('usina') ||
          t.includes('arcelor') ||
          t.includes('gerdau') ||
          t.includes('csn')
        ) {
          return 'Direto de Usina / Siderúrgica'
        }
        if (
          t.includes('serralheria') ||
          t.includes('serralheiro') ||
          t.includes('calheiro') ||
          t.includes('transformador')
        ) {
          return 'Serralherias / Transformadores Regionais'
        }
        if (
          t.includes('internet') ||
          t.includes('online') ||
          t.includes('site') ||
          t.includes('mercado livre')
        ) {
          return 'Internet / Plataformas Online'
        }
        if (t.includes('terceiro') || t.includes('outra empresa') || t.includes('concorrente')) {
          return 'Outros Concorrentes Regionais'
        }
        // Se já for uma opção exata
        const opcoesExatas = [
          'Nenhum / Não informado',
          'Distribuidores Locais',
          'Lojas de Materiais de Construção / Varejo',
          'Direto de Usina / Siderúrgica',
          'Serralherias / Transformadores Regionais',
          'Internet / Plataformas Online',
          'Outros Concorrentes Regionais',
        ]
        if (opcoesExatas.includes(String(texto).trim())) {
          return String(texto).trim()
        }
        return `Outros: ${String(texto).trim()}`
      }

      const normalizarQ8 = (texto) => {
        if (!texto) return ''
        const t = String(texto).trim().toLowerCase()
        if (
          t.includes('nenhum') ||
          t.includes('sem erro') ||
          t.includes('sem problema') ||
          t.includes('tudo ok') ||
          t.includes('não houve') ||
          t.includes('nao houve') ||
          t === 'n/a' ||
          t === 'não' ||
          t === 'nao' ||
          t === '-'
        ) {
          return 'Nenhum erro relatado no histórico recente'
        }
        if (
          t.includes('atraso') ||
          t.includes('entrega') ||
          t.includes('prazo') ||
          t.includes('demora')
        ) {
          return 'Atraso na entrega do pedido'
        }
        if (
          t.includes('qualidade') ||
          t.includes('material') ||
          t.includes('oxida') ||
          t.includes('ferrugem') ||
          t.includes('defeito') ||
          t.includes('lote')
        ) {
          return 'Qualidade / especificações divergentes ou avaria no material'
        }
        if (
          t.includes('nota') ||
          t.includes('boleto') ||
          t.includes('fatura') ||
          t.includes('fiscal') ||
          t.includes('faturamento') ||
          t.includes('preco errado') ||
          t.includes('preço errado') ||
          t.includes('cobranca') ||
          t.includes('cobrança')
        ) {
          return 'Divergência de faturamento, nota fiscal ou boleto'
        }
        if (
          t.includes('falta') ||
          t.includes('item') ||
          t.includes('incompleto') ||
          t.includes('material errado') ||
          t.includes('veio errado')
        ) {
          return 'Envio de material incompleto ou divergente do pedido'
        }
        if (
          t.includes('atendimento') ||
          t.includes('comunicacao') ||
          t.includes('comunicação') ||
          t.includes('vendedor') ||
          t.includes('retorno')
        ) {
          return 'Problema no atendimento comercial ou falta de retorno'
        }
        const opcoesExatas = [
          'Nenhum erro relatado no histórico recente',
          'Atraso na entrega do pedido',
          'Qualidade / especificações divergentes ou avaria no material',
          'Divergência de faturamento, nota fiscal ou boleto',
          'Envio de material incompleto ou divergente do pedido',
          'Problema no atendimento comercial ou falta de retorno',
        ]
        if (opcoesExatas.includes(String(texto).trim())) {
          return String(texto).trim()
        }
        return `Outros: ${String(texto).trim()}`
      }

      const normalizarQ10 = (texto) => {
        if (!texto) return ''
        const t = String(texto).trim().toLowerCase()
        if (
          t.includes('sem necessidade') ||
          t.includes('nenhum') ||
          t.includes('nao precisa') ||
          t.includes('não precisa') ||
          t === 'n/a' ||
          t === 'não' ||
          t === 'nao' ||
          t === '-'
        ) {
          return 'Sem necessidade de ação reparatória'
        }
        if (
          t.includes('desconto') ||
          t.includes('preco') ||
          t.includes('preço') ||
          t.includes('condicao') ||
          t.includes('condição') ||
          t.includes('margem')
        ) {
          return 'Concessão de desconto comercial especial na próxima compra'
        }
        if (
          t.includes('prazo') ||
          t.includes('pagamento') ||
          t.includes('boleto') ||
          t.includes('parcel')
        ) {
          return 'Ampliação de prazo de pagamento / novas condições no boleto'
        }
        if (
          t.includes('troca') ||
          t.includes('bonific') ||
          t.includes('reposi') ||
          t.includes('devolu')
        ) {
          return 'Bonificação, reposição de lote ou troca de material'
        }
        if (
          t.includes('visita') ||
          t.includes('tecnic') ||
          t.includes('técnic') ||
          t.includes('representante') ||
          t.includes('reuniao') ||
          t.includes('reunião')
        ) {
          return 'Visita presencial do representante / suporte técnico'
        }
        if (
          t.includes('prioridade') ||
          t.includes('frete') ||
          t.includes('rapido') ||
          t.includes('rápido') ||
          t.includes('urgencia') ||
          t.includes('urgência')
        ) {
          return 'Prioridade de entrega e garantia expressa de prazo'
        }
        if (
          t.includes('alinhamento') ||
          t.includes('convers') ||
          t.includes('contato direto') ||
          t.includes('gerente')
        ) {
          return 'Alinhamento direto com a gerência / canal direto dedicado'
        }
        const opcoesExatas = [
          'Sem necessidade de ação reparatória',
          'Concessão de desconto comercial especial na próxima compra',
          'Ampliação de prazo de pagamento / novas condições no boleto',
          'Bonificação, reposição de lote ou troca de material',
          'Visita presencial do representante / suporte técnico',
          'Prioridade de entrega e garantia expressa de prazo',
          'Alinhamento direto com a gerência / canal direto dedicado',
        ]
        if (opcoesExatas.includes(String(texto).trim())) {
          return String(texto).trim()
        }
        return `Outros: ${String(texto).trim()}`
      }

      // Buscar registros da coleção respostas_formulario
      const records = app.findRecordsByFilter(
        'respostas_formulario',
        "id != ''",
        '-created',
        1000,
        0,
      )
      let atualizados = 0

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]
        const respostas = rec.get('respostas') || {}
        let mudou = false
        const novasRespostas = { ...respostas }

        if (novasRespostas.q7 && typeof novasRespostas.q7 === 'string') {
          const norm = normalizarQ7(novasRespostas.q7)
          if (norm && norm !== novasRespostas.q7) {
            novasRespostas.q7 = norm
            mudou = true
          }
        }

        if (novasRespostas.q8 && typeof novasRespostas.q8 === 'string') {
          const norm = normalizarQ8(novasRespostas.q8)
          if (norm && norm !== novasRespostas.q8) {
            novasRespostas.q8 = norm
            mudou = true
          }
        }

        if (novasRespostas.q10 && typeof novasRespostas.q10 === 'string') {
          const norm = normalizarQ10(novasRespostas.q10)
          if (norm && norm !== novasRespostas.q10) {
            novasRespostas.q10 = norm
            mudou = true
          }
        }

        if (mudou) {
          rec.set('respostas', novasRespostas)
          app.save(rec)
          atualizados++
        }
      }

      console.log(
        `[0076_normalizar_respostas_formulario] Normalizados ${atualizados} registros de respostas_formulario.`,
      )
    } catch (err) {
      console.log(`[0076_normalizar_respostas_formulario] Erro: ${err.message}`)
    }
  },
  () => {},
)
