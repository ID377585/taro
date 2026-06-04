import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="grain-bg flex min-h-screen items-center justify-center px-6 py-12">
      <section className="glass-panel grid w-full max-w-6xl gap-10 rounded-[36px] p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-12">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.45em] text-amber-700">
            Taro Professional Platform
          </p>
          <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold text-stone-950 lg:text-7xl">
            Leituras ao vivo com privacidade real entre tarólogo e consulente.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-stone-700">
            O host controla câmera, confirmação de carta, roteiro oral e histórico. O
            consulente recebe apenas a sala de vídeo, sem teleprompter e sem dados internos.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="primary-button" href="/login">
              Entrar no painel
            </Link>
            <a
              className="secondary-button"
              href="https://github.com/ID377585/taro"
              rel="noreferrer"
              target="_blank"
            >
              Ver repositório
            </a>
          </div>
        </div>

        <div className="grid gap-4">
          {[
            "Auth.js com sessão segura por cookie",
            "Guest link hashado com expiração",
            "WebRTC 1:1 com sinalização dedicada",
            "Detecção com trava por estabilidade e confirmação manual",
          ].map(item => (
            <div key={item} className="rounded-[26px] border border-white/70 bg-white/70 p-6">
              <p className="text-xl font-medium text-stone-900">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
