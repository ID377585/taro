import type { TeleprompterScriptInput } from "./types";

const pickAreaMessage = (input: TeleprompterScriptInput) => {
  const lowerType = input.readingTypeName.toLowerCase();
  if (lowerType.includes("amor") || lowerType.includes("reconcil")) {
    return input.card.areaMessages.relacionamentos;
  }
  if (lowerType.includes("trabalho") || lowerType.includes("finance")) {
    return input.card.areaMessages.carreira;
  }
  return input.card.areaMessages.espiritual;
};

export const buildTeleprompterScript = (input: TeleprompterScriptInput) => {
  const meaning =
    input.orientation === "REVERSED" && input.card.reversedText
      ? input.card.reversedText
      : input.card.uprightText;
  const areaMessage = pickAreaMessage(input);
  const orientationLabel = input.orientation === "REVERSED" ? "invertida" : "em luz";
  const previous = input.previousCards.length
    ? `As cartas anteriores foram ${input.previousCards.join(", ")}.`
    : "Esta é a abertura energética da leitura.";
  const secondary = input.secondaryClientName
    ? `A leitura também considera ${input.secondaryClientName}.`
    : "";
  const readingContext = input.readingTypeDescription
    ? `Campo da leitura: ${input.readingTypeDescription}`
    : `Campo da leitura: ${input.readingTypeName}.`;
  const opening = input.openingScript
    ? `Abertura sugerida: ${input.openingScript}`
    : null;
  const closing = input.closingScript
    ? `Fecho recomendado para esta linha: ${input.closingScript}`
    : "Feche este bloco com uma transição serena para a próxima carta.";
  const positionMeta =
    input.positionIndex && input.totalCards
      ? `Esta é a carta ${input.positionIndex} de ${input.totalCards}.`
      : null;

  return [
    `Carta na posição ${input.positionLabel}: ${input.card.name}, ${orientationLabel}.`,
    `Leitura para ${input.primaryClientName}. ${secondary}`.trim(),
    readingContext,
    opening,
    positionMeta,
    meaning,
    areaMessage,
    previous,
    `Palavras-chave desta passagem: ${input.card.keywords.slice(0, 4).join(", ")}.`,
    closing,
  ]
    .filter(Boolean)
    .join("\n\n");
};
