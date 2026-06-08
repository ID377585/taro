import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const sourceDir =
  process.env.TAROT_ASSET_SOURCE ||
  "/Users/ivanescobar/Downloads/tarot_vision_mark_v2/cards_png";

const possibleMapPaths = [
  process.env.TAROT_VISION_MAP,
  "/Users/ivanescobar/Downloads/tarot_vision_mark_v2/tarot_vision_mark_v2_map.json",
  "/Users/ivanescobar/Downloads/tarot_vision_mark_v2_map.json",
  path.join(projectRoot, "tarot_vision_mark_v2_map.json"),
].filter(Boolean);

const destDir = path.join(projectRoot, "public/cards/tarot-gold-v2");
const generatedMapPath = path.join(
  projectRoot,
  "packages/vision-core/src/data/tarot-vision-mark-v2-map.json"
);

function fail(message) {
  console.error(`\nERRO: ${message}\n`);
  process.exit(1);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (!fs.existsSync(sourceDir)) {
  fail(`Pasta de imagens nao encontrada: ${sourceDir}`);
}

const mapPath = possibleMapPaths.find((item) => fs.existsSync(item));

if (!mapPath) {
  fail(
    "Mapa JSON nao encontrado. Coloque tarot_vision_mark_v2_map.json em /Users/ivanescobar/Downloads/tarot_vision_mark_v2/ ou na raiz do projeto."
  );
}

const map = readJson(mapPath);

if (!Array.isArray(map.cards) || map.cards.length !== 78) {
  fail(`O mapa precisa conter 78 cartas. Encontrado: ${map.cards?.length ?? 0}`);
}

fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(path.dirname(generatedMapPath), { recursive: true });

const sourceFiles = fs
  .readdirSync(sourceDir)
  .filter((file) => /\.(png|jpg|jpeg|webp)$/i.test(file));

if (sourceFiles.length < 78) {
  fail(`A pasta de origem tem menos de 78 imagens. Encontrado: ${sourceFiles.length}`);
}

const sourceIndex = sourceFiles.map((file) => {
  const stem = path.basename(file, path.extname(file));
  return {
    file,
    lower: file.toLowerCase(),
    slug: slugify(stem),
  };
});

const copied = [];
const missing = [];

for (const card of map.cards) {
  const id = Number(card.id);
  const title = card.title_pt || card.title || card.name;
  const desiredName = `${String(id).padStart(2, "0")}_${slugify(title)}.png`;
  const desiredSlug = slugify(title);

  let match =
    sourceIndex.find((item) => item.lower === desiredName.toLowerCase()) ||
    sourceIndex.find((item) => item.slug === `${String(id).padStart(2, "0")}_${desiredSlug}`) ||
    sourceIndex.find((item) => item.slug === desiredSlug) ||
    sourceIndex.find((item) => item.slug.includes(desiredSlug)) ||
    sourceIndex.find((item) => item.slug.includes(String(id).padStart(2, "0")));

  if (!match) {
    missing.push({ id, title, desiredName });
    continue;
  }

  const sourcePath = path.join(sourceDir, match.file);
  const destPath = path.join(destDir, desiredName);

  fs.copyFileSync(sourcePath, destPath);

  copied.push({
    id,
    title,
    group: card.group,
    groupId: card.group_id ?? card.groupId,
    checksum: card.checksum_decimal ?? card.checksum,
    slug: slugify(title).replaceAll("_", "-"),
    imageUrl: `/cards/tarot-gold-v2/${desiredName}`,
    fileName: desiredName,
    marker: card.marker ?? null,
  });
}

if (missing.length > 0) {
  console.error("Cartas sem imagem correspondente:");
  console.error(JSON.stringify(missing, null, 2));
  fail("Nem todas as cartas foram importadas.");
}

if (copied.length !== 78) {
  fail(`Importacao incompleta. Copiadas: ${copied.length}`);
}

fs.writeFileSync(generatedMapPath, JSON.stringify(copied, null, 2) + "\n");

console.log(`Importadas ${copied.length} imagens para ${destDir}`);
console.log(`Mapa tecnico gerado em ${generatedMapPath}`);
console.log("Exemplo:", copied[0]);
