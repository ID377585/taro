import { prisma } from "@taro/database";
import { ReadingClientRole, type UserRole } from "@prisma/client";

type SessionUser = {
  id: string;
  role: UserRole;
};

export const getReadingHistory = async (user: SessionUser) =>
  prisma.reading.findMany({
    where: user.role === "ADMIN" ? {} : { tarologistId: user.id },
    include: {
      readingType: true,
      clients: {
        include: {
          client: true,
        },
        orderBy: {
          role: "asc",
        },
      },
      cards: {
        include: {
          card: true,
        },
        orderBy: {
          position: "asc",
        },
      },
      guestLinks: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  }).then(readings =>
    readings.map(reading => ({
      ...reading,
      primaryClient:
        reading.clients.find(item => item.role === ReadingClientRole.PRIMARY)?.client ?? null,
      secondaryClient:
        reading.clients.find(item => item.role === ReadingClientRole.SECONDARY)?.client ?? null,
    })),
  );
