import { PrismaClient, UserRole } from "@prisma/client";
import { readingTypes, tarotCards } from "../../tarot-core/src/index";
import { hashPassword } from "./password";

const prisma = new PrismaClient();

const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@taro.local";
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

async function main() {
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Taro Admin",
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: UserRole.ADMIN,
    },
  });

  for (const type of readingTypes) {
    await prisma.readingType.upsert({
      where: { slug: type.slug },
      update: {
        name: type.name,
        description: type.description,
        defaultSpread: type.defaultSpread,
        cardsCount: type.cardsCount,
        openingScript: type.openingScript,
        closingScript: type.closingScript,
        promptTemplate: type.promptTemplate,
        sourceSpreadId: type.sourceSpreadId,
        active: true,
      },
      create: {
        name: type.name,
        slug: type.slug,
        description: type.description,
        defaultSpread: type.defaultSpread,
        cardsCount: type.cardsCount,
        openingScript: type.openingScript,
        closingScript: type.closingScript,
        promptTemplate: type.promptTemplate,
        sourceSpreadId: type.sourceSpreadId,
        active: true,
      },
    });
  }

  for (const card of tarotCards) {
    await prisma.tarotCard.upsert({
      where: { slug: card.slug },
      update: {
        legacyId: card.legacyId,
        name: card.name,
        arcana: card.arcana,
        suit: card.suit,
        number: card.number,
        imageUrl: card.imageUrl,
        uprightText: card.uprightText,
        reversedText: card.reversedText,
        keywords: card.keywords,
      },
      create: {
        legacyId: card.legacyId,
        name: card.name,
        slug: card.slug,
        arcana: card.arcana,
        suit: card.suit,
        number: card.number,
        imageUrl: card.imageUrl,
        uprightText: card.uprightText,
        reversedText: card.reversedText,
        keywords: card.keywords,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        seededAdmin: adminEmail,
        cards: tarotCards.length,
        readingTypes: readingTypes.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
