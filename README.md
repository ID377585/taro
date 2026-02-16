# Tarô Teleprompter

Web app PWA offline-first para leitura de tarô com teleprompter privado e base para reconhecimento de cartas por câmera.

## Como rodar

```bash
npm install
npm run dev
```

Abra no navegador em `http://localhost:5173`.

## Build de produção

```bash
npm run build
```

## Estrutura

- `src/components`: telas e componentes de UI.
- `src/hooks`: hooks de câmera e IndexedDB.
- `src/services`: serviços de dados e persistência.
- `public/data`: base inicial de cartas e tiragens.
- `public/cards`: imagens das cartas (adicione suas 78 cartas aqui).
- `public/model`: modelo exportado do Teachable Machine (`model.json`, `metadata.json`, pesos).

## Status atual do MVP

- Seleção de tiragens (inclui simples e avançadas).
- Teleprompter com câmera, troca de dispositivo, fullscreen e wake lock.
- Registro guiado de cartas (vertical e invertida), com contador 10/10 e exportação ZIP por carta.
- Importação de fotos no registro de cartas: HEIF/HEIC/HEVC/PNG/JPEG (com conversão para JPEG no app).
- Reconhecimento com TensorFlow.js + votação de estabilidade.
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
