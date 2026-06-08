type ReadingForReport = {
  id: string;
  roomCode: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  readingType: {
    name: string;
    description: string | null;
  };
  clients: Array<{
    role: "PRIMARY" | "SECONDARY";
    client: {
      fullName: string;
      birthDate: Date | null;
      phone: string | null;
    };
  }>;
  cards: Array<{
    position: number;
    orientation: "UPRIGHT" | "REVERSED";
    confidence: number | null;
    generatedText: string | null;
    card: {
      name: string;
    };
  }>;
  events: Array<{
    eventType: string;
    createdAt: Date;
  }>;
};

const formatDate = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
      }).format(value)
    : "não informado";

export const buildReadingMarkdownReport = (reading: ReadingForReport) => {
  const primary = reading.clients.find(client => client.role === "PRIMARY")?.client;
  const secondary = reading.clients.find(client => client.role === "SECONDARY")?.client;
  const cardsBlock = reading.cards.length
    ? reading.cards
        .sort((a, b) => a.position - b.position)
        .map(card =>
          [
            `## ${card.position}. ${card.card.name}`,
            `- Orientação: ${card.orientation}`,
            `- Confiança: ${card.confidence ?? "não informada"}`,
            card.generatedText ? `\n${card.generatedText}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")
    : "Nenhuma carta confirmada até o momento.";

  const timelineBlock = reading.events.length
    ? reading.events
        .slice()
        .reverse()
        .map(
          event =>
            `- ${new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(event.createdAt)} • ${event.eventType}`,
        )
        .join("\n")
    : "- Nenhum evento registrado.";

  return [
    `# Relatório da leitura ${reading.id}`,
    `- Sala: ${reading.roomCode}`,
    `- Status: ${reading.status}`,
    `- Tipo: ${reading.readingType.name}`,
    reading.readingType.description ? `- Descrição: ${reading.readingType.description}` : null,
    `- Criada em: ${new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(reading.createdAt)}`,
    "",
    "## Consulentes",
    `- Principal: ${primary?.fullName ?? "não informado"} (${formatDate(primary?.birthDate ?? null)})`,
    primary?.phone ? `- Telefone principal: ${primary.phone}` : null,
    secondary
      ? `- Segunda pessoa: ${secondary.fullName} (${formatDate(secondary.birthDate)})`
      : "- Segunda pessoa: não informada",
    secondary?.phone ? `- Telefone segunda pessoa: ${secondary.phone}` : null,
    reading.notes ? `- Observações internas: ${reading.notes}` : null,
    "",
    "## Cartas confirmadas",
    cardsBlock,
    "",
    "## Timeline",
    timelineBlock,
  ]
    .filter(Boolean)
    .join("\n");
};
