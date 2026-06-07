import { revalidatePath } from "next/cache";
import { Panel, SectionTitle } from "@taro/ui";
import { getAdminTarotCards, requireAdminUser, saveTarotCard } from "@/lib/admin";

export default async function CardsPage() {
  await requireAdminUser();
  const cards = await getAdminTarotCards();

  async function createCard(formData: FormData) {
    "use server";

    await requireAdminUser();
    await saveTarotCard({
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      arcana: String(formData.get("arcana") || ""),
      suit: String(formData.get("suit") || ""),
      number: formData.get("number") ? Number(formData.get("number")) : null,
      imageUrl: String(formData.get("imageUrl") || ""),
      uprightText: String(formData.get("uprightText") || ""),
      reversedText: String(formData.get("reversedText") || ""),
      keywords: String(formData.get("keywords") || ""),
    });
    revalidatePath("/dashboard/cards");
  }

  async function updateCard(formData: FormData) {
    "use server";

    await requireAdminUser();
    await saveTarotCard({
      id: String(formData.get("id") || ""),
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      arcana: String(formData.get("arcana") || ""),
      suit: String(formData.get("suit") || ""),
      number: formData.get("number") ? Number(formData.get("number")) : null,
      imageUrl: String(formData.get("imageUrl") || ""),
      uprightText: String(formData.get("uprightText") || ""),
      reversedText: String(formData.get("reversedText") || ""),
      keywords: String(formData.get("keywords") || ""),
    });
    revalidatePath("/dashboard/cards");
  }

  return (
    <main className="space-y-6">
      <Panel className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionTitle
            eyebrow="Baralho"
            title="Cadastrar ou ajustar carta"
            description="Atualize significados, palavras-chave e metadados do baralho sem editar seeds manualmente."
          />

          <form action={createCard} className="mt-8 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="field" name="name" placeholder="Nome" required />
              <input className="field" name="slug" placeholder="Slug" required />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <input className="field" name="arcana" placeholder="MAJOR ou MINOR" required />
              <input className="field" name="suit" placeholder="Naipe" />
              <input className="field" name="number" placeholder="Número" type="number" />
            </div>
            <input className="field" name="imageUrl" placeholder="URL da imagem" />
            <textarea className="field min-h-28" name="uprightText" placeholder="Texto em luz" required />
            <textarea className="field min-h-28" name="reversedText" placeholder="Texto invertido" />
            <input className="field" name="keywords" placeholder="keywords separadas por vírgula" />
            <button className="primary-button" type="submit">
              Salvar nova carta
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <SectionTitle
            eyebrow="Catálogo"
            title="78 cartas e ajustes finos"
            description="Cada carta pode ter texto oral em luz e invertido, além de palavras-chave reaproveitadas pelo teleprompter."
          />

          <div className="mt-6 grid gap-4">
            {cards.map(card => (
              <article key={card.id} className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-950">{card.name}</h3>
                    <p className="text-sm text-stone-600">
                      {card.slug} • {card.arcana}
                      {card.suit ? ` • ${card.suit}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-600">
                    #{card.legacyId}
                  </span>
                </div>

                {card.imageUrl ? (
                  <div className="mb-4 rounded-[22px] border border-stone-200 bg-white p-3">
                    <div className="flex aspect-[2/3] max-h-[360px] items-center justify-center overflow-hidden rounded-[18px] bg-stone-100">
                      <img
                        alt={`Imagem da carta ${card.name}`}
                        className="h-full w-full object-contain"
                        loading="lazy"
                        src={card.imageUrl}
                      />
                    </div>
                    <p className="mt-2 break-all text-xs text-stone-500">{card.imageUrl}</p>
                  </div>
                ) : (
                  <div className="mb-4 flex aspect-[2/3] max-h-[360px] items-center justify-center rounded-[22px] border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
                    Sem imagem cadastrada
                  </div>
                )}

                <form action={updateCard} className="grid gap-3">
                  <input name="id" type="hidden" value={card.id} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="field" defaultValue={card.name} name="name" required />
                    <input className="field" defaultValue={card.slug} name="slug" required />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <input className="field" defaultValue={card.arcana} name="arcana" required />
                    <input className="field" defaultValue={card.suit ?? ""} name="suit" />
                    <input
                      className="field"
                      defaultValue={card.number ?? ""}
                      name="number"
                      type="number"
                    />
                  </div>
                  <input className="field" defaultValue={card.imageUrl ?? ""} name="imageUrl" />
                  <textarea
                    className="field min-h-28"
                    defaultValue={card.uprightText}
                    name="uprightText"
                    required
                  />
                  <textarea
                    className="field min-h-28"
                    defaultValue={card.reversedText ?? ""}
                    name="reversedText"
                  />
                  <input
                    className="field"
                    defaultValue={card.keywords.join(", ")}
                    name="keywords"
                  />
                  <button className="secondary-button" type="submit">
                    Atualizar carta
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
