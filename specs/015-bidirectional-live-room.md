# 015 - Live Bidirecional com Câmera e Microfone do Consulente

## Objetivo

Permitir que o consulente entre na sala guest com câmera e microfone, enviando sua mídia para a sala privada do tarólogo durante a live.

## Escopo

- A sala do consulente oferece ação explícita para entrar com câmera e microfone.
- O navegador solicita `getUserMedia({ video: true, audio: true })`.
- Se microfone falhar, a sala tenta fallback com `getUserMedia({ video: true, audio: false })`.
- Se mídia for negada ou indisponível, a sala continua conectando sem quebrar.
- As tracks do consulente são adicionadas ao `RTCPeerConnection` antes do `createAnswer`.
- O host recebe `ontrack` remoto do consulente.
- A sala do host renderiza o consulente em uma janela retangular pequena sobre o vídeo principal.
- A janela mostra label `Consulente`, bordas arredondadas e placeholder quando não há câmera.
- O áudio do consulente toca no host quando permitido.

## Segurança de Interface

A sala do consulente continua sem teleprompter, notas internas, histórico privado ou confiança de IA.

## Aceite

- Host continua vendo sua própria câmera.
- Consulente abre `/guest/[token]`.
- Consulente consegue permitir câmera/microfone.
- Host vê a câmera do consulente em janela pequena sobre o vídeo principal.
- Host ouve o microfone do consulente quando permitido.
- Negar câmera/microfone mantém a sala funcional.
- `pnpm lint`, `pnpm test` e `pnpm build` passam.
