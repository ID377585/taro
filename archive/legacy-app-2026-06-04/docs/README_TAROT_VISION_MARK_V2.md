# Tarot Vision Mark v2 - marcadores visíveis para câmera

Esta versão preserva a arte das cartas e adiciona apenas uma camada técnica por código.

## Camadas
1. Arte da carta: branco/dourado com figura central em tons pastel.
2. Marcador técnico: pontos decorativos em posições fixas na moldura.

## Leitura
- Superior esquerdo: orientação.
- Superior direito: ID da carta, 7 bits.
- Inferior esquerdo: grupo/naipe, 3 bits.
- Inferior direito: checksum, 4 bits.

## Checksum
`checksum = (id ^ (group << 1) ^ 0xA) & 0xF`

## Observação para impressão
Como tinta dourada metalizada pode refletir, os pontos ativos usam centro marrom escuro fosco com halo claro e anel dourado. Isso melhora a leitura pela câmera sem parecer um código visual estranho.
