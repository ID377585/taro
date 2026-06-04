import { tarotCards } from "@taro/tarot-core";
import { notFound } from "next/navigation";
import { Panel, SectionTitle } from "@taro/ui";
import { HostLiveRoom } from "@/components/host-live-room";
import { getPublicRuntimeConfig } from "@/lib/env";
import { getReadingByIdForHost } from "@/lib/reading-service";
import { requireAuthUser } from "@/lib/session";

export default async function ReadingLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthUser();
  const reading = await getReadingByIdForHost(id, { id: user.id, role: user.role });

  if (!reading) notFound();

  const runtimeConfig = getPublicRuntimeConfig();

  return (
    <main className="space-y-6">
      <Panel>
        <SectionTitle
          eyebrow="Ao vivo"
          title="Host room privado"
          description="Teleprompter, buffer de estabilidade e confirmação manual ficam apenas nesta sala."
        />
      </Panel>

      <HostLiveRoom
        cards={tarotCards.map(card => ({ slug: card.slug, name: card.name }))}
        confirmedCards={reading.cards.map(card => ({
          id: card.id,
          position: card.position,
          cardName: card.card.name,
          generatedText: card.generatedText,
        }))}
        initialEvents={reading.events.map(event => ({
          id: event.id,
          eventType: event.eventType,
          payload:
            event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
              ? (event.payload as Record<string, unknown>)
              : null,
          createdAt: event.createdAt.toISOString(),
        }))}
        initialStatus={reading.status}
        readingId={reading.id}
        realtimeServerUrl={runtimeConfig.realtimeServerUrl}
        roomCode={reading.roomCode}
      />
    </main>
  );
}
