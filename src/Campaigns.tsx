import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { PublicSession } from '../electron/contracts'
import {
  AlertTriangle, CheckCircle2, CirclePause, Clock3, Eye, Megaphone, MessageCircle, Play,
  RefreshCw, RotateCcw, Send, ShieldCheck, UsersRound, XCircle,
} from 'lucide-react'
import { apiRequest, mutationKey } from './api'

type Json = Record<string, unknown>
type Campaign = Json & {
  id?: string
  name?: string
  nome?: string
  status?: string
  createdAt?: string
  scheduledAt?: string
  totalRecipients?: number
  recipientCount?: number
}

type ProviderStatus = {
  whatsapp?: { enabled?: boolean; provider?: string; phoneNumber?: string; quality?: string }
}
type OrganizationUser = { id: string; nome?: string; name?: string; email?: string; telefone?: string; phone?: string; ativo?: boolean }
type MessageResult = Json & { id?: string; recipientName?: string; userName?: string; phoneMasked?: string; status?: string; sentAt?: string; deliveredAt?: string; readAt?: string; error?: string }
type WhatsAppTemplate = Json & { id?: string; name?: string; nome?: string; language?: string; idioma?: string; category?: string; categoria?: string; status?: string; components?: unknown[] }

const CAMPAIGN_CONTRACT_VERSION = '2026-08-05'
const statuses: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', running: 'Em execução', paused: 'Pausada',
  completed: 'Concluída', cancelled: 'Cancelada', failed: 'Falhou',
}

function arrayFrom(value: unknown): Campaign[] {
  if (Array.isArray(value)) return value as Campaign[]
  if (!value || typeof value !== 'object') return []
  const record = value as Json
  for (const key of ['items', 'campaigns', 'data']) if (Array.isArray(record[key])) return record[key] as Campaign[]
  return []
}

function label(campaign: Campaign) {
  return String(campaign.name ?? campaign.nome ?? `Campanha ${campaign.id?.slice(0, 8) ?? ''}`)
}

function campaignStatus(campaign: Campaign) {
  return String(campaign.status ?? 'draft').toLowerCase()
}

function count(campaign: Campaign) {
  return Number(campaign.totalRecipients ?? campaign.recipientCount ?? campaign.recipients ?? 0) || 0
}

function date(value: unknown) {
  if (!value) return '—'
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR')
}

function resultNumber(results: Json | null, key: string) { return Number(results?.[key] ?? 0) || 0 }
function resultMessages(results: Json | null): MessageResult[] {
  if (!results) return []
  for (const key of ['messages', 'items', 'deliveries', 'recipients']) if (Array.isArray(results[key])) return results[key] as MessageResult[]
  return []
}
function templateArray(value: unknown): WhatsAppTemplate[] {
  if (Array.isArray(value)) return value as WhatsAppTemplate[]
  if (!value || typeof value !== 'object') return []
  const record = value as Json
  for (const key of ['items', 'templates', 'data']) if (Array.isArray(record[key])) return record[key] as WhatsAppTemplate[]
  return []
}

type MessageSchedule = Json & {
  id?: string; jobId?: string; campaignId?: string; campaignName?: string; messageName?: string
  userId?: string; userName?: string; phoneMasked?: string; scheduledAt?: string; nextRunAt?: string
  status?: string; automatic?: boolean; lastRunAt?: string; sentAt?: string; error?: string
}
function scheduleArray(value: unknown): MessageSchedule[] {
  if (Array.isArray(value)) return value as MessageSchedule[]
  if (!value || typeof value !== 'object') return []
  const record = value as Json
  for (const key of ['items', 'schedules', 'jobs', 'data']) if (Array.isArray(record[key])) return record[key] as MessageSchedule[]
  return []
}
function scheduleTime(item: MessageSchedule) { return item.scheduledAt ?? item.nextRunAt }
function scheduleStatus(item: MessageSchedule) { return String(item.status ?? 'scheduled').toLowerCase() }

export default function Campaigns({ session }: { session: PublicSession }) {
  const isDev = String(session.user.role ?? '').toLowerCase() === 'dev'
  const [items, setItems] = useState<MessageSchedule[]>([])
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true)
    setError('')
    const path = isDev ? '/automation/messages/schedules?channel=whatsapp' : '/automation/messages/schedules/me?channel=whatsapp'
    const [scheduleResult, providerResult] = await Promise.allSettled([
      apiRequest<unknown>({ method: 'GET', path }),
      apiRequest<ProviderStatus>({ method: 'GET', path: '/automation/messages/provider/status' }),
    ])
    if (scheduleResult.status === 'fulfilled') setItems(scheduleArray(scheduleResult.value.data))
    else setError(scheduleResult.reason instanceof Error ? scheduleResult.reason.message : 'Não foi possível consultar a agenda automática.')
    if (providerResult.status === 'fulfilled') setProvider(providerResult.value.data)
    setLoading(false); setRefreshing(false)
  }, [isDev])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 30_000); return () => window.clearInterval(timer) }, [load])

  const pending = items.filter((item) => ['scheduled', 'queued', 'pending'].includes(scheduleStatus(item)))
  const running = items.filter((item) => ['running', 'processing'].includes(scheduleStatus(item)))
  const sent = items.filter((item) => ['sent', 'delivered', 'completed'].includes(scheduleStatus(item)))
  const failed = items.filter((item) => ['failed', 'cancelled'].includes(scheduleStatus(item)))
  const upcoming = items.slice().sort((a, b) => +new Date(scheduleTime(a) ?? 0) - +new Date(scheduleTime(b) ?? 0))
  const ownUpcoming = upcoming.find((item) => ['scheduled', 'queued', 'pending', 'running', 'processing'].includes(scheduleStatus(item)))
  const connected = Boolean(provider?.whatsapp?.enabled)

  return <section className="campaign-page schedule-page">
    <div className="page-heading"><div><h1>Agenda automática do WhatsApp</h1><p>{isDev ? 'Visão administrativa dos jobs e mensagens programadas para os usuários.' : 'Consulte se existe uma mensagem automática programada para o seu WhatsApp.'}</p></div><button className="outline-button schedule-refresh" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Atualizar agenda</button></div>
    <div className={`provider-banner ${connected ? 'ready' : 'blocked'}`}>{connected ? <ShieldCheck /> : <AlertTriangle />}<div><strong>{connected ? 'Automação do WhatsApp disponível' : 'Automação do WhatsApp indisponível'}</strong><span>{connected ? `Provider ${provider?.whatsapp?.provider ?? 'WhatsApp'} conectado · verificação automática a cada 30 segundos` : 'O backend ainda não confirmou a conexão necessária para executar os jobs.'}</span></div></div>
    {error && <div className="settings-message error">{error}</div>}
    {loading ? <div className="state-panel"><RefreshCw className="spin" /><span>Verificando agenda de mensagens…</span></div> : isDev ? <>
      <section className="campaign-metrics schedule-metrics"><article><span>Agendadas</span><strong>{pending.length}</strong></article><article><span>Em execução</span><strong>{running.length}</strong></article><article><span>Enviadas</span><strong>{sent.length}</strong></article><article className={failed.length ? 'has-failures' : ''}><span>Falhas</span><strong>{failed.length}</strong></article></section>
      <article className="panel campaign-list-panel"><div className="panel-heading"><div><h2>Jobs de envio</h2><span>Todos os usuários envolvidos</span></div><span>{items.length} registros</span></div>{upcoming.length ? <div className="table-scroll"><table className="data-table schedule-table"><thead><tr><th>Mensagem</th><th>Usuário / WhatsApp</th><th>Execução automática</th><th>Job</th><th>Status</th></tr></thead><tbody>{upcoming.map((item, index) => <tr key={String(item.id ?? item.jobId ?? index)}><td><strong>{String(item.messageName ?? item.campaignName ?? 'Mensagem automática')}</strong><small>{item.campaignId ? `Campanha ${item.campaignId}` : 'WhatsApp'}</small></td><td><strong>{String(item.userName ?? 'Usuário')}</strong><small>{String(item.phoneMasked ?? 'Telefone protegido')}</small></td><td>{date(scheduleTime(item))}<small>{item.automatic === false ? 'Execução manual' : 'Executado pelo job'}</small></td><td><code>{String(item.jobId ?? item.id ?? '—').slice(0, 12)}</code><small>{item.lastRunAt ? `Última execução: ${date(item.lastRunAt)}` : 'Ainda não executado'}</small></td><td><span className={`status-chip schedule-${scheduleStatus(item)}`}>{statuses[scheduleStatus(item)] ?? scheduleStatus(item)}</span>{item.error && <small className="schedule-error">{item.error}</small>}</td></tr>)}</tbody></table></div> : <div className="empty">Nenhum job de mensagem encontrado.</div>}</article>
    </> : <article className={`panel personal-schedule-card ${ownUpcoming ? 'has-schedule' : ''}`}>{ownUpcoming ? <><div className="personal-schedule-icon"><Clock3 size={29} /></div><div><span>Mensagem automática agendada</span><h2>{String(ownUpcoming.messageName ?? ownUpcoming.campaignName ?? 'Comunicação via WhatsApp')}</h2><strong>{date(scheduleTime(ownUpcoming))}</strong><p>O job realizará o envio automaticamente para o WhatsApp associado ao seu usuário. Você não precisa executar nenhuma ação.</p><div className="personal-schedule-meta"><span><CheckCircle2 size={15} /> Job ativo</span><span><ShieldCheck size={15} /> Número protegido</span></div></div></> : <><div className="personal-schedule-icon"><CheckCircle2 size={29} /></div><div><span>Sua agenda está livre</span><h2>Nenhuma mensagem automática agendada</h2><p>Não existe, neste momento, mensagem programada para envio ao WhatsApp associado ao seu usuário.</p></div></>}</article>}
    <div className="schedule-privacy"><ShieldCheck size={17} /><span>{isDev ? 'Acesso administrativo: destinatários, jobs, horários e falhas estão visíveis para auditoria.' : 'Privacidade aplicada: você visualiza somente a existência e o horário das mensagens destinadas ao seu próprio usuário.'}</span></div>
  </section>
}

export function LegacyCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
  const [users, setUsers] = useState<OrganizationUser[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [preview, setPreview] = useState<Json | null>(null)
  const [results, setResults] = useState<Json | null>(null)
  const [busy, setBusy] = useState('')
  const [approved, setApproved] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [campaignResult, providerResult, usersResult, templateResult] = await Promise.allSettled([
      apiRequest<unknown>({ method: 'GET', path: '/automation/campaigns' }),
      apiRequest<ProviderStatus>({ method: 'GET', path: '/automation/messages/provider/status' }),
      apiRequest<OrganizationUser[]>({ method: 'GET', path: '/organizacao/usuarios' }),
      apiRequest<unknown>({ method: 'GET', path: '/automation/messages/templates?channel=whatsapp' }),
    ])
    if (campaignResult.status === 'fulfilled') setCampaigns(arrayFrom(campaignResult.value.data))
    else setError(campaignResult.reason instanceof Error ? campaignResult.reason.message : 'Falha ao consultar campanhas.')
    setProvider(providerResult.status === 'fulfilled' ? providerResult.value.data : null)
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value.data.filter((user) => user.ativo !== false))
    if (templateResult.status === 'fulfilled') setTemplates(templateArray(templateResult.value.data).filter((template) => !template.status || ['approved', 'aprovado', 'active'].includes(String(template.status).toLowerCase())))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  const connected = Boolean(provider?.whatsapp?.enabled)
  const selectedStatus = selected ? campaignStatus(selected) : ''
  const canStart = connected && approved && Boolean(preview)
  const messages = resultMessages(results)

  const syncTemplates = async () => {
    setBusy('templates'); setError(''); setMessage('')
    try {
      await apiRequest({ method: 'POST', path: '/automation/messages/templates/sync', body: { channel: 'whatsapp' }, idempotencyKey: mutationKey() })
      const result = await apiRequest<unknown>({ method: 'GET', path: '/automation/messages/templates?channel=whatsapp' })
      const approvedTemplates = templateArray(result.data).filter((template) => !template.status || ['approved', 'aprovado', 'active'].includes(String(template.status).toLowerCase()))
      setTemplates(approvedTemplates); setMessage(`${approvedTemplates.length} template(s) aprovado(s) sincronizado(s) com o WhatsApp.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível sincronizar os templates do WhatsApp.') }
    finally { setBusy('') }
  }

  useEffect(() => {
    if (!selected?.id || !['running', 'scheduled'].includes(selectedStatus)) return
    const timer = window.setInterval(async () => {
      try {
        const [detail, result] = await Promise.all([
          apiRequest<Campaign>({ method: 'GET', path: `/automation/campaigns/${selected.id}` }),
          apiRequest<Json>({ method: 'GET', path: `/automation/campaigns/${selected.id}/results` }),
        ])
        setSelected(detail.data); setResults(result.data)
      } catch { /* preserva o último resultado durante indisponibilidade transitória */ }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [selected?.id, selectedStatus])

  const openCampaign = async (campaign: Campaign) => {
    setSelected(campaign); setPreview(null); setResults(null); setApproved(false); setScheduledAt('')
    if (!campaign.id) return
    try {
      const detail = await apiRequest<Campaign>({ method: 'GET', path: `/automation/campaigns/${campaign.id}` })
      setSelected(detail.data)
      const delivery = await apiRequest<Json>({ method: 'GET', path: `/automation/campaigns/${campaign.id}/results` })
      setResults(delivery.data)
    } catch {
      // A listagem contém dados suficientes para abrir o gerenciador se o detalhe estiver indisponível.
    }
  }

  const execute = async (action: 'preview' | 'schedule' | 'start' | 'pause' | 'resume' | 'cancel' | 'results') => {
    if (!selected?.id) return
    if (action === 'start' && !canStart) {
      setError('Antes de iniciar, valide o provedor, gere o preview e confirme o consentimento dos destinatários.')
      return
    }
    if (action === 'schedule' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      setError('Escolha uma data e hora futura para confirmar o envio automático.')
      return
    }
    setBusy(action); setError(''); setMessage('')
    try {
      const previewHash = preview && typeof preview.previewHash === 'string' ? preview.previewHash : undefined
      const body = action === 'start'
        ? { previewHash, confirmedOptIn: true }
        : action === 'schedule'
          ? { scheduledAt: new Date(scheduledAt).toISOString(), timezone: 'America/Cuiaba', previewHash }
          : {}
      const result = await apiRequest<Json>({
        method: action === 'results' ? 'GET' : 'POST',
        path: `/automation/campaigns/${selected.id}/${action}`,
        body: action === 'results' ? undefined : body,
        idempotencyKey: action === 'results' ? undefined : mutationKey(),
      })
      if (action === 'preview') setPreview(result.data)
      if (action === 'results') setResults(result.data)
      setMessage(action === 'preview' ? 'Preview atualizado. Revise os destinatários antes de iniciar.' : 'Operação enviada à API com sucesso.')
      if (!['preview', 'results'].includes(action)) await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível executar a operação.')
    } finally { setBusy('') }
  }

  const summary = useMemo(() => ({
    total: campaigns.length,
    active: campaigns.filter((item) => ['running', 'scheduled', 'paused'].includes(campaignStatus(item))).length,
    completed: campaigns.filter((item) => campaignStatus(item) === 'completed').length,
  }), [campaigns])

  return <section className="campaign-page">
    <div className="page-heading"><div><h1>Campanhas WhatsApp</h1><p>Crie, revise e acompanhe comunicações consentidas pela API oficial.</p></div><div className="campaign-heading-actions"><button className="outline-button" onClick={() => void load()}><RefreshCw size={16} /> Atualizar</button><button className="gold-button" onClick={() => setCreating(true)} disabled={!connected}><Megaphone size={17} /> Nova campanha</button></div></div>

    <div className={`provider-banner ${connected ? 'ready' : 'blocked'}`}>
      {connected ? <ShieldCheck /> : <AlertTriangle />}
      <div><strong>{connected ? 'WhatsApp conectado' : 'WhatsApp não configurado'}</strong><span>{connected ? `${provider?.whatsapp?.provider ?? 'Provider ativo'}${provider?.whatsapp?.quality ? ` · Qualidade ${provider.whatsapp.quality}` : ''}` : 'Configure o número e o token no backend antes de criar ou iniciar campanhas.'}</span></div>
    </div>
    {error && <div className="settings-message error">{error}</div>}
    {message && <div className="settings-message success">{message}</div>}

    <section className="campaign-metrics">
      <article><span>Total</span><strong>{summary.total}</strong></article>
      <article><span>Em operação</span><strong>{summary.active}</strong></article>
      <article><span>Concluídas</span><strong>{summary.completed}</strong></article>
    </section>

      <article className="panel campaign-list-panel">
      <div className="panel-heading"><h2>Campanhas</h2><span>{campaigns.length} registros</span></div>
      {loading ? <div className="state-panel"><RefreshCw className="spin" /><span>Consultando campanhas…</span></div> : !campaigns.length ? <div className="empty">Nenhuma campanha encontrada na API.</div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Campanha</th><th>Status</th><th>Destinatários</th><th>Agendamento</th><th /></tr></thead><tbody>{campaigns.map((campaign) => <tr key={String(campaign.id)}><td><strong>{label(campaign)}</strong><small>{date(campaign.createdAt)}</small></td><td><span className="status-chip">{statuses[campaignStatus(campaign)] ?? campaignStatus(campaign)}</span></td><td>{count(campaign)}</td><td>{date(campaign.scheduledAt)}</td><td><button className="row-action" onClick={() => void openCampaign(campaign)}>Gerenciar</button></td></tr>)}</tbody></table></div>}
    </article>

    {creating && <CreateCampaign users={users} templates={templates} syncing={busy === 'templates'} onSyncTemplates={syncTemplates} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); setMessage('Campanha criada como rascunho.') }} />}
    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><div className="dialog campaign-dialog"><div className="panel-heading"><div><span className="status-chip">{statuses[selectedStatus] ?? selectedStatus}</span><h2>{label(selected)}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><XCircle /></button></div>
      <div className="campaign-safety"><ShieldCheck size={20} /><div><strong>Barreiras antes do envio</strong><p>O início só é liberado após conexão do provider, preview e confirmação de consentimento.</p></div></div>
      <div className="campaign-action-grid">
        <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('preview')}><Eye size={16} /> Gerar preview</button>
        <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('results')}><CheckCircle2 size={16} /> Resultados</button>
        {selectedStatus === 'paused' ? <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('resume')}><RotateCcw size={16} /> Retomar</button> : <button className="outline-button" disabled={Boolean(busy) || !['running', 'scheduled'].includes(selectedStatus)} onClick={() => void execute('pause')}><CirclePause size={16} /> Pausar</button>}
        <button className="outline-button destructive" disabled={Boolean(busy) || ['completed', 'cancelled'].includes(selectedStatus)} onClick={() => void execute('cancel')}><XCircle size={16} /> Cancelar</button>
      </div>
      {preview && <section className="campaign-preview-panel"><div className="panel-heading"><h3>Conferência antes do envio</h3><span>{Number(preview.eligible ?? 0)} destinatários elegíveis</span></div><div className="campaign-result-metrics"><div><span>Elegíveis</span><strong>{Number(preview.eligible ?? 0)}</strong></div><div><span>Excluídos</span><strong>{Object.values((preview.excluded as Json | undefined) ?? {}).reduce<number>((sum, value) => sum + (Number(value) || 0), 0)}</strong></div></div></section>}
      {results && <section className="campaign-results-panel"><div className="panel-heading"><div><h3>Verificação das mensagens</h3><span>Atualização automática a cada 30 segundos</span></div><button onClick={() => void execute('results')}><RefreshCw size={14} /> Conferir agora</button></div><div className="campaign-result-metrics"><div><span>Na fila</span><strong>{resultNumber(results, 'queued')}</strong></div><div><span>Enviadas</span><strong>{resultNumber(results, 'sent')}</strong></div><div><span>Entregues</span><strong>{resultNumber(results, 'delivered')}</strong></div><div><span>Lidas</span><strong>{resultNumber(results, 'read')}</strong></div><div className="failed"><span>Falhas</span><strong>{resultNumber(results, 'failed')}</strong></div></div>{messages.length > 0 && <div className="message-delivery-list">{messages.map((item, index) => <div key={String(item.id ?? index)}><MessageCircle size={17} /><div><strong>{String(item.recipientName ?? item.userName ?? item.phoneMasked ?? 'Destinatário')}</strong><span>{item.deliveredAt ? `Entregue em ${date(item.deliveredAt)}` : item.sentAt ? `Enviada em ${date(item.sentAt)}` : item.error ? String(item.error) : 'Aguardando processamento'}</span></div><span className={`delivery-status ${String(item.status ?? 'queued').toLowerCase()}`}>{String(item.status ?? 'queued')}</span></div>)}</div>}</section>}
      <section className={`automation-check ${selectedStatus === 'scheduled' ? 'scheduled' : selectedStatus === 'running' ? 'running' : ''}`}><Clock3 size={20} /><div><strong>{selectedStatus === 'scheduled' ? 'Envio automático confirmado' : selectedStatus === 'running' ? 'Envio automático em execução' : 'Envio automático ainda não ativado'}</strong><span>{selectedStatus === 'scheduled' ? `Programado para ${date(selected.scheduledAt)}. A tela verificará o resultado automaticamente.` : selectedStatus === 'running' ? 'A campanha está processando a fila e os resultados serão atualizados a cada 30 segundos.' : 'Gere o preview, confirme o consentimento e escolha uma data futura para agendar.'}</span></div></section>
      <div className="campaign-schedule"><label>Agendar envio<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><button className="outline-button" disabled={Boolean(busy) || !scheduledAt || !preview || !approved} onClick={() => void execute('schedule')}><Send size={16} /> Agendar</button></div>
      <label className="campaign-consent"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span>Confirmo que o público do preview possui opt-in válido para WhatsApp e que pedidos de descadastro foram excluídos.</span></label>
      <button className="gold-button campaign-start" disabled={Boolean(busy) || !canStart || !['draft', 'scheduled', 'paused'].includes(selectedStatus)} onClick={() => void execute('start')}><Play size={17} /> Iniciar campanha</button>
    </div></div>}
  </section>
}

function CreateCampaign({ users, templates, syncing, onSyncTemplates, onClose, onCreated }: { users: OrganizationUser[]; templates: WhatsAppTemplate[]; syncing: boolean; onSyncTemplates: () => Promise<void>; onClose: () => void; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [templateName, setTemplateName] = useState('')
  const selectedTemplate = templates.find((template) => String(template.name ?? template.nome ?? '') === templateName)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    const values = new FormData(event.currentTarget)
    const selectedUsers = values.getAll('userIds').map(String)
    const body = {
      contractVersion: CAMPAIGN_CONTRACT_VERSION,
      name: String(values.get('name') ?? '').trim(),
      description: String(values.get('description') ?? '').trim() || undefined,
      channel: 'whatsapp',
      template: { id: String(values.get('templateId') ?? '') || undefined, name: String(values.get('template') ?? '').trim(), language: String(values.get('language') ?? 'pt_BR') },
      audience: { source: selectedUsers.length ? 'organization_users' : 'crm_accounts', userIds: selectedUsers.length ? selectedUsers : undefined, segment: selectedUsers.length ? undefined : String(values.get('segment') ?? '').trim() || undefined, requireOptIn: true, excludeOptOut: true, requireValidPhone: true },
      delivery: { batchSize: Number(values.get('batchSize') ?? 25), intervalMs: Number(values.get('intervalMs') ?? 1000), dailyLimit: Number(values.get('dailyLimit') ?? 250) },
      status: 'draft',
    }
    try {
      await apiRequest({ method: 'POST', path: '/automation/campaigns', body, idempotencyKey: mutationKey() })
      await onCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a campanha.'); setSaving(false) }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="dialog campaign-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Nova campanha</h2><p>Será salva como rascunho, sem envio automático.</p></div><button type="button" className="icon-button" onClick={onClose}><XCircle /></button></div>
    <section className="whatsapp-template-picker"><div className="panel-heading"><div><strong>Template oficial do WhatsApp</strong><span>Modelos aprovados sincronizados pela API REIS</span></div><button type="button" disabled={syncing} onClick={() => void onSyncTemplates()}><RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Sincronizando…' : 'Sincronizar'}</button></div><label>Template aprovado<select name="template" required value={templateName} onChange={(event) => setTemplateName(event.target.value)}><option value="">{templates.length ? 'Selecione um template…' : 'Nenhum template aprovado encontrado'}</option>{templates.map((template, index) => { const name = String(template.name ?? template.nome ?? ''); const language = String(template.language ?? template.idioma ?? 'pt_BR'); return <option key={String(template.id ?? `${name}-${index}`)} value={name}>{name} · {language} · {String(template.category ?? template.categoria ?? 'WhatsApp')}</option> })}</select></label><input type="hidden" name="templateId" value={String(selectedTemplate?.id ?? '')} /><input type="hidden" name="language" value={String(selectedTemplate?.language ?? selectedTemplate?.idioma ?? 'pt_BR')} />{selectedTemplate && <div className="selected-template-info"><CheckCircle2 size={16} /><span><strong>{templateName}</strong><small>{String(selectedTemplate.category ?? selectedTemplate.categoria ?? 'Template')} · {String(selectedTemplate.language ?? selectedTemplate.idioma ?? 'pt_BR')} · Aprovado</small></span></div>}</section>
    <div className="dialog-fields"><label>Nome da campanha<input name="name" required minLength={3} autoFocus /></label><label>Segmento do CRM<input name="segment" placeholder="ex.: compradores_cuiaba" /></label><label>Destinatários por lote<input name="batchSize" type="number" min="1" max="100" defaultValue="25" required /></label><label>Intervalo entre envios (ms)<input name="intervalMs" type="number" min="250" max="60000" defaultValue="1000" required /></label><label>Limite diário inicial<input name="dailyLimit" type="number" min="1" max="100000" defaultValue="250" required /></label><label className="full-field">Descrição<textarea name="description" rows={3} /></label></div>
    <fieldset className="campaign-users"><legend><UsersRound size={17} /> Enviar para usuários do sistema</legend><p>Selecione usuários ativos com telefone e consentimento WhatsApp. Sem seleção, será usado o segmento do CRM.</p><div>{users.length ? users.map((user) => <label key={user.id}><input type="checkbox" name="userIds" value={user.id} disabled={!user.telefone && !user.phone} /><span><strong>{user.nome ?? user.name ?? user.email}</strong><small>{user.telefone ?? user.phone ?? 'Sem telefone cadastrado'}</small></span></label>) : <div className="empty">Nenhum usuário ativo disponível.</div>}</div></fieldset>
    <div className="campaign-safety"><AlertTriangle size={20} /><p>O público será limitado a contatos com telefone válido e opt-in, excluindo opt-outs. A API também deve validar essas regras.</p></div>
    {error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}><Send size={16} /> {saving ? 'Criando…' : 'Criar rascunho'}</button></div>
  </form></div>
}
