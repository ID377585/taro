import { describe, expect, it } from "vitest";
import { buildTeleprompterScript, tarotCards } from "./index";

describe("buildTeleprompterScript", () => {
  it("builds deterministic text from the provided card", () => {
    const script = buildTeleprompterScript({
      readingTypeName: "Amor",
      readingTypeDescription: "Leitura afetiva para vínculo e reciprocidade.",
      openingScript: "Abra com acolhimento e escuta sensível.",
      closingScript: "Conecte esta carta à próxima camada emocional.",
      primaryClientName: "Marina",
      positionLabel: "1 - Mensagem",
      positionIndex: 1,
      totalCards: 3,
      card: tarotCards[0],
      orientation: "UPRIGHT",
      previousCards: [],
    });

    expect(script).toContain("O Louco");
    expect(script).toContain("Marina");
    expect(script).toContain("carta 1 de 3");
    expect(script).toContain("Abertura sugerida");
  });
});
