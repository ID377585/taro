# Deploy na Vercel

O app web roda como Next.js na Vercel. A live host/guest usa WebRTC para mídia e HTTP polling para sinalização, gravando sinais `live.*` em `ReadingEvent` no PostgreSQL.

## Variáveis obrigatórias

- `DATABASE_URL`: PostgreSQL com SSL em produção.
- `AUTH_SECRET`: string longa e secreta para Auth.js.

## Variáveis opcionais

- `VISION_SERVICE_URL`: serviço externo de visão. Se ausente ou indisponível, `/api/vision/detect` usa fallback local/manual.
- `NEXTAUTH_URL`: pode ser definida com a URL canônica do app em produção.

## Observações

- `REALTIME_SERVER_URL` não é necessário para a live em produção.
- A Guest URL deve ser aberta como URL completa do app, por exemplo `https://seu-projeto.vercel.app/guest/<token>`.
- Vercel Functions não atuam como WebSocket server; por isso a sinalização foi implementada via HTTP polling.
