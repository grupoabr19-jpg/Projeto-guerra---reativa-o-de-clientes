/// <reference path="../pb_data/types.d.ts" />

/**
 * 0065_create_sdr_triagens_log_and_config.js
 *
 * 1. Cria a coleção `sdr_triagens_log` para histórico de auditoria das triagens do SDR:
 *    - cliente_nome, telefone, telefone_limpo, documento, canal,
 *    - classificacao (VARE, VCORP, ATACADO, SEM_ROTA),
 *    - regiao_nome, rota_destino, operador_destino (relation users),
 *    - operador_nome, kommo_user_id, kommo_lead_id, conversa (relation chat_conversas),
 *    - motivo_decisao, regra_aplicada, status_transferencia, nota_kommo,
 *    - conversa_resumo, eh_simulacao (bool)
 *
 * 2. Atualiza ou define o agente nativo 'sdr-triagem-bot' garantindo acesso a sdr_triagens_log,
 *    clientes, regioes e users.
 *
 * 3. Cria a configuração inicial 'sdr_bot_config' na tabela `configuracoes` com:
 *    - ativo: true
 *    - nome_sdr: "SDR Virtual Grupo ABR"
 *    - saudacao: "Olá! Sou o assistente do Grupo ABR, seu parceirAço em soluções de aço e siderurgia. Como posso ajudar com sua obra, comércio ou indústria hoje?"
 *    - tom: "profissional, ágil e comercial"
 *    - instrucoes: "Qualifique o tipo de compra (obra própria/reforma vs empresa/revenda/indústria) e localização. Nunca prometa preço fechado ou prazo sem validação do vendedor especialista da rota."
 *    - regras_rotas: mapeamento inicial rota -> especialista
 *    - regras_atacado_ddd: mapeamento DDDs -> operador (11,12,13->Larissa; 15,19->Julio; 14,16,17,18->Wilson)
 */

migrate(
  (app) => {
    // 1. Criar coleção sdr_triagens_log
    let triagensCol = null
    try {
      triagensCol = app.findCollectionByNameOrId('sdr_triagens_log')
    } catch (_) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      const chatConversasCol = app.findCollectionByNameOrId('chat_conversas')

      triagensCol = new Collection({
        name: 'sdr_triagens_log',
        type: 'base',
        listRule:
          '@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "supervisor")',
        viewRule:
          '@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "supervisor")',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
        deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
        fields: [
          { name: 'cliente_nome', type: 'text' },
          { name: 'telefone', type: 'text' },
          { name: 'telefone_limpo', type: 'text' },
          { name: 'documento', type: 'text' },
          { name: 'canal', type: 'text' },
          { name: 'classificacao', type: 'text' }, // VARE | VCORP | ATACADO | SEM_ROTA
          { name: 'regiao_nome', type: 'text' },
          { name: 'rota_destino', type: 'text' },
          {
            name: 'operador_destino',
            type: 'relation',
            collectionId: usersCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'operador_nome', type: 'text' },
          { name: 'kommo_user_id', type: 'text' },
          { name: 'kommo_lead_id', type: 'text' },
          {
            name: 'conversa',
            type: 'relation',
            collectionId: chatConversasCol.id,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'motivo_decisao', type: 'text' },
          { name: 'regra_aplicada', type: 'text' },
          { name: 'status_transferencia', type: 'text' }, // sucesso | falha | manual | simulado
          { name: 'nota_kommo', type: 'text' },
          { name: 'conversa_resumo', type: 'text' },
          { name: 'eh_simulacao', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sdr_triagens_created ON sdr_triagens_log (created DESC)',
          'CREATE INDEX idx_sdr_triagens_classif ON sdr_triagens_log (classificacao)',
          'CREATE INDEX idx_sdr_triagens_simul ON sdr_triagens_log (eh_simulacao)',
          'CREATE INDEX idx_sdr_triagens_phone ON sdr_triagens_log (telefone_limpo)',
        ],
      })
      app.save(triagensCol)
    }

    // 2. Definir / Atualizar o AI Agent sdr-triagem-bot
    try {
      $ai.agents.define(app, {
        slug: 'sdr-triagem-bot',
        name: 'SDR Triagem Grupo ABR',
        description:
          'Assistente SDR inteligente da linha WhatsApp 35 99770-9232 para triagem, qualificação comercial e direcionamento ágil de clientes.',
        systemPrompt: `Você é o SDR Virtual da linha oficial WhatsApp do Grupo ABR (35 99770-9232), distribuidor líder em aço e soluções siderúrgicas (vergalhões, telhas galvalume, perfis, tubos, arames, telas e corte/dobra).
Seu tom é profissional, ágil, acolhedor e focado no fechamento comercial ("Seu parceirAço!").

MISSÃO PRINCIPAL:
1. Saudação acolhedora e identificação rápida:
   - Diga olá de forma educada, confirme com quem está falando (nome do cliente ou razão social da empresa).
2. Triagem comercial objetiva:
   - Descubra se é compra para obra própria / reforma (consumidor/pequena empresa -> VAREJO/VARE) ou se é revenda, construtora, serralheria, lajeiro, estrutura metálica ou indústria (-> CORPORATIVO/VCORP).
   - Identifique a cidade / estado ou CNPJ/CPF para localização geográfica exata da entrega.
3. Roteamento inteligente:
   - 8 rotas oficiais de Varejo: Bragança, Jundiaí, Varginha, Pouso Alegre, Poços de Caldas, Itajubá, Extrema, Cambuí.
   - Atacado por DDD: 11, 12, 13 -> Larissa Terra; 15, 19 -> Julio Melo; 14, 16, 17, 18 -> Wilson Neto.
   - Cliente sem cadastro / sem rota definida -> Direcionar ao Administrador Thiago Almeida.
4. Diretrizes inegociáveis:
   - NUNCA prometa preço fechado nem prazo de entrega garantido sem a validação do vendedor especialista.
   - Mensagens curtas, simpáticas e fáceis de ler no WhatsApp.
   - Sempre finalize a qualificação indicando que o especialista da região já está assumindo a conversa.`,
        tier: 'fast',
        tools: [
          {
            collection: 'clientes',
            perms: { read: true, list: true },
            actAs: 'admin',
          },
          {
            collection: 'regioes',
            perms: { read: true, list: true },
            actAs: 'admin',
          },
          {
            collection: 'sdr_triagens_log',
            perms: { read: true, list: true, create: true },
            actAs: 'admin',
          },
        ],
        memory: [
          {
            type: 'text',
            payload: {
              text: 'Grupo ABR - Seu parceirAço! Distribuição de aço e soluções siderúrgicas para construção civil, indústria e agronegócio. 8 rotas do Varejo (Bragança, Jundiaí, Varginha, Pouso Alegre, Poços de Caldas, Itajubá, Extrema, Cambuí) e canal Corporativo/Atacado.',
            },
          },
          {
            type: 'faq',
            payload: {
              qa: [
                {
                  question: 'Qual o expediente comercial da equipe?',
                  answer:
                    'Nosso expediente comercial funciona de segunda a sexta-feira, das 7h às 17h.',
                },
                {
                  question: 'Como funciona a divisão entre Varejo e Corporativo?',
                  answer:
                    'Varejo (VARE) atende obras próprias, pessoas físicas e pequenas empresas nas 8 rotas. Corporativo (VCORP) atende indústrias, construtoras, revendas, serralherias e compras de grande porte.',
                },
                {
                  question: 'Para quem transferir no Atacado?',
                  answer:
                    'DDDs 11, 12 e 13 para Larissa Terra; DDDs 15 e 19 para Julio Melo; DDDs 14, 16, 17 e 18 para Wilson Neto.',
                },
              ],
            },
          },
        ],
      })
    } catch (errAgent) {
      console.log('[0065_migration] Aviso ao definir agente AI: ' + errAgent.message)
    }

    // 3. Criar registro de configuração do bot na tabela configuracoes
    try {
      const configCol = app.findCollectionByNameOrId('configuracoes')
      let cfgRec = null
      try {
        cfgRec = app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      } catch (_) {}

      const defaultConfig = {
        ativo: true,
        nome_sdr: 'SDR Virtual Grupo ABR',
        saudacao:
          'Olá! Sou o assistente SDR do Grupo ABR, seu parceirAço em aço e soluções siderúrgicas. Como posso ajudar com sua obra, empresa ou indústria hoje?',
        tom: 'profissional, ágil e focado em fechamento',
        instrucoes:
          'Qualifique se é compra para obra própria/reforma (Varejo) ou empresa/indústria/revenda (Corporativo). Identifique cidade e produto. NUNCA prometa preço ou prazo fechado. Transfira rapidamente para o vendedor especialista da rota.',
        regras_rotas: {
          BRAGANÇA: {
            especialista: 'Leiz Torso',
            corporativo: 'Heloá Leite',
            externo: 'Alessandro Farias (Japa)',
          },
          JUNDIAÍ: {
            especialista: 'Josiane Lima',
            corporativo: 'Kaylane Silva',
            externo: 'Dyovana Silva',
          },
          VARGINHA: {
            especialista: 'Bruna Pereira',
            corporativo: 'Thais Oliveira',
            externo: 'Peterson Seixas',
          },
          'POUSO ALEGRE': {
            especialista: 'Rafaela Resende',
            corporativo: 'Camila Guimenti',
            externo: 'Paola Santos',
          },
          'POÇOS DE CALDAS': {
            especialista: 'Milena Vaz',
            corporativo: 'Camila Guimenti',
            externo: 'José Felipe',
          },
          ITAJUBÁ: {
            especialista: 'Gabriela Cunha',
            corporativo: 'Jéssica Santos',
            externo: 'Jennifer Silva',
          },
          EXTREMA: {
            especialista: 'Inayara Cunha',
            corporativo: 'Tainara Matilde',
            externo: 'Gustavo Araujo',
          },
          CAMBUÍ: {
            especialista: 'Edmila Melo',
            corporativo: 'Matheus Teixeira',
            externo: 'Juliano Pereira',
          },
        },
        regras_atacado_ddd: {
          '11,12,13': { operador_nome: 'Larissa Terra', ddds: ['11', '12', '13'] },
          '15,19': { operador_nome: 'Julio Melo', ddds: ['15', '19'] },
          '14,16,17,18': { operador_nome: 'Wilson Neto', ddds: ['14', '16', '17', '18'] },
        },
        fallback_admin: {
          nome: 'Thiago Almeida',
          role: 'admin',
        },
      }

      if (!cfgRec) {
        cfgRec = new Record(configCol)
        cfgRec.set('chave', 'sdr_bot_config')
        cfgRec.set(
          'descricao',
          'Configurações de comportamento, prompt e regras do Bot SDR Grupo ABR',
        )
        cfgRec.set('valor', defaultConfig)
        app.save(cfgRec)
      }
    } catch (errCfg) {
      console.log('[0065_migration] Aviso ao configurar sdr_bot_config: ' + errCfg.message)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('sdr_triagens_log')
      app.delete(col)
    } catch (_) {}
    try {
      const cfg = app.findFirstRecordByData('configuracoes', 'chave', 'sdr_bot_config')
      app.delete(cfg)
    } catch (_) {}
  },
)
