import { revalidatePath } from "next/cache";
import { Panel, SectionTitle, StatusPill } from "@taro/ui";
import {
  getAdminReadingTypes,
  requireAdminUser,
  saveReadingType,
  toggleReadingType,
} from "@/lib/admin";

export default async function ReadingTypesPage() {
  await requireAdminUser();
  const readingTypes = await getAdminReadingTypes();

  async function createReadingType(formData: FormData) {
    "use server";

    await requireAdminUser();
    await saveReadingType({
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      description: String(formData.get("description") || ""),
      defaultSpread: String(formData.get("defaultSpread") || ""),
      cardsCount: Number(formData.get("cardsCount") || 3),
      openingScript: String(formData.get("openingScript") || ""),
      closingScript: String(formData.get("closingScript") || ""),
      promptTemplate: String(formData.get("promptTemplate") || ""),
      active: true,
    });

    revalidatePath("/dashboard/reading-types");
    revalidatePath("/dashboard");
  }

  async function handleToggle(formData: FormData) {
    "use server";

    await requireAdminUser();
    await toggleReadingType(String(formData.get("id") || ""));
    revalidatePath("/dashboard/reading-types");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/readings/new");
  }

  async function updateReadingType(formData: FormData) {
    "use server";

    await requireAdminUser();
    await saveReadingType({
      id: String(formData.get("id") || ""),
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      description: String(formData.get("description") || ""),
      defaultSpread: String(formData.get("defaultSpread") || ""),
      cardsCount: Number(formData.get("cardsCount") || 3),
      openingScript: String(formData.get("openingScript") || ""),
      closingScript: String(formData.get("closingScript") || ""),
      promptTemplate: String(formData.get("promptTemplate") || ""),
      active: String(formData.get("active") || "true") === "true",
    });

    revalidatePath("/dashboard/reading-types");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/readings/new");
  }

  return (
    <main className="space-y-6">
      <Panel className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <SectionTitle
            eyebrow="Admin"
            title="Cadastrar tipo de leitura"
            description="Crie tipos adicionais sem tocar em código. O slug precisa ser único."
          />

          <form action={createReadingType} className="mt-8 space-y-4">
            <input className="field" name="name" placeholder="Nome" required />
            <input className="field" name="slug" placeholder="Slug" required />
            <textarea
              className="field min-h-24"
              name="description"
              placeholder="Descrição resumida"
            />
            <textarea
              className="field min-h-28"
              name="defaultSpread"
              placeholder="Spread sugerido"
            />
            <input
              className="field"
              defaultValue={3}
              min={1}
              name="cardsCount"
              type="number"
            />
            <textarea
              className="field min-h-24"
              name="openingScript"
              placeholder="Texto de abertura"
            />
            <textarea
              className="field min-h-24"
              name="closingScript"
              placeholder="Texto de encerramento"
            />
            <textarea
              className="field min-h-24"
              name="promptTemplate"
              placeholder="Prompt base"
            />
            <button className="primary-button" type="submit">
              Salvar tipo
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <SectionTitle
            eyebrow="Catálogo"
            title="Tipos existentes"
            description="Ative ou desative cada tipo de leitura. A tela de nova leitura mostra apenas os ativos."
          />

          <div className="mt-6 grid gap-4">
            {readingTypes.map(readingType => (
              <article
                key={readingType.id}
                className="rounded-[24px] border border-stone-200 bg-stone-50 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-950">{readingType.name}</h3>
                    <p className="text-sm text-stone-600">{readingType.slug}</p>
                  </div>
                  <StatusPill
                    label={readingType.active ? "Ativo" : "Inativo"}
                    tone={readingType.active ? "success" : "warning"}
                  />
                </div>

                <form action={updateReadingType} className="mt-4 grid gap-3">
                  <input name="id" type="hidden" value={readingType.id} />
                  <input name="active" type="hidden" value={String(readingType.active)} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="field" defaultValue={readingType.name} name="name" required />
                    <input className="field" defaultValue={readingType.slug} name="slug" required />
                  </div>
                  <textarea
                    className="field min-h-24"
                    defaultValue={readingType.description ?? ""}
                    name="description"
                  />
                  <textarea
                    className="field min-h-24"
                    defaultValue={readingType.defaultSpread ?? ""}
                    name="defaultSpread"
                  />
                  <input
                    className="field"
                    defaultValue={readingType.cardsCount}
                    min={1}
                    name="cardsCount"
                    type="number"
                  />
                  <textarea
                    className="field min-h-24"
                    defaultValue={readingType.openingScript ?? ""}
                    name="openingScript"
                  />
                  <textarea
                    className="field min-h-24"
                    defaultValue={readingType.closingScript ?? ""}
                    name="closingScript"
                  />
                  <textarea
                    className="field min-h-24"
                    defaultValue={readingType.promptTemplate ?? ""}
                    name="promptTemplate"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-stone-500">
                      {readingType.cardsCount} carta(s)
                    </span>
                    <button className="secondary-button" type="submit">
                      Atualizar
                    </button>
                  </div>
                </form>

                <form action={handleToggle} className="mt-3">
                  <input name="id" type="hidden" value={readingType.id} />
                  <button className="secondary-button" type="submit">
                    {readingType.active ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </div>
      </Panel>
    </main>
  );
}
