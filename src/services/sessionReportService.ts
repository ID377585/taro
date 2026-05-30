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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'leitura'

export const buildSessionReportFileName = (session: SpreadingSession) => {
  const date = new Date(session.timestamp).toISOString().slice(0, 10)
  const person = session.intake?.pessoa1.nomeCompleto || session.spreadName || 'leitura'
  return `leitura-taro-${date}-${slugify(person)}.html`
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

export const buildSessionHtmlReport = (input: BuildSessionReportInput) => {
  const report = buildSessionFullReport(input)
  const title = `Relatório de Leitura - ${input.session.spreadName}`
  const paragraphs = report
    .split('\n')
    .map(line => line.trim())
    .map(line => {
      if (!line) return '<br />'
      if (line.startsWith('BLOCO ') || line === 'RELATÓRIO COMPLETO DE LEITURA') {
        return `<h2>${escapeHtml(line)}</h2>`
      }
      if (line.startsWith('Carta ') || line === 'Síntese Final da Tiragem') {
        return `<h3>${escapeHtml(line)}</h3>`
      }
      return `<p>${escapeHtml(line)}</p>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f5f2ec;
      color: #1f1a17;
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.58;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 32px auto;
      background: #fffdf8;
      border: 1px solid #d8c8aa;
      border-radius: 18px;
      padding: 44px;
      box-shadow: 0 18px 50px rgba(31, 26, 23, 0.12);
    }
    header {
      border-bottom: 2px solid #8a6a2f;
      margin-bottom: 28px;
      padding-bottom: 18px;
    }
    header small {
      color: #755d2c;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-family: Arial, sans-serif;
      font-weight: 700;
    }
    h1, h2, h3 { line-height: 1.2; }
    h1 {
      margin: 8px 0 0;
      font-size: 2.2rem;
      color: #3b2719;
    }
    h2 {
      margin: 30px 0 12px;
      padding-top: 12px;
      color: #5d3e18;
      border-top: 1px solid #eadfc9;
      font-size: 1.35rem;
    }
    h2:first-of-type { border-top: none; }
    h3 {
      margin: 22px 0 8px;
      color: #2c1f18;
      font-size: 1.08rem;
    }
    p {
      margin: 6px 0;
      white-space: pre-wrap;
    }
    footer {
      margin-top: 36px;
      border-top: 1px solid #eadfc9;
      padding-top: 16px;
      color: #755d2c;
      font-size: 0.92rem;
      text-align: center;
    }
    .actions {
      margin: 0 auto 18px;
      width: min(920px, calc(100% - 32px));
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    button {
      border: 0;
      border-radius: 999px;
      background: #5d3e18;
      color: white;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; }
      main { width: 100%; margin: 0; border: 0; border-radius: 0; box-shadow: none; padding: 0; }
      .actions { display: none; }
      h2 { break-after: avoid; }
      h3, p { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Salvar como PDF / Imprimir</button></div>
  <main>
    <header>
      <small>Relatório profissional de tarô</small>
      <h1>${escapeHtml(input.session.spreadName)}</h1>
    </header>
    ${paragraphs}
    <footer>Documento gerado automaticamente pelo Tarô Teleprompter.</footer>
  </main>
</body>
</html>`
}
