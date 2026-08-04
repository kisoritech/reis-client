import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  BarChart3, Bell, CheckCircle2, ChevronLeft, CircleDollarSign, GitBranch,
  CalendarDays, ClipboardList, LayoutDashboard, Menu, RefreshCw, Search, Settings, Target,
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
import LeadsPage from './Leads'
import OperationalFlow from './OperationalFlow'
import CalendarPage from './Calendar'
import AttendancesPage from './Attendances'
import OpportunitiesPage from './Opportunities'
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

const sections: Section[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'atendimentos', label: 'Atendimentos', icon: ClipboardList },
  { id: 'leads', label: 'Leads', icon: UsersRound },
  { id: 'oportunidades', label: 'Oportunidades', icon: Target },
  { id: 'fluxo', label: 'Fluxo Operacional', icon: GitBranch },
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

function StatePanel({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <div className="state-panel"><RefreshCw className="spin" /><span>Buscando dados da API…</span></div>
  if (error) return <div className="state-panel error"><strong>Não foi possível carregar</strong><span>{error}</span><button onClick={onRetry}>Tentar novamente</button></div>
  return null
}

function Dashboard({ refreshKey }: { refreshKey: number }) {
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

function Reports({ refreshKey }: { refreshKey: number }) {
  const remote = useRemote(async () => (await apiRequest<Analytics>({ method: 'GET', path: '/analytics/dashboard' })).data, [refreshKey])
  if (!remote.data) return <StatePanel loading={remote.loading} error={remote.error} onRetry={remote.reload} />
  const blocks = [
    ['CRM', remote.data.crm[0] ?? {}], ['Imobiliário', remote.data.imobiliario[0] ?? {}],
    ['Vendas', remote.data.vendas[0] ?? {}], ['Tarefas', remote.data.tarefas[0] ?? {}],
  ] as const
  return <><div className="page-heading"><div><h1>Relatórios</h1><p>Indicadores consolidados em {new Date(remote.data.generatedAt).toLocaleString('pt-BR')}.</p></div><button className="period-button" onClick={remote.reload}><RefreshCw size={15} /> Atualizar</button></div><section className="report-grid">{blocks.map(([title, values]) => <article className="panel" key={title}><h2>{title}</h2><dl>{Object.entries(values).filter(([key]) => key !== 'empresaId').map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(value ?? 0)}</dd></div>)}</dl></article>)}</section></>
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
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}><div className="sidebar-top"><Brand /><button className="close-sidebar" onClick={() => setSidebarOpen(false)}><X /></button></div><button className="collapse-button"><ChevronLeft size={18} /></button><nav>{sections.map(({ id, label, icon: Icon }) => <button className={activeId === id ? 'active' : ''} key={id} onClick={() => navigate(id)}><Icon size={20} /><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><button onClick={() => navigate('configuracoes')}><Settings size={20} /><span>Configurações</span></button><div className="user-mini"><div className="avatar">{initials(userName)}</div><div><strong>{userName}</strong><span>{session.user.role ?? 'Usuário'}</span></div></div></div></aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <div className="workspace"><header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu /></button><label className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && activeId === 'dashboard') navigate('leads') }} placeholder="Buscar no módulo atual…" />{query && <button onClick={() => setQuery('')}><X size={16} /></button>}</label><div className="top-actions"><button className="notification" onClick={() => navigate('fluxo')}><Bell size={19} /></button><button className="profile-button" onClick={() => navigate('configuracoes')}>{initials(userName)}</button></div></header>
      <main>{activeId === 'dashboard' ? <Dashboard refreshKey={refreshKey} /> : activeId === 'agenda' ? <CalendarPage refreshKey={refreshKey} /> : activeId === 'atendimentos' ? <AttendancesPage session={session} refreshKey={refreshKey} /> : activeId === 'leads' ? <LeadsPage search={search} refreshKey={refreshKey} /> : activeId === 'oportunidades' ? <OpportunitiesPage search={search} refreshKey={refreshKey} /> : activeId === 'fluxo' ? <OperationalFlow refreshKey={refreshKey} onNavigate={navigate} /> : endpoints[activeId] ? <ResourcePage section={activeSection} search={search} refreshKey={refreshKey} /> : activeId === 'relatorios' ? <Reports refreshKey={refreshKey} /> : <SettingsPage session={session} onSessionChange={setSession} onLogout={logout} />}</main>
    </div>
  </div>
}

export default App
