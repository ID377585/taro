# Checklist de Homologacao iPhone/Safari

## Preparacao
- Abrir o dominio de producao principal do projeto `taro`.
- Limpar cache do Safari (ou abrir em aba anonima).
- Confirmar permissao de camera concedida.

## Fluxo de Registro de Cartas
- Entrar em `Registrar Cartas`.
- Confirmar que o texto de orientacao aparece por ~2 segundos e some.
- Confirmar que a area fora do tracejado fica escurecida.
- Tirar 1 foto e validar incremento no contador da orientacao ativa.
- Alternar para `Horizontal` e repetir o teste de 1 foto.

## Fluxo de Nuvem (Supabase)
- Confirmar mensagem `Supabase ativo` no status da tela.
- Desligar internet e tirar 1 foto: fila deve subir em `pendente`.
- Religiar internet: fila deve voltar para `pendente: 0`.
- Validar no Supabase:
  - arquivo no bucket `taro-captures/raw-captures/...`
  - linha correspondente em `public.taro_metadata`

## Reset de Contador
- Apagar linhas de uma carta em `public.taro_metadata`.
- Voltar para o app e aguardar atualizacao (ate 5s ou focar a aba).
- Confirmar que contador remoto dessa carta volta para `0/10`.

## Reconhecimento
- Abrir `Iniciar Tiragem` e ativar reconhecimento.
- Verificar status do modelo:
  - se bootstrap: mensagem de modelo base (esperado ate trocar modelo final)
  - se final: diagnostico com 156 classes e labels mapeadas.

## Resultado
- Marcar status final: `aprovado` ou `ajustes necessarios`.
