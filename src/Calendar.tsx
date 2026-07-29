import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, List, MapPin,
  Plus, RefreshCw, X,
} from 'lucide-react'
import { apiRequest, mutationKey } from './api'

type CalendarEvent = {
  id: string
  titulo: string
  tipo?: string
  descricao?: string
  inicio: string
  fim: string
  local?: string
  status?: string
  diaInteiro?: boolean
  googleSyncEnabled?: boolean
  responsavelId?: string
}

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const eventTypes = ['reuniao', 'visita', 'retorno', 'tarefa', 'outro']
const statuses = ['agendado', 'confirmado', 'realizado', 'cancelado', 'nao_compareceu', 'reagendado']

function startOfGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  first.setDate(first.getDate() - first.getDay())
  first.setHours(0, 0, 0, 0)
  return first
}

function endOfGrid(month: Date) {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  last.setDate(last.getDate() + (6 - last.getDay()))
  last.setHours(23, 59, 59, 999)
  return last
}

function dateKey(value: string | Date) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    agendado: 'Agendado', confirmado: 'Confirmado', realizado: 'Realizado',
    cancelado: 'Cancelado', nao_compareceu: 'Não compareceu', reagendado: 'Reagendado',
  }
  return labels[value ?? ''] ?? value ?? 'Agendado'
}

export default function CalendarPage({ refreshKey }: { refreshKey: number }) {
  const [month, setMonth] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [view, setView] = useState<'month' | 'list'>('month')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const rangeStart = startOfGrid(month)
  const rangeEnd = endOfGrid(month)
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() })
    apiRequest<CalendarEvent[]>({ method: 'GET', path: `/calendar/events?${query}` })
      .then((result) => current && setEvents(result.data))
      .catch((reason: unknown) => current && setError(reason instanceof Error ? reason.message : 'Falha ao carregar agenda'))
      .finally(() => current && setLoading(false))
    return () => { current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.getFullYear(), month.getMonth(), refreshKey, version])

  const filtered = useMemo(() => events.filter((event) =>
    (typeFilter === 'todos' || event.tipo === typeFilter) &&
    (statusFilter === 'todos' || event.status === statusFilter),
  ), [events, statusFilter, typeFilter])
  const byDay = useMemo(() => filtered.reduce<Record<string, CalendarEvent[]>>((result, event) => {
    const key = dateKey(event.inicio)
    result[key] = [...(result[key] ?? []), event]
    return result
  }, {}), [filtered])
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const day = new Date(rangeStart)
    day.setDate(day.getDate() + index)
    return day
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [month.getFullYear(), month.getMonth()])
  const selectedDayEvents = byDay[selectedDate] ?? []

  const changeMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  }
  const today = () => {
    const current = new Date()
    setMonth(current)
    setSelectedDate(dateKey(current))
  }

  return <section className="calendar-page">
    <div className="page-heading"><div><h1>Agenda</h1><p>Registre compromissos e acompanhe o cronograma operacional.</p></div><button className="gold-button calendar-create" onClick={() => setCreating(true)}><Plus size={18} /> Novo agendamento</button></div>
    {creating && <NewEventDialog initialDate={selectedDate} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setVersion((value) => value + 1) }} />}
    {selectedEvent && <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    <article className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="calendar-period"><button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft /></button><button type="button" className="today-button" onClick={today}>Hoje</button><button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight /></button><h2>{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2></div>
        <div className="calendar-controls"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar por tipo"><option value="todos">Todos os tipos</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="todos">Todos os status</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><div className="calendar-view-toggle"><button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}><CalendarDays size={16} /> Mês</button><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={16} /> Lista</button></div></div>
      </div>
      {loading && <div className="state-panel"><RefreshCw className="spin" /><span>Consultando cronograma…</span></div>}
      {error && <div className="state-panel error"><strong>Não foi possível consultar a agenda</strong><span>{error}</span><button onClick={() => setVersion((value) => value + 1)}>Tentar novamente</button></div>}
      {!loading && !error && view === 'month' && <div className="calendar-grid-wrap"><div className="calendar-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{gridDays.map((day) => {
        const key = dateKey(day)
        const dayEvents = byDay[key] ?? []
        const outside = day.getMonth() !== month.getMonth()
        return <button type="button" key={key} className={`calendar-day ${outside ? 'outside' : ''} ${key === selectedDate ? 'selected' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`} onClick={() => setSelectedDate(key)}><span>{day.getDate()}</span><div>{dayEvents.slice(0, 3).map((event) => <i key={event.id} className={`event-${event.status ?? 'agendado'}`} onClick={(click) => { click.stopPropagation(); setSelectedEvent(event) }}><b>{formatTime(event.inicio)}</b> {event.titulo}</i>)}{dayEvents.length > 3 && <small>+ {dayEvents.length - 3} evento(s)</small>}</div></button>
      })}</div></div>}
      {!loading && !error && view === 'list' && <EventList events={filtered} onSelect={setSelectedEvent} />}
    </article>
    {view === 'month' && <article className="panel selected-schedule"><div className="panel-heading"><h2>Cronograma de {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</h2><button type="button" onClick={() => setCreating(true)}>+ Agendar neste dia</button></div><EventList events={selectedDayEvents} onSelect={setSelectedEvent} compact /></article>}
  </section>
}

function EventList({ events, onSelect, compact = false }: { events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void; compact?: boolean }) {
  if (!events.length) return <div className="empty">{compact ? 'Nenhum compromisso neste dia.' : 'Nenhum agendamento neste período.'}</div>
  return <div className="schedule-list">{[...events].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()).map((event) => <button type="button" key={event.id} onClick={() => onSelect(event)}><span className={`schedule-marker event-${event.status ?? 'agendado'}`} /><span className="schedule-date"><strong>{new Date(event.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</strong><small>{formatTime(event.inicio)}–{formatTime(event.fim)}</small></span><span className="schedule-title"><strong>{event.titulo}</strong><small>{event.tipo ?? 'Compromisso'}{event.local ? ` · ${event.local}` : ''}</small></span><span className="status-chip">{statusLabel(event.status)}</span></button>)}</div>
}

function EventDetails({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(click) => click.target === click.currentTarget && onClose()}><div className="dialog event-details"><div className="panel-heading"><div><span className="status-chip">{statusLabel(event.status)}</span><h2>{event.titulo}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><dl><div><dt><CalendarDays size={17} /> Data</dt><dd>{new Date(event.inicio).toLocaleDateString('pt-BR', { dateStyle: 'full' })}</dd></div><div><dt><Clock3 size={17} /> Horário</dt><dd>{formatTime(event.inicio)} às {formatTime(event.fim)}</dd></div>{event.local && <div><dt><MapPin size={17} /> Local</dt><dd>{event.local}</dd></div>}</dl>{event.descricao && <p>{event.descricao}</p>}<button type="button" className="gold-button" onClick={onClose}>Fechar</button></div></div>
}

function NewEventDialog({ initialDate, onClose, onCreated }: { initialDate: string; onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const values = new FormData(event.currentTarget)
    const start = new Date(String(values.get('start')))
    const end = new Date(String(values.get('end')))
    if (end <= start) {
      setError('O horário final deve ser posterior ao horário inicial.')
      setSaving(false)
      return
    }
    const body = {
      titulo: String(values.get('title')),
      tipo: String(values.get('type')),
      inicio: start.toISOString(),
      fim: end.toISOString(),
      descricao: String(values.get('description') ?? '') || undefined,
      local: String(values.get('location') ?? '') || undefined,
      status: String(values.get('status')),
      lembreteMinutos: Number(values.get('reminder')),
      diaInteiro: values.get('allDay') === 'on',
      googleSyncEnabled: values.get('googleSync') === 'on',
    }
    try {
      await apiRequest({ method: 'POST', path: '/calendar/events', body, idempotencyKey: mutationKey() })
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o agendamento')
      setSaving(false)
    }
  }
  const start = `${initialDate}T09:00`
  const end = `${initialDate}T10:00`
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(click) => click.target === click.currentTarget && onClose()}><form className="dialog calendar-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Novo agendamento</h2><p>Registre o compromisso no cronograma da equipe.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="dialog-fields"><label className="full-field">Título<input name="title" required autoFocus /></label><label>Tipo<select name="type" defaultValue="reuniao">{eventTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label><label>Status<select name="status" defaultValue="agendado">{statuses.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label><label>Início<input name="start" type="datetime-local" defaultValue={start} required /></label><label>Fim<input name="end" type="datetime-local" defaultValue={end} required /></label><label>Local<input name="location" /></label><label>Lembrete<select name="reminder" defaultValue="30"><option value="0">Sem lembrete</option><option value="15">15 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select></label><label className="full-field">Descrição<textarea name="description" rows={3} /></label><label className="check-label"><input name="allDay" type="checkbox" /> Dia inteiro</label><label className="check-label"><input name="googleSync" type="checkbox" /> Sincronizar com Google Calendar</label></div>{error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}>{saving ? 'Agendando…' : 'Criar agendamento'}</button></div></form></div>
}
