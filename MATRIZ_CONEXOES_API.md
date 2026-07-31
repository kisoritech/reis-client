# Matriz de conexões da aplicação REIS

Data da varredura: 30/07/2026

## Fluxos visuais conectados

| Módulo | Operações consumidas |
|---|---|
| Autenticação | login, refresh, logout e sessão |
| Dashboard | central CRM e analytics dashboard |
| Leads | listar, criar, consultar status, consultar histórico e alterar etapa |
| Oportunidades | listar, criar, detalhar, editar plano, mudar status e criar follow-up |
| Agenda | listar, criar, alterar status e excluir |
| Atendimentos | listar, criar, detalhar e alterar status |
| Fluxo operacional | central CRM, dashboard, overview e navegação aos módulos |
| Configurações | atualizar perfil, status/conexão Google e status do WhatsApp |
| Relatórios | analytics dashboard |

## Correções desta varredura

- abas de Leads agora vêm de `GET /crm/lead-statuses`;
- uma linha de lead abre o histórico real;
- mudança de etapa usa `PATCH /crm/leads/{id}/status`;
- calendário permite marcar realizado, cancelar e excluir;
- oportunidades permitem editar probabilidade, temperatura, previsão e próxima ação;
- follow-up de oportunidade cria uma atividade vinculada;
- atendimentos podem ser detalhados, concluídos ou cancelados;
- erros continuam preservando o protocolo retornado pela API.

## Endpoints existentes sem elemento visual correspondente

Esses endpoints não representam controles quebrados: são recursos administrativos
ou módulos que ainda não possuem tela.

### Administração

- empresas, cargos, permissões e equipes;
- criação e ativação/desativação de usuários;
- logs de auditoria e login;
- health detalhado e versão.

### Imobiliário

- catálogo completo de imóveis;
- enriquecimento por CEP;
- mídia, documentos e sincronização de Storage;
- visitas, propostas e contratos.

### Automação

- jobs e execuções;
- geração/processamento/reprocessamento de mensagens;
- campanhas, preview, agenda, início, pausa, retomada, cancelamento e resultados.

### Integrações públicas/técnicas

- CEP e IBGE;
- webhooks Meta;
- callback e webhook Google Calendar.

Essas rotas não devem ser chamadas apenas para aumentar a cobertura. Cada grupo
precisa de módulo próprio, permissões visuais e tratamento de dados adequado.

## Lacunas da API que impedem conexão completa

1. Não há catálogo público de pipelines/etapas para o Kanban de oportunidades.
2. Não há upload de foto específico para atendimento.
3. Não há preferência de usuário persistida para tema, idioma e notificações.
4. Alteração de e-mail não sincroniza o banco com o provedor de autenticação.
5. Cliente + lead ainda são criados em duas requisições, sem transação única.
6. A listagem de oportunidades não inclui o responsável resumido.

## Próximos módulos recomendados

1. Imóveis e empreendimentos.
2. Visitas e propostas vinculadas à oportunidade.
3. Central de automações e mensagens.
4. Administração de equipe e permissões.
5. Auditoria operacional.
