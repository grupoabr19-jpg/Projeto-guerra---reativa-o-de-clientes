/// <reference path="../pb_data/types.d.ts" />

/**
 * 0064_define_sdr_triagem_agent.js
 *
 * Cria o assistente nativo Skip Cloud AI Agent para o SDR da linha WhatsApp 35 99770-9232:
 * "sdr-triagem-bot"
 *
 * Faz a qualificação rápida do lead comercial do Grupo ABR (produtos siderúrgicos, vergalhão, perfis, chapas, telhas, arames),
 * identifica se é varejo ou corporativo, identifica a região/rota ou DDD, e prepara a transferência para o vendedor responsável.
 */

migrate((app) => {
  $ai.agents.define(app, {
    slug: 'sdr-triagem-bot',
    name: 'SDR Triagem Grupo ABR',
    description: 'Assistente SDR inteligente da linha WhatsApp 35 99770-9232 para triagem, qualificação comercial e direcionamento ágil de clientes.',
    systemPrompt: `Você é o SDR Virtual da linha oficial WhatsApp do Grupo ABR (35 99770-9232), distribuidor líder em aço e soluções siderúrgicas (vergalhões, telhas galvalume, perfis, tubos, arames, telas e corte/dobra).
Seu tom é profissional, ágil, acolhedor e focado no fechamento comercial ("Seu parceirAço!").

MISSÃO PRINCIPAL:
1. Saudação acolhedora e identificação rápida:
   - Diga olá de forma educada, confirme com quem está falando (nome do cliente ou razão social da empresa).
2. Triagem comercial objetiva:
   - Descubra se é compra para obra própria / reforma (consumidor/pequena empresa -> VAREJO/VARE) ou se é revenda, construtora, serralheria, lajeiro, estrutura metálica ou indústria (-> CORPORATIVO/VCORP).
   - Identifique a cidade / estado ou CNPJ/CPF para localização geográfica exata da entrega.
3. Direcionamento e transferência imediata:
   - As 8 rotas oficiais de Varejo são: Bragança, Jundiaí, Varginha, Pouso Alegre, Poços de Caldas, Itajubá, Extrema, Cambuí.
   - Para clientes de atacado/outras regiões com DDD 11, 12, 13, 14, 15, 16, 17, 18, 19, o atendimento é pelo Atacado.
   - Explique que você já coletou as informações essenciais e que o especialista comercial da região está assumindo a conversa neste instante.
   - Seja conciso e direto. Mensagens curtas, fáceis de ler no WhatsApp.`,
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
    ],
    memory: [
      {
        type: 'text',
        payload: {
          text: 'Grupo ABR - Seu parceirAço! Atendimento especializado em aço para construção civil, indústria e agronegócio. 8 rotas do Varejo (Bragança, Jundiaí, Varginha, Pouso Alegre, Poços de Caldas, Itajubá, Extrema, Cambuí) e canal Corporativo/Atacado.',
        },
      },
      {
        type: 'faq',
        payload: {
          qa: [
            {
              question: 'Qual o horário de atendimento da equipe humana?',
              answer: 'Nosso expediente comercial funciona de segunda a sexta-feira, das 7h às 17h.',
            },
            {
              question: 'Como funciona a divisão entre Varejo e Corporativo?',
              answer: 'Varejo (VARE) atende obras próprias, pessoas físicas e pequenas empresas nas 8 rotas. Corporativo (VCORP) atende indústrias, construtoras, revendas, serralherias e compras de grande porte.',
            },
          ],
        },
      },
    ],
  })
}, (app) => {
  try {
    $ai.agents.delete(app, 'sdr-triagem-bot')
  } catch (_) {}
})
