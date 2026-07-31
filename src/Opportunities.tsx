import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, Flame,
  Plus, RefreshCw, Target, TrendingUp, UserRound, X,
} from 'lucide-react'
import { apiRequest, mutationKey } from './api'

type Page<T> = { items: T[]; page: number; limit?: number; total: number; totalPages: number }
type Account = { id: string; nome?: string; name?: string; email?: string; telefone?: string }
type User = { id: string; nome?: string; name?: string; email?: string; ativo?: boolean }
type Deal = {
  id: string
  titulo?: string
  valor?: number | string
  status?: string
  observacoes?: string
  probabilidade?: number
  dataFechamentoEsperada?: string
  proximaAcao?: string
  dataProximaAcao?: string
  temperatura?: string
  motivoStatus?: string
  createdAt?: string
  updatedAt?: string
  lead?: { cliente?: Account }
  pipelineStage?: { id: string; nome: string }
  responsavel?: User
}

const statuses = [
  { id: 'ALL', label: 'Todas' },
  { id: 'OPEN', label: 'Em aberto' },
  { id: 'WON', label: 'Ganhas' },
  { id: 'LOST', label: 'Perdidas' },
] as const

function brl(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0))
}

function shortDate(value?: string) {
  if (!value) return 'Não definida'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Não definida' : parsed.toLocaleDateString('pt-BR')
}

function statusLabel(value?: string) {
  if (value === 'ganha') return 'Ganha'
  if (value === 'perdida') return 'Perdida'
  if (value === 'cancelada') return 'Cancelada'
  return 'Em aberto'
}

function accountName(deal: Deal) {
  return deal.lead?.cliente?.nome ?? deal.lead?.cliente?.name ?? 'Cliente não vinculado'
}

export default function OpportunitiesPage({ search, refreshKey }: { search: string; refreshKey: number }) {
  const [data, setData] = useState<Page<Deal> | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [status, setStatus] = useState<(typeof statuses)[number]['id']>('ALL')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Deal | null>(null)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    const query = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...(search ? { search } : {}),
      ...(status !== 'ALL' ? { status } : {}),
    })
    Promise.allSettled([
      apiRequest<Page<Deal>>({ method: 'GET', path: `/crm/deals?${query}` }),
      apiRequest<Page<Account>>({ method: 'GET', path: '/crm/accounts?page=1&limit=100' }),
      apiRequest<User[]>({ method: 'GET', path: '/organizacao/usuarios' }),
    ]).then(([dealsResult, accountsResult, usersResult]) => {
      if (!current) return
      if (dealsResult.status === 'fulfilled') setData(dealsResult.value.data)
      else setError(dealsResult.reason instanceof Error ? dealsResult.reason.message : 'Falha ao carregar oportunidades')
      if (accountsResult.status === 'fulfilled') setAccounts(accountsResult.value.data.items)
      if (usersResult.status === 'fulfilled') setUsers(usersResult.value.data.filter((user) => user.ativo !== false))
    }).finally(() => current && setLoading(false))
    return () => { current = false }
  }, [page, refreshKey, search, status, version])

  useEffect(() => { setPage(1) }, [search, status])

  const metrics = useMemo(() => {
    const items = data?.items ?? []
    const open = items.filter((deal) => !['ganha', 'perdida', 'cancelada'].includes(deal.status ?? 'aberta'))
    const pipeline = open.reduce((sum, deal) => sum + Number(deal.valor ?? 0), 0)
    const weighted = open.reduce((sum, deal) => sum + Number(deal.valor ?? 0) * Number(deal.probabilidade ?? 0) / 100, 0)
    const won = items.filter((deal) => deal.status === 'ganha').reduce((sum, deal) => sum + Number(deal.valor ?? 0), 0)
    return { pipeline, weighted, won, open: open.length }
  }, [data])

  const reload = () => setVersion((value) => value + 1)
  const openDeal = async (id: string) => {
    setError('')
    try {
      const result = await apiRequest<Deal>({ method: 'GET', path: `/crm/deals/${id}` })
      setSelected(result.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a oportunidade')
    }
  }
  return <section className="opportunities-page">
    <div className="page-heading"><div><h1>Oportunidades</h1><p>Conduza cada negociação do interesse ao fechamento.</p></div><button className="gold-button" onClick={() => setCreating(true)}><Plus size={18} /> Nova oportunidade</button></div>
    <section className="opportunity-metrics">
      <article><CircleDollarSign /><span>Pipeline aberto</span><strong>{brl(metrics.pipeline)}</strong><small>{metrics.open} negociações nesta página</small></article>
      <article><TrendingUp /><span>Receita ponderada</span><strong>{brl(metrics.weighted)}</strong><small>Valor × probabilidade</small></article>
      <article><CheckCircle2 /><span>Ganhos</span><strong>{brl(metrics.won)}</strong><small>Fechamentos exibidos</small></article>
      <article><Target /><span>Total encontrado</span><strong>{data?.total ?? 0}</strong><small>Conforme os filtros atuais</small></article>
    </section>
    <article className="panel opportunities-panel">
      <div className="opportunity-toolbar"><div className="opportunity-status-tabs">{statuses.map((item) => <button type="button" key={item.id} className={status === item.id ? 'active' : ''} onClick={() => setStatus(item.id)}>{item.label}</button>)}</div><button type="button" onClick={reload}><RefreshCw size={16} /> Atualizar</button></div>
      {loading && <div className="state-panel"><RefreshCw className="spin" /><span>Consultando pipeline…</span></div>}
      {error && <div className="state-panel error"><strong>Não foi possível carregar</strong><span>{error}</span><button onClick={reload}>Tentar novamente</button></div>}
      {!loading && !error && <div className="table-scroll"><table className="data-table opportunity-table"><thead><tr><th>Oportunidade</th><th>Cliente</th><th>Etapa</th><th>Valor</th><th>Probabilidade</th><th>Próxima ação</th><th>Previsão</th><th>Status</th></tr></thead><tbody>
        {(data?.items ?? []).map((deal) => <tr key={deal.id} onClick={() => void openDeal(deal.id)}><td><strong>{deal.titulo ?? 'Sem título'}</strong><small>{deal.temperatura ? `Temperatura: ${deal.temperatura}` : 'Sem temperatura'}</small></td><td>{accountName(deal)}</td><td>{deal.pipelineStage?.nome ?? 'Não classificada'}</td><td className="potential">{brl(deal.valor)}</td><td><div className="opportunity-probability"><span>{deal.probabilidade ?? 0}%</span><i><b style={{ width: `${Math.max(0, Math.min(100, deal.probabilidade ?? 0))}%` }} /></i></div></td><td>{deal.proximaAcao ?? 'Definir próximo passo'}</td><td>{shortDate(deal.dataFechamentoEsperada)}</td><td><span className={`status-chip deal-${deal.status ?? 'aberta'}`}>{statusLabel(deal.status)}</span></td></tr>)}
      </tbody></table>{!data?.items.length && <div className="empty">Nenhuma oportunidade corresponde aos filtros.</div>}</div>}
      {data && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {Math.max(data.totalPages, 1)}</span><button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>}
    </article>
    {creating && <OpportunityDialog accounts={accounts} users={users} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload() }} />}
    {selected && <OpportunityDetails deal={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload() }} />}
  </section>
}

function OpportunityDialog({ accounts, users, onClose, onCreated }: { accounts: Account[]; users: User[]; onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const amount = Number(values.get('value') ?? 0)
    try {
      await apiRequest({
        method: 'POST',
        path: '/crm/deals',
        idempotencyKey: mutationKey(),
        body: {
          title: String(values.get('title') ?? ''),
          accountId: String(values.get('accountId') ?? '') || undefined,
          ownerId: String(values.get('ownerId') ?? '') || undefined,
          description: String(values.get('description') ?? '') || undefined,
          status: 'OPEN',
          valueCents: Math.round(amount * 100),
          currency: 'BRL',
          probability: Number(values.get('probability') ?? 0),
          expectedCloseAt: values.get('expectedCloseAt') ? new Date(`${values.get('expectedCloseAt')}T12:00:00`).toISOString() : undefined,
          nextAction: String(values.get('nextAction') ?? '') || undefined,
          nextActionAt: values.get('nextActionAt') ? new Date(String(values.get('nextActionAt'))).toISOString() : undefined,
          temperature: String(values.get('temperature') ?? '') || undefined,
        },
      })
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a oportunidade')
      setSaving(false)
    }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="dialog opportunity-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Nova oportunidade</h2><p>Estruture a negociação e defina o próximo movimento.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="dialog-fields">
    <label className="full-field">Título da negociação<input name="title" required autoFocus placeholder="Ex.: Apartamento Florais para família Silva" /></label>
    <label>Cliente<select name="accountId" required defaultValue=""><option value="">Selecione…</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.nome ?? account.name}</option>)}</select></label>
    <label>Responsável<select name="ownerId" defaultValue=""><option value="">Responsável atual</option>{users.map((user) => <option value={user.id} key={user.id}>{user.nome ?? user.name ?? user.email}</option>)}</select></label>
    <label>Valor estimado (R$)<input name="value" type="number" min="0" step=".01" required /></label>
    <label>Probabilidade<input name="probability" type="number" min="0" max="100" defaultValue="20" /></label>
    <label>Temperatura<select name="temperature" defaultValue="morna"><option value="fria">Fria</option><option value="morna">Morna</option><option value="quente">Quente</option></select></label>
    <label>Previsão de fechamento<input name="expectedCloseAt" type="date" /></label>
    <label>Próxima ação<input name="nextAction" placeholder="Enviar proposta, agendar visita…" /></label>
    <label>Data da próxima ação<input name="nextActionAt" type="datetime-local" /></label>
    <label className="full-field">Contexto da negociação<textarea name="description" rows={4} /></label>
  </div>{error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}>{saving ? 'Criando…' : 'Criar oportunidade'}</button></div></form></div>
}

function OpportunityDetails({ deal, onClose, onChanged }: { deal: Deal; onClose: () => void; onChanged: () => void }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState({
    probability: String(deal.probabilidade ?? 0),
    temperature: deal.temperatura ?? '',
    nextAction: deal.proximaAcao ?? '',
    nextActionAt: deal.dataProximaAcao ? new Date(deal.dataProximaAcao).toISOString().slice(0, 16) : '',
    expectedCloseAt: deal.dataFechamentoEsperada ? new Date(deal.dataFechamentoEsperada).toISOString().slice(0, 10) : '',
  })
  const updateStatus = async (status: 'OPEN' | 'WON' | 'LOST') => {
    setWorking(true)
    setError('')
    try {
      await apiRequest({ method: 'PATCH', path: `/crm/deals/${deal.id}/status`, body: { status }, idempotencyKey: mutationKey() })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao atualizar status')
      setWorking(false)
    }
  }
  const createFollowUp = async () => {
    setWorking(true)
    setError('')
    try {
      await apiRequest({
        method: 'POST',
        path: '/crm/activities',
        idempotencyKey: mutationKey(),
        body: {
          type: 'TASK',
          title: deal.proximaAcao ?? `Follow-up — ${deal.titulo ?? 'oportunidade'}`,
          dealId: deal.id,
          status: 'PENDING',
          dueAt: deal.dataProximaAcao,
          origin: 'oportunidades',
        },
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar follow-up')
      setWorking(false)
    }
  }
  const savePlan = async () => {
    setWorking(true)
    setError('')
    try {
      await apiRequest({
        method: 'PATCH',
        path: `/crm/deals/${deal.id}`,
        idempotencyKey: mutationKey(),
        body: {
          probability: Number(plan.probability),
          temperature: plan.temperature || undefined,
          nextAction: plan.nextAction || undefined,
          nextActionAt: plan.nextActionAt ? new Date(plan.nextActionAt).toISOString() : undefined,
          expectedCloseAt: plan.expectedCloseAt ? new Date(`${plan.expectedCloseAt}T12:00:00`).toISOString() : undefined,
        },
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao atualizar o plano comercial')
      setWorking(false)
    }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="dialog opportunity-details"><div className="panel-heading"><div><span className={`status-chip deal-${deal.status ?? 'aberta'}`}>{statusLabel(deal.status)}</span><h2>{deal.titulo ?? 'Oportunidade'}</h2><p>{accountName(deal)}</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
    <section className="opportunity-detail-value"><CircleDollarSign /><div><span>Valor estimado</span><strong>{brl(deal.valor)}</strong></div><div><span>Receita ponderada</span><strong>{brl(Number(deal.valor ?? 0) * Number(deal.probabilidade ?? 0) / 100)}</strong></div></section>
    <dl className="opportunity-detail-grid"><div><dt><Target /> Etapa</dt><dd>{deal.pipelineStage?.nome ?? 'Não classificada'}</dd></div><div><dt><TrendingUp /> Probabilidade</dt><dd>{deal.probabilidade ?? 0}%</dd></div><div><dt><Flame /> Temperatura</dt><dd>{deal.temperatura ?? 'Não definida'}</dd></div><div><dt><CalendarClock /> Fechamento previsto</dt><dd>{shortDate(deal.dataFechamentoEsperada)}</dd></div><div><dt><ArrowRight /> Próxima ação</dt><dd>{deal.proximaAcao ?? 'Não definida'}</dd></div><div><dt><UserRound /> Responsável</dt><dd>{deal.responsavel?.nome ?? deal.responsavel?.name ?? 'Não informado'}</dd></div></dl>
    <div className="opportunity-plan-editor"><label>Probabilidade<input type="number" min="0" max="100" value={plan.probability} onChange={(event) => setPlan((current) => ({ ...current, probability: event.target.value }))} /></label><label>Temperatura<select value={plan.temperature} onChange={(event) => setPlan((current) => ({ ...current, temperature: event.target.value }))}><option value="">Não definida</option><option value="fria">Fria</option><option value="morna">Morna</option><option value="quente">Quente</option></select></label><label>Fechamento<input type="date" value={plan.expectedCloseAt} onChange={(event) => setPlan((current) => ({ ...current, expectedCloseAt: event.target.value }))} /></label><label className="full-field">Próxima ação<input value={plan.nextAction} onChange={(event) => setPlan((current) => ({ ...current, nextAction: event.target.value }))} /></label><label>Quando<input type="datetime-local" value={plan.nextActionAt} onChange={(event) => setPlan((current) => ({ ...current, nextActionAt: event.target.value }))} /></label><button type="button" className="outline-button" disabled={working} onClick={() => void savePlan()}>Salvar plano</button></div>
    {deal.observacoes && <div className="review-notes"><strong>Contexto</strong><p>{deal.observacoes}</p></div>}
    {error && <div className="form-error">{error}</div>}
    <div className="opportunity-detail-actions"><button type="button" className="outline-button" disabled={working} onClick={createFollowUp}>Criar follow-up</button>{deal.status !== 'ganha' && <button type="button" className="outline-button success-action" disabled={working} onClick={() => updateStatus('WON')}>Marcar como ganha</button>}{deal.status !== 'perdida' && <button type="button" className="outline-button danger-action" disabled={working} onClick={() => updateStatus('LOST')}>Marcar como perdida</button>}<button type="button" className="gold-button" disabled={working} onClick={onClose}>Fechar</button></div>
  </div></div>
}
