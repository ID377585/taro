# Rodar localmente

```bash
cp .env.example .env
corepack enable
corepack pnpm install
docker compose up -d
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
corepack pnpm dev:web
```

## Endpoints locais

- app: `http://localhost:3000`
- realtime: `http://localhost:3001`
- vision: `http://localhost:8000`
- postgres: `postgresql://postgres:postgres@localhost:5432/taro`
