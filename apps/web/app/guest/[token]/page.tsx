import { notFound } from "next/navigation";
import { Panel, SectionTitle } from "@taro/ui";
import { GuestLiveRoom } from "@/components/guest-live-room";
import { getPublicRuntimeConfig } from "@/lib/env";
import { getReadingByGuestToken } from "@/lib/reading-service";

export default async function GuestRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guestLink = await getReadingByGuestToken(token);

  if (!guestLink) notFound();

  const runtimeConfig = getPublicRuntimeConfig();
  const primary = guestLink.reading.clients[0]?.client;

  return (
    <main className="grain-bg min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Panel>
          <SectionTitle
            eyebrow="Sala do consulente"
            title={guestLink.reading.readingType.name}
            description={`Acompanhando a leitura de ${primary?.fullName ?? "Consulente"}.`}
          />
        </Panel>

        <GuestLiveRoom
          guestToken={token}
          realtimeServerUrl={runtimeConfig.realtimeServerUrl}
          roomCode={guestLink.reading.roomCode}
        />
      </div>
    </main>
  );
}
