# Guia de integração de ligações — computador e celular

## Resultado implementado

O fluxo anterior de ligação direta (`tel:`) foi preservado. Foi acrescentado um segundo fluxo:

1. No computador, o usuário abre **Clientes** e seleciona **Enviar ao celular**.
2. A `api_reis` cria um pedido válido por 2 minutos, sempre limitado ao usuário e à empresa autenticados.
3. A API entrega o pedido por Firebase Cloud Messaging (FCM) aos celulares ativos da mesma conta.
4. Se o push não estiver disponível, a API tenta enviar o link para o e-mail da conta por Resend.
5. No celular, o usuário toca na notificação, confirma **Ligar agora** e o REIS abre o discador nativo.
6. A API registra `requested`, `opened`, `dialer_opened`, `expired` ou `canceled`.

O navegador não faz uma ligação silenciosa. A confirmação do usuário no celular é obrigatória. O e-mail identifica a conta e serve como contingência; a autorização usa `usuarioId` e `empresaId`.

## Caminho das suas atividades

### Etapa 1 — criar o projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/).
2. Crie ou selecione um projeto.
3. Abra **Project settings > General > Your apps**.
4. Adicione uma aplicação **Web**.
5. Copie os valores do objeto `firebaseConfig`.
6. Abra **Project settings > Cloud Messaging > Web configuration**.
7. Gere um par de chaves **Web Push certificates** e copie a chave pública VAPID.

### Etapa 2 — criar a credencial do backend

1. No Firebase, abra **Project settings > Service accounts**.
2. Selecione **Generate new private key**.
3. Não envie nem versione o JSON baixado.
4. Extraia somente `project_id`, `client_email` e `private_key` para as variáveis do backend.
5. No Google Cloud Console, confirme que a API **Firebase Cloud Messaging API (V1)** está habilitada.

O `firebase-admin` usa essa conta de serviço exclusivamente na `api_reis`. A chave privada nunca pode usar prefixo `VITE_` nem chegar ao navegador.

### Etapa 3 — configurar a api_reis

Na plataforma que hospeda a API (atualmente Render), cadastre:

```env
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
REIS_CLIENT_WEB_URL=https://seu-app.vercel.app

# Fallback por e-mail, caso ainda não estejam configuradas
RESEND_API_KEY=re_...
MESSAGE_EMAIL_FROM=REIS <notificacoes@seudominio.com>
```

Ao colar `FIREBASE_PRIVATE_KEY`, preserve `\n` como texto dentro da variável. O código converte esses caracteres novamente em quebras de linha.

### Etapa 4 — publicar a migração do banco

Na pasta `api_reis`, com `DIRECT_URL` apontando para o banco correto:

```powershell
npm run db:status
npm run db:deploy
```

A migração aplicada é `supabase/migrations/20260815010000_call_relay.sql`. Ela cria `crm.call_relay_devices` e `crm.call_requests`, habilita RLS e bloqueia acesso direto pelos papéis públicos do Supabase. O acesso acontece somente pela API.

### Etapa 5 — configurar a Vercel

No projeto do frontend, abra **Settings > Environment Variables** e adicione em Production, Preview e Development conforme necessário:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=seu-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=seu-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
VITE_API_BASE_URL=https://sua-api/api/v1
```

Esses valores do aplicativo Web e a chave pública VAPID podem estar no frontend. A conta de serviço e a chave privada não podem.

Depois de salvar as variáveis, faça um novo deploy. Confirme que `manifest.webmanifest` e `firebase-messaging-sw.js` respondem com HTTP 200 no domínio publicado.

### Etapa 6 — configurar o Resend (contingência)

1. Cadastre e valide o domínio remetente no [Resend](https://resend.com/domains).
2. Crie uma API key limitada ao envio de e-mails.
3. Cadastre `RESEND_API_KEY` e `MESSAGE_EMAIL_FROM` somente na API.
4. Garanta que o e-mail do perfil do usuário é real e acessível no celular.

Sem Resend, o push continua funcionando. Sem Firebase, o fallback por e-mail funciona se o Resend estiver configurado.

### Etapa 7 — vincular Android

1. Abra o REIS publicado em HTTPS no Chrome do celular.
2. Entre com a mesma conta utilizada no computador.
3. Vá a **Configurações > Notificações**.
4. Toque em **Vincular este celular** e permita notificações.
5. Confirme que o aparelho aparece na lista.

### Etapa 8 — vincular iPhone/iPad

1. Use iOS/iPadOS 16.4 ou superior.
2. Abra o domínio do REIS no Safari.
3. Use **Compartilhar > Adicionar à Tela de Início**.
4. Abra o REIS pelo ícone instalado, entre na mesma conta e acesse **Configurações > Notificações**.
5. Toque em **Vincular este celular** e permita notificações.

No ecossistema Apple, Web Push é oferecido a aplicações web adicionadas à Tela de Início e a permissão precisa partir de uma ação do usuário. Consulte a [documentação do WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### Etapa 9 — teste de aceite

1. No computador, entre com a mesma conta vinculada no celular.
2. Abra **Clientes**, escolha um cliente com telefone e clique em **Enviar ao celular**.
3. Verifique a notificação no celular.
4. Toque nela e confirme **Ligar agora**.
5. Confirme que o número correto apareceu no discador.
6. Repita com a tela bloqueada e com o navegador fechado.
7. Desvincule o aparelho nas configurações e confirme que ele deixa de receber pedidos.
8. Para testar o fallback, desvincule todos os aparelhos e confirme a chegada do e-mail dentro dos 2 minutos de validade.

## Endpoints acrescentados na api_reis

| Método | Caminho | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/crm/call-devices` | Lista aparelhos da conta |
| `POST` | `/api/v1/crm/call-devices` | Registra ou renova o token FCM |
| `DELETE` | `/api/v1/crm/call-devices/:id` | Revoga um aparelho |
| `POST` | `/api/v1/crm/call-requests` | Envia uma ligação ao celular |
| `GET` | `/api/v1/crm/call-requests/:id` | Abre o pedido autenticado |
| `PATCH` | `/api/v1/crm/call-requests/:id/status` | Registra abertura, discagem ou cancelamento |

Todos exigem Bearer token e a permissão `crm.clientes.read`. Um usuário não consegue consultar aparelhos ou pedidos de outra empresa.

## Diagnóstico rápido

- **Botão de vínculo desabilitado:** faltam variáveis `VITE_FIREBASE_*` no build da Vercel ou a tela está no aplicativo Electron.
- **iPhone não pede permissão:** abra a aplicação pelo ícone da Tela de Início, não por uma aba comum do Safari.
- **Pedido retorna `email`:** não havia token ativo ou nenhum push foi aceito; o fallback foi usado.
- **Pedido retorna `unavailable`:** nem FCM nem Resend estão disponíveis.
- **Notificação não abre:** confira `REIS_CLIENT_WEB_URL`, HTTPS, domínio atual e autenticação da conta no celular.
- **Pedido expirado:** envie novamente; a validade proposital é de 2 minutos.
- **Erro de chave Firebase:** confira se `FIREBASE_PRIVATE_KEY` contém cabeçalho, rodapé e `\n` preservados.

Referências oficiais: [Firebase Cloud Messaging para Web](https://firebase.google.com/docs/cloud-messaging/web/get-started/), [recebimento de mensagens Web](https://firebase.google.com/docs/cloud-messaging/web/receive-messages/) e [Web Push no iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
