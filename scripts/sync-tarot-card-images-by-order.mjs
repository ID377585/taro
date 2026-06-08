import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const mapPath = path.join(
  process.cwd(),
  "packages/vision-core/src/data/tarot-vision-mark-v2-map.json"
);

const cardsMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function expectedByNumberAndSuit(card) {
  if (card.id <= 21) {
    return {
      arcana: "MAJOR",
      suit: null,
      number: card.id,
    };
  }

  const suitRanges = [
    { group: "copas", suitAliases: ["copas", "cups"], start: 22 },
    { group: "ouros", suitAliases: ["ouros", "pentacles", "coins"], start: 36 },
    { group: "espadas", suitAliases: ["espadas", "swords"], start: 50 },
    { group: "paus", suitAliases: ["paus", "wands"], start: 64 },
  ];

  const range = suitRanges.find((item) => item.group === card.group);
  if (!range) return null;

  const number = card.id - range.start + 1;

  return {
    arcana: "MINOR",
    suitAliases: range.suitAliases,
    number,
  };
}

const dbCards = await prisma.tarotCard.findMany({
  orderBy: [{ arcana: "asc" }, { suit: "asc" }, { number: "asc" }, { name: "asc" }],
});

let updated = 0;
const notFound = [];

for (const card of cardsMap) {
  const byName = dbCards.find(
    (dbCard) =>
      normalize(dbCard.slug) === normalize(card.slug) ||
      normalize(dbCard.name) === normalize(card.title)
  );

  const expected = expectedByNumberAndSuit(card);

  const byStructure = expected
    ? dbCards.find((dbCard) => {
        const dbArcana = String(dbCard.arcana || "").toUpperCase();
        const dbSuit = normalize(dbCard.suit);
        const dbNumber = Number(dbCard.number);

        if (expected.arcana === "MAJOR") {
          return dbArcana === "MAJOR" && dbNumber === expected.number;
        }

        return (
          dbArcana === "MINOR" &&
          dbNumber === expected.number &&
          expected.suitAliases.some((alias) => dbSuit === alias)
        );
      })
    : null;

  const target = byName || byStructure;

  if (!target) {
    notFound.push({
      id: card.id,
      title: card.title,
      group: card.group,
      imageUrl: card.imageUrl,
    });
    continue;
  }

  await prisma.tarotCard.update({
    where: { id: target.id },
    data: { imageUrl: card.imageUrl },
  });

  updated++;
}

await prisma.$disconnect();

console.log(
  JSON.stringify(
    {
      dbCards: dbCards.length,
      mapCards: cardsMap.length,
      updated,
      notFoundCount: notFound.length,
      notFound,
    },
    null,
    2
  )
);

if (updated !== 78) {
  process.exitCode = 1;
}
