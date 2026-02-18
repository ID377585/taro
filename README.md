# Tarô Teleprompter

Web app PWA offline-first para leitura de tarô com teleprompter privado e base para reconhecimento de cartas por câmera.

## Produção

- URL principal: `https://taro-lemon.vercel.app`

## Requisitos

- Node.js 22+
- npm 10+

## Como rodar (local)

1. Instale dependências:

```bash
npm install
```

2. Crie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

3. Rode o app:

```bash
npm run dev
```

Abra no navegador em `http://localhost:5173`.

## Como o app funciona (resumo)

1. **Registrar Cartas**: captura/importa fotos por carta e orientação (`vertical`/`horizontal`) com guia de enquadramento.
2. **Sincronização de Capturas**: fila local em IndexedDB com retry automático para upload no Supabase.
3. **Contador por Carta**: usa contagem remota em `taro_metadata` (deduplicada por `queue_id`) + pendências locais da fila.
4. **Reconhecimento**: tenta modelo TensorFlow.js; se modelo estiver ausente/bootstrap, entra fallback local.
5. **Leitura**: teleprompter com recursos avançados (WPM, atalhos, voz, ajustes visuais e de performance).

## Upload em nuvem (Supabase) para capturas

Para evitar excesso de armazenamento no celular durante a coleta:

1. Copie `.env.example` para `.env.local` (ou `.env`).
2. Configure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_BUCKET` (opcional, padrão `taro-captures`)
   - `VITE_SUPABASE_FOLDER_PREFIX` (opcional, padrão `raw-captures`)
   - `VITE_SUPABASE_METADATA_TABLE` (recomendado: `taro_metadata`)
3. Inicie o app e use a tela **Registrar Cartas**.

Com Supabase configurado, o app:
- enfileira capturas localmente (retry automático),
- envia em background para o Storage,
- remove a amostra local após upload concluído (limpeza automática),
- mantém contador por carta/orientação usando a tabela remota + fila local pendente.

### Schema do Supabase (`taro_metadata`)

Antes de usar contagem remota, aplique a migration SQL:

- `supabase/migrations/20260217_taro_metadata.sql`

Ela cria/ajusta a tabela esperada pelo app (`queue_id`, `card_id`, `orientation`, `captured_at`, `byte_size`, `mime_type`, `storage_path`, `uploaded_at`), adiciona índice único em `queue_id` (idempotência) e políticas RLS para `insert/select/update`.

## Modelo de IA (MobileNetV3)

Estado atual no repositório: **modelo bootstrap** (não final).  
Para produção de reconhecimento por IA, substitua `public/model/*` pelos artefatos finais treinados.

### Verificação automática do modelo final

```bash
npm run model:verify
```

Critérios validados:
- `placeholder=false` em `public/model/metadata.json`
- `labels=156` (78 cartas x 2 orientações)
- `format="layers-model"` e `output classes=156` em `public/model/model.json`

### Troca rápida do modelo (fluxo)

1. Copiar `model.json`, `metadata.json` e arquivos de peso para `public/model/`.
2. Rodar `npm run model:verify`.
3. Rodar `npm run build`.
4. Publicar (`git push` + deploy Vercel).

## Build de produção

```bash
npm run build
```

## Qualidade e testes

```bash
npm run lint
npm run test
npm run check
```

## Scripts principais

- `npm run dev`: ambiente local.
- `npm run build`: build de produção.
- `npm run preview`: preview local do build.
- `npm run check`: typecheck + lint + testes unitários.
- `npm run e2e`: testes E2E (Playwright).
- `npm run model:verify`: valida prontidão do modelo final.
- `npm run bootstrap:assets-model`: gera assets/modelo bootstrap.
- `npm run bootstrap:icons`: gera ícones PWA.

## CI

- Workflow: `.github/workflows/ci.yml`
- Etapas: `npm ci`, `npm audit --omit=dev --audit-level=moderate`, `npm run check`, `npm run build`, `npm run e2e`

## E2E

```bash
npm run e2e
```

## Estrutura

- `src/components`: telas e componentes de UI.
- `src/hooks`: hooks de câmera e IndexedDB.
- `src/services`: serviços de dados e persistência.
- `public/data`: base inicial de cartas e tiragens.
- `public/cards`: imagens locais das cartas (o bootstrap atual usa SVG; você pode substituir por seu deck real).
- `public/model`: modelo para TensorFlow.js (`model.json`, `metadata.json`, pesos). O projeto inclui um modelo bootstrap neutro.
- `supabase/migrations`: SQL de schema e hardening do banco.
- `roteiros/checklist_homologacao_ios.md`: checklist de homologação no iPhone/Safari.

## Status atual do MVP

- Seleção de tiragens (inclui simples e avançadas).
- Teleprompter com câmera, troca de dispositivo, fullscreen e wake lock.
- Registro guiado de cartas (vertical e invertida), com contador 60/60 por carta (9.360 imagens no total) e exportação ZIP por carta.
- Registro guiado com fila de upload para Supabase e limpeza local automática pós-upload.
- Importação de fotos no registro de cartas: HEIF/HEIC/HEVC/PNG/JPEG (com conversão para JPEG no app).
- Reconhecimento com TensorFlow.js + votação de estabilidade.
- Fallback automático para reconhecimento local quando o modelo é bootstrap/ausente.
- Mapeamento automático dos labels do Teachable Machine para cartas reais do deck.
- Teleprompter avançado com:
  - controle de rolagem em WPM (passo de 1)
  - editor de script com anotações e destaques
  - importação TXT/MD e exportação de script
  - cronômetro (tempo decorrido + contagem regressiva)
  - atalhos personalizáveis (compatível com pedal Bluetooth via teclas)
  - comandos de voz (quando suportado pelo navegador)
  - ajustes visuais (fonte, contraste, alinhamento, flip horizontal/vertical, linha ativa)
  - ajustes de performance (resolução da câmera, intervalo e confiança de inferência)
- Fallback manual de seleção de carta.
- Histórico local em IndexedDB.
- PWA com Service Worker (cache de dados, imagens e assets).

## Pendências para 100% produção

- Substituir o modelo bootstrap pelo modelo MobileNetV3 final (156 classes).
- Rodar homologação final no iPhone/Safari com o checklist em `roteiros/checklist_homologacao_ios.md`.
