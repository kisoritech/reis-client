# Integracao de ligacoes do REIS

## Fase 1 - discagem assistida na web e no desktop

Status: implementada.

O aplicativo publicado na Vercel tambem funciona em navegadores de celular. Nesse ambiente, a URI `tel:` abre diretamente o discador nativo, portanto nenhum aplicativo Android adicional e necessario para a discagem assistida.

Fluxo:

1. O usuario seleciona `Ligar` em Clientes ou no detalhe de um Lead.
2. O cliente envia `POST /api/v1/crm/call-attempts` com o cliente/lead e o telefone.
3. A API valida o tenant, normaliza o telefone para E.164 e registra uma `Interacao` do tipo `ligacao_iniciada`.
4. A API devolve uma URI `tel:` canonica.
5. No celular, o navegador abre o discador nativo. No Electron, a URI e entregue ao aplicativo de telefonia configurado no sistema.

A interacao representa apenas uma tentativa de abrir o discador. Ela nao afirma que a chamada foi atendida ou concluida.

### Configuracao de producao

A origem HTTPS exata da aplicacao Vercel deve estar incluida em `CORS_ORIGINS` na `api_reis`. Preview deployments da Vercel nao devem ser liberados por curinga; devem usar uma origem controlada ou um ambiente de staging separado.

## Fase 2 - celular Android pareado

Status: opcional.

Esta fase so e necessaria se o usuario estiver operando o REIS em outro dispositivo, como um computador, e quiser enviar a solicitacao remotamente para seu celular. Ela preve pareamento por QR Code, Firebase Cloud Messaging, expiracao da solicitacao e confirmacao obrigatoria no aparelho.

## Fase 3 - telefonia integrada

Status: opcional.

Para chamadas dentro do computador, duracao real, gravacao, filas e ramais, sera necessario integrar um provedor SIP/VoIP. Essa fase nao deve reutilizar o telefone pessoal como se fosse uma central telefonica.
