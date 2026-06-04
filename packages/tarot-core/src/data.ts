import rawCards from "../data/cards.json";
import rawSpreads from "../data/spreads.json";
import type { ReadingTypeSeed, TarotCardSeed } from "./types";

type LegacyCard = (typeof rawCards.cards)[number];
type LegacySpread = (typeof rawSpreads.spreads)[number];

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleCase = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map(item => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");

export const tarotCards: TarotCardSeed[] = rawCards.cards.map((card: LegacyCard) => ({
  legacyId: card.id,
  name: card.nome,
  slug: normalizeText(card.nome),
  arcana: card.arcano === "maior" ? "MAJOR" : "MINOR",
  suit: card.naipe ? titleCase(card.naipe) : null,
  number: typeof card.numero === "number" ? card.numero : null,
  imageUrl: card.imagemUrl ?? null,
  uprightText: card.significado.vertical.longo,
  reversedText: card.significado.invertido?.longo ?? null,
  keywords: card.tags ?? [],
  areaMessages: card.areas ?? {},
}));

export const readingTypes: ReadingTypeSeed[] = rawSpreads.spreads.map((spread: LegacySpread) => {
  const cardsCount = spread.positions.length;
  return {
    name: spread.nome,
    slug: spread.id,
    description: spread.descricao,
    defaultSpread: spread.positions
      .map(position => `${position.index}. ${position.nome}: ${position.descricao}`)
      .join("\n"),
    cardsCount,
    openingScript: `Vamos abrir a leitura ${spread.nome} com ${cardsCount} carta${cardsCount > 1 ? "s" : ""}.`,
    closingScript: `Encerramos a leitura ${spread.nome} acolhendo o que foi mostrado com clareza e responsabilidade espiritual.`,
    promptTemplate: `Tipo de leitura ${spread.nome}. Use ${cardsCount} posições e respeite o contexto do consulente.`,
    sourceSpreadId: spread.id,
  };
});

export const getTarotCardBySlug = (slug: string) =>
  tarotCards.find(card => card.slug === slug) ?? null;

export const getReadingTypeBySlug = (slug: string) =>
  readingTypes.find(type => type.slug === slug) ?? null;
