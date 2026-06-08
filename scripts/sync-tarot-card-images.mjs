import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const projectRoot = process.cwd();

const mapPath = path.join(
  projectRoot,
  "packages/vision-core/src/data/tarot-vision-mark-v2-map.json"
);

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

if (!fs.existsSync(mapPath)) {
  console.error(`Mapa nao encontrado: ${mapPath}`);
  process.exit(1);
}

const cards = JSON.parse(fs.readFileSync(mapPath, "utf8"));

let updated = 0;
let notFound = [];

for (const card of cards) {
  const title = card.title;
  const slug = card.slug || slugify(title);

  const result = await prisma.tarotCard.updateMany({
    where: {
      OR: [
        { slug },
        { name: title },
        { name: { equals: title, mode: "insensitive" } },
      ],
    },
    data: {
      imageUrl: card.imageUrl,
    },
  });

  if (result.count > 0) {
    updated += result.count;
  } else {
    notFound.push({ title, slug, imageUrl: card.imageUrl });
  }
}

await prisma.$disconnect();

console.log(
  JSON.stringify(
    {
      updated,
      notFoundCount: notFound.length,
      notFound,
    },
    null,
    2
  )
);

if (notFound.length > 0) {
  process.exitCode = 1;
}
