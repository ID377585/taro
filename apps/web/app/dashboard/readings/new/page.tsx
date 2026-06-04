import { redirect } from "next/navigation";
import { z } from "zod";
import { Panel, SectionTitle } from "@taro/ui";
import { createReadingSession, getActiveReadingTypes } from "@/lib/reading-service";
import { requireAuthUser } from "@/lib/session";

const readingSchema = z.object({
  readingTypeId: z.string().min(1),
  primaryFullName: z.string().min(2),
  primaryBirthDate: z.string().optional(),
  primaryPhone: z.string().optional(),
  secondaryFullName: z.string().optional(),
  secondaryBirthDate: z.string().optional(),
  secondaryPhone: z.string().optional(),
  notes: z.string().optional(),
});

export default async function NewReadingPage() {
  const user = await requireAuthUser();
  const readingTypes = await getActiveReadingTypes();

  async function createReading(formData: FormData) {
    "use server";

    const parsed = readingSchema.parse({
      readingTypeId: formData.get("readingTypeId"),
      primaryFullName: formData.get("primaryFullName"),
      primaryBirthDate: formData.get("primaryBirthDate"),
      primaryPhone: formData.get("primaryPhone"),
      secondaryFullName: formData.get("secondaryFullName"),
      secondaryBirthDate: formData.get("secondaryBirthDate"),
      secondaryPhone: formData.get("secondaryPhone"),
      notes: formData.get("notes"),
    });

    const result = await createReadingSession({
      tarologistId: user.id,
      readingTypeId: parsed.readingTypeId,
      notes: parsed.notes,
      primary: {
        fullName: parsed.primaryFullName,
        birthDate: parsed.primaryBirthDate,
        phone: parsed.primaryPhone,
      },
      secondary: parsed.secondaryFullName
        ? {
            fullName: parsed.secondaryFullName,
            birthDate: parsed.secondaryBirthDate,
            phone: parsed.secondaryPhone,
          }
        : null,
    });

    redirect(`/dashboard/readings/${result.reading.id}?guestToken=${result.guestToken}`);
  }

  return (
    <main className="space-y-6">
      <Panel>
        <SectionTitle
          eyebrow="Nova leitura"
          title="Criar sessão com guest link seguro"
          description="O cliente nunca recebe dados internos. O token exposto na URL é separado do hash salvo no banco."
        />

        <form action={createReading} className="mt-8 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2 text-sm text-stone-700 lg:col-span-2">
            Tipo de leitura
            <select className="field" name="readingTypeId" required>
              {readingTypes.map(readingType => (
                <option key={readingType.id} value={readingType.id}>
                  {readingType.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-4 rounded-[28px] border border-stone-200 bg-stone-50 p-5">
            <legend className="px-2 text-sm font-semibold text-stone-900">Consulente principal</legend>
            <input className="field" name="primaryFullName" placeholder="Nome completo" required />
            <input className="field" name="primaryBirthDate" type="date" />
            <input className="field" name="primaryPhone" placeholder="Telefone" />
          </fieldset>

          <fieldset className="space-y-4 rounded-[28px] border border-stone-200 bg-stone-50 p-5">
            <legend className="px-2 text-sm font-semibold text-stone-900">Segunda pessoa opcional</legend>
            <input className="field" name="secondaryFullName" placeholder="Nome completo" />
            <input className="field" name="secondaryBirthDate" type="date" />
            <input className="field" name="secondaryPhone" placeholder="Telefone" />
          </fieldset>

          <label className="space-y-2 text-sm text-stone-700 lg:col-span-2">
            Observações internas
            <textarea className="field min-h-32" name="notes" placeholder="Anotações privadas do host" />
          </label>

          <div className="lg:col-span-2">
            <button className="primary-button" type="submit">
              Criar leitura
            </button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
