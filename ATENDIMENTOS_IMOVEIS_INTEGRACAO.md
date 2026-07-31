# Integração entre atendimentos, empreendimentos e imóveis

## Fluxo implementado

1. O formulário consulta os empreendimentos da empresa autenticada.
2. Ao selecionar um empreendimento, o cliente consulta somente os imóveis
   disponíveis vinculados a ele.
3. A unidade selecionada é enviada em `imovelId`, junto com
   `empreendimentoId`, na criação do atendimento.
4. A API valida que empreendimento e imóvel pertencem à empresa autenticada e
   que o imóvel está vinculado ao empreendimento informado.
5. A listagem de atendimentos devolve os objetos relacionados de empreendimento
   e imóvel para exibição no histórico e nos detalhes.

## Contratos utilizados

- `GET /api/v1/imobiliario/empreendimentos`
- `GET /api/v1/imobiliario/imoveis?empreendimentoId={uuid}&status=disponivel`
- `POST /api/v1/crm/atendimentos`
- `GET /api/v1/crm/atendimentos`

Exemplo do vínculo persistido:

```json
{
  "empreendimentoId": "uuid-do-empreendimento",
  "imovelId": "uuid-do-imovel"
}
```

## Regras de integridade

- UUID de outra empresa é rejeitado como referência inválida.
- Um imóvel não pode ser associado no atendimento a um empreendimento
  diferente daquele registrado em `imobiliario.imoveis.empreendimento_id`.
- O cadastro e a alteração de imóvel aceitam `empreendimentoId` e validam o
  vínculo com a empresa antes de gravar.
- Atendimentos antigos sem imóvel continuam válidos para preservar
  compatibilidade com a estrutura existente.

## Banco e deploy

O campo `imobiliario.imoveis.empreendimento_id` e o campo
`crm.atendimentos.imovel_id` já fazem parte do schema e das migrações do
projeto. O deploy da API deve executar as migrações antes da publicação. Depois
do deploy, validar `/api/v1/health/ready` antes de liberar o frontend.
