# Manual de WhatsApp Business, Meta e campanhas REIS

Atualizado em 05/08/2026.

Este manual separa duas responsabilidades:

- a Meta fornece a WhatsApp Business Platform, aprova templates e controla qualidade/limites;
- a API REIS seleciona destinatários consentidos, cria filas, envia mensagens e processa webhooks.

Cadastrar um telefone no CRM não representa autorização para enviar marketing.

## 1. Preparação no Meta Business

1. Acesse o [Meta Business Suite](https://business.facebook.com/) com uma conta administrativa.
2. Em Configurações do negócio, confirme o portfólio empresarial correto.
3. Conclua a verificação da empresa e mantenha nome, site, domínio e documentos coerentes.
4. Em Contas > Contas do WhatsApp, crie ou selecione a WABA da REIS.
5. Adicione um número dedicado, valide o código recebido e solicite o nome de exibição.
6. Cadastre uma forma de pagamento válida.
7. Em Usuários do sistema, crie um usuário exclusivo para a integração, com privilégio mínimo.
8. Gere um token permanente no servidor. Nunca coloque token, App Secret ou certificado no React, Electron ou repositório.

Referências oficiais: [início da WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) e [política de mensagens](https://business.whatsapp.com/policy).

## 2. Aplicativo da Meta e credenciais do backend

No [Meta for Developers](https://developers.facebook.com/apps/):

1. Crie ou selecione o aplicativo empresarial.
2. Adicione o produto WhatsApp.
3. Relacione a WABA e o número de produção.
4. Registre no gerenciador de segredos do backend:

```text
WHATSAPP_ACCESS_TOKEN=<token permanente>
WHATSAPP_PHONE_NUMBER_ID=<id do número>
WHATSAPP_BUSINESS_ACCOUNT_ID=<id da WABA>
WHATSAPP_APP_SECRET=<app secret>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<valor aleatório exclusivo>
```

5. Restrinja acesso aos segredos e configure rotação. O endpoint de status da REIS deve retornar apenas informações não sensíveis:

```json
{
  "whatsapp": {
    "enabled": true,
    "provider": "meta_cloud_api",
    "phoneNumber": "+5565*********",
    "quality": "GREEN"
  }
}
```

## 3. Webhook

Publique uma URL HTTPS, por exemplo:

```text
https://api-reis-jj7i9nbql-kisoritechs-projects.vercel.app/api/v1/integrations/meta/webhook
```

No painel WhatsApp > Configuração:

1. Informe a URL e o mesmo `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
2. Na verificação GET, compare o token e devolva somente o `hub.challenge`.
3. Em cada POST, valide a assinatura `X-Hub-Signature-256` com o App Secret antes de processar.
4. Assine pelo menos eventos de mensagens e status de mensagens.
5. Responda rapidamente com HTTP 200 e processe o evento em fila assíncrona.
6. Deduplicate eventos pelo ID da mensagem/evento.

Persistir os estados `accepted`, `sent`, `delivered`, `read` e `failed`, junto com código do erro, horário e campanha. Não registrar token nem conteúdo sensível integralmente. Consulte a [documentação oficial de webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks).

## 4. Templates

Em WhatsApp Manager > Modelos de mensagem:

1. Crie templates com nomes estáveis, por exemplo `reis_lancamento_imovel_v1`.
2. Selecione corretamente a categoria: marketing, utilidade ou autenticação.
3. Cadastre `pt_BR` e somente os idiomas realmente revisados.
4. Dê contexto à mensagem, identifique a empresa e evite linguagem enganosa.
5. Inclua uma saída clara, como “Responda SAIR para não receber novidades”.
6. Envie para análise e use na REIS apenas quando o status estiver aprovado.
7. Mapeie cada variável do template a um campo permitido do CRM; nunca aceite texto executável ou HTML.

Mensagens iniciadas pela empresa devem seguir as regras de template e categoria da Meta. A Meta também limita mensagens de marketing recebidas e pode restringir empresas com baixa qualidade. Consulte as [boas práticas oficiais de marketing](https://whatsappbusiness.com/wp-content/uploads/2026/04/Best-Practices-for-Marketing-Messages-on-WhatsApp-.pdf) e o [comunicado da Meta sobre mensagens comerciais](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/).

## 5. Consentimento e descadastro

O banco deve guardar, por contato e finalidade:

- número normalizado em E.164;
- estado `opted_in` ou `opted_out`;
- finalidade autorizada, como novidades imobiliárias;
- origem, texto apresentado, data/hora e versão do consentimento;
- IP ou identificador da captura, quando aplicável;
- data, origem e motivo do opt-out.

Aceitar opt-out por `SAIR`, `PARAR`, `CANCELAR`, atendimento humano e outros canais disponíveis. O opt-out deve entrar imediatamente em uma lista de supressão global e prevalecer sobre qualquer segmento ou campanha.

## 6. Operação na aplicação REIS

1. Abra Campanhas.
2. Confirme que o banner mostra WhatsApp conectado.
3. Clique em Nova campanha.
4. Informe exatamente o nome do template aprovado na Meta.
5. Selecione o segmento e use um limite diário conservador.
6. Crie o rascunho. Isso não envia mensagens.
7. Abra Gerenciar e gere o preview.
8. Confira quantidade, amostra, telefones inválidos, contatos sem opt-in e opt-outs removidos.
9. Confirme o termo de consentimento.
10. Inicie a campanha e acompanhe resultados, falhas, bloqueios e leitura.
11. Pause imediatamente se aumentarem falhas, bloqueios, denúncias ou opt-outs.

## 7. Estratégia segura de aumento de volume

- Comece com clientes recentes e altamente engajados.
- Faça lotes pequenos e distribua ao longo do horário comercial.
- Não tente contornar limites da Meta com vários números.
- Acompanhe qualidade e limites diretamente no WhatsApp Manager antes de cada aumento.
- Compare entrega, leitura, resposta, opt-out e bloqueio por template e segmento.
- Suspenda automaticamente quando a qualidade sair do nível saudável ou a taxa de bloqueio subir.
- Respeite os limites retornados pela plataforma; não fixe no código números presumidos, pois a Meta pode alterá-los por conta e período.

## 8. Checklist de homologação

- [ ] Empresa, WABA, nome de exibição e pagamento aprovados.
- [ ] Token permanente guardado somente no backend.
- [ ] `GET /automation/messages/provider/status` autenticado retorna `enabled: true`.
- [ ] Webhook verificado, assinado e deduplicado.
- [ ] Template aprovado em `pt_BR`.
- [ ] Opt-in persistido e auditável.
- [ ] Opt-out cria supressão imediata.
- [ ] Preview exclui número inválido, sem opt-in e opt-out.
- [ ] Teste interno entregue e status atualizado por webhook.
- [ ] Idempotência impede mensagem duplicada.
- [ ] Retentativa não repete mensagens já aceitas pela Meta.
- [ ] Pausa automática e botão de cancelamento testados.
- [ ] Dashboard exibe enviados, entregues, lidos, falhas e opt-outs.

## 9. Diagnóstico rápido

| Sintoma | Verificação |
|---|---|
| Provider não configurado | segredos, WABA, Phone Number ID e token |
| Token inválido/expirado | usuário do sistema, permissões e rotação |
| Template rejeitado | categoria, texto, variáveis e idioma |
| Mensagem aceita e não entregue | status do webhook, qualidade e restrições do destinatário |
| Webhook não chega | HTTPS, assinatura, assinatura de campos e resposta 200 |
| Duplicidade | chave idempotente e deduplicação pelo message ID |
| Queda de qualidade | frequência, segmentação, reclamações e opt-out |
