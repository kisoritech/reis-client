# REIS Client

Cliente compartilhado web/desktop da plataforma REIS. O renderer é React/Vite e
o desktop usa Electron Forge, sem acesso direto a Node.js ou aos segredos do
backend.

## Estado da implementação

Implementado nesta fundação:

- React, TypeScript, Vite, React Query, React Router e Zod;
- processos Electron `main` e `preload` separados;
- `contextIsolation`, sandbox, CSP e bloqueio de navegação externa;
- bridge tipada e restrita, sem exposição de `ipcRenderer`, filesystem ou token;
- validação do emissor e dos argumentos IPC;
- cliente HTTP no processo main com timeout, request ID e refresh serializado;
- sessão criptografada com `safeStorage` (Keychain no macOS);
- protocolo local `reis-app://` e deep links `reis://` validados;
- single instance, integração básica do menu macOS e reabertura pelo Dock;
- empacotamento ZIP universalizável, assinatura e notarização condicionais ao CI;
- testes unitários das fronteiras de segurança.

Dependências externas ainda necessárias:

- URLs definitivas da API e web;
- confirmação do bundle ID e versão mínima do macOS;
- contratos reais dos envelopes/endpoints de autenticação;
- certificado Apple e credenciais de notarização no CI;
- endpoints PKCE para login iniciado na web;
- feed assinado para updater;
- backend e telas de negócio das fases 2–5;
- gerador DMG no runner macOS (o pacote ZIP está configurado).

## Comandos

```bash
npm ci
npm run dev:web
npm run dev:desktop
npm run typecheck
npm test
npm run lint
npm run build
npm run package
npm run make
```

Copie `.env.example` para o ambiente local e ajuste `REIS_API_URL`,
`REIS_WEB_URL` e a allowlist. Credenciais Apple devem existir somente no CI.

## Estrutura

- `electron/main.ts`: janela, IPC, protocolo e integração com o sistema;
- `electron/preload.ts`: bridge mínima exposta ao renderer;
- `electron/api-client.ts`: autenticação, refresh e chamadas à API;
- `electron/session-store.ts`: persistência criptografada da sessão;
- `electron/validation.ts`: allowlists e schemas de segurança;
- `src/`: interface compartilhada web/desktop.
