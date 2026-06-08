import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Panel, SectionTitle, StatusPill } from "@taro/ui";
import { buildReadingMarkdownReport } from "@/lib/reporting";
import {
  getReadingByIdForHost,
  regenerateReadingGuestLink,
  revokeReadingGuestLinks,
} from "@/lib/reading-service";
import { requireAuthUser } from "@/lib/session";

export default async function ReadingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guestToken?: string }>;
}) {
  const { id } = await params;
  const { guestToken } = await searchParams;
  const user = await requireAuthUser();
  const reading = await getReadingByIdForHost(id, { id: user.id, role: user.role });

  if (!reading) notFound();

  const activeGuestLinkToken = guestToken || "guest token oculto";
  const primary = reading.clients.find(client => client.role === "PRIMARY");
  const secondary = reading.clients.find(client => client.role === "SECONDARY");
  const activeGuestLink = reading.guestLinks.find(link => !link.revokedAt);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const guestPath = `/guest/${activeGuestLinkToken}`;
  const guestUrl = guestToken && host ? `${protocol}://${host}${guestPath}` : guestPath;
  const report = buildReadingMarkdownReport(reading);

  async function handleRegenerateGuestLink() {
    "use server";

    const sessionUser = await requireAuthUser();
    const result = await regenerateReadingGuestLink({
      readingId: id,
      user: {
        id: sessionUser.id,
        role: sessionUser.role,
      },
    });

    if (!result) return;
    redirect(`/dashboard/readings/${id}?guestToken=${result.token}`);
  }

  async function handleRevokeGuestLink() {
    "use server";

    const sessionUser = await requireAuthUser();
    await revokeReadingGuestLinks({
      readingId: id,
      user: {
        id: sessionUser.id,
        role: sessionUser.role,
      },
    });
    redirect(`/dashboard/readings/${id}`);
  }

  return (
    <main className="space-y-6">
      <Panel className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle
            eyebrow="Sessão"
            title={reading.readingType.name}
            description={`Sala ${reading.roomCode} para ${primary?.client.fullName ?? "Consulente"}.`}
          />
          <StatusPill label={reading.status} tone={reading.status === "DRAFT" ? "warning" : "neutral"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] bg-stone-50 p-5">
            <p className="text-sm text-stone-500">Consulente principal</p>
            <strong className="mt-2 block text-xl text-stone-950">
              {primary?.client.fullName ?? "Não definido"}
            </strong>
          </div>
          <div className="rounded-[24px] bg-stone-50 p-5">
            <p className="text-sm text-stone-500">Segunda pessoa</p>
            <strong className="mt-2 block text-xl text-stone-950">
              {secondary?.client.fullName ?? "Não informada"}
            </strong>
          </div>
          <div className="rounded-[24px] bg-stone-50 p-5">
            <p className="text-sm text-stone-500">Guest URL</p>
            <code className="mt-2 block break-all text-sm text-stone-800">
              {guestUrl}
            </code>
            <p className="mt-3 text-xs text-stone-500">
              {activeGuestLink
                ? `Ativo até ${new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(activeGuestLink.expiresAt)}`
                : "Nenhum guest link ativo."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link className="primary-button" href={`/dashboard/readings/${reading.id}/live`}>
            Abrir host live room
          </Link>
          {guestToken ? (
            <Link className="secondary-button" href={`/guest/${guestToken}`} target="_blank">
              Abrir sala do cliente
            </Link>
          ) : null}
          <a
            className="secondary-button"
            href={`/api/readings/${reading.id}/report`}
            rel="noreferrer"
            target="_blank"
          >
            Abrir relatório
          </a>
          <form action={handleRegenerateGuestLink}>
            <button className="secondary-button" type="submit">
              Regenerar guest link
            </button>
          </form>
          <form action={handleRevokeGuestLink}>
            <button className="secondary-button" type="submit">
              Revogar guest link
            </button>
          </form>
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          eyebrow="Cartas"
          title="Histórico confirmado"
          description="As confirmações salvas alimentam o teleprompter e o histórico da leitura."
        />

        <div className="mt-6 grid gap-4">
          {reading.cards.length ? (
            reading.cards.map(card => (
              <div key={card.id} className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                <strong className="text-stone-950">
                  {card.position}. {card.card.name}
                </strong>
                <p className="mt-2 text-sm text-stone-600">
                  {card.generatedText || "Sem texto salvo para esta carta."}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-600">Nenhuma carta confirmada ainda.</p>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          eyebrow="Relatório"
          title="Resumo do atendimento"
          description="Versão textual consolidada da leitura para revisão interna e exportação."
        />

        <pre className="mt-6 overflow-x-auto rounded-[24px] bg-stone-950 p-5 text-sm leading-7 text-stone-100">
          {report}
        </pre>
      </Panel>

      <Panel>
        <SectionTitle
          eyebrow="Eventos"
          title="Timeline da sessão"
          description="Abertura da sala, mudanças de status e confirmações relevantes ficam registradas aqui."
        />

        <div className="mt-6 grid gap-4">
          {reading.events.length ? (
            reading.events.map(event => (
              <div key={event.id} className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong className="text-stone-950">{event.eventType}</strong>
                  <span className="text-sm text-stone-500">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(event.createdAt)}
                  </span>
                </div>
                {event.payload ? (
                  <pre className="mt-3 overflow-x-auto text-xs text-stone-600">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-600">Nenhum evento registrado ainda.</p>
          )}
        </div>
      </Panel>
    </main>
  );
}
