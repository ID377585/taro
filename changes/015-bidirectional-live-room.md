# 015 - Live Bidirecional com Câmera e Microfone do Consulente

## Feito

- adicionada ação explícita para o consulente entrar com câmera e microfone
- implementado fallback para câmera sem microfone quando áudio falha
- sala guest adiciona tracks locais antes de criar a answer WebRTC
- sala guest mantém preview local pequeno quando a câmera está ativa
- host prepara o peer para send/recv e recebe tracks remotas do consulente
- host renderiza janela sobreposta com label `Consulente`
- host mostra placeholder quando o consulente entra sem câmera
- eventos de carta e fallback manual permanecem no fluxo atual

## Pendências deliberadas

- controles avançados de mute/câmera do consulente
- troca de câmera durante a chamada
- gravação ou moderação de mídia
