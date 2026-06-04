# Architecture - Taro

## Princípios

- monorepo por domínio
- regras de negócio isoladas em packages reutilizáveis
- autenticação e autorização no servidor
- host e guest estritamente separados
- sem Firebase, Firestore, Firebase Auth, Firebase Storage ou Supabase em runtime

## Apps

- `apps/web`: produto principal, Auth.js, dashboard, leituras, sala do host e sala do cliente
- `apps/realtime`: eventos Socket.IO para criação e entrada em salas WebRTC
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
