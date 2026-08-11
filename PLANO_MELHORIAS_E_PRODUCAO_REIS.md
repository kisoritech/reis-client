# Plano de melhorias e preparação para produção — REIS

Data: 10/08/2026  
Documento-base: `AUDITORIA_PONTA_A_PONTA_2026-08-10.md`  
Estado de referência: homologação avançada/piloto, aproximadamente 78% no indicador gerencial adotado.

## 1. Objetivo

Este documento converte as pendências da auditoria em trabalho executável. Ele diferencia:

- **mudança direta:** alteração que pode ser implementada no código ou configuração versionada;
- **geração:** criação de testes, pipelines, relatórios, dashboards, scripts ou documentos;
- **ação externa:** atividade que depende de acesso ao Render, Supabase, Google Cloud, Meta, DNS ou decisão do responsável pelo produto;
- **validação:** execução controlada para comprovar que algo funciona no ambiente real.

O objetivo não é apenas “ter o código”, mas produzir evidências de segurança, funcionamento, recuperação e capacidade.

## 2. Resultado esperado

Ao concluir o P0, o REIS deverá possuir:

- ambiente de homologação separado da produção;
- banco criado integralmente por migrations;
- fluxos críticos cobertos por E2E;
- API protegida contra abuso básico;
- CI bloqueando regressões;
- métricas, logs e alertas operacionais;
- backup e restauração comprovados;
- Google Calendar e WhatsApp homologados;
- capacidade inicial medida por teste de carga;
- procedimentos de deploy, rollback e incidente.

## 3. Ordem obrigatória de execução

```text
Decisões e acessos
  → ambiente de homologação
  → CI e qualidade mínima
  → segurança
  → migrations e dados
  → E2E funcional
  → integrações externas
  → observabilidade
  → backup/restauração
  → carga e capacidade
  → aprovação de produção
```

Testes de carga e integrações reais não devem começar antes de existir um ambiente de homologação isolado.

## 4. Decisões e acessos necessários

Estas questões não podem ser resolvidas somente por alteração de código.

| Decisão/acesso | Responsável sugerido | Necessidade |
|---|---|---|
| Definir URLs de homologação e produção | Produto/infra | separar origens, callbacks e webhooks |
| Criar projeto Supabase de homologação | Infra | banco, Auth e Storage isolados |
| Criar serviço Render de homologação | Infra | executar API sem afetar produção |
| Criar aplicação Google OAuth de homologação | Administrador Google | testar OAuth e Calendar |
| Definir WABA/número Meta de homologação | Administrador Meta | testar WhatsApp real |
| Escolher plataforma de observabilidade | Infra | Sentry, Grafana/OTel ou equivalente |
| Definir RPO e RTO | Negócio + infra | frequência de backup e tempo de recuperação |
| Definir política de registro público | Produto/segurança | manter, restringir por convite ou desativar |
| Definir metas iniciais de carga | Produto/engenharia | usuários, RPS e latência-alvo |
| Definir retenção de logs e auditoria | Jurídico/segurança | privacidade e investigação |

### Valores recomendados inicialmente

- p95 de leitura CRUD: até 500 ms;
- p95 de escrita: até 800 ms;
- taxa de erro sob carga-alvo: abaixo de 1%;
- disponibilidade mensal inicial: 99,5%;
- RPO: até 24 horas, preferencialmente menor;
- RTO: até 4 horas;
- retenção de logs técnicos: 30 dias;
- carga inicial a comprovar: 50 RPS mistos, com crescimento progressivo.

## 5. P0.1 — Ambiente de homologação

### Tipo

Ação externa + geração + configuração direta.

### Mudanças diretas

- criar configuração explícita para `development`, `staging` e `production`;
- validar variáveis obrigatórias na inicialização da API;
- impedir que staging use banco, bucket ou credenciais de produção;
- publicar URLs diferentes no cliente e na API;
- configurar CORS por ambiente;
- manter automações e campanhas desativadas inicialmente em staging.

### Artefatos a gerar

- `.env.staging.example` sem segredos;
- checklist de provisionamento;
- matriz de variáveis por ambiente;
- script de smoke test do ambiente;
- inventário de callbacks e webhooks.

### Ações externas

1. Criar projeto Supabase staging.
2. Criar banco, Auth e bucket staging.
3. Criar serviço Render staging.
4. Cadastrar variáveis secretas diretamente nas plataformas.
5. Configurar URLs Google/Meta específicas de staging.

### Critérios de aceite

- staging inicia sem acessar recursos de produção;
- `/api/v1/health/ready` responde pronto;
- cliente staging autentica e consulta dados staging;
- uma marca ou registro sentinela comprova que os bancos são diferentes;
- segredos não aparecem no Git, build ou logs.

## 6. P0.2 — CI da API e qualidade

### Tipo

Mudança direta + geração.

### Mudanças diretas

- criar `.github/workflows/quality.yml` na API;
- executar Node 22, conforme `engines` da API;
- executar instalação limpa, Prisma generate/validate, typecheck, lint e Jest;
- separar comandos de lint de comandos que alteram arquivos;
- impedir deploy quando o pipeline falhar;
- padronizar line endings por `.gitattributes` e EditorConfig;
- reduzir gradualmente o uso de `any` nos services centrais.

### Sequência recomendada para as 2.551 ocorrências

1. Separar ocorrências de Prettier/CRLF das ocorrências semânticas.
2. Aplicar formatação mecânica em commit exclusivo.
3. Executar novamente o lint para obter o baseline real.
4. Corrigir primeiro `no-unsafe-return`, `no-unsafe-call`, `no-unsafe-member-access` e `no-base-to-string` em auth, organização e plataforma comercial.
5. Tipar os adaptadores de modelos Prisma usados dinamicamente.
6. Proibir novas ocorrências no CI.
7. Remover o baseline restante por módulo, sem desabilitar regras globalmente.

### Artefatos a gerar

- workflow de qualidade;
- relatório de lint antes/depois;
- baseline temporário, se indispensável, com prazo e responsável;
- relatório de cobertura Jest;
- política de branches e checks obrigatórios.

### Critérios de aceite

- pipeline executa em pull request e `main`;
- typecheck, Prisma validate e testes ficam verdes;
- nenhuma nova ocorrência de lint é aceita;
- erros semânticos prioritários são zerados;
- formatação deixa de variar entre Windows e Linux.

## 7. P0.3 — Rate limiting e endurecimento HTTP

### Tipo

Mudança direta + validação.

### Mudanças diretas

- adicionar rate limiting global e limites específicos;
- adicionar Helmet ou cabeçalhos equivalentes;
- limitar tamanho de JSON e uploads;
- definir timeout de requisição e de integrações externas;
- revisar CORS, métodos e headers aceitos;
- não registrar tokens, senhas ou payloads sensíveis;
- validar assinatura dos webhooks antes de processar payloads;
- aplicar respostas uniformes para não revelar existência de contas.

### Política inicial sugerida

| Rota | Limite inicial sugerido |
|---|---:|
| `POST /auth/login` | 5 tentativas/minuto por IP e identificador |
| `POST /auth/register` | 3/hora por IP |
| `POST /auth/refresh` | 30/minuto por sessão/IP |
| webhooks | limite alto por origem, com assinatura obrigatória |
| API autenticada | 300/minuto por usuário, ajustável |
| uploads | limite simultâneo e de tamanho por tipo |

Em múltiplas instâncias, o contador deve ser distribuído; memória local só é aceitável enquanto existir uma única instância.

### Artefatos a gerar

- testes automatizados de `429`;
- matriz de headers de segurança;
- documento de limites por endpoint;
- registro de ameaças e mitigação.

### Critérios de aceite

- tentativas acima do limite retornam `429` e `Retry-After`;
- usuários diferentes não compartilham incorretamente o mesmo limite autenticado;
- webhooks inválidos são rejeitados antes de persistência;
- headers de segurança aparecem nas respostas públicas e da API;
- payload acima do limite é recusado de maneira controlada.

## 8. P0.4 — Idempotência de mutações

### Tipo

Mudança direta + migration + testes.

### Situação atual

O cliente envia `Idempotency-Key` em diversas mutações e o desktop exige a chave, mas a API aplica deduplicação comprovada principalmente ao iniciar campanhas.

### Mudanças diretas

- criar armazenamento de chaves por empresa, usuário, método e rota;
- armazenar hash do payload e resultado/status da primeira operação;
- devolver o mesmo resultado ao repetir a mesma chave e payload;
- rejeitar a reutilização da chave com payload diferente;
- definir expiração das chaves;
- priorizar criação de lead/conta, oportunidades, atendimentos, agenda, propostas, contratos e campanhas.

### Artefatos a gerar

- migration da tabela de idempotência;
- interceptor/decorator de idempotência;
- testes unitários, concorrentes e E2E;
- documentação OpenAPI do header.

### Critérios de aceite

- duas requisições concorrentes com a mesma chave geram apenas um efeito;
- retry após timeout não duplica registro;
- mesma chave com corpo diferente retorna conflito;
- escopo de uma empresa nunca interfere em outra.

## 9. P0.5 — Banco, migrations e isolamento multi-tenant

### Tipo

Validação + geração; eventuais mudanças diretas em migrations.

### Atividades

1. Criar banco staging vazio.
2. Aplicar todas as 15 migrations na ordem.
3. Executar Prisma validate e generate.
4. Executar health detalhado e verificação de schema comercial.
5. Popular dados mínimos de duas empresas.
6. Executar testes cruzados de leitura e escrita.
7. inspecionar índices das consultas mais utilizadas.
8. testar rollback ou estratégia forward-fix de cada migration crítica.

### Artefatos a gerar

- seed seguro de staging;
- teste automático de migration em banco efêmero;
- suíte de isolamento de tenant;
- relatório de índices e `EXPLAIN ANALYZE`;
- checklist de deploy de migrations;
- registro da versão aplicada.

### Critérios de aceite

- banco vazio chega ao schema atual sem intervenção manual;
- API inicia e fica ready;
- empresa A não lê, altera ou vincula dados da empresa B;
- constraints rejeitam vínculos cruzados;
- queries críticas usam índices adequados;
- falha de migration não deixa o deploy sem plano de recuperação.

## 10. P0.6 — Testes E2E

### Tipo

Geração + validação.

### Suíte mínima da API

- registro permitido e perfis privilegiados bloqueados;
- login válido/inválido, refresh, logout e usuário inativo;
- permissões e acesso negado;
- criação e histórico de lead;
- conta + lead sem estado parcial;
- atendimento com referências válidas e inválidas;
- oportunidade vinculada ao atendimento;
- follow-up e conclusão de atividade;
- agenda CRUD e sincronização simulada;
- campanha com preview, aprovação e idempotência;
- isolamento entre duas empresas;
- erros Prisma convertidos para envelope público.

### Suíte mínima do cliente com Playwright

- login e restauração de sessão;
- navegação em todas as telas;
- busca, filtros e paginação;
- criação de lead;
- criação de atendimento;
- criação e atualização de oportunidade;
- criação, conclusão e exclusão de evento;
- criação de campanha sem disparo automático;
- edição de perfil/usuário conforme permissão;
- expiração de sessão e refresh;
- estados de erro, vazio e retry.

### Artefatos a gerar

- configuração Playwright;
- fixtures e factories;
- usuário/empresa descartáveis;
- mocks apenas para falhas externas controladas;
- relatório HTML e screenshots de falha;
- limpeza segura dos dados de teste.

### Critérios de aceite

- suíte roda repetidamente sem depender de ordem;
- nenhuma execução usa produção;
- falha produz evidência suficiente para diagnóstico;
- fluxos críticos ficam obrigatórios no CI;
- testes de tenant e permissão são sempre executados.

## 11. P0.7 — Google Calendar

### Tipo

Ação externa + validação + documentação.

### Ações externas

- criar projeto/app OAuth de staging;
- configurar tela de consentimento;
- cadastrar redirect URI exata;
- cadastrar webhook HTTPS;
- usar conta Google dedicada de homologação;
- revisar escopos mínimos solicitados.

### Roteiro de validação

1. Conectar conta pelo cliente.
2. Confirmar armazenamento criptografado dos tokens.
3. Criar evento local e conferir evento remoto.
4. Editar e excluir em ambos os sentidos suportados.
5. Expirar access token e comprovar refresh.
6. Revogar consentimento e validar degradação.
7. Repetir callback/webhook e confirmar idempotência.
8. Desconectar e comprovar remoção/revogação apropriada.

### Artefatos a gerar

- checklist OAuth;
- relatório de evidências com IDs não sensíveis;
- runbook de token expirado/revogado;
- política de escopos e privacidade;
- teste de contrato do webhook.

### Critérios de aceite

- fluxo completo funciona em staging;
- tokens nunca aparecem no cliente ou logs;
- refresh acontece sem intervenção;
- falha do Google não impede salvar o evento local;
- retry e reconciliação funcionam.

## 12. P0.8 — Meta/WhatsApp

### Tipo

Ação externa + validação + documentação.

### Ações externas

- configurar app Meta, WABA e número de teste;
- registrar webhook e verify token;
- configurar assinatura/secret;
- criar e aprovar templates de homologação;
- cadastrar destinatários autorizados;
- revisar consentimento e política de mensagens.

### Roteiro de validação

1. Verificar webhook.
2. Receber evento assinado válido e rejeitar assinatura inválida.
3. Sincronizar templates aprovados.
4. Gerar preview e snapshot de destinatários.
5. Iniciar lote pequeno com chave de idempotência.
6. Confirmar enviados, entregues, lidos e falhos.
7. Simular rate limit/erro do provider e reprocessar.
8. Pausar, retomar e cancelar campanha.
9. Confirmar que destinatário sem consentimento não é enfileirado.

### Artefatos a gerar

- matriz template → variáveis;
- evidências dos callbacks;
- runbook de falha do provider;
- política de consentimento e opt-out;
- relatório de reconciliação campanha/provider.

### Critérios de aceite

- nenhum envio ocorre sem preview/aprovação exigida;
- duplicação de start não duplica mensagens;
- callbacks atualizam status corretamente;
- assinatura inválida é rejeitada;
- limites do provider geram retry controlado, não tempestade de requisições.

## 13. P0.9 — Observabilidade

### Tipo

Mudança direta + ação externa + geração.

### Mudanças diretas

- instrumentar duração, status, rota normalizada e request ID;
- medir queries e saturação real do pool;
- propagar correlação para integrações e jobs;
- remover dados sensíveis dos logs;
- registrar métricas de fila, campanha e sincronização;
- adicionar encerramento gracioso e sinalização de readiness.

### Métricas mínimas

- requisições por rota/status;
- latência p50/p95/p99;
- taxa de erro;
- conexões ativas, ociosas e em espera reais;
- queries lentas;
- memória, CPU e reinicializações;
- tamanho/idade/falhas da fila;
- sucesso/falha Google e WhatsApp;
- logins falhos e bloqueios por rate limit.

### Artefatos a gerar

- dashboard operacional;
- alertas;
- catálogo de métricas;
- política de retenção e redação de logs;
- runbook por alerta.

### Critérios de aceite

- um erro do cliente pode ser localizado pelo request ID;
- p95/p99 aparecem por rota;
- fila parada e banco saturado geram alerta;
- nenhum token/senha é capturado;
- alertas são testados, não apenas configurados.

## 14. P0.10 — Backup, restauração e rollback

### Tipo

Ação externa + geração + validação destrutiva somente em ambiente isolado.

### Atividades

- confirmar política de backup do PostgreSQL e Storage;
- criar exportação adicional se necessária;
- restaurar uma cópia em projeto isolado;
- verificar contagens, vínculos e arquivos;
- medir tempo de recuperação;
- documentar rollback de aplicação;
- definir forward-fix/rollback para migrations;
- testar rotação de segredo/chave em staging.

### Artefatos a gerar

- política de backup;
- runbook de restauração;
- relatório do teste de restauração;
- checklist de rollback;
- inventário de chaves e responsáveis, sem valores secretos.

### Critérios de aceite

- restauração completa termina dentro do RTO;
- perda fica dentro do RPO;
- aplicação inicia sobre a cópia restaurada;
- arquivos e vínculos críticos são conferidos;
- responsáveis conseguem seguir o runbook sem conhecimento implícito.

## 15. P0.11 — Performance e capacidade

### Tipo

Geração + validação.

### Cenários k6/Artillery necessários

- health sem banco como referência;
- login em taxa controlada;
- listar leads com filtros/paginação;
- abrir central/dashboard;
- listar e detalhar atendimentos;
- listar/criar oportunidade;
- consultar/criar agenda;
- mistura realista de 80% leitura e 20% escrita;
- automação/fila concorrendo com tráfego HTTP;
- soak test de 1–4 horas;
- pico progressivo até degradação.

### Artefatos a gerar

- scripts de carga versionados;
- dados sintéticos em volume representativo;
- relatório com RPS, p95, p99, erros, CPU, memória e pool;
- limite operacional recomendado;
- plano de otimização baseado em evidência.

### Critérios de aceite iniciais

- 50 RPS mistos sustentados no ambiente-alvo;
- p95 de leitura abaixo de 500 ms;
- p95 de escrita abaixo de 800 ms;
- erro abaixo de 1%;
- nenhuma violação de tenant ou duplicação;
- recuperação após pico sem reinício manual.

O teste deve usar staging e dados sintéticos. Nunca deve disparar mensagens ou calendários reais inadvertidamente.

## 16. P1 — Melhorias de robustez comercial

### 16.1 Conta + lead transacional

Criar endpoint único que persista conta e lead na mesma transação. Atualizar o cliente para uma chamada. Aceite: falha em qualquer etapa não deixa conta órfã.

### 16.2 Workers e lock distribuído

Separar scheduler do processo HTTP, adicionar claim/lock no banco ou broker e garantir entrega ao menos uma vez com handlers idempotentes. Aceite: duas instâncias não processam a mesma mensagem simultaneamente.

### 16.3 Preferências persistentes

Criar modelo e endpoints para tema, densidade, idioma, fuso e notificações. Migrar o `localStorage` como cache/fallback. Aceite: preferências acompanham o usuário em outro dispositivo.

### 16.4 Segurança da conta

Adicionar recuperação e troca de senha pelo provedor, confirmação de e-mail e estratégia de 2FA. Aceite: os fluxos não expõem existência de conta e revogam sessões quando necessário.

### 16.5 Módulos visuais restantes

Prioridade sugerida:

1. imóveis e empreendimentos;
2. visitas, propostas e contratos;
3. auditoria;
4. permissões e equipes;
5. automações, jobs e fila;
6. analytics por dimensão.

Cada módulo precisa de permissão visual, estados de erro/vazio, paginação, auditoria e testes E2E.

## 17. P2 — Manutenibilidade e escala

- substituir adaptadores `any` por interfaces ou delegates Prisma tipados;
- dividir `app.service.ts` em páginas/serviços menores;
- versionar contratos OpenAPI e detectar breaking changes;
- adicionar cache apenas depois de medir queries;
- preparar scale-out da API e pool compatível;
- avaliar Redis/broker quando a carga justificar;
- implementar i18n real ou limitar a configuração de idioma;
- criar testes de acessibilidade e responsividade;
- automatizar auditoria de dependências, licenças e segredos.

## 18. Matriz de entregáveis

| Entregável | Tipo | Local sugerido |
|---|---|---|
| CI da API | Código gerado | `api_reis/.github/workflows/quality.yml` |
| Configuração de line endings | Código gerado | `.gitattributes`, `.editorconfig` |
| Testes E2E da API | Código gerado | `api_reis/test/e2e/` |
| Playwright do cliente | Código gerado | `reis-client/e2e/` e `playwright.config.ts` |
| Testes de carga | Código gerado | `api_reis/test/load/` |
| Seed staging | Código gerado | `api_reis/prisma/` ou `supabase/seed.sql` |
| Rate limiting/headers | Mudança direta | bootstrap/módulo de segurança da API |
| Idempotência | Mudança + migration | core/interceptor e migration Supabase |
| Métricas/tracing | Mudança direta | core/observability |
| Dashboards/alertas | Configuração externa | plataforma escolhida |
| Runbooks | Documentação gerada | `docs/runbooks/` |
| Evidências Google/Meta | Relatório gerado | `docs/homologacao/` sem segredos |
| Relatório de carga | Relatório gerado | `docs/performance/` |
| Relatório de restauração | Relatório gerado | `docs/continuity/` |

## 19. Quadro de acompanhamento sugerido

Para cada item, registrar:

| Campo | Conteúdo esperado |
|---|---|
| Identificador | Ex.: `P0-SEC-01` |
| Responsável | pessoa/equipe |
| Ambiente | local, staging ou produção |
| Dependências | acessos, decisões e tarefas anteriores |
| Mudança | arquivos/configurações afetados |
| Evidência | teste, relatório, screenshot ou métrica |
| Critério de aceite | condição binária verificável |
| Risco/rollback | impacto e retorno seguro |
| Estado | pendente, em andamento, bloqueado ou concluído |

Uma tarefa só deve ser marcada como concluída quando houver evidência e critério de aceite atendido. Código escrito sem validação permanece “implementado”, não “homologado”.

## 20. Marcos de evolução

### Marco A — base controlada, 82–84%

- staging isolado;
- CI da API;
- migrations reproduzíveis;
- baseline/correção inicial do lint.

### Marco B — homologação funcional, 86–88%

- E2E crítico aprovado;
- rate limiting e headers;
- isolamento multi-tenant comprovado;
- idempotência crítica.

### Marco C — produção inicial, 88–92%

- Google e WhatsApp homologados;
- observabilidade e alertas;
- restauração testada;
- carga inicial aprovada;
- runbooks e rollback.

### Marco D — robustez comercial, 94–97%

- workers separados;
- módulos visuais prioritários;
- preferências e segurança da conta;
- qualidade/tipagem consolidada.

## 21. Próxima ação recomendada

O primeiro ciclo deve conter somente:

1. decisão sobre registro público e metas operacionais;
2. provisionamento de staging;
3. CI da API;
4. padronização de line endings e diagnóstico limpo do lint;
5. teste de migrations em banco vazio;
6. primeira suíte E2E de autenticação e isolamento de tenant.

Esse ciclo cria a fundação segura para todas as validações posteriores. Implementar observabilidade, integrações ou carga antes dele produziria resultados difíceis de repetir e potencialmente misturados com produção.
