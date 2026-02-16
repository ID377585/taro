import { Card, DrawnCard, SpreadingSession, Spread } from '../types'
import { generateAdvancedSpreadSynthesis } from './advancedReadingService'

interface BuildSessionReportInput {
  session: SpreadingSession
  spread: Spread | null
  cardById: Map<number, Card>
}

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('pt-BR')

const formatArcano = (card: Card) =>
  card.arcano === 'maior' ? 'Arcano Maior' : 'Arcano Menor'

const formatElement = (card: Card) => {
  if (!card.elemento) return 'Não aplicável'
  return `${card.elemento.nome} - ${card.elemento.descricao}`
}

const formatNumerology = (card: Card) => {
  if (!card.numerologia) return 'Sem dados numerológicos.'
  return `${card.numerologia.valor} (${card.numerologia.titulo}) - ${card.numerologia.descricao}`
}

const sortDrawnCards = (drawnCards: DrawnCard[], spread: Spread | null) => {
  if (!spread) {
    return [...drawnCards].sort((a, b) => a.position - b.position)
  }

  return spread.positions
    .map(position => drawnCards.find(card => card.position === position.index))
    .filter((card): card is DrawnCard => Boolean(card))
}

const buildIntakeSection = (session: SpreadingSession) => {
  const intake = session.intake
  if (!intake) {
    return [
      'BLOCO 1 - DADOS DO ATENDIMENTO',
      '- Atendimento sem dados cadastrais iniciais.',
    ].join('\n')
  }

  const personOne = `- Pessoa 1: ${intake.pessoa1.nomeCompleto} (${intake.pessoa1.sexo})${
    intake.pessoa1.dataNascimento
      ? ` | Nascimento: ${new Date(`${intake.pessoa1.dataNascimento}T00:00:00`).toLocaleDateString('pt-BR')}`
      : ''
  }`

  const personTwo =
    intake.tipo === 'sobre-outra-pessoa' && intake.pessoa2
      ? `- Pessoa 2: ${intake.pessoa2.nomeCompleto} (${intake.pessoa2.sexo})${
          intake.pessoa2.dataNascimento
            ? ` | Nascimento: ${new Date(`${intake.pessoa2.dataNascimento}T00:00:00`).toLocaleDateString('pt-BR')}`
            : ''
        }`
      : null

  return [
    'BLOCO 1 - DADOS DO ATENDIMENTO',
    `- Tipo: ${intake.tipo === 'pessoal' ? 'Pessoal' : 'Sobre outra pessoa'}`,
    personOne,
    personTwo,
    `- Situação principal: ${intake.situacaoPrincipal}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}

const buildCardBlocks = (
  orderedDrawn: DrawnCard[],
  spread: Spread | null,
  cardById: Map<number, Card>,
) => {
  const blocks: string[] = []

  orderedDrawn.forEach((drawn, index) => {
    const card = cardById.get(drawn.cardId)
    if (!card) return

    const positionName =
      spread?.positions.find(item => item.index === drawn.position)?.nome ||
      `Posição ${drawn.position}`
    const positionDescription =
      spread?.positions.find(item => item.index === drawn.position)?.descricao || ''

    const orientation = drawn.isReversed ? 'Invertida' : 'Vertical'
    const mainMeaning = drawn.isReversed
      ? card.significado.invertido.longo
      : card.significado.vertical.longo

    blocks.push(
      [
        `Carta ${index + 1} - ${positionName}`,
        positionDescription ? `Contexto da posição: ${positionDescription}` : '',
        `Carta sorteada: ${card.nome} (${orientation})`,
        `Arcano: ${formatArcano(card)}${card.arcanoDescricao ? ` - ${card.arcanoDescricao}` : ''}`,
        `Elemento: ${formatElement(card)}`,
        `Numerologia: ${formatNumerology(card)}`,
        `Luz/Sombra: ${card.polaridades?.luz || card.significado.vertical.curto} | ${card.polaridades?.sombra || card.significado.invertido.curto}`,
        `Representação: ${card.representacao || 'Não informada.'}`,
        card.corte
          ? `Carta da corte: ${card.corte.titulo} - ${card.corte.descricao}`
          : '',
        `Significado principal: ${mainMeaning}`,
        `Aplicações por área: Carreira - ${card.areas.carreira} | Relacionamentos - ${card.areas.relacionamentos} | Espiritual - ${card.areas.espiritual}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  })

  if (!blocks.length) {
    return ['Nenhuma carta registrada nesta sessão.']
  }

  return blocks
}

const buildFallbackSynthesis = (session: SpreadingSession) =>
  [
    'Síntese Final da Tiragem',
    `Não foi possível localizar a configuração da tiragem (${session.spreadName}) no catálogo atual.`,
    'A recomendação é revisar as cartas posição a posição e concluir com foco em ação prática.',
  ].join('\n')

export const buildSessionFullReport = ({
  session,
  spread,
  cardById,
}: BuildSessionReportInput) => {
  const orderedDrawn = sortDrawnCards(session.drawnCards, spread)
  const cardsSection = buildCardBlocks(orderedDrawn, spread, cardById)

  const synthesis = spread
    ? generateAdvancedSpreadSynthesis({
        spread,
        orderedDrawn,
        cardById,
        consultation: session.intake || null,
      })
    : buildFallbackSynthesis(session)

  return [
    'RELATÓRIO COMPLETO DE LEITURA',
    `Tiragem: ${session.spreadName}`,
    `Data da leitura (hoje): ${new Date().toLocaleString('pt-BR')}`,
    `Registro salvo em: ${formatDateTime(session.timestamp)}`,
    '',
    buildIntakeSection(session),
    '',
    'BLOCO 2 - LEITURA E SIGNIFICADOS DAS CARTAS',
    cardsSection.join('\n\n'),
    '',
    'BLOCO 3 - SÍNTESE FINAL',
    synthesis,
  ].join('\n')
}
