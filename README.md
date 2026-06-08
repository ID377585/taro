# Taro

Rebuild do `ID377585/taro.git` como monorepo para leituras profissionais de tarot sem Firebase e sem Supabase em runtime.

## Stack

- `apps/web`: Next.js App Router + Auth.js
- `apps/realtime`: Socket.IO legado/opcional para laboratório local
- `apps/vision-service`: FastAPI com contrato `/health` e `/detect`
- `packages/database`: Prisma + PostgreSQL
- `packages/tarot-core`: cartas, tiragens e interpretação local
- `packages/vision-core`: tipos de detecção e trava de estabilidade

## Começo rápido

```bash
cp .env.example .env
corepack enable
corepack pnpm install
docker compose up -d
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
corepack pnpm dev:web
```

## Fluxos já implementados

- autenticação por credenciais com `ADMIN` e `TAROLOGIST`
- dashboard protegido
- listagem de tipos de leitura ativos
- criação de sessão com consulente principal e secundário opcional
- guest link com token hashado
- host room e guest room separados
- live host/guest com sinalização WebRTC por HTTP polling via PostgreSQL, compatível com Vercel
- contrato de confirmação de carta e composição determinística de texto

## Estrutura

- [docs/ARCHITECTURE.md](/Users/ivanescobar/Downloads/taro-correto/docs/ARCHITECTURE.md)
- [docs/AI_DRIVEN_DEV.md](/Users/ivanescobar/Downloads/taro-correto/docs/AI_DRIVEN_DEV.md)
- [docs/LOCALHOST.md](/Users/ivanescobar/Downloads/taro-correto/docs/LOCALHOST.md)
- [archive/legacy-app-2026-06-04](/Users/ivanescobar/Downloads/taro-correto/archive/legacy-app-2026-06-04)
