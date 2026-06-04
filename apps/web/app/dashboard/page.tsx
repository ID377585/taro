import Link from "next/link";
import { Panel, SectionTitle, StatusPill } from "@taro/ui";
import { getDashboardSnapshot } from "@/lib/reading-service";
import { requireAuthUser } from "@/lib/session";
import { getServerEnvStatus } from "@/lib/env";

export default async function DashboardPage() {
  const user = await requireAuthUser();
  const snapshot = await getDashboardSnapshot({
    id: user.id,
    role: user.role,
  });
  const envStatus = getServerEnvStatus();

  return (
    <main className="space-y-6">
      <Panel className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <SectionTitle
          eyebrow="Status"
          title="Base do rebuild ativa"
          description="Autenticação, catálogo, criação de leitura e salas host/guest já existem nesta fundação."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] bg-stone-950 p-5 text-stone-50">
            <p className="text-sm text-stone-300">Leituras recentes</p>
            <strong className="mt-2 block text-4xl">{snapshot.stats.savedReadings}</strong>
          </div>
          <div className="rounded-[24px] bg-white p-5">
            <p className="text-sm text-stone-500">Tipos ativos</p>
            <strong className="mt-2 block text-4xl text-stone-950">
              {snapshot.stats.activeReadingTypes}
            </strong>
          </div>
          <div className="rounded-[24px] bg-white p-5">
            <p className="text-sm text-stone-500">Cartas seedadas</p>
            <strong className="mt-2 block text-4xl text-stone-950">
              {snapshot.stats.totalCards}
            </strong>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle
            eyebrow="Ambiente"
            title="Validação de configuração"
            description="A aplicação só depende de PostgreSQL, Auth.js e serviços locais dedicados."
          />
          <StatusPill
            label={envStatus.success ? "Env pronto" : "Env incompleto"}
            tone={envStatus.success ? "success" : "warning"}
          />
        </div>

        {!envStatus.success ? (
          <p className="mt-4 text-sm text-red-700">
            {envStatus.error.issues.map(issue => issue.message).join(" ")}
          </p>
        ) : null}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle
            eyebrow="Leituras"
            title="Últimas sessões"
            description="Cada sessão gera guest link próprio, histórico de cartas e acesso ao host live room."
          />
          <Link className="primary-button" href="/dashboard/readings/new">
            Criar nova leitura
          </Link>
        </div>

        <div className="mt-6 grid gap-4">
          {snapshot.readings.length ? (
            snapshot.readings.map(reading => {
              const primary = reading.clients.find(client => client.role === "PRIMARY");

              return (
                <Link
                  key={reading.id}
                  className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 transition hover:border-stone-300 hover:bg-white"
                  href={`/dashboard/readings/${reading.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-stone-950">{reading.readingType.name}</p>
                      <p className="text-sm text-stone-600">
                        {primary?.client.fullName ?? "Consulente principal"} • sala {reading.roomCode}
                      </p>
                    </div>
                    <StatusPill
                      label={reading.status}
                      tone={reading.status === "DRAFT" ? "warning" : "neutral"}
                    />
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="text-sm text-stone-600">
              Nenhuma leitura criada ainda nesta base reconstruída.
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}
