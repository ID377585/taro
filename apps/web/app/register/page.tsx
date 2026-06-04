import { revalidatePath } from "next/cache";
import { Panel, SectionTitle } from "@taro/ui";
import { createDashboardUser, requireAdminUser } from "@/lib/admin";

export default async function RegisterUserPage() {
  await requireAdminUser();

  async function registerUser(formData: FormData) {
    "use server";

    await requireAdminUser();
    const selectedRole = String(formData.get("role") || "TAROLOGIST");
    await createDashboardUser({
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      role: selectedRole === "ADMIN" ? "ADMIN" : "TAROLOGIST",
    });
    revalidatePath("/dashboard");
  }

  return (
    <main className="grain-bg flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-3xl">
        <Panel className="rounded-[32px] p-8">
          <SectionTitle
            eyebrow="Admin"
            title="Cadastrar usuário interno"
            description="Fluxo restrito a administradores para criar novos tarólogos ou admins."
          />

          <form action={registerUser} className="mt-8 grid gap-4 md:grid-cols-2">
            <input className="field md:col-span-2" name="name" placeholder="Nome completo" required />
            <input className="field" name="email" placeholder="Email" required type="email" />
            <select className="field" defaultValue="TAROLOGIST" name="role">
              <option value="TAROLOGIST">Tarologist</option>
              <option value="ADMIN">Admin</option>
            </select>
            <input
              className="field md:col-span-2"
              name="password"
              placeholder="Senha temporária"
              required
              type="password"
            />
            <div className="md:col-span-2">
              <button className="primary-button" type="submit">
                Criar usuário
              </button>
            </div>
          </form>
        </Panel>
      </section>
    </main>
  );
}
