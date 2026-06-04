import Link from "next/link";
import { signOut } from "@/auth";
import { requireAuthUser } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAuthUser();

  return (
    <div className="grain-bg min-h-screen px-6 py-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="glass-panel flex flex-col gap-5 rounded-[30px] p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-700">
              Painel Taro
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-stone-950">Leituras profissionais</h1>
            <p className="mt-2 text-sm text-stone-600">
              Conectado como {user.name} ({user.role}).
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-3">
            <Link className="secondary-button" href="/dashboard">
              Dashboard
            </Link>
            <Link className="secondary-button" href="/dashboard/history">
              Histórico
            </Link>
            <Link className="secondary-button" href="/dashboard/reading-types">
              Tipos de leitura
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="secondary-button" href="/dashboard/cards">
                Cartas
              </Link>
            ) : null}
            {user.role === "ADMIN" ? (
              <Link className="secondary-button" href="/register">
                Novo usuário
              </Link>
            ) : null}
            <Link className="secondary-button" href="/dashboard/readings/new">
              Nova leitura
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="primary-button" type="submit">
                Sair
              </button>
            </form>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
