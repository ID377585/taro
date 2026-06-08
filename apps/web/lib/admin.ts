import { redirect } from "next/navigation";
import { hashPassword, prisma } from "@taro/database";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { requireAuthUser } from "./session";

const readingTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  defaultSpread: z.string().optional(),
  cardsCount: z.coerce.number().int().min(1).max(21),
  openingScript: z.string().optional(),
  closingScript: z.string().optional(),
  promptTemplate: z.string().optional(),
  active: z.boolean().optional(),
});

const userSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "TAROLOGIST"]),
});

const tarotCardSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  arcana: z.string().min(2),
  suit: z.string().optional(),
  number: z.coerce.number().int().nullable().optional(),
  imageUrl: z.string().optional(),
  uprightText: z.string().min(10),
  reversedText: z.string().optional(),
  keywords: z.string().optional(),
});

export const requireAdminUser = async () => {
  const user = await requireAuthUser();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
};

export const getAdminReadingTypes = async () =>
  prisma.readingType.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

export const saveReadingType = async (input: z.input<typeof readingTypeSchema>) => {
  const parsed = readingTypeSchema.parse(input);

  if (parsed.id) {
    return prisma.readingType.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description || null,
        defaultSpread: parsed.defaultSpread || null,
        cardsCount: parsed.cardsCount,
        openingScript: parsed.openingScript || null,
        closingScript: parsed.closingScript || null,
        promptTemplate: parsed.promptTemplate || null,
        active: parsed.active ?? true,
      },
    });
  }

  return prisma.readingType.create({
    data: {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description || null,
      defaultSpread: parsed.defaultSpread || null,
      cardsCount: parsed.cardsCount,
      openingScript: parsed.openingScript || null,
      closingScript: parsed.closingScript || null,
      promptTemplate: parsed.promptTemplate || null,
      active: parsed.active ?? true,
    },
  });
};

export const toggleReadingType = async (id: string) => {
  const current = await prisma.readingType.findUnique({
    where: { id },
  });

  if (!current) return null;

  return prisma.readingType.update({
    where: { id },
    data: {
      active: !current.active,
    },
  });
};

export const createDashboardUser = async (input: z.input<typeof userSchema>) => {
  const parsed = userSchema.parse(input);

  return prisma.user.create({
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.password),
      role: parsed.role === "ADMIN" ? UserRole.ADMIN : UserRole.TAROLOGIST,
    },
  });
};

export const getAdminTarotCards = async () =>
  prisma.tarotCard.findMany({
    orderBy: [{ arcana: "asc" }, { legacyId: "asc" }],
  });

export const saveTarotCard = async (input: z.input<typeof tarotCardSchema>) => {
  const parsed = tarotCardSchema.parse(input);
  const keywords = (parsed.keywords || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (parsed.id) {
    return prisma.tarotCard.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name,
        slug: parsed.slug,
        arcana: parsed.arcana,
        suit: parsed.suit || null,
        number: parsed.number ?? null,
        imageUrl: parsed.imageUrl || null,
        uprightText: parsed.uprightText,
        reversedText: parsed.reversedText || null,
        keywords,
      },
    });
  }

  const lastCard = await prisma.tarotCard.findFirst({
    orderBy: { legacyId: "desc" },
  });

  return prisma.tarotCard.create({
    data: {
      legacyId: (lastCard?.legacyId ?? 0) + 1,
      name: parsed.name,
      slug: parsed.slug,
      arcana: parsed.arcana,
      suit: parsed.suit || null,
      number: parsed.number ?? null,
      imageUrl: parsed.imageUrl || null,
      uprightText: parsed.uprightText,
      reversedText: parsed.reversedText || null,
      keywords,
    },
  });
};
