Este diretório já contém um modelo bootstrap neutro para evitar falhas de inicialização.

Para reconhecimento com IA treinada, substitua pelos arquivos exportados do Teachable Machine:

- `model.json`
- `metadata.json`
- `weights.bin` (ou múltiplos arquivos de pesos)

Estrutura esperada pelo app:

```text
public/model/
  model.json
  metadata.json
  weights.bin
```
