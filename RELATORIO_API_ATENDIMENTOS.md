# Relatório técnico — API de atendimentos

Data da auditoria: 28/07/2026

> Atualização de 29/07/2026: as correções recomendadas neste diagnóstico foram
> incorporadas à API em `docs/attendance-fix/`. O deploy agora executa
> `db:deploy`, o readiness valida o schema comercial, referências inválidas
> retornam `422`, erros Prisma de schema retornam `503` e a confirmação foi
> movida para depois do commit. Este arquivo permanece como registro da causa
> original; a documentação da API passa a ser a fonte normativa.

## Resultado

O erro exibido pela aplicação acontece no servidor em duas operações:

- `POST /api/v1/crm/atendimentos`
- `GET /api/v1/crm/atendimentos?limit=100`

O formulário chega à etapa de revisão com catálogos, empreendimento e usuários carregados. Portanto, autenticação, proxy, URL base e comunicação geral com a API estão funcionando. O problema está concentrado no domínio comercial e/ou no estado do banco utilizado pela API publicada.

## Causa mais provável: banco sem as migrações comerciais

A API consulta diretamente `crm.atendimentos`, `crm.clientes`, `crm.agendamentos`, `crm.periodos`, `crm.interacoes`, `imobiliario.empreendimentos` e `organizacao.usuarios`.

A tabela principal só é criada por:

`supabase/migrations/20260726193738_rebuild_commercial_platform.sql`

O deploy do Render executa apenas:

`npm ci && npm run build:render`

E `build:render` executa somente:

`prisma generate && nest build`

Não existe comando de migração no `package.json` nem no `render.yaml`. Assim, uma publicação bem-sucedida da API não garante que o banco possua as tabelas e colunas exigidas pelo código. O endpoint `/health` também não detecta esse drift, pois testa apenas a conexão.

## Falhas de implementação encontradas

### 1. Migrações não fazem parte do deploy

Implementar um processo explícito e auditável para aplicar, nesta ordem:

1. `20260726193738_rebuild_commercial_platform.sql`
2. `20260728120000_leads_and_attendance_contracts.sql`

Antes de aplicar em produção, executar os checks SQL da seção “Validação do banco”.

### 2. O filtro global transforma erros Prisma em 500 genérico

`HttpExceptionFilter` descarta o código e os metadados de exceções Prisma. Isso impede distinguir:

- `P2021`: tabela inexistente;
- `P2022`: coluna inexistente;
- `P2003`: chave estrangeira inválida;
- `P2002`: conflito de unicidade.

Implementar um `PrismaExceptionFilter` ou mapear esses códigos no filtro atual. A resposta pública não deve expor SQL, mas deve trazer um código estável, por exemplo `DATABASE_SCHEMA_OUTDATED`, e manter o erro completo nos logs junto ao `requestId`.

### 3. Criação possui responsabilidades acopladas em uma única transação

`createAttendance` cria, na mesma transação:

1. cliente;
2. atendimento;
3. envolvidos;
4. agendamento;
5. interação;
6. mensagem de confirmação.

Qualquer falha em uma tabela secundária reverte o atendimento inteiro e retorna 500 genérico. A confirmação deve ser enfileirada após o commit (outbox/job), e falhas não essenciais precisam ter estado próprio e retentativa.

### 4. Falta validação de escopo das chaves estrangeiras

Os UUIDs de empreendimento, tipo, origem, período, status, CIC e responsável são aceitos pelo DTO, mas não são validados como pertencentes à empresa do usuário antes do insert. Validar todos em lote e retornar `422` com `fields`, em vez de depender de erro de FK.

### 5. Contrato de listagem precisa ser formalizado

A API retorna:

```json
{
  "items": [],
  "page": 1,
  "limit": 100,
  "total": 0,
  "totalPages": 0
}
```

Esse contrato deve constar no Swagger por meio de DTO de resposta. O cliente foi ajustado para esse formato paginado e mantém compatibilidade temporária com o formato antigo em array.

### 6. Upload da foto ainda não existe

O formulário permite selecionar uma foto local, mas a API só aceita `fotoUrl`. Implementar:

- endpoint multipart ou URL assinada de upload;
- validação de MIME e tamanho;
- armazenamento por empresa/atendimento;
- persistência de URL e metadados;
- política de remoção e acesso.

## Validação do banco

Executar no mesmo banco configurado em `DATABASE_URL`:

```sql
select to_regclass('crm.atendimentos') as atendimentos,
       to_regclass('crm.agendamentos') as agendamentos,
       to_regclass('crm.interacoes') as interacoes,
       to_regclass('automation.message_queue') as message_queue;

select column_name, data_type
from information_schema.columns
where table_schema = 'crm'
  and table_name = 'atendimentos'
order by ordinal_position;
```

Também verificar se as migrações foram registradas/aplicadas no projeto Supabase correto e se `DATABASE_URL` e `DIRECT_URL` apontam para o mesmo ambiente lógico.

## Testes de aceite da API

1. Criar atendimento mínimo, sem agendamento.
2. Criar atendimento completo, com agendamento.
3. Listar e confirmar paginação e objetos relacionados.
4. Enviar UUID de outra empresa e receber `422`, nunca `500`.
5. Simular indisponibilidade da fila e confirmar que o atendimento permanece criado.
6. Confirmar que toda falha retorna `requestId` e que o log correspondente contém o erro original.
7. Executar teste pós-deploy que consulta as relações comerciais, além do `/health`.

## Correções aplicadas no frontend

- consumo correto da resposta paginada;
- exibição do `requestId` como protocolo quando a API falha;
- remoção do envio automático de confirmação por WhatsApp;
- compatibilidade temporária com resposta antiga em array.

Essas correções eliminam defeitos do cliente, mas não criam tabelas nem corrigem o schema do banco publicado. O 500 só será encerrado depois da validação/aplicação das migrações e da leitura do erro Prisma nos logs da API.
