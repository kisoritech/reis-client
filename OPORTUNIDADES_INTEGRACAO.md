# Integração do módulo Oportunidades

## Recursos utilizados

- `GET/POST /crm/deals`
- `GET /crm/deals/{id}`
- `PATCH /crm/deals/{id}/status`
- `GET /crm/accounts`
- `GET /organizacao/usuarios`
- `POST /crm/activities`

## Dados operacionais conectados

- cliente;
- responsável;
- título e contexto;
- valor em BRL;
- probabilidade e receita ponderada;
- temperatura;
- previsão de fechamento;
- próxima ação e respectiva data;
- etapa retornada pelo pipeline;
- status aberta, ganha ou perdida;
- criação de follow-up vinculado à oportunidade.

## Lacuna da API

O banco e o service possuem `Pipeline` e `PipelineStage`, mas o catálogo de
endpoints fornecido não publica uma rota para listar pipelines e etapas.
Consequentemente, a aplicação apresenta a etapa já vinculada, mas não oferece
seleção ou movimentação de etapa com nomes inventados.

Para completar o Kanban comercial, publicar:

- `GET /crm/pipelines`;
- `GET /crm/pipelines/{id}/stages`;
- ou um único `GET /crm/pipeline-catalog`;
- resposta ordenada por `PipelineStage.ordem`;
- IDs e nomes restritos à empresa autenticada;
- alteração preferencialmente por `stageId`, evitando ambiguidades por nome.

Também é recomendado que `GET /crm/deals` retorne o responsável resumido,
reduzindo uma consulta adicional ao abrir os detalhes.
