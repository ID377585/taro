# Web App Teleprompter para Leitura de Tarô (MVP funcional)

Este repositório define um **plano técnico direto ao ponto** para construir um web app que:

- roda no **Chrome** (tablet/celular);
- abre câmera frontal/traseira;
- reconhece automaticamente a carta do tarô;
- mostra o significado em modo **teleprompter privado** (somente no seu dispositivo de apoio);
- funciona em arquitetura **offline-first (PWA)** para não te deixar na mão em live.

---

## 1) Objetivo de uso (2 dispositivos)

- **Dispositivo A (smartphone)**: usado para a live (Instagram/Facebook etc.).
- **Dispositivo B (tablet)**: usado apenas por você com o web app teleprompter.

Fluxo ideal:
1. Escolher tiragem (ex.: Cruz Celta).
2. App mostra posições da tiragem.
3. Ao virar cada carta, apontar para a câmera do tablet.
4. App reconhece a carta e preenche o próximo slot automaticamente.
5. Texto de interpretação aparece na tela do tablet (privado, leitura em tempo real).

---

## 2) Stack recomendada (rápida e confiável)

### Frontend
- **TypeScript + React + Vite**
- Motivo: velocidade de desenvolvimento, ecossistema maduro e fácil deploy.

### Câmera e UX de leitura
- **getUserMedia + enumerateDevices** para câmera frontal/traseira.
- **Fullscreen API** para tela limpa durante leitura.
- **Screen Wake Lock API** para evitar a tela apagar na live.

### Reconhecimento de cartas (núcleo)
- **TensorFlow.js** no navegador.
- Treino inicial com **Teachable Machine** (export TFJS) para acelerar MVP.

### Persistência e offline
- **PWA + Service Worker + Workbox** para cache offline.
- **IndexedDB** para sessões, configurações e histórico de tiragens.

### LLM (opcional, fase 2)
- **Não usar LLM para reconhecer carta**.
- Usar LLM apenas para gerar “roteiro falável” a partir de significado + posição.
- Estratégia recomendada: **RAG** com seu conteúdo (livro + interpretações).

---

## 3) Arquitetura de dados (base do app)

Você já tem os ativos mais importantes: 78 imagens + texto do seu material.

### `cards.json` (fonte canônica)
Cada carta deve ter:
- `id`, `nome`, `arcano`, `numero`, `naipe`, `elemento`
- `keywords`
- `up_right_short`, `up_right_long`
- `reversed_short`, `reversed_long`
- `career`, `love`, `spiritual`, `advice`
- `tags_rag` (para fase de IA)

### `spreads.json`
Modela as tiragens com posições:
- Uma carta
- Três cartas (variações)
- Cruz Celta (10)
- Mandala Astrológica (12/14)
- Péladan (4)
- Cruz (5)
- Diamante

---

## 4) Reconhecimento de carta (estratégia prática)

### MVP recomendado
- Treinar classificador de imagem para as 78 cartas.
- Inferência a cada 200–400ms em frame do vídeo (canvas 224x224).
- Aplicar **estabilização** (N predições iguais seguidas antes de confirmar).

### Cartas invertidas
Duas abordagens:
1. 78 classes + detector de orientação separado.
2. 156 classes (cada carta normal + invertida).

Para começar rápido: use **156 classes** se a acurácia estiver boa no seu dispositivo; caso pese desempenho, volte para 78 + regra de orientação.

### Botão “Registrar Cartas” (dataset próprio)
Ao clicar:
- abrir câmera;
- mostrar overlay/guia (marca d’água) para enquadramento;
- coletar 10 fotos por carta (frente), em condições reais de uso.

Isso melhora muito precisão no seu cenário de live.

---

## 5) Funcionalidades mínimas do MVP (sem enrolação)

1. **Selecionar tiragem** (menu principal).
2. **Iniciar câmera** (frontal/traseira).
3. **Reconhecer carta automaticamente**.
4. **Preencher posição da tiragem automaticamente**.
5. **Mostrar interpretação curta + detalhada** para a posição atual.
6. **Modo teleprompter**:
   - fonte grande;
   - alto contraste;
   - botão ocultar/mostrar texto;
   - fullscreen;
   - wake lock.
7. **Histórico da sessão** (salvar leitura localmente).
8. **Offline-first** (abrir e funcionar sem internet após primeira carga).

---

## 6) Roadmap recomendado

### Fase 1 — MVP funcional (2 a 4 semanas)
- Estrutura React/Vite/PWA.
- Tela câmera + reconhecimento + teleprompter.
- Tiragens: 1 carta, 3 cartas, Cruz Celta.
- Banco local com cartas e significados.

### Fase 2 — Robustez (2 a 4 semanas)
- Melhorar dataset e treino.
- Ajustes de iluminação/estabilização.
- Botão “Registrar Cartas” completo.
- Exportar/importar backup local.

### Fase 3 — Inteligência (opcional)
- Modo “Roteiro Inteligente” com LLM.
- RAG com seu conteúdo para respostas alinhadas ao seu método.
- Perfis de estilo (objetivo, acolhedor, espiritual, terapêutico).

---

## 7) Estrutura de projeto sugerida

```txt
src/
  app/
    router.tsx
  features/
    camera/
      CameraView.tsx
      useCamera.ts
    recognition/
      classifier.ts
      useRecognitionLoop.ts
    teleprompter/
      TeleprompterPanel.tsx
      useWakeLock.ts
    spreads/
      spreadEngine.ts
      spreadTemplates.ts
    sessions/
      sessionStore.ts
  data/
    cards.json
    spreads.json
  pwa/
    sw.ts
  db/
    indexedDb.ts
```

---

## 8) Decisões de produto que evitam retrabalho

- **Local-first por padrão**: estabilidade em live > features online.
- **Reconhecimento determinístico primeiro**: LLM vem depois.
- **UI minimalista para leitura em tempo real**.
- **Treino com imagens reais do seu setup** (mesa/luz/câmera do tablet).

---

## 9) Próximo passo imediato

Se você quiser, o próximo commit pode já entregar o esqueleto executável com:
- Vite + React + TypeScript + PWA configurados;
- tela de câmera com troca frontal/traseira;
- layout teleprompter;
- mock de reconhecimento;
- schemas `cards.json` e `spreads.json` prontos para você preencher.

Isso já coloca o projeto em execução local no seu tablet e acelera a validação real do fluxo.
