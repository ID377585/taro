import {
  Card,
  DrawnCard,
  Spread,
  ConsultationIntake,
  ConsultationPerson,
  PersonSex,
} from '../types'

interface PositionedCard {
  drawn: DrawnCard
  card: Card
  position: Spread['positions'][number]
}

interface AdvancedReadingInput {
  spread: Spread
  orderedDrawn: DrawnCard[]
  cardById: Map<number, Card>
  consultation?: ConsultationIntake | null
}

interface SpreadProfile {
  foco: string
  estrutura: string
  decisao: string
  cautela: string
}

const PSYCHOLOGICAL_THEMES = [
  { token: 'medo', label: 'medos ocultos' },
  { token: 'ansiedade', label: 'ansiedade antecipatória' },
  { token: 'confusao', label: 'confusão mental/emocional' },
  { token: 'culpa', label: 'culpa e autojulgamento' },
  { token: 'controle', label: 'controle excessivo' },
  { token: 'isolamento', label: 'isolamento afetivo' },
  { token: 'dependencia', label: 'dependência emocional/material' },
  { token: 'ilusao', label: 'ilusão e idealização' },
  { token: 'obsessao', label: 'obsessão e fixação' },
  { token: 'rigidez', label: 'rigidez de comportamento' },
]

const SPIRITUAL_COMBOS = [
  {
    cards: ['O Diabo', 'A Lua', '9 de Espadas'],
    message:
      'Combinação de aprisionamento mental-espiritual. Reforçar proteção energética, oração/meditação e corte de padrões repetitivos.',
  },
  {
    cards: ['A Estrela', 'A Temperança', 'O Sol'],
    message:
      'Combinação de proteção e cura ativa. O campo espiritual favorece reorganização e clareza de propósito.',
  },
  {
    cards: ['A Morte', 'O Julgamento', 'O Mundo'],
    message:
      'Combinação de encerramento kármico e renascimento. Há troca de ciclo com maior alinhamento de missão.',
  },
]

const BODY_ALERT_CARDS: Record<string, string> = {
  'A Lua': 'sensibilidade psíquica com oscilação emocional',
  'O Diabo': 'padrões compulsivos com drenagem de energia',
  '9 de Espadas': 'sobrecarga mental e impacto no sono',
  '5 de Copas': 'peso afetivo e luto emocional',
  'A Torre': 'descarga de tensão e estresse acumulado',
}

const ARCHETYPE_MAP: Record<string, string> = {
  'O Imperador': 'figura de autoridade e controle',
  'A Imperatriz': 'figura nutridora, criativa e magnética',
  'A Sacerdotisa': 'figura intuitiva, reservada e estratégica',
  'O Hierofante (Papa)': 'figura orientadora e tradicional',
  'Rainha de Copas': 'figura emocionalmente sensível e acolhedora',
  'Cavaleiro de Espadas': 'figura impulsiva, direta e combativa',
}

const ELEMENT_TIMING_MAP: Record<string, string> = {
  Fogo: 'ritmo rápido (dias a semanas)',
  Agua: 'ritmo emocional/cíclico (semanas)',
  Ar: 'ritmo mental acelerado e sujeito a mudanças (dias a semanas)',
  Terra: 'ritmo de consolidação (semanas a meses)',
}

const ELEMENT_ACTION_MAP: Record<string, string> = {
  Fogo: 'canalizar ação com foco e evitar impulsividade',
  Agua: 'regular emoções antes de decisões definitivas',
  Ar: 'organizar comunicação, limites e estratégia mental',
  Terra: 'priorizar constância, rotina e execução prática',
}

const SPREAD_PROFILES: Record<string, SpreadProfile> = {
  'uma-carta': {
    foco: 'direção imediata da questão principal',
    estrutura: 'mensagem única de alta objetividade',
    decisao: 'extrair uma ação clara para as próximas 24-72h',
    cautela: 'não generalizar além do contexto da pergunta',
  },
  'tres-cartas-ppf': {
    foco: 'linha temporal passado-presente-futuro',
    estrutura: 'causa -> estado atual -> tendência',
    decisao: 'agir no presente para corrigir a tendência futura',
    cautela: 'futuro é tendência, não sentença',
  },
  'tres-cartas-relacionamento': {
    foco: 'dinâmica entre duas pessoas e vínculo resultante',
    estrutura: 'você -> outra pessoa -> campo relacional',
    decisao: 'alinhar expectativa com comunicação e limite',
    cautela: 'evitar leitura unilateral sem considerar ambas as partes',
  },
  'tres-cartas-expectativas': {
    foco: 'expectativas afetivas e direção do vínculo',
    estrutura: 'expectativa pessoal -> expectativa do outro -> tendência',
    decisao: 'diferenciar desejo de realidade relacional',
    cautela: 'não confundir projeção com disponibilidade real',
  },
  'situacao-obstaculo-conselho': {
    foco: 'solução prática da questão',
    estrutura: 'situação -> bloqueio -> recomendação direta',
    decisao: 'converter o conselho em plano de ação curto',
    cautela: 'não ignorar o obstáculo central',
  },
  'cruz-celta': {
    foco: 'análise sistêmica e profunda da questão',
    estrutura: 'núcleo, forças internas/externas e desfecho provável',
    decisao: 'priorizar decisões estruturantes e consistentes',
    cautela: 'evitar foco apenas em uma posição isolada',
  },
  'mandala-astrologica': {
    foco: 'diagnóstico por áreas de vida (12 casas)',
    estrutura: 'mapa de energia por casa astrológica',
    decisao: 'agir por prioridades de área, sem tentar resolver tudo ao mesmo tempo',
    cautela: 'respeitar timing diferente de cada casa',
  },
  peladan: {
    foco: 'decisão entre prós e contras',
    estrutura: 'favorece -> dificulta -> síntese -> resultado',
    decisao: 'decidir com base na síntese, não no impulso inicial',
    cautela: 'não superestimar apenas os prós ou apenas os contras',
  },
  diamante: {
    foco: 'clareza de caminho e direção mais alinhada',
    estrutura: 'situação -> potencial -> desafio -> conselho -> direção',
    decisao: 'seguir a direção indicada com ajuste no desafio',
    cautela: 'não pular etapas do processo',
  },
  'cruz-5': {
    foco: 'visão geral com apoio, bloqueio e direção',
    estrutura: 'situação -> apoio -> bloqueio -> conselho -> direção geral',
    decisao: 'fortalecer apoio e neutralizar bloqueio com ação concreta',
    cautela: 'não agir sem considerar direção geral',
  },
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const includesNormalized = (value: string, pattern: string) =>
  normalize(value).includes(normalize(pattern))

const applyGender = (
  sex: PersonSex,
  masculine: string,
  feminine: string,
) => (sex === 'feminino' ? feminine : masculine)

const subjectPronoun = (sex: PersonSex) => (sex === 'feminino' ? 'ela' : 'ele')

const formatBirthDate = (dateValue?: string) => {
  if (!dateValue) return 'não informada'
  const parsed = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString('pt-BR')
}

const formatPersonSummary = (label: string, person: ConsultationPerson) =>
  `${label}: ${person.nomeCompleto} (${person.sexo}), nascimento ${formatBirthDate(
    person.dataNascimento,
  )}.`

const buildConsultationContextLines = (
  consultation?: ConsultationIntake | null,
) => {
  if (!consultation) return ['- Atendimento sem cadastro inicial de pessoas.']

  if (consultation.tipo === 'pessoal') {
    return [
      `- Tipo de atendimento: Pessoal`,
      `- ${formatPersonSummary('Pessoa 1', consultation.pessoa1)}`,
      `- Situação principal: ${consultation.situacaoPrincipal}`,
    ]
  }

  const personTwoSummary = consultation.pessoa2
    ? formatPersonSummary('Pessoa 2', consultation.pessoa2)
    : 'Pessoa 2: não informada.'

  return [
    `- Tipo de atendimento: Sobre outra pessoa`,
    `- ${formatPersonSummary('Pessoa 1', consultation.pessoa1)}`,
    `- ${personTwoSummary}`,
    `- Situação principal: ${consultation.situacaoPrincipal}`,
  ]
}

const buildPersonalizedIntegratedLine = (
  consultation: ConsultationIntake | null | undefined,
  spreadProfile: SpreadProfile,
) => {
  if (!consultation) return null

  if (consultation.tipo === 'pessoal') {
    const pronoun = subjectPronoun(consultation.pessoa1.sexo)
    const adjective = applyGender(
      consultation.pessoa1.sexo,
      'estruturado',
      'estruturada',
    )
    return `Para ${consultation.pessoa1.nomeCompleto}, a leitura orienta que ${pronoun} mantenha uma postura ${adjective} para transformar ${spreadProfile.foco} em resultado prático.`
  }

  const personTwoName = consultation.pessoa2?.nomeCompleto || 'Pessoa 2'
  return `No vínculo entre ${consultation.pessoa1.nomeCompleto} e ${personTwoName}, a leitura pede clareza de expectativa, maturidade emocional e acordos explícitos para sustentar ${spreadProfile.foco}.`
}

const getPositionedCards = ({
  spread,
  orderedDrawn,
  cardById,
}: AdvancedReadingInput): PositionedCard[] =>
  orderedDrawn
    .map(drawn => {
      const position = spread.positions.find(item => item.index === drawn.position)
      const card = cardById.get(drawn.cardId)
      if (!position || !card) return null
      return { drawn, card, position }
    })
    .filter((item): item is PositionedCard => Boolean(item))
    .sort((a, b) => a.position.index - b.position.index)

const getSpreadProfile = (spread: Spread): SpreadProfile => {
  const byId = SPREAD_PROFILES[spread.id]
  if (byId) return byId

  const normalizedName = normalize(spread.nome)
  if (normalizedName.includes('relacionamento') || normalizedName.includes('amor')) {
    return {
      foco: 'dinâmica afetiva e alinhamento emocional',
      estrutura: 'compreensão do vínculo e das expectativas',
      decisao: 'agir com diálogo claro e limite saudável',
      cautela: 'não fechar conclusão sem contexto emocional das duas partes',
    }
  }

  return {
    foco: spread.descricao,
    estrutura: 'análise por posições da tiragem selecionada',
    decisao: 'priorizar ações coerentes com as posições centrais',
    cautela: 'evitar conclusões baseadas em uma carta isolada',
  }
}

const getCardNamesSet = (cards: PositionedCard[]) => new Set(cards.map(item => item.card.nome))

const getElementCounter = (cards: PositionedCard[]) => {
  const counter = new Map<string, number>()
  cards.forEach(item => {
    const element = item.card.elemento?.nome
    if (!element) return
    counter.set(element, (counter.get(element) || 0) + 1)
  })
  return counter
}

const getDominantElement = (cards: PositionedCard[]) => {
  const counter = getElementCounter(cards)
  if (!counter.size) return null
  return Array.from(counter.entries()).sort((a, b) => b[1] - a[1])[0][0]
}

const getRepeatedNumerology = (cards: PositionedCard[]) => {
  const counter = new Map<number, number>()
  cards.forEach(item => {
    const value = item.card.numerologia?.valor
    if (value === null || value === undefined) return
    counter.set(value, (counter.get(value) || 0) + 1)
  })
  return Array.from(counter.entries())
    .filter(([, amount]) => amount >= 2)
    .sort((a, b) => b[1] - a[1])
}

const buildPositionDigest = (cards: PositionedCard[]) =>
  cards.map(item => {
    const orientation = item.drawn.isReversed ? 'Invertida' : 'Vertical'
    const shortMeaning = item.drawn.isReversed
      ? item.card.significado.invertido.curto
      : item.card.significado.vertical.curto
    return `${item.position.index}. ${item.position.nome}: ${item.card.nome} (${orientation}) -> ${shortMeaning}.`
  })

const getPsychologicalLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const themeCounter = new Map<string, number>()
  const reversedCount = cards.filter(item => item.drawn.isReversed).length

  cards.forEach(item => {
    const source = normalize(
      [
        item.card.polaridades?.sombra,
        item.card.significado.invertido.curto,
        item.card.representacao,
      ]
        .filter(Boolean)
        .join(' '),
    )

    PSYCHOLOGICAL_THEMES.forEach(theme => {
      if (!source.includes(theme.token)) return
      themeCounter.set(theme.label, (themeCounter.get(theme.label) || 0) + 1)
    })
  })

  if (reversedCount > Math.floor(cards.length / 2)) {
    lines.push(
      'Predomínio de cartas invertidas: o campo psicológico aponta revisão interna, autopercepção e ajuste de padrão antes de avanço externo.',
    )
  } else {
    lines.push(
      'Predomínio vertical: há recursos psicológicos para agir, desde que exista foco e disciplina emocional.',
    )
  }

  const topThemes = Array.from(themeCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  if (topThemes.length) {
    lines.push(
      `Padrões inconscientes em destaque: ${topThemes
        .map(([theme, amount]) => `${theme} (${amount}x)`)
        .join(', ')}.`,
    )
  } else {
    lines.push('Sem sinal dominante de autossabotagem; leitura psicológica favorece ajuste fino e constância.')
  }

  const names = getCardNamesSet(cards)
  if (names.has('A Lua') && names.has('7 de Copas')) {
    lines.push('Combinação A Lua + 7 de Copas: risco de confusão emocional gerada por projeções e excesso de cenários mentais.')
  }

  return lines
}

const getSpiritualLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const names = getCardNamesSet(cards)
  const majorCount = cards.filter(item => item.card.arcano === 'maior').length

  SPIRITUAL_COMBOS.forEach(combo => {
    if (combo.cards.every(name => names.has(name))) {
      lines.push(combo.message)
    }
  })

  if (!lines.length) {
    if (majorCount >= Math.ceil(cards.length / 2)) {
      lines.push(
        'Predomínio de Arcanos Maiores: campo espiritual ligado a lições kármicas, reposicionamento de identidade e amadurecimento de missão.',
      )
    } else {
      lines.push(
        'Campo espiritual estável com foco em manutenção energética cotidiana, sem alerta crítico de ruptura no momento.',
      )
    }
  }

  if (names.has('O Diabo') && (names.has('A Lua') || names.has('9 de Espadas'))) {
    lines.push(
      'Padrão de magnetismo denso: trabalhar limites energéticos, higiene espiritual e redução de gatilhos mentais repetitivos.',
    )
  }

  return lines
}

const getFutureLayer = (cards: PositionedCard[]) => {
  const futureKeywords = ['futuro', 'resultado', 'direcao', 'direção', 'desfecho']
  const lines: string[] = []

  const futureCards = cards.filter(item =>
    futureKeywords.some(keyword => includesNormalized(item.position.nome, keyword)),
  )

  if (!futureCards.length) {
    const closure = cards[cards.length - 1]
    const shortMeaning = closure.drawn.isReversed
      ? closure.card.significado.invertido.curto
      : closure.card.significado.vertical.curto
    lines.push(
      `Sem posição explícita de futuro; tendência extraída do fechamento atual (${closure.position.nome}: ${closure.card.nome}) -> ${shortMeaning}.`,
    )
  } else {
    futureCards.forEach(item => {
      const shortMeaning = item.drawn.isReversed
        ? item.card.significado.invertido.curto
        : item.card.significado.vertical.curto
      lines.push(`${item.position.nome}: ${item.card.nome} sinaliza ${shortMeaning}.`)
    })
  }

  lines.push('Tendência futura é dinâmica: mudanças de atitude no presente alteram o desfecho projetado.')
  return lines
}

const getArchetypeLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []

  cards.forEach(item => {
    if (item.card.corte) {
      lines.push(`${item.position.nome}: ${item.card.nome} ativa arquétipo de ${item.card.corte.titulo.toLowerCase()}.`)
      return
    }

    const mapped = ARCHETYPE_MAP[item.card.nome]
    if (mapped) {
      lines.push(`${item.position.nome}: ${item.card.nome} representa ${mapped}.`)
    }
  })

  if (!lines.length) {
    lines.push('Sem arquétipo pessoal dominante explícito; leitura mais voltada para processos e decisões internas.')
  }

  return lines
}

const getRelationshipLayer = (cards: PositionedCard[], spread: Spread) => {
  const lines: string[] = []
  const normalizedName = normalize(spread.nome)
  const relationshipFocus =
    normalizedName.includes('relacionamento') ||
    normalizedName.includes('amor') ||
    spread.positions.some(item => includesNormalized(item.nome, 'outra pessoa'))

  const names = getCardNamesSet(cards)
  const cupsCount = cards.filter(item => item.card.naipe === 'copas').length
  const swordsCount = cards.filter(item => item.card.naipe === 'espadas').length

  if (relationshipFocus) {
    lines.push(
      cupsCount >= swordsCount
        ? 'Leitura relacional com predominância de água/emocional: há espaço para vínculo, desde que exista clareza e reciprocidade.'
        : 'Leitura relacional com predominância mental: tendência a ruído, defesa e conflito de comunicação se faltarem acordos objetivos.',
    )

    if (names.has('3 de Copas') && (names.has('7 de Espadas') || names.has('O Diabo'))) {
      lines.push('Sinal de terceira energia/interferência no campo afetivo; confirmar com contexto e posições antes de conclusão final.')
    }

    if (names.has('2 de Copas') && (names.has('A Temperança') || names.has('O Sol'))) {
      lines.push('Padrão de reconciliação com potencial real quando há maturidade emocional e consistência prática.')
    }

    if (names.has('O Mago') && names.has('7 de Espadas')) {
      lines.push('Sinal de manipulação discursiva possível; priorizar fatos, limites e observação de coerência.')
    }

    if (lines.length === 1) {
      lines.push('Sem padrão crítico adicional; foco em alinhar expectativa, comunicação e decisão objetiva entre as partes.')
    }

    return lines
  }

  lines.push(
    cupsCount > swordsCount
      ? 'Dinâmica com abertura emocional maior que conflito mental: relações tendem a fluir com diálogo honesto.'
      : 'Dinâmica com pressão mental/comunicacional: revisar contratos afetivos e limites para evitar desgaste.',
  )

  return lines
}

const getTimingLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const dominantElement = getDominantElement(cards)
  const majorCount = cards.filter(item => item.card.arcano === 'maior').length
  const repeatedNumerology = getRepeatedNumerology(cards)

  if (dominantElement) {
    lines.push(
      `Elemento dominante ${dominantElement}: ${
        ELEMENT_TIMING_MAP[dominantElement] || 'ritmo variável conforme contexto'
      }.`,
    )
  } else {
    lines.push('Sem marcador temporal elemental dominante; ritmo depende da posição final e da ação prática do consulente.')
  }

  if (majorCount >= Math.ceil(cards.length / 2)) {
    lines.push('Arcanos Maiores em destaque: processos tendem a ser mais profundos e de médio/longo prazo.')
  } else {
    lines.push('Arcanos Menores em destaque: respostas tendem a ocorrer por ajustes concretos de curto/médio prazo.')
  }

  const strongestNumber = repeatedNumerology[0]
  if (strongestNumber) {
    lines.push(
      `Repetição numerológica ${strongestNumber[0]} (${strongestNumber[1]}x) acelera o tema desse número no tempo da leitura.`,
    )
  }

  return lines
}

const getElementLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const counter = getElementCounter(cards)

  if (!counter.size) {
    lines.push('Leitura centrada em Arcanos Maiores: eixo elemental indireto, com foco em lições estruturantes.')
    return lines
  }

  const sorted = Array.from(counter.entries()).sort((a, b) => b[1] - a[1])
  sorted.forEach(([element, amount]) => {
    lines.push(`${element}: ${amount} carta(s) em atividade no campo da tiragem.`)
  })

  const [dominantElement, dominantCount] = sorted[0]
  if (dominantCount >= Math.ceil(cards.length / 2)) {
    lines.push(`Desequilíbrio elemental: ${dominantElement} domina a leitura e pede compensação consciente nos demais eixos.`)
  }

  return lines
}

const getPatternLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const repeatedNumerology = getRepeatedNumerology(cards)
  const suitCounter = new Map<string, number>()
  const courtCount = cards.filter(item => item.card.corte).length
  const reversedCount = cards.filter(item => item.drawn.isReversed).length

  cards.forEach(item => {
    if (!item.card.naipe) return
    suitCounter.set(item.card.naipe, (suitCounter.get(item.card.naipe) || 0) + 1)
  })

  repeatedNumerology.forEach(([value, amount]) => {
    lines.push(`Número ${value} repetido ${amount}x: padrão amplificado para esse movimento energético.`)
  })

  Array.from(suitCounter.entries())
    .filter(([, amount]) => amount >= 3)
    .sort((a, b) => b[1] - a[1])
    .forEach(([suit, amount]) => {
      lines.push(`Naipe ${suit} repetido ${amount}x: tema dessa área da vida está dominante.`)
    })

  if (courtCount >= 2) {
    lines.push(`Cartas da corte em destaque (${courtCount}): presença forte de pessoas/perfis influenciando a situação.`)
  }

  if (reversedCount >= Math.ceil(cards.length / 2)) {
    lines.push('Alta repetição de invertidas: ciclo de limpeza, revisão e reposicionamento antes de expansão.')
  }

  if (!lines.length) {
    lines.push('Sem repetição estrutural dominante; leitura distribuída entre múltiplos fatores da tiragem.')
  }

  return lines
}

const getBodyLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const signals = cards
    .map(item => BODY_ALERT_CARDS[item.card.nome])
    .filter((value): value is string => Boolean(value))

  if (signals.length) {
    lines.push(`Sinais energéticos principais: ${Array.from(new Set(signals)).join('; ')}.`)
  }

  const swordsCount = cards.filter(item => item.card.naipe === 'espadas').length
  if (swordsCount >= 3) {
    lines.push('Predomínio de Espadas: atenção para sobrecarga mental, autocobrança e necessidade de descanso cognitivo.')
  }

  if (!lines.length) {
    lines.push('Sem alerta energético corporal dominante nesta sessão; manter práticas de regulação emocional e sono.')
  }

  return lines
}

const getPurposeLayer = (cards: PositionedCard[]) => {
  const lines: string[] = []
  const majorNames = cards.filter(item => item.card.arcano === 'maior').map(item => item.card.nome)

  if (!majorNames.length) {
    lines.push('Propósito em fase prática: consolidar rotina, trabalho e estrutura material com disciplina.')
    return lines
  }

  if (majorNames.includes('O Julgamento') || majorNames.includes('O Mundo')) {
    lines.push('Propósito em chamada de renascimento e conclusão de ciclo com maior responsabilidade espiritual.')
  }

  if (majorNames.includes('O Louco')) {
    lines.push('Propósito em abertura de ciclo: novo caminho pede coragem com responsabilidade.')
  }

  if (majorNames.includes('A Morte') || majorNames.includes('A Torre')) {
    lines.push('Propósito ligado a desapego de estruturas antigas para liberar evolução real.')
  }

  if (!lines.length) {
    lines.push('Propósito em amadurecimento: lições kármicas ativas pedem coerência entre intenção e ação.')
  }

  return lines
}

const getIntegratedAdvice = (
  cards: PositionedCard[],
  spreadProfile: SpreadProfile,
  consultation?: ConsultationIntake | null,
) => {
  const dominantElement = getDominantElement(cards)
  const reversedCount = cards.filter(item => item.drawn.isReversed).length
  const advicePosition = cards.find(item => includesNormalized(item.position.nome, 'conselho'))

  const personalizedAdvice: string[] = []
  if (consultation) {
    if (consultation.tipo === 'pessoal') {
      const attentive = applyGender(consultation.pessoa1.sexo, 'atento', 'atenta')
      const receptive = applyGender(consultation.pessoa1.sexo, 'receptivo', 'receptiva')
      const disciplined = applyGender(consultation.pessoa1.sexo, 'disciplinado', 'disciplinada')
      personalizedAdvice.push(
        `Direcionamento para ${consultation.pessoa1.nomeCompleto}: manter-se ${attentive}, ${receptive} e ${disciplined} durante os próximos passos.`,
      )
    } else {
      const personTwo = consultation.pessoa2
      if (personTwo) {
        const p1Open = applyGender(consultation.pessoa1.sexo, 'aberto', 'aberta')
        const p2Open = applyGender(personTwo.sexo, 'aberto', 'aberta')
        personalizedAdvice.push(
          `Direcionamento relacional: ${consultation.pessoa1.nomeCompleto} e ${personTwo.nomeCompleto} precisam de diálogo objetivo; é essencial que ${
            consultation.pessoa1.nomeCompleto
          } esteja ${p1Open} para ouvir e que ${personTwo.nomeCompleto} esteja ${p2Open} para negociar limites e responsabilidades.`,
        )
      }
    }
  }

  const directAdvice = advicePosition
    ? `Conselho da posição específica: ${advicePosition.card.nome} indica ${
        advicePosition.drawn.isReversed
          ? advicePosition.card.significado.invertido.curto
          : advicePosition.card.significado.vertical.curto
      }.`
    : null

  const elementAdvice = dominantElement
    ? `Ajuste pelo elemento dominante (${dominantElement}): ${ELEMENT_ACTION_MAP[dominantElement] || 'agir com equilíbrio entre emoção e ação'}.`
    : 'Sem elemento dominante absoluto: manter equilíbrio entre ação, emoção, razão e estrutura material.'

  const orientationAdvice =
    reversedCount > Math.floor(cards.length / 2)
      ? 'Predomínio invertido: priorize revisão de padrão, cura de base e estratégia antes de decisões definitivas.'
      : 'Predomínio vertical: mantenha execução consistente no que já demonstra resultado prático.'

  return [
    ...personalizedAdvice,
    directAdvice,
    `Direção da tiragem: ${spreadProfile.decisao}.`,
    elementAdvice,
    orientationAdvice,
    `Cautela profissional: ${spreadProfile.cautela}.`,
    'Regra de ouro: interpretar sempre combinação + posição + pergunta + contexto energético, nunca carta isolada.',
  ].filter((line): line is string => Boolean(line))
}

export const generateAdvancedSpreadSynthesis = ({
  spread,
  orderedDrawn,
  cardById,
  consultation,
}: AdvancedReadingInput): string => {
  const positioned = getPositionedCards({ spread, orderedDrawn, cardById })

  if (!positioned.length) {
    return 'Sem cartas registradas para gerar síntese avançada.'
  }

  const spreadProfile = getSpreadProfile(spread)
  const majorCount = positioned.filter(item => item.card.arcano === 'maior').length
  const minorCount = positioned.length - majorCount
  const dominantElement = getDominantElement(positioned)

  const layers = [
    { title: '1) Energia Psicológica', details: getPsychologicalLayer(positioned) },
    { title: '2) Campo Espiritual', details: getSpiritualLayer(positioned) },
    { title: '3) Tendências Futuras', details: getFutureLayer(positioned) },
    { title: '4) Arquétipos em Ação', details: getArchetypeLayer(positioned) },
    { title: '5) Dinâmica de Relacionamentos', details: getRelationshipLayer(positioned, spread) },
    { title: '6) Tempo', details: getTimingLayer(positioned) },
    { title: '7) Elementos Dominantes', details: getElementLayer(positioned) },
    { title: '8) Padrões Repetitivos', details: getPatternLayer(positioned) },
    { title: '9) Leitura Energética do Corpo', details: getBodyLayer(positioned) },
    { title: '10) Propósito e Missão', details: getPurposeLayer(positioned) },
  ]

  const integratedSummary = [
    `Síntese Integrada Final: tiragem "${spread.nome}" com foco em ${spreadProfile.foco}.`,
    `Estrutura de leitura utilizada: ${spreadProfile.estrutura}.`,
    majorCount > minorCount
      ? 'Predomínio de Arcanos Maiores: fase de lições estruturantes, decisões de impacto e reposicionamento de ciclo.'
      : 'Predomínio de Arcanos Menores: fase prática de ajustes concretos, rotina e execução diária.',
    dominantElement
      ? `Elemento dominante da sessão: ${dominantElement}.`
      : 'Sem domínio elemental único, indicando campo multifatorial.',
    buildPersonalizedIntegratedLine(consultation, spreadProfile),
  ]
    .filter((line): line is string => Boolean(line))
    .join(' ')

  const sections = [
    `Síntese Final da Tiragem: ${spread.nome}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    `Progresso: ${positioned.length}/${spread.positions.length} posições preenchidas.`,
    '',
    'Contexto do atendimento:',
    ...buildConsultationContextLines(consultation),
    '',
    'Contexto da tiragem:',
    `- Foco: ${spreadProfile.foco}`,
    `- Estrutura: ${spreadProfile.estrutura}`,
    `- Decisão-chave: ${spreadProfile.decisao}`,
    '',
    'Base posição a posição:',
    ...buildPositionDigest(positioned).map(line => `- ${line}`),
    '',
    'Leitura estruturada em 10 camadas:',
    ...layers.flatMap(layer => ['', layer.title, ...layer.details.map(detail => `- ${detail}`)]),
    '',
    integratedSummary,
    '',
    'Conselho Final Integrado:',
    ...getIntegratedAdvice(positioned, spreadProfile, consultation).map(
      line => `- ${line}`,
    ),
  ]

  return sections.join('\n')
}
