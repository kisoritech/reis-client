# Contrato proposto para campanhas WhatsApp

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

