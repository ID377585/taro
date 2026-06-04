import Link from "next/link";
import { Panel, SectionTitle, StatusPill } from "@taro/ui";
import { getReadingHistory } from "@/lib/history";
import { requireAuthUser } from "@/lib/session";

export default async function HistoryPage() {
  const user = await requireAuthUser();
  const history = await getReadingHistory({
    id: user.id,
    role: user.role,
  });

  return (
    <main className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle
            eyebrow="Histórico"
            title="Leituras registradas"
            description="Resumo consolidado de clientes, cartas confirmadas, status e acesso rápido às salas já criadas."
          />
          <Link className="primary-button" href="/dashboard/readings/new">
            Criar leitura
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          {history.length ? (
            history.map(reading => (
              <article
                key={reading.id}
                className="rounded-[24px] border border-stone-200 bg-stone-50 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-950">
                      {reading.readingType.name}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {reading.primaryClient?.fullName ?? "Consulente principal"}{" "}
                      {reading.secondaryClient ? `• ${reading.secondaryClient.fullName}` : ""}
                    </p>
                  </div>
                  <StatusPill
                    label={reading.status}
                    tone={reading.status === "DRAFT" ? "warning" : "neutral"}
                  />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[20px] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Sala</p>
                    <strong className="mt-2 block text-lg text-stone-950">{reading.roomCode}</strong>
                  </div>
                  <div className="rounded-[20px] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Cartas</p>
                    <strong className="mt-2 block text-lg text-stone-950">{reading.cards.length}</strong>
                  </div>
                  <div className="rounded-[20px] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Guest link</p>
                    <strong className="mt-2 block text-lg text-stone-950">
                      {reading.guestLinks.length ? "Ativo" : "Ausente"}
                    </strong>
                  </div>
                  <div className="rounded-[20px] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Criado em</p>
                    <strong className="mt-2 block text-lg text-stone-950">
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(reading.createdAt)}
                    </strong>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="secondary-button" href={`/dashboard/readings/${reading.id}`}>
                    Abrir detalhes
                  </Link>
                  <Link className="secondary-button" href={`/dashboard/readings/${reading.id}/live`}>
                    Abrir host room
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-stone-600">Nenhuma leitura encontrada.</p>
          )}
        </div>
      </Panel>
    </main>
  );
}
