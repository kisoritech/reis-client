# Fluxo Atendimento → Oportunidade

Uma oportunidade representa a evolução comercial de um atendimento e não deve existir sem uma origem rastreável.

## Regra funcional

1. O atendimento registra contato, interesse, empreendimento, imóvel, responsável e situação.
2. Quando houver qualificação comercial, o atendimento origina uma oportunidade.
3. A oportunidade mantém `atendimento_id` imutável como vínculo de origem.
4. Novos contatos com o mesmo cliente continuam como atendimentos relacionados, sem substituir a origem.
5. A situação do atendimento orienta o que pode acontecer com a oportunidade.

| Atendimento | Efeito recomendado na oportunidade |
|---|---|
| aberto | oportunidade pode permanecer aberta e receber follow-up |
| concluído | exigir resultado e próxima ação comercial |
| cancelado | impedir criação ou exigir justificativa e revisão |
| sem vínculo | classificar como inconsistência operacional |

## Alteração necessária na API e no banco

```sql
alter table crm.deals add column atendimento_id uuid;
alter table crm.deals add constraint deals_atendimento_fk
  foreign key (atendimento_id) references crm.atendimentos(id);
create index deals_empresa_atendimento_idx
  on crm.deals (empresa_id, atendimento_id);
```

Antes de tornar a coluna obrigatória, oportunidades antigas devem ser migradas por empresa e cliente. Casos com mais de um atendimento possível precisam de correção manual.

O backend deve validar que atendimento, cliente e oportunidade pertencem à mesma empresa. As respostas de oportunidades devem incluir `atendimentoId` e o resumo do atendimento, com status, data, tipo e empreendimento.

O cliente já envia `atendimentoId` na criação e usa temporariamente o atendimento mais recente do mesmo cliente quando a API ainda não retorna o vínculo. Esse fallback deve ser removido depois da migração definitiva.
