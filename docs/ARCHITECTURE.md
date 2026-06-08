# Architecture - Taro

## Princípios

- monorepo por domínio
- regras de negócio isoladas em packages reutilizáveis
- autenticação e autorização no servidor
- host e guest estritamente separados
- sem Firebase, Firestore, Firebase Auth, Firebase Storage ou Supabase em runtime

## Apps

- `apps/web`: produto principal, Auth.js, dashboard, leituras, sala do host e sala do cliente
- `apps/realtime`: serviço Socket.IO legado/opcional para laboratório local
- `apps/vision-service`: serviço Python com interface estável para detecção

## Packages

- `packages/database`: schema Prisma, seed e client singleton
- `packages/tarot-core`: normalização de cartas e tiragens, retrieval local e teleprompter script
- `packages/vision-core`: tipos de detecção, trava por estabilidade e detector mockado

## Fluxo

1. tarólogo autentica em `apps/web`
2. cria leitura e guest link
3. host usa a sala privada com teleprompter e câmera
4. cliente acessa apenas a sala guest
5. carta confirmada é persistida e vira texto oral local

## Live na Vercel

A sala ao vivo não depende de WebSocket server no deploy da Vercel. A sinalização WebRTC é feita por HTTP polling em rotas Next.js:

- host: `/api/readings/[id]/signals`
- guest: `/api/guest/[token]/signals`

Os sinais `live.*` são armazenados em `ReadingEvent`, usando PostgreSQL como barramento curto da sessão. Isso permite offer, answer, ICE candidates e eventos de carta sem Firebase, Supabase ou Socket.IO em produção.
