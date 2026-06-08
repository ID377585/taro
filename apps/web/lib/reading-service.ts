import { prisma } from "@taro/database";
import {
  CardOrientation,
  Prisma,
  ReadingClientRole,
  ReadingStatus,
  type UserRole,
} from "@prisma/client";
import { buildTeleprompterScript, getTarotCardBySlug } from "@taro/tarot-core";
import { createGuestToken, createRoomCode, hashGuestToken } from "./tokens";

type SessionUser = {
  id: string;
  role: UserRole;
};

const readingInclude = {
  readingType: true,
  clients: {
    include: {
      client: true,
    },
    orderBy: {
      role: "asc" as const,
    },
  },
  cards: {
    include: {
      card: true,
    },
    orderBy: {
      position: "asc" as const,
    },
  },
  guestLinks: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
  events: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
} as const;

const assertReadingAccess = async (readingId: string, user: SessionUser) => {
  const reading = await prisma.reading.findUnique({
    where: { id: readingId },
    include: readingInclude,
  });

  if (!reading) return null;
  if (user.role !== "ADMIN" && reading.tarologistId !== user.id) return null;
  return reading;
};

const liveSignalEventTypes = [
  "live.host_ready",
  "live.guest_ready",
  "live.webrtc_offer",
  "live.webrtc_answer",
  "live.host_ice_candidate",
  "live.guest_ice_candidate",
  "live.card_locked",
  "live.card_confirmed",
  "live.peer_left",
] as const;

type LiveSignalEventType = (typeof liveSignalEventTypes)[number];

const isLiveSignalEventType = (eventType: string): eventType is LiveSignalEventType =>
  liveSignalEventTypes.includes(eventType as LiveSignalEventType);

export const getDashboardSnapshot = async (user: SessionUser) => {
  const readings = await prisma.reading.findMany({
    where: user.role === "ADMIN" ? {} : { tarologistId: user.id },
    include: {
      readingType: true,
      clients: {
        include: {
          client: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 6,
  });

  const [typesCount, totalCards, totalReadings] = await Promise.all([
    prisma.readingType.count({ where: { active: true } }),
    prisma.tarotCard.count(),
    prisma.reading.count({
      where: user.role === "ADMIN" ? {} : { tarologistId: user.id },
    }),
  ]);

  return {
    readings,
    stats: {
      activeReadingTypes: typesCount,
      totalCards,
      savedReadings: totalReadings,
    },
  };
};

export const getActiveReadingTypes = async () =>
  prisma.readingType.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

export const createReadingSession = async (input: {
  tarologistId: string;
  readingTypeId: string;
  notes?: string;
  primary: {
    fullName: string;
    birthDate?: string;
    phone?: string;
  };
  secondary?: {
    fullName: string;
    birthDate?: string;
    phone?: string;
  } | null;
}) => {
  const guestToken = createGuestToken();
  const guestTokenHash = hashGuestToken(guestToken);

  const reading = await prisma.$transaction(async tx => {
    const primaryClient = await tx.client.create({
      data: {
        fullName: input.primary.fullName,
        birthDate: input.primary.birthDate ? new Date(input.primary.birthDate) : null,
        phone: input.primary.phone || null,
      },
    });

    const secondaryClient = input.secondary?.fullName
      ? await tx.client.create({
          data: {
            fullName: input.secondary.fullName,
            birthDate: input.secondary.birthDate ? new Date(input.secondary.birthDate) : null,
            phone: input.secondary.phone || null,
          },
        })
      : null;

    const createdReading = await tx.reading.create({
      data: {
        tarologistId: input.tarologistId,
        readingTypeId: input.readingTypeId,
        roomCode: createRoomCode(),
        notes: input.notes || null,
        status: ReadingStatus.DRAFT,
        clients: {
          create: [
            {
              clientId: primaryClient.id,
              role: ReadingClientRole.PRIMARY,
            },
            ...(secondaryClient
              ? [
                  {
                    clientId: secondaryClient.id,
                    role: ReadingClientRole.SECONDARY,
                  },
                ]
              : []),
          ],
        },
        guestLinks: {
          create: {
            tokenHash: guestTokenHash,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          },
        },
        events: {
          create: {
            eventType: "reading.created",
            payload: { createdBy: input.tarologistId },
          },
        },
      },
      include: readingInclude,
    });

    return createdReading;
  });

  return { reading, guestToken };
};

export const getReadingByIdForHost = async (readingId: string, user: SessionUser) =>
  assertReadingAccess(readingId, user);

export const getReadingByGuestToken = async (token: string) => {
  const tokenHash = hashGuestToken(token);
  const guestLink = await prisma.readingGuestLink.findUnique({
    where: { tokenHash },
    include: {
      reading: {
        include: {
          readingType: true,
          clients: {
            include: {
              client: true,
            },
            where: {
              role: ReadingClientRole.PRIMARY,
            },
          },
        },
      },
    },
  });

  if (!guestLink) return null;
  if (guestLink.revokedAt) return null;
  if (guestLink.expiresAt.getTime() < Date.now()) return null;

  return guestLink;
};

export const confirmReadingCard = async (input: {
  readingId: string;
  user: SessionUser;
  cardSlug: string;
  position: number;
  orientation: CardOrientation;
  confidence?: number | null;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  const card = await prisma.tarotCard.findUnique({
    where: { slug: input.cardSlug },
  });

  if (!card) return null;
  const sourceCard = getTarotCardBySlug(input.cardSlug);

  const primaryClient = reading.clients.find(client => client.role === ReadingClientRole.PRIMARY);
  const secondaryClient = reading.clients.find(
    client => client.role === ReadingClientRole.SECONDARY,
  );

  const previousCards = reading.cards
    .filter(item => item.position < input.position)
    .map(item => item.card.name);
  const totalCards = reading.readingType.cardsCount;
  const positionContext = reading.readingType.defaultSpread
    ?.split("\n")
    .find(line => line.trim().startsWith(`${input.position}.`));

  const generatedText = buildTeleprompterScript({
    readingTypeName: reading.readingType.name,
    readingTypeDescription: reading.readingType.description,
    openingScript: input.position === 1 ? reading.readingType.openingScript : null,
    closingScript: input.position === totalCards ? reading.readingType.closingScript : null,
    primaryClientName: primaryClient?.client.fullName ?? "Consulente",
    secondaryClientName: secondaryClient?.client.fullName ?? null,
    positionLabel: positionContext ?? `${input.position}`,
    positionIndex: input.position,
    totalCards,
    card: {
      name: card.name,
      uprightText: card.uprightText,
      reversedText: card.reversedText,
      keywords: sourceCard?.keywords ?? card.keywords,
      areaMessages: sourceCard?.areaMessages ?? {},
    },
    orientation: input.orientation,
    previousCards,
  });

  const savedCard = await prisma.readingCard.upsert({
    where: {
      readingId_position: {
        readingId: input.readingId,
        position: input.position,
      },
    },
    update: {
      cardId: card.id,
      orientation: input.orientation,
      confidence: input.confidence ?? null,
      confirmedByUser: true,
      generatedText,
      detectedAt: new Date(),
    },
    create: {
      readingId: input.readingId,
      cardId: card.id,
      position: input.position,
      orientation: input.orientation,
      confidence: input.confidence ?? null,
      confirmedByUser: true,
      generatedText,
    },
    include: {
      card: true,
    },
  });

  await prisma.readingEvent.create({
    data: {
      readingId: input.readingId,
      eventType: "reading.card_confirmed",
      payload: {
        position: input.position,
        cardSlug: input.cardSlug,
        orientation: input.orientation,
      },
    },
  });

  return savedCard;
};

export const appendReadingEventForHost = async (input: {
  readingId: string;
  user: SessionUser;
  eventType: string;
  payload?: Record<string, unknown>;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  return prisma.readingEvent.create({
    data: {
      readingId: input.readingId,
      eventType: input.eventType,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
};

export const appendReadingEventByGuestToken = async (input: {
  token: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) => {
  const guestLink = await getReadingByGuestToken(input.token);
  if (!guestLink) return null;

  return prisma.readingEvent.create({
    data: {
      readingId: guestLink.readingId,
      eventType: input.eventType,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
};

export const appendLiveSignalForHost = async (input: {
  readingId: string;
  user: SessionUser;
  eventType: string;
  payload?: Record<string, unknown>;
}) => {
  if (!isLiveSignalEventType(input.eventType)) return null;

  return appendReadingEventForHost({
    readingId: input.readingId,
    user: input.user,
    eventType: input.eventType,
    payload: input.payload,
  });
};

export const appendLiveSignalByGuestToken = async (input: {
  token: string;
  eventType: string;
  payload?: Record<string, unknown>;
}) => {
  if (!isLiveSignalEventType(input.eventType)) return null;

  return appendReadingEventByGuestToken({
    token: input.token,
    eventType: input.eventType,
    payload: input.payload,
  });
};

export const getLiveSignalsForHost = async (input: {
  readingId: string;
  user: SessionUser;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  const signals = await prisma.readingEvent.findMany({
    where: {
      readingId: input.readingId,
      eventType: {
        in: [...liveSignalEventTypes],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 160,
  });

  return signals.reverse();
};

export const getLiveSignalsByGuestToken = async (token: string) => {
  const guestLink = await getReadingByGuestToken(token);
  if (!guestLink) return null;

  const signals = await prisma.readingEvent.findMany({
    where: {
      readingId: guestLink.readingId,
      eventType: {
        in: [...liveSignalEventTypes],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 160,
  });

  return signals.reverse();
};

export const updateReadingStatus = async (input: {
  readingId: string;
  user: SessionUser;
  status: ReadingStatus;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  const updatedReading = await prisma.reading.update({
    where: { id: input.readingId },
    data: { status: input.status },
  });

  await prisma.readingEvent.create({
    data: {
      readingId: input.readingId,
      eventType: "reading.status_changed",
      payload: {
        status: input.status,
      },
    },
  });

  return updatedReading;
};

export const revokeReadingGuestLinks = async (input: {
  readingId: string;
  user: SessionUser;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  const revokedAt = new Date();
  const result = await prisma.readingGuestLink.updateMany({
    where: {
      readingId: input.readingId,
      revokedAt: null,
    },
    data: {
      revokedAt,
    },
  });

  await prisma.readingEvent.create({
    data: {
      readingId: input.readingId,
      eventType: "reading.guest_link_revoked",
      payload: {
        revokedCount: result.count,
      },
    },
  });

  return result.count;
};

export const regenerateReadingGuestLink = async (input: {
  readingId: string;
  user: SessionUser;
}) => {
  const reading = await assertReadingAccess(input.readingId, input.user);
  if (!reading) return null;

  const token = createGuestToken();
  const tokenHash = hashGuestToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.$transaction(async tx => {
    await tx.readingGuestLink.updateMany({
      where: {
        readingId: input.readingId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await tx.readingGuestLink.create({
      data: {
        readingId: input.readingId,
        tokenHash,
        expiresAt,
      },
    });

    await tx.readingEvent.create({
      data: {
        readingId: input.readingId,
        eventType: "reading.guest_link_regenerated",
        payload: {
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });

  return {
    token,
    expiresAt,
  };
};
