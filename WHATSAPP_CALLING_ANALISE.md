# WhatsApp no modulo Clientes

## Conversa direta

Implementado com `https://wa.me/<telefone>`. O telefone e normalizado para formato internacional sem sinais. No navegador, a conversa abre em uma nova aba ou no aplicativo WhatsApp; no Electron, `wa.me` faz parte da lista controlada de destinos externos.

## Situacao da integracao Meta atual

A `api_reis` ja possui:

- WhatsApp Cloud API para mensagens pelo endpoint Graph `/messages`;
- token, WABA ID e Phone Number ID por configuracao;
- verificacao de assinatura e recebimento do webhook Meta;
- persistencia de mensagens e estados de entrega;
- templates e regras de consentimento para mensagens.

Ela ainda nao possui os componentes de WhatsApp Business Calling:

- verificacao de elegibilidade/habilitacao do numero para Calling API;
- inscricao e processamento de eventos `calls` no webhook;
- solicitacao e persistencia da permissao do cliente para chamada de saida;
- endpoints de iniciar, aceitar, rejeitar e encerrar chamadas;
- negociacao de midia e infraestrutura WebRTC/SIP;
- historico de estados e auditoria especificos de chamadas.

## Caminho recomendado

1. Confirmar no WhatsApp Manager se o WABA e o numero de producao possuem Calling API.
2. Habilitar o produto e inscrever o webhook no campo de chamadas.
3. Implementar chamadas iniciadas pelo cliente primeiro.
4. Implementar solicitacao de permissao para chamadas iniciadas pela empresa.
5. Integrar WebRTC/SIP e persistir os estados da chamada na `api_reis`.
6. Homologar com um numero de teste antes de disponibilizar o recurso em Clientes.

O link `wa.me` abre uma conversa, mas nao inicia silenciosamente uma chamada de voz. Chamadas empresariais de saida dependem de permissao previa do cliente e das regras da Meta.
