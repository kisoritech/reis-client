import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Filter, Plus, RefreshCw, X } from 'lucide-react'
import { apiRequest, mutationKey } from './api'

type LeadRow = Record<string, unknown> & {
  id?: string
  nome?: string
  name?: string
  email?: string
  telefone?: string
  phone?: string
  observacoes?: string
  segment?: string
  status?: string | { nome?: string; name?: string }
  etapa?: string
  score?: number
  valorPotencial?: number
  potentialValue?: number
  updatedAt?: string
  createdAt?: string
  _count?: { leads?: number; contatos?: number; oportunidades?: number }
}

type LeadPageData = {
  items: LeadRow[]
  page: number
  total: number
  totalPages: number
}

const stages = ['Todos', 'Novo', 'Nutrição', 'Oportunidade', 'Follow-up', 'Fechado']

function leadName(row: LeadRow) {
  return String(row.nome ?? row.name ?? 'Contato sem nome')
}

function stageName(row: LeadRow) {
  if (typeof row.status === 'string') return row.status
  if (row.status && typeof row.status === 'object') {
    return String(row.status.nome ?? row.status.name ?? 'Sem etapa')
  }
  return String(row.etapa ?? 'Sem etapa')
}

function formatDate(value: unknown) {
  if (!value) return 'Não informado'
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? 'Não informado' : parsed.toLocaleDateString('pt-BR')
}

function formatPotential(row: LeadRow) {
  const raw = row.valorPotencial ?? row.potentialValue
  if (raw === undefined || raw === null) return 'Não informado'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(raw))
}

function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export default function LeadsPage({ search, refreshKey }: { search: string; refreshKey: number }) {
  const [data, setData] = useState<LeadPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [stage, setStage] = useState('Todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ page: String(page), limit: '20', ...(search ? { search } : {}) })
    apiRequest<LeadPageData>({ method: 'GET', path: `/crm/accounts?${query}` })
      .then((result) => current && setData(result.data))
      .catch((reason: unknown) => current && setError(reason instanceof Error ? reason.message : 'Falha ao carregar leads'))
      .finally(() => current && setLoading(false))
    return () => { current = false }
  }, [page, search, refreshKey, version])

  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [search])

  const visible = useMemo(() => {
    const rows = data?.items ?? []
    return rows.filter((row) => {
      const matchesStage = stage === 'Todos' || stageName(row).toLocaleLowerCase('pt-BR') === stage.toLocaleLowerCase('pt-BR')
      const timestamp = row.updatedAt ?? row.createdAt
      const matchesDate = !fromDate || (timestamp && new Date(String(timestamp)).getTime() >= new Date(`${fromDate}T00:00:00`).getTime())
      return matchesStage && Boolean(matchesDate)
    })
  }, [data, fromDate, stage])

  const allSelected = visible.length > 0 && visible.every((row) => row.id && selected.has(row.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(visible.flatMap((row) => row.id ? [row.id] : [])))
  }
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const exportRows = () => {
    const rows = selected.size ? visible.filter((row) => row.id && selected.has(row.id)) : visible
    const csv = [
      ['Nome', 'E-mail', 'Telefone', 'Segmento/Empresa', 'Etapa', 'Último contato', 'Valor potencial', 'Score'].map(escapeCsv).join(';'),
      ...rows.map((row) => [
        leadName(row), row.email, row.telefone ?? row.phone, row.observacoes ?? row.segment,
        stageName(row), formatDate(row.updatedAt ?? row.createdAt), formatPotential(row),
        row.score ?? 'Não informado',
      ].map(escapeCsv).join(';')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `leads-reis-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <section className="leads-page">
    <div className="page-heading"><div><h1>Leads</h1><p>{data?.total ?? 0} contatos encontrados</p></div><button className="gold-button lead-create" onClick={() => setCreating(true)}><Plus size={18} /> Novo lead</button></div>
    {creating && <NewLeadDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setVersion((value) => value + 1) }} />}
    <article className="panel leads-panel">
      <div className="lead-toolbar">
        <div className="lead-stages" role="tablist" aria-label="Etapas dos leads">{stages.map((item) => <button type="button" role="tab" aria-selected={stage === item} className={stage === item ? 'active' : ''} key={item} onClick={() => setStage(item)}>{item}</button>)}</div>
        <div className="lead-actions"><button type="button" className={filterOpen || fromDate ? 'active' : ''} onClick={() => setFilterOpen((value) => !value)}><Filter size={16} /> Filtrar</button><button type="button" onClick={exportRows} disabled={!visible.length}><Download size={16} /> Exportar</button></div>
      </div>
      {filterOpen && <div className="lead-filters"><label>Contato atualizado a partir de<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><button type="button" onClick={() => setFromDate('')}>Limpar filtro</button></div>}
      {selected.size > 0 && <div className="selection-bar"><strong>{selected.size} selecionado(s)</strong><button type="button" onClick={() => setSelected(new Set())}><X size={15} /> Limpar seleção</button></div>}
      {loading && <div className="state-panel"><RefreshCw className="spin" /><span>Buscando leads na API…</span></div>}
      {error && <div className="state-panel error"><strong>Não foi possível carregar</strong><span>{error}</span><button onClick={() => setVersion((value) => value + 1)}>Tentar novamente</button></div>}
      {!loading && !error && <div className="lead-table-scroll"><table className="lead-table"><thead><tr><th className="check-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" /></th><th>Nome</th><th>Empresa / segmento</th><th>Status</th><th>Data de contato</th><th>Valor potencial</th><th>Score</th></tr></thead><tbody>
        {visible.map((row, index) => {
          const id = String(row.id ?? index)
          const score = row.score
          return <tr key={id} className={selected.has(id) ? 'selected' : ''}><td className="check-cell"><input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Selecionar ${leadName(row)}`} /></td><td><div className="lead-person"><i>{initials(leadName(row))}</i><div><strong>{leadName(row)}</strong><small>{row.email ? String(row.email) : row.telefone ? String(row.telefone) : 'Sem contato informado'}</small></div></div></td><td>{String(row.observacoes ?? row.segment ?? 'Não informado')}</td><td><span className={`lead-status status-${stageName(row).toLowerCase().replaceAll(' ', '-')}`}>{stageName(row)}</span></td><td>{formatDate(row.updatedAt ?? row.createdAt)}</td><td className="potential">{formatPotential(row)}</td><td><div className="score-cell"><span>{score ?? '—'}</span><i><b style={{ width: score === undefined ? '0%' : `${Math.max(0, Math.min(100, Number(score)))}%` }} /></i></div></td></tr>
        })}
      </tbody></table>{!visible.length && <div className="empty">Nenhum lead corresponde aos filtros selecionados.</div>}</div>}
      {data && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {Math.max(data.totalPages, 1)}</span><button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>}
    </article>
  </section>
}

function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const body = {
      name: String(values.get('name') ?? ''),
      email: String(values.get('email') ?? '') || undefined,
      phone: String(values.get('phone') ?? '') || undefined,
      document: String(values.get('document') ?? '') || undefined,
      segment: String(values.get('segment') ?? '') || undefined,
      website: String(values.get('website') ?? '') || undefined,
    }
    try {
      await apiRequest({ method: 'POST', path: '/crm/accounts', body, idempotencyKey: mutationKey() })
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o lead')
      setSaving(false)
    }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="dialog lead-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Novo lead</h2><p>Cadastre o contato comercial na API REIS.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="dialog-fields"><label>Nome completo<input name="name" required autoFocus /></label><label>E-mail<input name="email" type="email" /></label><label>Telefone<input name="phone" /></label><label>CPF/CNPJ<input name="document" /></label><label>Empresa / segmento<input name="segment" /></label><label>Website<input name="website" type="url" /></label></div>{error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar lead'}</button></div></form></div>
}
