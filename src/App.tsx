import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {
  BarChart3, Bell, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock3,
  CalendarCheck2, CalendarDays, ClipboardList, FileSpreadsheet, FileText, LayoutDashboard, MapPin, Megaphone, Menu, RefreshCw, Search, Settings, Target,
  UsersRound, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PublicSession } from '../electron/contracts'
import {
  apiHealth,
  apiRequest,
  authApi,
  mutationKey,
  SESSION_EXPIRED_EVENT,
} from './api'
import SettingsPage from './Settings'
import CalendarPage from './Calendar'
import AttendancesPage from './Attendances'
import OpportunitiesPage from './Opportunities'
import CampaignsPage from './Campaigns'
import ClientsPage from './Clients'
import './App.css'

type Section = { id: string; label: string; icon: LucideIcon }
type Row = Record<string, unknown>
type Page<T> = { items: T[]; page: number; total: number; totalPages: number }
type Central = {
  metrics: {
    accounts: number; contacts: number; openDeals: number; wonDeals: number
    lostDeals: number; pendingActivities: number; overdueActivities: number
    pipelineValueCents: number
  }
  recentDeals: Row[]
  nextActivities: Row[]
}
type Analytics = {
  crm: Row[]; imobiliario: Row[]; vendas: Row[]; tarefas: Row[]; generatedAt: string
}
type DashboardAttendance = Row & {
  id: string; status?: string; createdAt?: string; updatedAt?: string
  cliente?: { nome?: string }; tipoAtendimento?: { nome?: string }
}
type AttendancePayload = DashboardAttendance[] | { items: DashboardAttendance[]; total?: number }

const sections: Section[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'atendimentos', label: 'Atendimentos', icon: ClipboardList },
  { id: 'clientes', label: 'Clientes', icon: UsersRound },
  { id: 'oportunidades', label: 'Oportunidades', icon: Target },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
]

const endpoints: Record<string, string> = {
  leads: '/crm/accounts',
  oportunidades: '/crm/deals',
  fluxo: '/crm/activities',
}

function initials(name?: string) {
  return (name ?? 'RE').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
function asNumber(value: unknown) { return Number(value ?? 0) || 0 }
function money(cents: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    .format(asNumber(cents) / 100)
}
function date(value: unknown) {
  if (!value) return '—'
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR')
}
function text(row: Row, ...keys: string[]) {
  const key = keys.find((item) => row[item] !== undefined && row[item] !== null)
  return key ? String(row[key]) : '—'
}

function useRemote<T>(load: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    load().then((value) => current && setData(value))
      .catch((reason: unknown) => current && setError(reason instanceof Error ? reason.message : 'Falha ao carregar'))
      .finally(() => current && setLoading(false))
    return () => { current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, version])
  return { data, loading, error, reload }
}

function Brand() {
  return <div className="brand"><div className="brand-mark" aria-hidden="true"><img src="/brand/reis-logo.png" alt="" /></div><div><strong>Renan Reis</strong><span>Consultoria Imobiliária</span></div></div>
}
type DayEvent = { id: string; titulo: string; inicio: string; fim: string; local?: string; status?: string; tipo?: string }

function TopbarNotifications({ refreshKey, onOpenAgenda }: { refreshKey: number; onOpenAgenda: () => void }) {
  const [events, setEvents] = useState<DayEvent[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setHours(23, 59, 59, 999)
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
    try {
      const result = await apiRequest<DayEvent[]>({ method: 'GET', path: `/calendar/events?${query}` })
      setEvents(result.data.filter((event) => event.status !== 'cancelado').sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a agenda.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [load, refreshKey])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const now = Date.now()
  const upcoming = events.filter((event) => new Date(event.fim).getTime() >= now)
  return <div className="notification-center" ref={container}>
    <button type="button" className={`notification ${upcoming.length ? 'has-events' : ''}`} aria-label={`${upcoming.length} agendamento(s) para hoje`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={19} />{upcoming.length > 0 && <i>{upcoming.length > 9 ? '9+' : upcoming.length}</i>}</button>
    {open && <div className="notification-popover"><header><div><strong>Agenda de hoje</strong><span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></div><button type="button" onClick={() => void load()} aria-label="Atualizar notificações"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></header>
      <div className="notification-list">{loading && !events.length ? <div className="notification-empty">Consultando agendamentos…</div> : error ? <div className="notification-empty error">{error}</div> : !events.length ? <div className="notification-empty">Nenhum agendamento para hoje.</div> : events.map((event) => {
        const finished = new Date(event.fim).getTime() < now
        return <button type="button" key={event.id} className={finished ? 'finished' : ''} onClick={() => { setOpen(false); onOpenAgenda() }}><span className="notification-time"><Clock3 size={15} />{new Date(event.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span className="notification-title"><strong>{event.titulo}</strong><small>{event.local ? <><MapPin size={12} />{event.local}</> : event.tipo ?? 'Compromisso'}{finished && ' · Encerrado'}</small></span></button>
      })}</div><button type="button" className="notification-footer" onClick={() => { setOpen(false); onOpenAgenda() }}>Ver agenda completa</button>
    </div>}
  </div>
}

function StatePanel({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <div className="state-panel"><RefreshCw className="spin" /><span>Buscando dados da API…</span></div>
  if (error) return <div className="state-panel error"><strong>Não foi possível carregar</strong><span>{error}</span><button onClick={onRetry}>Tentar novamente</button></div>
  return null
}

export function LegacyDashboard({ refreshKey }: { refreshKey: number }) {
  const central = useRemote(async () => (await apiRequest<Central>({ method: 'GET', path: '/crm/central' })).data, [refreshKey])
  const analytics = useRemote(async () => (await apiRequest<Analytics>({ method: 'GET', path: '/analytics/dashboard' })).data, [refreshKey])
  if (!central.data) return <StatePanel loading={central.loading} error={central.error} onRetry={central.reload} />
  const metrics = central.data.metrics
  const crm = analytics.data?.crm?.[0] ?? {}
  const tasks = analytics.data?.tarefas?.[0] ?? {}
  const cards = [
    { label: 'Clientes', value: metrics.accounts, detail: `${metrics.contacts} contatos`, icon: UsersRound },
    { label: 'Negócios ganhos', value: metrics.wonDeals, detail: `${metrics.openDeals} em aberto`, icon: CheckCircle2 },
    { label: 'Tarefas concluídas', value: asNumber(tasks.concluidas), detail: `${metrics.pendingActivities} pendentes`, icon: Target },
    { label: 'Pipeline', value: money(metrics.pipelineValueCents), detail: `${asNumber(crm.taxaConversao)}% de conversão`, icon: CircleDollarSign },
  ]
  return <>
    <div className="page-heading"><div><h1>Dashboard</h1><p>Visão geral atualizada diretamente pela API REIS.</p></div><button className="period-button" onClick={() => { central.reload(); analytics.reload() }}><RefreshCw size={15} /> Atualizar</button></div>
    {analytics.error && <div className="inline-warning">{analytics.error}</div>}
    <section className="metrics-grid">
      {cards.map(({ label, value, detail, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={23} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}
    </section>
    <section className="dashboard-grid">
      <article className="panel performance-panel"><div className="panel-heading"><h2>Negócios recentes</h2><span>{central.data.recentDeals.length} registros</span></div><DataTable rows={central.data.recentDeals} kind="deals" compact /></article>
      <article className="panel status-panel"><h2>Operação agora</h2><ul className="summary-list">
        <li><span>Negócios abertos</span><strong>{metrics.openDeals}</strong></li>
        <li><span>Negócios ganhos</span><strong>{metrics.wonDeals}</strong></li>
        <li><span>Negócios perdidos</span><strong>{metrics.lostDeals}</strong></li>
        <li><span>Tarefas vencidas</span><strong>{metrics.overdueActivities}</strong></li>
      </ul></article>
      <article className="panel sellers-panel wide-panel"><div className="panel-heading"><h2>Próximas atividades</h2><span>Agenda operacional</span></div><DataTable rows={central.data.nextActivities} kind="activities" compact /></article>
    </section>
  </>
}

function Dashboard({ refreshKey, onNavigate }: { refreshKey: number; onNavigate: (id: string) => void }) {
  const central = useRemote(async () => (await apiRequest<Central>({ method: 'GET', path: '/crm/central' })).data, [refreshKey])
  const operation = useRemote(async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1).toISOString()
    const end = new Date(now.getFullYear() + 1, 0, 1).toISOString()
    const [attendanceResult, scheduleResult] = await Promise.all([
      apiRequest<AttendancePayload>({ method: 'GET', path: '/crm/atendimentos?limit=100' }),
      apiRequest<DayEvent[]>({ method: 'GET', path: `/calendar/events?${new URLSearchParams({ start, end })}` }),
    ])
    const payload = attendanceResult.data
    return { attendances: Array.isArray(payload) ? payload : payload.items, schedules: scheduleResult.data }
  }, [refreshKey])
  const [period, setPeriod] = useState<'dia' | 'mes' | 'ano'>('mes')
  if (!central.data) return <StatePanel loading={central.loading} error={central.error} onRetry={central.reload} />

  const metrics = central.data.metrics
  const attendances = operation.data?.attendances ?? []
  const schedules = operation.data?.schedules ?? []
  const now = new Date()
  const normalizedStatus = (value?: string) => (value ?? 'aberto').toLocaleLowerCase('pt-BR')
  const finishedStatuses = ['concluido', 'concluído', 'finalizado', 'realizado', 'ganho', 'convertido']
  const lostStatuses = ['cancelado', 'perdido', 'nao_compareceu', 'não compareceu']
  const completed = attendances.filter((item) => finishedStatuses.includes(normalizedStatus(item.status)))
  const lost = attendances.filter((item) => lostStatuses.includes(normalizedStatus(item.status)))
  const inProgress = Math.max(0, attendances.length - completed.length - lost.length)
  const todaySchedules = schedules.filter((item) => new Date(item.inicio).toDateString() === now.toDateString() && item.status !== 'cancelado')
  const conversion = attendances.length ? Math.round((completed.length / attendances.length) * 100) : 0
  const cards = [
    { label: 'Atendimentos', value: attendances.length, detail: `${inProgress} em andamento`, icon: ClipboardList },
    { label: 'Agenda de hoje', value: todaySchedules.length, detail: `${todaySchedules.filter((item) => item.status === 'confirmado').length} confirmados`, icon: CalendarCheck2 },
    { label: 'Entregas realizadas', value: completed.length, detail: `${conversion}% dos atendimentos`, icon: CheckCircle2 },
    { label: 'Resultado gerado', value: money(metrics.pipelineValueCents), detail: `${metrics.wonDeals} negócios ganhos`, icon: CircleDollarSign },
  ]
  const anchors = period === 'dia'
    ? Array.from({ length: 7 }, (_, index) => { const d = new Date(now); d.setDate(now.getDate() - (6 - index)); return d })
    : period === 'mes'
      ? Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - (5 - index), 1))
      : Array.from({ length: 5 }, (_, index) => new Date(now.getFullYear() - (4 - index), 0, 1))
  const points = anchors.map((anchor) => {
    const matches = (value?: string) => {
      if (!value) return false
      const d = new Date(value)
      return period === 'dia' ? d.toDateString() === anchor.toDateString() : period === 'mes' ? d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear() : d.getFullYear() === anchor.getFullYear()
    }
    return {
      label: period === 'dia' ? anchor.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : period === 'mes' ? anchor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : String(anchor.getFullYear()),
      attendances: attendances.filter((item) => matches(item.createdAt)).length,
      deliveries: completed.filter((item) => matches(item.updatedAt ?? item.createdAt)).length,
    }
  })
  const chartMax = Math.max(1, ...points.flatMap((item) => [item.attendances, item.deliveries]))
  const upcoming = schedules.filter((item) => new Date(item.fim).getTime() >= Date.now() && item.status !== 'cancelado').sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio)).slice(0, 5)
  const recent = attendances.slice().sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0)).slice(0, 5)

  return <>
    <div className="page-heading"><div><h1>Central de resultados</h1><p>Atendimentos, agenda, entregas e resultados comerciais em uma só visão.</p></div><button className="period-button" onClick={() => { central.reload(); operation.reload() }}><RefreshCw size={15} /> Atualizar</button></div>
    {operation.error && <div className="inline-warning">Alguns dados operacionais não puderam ser atualizados: {operation.error}</div>}
    <section className="metrics-grid">{cards.map(({ label, value, detail, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={23} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
    <section className="dashboard-grid results-dashboard">
      <article className="panel delivery-panel"><div className="panel-heading"><div><h2>Atendimentos × entregas</h2><span>Evolução dos resultados gerados</span></div><div className="chart-periods">{(['dia', 'mes', 'ano'] as const).map((item) => <button key={item} className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}>{item === 'dia' ? '7 dias' : item === 'mes' ? '6 meses' : '5 anos'}</button>)}</div></div><div className="delivery-legend"><span><i className="attendance-dot" />Atendimentos</span><span><i className="delivery-dot" />Entregas</span></div><div className="delivery-chart">{points.map((item) => <div className="delivery-column" key={item.label}><div className="delivery-bars"><span title={`${item.attendances} atendimentos`} style={{ height: `${Math.max(item.attendances ? 8 : 0, item.attendances / chartMax * 100)}%` }}><b>{item.attendances || ''}</b></span><span title={`${item.deliveries} entregas`} style={{ height: `${Math.max(item.deliveries ? 8 : 0, item.deliveries / chartMax * 100)}%` }}><b>{item.deliveries || ''}</b></span></div><small>{item.label}</small></div>)}</div></article>
      <article className="panel outcome-panel"><div className="panel-heading"><h2>Resultado dos atendimentos</h2><button onClick={() => onNavigate('atendimentos')}>Ver todos</button></div><div className="outcome-ring" style={{ '--completed': `${conversion * 3.6}deg` } as CSSProperties}><strong>{conversion}%</strong><span>convertidos</span></div><ul className="summary-list"><li><span><i className="success-dot" />Concluídos</span><strong>{completed.length}</strong></li><li><span><i className="progress-dot" />Em andamento</span><strong>{inProgress}</strong></li><li><span><i className="lost-dot" />Cancelados / perdidos</span><strong>{lost.length}</strong></li></ul></article>
      <article className="panel agenda-panel"><div className="panel-heading"><div><h2>Próximos agendamentos</h2><span>Compromissos ligados à operação</span></div><button onClick={() => onNavigate('agenda')}>Abrir agenda</button></div><div className="dashboard-agenda-list">{upcoming.length ? upcoming.map((item) => <button key={item.id} onClick={() => onNavigate('agenda')}><time><strong>{new Date(item.inicio).toLocaleDateString('pt-BR', { day: '2-digit' })}</strong><span>{new Date(item.inicio).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></time><div><strong>{item.titulo}</strong><span>{new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{item.local ? ` · ${item.local}` : ''}</span></div><span className="status-chip">{item.status ?? 'agendado'}</span></button>) : <div className="empty">Nenhum agendamento futuro.</div>}</div></article>
      <article className="panel recent-attendance-panel"><div className="panel-heading"><div><h2>Atendimentos recentes</h2><span>Origem dos resultados comerciais</span></div><button onClick={() => onNavigate('atendimentos')}>Ver atendimentos</button></div><div className="recent-attendance-list">{recent.length ? recent.map((item) => <button key={item.id} onClick={() => onNavigate('atendimentos')}><div><strong>{item.cliente?.nome ?? 'Cliente não informado'}</strong><span>{item.tipoAtendimento?.nome ?? 'Atendimento'} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : 'sem data'}</span></div><span className="status-chip">{item.status ?? 'aberto'}</span></button>) : <div className="empty">Nenhum atendimento encontrado.</div>}</div></article>
    </section>
  </>
}

function DataTable({ rows, kind, compact = false, onComplete }: { rows: Row[]; kind: string; compact?: boolean; onComplete?: (id: string) => void }) {
  if (!rows.length) return <div className="empty">Nenhum registro encontrado.</div>
  return <div className="table-scroll"><table className="data-table"><thead><tr>
    <th>Nome</th><th>Status</th>{!compact && <th>{kind === 'deals' ? 'Valor' : 'Contato / Prazo'}</th>}{onComplete && <th />}
  </tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>
    <td><strong>{text(row, 'nome', 'name', 'titulo', 'title')}</strong><small>{text(row, 'email', 'descricao', 'description')}</small></td>
    <td><span className="status-chip">{text(row, 'status', 'etapa', 'stage')}</span></td>
    {!compact && <td>{kind === 'deals' ? money(asNumber(row.valueCents ?? row.valor) * (row.valor ? 100 : 1)) : text(row, 'telefone', 'phone') !== '—' ? text(row, 'telefone', 'phone') : date(row.vencimento ?? row.dueAt)}</td>}
    {onComplete && <td><button className="row-action" onClick={() => onComplete(String(row.id))}>Concluir</button></td>}
  </tr>)}</tbody></table></div>
}

function ResourcePage({ section, search, refreshKey }: { section: Section; search: string; refreshKey: number }) {
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const path = endpoints[section.id]
  const query = new URLSearchParams({ page: String(page), limit: '20', ...(search ? { search } : {}) })
  const remote = useRemote(async () => (await apiRequest<Page<Row>>({ method: 'GET', path: `${path}?${query}` })).data, [path, page, search, refreshKey])
  const complete = async (id: string) => {
    await apiRequest({ method: 'PATCH', path: `/crm/activities/${id}/complete`, body: {}, idempotencyKey: mutationKey() })
    remote.reload()
  }
  return <section className="module-page">
    <div className="page-heading"><div><h1>{section.label}</h1><p>{remote.data?.total ?? 0} registros encontrados na API.</p></div><button className="gold-button" onClick={() => setCreating(true)}>+ Novo registro</button></div>
    {creating && <CreateDialog kind={section.id} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); remote.reload() }} />}
    <article className="panel resource-panel">
      <StatePanel loading={remote.loading} error={remote.error} onRetry={remote.reload} />
      {remote.data && <><DataTable rows={remote.data.items} kind={section.id === 'oportunidades' ? 'deals' : section.id === 'fluxo' ? 'activities' : 'accounts'} onComplete={section.id === 'fluxo' ? complete : undefined} /><div className="pagination"><button disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Anterior</button><span>Página {page} de {Math.max(remote.data.totalPages, 1)}</span><button disabled={page >= remote.data.totalPages} onClick={() => setPage((v) => v + 1)}>Próxima</button></div></>}
    </article>
  </section>
}

function CreateDialog({ kind, onClose, onCreated }: { kind: string; onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    let path = '/crm/accounts'; let body: Row = { name: values.name, email: values.email || undefined, phone: values.phone || undefined }
    if (kind === 'oportunidades') { path = '/crm/deals'; body = { title: values.name, valueCents: Math.round(Number(values.value || 0) * 100), status: 'OPEN' } }
    if (kind === 'fluxo') { path = '/crm/activities'; body = { title: values.name, type: 'TASK', status: 'PENDING', dueAt: values.dueAt ? new Date(String(values.dueAt)).toISOString() : undefined } }
    try { await apiRequest({ method: 'POST', path, body, idempotencyKey: mutationKey() }); onCreated() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao salvar'); setSaving(false) }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="dialog" onSubmit={submit}><div className="panel-heading"><h2>Novo registro</h2><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label>Nome / título<input name="name" required autoFocus /></label>{kind === 'leads' && <><label>E-mail<input name="email" type="email" /></label><label>Telefone<input name="phone" /></label></>}{kind === 'oportunidades' && <label>Valor (R$)<input name="value" type="number" min="0" step=".01" /></label>}{kind === 'fluxo' && <label>Prazo<input name="dueAt" type="datetime-local" /></label>}{error && <div className="form-error">{error}</div>}<button className="gold-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar na API'}</button></form></div>
}

export function LegacyReports({ refreshKey }: { refreshKey: number }) {
  const remote = useRemote(async () => (await apiRequest<Analytics>({ method: 'GET', path: '/analytics/dashboard' })).data, [refreshKey])
  if (!remote.data) return <StatePanel loading={remote.loading} error={remote.error} onRetry={remote.reload} />
  const blocks = [
    ['CRM', remote.data.crm[0] ?? {}], ['Imobiliário', remote.data.imobiliario[0] ?? {}],
    ['Vendas', remote.data.vendas[0] ?? {}], ['Tarefas', remote.data.tarefas[0] ?? {}],
  ] as const
  return <><div className="page-heading"><div><h1>Relatórios</h1><p>Indicadores consolidados em {new Date(remote.data.generatedAt).toLocaleString('pt-BR')}.</p></div><button className="period-button" onClick={remote.reload}><RefreshCw size={15} /> Atualizar</button></div><section className="report-grid">{blocks.map(([title, values]) => <article className="panel" key={title}><h2>{title}</h2><dl>{Object.entries(values).filter(([key]) => key !== 'empresaId').map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(value ?? 0)}</dd></div>)}</dl></article>)}</section></>
}

export function AnalyticsReports({ refreshKey }: { refreshKey: number }) {
  const remote = useRemote(async () => (await apiRequest<Analytics>({ method: 'GET', path: '/analytics/dashboard' })).data, [refreshKey])
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState('')
  if (!remote.data) return <StatePanel loading={remote.loading} error={remote.error} onRetry={remote.reload} />
  const report = remote.data
  const blocks = [
    ['CRM', report.crm[0] ?? {}], ['Imobiliário', report.imobiliario[0] ?? {}],
    ['Vendas', report.vendas[0] ?? {}], ['Tarefas', report.tarefas[0] ?? {}],
  ] as const
  const cleanEntries = (values: Row) => Object.entries(values).filter(([key]) => key !== 'empresaId')
  const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
  const printable = (value: unknown) => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? 0)
  const stamp = new Date().toISOString().slice(0, 10)

  const exportExcel = async () => {
    setExporting('excel'); setExportError('')
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      blocks.forEach(([title, values]) => {
        const rows = cleanEntries(values).map(([key, value]) => ({ Indicador: label(key), Resultado: printable(value) }))
        const sheet = XLSX.utils.json_to_sheet(rows)
        sheet['!cols'] = [{ wch: 32 }, { wch: 24 }]
        XLSX.utils.book_append_sheet(workbook, sheet, title.slice(0, 31))
      })
      XLSX.writeFile(workbook, `relatorio-reis-${stamp}.xlsx`, { compression: true })
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Não foi possível gerar o Excel.') }
    finally { setExporting(null) }
  }
  const exportPdf = async () => {
    setExporting('pdf'); setExportError('')
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      let y = 22
      const ensureSpace = (height: number) => { if (y + height > 282) { doc.addPage(); y = 20 } }
      doc.setFillColor(20, 20, 20); doc.rect(0, 0, pageWidth, 38, 'F')
      doc.setTextColor(218, 176, 37); doc.setFontSize(20); doc.text('REIS | Relatório de resultados', 16, 20)
      doc.setTextColor(210, 210, 210); doc.setFontSize(9); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 16, 29)
      y = 50
      blocks.forEach(([title, values]) => {
        ensureSpace(20)
        doc.setTextColor(20, 20, 20); doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 16, y); y += 8
        cleanEntries(values).forEach(([key, value], index) => {
          ensureSpace(10)
          if (index % 2 === 0) { doc.setFillColor(246, 243, 234); doc.rect(14, y - 5.5, pageWidth - 28, 8, 'F') }
          doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80); doc.text(label(key), 17, y)
          doc.setFont('helvetica', 'bold'); doc.setTextColor(25, 25, 25); doc.text(printable(value).slice(0, 55), pageWidth - 17, y, { align: 'right' }); y += 8
        })
        y += 8
      })
      const pages = doc.getNumberOfPages()
      for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(130); doc.text(`Página ${page} de ${pages}`, pageWidth - 16, 291, { align: 'right' }) }
      doc.save(`relatorio-reis-${stamp}.pdf`)
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Não foi possível gerar o PDF.') }
    finally { setExporting(null) }
  }
  return <>
    <div className="page-heading report-heading"><div><h1>Relatórios</h1><p>Indicadores consolidados em {new Date(report.generatedAt).toLocaleString('pt-BR')}.</p></div><div className="report-actions"><button className="outline-button excel-button" disabled={Boolean(exporting)} onClick={() => void exportExcel()}><FileSpreadsheet size={17} />{exporting === 'excel' ? 'Gerando Excel…' : 'Exportar Excel'}</button><button className="gold-button" disabled={Boolean(exporting)} onClick={() => void exportPdf()}><FileText size={17} />{exporting === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}</button><button className="period-button" onClick={remote.reload}><RefreshCw size={15} /> Atualizar</button></div></div>
    {exportError && <div className="inline-warning">{exportError}</div>}
    <section className="report-grid">{blocks.map(([title, values]) => <article className="panel" key={title}><h2>{title}</h2><dl>{cleanEntries(values).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{printable(value)}</dd></div>)}</dl></article>)}</section>
  </>
}

function Reports({ refreshKey }: { refreshKey: number }) {
  const remote = useRemote(async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1).toISOString()
    const end = new Date(now.getFullYear() + 1, 0, 1).toISOString()
    const [attendanceResult, scheduleResult, centralResult] = await Promise.all([
      apiRequest<AttendancePayload>({ method: 'GET', path: '/crm/atendimentos?limit=100' }),
      apiRequest<DayEvent[]>({ method: 'GET', path: `/calendar/events?${new URLSearchParams({ start, end })}` }),
      apiRequest<Central>({ method: 'GET', path: '/crm/central' }),
    ])
    const payload = attendanceResult.data
    return { attendances: Array.isArray(payload) ? payload : payload.items, schedules: scheduleResult.data, central: centralResult.data }
  }, [refreshKey])
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState('')
  if (!remote.data) return <StatePanel loading={remote.loading} error={remote.error} onRetry={remote.reload} />

  const { attendances, schedules, central } = remote.data
  const field = (item: DashboardAttendance, ...keys: string[]) => keys.map((key) => item[key]).find((value) => value !== undefined && value !== null)
  const relatedName = (item: DashboardAttendance, key: string) => {
    const value = item[key]
    return value && typeof value === 'object' && 'nome' in value ? String((value as { nome?: unknown }).nome ?? '—') : '—'
  }
  const amount = (item: DashboardAttendance) => {
    const value = field(item, 'valorNegociacao', 'valor', 'value')
    if (value && typeof value === 'object' && 'amount' in value) return Number((value as { amount: unknown }).amount) || 0
    return Number(value ?? 0) || 0
  }
  const normalize = (value?: string) => (value ?? 'aberto').toLocaleLowerCase('pt-BR')
  const finishedStatuses = ['concluido', 'concluído', 'finalizado', 'realizado', 'ganho', 'convertido']
  const lostStatuses = ['cancelado', 'perdido', 'nao_compareceu', 'não compareceu']
  const completed = attendances.filter((item) => finishedStatuses.includes(normalize(item.status)))
  const lost = attendances.filter((item) => lostStatuses.includes(normalize(item.status)))
  const open = Math.max(0, attendances.length - completed.length - lost.length)
  const totalValue = attendances.reduce((sum, item) => sum + amount(item), 0)
  const conversion = attendances.length ? Math.round(completed.length / attendances.length * 100) : 0
  const statusCounts = Object.entries(attendances.reduce<Record<string, number>>((acc, item) => { const key = item.status ?? 'Aberto'; acc[key] = (acc[key] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])
  const monthRows = Array.from({ length: 12 }, (_, month) => {
    const items = attendances.filter((item) => item.createdAt && new Date(item.createdAt).getFullYear() === new Date().getFullYear() && new Date(item.createdAt).getMonth() === month)
    return { month: new Date(new Date().getFullYear(), month, 1).toLocaleDateString('pt-BR', { month: 'long' }), count: items.length, completed: items.filter((item) => finishedStatuses.includes(normalize(item.status))).length, value: items.reduce((sum, item) => sum + amount(item), 0) }
  })
  const rows = attendances.slice().sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0)).map((item) => ({
    Data: item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '—',
    Cliente: item.cliente?.nome ?? relatedName(item, 'cliente'),
    Tipo: item.tipoAtendimento?.nome ?? relatedName(item, 'tipoAtendimento'),
    Responsável: relatedName(item, 'responsavel'),
    Empreendimento: relatedName(item, 'empreendimento'),
    Origem: relatedName(item, 'origem'),
    Status: item.status ?? 'aberto',
    Valor: amount(item),
    Observações: String(field(item, 'observacoes', 'descricao', 'notes') ?? ''),
  }))
  const moneyValue = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  const stamp = new Date().toISOString().slice(0, 10)
  const exportExcel = async () => {
    setExporting('excel'); setExportError('')
    try {
      const XLSX = await import('xlsx')
      const book = XLSX.utils.book_new()
      const summary = [
        { Indicador: 'Total de atendimentos', Resultado: attendances.length }, { Indicador: 'Concluídos', Resultado: completed.length },
        { Indicador: 'Em andamento', Resultado: open }, { Indicador: 'Cancelados / perdidos', Resultado: lost.length },
        { Indicador: 'Taxa de conversão', Resultado: `${conversion}%` }, { Indicador: 'Valor negociado', Resultado: totalValue },
        { Indicador: 'Agendamentos no ano', Resultado: schedules.length }, { Indicador: 'Negócios ganhos', Resultado: central.metrics.wonDeals },
      ]
      const summarySheet = XLSX.utils.json_to_sheet(summary); summarySheet['!cols'] = [{ wch: 30 }, { wch: 22 }]
      const detailSheet = XLSX.utils.json_to_sheet(rows); detailSheet['!cols'] = [12, 28, 24, 24, 28, 20, 18, 16, 48].map((wch) => ({ wch }))
      const monthSheet = XLSX.utils.json_to_sheet(monthRows.map((item) => ({ Mês: item.month, Atendimentos: item.count, Concluídos: item.completed, 'Valor negociado': item.value })))
      const statusSheet = XLSX.utils.json_to_sheet(statusCounts.map(([status, count]) => ({ Status: status, Atendimentos: count, Participação: `${attendances.length ? Math.round(count / attendances.length * 100) : 0}%` })))
      XLSX.utils.book_append_sheet(book, summarySheet, 'Resumo executivo'); XLSX.utils.book_append_sheet(book, detailSheet, 'Atendimentos'); XLSX.utils.book_append_sheet(book, monthSheet, 'Evolução mensal'); XLSX.utils.book_append_sheet(book, statusSheet, 'Status')
      XLSX.writeFile(book, `relatorio-atendimentos-reis-${stamp}.xlsx`, { compression: true })
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Não foi possível gerar o Excel.') } finally { setExporting(null) }
  }
  const exportPdf = async () => {
    setExporting('pdf'); setExportError('')
    try {
      const { jsPDF } = await import('jspdf'); const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const width = doc.internal.pageSize.getWidth(); let y = 18
      const page = () => { doc.addPage(); y = 18 }
      const space = (height: number) => { if (y + height > 282) page() }
      doc.setFillColor(17, 17, 17); doc.rect(0, 0, width, 42, 'F'); doc.setTextColor(226, 188, 67); doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.text('REIS | Relatório de Atendimentos', 15, 19); doc.setFontSize(9); doc.setTextColor(210); doc.setFont('helvetica', 'normal'); doc.text(`Análise profissional gerada em ${new Date().toLocaleString('pt-BR')}`, 15, 29); y = 53
      doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Resumo executivo', 15, y); y += 9
      const metrics = [['Atendimentos', attendances.length], ['Concluídos', completed.length], ['Em andamento', open], ['Conversão', `${conversion}%`], ['Valor negociado', moneyValue(totalValue)], ['Agendamentos', schedules.length]] as const
      metrics.forEach(([name, value], index) => { const x = 15 + (index % 2) * 91; if (index > 0 && index % 2 === 0) y += 20; doc.setFillColor(247, 244, 235); doc.roundedRect(x, y, 84, 15, 2, 2, 'F'); doc.setFontSize(8); doc.setTextColor(90); doc.setFont('helvetica', 'normal'); doc.text(String(name), x + 4, y + 5); doc.setFontSize(11); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.text(String(value), x + 4, y + 11) }); y += 28
      doc.setFontSize(14); doc.text('Distribuição por status', 15, y); y += 8
      statusCounts.forEach(([status, count]) => { space(8); doc.setFillColor(245, 242, 232); doc.rect(15, y - 5, 180, 7, 'F'); doc.setFontSize(9); doc.setTextColor(55); doc.setFont('helvetica', 'normal'); doc.text(status, 18, y); doc.setFont('helvetica', 'bold'); doc.text(`${count} (${attendances.length ? Math.round(count / attendances.length * 100) : 0}%)`, 191, y, { align: 'right' }); y += 8 }); y += 5
      space(18); doc.setFontSize(14); doc.setTextColor(20); doc.text('Detalhamento dos atendimentos', 15, y); y += 8
      rows.forEach((row, index) => { space(26); doc.setDrawColor(225); doc.line(15, y - 3, 195, y - 3); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(25); doc.text(`${index + 1}. ${row.Cliente}`.slice(0, 80), 15, y + 3); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80); doc.text(`${row.Data} | ${row.Tipo} | ${row.Status}`.slice(0, 105), 15, y + 9); doc.text(`Responsável: ${row.Responsável} | Empreendimento: ${row.Empreendimento}`.slice(0, 105), 15, y + 15); doc.setFont('helvetica', 'bold'); doc.text(moneyValue(row.Valor), 195, y + 3, { align: 'right' }); y += 24 })
      const pages = doc.getNumberOfPages(); for (let index = 1; index <= pages; index += 1) { doc.setPage(index); doc.setFontSize(8); doc.setTextColor(130); doc.text(`Página ${index} de ${pages}`, 194, 291, { align: 'right' }) }
      doc.save(`relatorio-atendimentos-reis-${stamp}.pdf`)
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Não foi possível gerar o PDF.') } finally { setExporting(null) }
  }

  return <><div className="page-heading report-heading"><div><h1>Relatório de atendimentos</h1><p>Análise detalhada da operação comercial, conversão e resultados gerados.</p></div><div className="report-actions"><button className="outline-button excel-button" disabled={Boolean(exporting)} onClick={() => void exportExcel()}><FileSpreadsheet size={17} />{exporting === 'excel' ? 'Gerando…' : 'Excel detalhado'}</button><button className="gold-button" disabled={Boolean(exporting)} onClick={() => void exportPdf()}><FileText size={17} />{exporting === 'pdf' ? 'Gerando…' : 'PDF completo'}</button><button className="period-button" onClick={remote.reload}><RefreshCw size={15} /> Atualizar</button></div></div>{exportError && <div className="inline-warning">{exportError}</div>}
    <section className="attendance-report-metrics"><article><span>Total de atendimentos</span><strong>{attendances.length}</strong><small>{open} em andamento</small></article><article><span>Taxa de conversão</span><strong>{conversion}%</strong><small>{completed.length} concluídos</small></article><article><span>Valor negociado</span><strong>{moneyValue(totalValue)}</strong><small>Gerado pelos atendimentos</small></article><article><span>Agendamentos</span><strong>{schedules.length}</strong><small>No ano corrente</small></article></section>
    <section className="report-detail-grid"><article className="panel"><div className="panel-heading"><h2>Evolução mensal</h2><span>Atendimentos / concluídos</span></div><div className="report-month-list">{monthRows.map((item) => <div key={item.month}><span>{item.month}</span><div><i style={{ width: `${attendances.length ? item.count / Math.max(...monthRows.map((row) => row.count), 1) * 100 : 0}%` }} /></div><strong>{item.count} / {item.completed}</strong></div>)}</div></article><article className="panel"><div className="panel-heading"><h2>Status dos atendimentos</h2><span>Distribuição atual</span></div><div className="report-status-list">{statusCounts.map(([status, count]) => <div key={status}><span>{status}</span><strong>{count}</strong><small>{attendances.length ? Math.round(count / attendances.length * 100) : 0}%</small></div>)}</div></article></section>
    <article className="panel attendance-report-table"><div className="panel-heading"><div><h2>Detalhamento profissional</h2><span>Cliente, atendimento, responsável, empreendimento e resultado</span></div><span>{rows.length} registros</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Data / Cliente</th><th>Tipo / Responsável</th><th>Empreendimento</th><th>Status</th><th>Valor</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.Cliente}-${index}`}><td><strong>{row.Cliente}</strong><small>{row.Data}</small></td><td><strong>{row.Tipo}</strong><small>{row.Responsável}</small></td><td>{row.Empreendimento}</td><td><span className="status-chip">{row.Status}</span></td><td><strong>{moneyValue(row.Valor)}</strong></td></tr>)}</tbody></table>{!rows.length && <div className="empty">Nenhum atendimento encontrado.</div>}</div></article>
  </>
}

function Login({ onLogin }: { onLogin: (session: PublicSession) => void }) {
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const health = useRemote(async () => (await apiHealth()).data, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError('')
    const form = new FormData(event.currentTarget)
    try { onLogin(await authApi.login({ email: String(form.get('email')), password: String(form.get('password')) })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível entrar'); setLoading(false) }
  }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><Brand /><div><h1>Acesse sua operação</h1><p>Use sua conta REIS para carregar os dados da empresa.</p></div><div className={`connection-status ${health.data ? 'online' : health.error ? 'offline' : ''}`}><i />{health.data ? 'API REIS conectada' : health.error ? health.error : 'Verificando conexão…'}{health.error && <button type="button" onClick={health.reload}>Testar novamente</button>}</div><label>E-mail<input name="email" type="email" required autoFocus /></label><label>Senha<input name="password" type="password" required /></label>{error && <div className="form-error">{error}</div>}<button className="gold-button" disabled={loading || Boolean(health.error)}>{loading ? 'Conectando…' : 'Entrar'}</button></form></main>
}

function App() {
  const [session, setSession] = useState<PublicSession | null | undefined>(undefined)
  const [activeId, setActiveId] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => { authApi.session().then(setSession).catch(() => setSession(null)) }, [])
  useEffect(() => {
    const expire = () => setSession(null)
    const focus = () => setRefreshKey((value) => value + 1)
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
      window.removeEventListener('focus', focus)
    }
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => window.reisDesktop?.deepLinks.subscribe((path) => {
    if (path.startsWith('/crm/deals/')) setActiveId('oportunidades')
    else if (path.startsWith('/calendar/')) setActiveId('agenda')
    else if (path.startsWith('/preferencias')) setActiveId('configuracoes')
  }), [])
  const activeSection = useMemo(() => sections.find((item) => item.id === activeId) ?? sections[0], [activeId])
  if (session === undefined) return <div className="boot-screen"><RefreshCw className="spin" /></div>
  if (!session) return <Login onLogin={setSession} />
  const userName = session.user.name ?? session.user.email
  const navigate = (id: string) => { setActiveId(id); setSidebarOpen(false) }
  const logout = async () => { await authApi.logout(); setSession(null) }
  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}><div className="sidebar-top"><Brand /><button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X /></button></div><button type="button" className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>{sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button><nav>{sections.map(({ id, label, icon: Icon }) => <button className={activeId === id ? 'active' : ''} key={id} onClick={() => navigate(id)} title={sidebarCollapsed ? label : undefined}><Icon size={20} /><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button onClick={() => navigate('configuracoes')} title={sidebarCollapsed ? 'Configurações' : undefined}><Settings size={20} /><span>Configurações</span></button><div className="user-mini" title={sidebarCollapsed ? userName : undefined}><div className="avatar">{initials(userName)}</div><div><strong>{userName}</strong><span>{session.user.role ?? 'Usuário'}</span></div></div></div></aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <div className="workspace"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu /></button><label className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && activeId === 'dashboard') navigate('atendimentos') }} placeholder="Buscar no módulo atual…" />{query && <button onClick={() => setQuery('')}><X size={16} /></button>}</label><div className="top-actions"><TopbarNotifications refreshKey={refreshKey} onOpenAgenda={() => navigate('agenda')} /><button className="profile-button" onClick={() => navigate('configuracoes')}>{initials(userName)}</button></div></header>
      <main>{activeId === 'dashboard' ? <Dashboard refreshKey={refreshKey} onNavigate={navigate} /> : activeId === 'agenda' ? <CalendarPage refreshKey={refreshKey} /> : activeId === 'atendimentos' ? <AttendancesPage session={session} refreshKey={refreshKey} search={search} onNavigate={navigate} /> : activeId === 'clientes' ? <ClientsPage search={search} refreshKey={refreshKey} /> : activeId === 'oportunidades' ? <OpportunitiesPage search={search} refreshKey={refreshKey} onNavigate={navigate} /> : activeId === 'campanhas' ? <CampaignsPage session={session} /> : endpoints[activeId] ? <ResourcePage section={activeSection} search={search} refreshKey={refreshKey} /> : activeId === 'relatorios' ? <Reports refreshKey={refreshKey} /> : <SettingsPage session={session} onSessionChange={setSession} onLogout={logout} />}</main>
    </div>
  </div>
}

export default App
