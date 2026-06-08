# 001 - Criar Projeto

## Objetivo

Substituir o app legado por uma fundação monorepo limpa, sem Firebase e sem Supabase em runtime.

## Aceite

- `pnpm install` funciona na raiz
- `docker compose up -d` sobe PostgreSQL
- Prisma gera client e aplica migrations
- `apps/web` builda com autenticação e dashboard protegido
- `apps/realtime` e `apps/vision-service` existem com contratos estáveis
