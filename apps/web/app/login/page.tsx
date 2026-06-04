import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grain-bg flex min-h-screen items-center justify-center px-6 py-12">
      <section className="glass-panel w-full max-w-md rounded-[32px] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-700">
          Área do tarólogo
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-stone-950">Entrar no painel</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Use o usuário criado no seed inicial. O acesso guest não passa por esta tela.
        </p>

        <div className="mt-8">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
