/**
 * Teste unitário e de regras de negócio para a normalização de respostas Microsoft Forms
 */

import {
  extrairCodigoCliente,
  normalizarValorReais,
  normalizarPesoToneladas,
  normalizarProbabilidadeRetomada,
  normalizarDesfechoForms,
  sugerirMapeamentoColunasForms,
  converterLinhasFormsParaPayload,
} from './formsImportParser'

export function runFormsImportParserTests(): { passed: boolean; results: string[] } {
  const results: string[] = []
  let allOk = true

  const assert = (condition: boolean, desc: string) => {
    if (condition) {
      results.push(`✓ PASS: ${desc}`)
    } else {
      results.push(`✗ FAIL: ${desc}`)
      allOk = false
    }
  }

  // 1. extrairCodigoCliente
  assert(extrairCodigoCliente('C000404') === 'C000404', 'Código padrão simples')
  assert(
    extrairCodigoCliente('EMPRESA TESTE C000404') === 'C000404',
    'Código embutido no final do nome',
  )
  assert(extrairCodigoCliente('C008824 ') === 'C008824', 'Código com espaço ao fim')
  assert(extrairCodigoCliente('c017795') === 'C017795', 'Código em minúsculas')
  assert(extrairCodigoCliente('C000822 / C017996') === 'C000822', 'Primeiro código de múltiplos')
  assert(extrairCodigoCliente('C 000404') === 'C000404', 'Código com espaço entre C e dígitos')

  // 2. normalizarValorReais
  assert(normalizarValorReais('R$ 5.298') === 5298, 'Valor R$ com espaço e milhar')
  assert(
    normalizarValorReais('R$ 19.254,60 - pedido 123') === 19254.6,
    'Valor com texto de pedido embutido',
  )
  assert(normalizarValorReais('1653,00') === 1653, 'Valor com vírgula')
  assert(normalizarValorReais('SEM COTAÇÃO') === 0, 'Texto não numérico vira 0')
  assert(normalizarValorReais('') === 0, 'Vazio vira 0')
  assert(normalizarValorReais('R$ 10.000,00') === 10000, 'Valor redondo com centavos')

  // 3. normalizarPesoToneladas
  assert(
    normalizarPesoToneladas('3.378 Kgs') === 3.378,
    'Peso em kg convertido ou preservado (3378 kg / 1000 = 3.378 ton)',
  )
  assert(normalizarPesoToneladas('221.049 Kgs') === 221.049, '221.049 Kgs = 221.049 ton')
  assert(normalizarPesoToneladas('220.644 Kgs') === 220.644, '220.644 Kgs = 220.644 ton')
  assert(normalizarPesoToneladas('20.993 Kgs') === 20.993, '20.993 Kgs = 20.993 ton')
  assert(normalizarPesoToneladas('1700 kilos') === 1.7, '1700 kilos convertido para 1.7 toneladas')
  assert(normalizarPesoToneladas('493.25') === 493.25, 'Valor já em toneladas preservado')
  assert(normalizarPesoToneladas('só aguardando liberação') === 0, 'Texto vira 0')
  assert(normalizarPesoToneladas('321,32') === 321.32, 'Peso decimal com vírgula')

  // 4. normalizarProbabilidadeRetomada
  assert(normalizarProbabilidadeRetomada('Muito provável ') === 'Muito provável', 'Muito provável')
  assert(normalizarProbabilidadeRetomada('Provável ') === 'Provável', 'Provável')
  assert(normalizarProbabilidadeRetomada('Neutro') === 'Neutro', 'Neutro')
  assert(normalizarProbabilidadeRetomada('Pouco provável') === 'Pouco provável', 'Pouco provável')
  assert(normalizarProbabilidadeRetomada('Improvável ') === 'Improvável', 'Improvável')

  // 5. normalizarDesfechoForms
  const desfechoReativado = normalizarDesfechoForms('Reativado')
  assert(desfechoReativado.desfechoNormalizado === 'reativado', 'Reativado normalizado')
  assert(desfechoReativado.deveAtualizarEstadoCliente === true, 'Reativado deve atualizar cliente')

  const desfechoAgendado = normalizarDesfechoForms('Agendado para finalização posterior')
  assert(desfechoAgendado.desfechoNormalizado === 'reagendado', 'Agendado normalizado')

  const desfechoOutro = normalizarDesfechoForms('Cliente com mais de um ID de cliente')
  assert(
    desfechoOutro.desfechoNormalizado === 'duplicado' ||
      desfechoOutro.desfechoNormalizado === 'contatado',
    'Outro desfecho tratado',
  )
  assert(desfechoOutro.deveAtualizarEstadoCliente === false, 'Outro desfecho não força quarentena')

  // 6. sugerirMapeamentoColunasForms
  const sampleHeaders = [
    'Id',
    'Hora de início',
    'Hora de conclusão',
    'Email',
    'Nome',
    'Identificação do cliente (CO)',
    'Nome de Cliente:',
    'Qual o principal motivo para interrupção da compra?',
    'Como você avalia a experiencia geral...',
    'Houve algum erro especifico ou falha...',
    'Se houve um erro, qual foi a natureza da falha?',
    'Se puder identificar, qual setor ou área...',
    'O cliente tem algum arquivo para subsidiar...',
    'O que seria necessário para que você voltasse...',
    'Qual a probabilidade de você retomar negócios...',
    'Como este atendimento foi finalizado?',
    'Se reativado, Qual valor da cotação?',
    'Se o cliente fez a cotação e ja faturou? qual peso faturado?',
  ]

  const mapSug = sugerirMapeamentoColunasForms(sampleHeaders)
  assert(Boolean(mapSug.colunaCodigoCliente), 'Mapeou Identificação do cliente')
  assert(Boolean(mapSug.colunaOperadorEmail), 'Mapeou Email')
  assert(Boolean(mapSug.colunaDataConclusao), 'Mapeou Hora de conclusão')
  assert(Boolean(mapSug.colunaDesfecho), 'Mapeou Como este atendimento foi finalizado')
  assert(Boolean(mapSug.colunaValorCotacao), 'Mapeou Se reativado, Qual valor da cotação')

  // 7. converterLinhasFormsParaPayload com dados fictícios
  const fakeRows = [
    {
      'Identificação do cliente (CO)': 'TESTE SERRALHERIA C000999',
      'Nome de Cliente:': 'TESTE SERRALHERIA',
      Email: 'operador.teste@grupoabr.com.br',
      Nome: 'Operador Teste',
      'Hora de início': '10/10/2026 10:00',
      'Hora de conclusão': '10/10/2026 10:15',
      'Como este atendimento foi finalizado?': 'Reativado',
      'Se reativado, Qual valor da cotação?': 'R$ 5.000,00',
      'Se o cliente fez a cotação e ja faturou? qual peso faturado?': '1200 kilos',
    },
  ]

  const payload = converterLinhasFormsParaPayload(fakeRows, mapSug)
  assert(payload.length === 1, 'Gerou 1 registro payload')
  assert(payload[0].codigoCliente === 'C000999', 'Extraiu C000999 no payload')
  assert(payload[0].valorPotencial === 5000, 'Valor 5000 normalizado')
  assert(payload[0].toneladasPotencial === 1.2, '1.2 toneladas normalizado')
  assert(payload[0].desfechoNormalizado === 'reativado', 'Desfecho reativado no payload')

  return { passed: allOk, results }
}
