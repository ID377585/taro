# 014 - Reconhecimento de Carta por Marcador Visual

## Objetivo

Implementar a primeira versão real de reconhecimento por câmera usando os marcadores técnicos aplicados nas 78 cartas do baralho `tarot-gold-v2`, sem YOLO nesta etapa.

## Escopo

- Ler os bits do marcador visual:
  - orientação no canto superior esquerdo;
  - ID da carta com 7 bits no canto superior direito;
  - grupo/naipe com 3 bits no canto inferior esquerdo;
  - checksum com 4 bits no canto inferior direito.
- Validar checksum com a fórmula `checksum = (id ^ (group << 1) ^ 0xA) & 0xF`.
- Retornar contrato de detecção com:
  - `cardId`;
  - `cardSlug`;
  - `cardName`;
  - `confidence`;
  - `boundingBox`;
  - `source`;
  - `isValid`.
- Manter fallback manual por `cardHint`.
- Usar o mapa técnico em `packages/vision-core/src/data/tarot-vision-mark-v2-map.json`.

## Fora de Escopo

- Treinamento ou integração YOLO.
- Segmentação real de imagem/câmera.
- Persistência adicional em banco para detecções.

## Aceite

- `vision-core` decodifica bits válidos do mapa técnico.
- Checksum inválido retorna `isValid: false` e expõe `expectedChecksum`.
- `/api/vision/detect` responde no contrato novo.
- A tela live continua abrindo e mantém fallback manual.
- `pnpm lint`, `pnpm test` e `pnpm build` passam.
