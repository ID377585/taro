# 001 - Criar Projeto

## Feito

- app legado movido para `archive/legacy-app-2026-06-04`
- novo workspace `pnpm` criado
- base Next.js/Auth.js/Prisma/PostgreSQL adicionada
- packages de tarot e vision criadas com dados reaproveitados do legado
- serviços `realtime` e `vision-service` adicionados

## Pendências deliberadas

- detector real treinado
- mídia WebRTC fim a fim em navegador real
- CRUD administrativo completo
- migration e seed não foram executados contra PostgreSQL neste ambiente porque o daemon do Docker não estava disponível
