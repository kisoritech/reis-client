# Contrato proposto para campanhas WhatsApp

## Agenda automática por perfil

A tela de Campanhas é uma central somente de leitura da agenda executada pelo job de WhatsApp:

- `GET /automation/messages/schedules?channel=whatsapp`: exclusivo do perfil `dev`; retorna todos os jobs, destinatários, telefone mascarado, horário, estado, última execução e erro.
- `GET /automation/messages/schedules/me?channel=whatsapp`: disponível aos demais usuários; usa exclusivamente o ID da sessão e retorna apenas os agendamentos destinados ao próprio WhatsApp.

O endpoint pessoal não deve aceitar `userId`, telefone ou empresa por query string. O backend obtém essas informações da sessão, mascara o número e não retorna dados de outros destinatários. Ambos os endpoints devem refletir o estado persistido da fila (`scheduled`, `queued`, `running`, `sent`, `delivered`, `failed` ou `cancelled`) e o horário real da próxima execução do job.

O Swagger publicado em 05/08/2026 expõe as rotas, mas documenta `CreateCampaignDto`, `ScheduleCampaignDto`, `GenerateNegotiationMessagesDto` e `ProcessMessageQueueDto` com `properties: {}`. O backend deve publicar e validar o contrato abaixo antes da homologação.

## Criação

`POST /api/v1/automation/campaigns`

```json
{
  "contractVersion": "2026-08-05",
  "name": "Lançamento Residencial Centro",
  "description": "Clientes que autorizaram novidades imobiliárias",
  "channel": "whatsapp",
  "template": {
    "name": "reis_lancamento_imovel_v1",
    "language": "pt_BR"
  },
  "audience": {
    "source": "crm_accounts",
    "segment": "compradores_cuiaba",
    "requireOptIn": true,
    "excludeOptOut": true,
    "requireValidPhone": true
  },
  "delivery": {
    "batchSize": 25,
    "intervalMs": 1000,
    "dailyLimit": 250
  },
  "status": "draft"
}
```

Regras obrigatórias do servidor:

- ignorar `empresaId` enviado pelo cliente e obtê-lo da sessão;
- exigir permissão específica para criar, visualizar, iniciar e cancelar;
- aceitar somente `channel=whatsapp` e `status=draft` na criação;
- verificar template aprovado e idioma disponível junto ao catálogo sincronizado;
- calcular o público no servidor, nunca aceitar lista arbitrária do renderer;
- exigir opt-in, aplicar a lista de supressão e normalizar E.164 novamente no servidor;
- limitar lote, intervalo e limite diário segundo a conta Meta e a política interna;
- registrar auditoria sem tokens ou payloads sensíveis.

## Preview

## Catálogo de templates WhatsApp

O cliente nunca acessa a Meta diretamente nem recebe o token do WhatsApp. A API REIS deve consultar a WhatsApp Business Management API usando a credencial armazenada no servidor.

- `GET /automation/messages/templates?channel=whatsapp`: retorna os templates sincronizados, incluindo `id`, `name`, `language`, `category`, `status` e `components`.
- `POST /automation/messages/templates/sync`: força a sincronização com a Meta e persiste o catálogo atualizado.

Somente templates com status `APPROVED` podem ser apresentados para envio. Ao criar e iniciar a campanha, o servidor deve validar novamente o ID, nome, idioma, status e os parâmetros exigidos pelo template.

### Público de usuários internos

Para campanhas direcionadas aos usuários ativos da própria organização, o cliente envia:

```json
{
  "audience": {
    "source": "organization_users",
    "userIds": ["uuid-do-usuario"],
    "requireOptIn": true,
    "excludeOptOut": true,
    "requireValidPhone": true
  }
}
```

O servidor deve validar que cada usuário pertence à empresa da sessão, está ativo, possui telefone normalizado e consentimento válido. IDs inválidos ou de outra empresa devem ser rejeitados, nunca ignorados silenciosamente.

`POST /api/v1/automation/campaigns/{id}/preview`

```json
{
  "campaignId": "uuid",
  "eligible": 183,
  "excluded": {
    "invalidPhone": 7,
    "withoutOptIn": 34,
    "optedOut": 12,
    "duplicate": 4
  },
  "sample": [
    { "accountId": "uuid", "phoneMasked": "+5565*****1234", "template": "reis_lancamento_imovel_v1" }
  ],
  "previewHash": "sha256"
}
```

Ao iniciar, o backend deve exigir o `previewHash` mais recente ou recalcular o público de forma transacional. A confirmação visual do frontend não substitui essa validação.

## Agendamento e início

`POST /api/v1/automation/campaigns/{id}/schedule`

```json
{ "scheduledAt": "2026-08-10T13:00:00.000Z", "timezone": "America/Cuiaba", "previewHash": "sha256" }
```

`POST /api/v1/automation/campaigns/{id}/start`

```json
{ "previewHash": "sha256", "confirmedOptIn": true }
```

O backend atual aceita `{}` segundo o contrato incompleto. Para produção, deve exigir os campos acima, chave de idempotência e transição válida de estado.

## Fila e resultados

Cada item deve ter `campaignId`, `accountId`, telefone normalizado, template/versionamento, estado, tentativas, `providerMessageId`, timestamps e erro estruturado. Uma restrição única deve impedir duplicidade por campanha, destinatário e template.

`GET /api/v1/automation/campaigns/{id}/results` deve retornar no mínimo:

```json
{
  "queued": 183,
  "accepted": 180,
  "sent": 177,
  "delivered": 164,
  "read": 121,
  "failed": 3,
  "optOut": 5,
  "blocked": 2
}
```

## Rotas já integradas no frontend

- `GET|POST /automation/campaigns`
- `GET /automation/campaigns/{id}`
- `POST /automation/campaigns/{id}/preview`
- `POST /automation/campaigns/{id}/schedule`
- `POST /automation/campaigns/{id}/start`
- `POST /automation/campaigns/{id}/pause`
- `POST /automation/campaigns/{id}/resume`
- `POST /automation/campaigns/{id}/cancel`
- `GET /automation/campaigns/{id}/results`
- `GET /automation/messages/provider/status`
