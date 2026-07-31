# Auditoria completa do sistema REIS

Data: 30/07/2026

## Escopo

Foram revisados o cliente React, a ponte Electron, os contratos HTTP, os
controllers e services NestJS, o schema Prisma e as migrações relacionadas aos
fluxos atualmente expostos pela aplicação.

## Correções aplicadas no cliente

### Leads agora persistem como leads

Antes, a tela intitulada `Leads` consultava e gravava apenas `/crm/accounts`.
Isso criava registros em `crm.clientes`, mas não em `crm.leads`.

O fluxo foi corrigido para:

1. criar o cliente em `POST /crm/accounts`;
2. usar o `id` retornado para criar `POST /crm/leads`;
3. listar `GET /crm/leads`;
4. persistir origem, prioridade, score, valor potencial e observações;
5. ler nome, e-mail e telefone do objeto relacionado `cliente`.

Limitação: as duas gravações ainda não são atômicas. A API deve publicar um
endpoint transacional para criar cliente + lead, ou aceitar os dados do novo
cliente no DTO de criação do lead.

### Campo website removido do formulário

`CreateCrmAccountDto` aceita `website`, mas `CrmService.createAccount` descarta o
campo e o modelo Prisma `Cliente` não possui coluna correspondente. O campo foi
removido da interface para impedir falsa confirmação de persistência.

Para reativá-lo corretamente, adicionar `website` ao banco, Prisma, projeções,
DTOs de criação/edição e testes.

### E-mail do perfil protegido contra divergência

A atualização de usuário altera `organizacao.usuarios.email`, mas não atualiza
o e-mail no Supabase Auth. Isso poderia deixar banco, sessão e credencial de
login divergentes. A edição de e-mail foi desabilitada até existir um endpoint
que execute alteração e confirmação no provedor de identidade.

### Electron endurecido

- origem do renderer é comparada por `origin`, protocolo e hostname, sem
  comparação insegura por prefixo;
- o protocolo `reis-app://` resolve o caminho final e confirma que ele permanece
  dentro do diretório do renderer;
- `/health-malicious` e outros prefixos parecidos não passam mais pela allowlist
  IPC;
- teste de regressão incluído.

## Dados que ainda não chegam ao banco

### Foto do atendimento — prioridade alta

O arquivo é selecionado somente no renderer. Nenhum upload é realizado e
`fotoUrl` não é enviado.

Implementação necessária:

- endpoint de URL assinada ou `multipart/form-data`;
- bucket privado e caminho por `empresaId/atendimentoId`;
- limites de tamanho, MIME permitido e inspeção do conteúdo real;
- metadados de storage vinculados ao atendimento;
- URL assinada para leitura;
- remoção e auditoria;
- só marcar o atendimento como completo após upload confirmado, quando o tipo
  exigir foto.

### Preferências e notificações — prioridade média

Tema, idioma, fuso e preferências de notificações existem apenas em
`localStorage`. Elas não acompanham o usuário entre web e desktop.

Criar tabela `organizacao.usuario_preferencias` com chave única por usuário e
empresa, DTO com allowlist e endpoints `GET/PATCH /organizacao/me/preferencias`.
Preferências estritamente visuais podem continuar com cache local, mas o banco
deve ser a fonte de verdade.

### Website do cliente — prioridade média

Adicionar coluna opcional `website` em `crm.clientes`. Validar protocolo
`https/http`, normalizar host e nunca renderizar como HTML.

### Sincronização do Google Calendar — prioridade média

`createEvent` salva o agendamento e ignora qualquer erro de
`syncGoogleEvent`. O registro fica com `googleSyncEnabled=true`, mesmo quando
nada foi sincronizado.

Adicionar `googleSyncStatus` (`pending`, `synced`, `failed`, `disabled`),
`googleSyncErrorCode` e `googleSyncedAt`. Retornar o estado ao cliente e usar
job/outbox para retentativas.

## Vulnerabilidades e riscos encontrados

### Alta — ausência de rate limiting em autenticação e registro

Não foi encontrada proteção explícita contra tentativas repetidas em:

- `POST /auth/login`;
- `POST /auth/register`;
- `POST /auth/refresh`.

O registro público cria empresa, cargo, usuário interno e usuário no Supabase.
Sem limitação, CAPTCHA/Turnstile e controle de abuso, pode haver enumeração,
brute force e criação massiva de tenants.

Implementar throttling por IP e identidade, limites mais fortes no registro,
backoff, auditoria e desafio antiabuso.

### Alta — isolamento precisa de teste cross-tenant automatizado

A API usa Prisma com credencial de servidor; portanto, RLS não deve ser
considerada a única barreira. Existem perfis `dev` e `ceo` com leitura global
intencional. Essa exceção precisa de testes que comprovem:

- usuário comum não consulta ou altera outra empresa;
- `usuario_master` fica restrito à própria empresa;
- referências cruzadas retornam `422/404`;
- rotas globais exigem permissão específica além do nome do cargo;
- logs registram o operador e a empresa alvo.

### Média — headers HTTP defensivos não estão configurados

Não foi encontrada configuração equivalente ao Helmet/CSP na API. Adicionar:

- Content-Security-Policy adequada ao Swagger e aplicação;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- `Permissions-Policy`;
- HSTS em produção;
- proteção contra framing.

O Swagger deve ser desabilitado em produção ou protegido por autenticação.

### Média — tokens da aplicação web ficam em sessionStorage

Isso reduz persistência entre sessões, mas qualquer XSS no mesmo origin consegue
ler access e refresh tokens. O Electron já utiliza `safeStorage`.

Para web, preferir refresh token em cookie `HttpOnly`, `Secure`,
`SameSite=Strict/Lax`, com rotação e detecção de reutilização. Manter access
token curto somente em memória.

### Média — criação de cliente + lead não é atômica

Se o cliente for criado e o segundo POST falhar, sobra um cliente sem lead.
Implementar endpoint composto transacional e idempotente.

### Média — atendimentos podem duplicar clientes

Ao receber nome e telefone, `createAttendance` sempre cria um novo cliente. A
API já possui busca por telefone, mas ela não é usada na criação. Normalizar
telefone, buscar cliente ativo da mesma empresa e aplicar uma regra explícita de
reuso/duplicidade.

### Baixa — auditoria de dependências não concluída externamente

A execução de `npm audit` exigia enviar metadados das dependências ao registro
npm e não foi autorizada pelo controle do ambiente. Testes, lint e builds locais
foram executados, mas advisories externos precisam de autorização explícita.

## Melhorias de contrato e banco

1. Criar `POST /crm/leads/with-client` transacional e idempotente.
2. Criar upload de foto do atendimento com Storage privado.
3. Adicionar `website` ao cliente ou removê-lo definitivamente do DTO.
4. Criar persistência de preferências do usuário.
5. Adicionar estado real da sincronização Google.
6. Sincronizar alteração de e-mail com Supabase Auth antes de atualizar o banco.
7. Normalizar telefone, CPF/CNPJ e URLs no backend.
8. Incluir constraints/índices para duplicidade conforme regra de negócio.
9. Adicionar testes de contrato que comparem DTO, service e colunas persistidas.
10. Adicionar smoke test pós-deploy que cria, consulta, altera e remove dados de
    homologação em cada módulo.

## Matriz resumida de persistência

| Elemento | Situação |
|---|---|
| Cliente do lead | Persistido em `crm.clientes` |
| Lead comercial | Corrigido para persistir em `crm.leads` |
| Origem, prioridade, score, valor e observações do lead | Corrigidos |
| Oportunidade básica | Persistida; formulário ainda captura poucos campos |
| Atividade operacional | Persistida |
| Atendimento e agendamento | Persistidos após migrações comerciais |
| Foto do atendimento | Não persistida |
| Perfil: nome e telefone | Persistidos |
| Perfil: e-mail | Bloqueado até sincronização com Auth |
| Tema, idioma, fuso e notificações | Somente local |
| Evento do calendário | Persistido |
| Estado real da sincronização Google | Não persistido de forma confiável |

## Critérios de aceite restantes

- executar fluxo cliente + lead contra banco de homologação;
- simular falha no segundo passo e validar futura transação composta;
- enviar foto válida/inválida após implementação do upload;
- testar duas empresas e todos os perfis;
- confirmar rate limiting;
- confirmar headers de segurança;
- confirmar rotação e revogação de refresh token;
- executar auditoria de dependências com autorização explícita;
- validar readiness e migrações no ambiente publicado.
