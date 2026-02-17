# Tarô Teleprompter

Web app PWA offline-first para leitura de tarô com teleprompter privado e base para reconhecimento de cartas por câmera.

## Como rodar

```bash
npm install
npm run dev
```

Abra no navegador em `http://localhost:5173`.

## Upload em nuvem (Supabase) para capturas

Para evitar excesso de armazenamento no celular durante a coleta:

1. Copie `.env.example` para `.env.local` (ou `.env`).
2. Configure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_BUCKET` (opcional, padrão `taro-captures`)
   - `VITE_SUPABASE_FOLDER_PREFIX` (opcional, padrão `raw-captures`)
   - `VITE_SUPABASE_METADATA_TABLE` (opcional, insert best-effort)
3. Inicie o app e use a tela **Registrar Cartas**.

Com Supabase configurado, o app:
- enfileira capturas localmente (retry automático),
- envia em background para o Storage,
- remove a amostra local após upload concluído (limpeza automática),
- mantém contador por carta/orientação considerando itens já enviados.

### Schema do Supabase (`taro_metadata`)

Antes de usar contagem remota, aplique a migration SQL:

- `supabase/migrations/20260217_taro_metadata.sql`

Ela cria/ajusta a tabela esperada pelo app (`queue_id`, `card_id`, `orientation`, `captured_at`, `byte_size`, `mime_type`, `storage_path`, `uploaded_at`), adiciona índice único em `queue_id` (idempotência) e políticas RLS para insert/select/update.

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

## Verificação do modelo final (MobileNetV3)

```bash
npm run model:verify
```

Critérios validados automaticamente:
- `placeholder=false` em `public/model/metadata.json`
- `labels=156` (78 cartas x 2 orientações)
- `format="layers-model"` e `output classes=156` em `public/model/model.json`

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

## Status atual do MVP

- Seleção de tiragens (inclui simples e avançadas).
- Teleprompter com câmera, troca de dispositivo, fullscreen e wake lock.
- Registro guiado de cartas (vertical e invertida), com contador 10/10 e exportação ZIP por carta.
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
