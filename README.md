# REIS Client

Aplicação CRM compartilhada entre navegador e desktop, construída com React,
TypeScript, Vite e Electron. O projeto reúne uma interface responsiva em tema
preto e dourado, uma camada desktop segura e um cliente preparado para consumir
a API central da plataforma REIS.

> Estado atual: a fundação web/desktop, o dashboard e a navegação visual estão
> funcionais. Os indicadores exibem dados demonstrativos até que cada tela seja
> conectada aos endpoints definitivos do backend.

## Visão geral

A mesma interface React pode funcionar de duas formas:

- **Web:** executada diretamente no navegador pelo Vite.
- **Desktop:** empacotada localmente dentro do Electron.

Nos dois casos, a fonte oficial dos dados deve ser a API REIS. O desktop não
possui banco PostgreSQL, credenciais do Supabase ou segredos de integrações.

```text
Navegador ──────────────────────────────→ API REIS

Renderer React → Preload → IPC validado → Processo main → API REIS
                       Aplicação desktop
```

No desktop, chamadas autenticadas e operações do sistema passam pelo processo
`main`. O renderer não recebe refresh token e não possui acesso direto ao
filesystem, `shell`, variáveis de ambiente ou módulos Node.js.

## Interface da aplicação

### Dashboard

É a tela inicial e apresenta:

- novos contatos;
- negócios fechados;
- tarefas concluídas;
- receita gerada;
- evolução de performance nos últimos 12 meses;
- distribuição dos contatos por status;
- vendas por região;
- ranking de vendedores.

Os gráficos foram implementados com HTML, CSS e SVG local, sem depender de
serviços externos para renderização.

### Menu principal

A barra lateral permite alternar entre:

- **Dashboard:** visão consolidada dos indicadores.
- **Leads:** base para consulta e cadastro de potenciais clientes.
- **Oportunidades:** base para acompanhamento de negociações.
- **Fluxo Operacional:** base para representar as etapas comerciais.
- **Relatórios:** base para análises e relatórios.
- **Configurações:** entrada para preferências e integrações.

Neste estágio, Dashboard possui o conteúdo completo de demonstração. Os demais
módulos exibem uma página-base preparada para receber formulários, tabelas e
dados da API.

### Busca e notificações

- O campo superior aceita buscas por leads, negócios e contatos.
- O botão de limpar remove o termo digitado.
- O sino exibe o estado de notificações pendentes.
- Ao clicar no sino, o indicador visual é marcado como lido.

A busca ainda é um comportamento local de interface. A pesquisa real deverá
usar um endpoint autorizado da API.

### Responsividade

Em telas desktop, o menu permanece fixo à esquerda. Em telas menores:

- o menu lateral fica recolhido;
- o botão de menu abre a navegação;
- um fundo escurecido permite fechar a navegação;
- cards e painéis passam para uma coluna;
- tabelas e gráficos preservam a legibilidade.

## Arquitetura do desktop

### Processo main

Arquivo: `electron/main.ts`

Responsável por:

- criar e restaurar a janela;
- registrar o protocolo local `reis-app://`;
- registrar deep links `reis://`;
- garantir uma única instância do aplicativo;
- validar emissores e argumentos IPC;
- realizar autenticação e chamadas HTTP;
- abrir somente URLs externas autorizadas;
- montar o menu nativo;
- reabrir a janela pelo Dock no macOS.

A janela utiliza:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- `webSecurity: true`;
- bloqueio de navegação e novas janelas não autorizadas.

### Preload

Arquivo: `electron/preload.ts`

Expõe ao React somente a bridge `window.reisDesktop`:

```ts
window.reisDesktop.auth.login(input)
window.reisDesktop.auth.logout()
window.reisDesktop.auth.session()
window.reisDesktop.api.request(input)
window.reisDesktop.system.platform()
window.reisDesktop.system.appVersion()
window.reisDesktop.system.openExternal(url)
window.reisDesktop.deepLinks.subscribe(callback)
```

Não são expostos `ipcRenderer`, `fs`, `shell`, `child_process`, tokens ou uma
função genérica de acesso à internet.

### Cliente da API

Arquivo: `electron/api-client.ts`

O cliente:

- usa `REIS_API_URL` como URL-base;
- aplica timeout de 15 segundos;
- adiciona o access token quando existe sessão;
- lê o header `x-request-id`;
- serializa renovações concorrentes de token;
- tenta novamente uma chamada no máximo uma vez após `401`;
- exige chave de idempotência para mutações permitidas;
- limpa a sessão quando o refresh deixa de ser válido.

Fluxo de uma chamada:

```text
Componente React
  → window.reisDesktop.api.request(...)
  → preload
  → IPC
  → validação Zod
  → cliente HTTP no main
  → API REIS
```

### Autenticação e sessão

Endpoints esperados:

```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

Após o login:

1. o processo main envia as credenciais à API;
2. a API devolve usuário, access token, refresh token e expiração;
3. a sessão completa é criptografada pelo `safeStorage`;
4. no macOS, a proteção utiliza o Keychain;
5. o renderer recebe apenas usuário público, permissões e expiração.

O logout tenta encerrar a sessão remota e sempre remove o arquivo local
criptografado.

### Validação de operações

Arquivo: `electron/validation.ts`

As chamadas da bridge são validadas com Zod. Somente famílias de endpoints
conhecidas são aceitas:

- `/auth/me`;
- `/crm/*`;
- `/calendar/*`;
- `/imobiliario/*`;
- `/automation/*`;
- `/analytics/*`;
- `/integrations/*`;
- `/health`.

Paths com `..`, URLs completas e endpoints fora da allowlist são bloqueados.
Mutações `POST` e `PATCH` exigem UUID em `idempotencyKey`.

### Deep links

O aplicativo registra o protocolo `reis://`. Formatos aceitos:

```text
reis://atendimentos/UUID
reis://calendar/event/UUID
reis://crm/deals/UUID
reis://imobiliario/imoveis/UUID
reis://auth/callback?code=CODIGO_DESCARTAVEL
```

O protocolo, a rota e o UUID são validados antes do envio ao renderer. Tokens
de sessão nunca devem ser transportados no deep link.

### Protocolo local e CSP

Em produção, o Electron carrega o renderer empacotado por
`reis-app://renderer/index.html`, evitando dependência da aplicação web remota.

O `index.html` define uma Content Security Policy que restringe scripts,
imagens, conexões, frames, objetos e formulários. Para adicionar um novo domínio
de API ou imagem, a CSP e a allowlist precisam ser revisadas conscientemente.

## Configuração do ambiente

Requisitos:

- Node.js compatível com as versões fixadas no lockfile;
- npm;
- macOS para gerar e validar a distribuição final para Mac;
- Xcode e Apple Developer Program para assinatura/notarização.

Instale as dependências:

```bash
npm ci
```

### Atualização em qualquer sistema

Em um clone do projeto, a mesma rotina funciona no Windows, macOS e Linux:

```bash
npm run app:update:check
npm run app:update
```

No PowerShell com execução de scripts desabilitada, use `npm.cmd` no lugar de
`npm` (por exemplo, `npm.cmd run app:update`).

O atualizador valida a instalação do Git, consulta a branch correspondente no
remoto `origin`, aceita somente atualização *fast-forward* e executa `npm ci`
quando o `package-lock.json` mudar. Por segurança, ele interrompe a operação se
houver arquivos modificados, commits locais ainda não enviados ou *detached
HEAD*. Assim, nenhuma alteração local é sobrescrita automaticamente.

Essa rotina atualiza clones que contêm o código-fonte. Instalações geradas por
`npm run make` devem ser atualizadas instalando o artefato da nova GitHub
Release correspondente ao sistema operacional.

Use `.env.example` como referência:

```env
REIS_API_URL=https://api-reis-jj7i9nbql-kisoritechs-projects.vercel.app/api/v1
REIS_WEB_URL=http://localhost:5173
REIS_ALLOWED_EXTERNAL_HOSTS=localhost,app.seudominio.com,accounts.google.com
```

As variáveis Apple são exclusivas do pipeline de release:

```env
APPLE_SIGN_IDENTITY=
APPLE_API_KEY_PATH=
APPLE_API_KEY_ID=
APPLE_API_ISSUER=
```

Nunca versione certificados, senhas, chaves privadas ou tokens.

## Execução

### Aplicação web

```bash
npm run dev:web
```

Abra `http://localhost:5173`.

### Aplicação desktop

```bash
npm run dev:desktop
```

O Forge inicia o Vite, compila `main` e `preload` e abre a janela Electron.

## Build e distribuição

### Build web

```bash
npm run build:web
```

O resultado é gravado em `dist/`.

### Pacote desktop

```bash
npm run package
```

Compila renderer, main e preload e gera o aplicativo em `out/`.

### Artefato de distribuição

```bash
npm run make
```

O Forge gera instalador Squirrel no Windows, pacotes DEB/RPM no Linux e ZIP no
macOS. A configuração inclui:

- bundle ID `com.reis.desktop`;
- nome e executável `REIS`;
- categoria Business;
- protocolo `reis://`;
- ASAR;
- assinatura e notarização quando as variáveis Apple estão presentes.

Os workflows validam cada alteração e publicam os artefatos dos três sistemas
quando uma tag `vX.Y.Z` é enviada. Consulte
[`DISTRIBUICAO_MULTIPLATAFORMA.md`](DISTRIBUICAO_MULTIPLATAFORMA.md) para o fluxo
SemVer, requisitos de assinatura e o caminho recomendado para iOS.

## Qualidade e testes

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Os testes unitários atuais cobrem:

- validação de deep links;
- bloqueio de URLs externas;
- allowlist de endpoints;
- obrigatoriedade de idempotência em mutações.

Antes de uma release, a validação recomendada é:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build:web
npm run package
```

No macOS, também devem ser executados:

```bash
codesign --verify --deep --strict --verbose=2 "REIS.app"
spctl --assess --type execute --verbose=4 "REIS.app"
xcrun stapler validate "REIS.app"
```

## Estrutura do projeto

```text
reis-client/
├── electron/
│   ├── api-client.ts
│   ├── contracts.ts
│   ├── main.ts
│   ├── preload.ts
│   ├── session-store.ts
│   ├── validation.ts
│   └── validation.test.ts
├── public/
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── desktop.d.ts
│   ├── index.css
│   └── main.tsx
├── .env.example
├── entitlements.mac.plist
├── forge.config.ts
├── index.html
├── vite.config.ts
├── vite.main.config.ts
├── vite.preload.config.ts
└── vite.renderer.config.ts
```

## O que falta para produção

- conectar dashboard, busca e módulos aos endpoints reais;
- implementar tela de login e restauração visual da sessão;
- mapear os envelopes reais de sucesso e erro da API;
- implementar formulários, tabelas, paginação e permissões;
- criar fluxo de upload validado pelo processo main;
- concluir login web/desktop com código descartável e PKCE;
- adicionar updater com feed HTTPS e artefatos assinados;
- definir bundle ID definitivo e versão mínima do macOS;
- configurar DMG, certificado Apple e notarização no CI;
- criar testes E2E dos fluxos comerciais;
- validar Apple Silicon e Intel conforme o escopo do produto.

## Princípios de segurança

- nenhum segredo de backend no cliente;
- refresh token criptografado e inacessível ao renderer;
- autorização sempre confirmada pelo backend;
- conteúdo remoto sem acesso a Node.js;
- IPC específico, tipado e validado;
- URLs externas e endpoints controlados por allowlist;
- deep links sem tokens;
- mutações protegidas por idempotência;
- logs e mensagens sem dados sensíveis;
- releases desktop assinadas e notarizadas.
