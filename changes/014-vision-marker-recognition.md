# 014 - Reconhecimento de Carta por Marcador Visual

## Feito

- adicionada leitura de bits do marcador em `vision-core`
- validação de checksum mantida e exposta no decoder
- contrato de detecção atualizado com `cardId`, `cardName`, `source` e `isValid`
- detector heurístico/mockado passou a usar o mapa técnico das cartas e validar o checksum
- `/api/vision/detect` normaliza respostas antigas do serviço de visão e faz fallback local/manual
- tela live ajustada para o contrato novo sem remover o fluxo manual
- testes unitários adicionados para decodificação válida, checksum inválido e contrato do detector

## Pendências deliberadas

- detector por imagem real e YOLO
- estimativa real de bounding box a partir do frame da câmera
- múltiplas cartas no mesmo frame
