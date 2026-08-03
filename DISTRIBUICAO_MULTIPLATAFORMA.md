# Distribuicao multiplataforma e versionamento

## Estrutura adotada

O mesmo frontend React atende dois canais atuais:

- **Web/link:** `npm run build:web` gera `dist/`, que pode ser publicado em um host estatico.
- **Desktop:** Electron Forge empacota o frontend para Windows, Linux e macOS.

O iOS nao executa Electron. Para uma aplicacao nativa instalavel, a evolucao indicada e
usar Capacitor sobre o mesmo build web. Essa etapa exige macOS, Xcode, conta Apple
Developer, identificador de bundle, icones, telas de abertura e revisao das APIs que hoje
dependem do preload do Electron. Ate la, a versao web pode ser aberta no Safari; para uma
experiencia instalavel pelo navegador, deve-se acrescentar manifest e service worker (PWA).

## Desenvolvimento e validacao

```bash
npm ci
npm run dev:web
npm run dev:desktop
npm run typecheck
npm run lint
npm test
npm run build:web
```

## Instaladores desktop

Execute `npm run make` no sistema que sera o alvo:

- Windows: instalador Squirrel (`Setup.exe`);
- Linux: pacotes `.deb` e `.rpm`;
- macOS: arquivo `.zip`.

Os workflows em `.github/workflows` validam cada alteracao e, ao receber uma tag SemVer,
geram os artefatos nos tres sistemas e criam uma GitHub Release. Assinaturas de Windows e
macOS ainda precisam de certificados e secrets antes de uma distribuicao publica.

## Fluxo de versao (SemVer)

Trabalhe em uma branch e abra pull request para `main`. Depois de a validacao passar e o
merge estar concluido, escolha o impacto:

```bash
npm run version:patch  # correcao compativel: 0.1.0 -> 0.1.1
npm run version:minor  # recurso compativel: 0.1.0 -> 0.2.0
npm run version:major  # mudanca incompativel: 0.1.0 -> 1.0.0
git push origin main --follow-tags
```

`npm version` atualiza `package.json` e `package-lock.json`, cria o commit e a tag `vX.Y.Z`.
O push da tag dispara o workflow de release. Nao reutilize nem mova tags publicadas.

## Caminho recomendado para iOS

1. Isolar em adaptadores as funcoes expostas por `window.reis` (Electron) e as chamadas web.
2. Instalar Capacitor e configurar `webDir: 'dist'`.
3. Adicionar a plataforma iOS e sincronizar o build web.
4. Configurar universal links, Keychain e autenticacao no projeto Xcode.
5. Testar em dispositivo real, assinar e publicar pelo App Store Connect.

O projeto iOS deve ser gerado apenas quando bundle ID, conta Apple e estrategia de
autenticacao estiverem definidos; esses dados afetam arquivos nativos e nao devem ser
inventados no repositorio.
