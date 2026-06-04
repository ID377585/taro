import { describe, expect, it } from "vitest";
import { buildReadingMarkdownReport } from "./reporting";

describe("buildReadingMarkdownReport", () => {
  it("renders reading summary with clients, cards and timeline", () => {
    const report = buildReadingMarkdownReport({
      id: "reading_1",
      roomCode: "ROOM123",
      status: "LIVE",
      notes: "Cliente pediu foco em reconciliação.",
      createdAt: new Date("2026-06-04T10:00:00.000Z"),
      readingType: {
        name: "Amor",
        description: "Leitura afetiva.",
      },
      clients: [
        {
          role: "PRIMARY",
          client: {
            fullName: "Marina",
            birthDate: new Date("1990-02-10T00:00:00.000Z"),
            phone: "11999999999",
          },
        },
      ],
      cards: [
        {
          position: 1,
          orientation: "UPRIGHT",
          confidence: 0.91,
          generatedText: "Texto da carta confirmada.",
          card: {
            name: "O Louco",
          },
        },
      ],
      events: [
        {
          eventType: "reading.created",
          createdAt: new Date("2026-06-04T10:00:00.000Z"),
        },
      ],
    });

    expect(report).toContain("# Relatório da leitura reading_1");
    expect(report).toContain("Marina");
    expect(report).toContain("O Louco");
    expect(report).toContain("reading.created");
  });
});
