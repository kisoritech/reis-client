# Auditoria ponta a ponta — REIS Client e API REIS

Data da auditoria: 10/08/2026  
Escopo local: `reis-client` e `api_reis`  
Natureza: inspeção estática do código, contratos e infraestrutura, acompanhada de typecheck, testes, lint, build e validação Prisma disponíveis localmente.

## 1. Resumo executivo

O REIS já é uma solução funcional em duas camadas:

- cliente React compartilhado entre navegador e Electron;
- API NestJS central, conectada a PostgreSQL/Supabase;
- autenticação por Supabase Auth e autorização por perfil/permissões;
- CRM, agenda, atendimentos, oportunidades, campanhas e administração parcialmente cobertos pela interface;
- módulos adicionais publicados somente na API, especialmente imobiliário, auditoria e automações técnicas.

O estado atual é adequado para homologação e piloto controlado. Ainda não deve ser classificado como produção plenamente validada porque não foram executados nesta auditoria:

- teste ponta a ponta com banco e credenciais reais;
- teste dos provedores Google, Meta/WhatsApp, Resend e Storage;
- teste de carga ou benchmark;
- empacotamento Electron nas três plataformas;
- validação de observabilidade, backup, restauração e resposta a incidentes.

### Classificação geral

| Área | Estado | Evidência principal |
|---|---|---|
| Cliente web | Funcional | typecheck e build aprovados |
| Cliente desktop | Implementado, não empacotado nesta auditoria | Electron main/preload, IPC validado e sessão criptografada |
| Integração cliente/API | Ampla, mas não total | chamadas reais em 8 módulos visuais |
| API | Funcional em testes unitários | 12 suítes e 56 testes aprovados |
| Banco | Contrato válido, ambiente remoto não verificado | 60 modelos Prisma e 15 migrations Supabase |
| Segurança | Base consistente, com lacunas operacionais | JWT, permissões, tenant scope e validação; sem rate limit/Helmet explícitos |
| Qualidade | Cliente saudável; API com dívida de lint | cliente com 1 aviso; API com 2.551 ocorrências |
| Performance | Não medida | não existe suíte k6/Artillery nem métricas p95/p99 |
| Produção | Configurada, não certificada | Render com uma instância e health check |

## 2. Método e limites

Foram verificados:

- arquivos-fonte, contratos, DTOs, controllers, services e módulos;
- rotas da interface e endpoints consumidos;
- Electron main, preload, validação IPC e armazenamento de sessão;
- schema Prisma e migrations SQL;
- guards, filtros, interceptors, CORS e validação de entrada;
- infraestrutura Render e workflows GitHub Actions;
- testes, compilação e lint locais.

Não foram expostos nem documentados valores de `.env`. Apenas os nomes publicados nos arquivos `.env.example` foram considerados.

“Implementado” significa que existe código e contrato. “Verificado” significa que uma checagem local foi executada com sucesso. Integrações externas são descritas como “não verificadas” quando dependem de credenciais, rede ou estado remoto.

## 3. Arquitetura atual

```text
Navegador React ───────────────┐
                              ├─ HTTPS/JSON ─ API NestJS ─ Prisma/pg ─ PostgreSQL/Supabase
Electron Renderer             │                    ├─ Supabase Auth/Storage
  └─ preload ─ IPC ─ main ────┘                    ├─ Google Calendar
                                                   ├─ Meta/WhatsApp
                                                   └─ CEP/IBGE e provedor de e-mail
```

### Tecnologias encontradas

| Camada | Tecnologias |
|---|---|
| Web | React 19, TypeScript 6, Vite 8, TanStack Query, Zod, Lucide |
| Desktop | Electron 43, Electron Forge, `safeStorage`, IPC com preload |
| API | NestJS 11, TypeScript 5.7, Express, Swagger, Passport/JWT |
| Dados | Prisma 7.8, adapter `pg`, PostgreSQL/Supabase |
| Testes | Vitest no cliente; Jest/Supertest na API |
| Entrega | GitHub Actions no cliente; Render na API |

## 4. Aplicação REIS Client

### 4.1 Inicialização, sessão e navegação

O cliente verifica a sessão ao iniciar. Sem sessão válida, apresenta login. Com sessão válida, carrega o shell autenticado com menu lateral, barra superior, pesquisa contextual, notificações e perfil.

Fluxos implementados:

- login por e-mail e senha;
- restauração da sessão;
- refresh serializado para impedir renovações concorrentes;
- uma nova tentativa após `401`;
- logout local e remoto;
- expiração de sessão comunicada por evento;
- timeout HTTP de 15 segundos;
- tratamento de `401`, `403`, `422` e `429`;
- preservação do `x-request-id` para suporte.

No navegador, access e refresh token ficam em `sessionStorage`. No desktop, a sessão completa é mantida no processo main e persistida com `safeStorage`; o renderer recebe apenas os dados públicos.

### 4.2 Matriz das telas e elementos

| Tela | Elementos/ações existentes | Fonte | Estado |
|---|---|---|---|
| Login | e-mail, senha, status da API e envio | `/auth/login`, `/health` | Conectado |
| Dashboard | métricas, oportunidades recentes, próximas tarefas e gráficos | `/crm/central`, `/analytics/dashboard` | Conectado |
| Agenda | mês/lista, filtros, dia, criação, detalhe, conclusão, cancelamento, exclusão e reenvio Google | `/calendar/events*` | Conectado |
| Atendimentos | listagem, catálogos, responsáveis, empreendimentos, imóveis, detalhe, criação em etapas e status | `/crm/atendimentos*`, `/crm/catalogos`, `/organizacao/usuarios`, `/imobiliario/*` | Conectado |
| Leads | etapas dinâmicas, busca, paginação, criação, histórico e mudança de status | `/crm/leads*`, `/crm/lead-statuses`, `/crm/accounts` | Conectado |
| Oportunidades | filtros, paginação, criação vinculada a atendimento, detalhe, plano, status e follow-up | `/crm/deals*`, `/crm/activities`, contas, usuários e atendimentos | Conectado |
| Fluxo operacional | indicadores e navegação entre etapas | `/crm/central`, `/analytics/dashboard`, `/analytics/overview` | Conectado para leitura |
| Campanhas | status do provedor, listagem, criação, preview, agenda, início, pausa, retomada, cancelamento e resultados | `/automation/campaigns*`, `/automation/messages/provider/status` | Conectado; provedor não verificado |
| Relatórios | consolidação analítica | `/analytics/dashboard` | Conectado, escopo visual limitado |
| Configurações/perfil | edição de nome e telefone | `/organizacao/usuarios/:id` | Conectado conforme permissão |
| Configurações/usuários | listar, criar, editar e ativar/desativar | `/organizacao/usuarios*` | Conectado; visível para perfil `dev` |
| Configurações/cargos | listar, criar, renomear e excluir | `/organizacao/cargos*` | Conectado |
| Configurações/aparência | tema e densidade | `localStorage` | Local, não sincronizado |
| Configurações/notificações | preferências visuais | `localStorage` | Local, não sincronizado |
| Configurações/idioma/região | idioma e fuso | `localStorage` | Preferência salva; tradução completa não demonstrada |
| Configurações/segurança | alteração de senha e 2FA | nenhum endpoint | Indisponível e corretamente desabilitado |
| Configurações/integrações | Google Calendar e status WhatsApp | `/integrations/google/calendar/*`, status do provedor | Conectado; integração externa não verificada |
| Configurações/privacidade | limpeza local e desativação da própria conta | storage local e status do usuário | Parcial |
| Ajuda | atalhos condicionais | ações locais/externas | Parcial |

### 4.3 Busca e notificações

- A busca possui debounce de 350 ms e é aplicada nos módulos que aceitam o termo.
- Pressionar Enter no Dashboard leva o usuário a Leads.
- As notificações do topo derivam de eventos da agenda; não existe módulo dedicado de notificações push/e-mail no cliente.
- Não há busca global unificada entre todos os domínios.

### 4.4 Estados de interface

As telas principais tratam carregamento, vazio, erro, repetição, salvamento e bloqueio durante mutações. Os formulários usam validações HTML e a API devolve erros de campo estruturados.

Pontos de atenção:

- algumas preferências dão a impressão de configuração da conta, mas são apenas locais;
- perfis e permissões controlam ações, porém a visibilidade de “Usuários” está diretamente associada ao perfil `dev`, não a uma permissão granular da interface;
- o README do cliente está defasado ao afirmar que vários módulos ainda são apenas base/demonstração;
- a troca de tema/idioma não representa uma internacionalização completa do conteúdo.

### 4.5 Desktop e segurança do renderer

Controles existentes:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- `webSecurity: true`;
- preload com superfície pequena;
- IPC validado com Zod;
- bloqueio de paths com `..`, URLs absolutas e famílias não autorizadas;
- mutações desktop exigem UUID de idempotência;
- bloqueio de navegação e novas janelas não autorizadas;
- lista de hosts externos permitidos;
- protocolo local `reis-app://` e deep links `reis://` validados;
- tokens não são entregues ao renderer desktop.

Lacuna: a exigência genérica de chave de idempotência está no cliente desktop, mas a API só aplica deduplicação efetiva de forma explícita no início de campanhas. Nas demais mutações a chave não garante, por si só, idempotência no servidor.

### 4.6 Distribuição

O cliente possui:

- build web Vite;
- empacotamento Electron Forge para Windows, Linux e macOS;
- fluxo de release por tag Git;
- atualizador de aplicação;
- ícones e metadados de produto;
- configuração de assinatura Apple por variáveis.

O workflow de qualidade executa instalação limpa, typecheck, lint, testes e build web. O workflow de release gera artefatos nas três plataformas. O empacotamento desktop não foi executado nesta auditoria.

## 5. API REIS

### 5.1 Estrutura e superfície

Foram identificados 128 handlers HTTP decorados, distribuídos entre páginas públicas, saúde, autenticação e os módulos abaixo.

| Módulo | Responsabilidade e endpoints principais | Proteção observada |
|---|---|---|
| App público | `/`, `/console`, `/privacy`, `/terms` | Público |
| Health | `/health`, `/health/ready`, `/health/detailed`, `/health/db`, `/version` | básico público; detalhado/DB para `dev` |
| Auth | login, registro, refresh, logout e perfil | login/registro/refresh públicos; validação de token nas ações privadas |
| Organização | empresas, usuários, status, cargos, permissões e equipes | JWT + permissões |
| CRM | leads, status/histórico, contas, contatos, pipelines, etapas, oportunidades e atividades | JWT + permissões |
| Plataforma comercial | catálogos, atendimentos, agenda, Google Calendar, campanhas e overview | JWT na classe principal; callback/webhook próprios |
| Imobiliário | imóveis, enriquecimento, mídia, documentos, Storage, visitas, propostas e contratos | JWT + permissões |
| Automação | templates, jobs, execuções, geração/fila/processamento/reprocessamento | JWT + permissões |
| Analytics | dashboard e visões de CRM, imóveis, vendas e tarefas | JWT + permissões |
| Auditoria | logs gerais, login e atividade | JWT + permissões |
| Integrações | CEP, IBGE e webhook Meta/WhatsApp | consultas autenticadas; webhook com validação específica |

Swagger é publicado sob o prefixo configurado no projeto. A API padroniza respostas por interceptor e inclui metadados de request ID.

### 5.2 Autenticação e autorização

Implementado:

- Supabase Auth para cadastro, login, refresh e logout;
- sincronização do usuário de autenticação com organização local;
- access token e refresh token;
- JWT strategy/guards;
- catálogo de permissões e perfis de acesso;
- guards de roles e permissions;
- registro de login/auditoria;
- criação administrativa de usuários;
- bloqueio de perfis privilegiados no registro público;
- checagem de usuário ativo e escopo por empresa nos services.

Pontos de atenção:

- `GET /auth/me` não usa decorator de guard, embora o service valide o token recebido; o comportamento é funcional, mas menos uniforme;
- não existe endpoint de troca de senha, recuperação de senha ou 2FA exposto ao cliente;
- o registro público amplia a superfície de abuso e precisa de decisão comercial, rate limit e proteção anti-bot;
- não foi encontrada limitação de tentativas de login na camada NestJS.

### 5.3 Banco de dados

O schema Prisma contém 60 modelos. Grupos principais:

- autenticação e organização: usuário, empresa, cargo, vínculo organizacional, permissões, equipes;
- CRM: cliente, contato, lead, histórico, pipeline, etapa, oportunidade, tarefa e interação;
- imobiliário: imóvel, mídia, documento, empreendimento, visita, proposta e contrato;
- atendimento: tipos, origens, status, atendimento, envolvidos e agendamentos;
- automação: formulários, regras, workflows, score, SLA, filas, templates, campanhas e destinatários;
- integrações: providers, conexões, webhooks, WhatsApp e Google Calendar;
- auditoria e analytics: logs e views de indicadores.

Há 15 migrations Supabase versionadas, cobrindo armazenamento imobiliário, fila/idempotência de mensagens, integrações, contratos CRM, plataforma comercial, integridade multi-tenant, campanhas WhatsApp e vínculo oportunidade–atendimento.

Controles encontrados:

- índices e chaves compostas no schema/migrations;
- escopo de empresa aplicado nas consultas de domínio;
- constraints de integridade comercial;
- unicidade de idempotência na fila de mensagens;
- transações em operações críticas;
- pool `pg` configurável, com máximo padrão 20 e mínimo padrão 0;
- health com `SELECT 1` e timeout de 1.200 ms;
- retry de conexão e operações auxiliares;
- detecção de query lenta acima de 1 segundo.

Limites:

- as métricas de pool mantidas pelo `PrismaService` são um retrato configurado, não uma leitura dinâmica comprovada de conexões ativas/ociosas/em espera;
- o schema local ser válido não comprova que todas as migrations foram aplicadas no banco remoto;
- não foi executado teste de integridade ou seed contra uma base real.

### 5.4 CRM e plataforma comercial

O CRM oferece CRUD e consultas de contas, contatos, leads, oportunidades e atividades. Há paginação com consulta de itens e contagem, catálogos de pipeline e histórico de mudança de status.

A plataforma comercial complementa o CRM com:

- catálogos operacionais;
- atendimentos e respectivos vínculos;
- agenda interna;
- integração bidirecional com Google Calendar;
- campanhas WhatsApp com preview, aprovação, agendamento e execução;
- overview analítico comercial.

O vínculo entre oportunidade e atendimento foi formalizado na migration mais recente. A criação de lead no cliente ainda cria conta e lead em duas requisições, portanto uma falha intermediária pode deixar uma conta sem lead.

### 5.5 Imobiliário

A API publica:

- listagem, criação, consulta e atualização de imóveis;
- enriquecimento de endereço;
- cadastro e upload de mídia/documentos;
- inspeção e sincronização com Storage;
- visitas, propostas e contratos;
- upload de contrato.

O cliente atual usa empreendimentos e imóveis dentro do fluxo de atendimentos, mas ainda não oferece módulo visual completo para catálogo, mídia, documentos, visitas, propostas e contratos.

### 5.6 Automação, mensagens e campanhas

Existem templates, jobs de follow-up, logs de execução, geração de mensagens, fila, status de provider, processamento e reprocessamento.

O scheduler:

- fica desativado por padrão;
- quando habilitado, processa a fila em intervalos configuráveis;
- gera mensagens diárias em horário configurado;
- evita reentrada dentro da mesma instância.

Riscos operacionais:

- scheduler e API rodam no mesmo processo;
- a trava de reentrada é apenas em memória;
- múltiplas instâncias podem executar o scheduler simultaneamente se não houver lock distribuído;
- não há Redis/BullMQ ou worker separado;
- campanhas inserem destinatários sequencialmente em um loop dentro da transação, o que pode degradar lotes grandes;
- status real depende de credenciais e webhooks do provedor.

### 5.7 Google Calendar

O código implementa:

- conexão OAuth;
- state assinado;
- armazenamento criptografado de access/refresh token;
- renovação de token;
- status e verificação da conexão;
- criação, atualização e exclusão de eventos remotos;
- retry manual de sincronização;
- callback e webhook.

Os testes unitários cobrem assinatura, criptografia, refresh e sincronização simulada. Não houve autorização OAuth real nesta auditoria.

### 5.8 Meta/WhatsApp

O código implementa:

- verificação do webhook;
- recepção de eventos;
- persistência de eventos/mensagens;
- templates e mapeamento de mensagens utilitárias;
- provider status;
- campanhas com consentimento/snapshot e idempotência da fila;
- configuração por variáveis Meta/WhatsApp.

Não foi validado envio real, aprovação de template, assinatura do webhook ou entrega de callback em produção.

### 5.9 Integrações auxiliares e Storage

- CEP e IBGE possuem endpoints autenticados, timeout e repetição controlada.
- Supabase Storage é usado para arquivos imobiliários.
- Há suporte configurável a e-mail/Resend na automação.
- Nenhuma dessas dependências externas foi exercitada com credenciais reais.

### 5.10 Respostas, erros e observabilidade

Implementado:

- envelope padronizado de sucesso/erro;
- request ID;
- logger central;
- mapeamento de exceções Prisma;
- erros de validação por campo;
- endpoints de health, readiness, banco, versão e health detalhado;
- logs de auditoria, atividade e login no domínio.

Ausente ou não demonstrado:

- exportação de métricas Prometheus/OpenTelemetry;
- tracing distribuído;
- alertas e dashboards operacionais;
- centralização externa de logs;
- SLOs e retenção documentada;
- monitoramento de p95/p99 e taxa de erro.

## 6. Segurança

### Controles positivos

- validação global com whitelist e bloqueio de campos desconhecidos;
- CORS por allowlist em produção;
- JWT, roles e permissões;
- isolamento por empresa nas operações de domínio;
- tokens Google criptografados;
- segredos mantidos fora do cliente;
- upload mediado pela API;
- renderer Electron isolado e sem Node;
- request ID e auditoria;
- proteção de endpoints detalhados de saúde;
- constraints multi-tenant nas migrations mais recentes.

### Lacunas prioritárias

1. Não foi encontrado rate limiting global ou específico para login/registro/webhooks.
2. Não foi encontrado uso explícito de Helmet/cabeçalhos HTTP de endurecimento na API.
3. A idempotência não é generalizada no servidor.
4. Não há política automatizada de tamanho total de payload documentada além dos limites de upload locais.
5. Não há varredura de dependências/segredos no CI da API.
6. A API não possui workflow CI versionado no repositório.
7. O lint da API não está limpo e o uso de `any` reduz garantias de tipo em áreas centrais.
8. Backup, RPO/RTO, restauração e rotação de chaves não estão demonstrados no código.

## 7. Infraestrutura e capacidade

A API está declarada como um serviço Node único no Render, plano gratuito, com build que:

1. instala dependências;
2. aplica migrations via Supabase CLI;
3. gera Prisma Client;
4. compila NestJS;
5. inicia um único processo Node.

O health check de infraestrutura usa `/api/v1/health/ready`.

Não existem no projeto:

- múltiplas instâncias declaradas;
- balanceador configurado pelo repositório;
- Redis/cache distribuído;
- broker/fila externa;
- réplicas de leitura;
- cluster Node;
- benchmark k6/Artillery.

Consequentemente, nenhum número exato de RPS pode ser certificado. A faixa prudente de planejamento continua sendo 20–50 RPS sustentados para carga mista até medição real, não uma garantia.

## 8. Resultado das verificações executadas

### Cliente

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm test` | Aprovado: 1 arquivo, 3 testes |
| `npm run lint` | Concluído com 1 aviso de `react-hooks/exhaustive-deps` em `Settings.tsx` |
| `npm run build` | Aprovado |
| Build web | JS 331,79 kB (94,28 kB gzip); CSS 50,87 kB (9,91 kB gzip) |
| Playwright E2E | Não executado; script existe, mas não foi encontrada suíte/configuração Playwright no inventário |
| Electron package/make | Não executado |

### API

| Checagem | Resultado |
|---|---|
| TypeScript `--noEmit` | Aprovado |
| Jest unitário | Aprovado: 12 suítes, 56 testes |
| Prisma validate | Aprovado: schema válido |
| ESLint sem `--fix` | Reprovado: 2.551 ocorrências, sendo 2.447 erros e 104 avisos |
| Natureza do lint | forte volume de Prettier/CRLF e diversos `no-unsafe-*` ligados a `any` |
| Jest E2E separado | Não executado contra dependências reais |
| Build com emissão | Não executado porque o repositório da API estava fora da raiz gravável desta sessão; o typecheck equivalente passou |

Os logs de erro exibidos durante Jest correspondem a cenários deliberadamente simulados pelos testes e não causaram falha das suítes.

## 9. Cobertura entre cliente e API

### Coberto visualmente

- auth e sessão;
- dashboard e analytics básico;
- leads e histórico;
- contas de CRM como apoio;
- oportunidades e follow-up;
- atendimentos;
- agenda e Google Calendar;
- campanhas WhatsApp;
- usuários e cargos;
- status das integrações.

### Parcialmente coberto

- atividades aparecem como fluxo/follow-up, sem gerenciador completo dedicado;
- analytics possui dashboard/relatório, mas não todas as dimensões publicadas;
- imóveis e empreendimentos aparecem no atendimento, sem catálogo visual completo;
- permissões são aplicadas, mas não existe editor visual completo de permissões/equipes;
- auditoria existe apenas na API;
- automações técnicas existem apenas na API.

### Sem tela correspondente

- empresas;
- permissões e equipes completas;
- logs de auditoria/login/atividade;
- catálogo imobiliário completo, mídia e documentos;
- visitas, propostas e contratos;
- templates, jobs, execuções e fila de mensagens;
- administração técnica de webhooks/providers;
- health detalhado e versão.

## 10. Pendências priorizadas

### P0 — antes de produção ampla

1. Criar ambiente de homologação reproduzível e executar E2E com banco real isolado.
2. Adicionar rate limit para login, registro, refresh e endpoints públicos/webhooks.
3. Validar migrations aplicadas e executar teste de integridade multi-tenant.
4. Configurar monitoramento, alertas, logs externos e métricas p95/p99.
5. Testar backup e restauração; documentar RPO/RTO.
6. Corrigir ou estabelecer baseline explícito para o lint da API.
7. Criar CI da API com typecheck, lint, Jest, Prisma validate e teste de migration.
8. Testar Google e WhatsApp ponta a ponta com contas de homologação.

### P1 — robustez comercial

1. Tornar criação conta + lead uma operação transacional única.
2. Implementar idempotência geral para mutações críticas.
3. Separar scheduler/workers da instância HTTP e adicionar lock distribuído.
4. Criar testes de carga com cenários reais e metas de p95/p99.
5. Publicar telas de imóveis, propostas, visitas e contratos.
6. Criar administração visual de permissões, equipes e auditoria.
7. Implementar recuperação/troca de senha e estratégia de 2FA.
8. Sincronizar preferências de usuário no servidor ou rotulá-las claramente como locais.

### P2 — evolução e manutenção

1. Reduzir `any` e remover casts dinâmicos nos services.
2. Dividir `app.service.ts`, que concentra páginas públicas/console muito extensas.
3. Ampliar testes do cliente para cada tela e mutação crítica.
4. Criar suíte Playwright real para web e smoke test do Electron.
5. Documentar catálogo OpenAPI por domínio e versionamento de contratos.
6. Implementar internacionalização real se os idiomas alternativos forem mantidos.

## 11. Critérios recomendados para liberação

Uma primeira produção comercial deve exigir, no mínimo:

- todos os checks de CI verdes;
- zero erro crítico/alto conhecido de segurança;
- migrations reproduzidas em banco limpo;
- E2E de login, lead, atendimento, oportunidade, agenda e campanha em homologação;
- isolamento de duas empresas comprovado por teste;
- p95 abaixo de 500 ms em carga-alvo inicial;
- erro abaixo de 1%;
- backup e restauração testados;
- alertas para indisponibilidade, erro e saturação do banco;
- rollback documentado para aplicação e migrations.

## 12. Conclusão

O REIS não está mais no estágio de simples protótipo visual. Há integração real e uma base de domínio considerável. O cliente web compila e testa corretamente; a API compila por typecheck, possui schema válido e 56 testes unitários aprovados.

O maior intervalo entre “funciona localmente” e “produção certificada” está em operação: lint/CI da API, testes reais de banco e provedores, observabilidade, rate limiting, recuperação e performance. A recomendação é tratar o estado atual como **homologação avançada/piloto**, fechar os itens P0 e só então declarar capacidade e disponibilidade de produção com números medidos.
