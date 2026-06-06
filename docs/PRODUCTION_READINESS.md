# Prontidao de Producao - Taro

Este documento resume o estado real do app atual e os proximos blocos de trabalho para transformar o MVP em uma plataforma profissional de leitura.

## Estado atual

- Frontend Vite/React com PWA offline-first.
- Base local com 78 cartas e tiragens em `public/data`.
- Teleprompter privado com camera, selecao manual, atalhos, voz, cronometro, fullscreen e historico local.
- Registro guiado de cartas com fila em IndexedDB e upload opcional para Supabase.
- Reconhecimento por Tarot Vision Mark e fallback por template do baralho oficial.
- Modelo TensorFlow.js em `public/model` ainda e bootstrap, nao final.
- Historico, clientes e sessoes vivem principalmente no navegador local.

## Pendencias criticas

1. **Modelo final de IA**
   - Substituir `public/model/*` por artefatos finais treinados.
   - O alvo atual de verificacao e 156 classes: 78 cartas x 2 orientacoes.
   - Rodar `npm run model:verify` depois da troca.

2. **Autenticacao e controle de acesso**
   - Criar login do tarologo/admin.
   - Proteger rotas e dados sensiveis.
   - Usar sessao segura; evitar dados de atendimento acessiveis sem autenticacao.

3. **Banco de dados de negocio**
   - Persistir usuarios, clientes, tipos de leitura, sessoes e cartas confirmadas em backend.
   - Definir se o caminho sera manter Vite + backend separado ou migrar para Next.js/Prisma/PostgreSQL.

4. **Sala do cliente**
   - Criar link publico da leitura.
   - Separar claramente visao do tarologo e visao do cliente.
   - Implementar streaming em tempo real, idealmente WebRTC com sinalizacao.

5. **Seguranca Supabase**
   - A configuracao atual serve para coleta de capturas, mas nao para dados sensiveis de cliente.
   - Revisar RLS, permissoes `anon` e separacao entre ambiente de coleta e ambiente de produto.

6. **Homologacao mobile**
   - Executar `roteiros/checklist_homologacao_ios.md` em iPhone/Safari.
   - Registrar aprovacao ou ajustes necessarios antes de uso em atendimento real.

## Ordem recomendada

1. Fechar o ambiente local/CI: Node 22, `npm ci`, `npm run check`, `npm run build`, `npm run e2e`.
2. Trocar o modelo bootstrap pelo modelo final ou declarar oficialmente que o MVP usa apenas Tarot Vision Mark.
3. Escolher arquitetura de producao: evoluir o app atual ou reconstruir em monorepo Next.js/Prisma.
4. Implementar autenticacao e persistencia de negocio.
5. Implementar sala do cliente e regras de privacidade.
6. Criar painel admin para tipos de leitura, textos base, usuarios e configuracoes.

## Decisao pendente

O plano mestre original descreve uma reconstrucao em Next.js, Prisma e PostgreSQL. O app atual seguiu outro caminho: PWA local forte, coleta de dataset e reconhecimento por marcador/template. Antes de crescer backend e video, escolha um destes caminhos:

- **Caminho A:** manter o app atual e adicionar backend/API ao redor dele.
- **Caminho B:** iniciar a reconstrucao planejada em Next.js/Prisma e migrar as partes boas do MVP.

Enquanto essa decisao nao for tomada, evite grandes refatores de UI. Priorize ajustes que melhorem diagnostico, seguranca e confiabilidade sem travar a migracao futura.
