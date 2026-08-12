import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, CheckCircle2, Handshake, Mail, RefreshCw, Search,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { apiRequest } from './api'

type Row = Record<string, unknown>
type Central = {
  metrics: {
    accounts: number
    contacts: number
    openDeals: number
    wonDeals: number
    lostDeals: number
    pendingActivities: number
    overdueActivities: number
    pipelineValueCents: number
  }
}
type DashboardAnalytics = {
  crm: Row[]
  vendas: Row[]
  tarefas: Row[]
  generatedAt: string
}
type Overview = {
  attendance?: { total?: number; concluidos?: number; valor?: number | string }
  pipeline?: { oportunidades?: number; valor_total?: number | string; valor_ponderado?: number | string }
  forecast?: { weightedPipeline?: number | string; method?: string }
}
type NurtureMetrics = { total?: number; active?: number; paused?: number; completed?: number; blocked?: number; due?: number; records?: number }
type Attendance = { status?: string; tipoAtendimento?: { nome?: string } }
type AttendancePayload = Attendance[] | { items: Attendance[] }
type FlowStage = {
  title: string
  detail: string
  icon: LucideIcon
  value?: number
  target: string
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function currency(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(number(value))
}

export default function OperationalFlow({ refreshKey, onNavigate }: {
  refreshKey: number
  onNavigate: (id: string) => void
}) {
  const [central, setCentral] = useState<Central | null>(null)
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [nutrition, setNutrition] = useState<NurtureMetrics | null>(null)
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    Promise.allSettled([
      apiRequest<Central>({ method: 'GET', path: '/crm/central' }),
      apiRequest<DashboardAnalytics>({ method: 'GET', path: '/analytics/dashboard' }),
      apiRequest<Overview>({ method: 'GET', path: '/analytics/overview' }),
      apiRequest<NurtureMetrics>({ method: 'GET', path: '/crm/nurture/metrics' }),
      apiRequest<AttendancePayload>({ method: 'GET', path: '/crm/atendimentos?limit=100' }),
    ]).then(([centralResult, analyticsResult, overviewResult, nutritionResult, attendanceResult]) => {
      if (!current) return
      if (centralResult.status === 'fulfilled') setCentral(centralResult.value.data)
      if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data)
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data)
      if (nutritionResult.status === 'fulfilled') setNutrition(nutritionResult.value.data)
      if (attendanceResult.status === 'fulfilled') {
        const payload = attendanceResult.value.data
        setAttendances(Array.isArray(payload) ? payload : payload.items)
      }
      if (centralResult.status === 'rejected' && analyticsResult.status === 'rejected') {
        const reason = centralResult.reason
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o fluxo')
      }
    }).finally(() => current && setLoading(false))
    return () => { current = false }
  }, [refreshKey, version])

  const crm = analytics?.crm?.[0] ?? {}
  const sales = analytics?.vendas?.[0] ?? {}
  const tasks = analytics?.tarefas?.[0] ?? {}
  const totalLeads = number(crm.totalLeads ?? central?.metrics.accounts)
  const closedLeads = number(crm.leadsFechados ?? central?.metrics.wonDeals)
  const opportunities = number(overview?.pipeline?.oportunidades) ||
    number(central?.metrics.openDeals) + number(central?.metrics.wonDeals) + number(central?.metrics.lostDeals)
  const followUps = number(central?.metrics.pendingActivities ?? tasks.pendentes)
  const nurturedLeads = number(nutrition?.active ?? nutrition?.records)

  const stages: FlowStage[] = [
    { title: 'Captação de Leads', detail: 'Prospecção ativa e inbound', icon: Search, value: totalLeads, target: 'leads' },
    { title: 'Nutrição', detail: 'Sequências e relacionamento', icon: Mail, value: nurturedLeads, target: 'leads' },
    { title: 'Oportunidade', detail: 'Qualificação e proposta', icon: Handshake, value: opportunities, target: 'oportunidades' },
    { title: 'Follow-up', detail: 'Agendamentos e retorno', icon: CalendarDays, value: followUps, target: 'fluxo' },
    { title: 'Fechamento', detail: 'Proposta e assinatura', icon: CheckCircle2, value: closedLeads, target: 'oportunidades' },
  ]

  const funnel = useMemo(() => [
    { label: 'Leads', value: totalLeads, available: true },
    { label: 'Nutrição', value: nurturedLeads, available: true },
    { label: 'Oportunidades', value: opportunities, available: true },
    { label: 'Follow-ups', value: followUps, available: true },
    { label: 'Fechamentos', value: closedLeads, available: true },
  ], [closedLeads, followUps, nurturedLeads, opportunities, totalLeads])
  const maximum = Math.max(totalLeads, nurturedLeads, opportunities, followUps, closedLeads, 1)
  const communicationPatterns = useMemo(() => {
    const groups = new Map<string, { total: number; open: number }>()
    attendances.forEach((attendance) => {
      const type = attendance.tipoAtendimento?.nome ?? 'Atendimento geral'
      const current = groups.get(type) ?? { total: 0, open: 0 }
      current.total += 1
      if (!['concluido', 'cancelado'].includes(String(attendance.status ?? 'aberto').toLowerCase())) current.open += 1
      groups.set(type, current)
    })
    return [...groups.entries()].map(([name, values]) => ({
      name,
      ...values,
      cadence: values.open > values.total / 2 ? 'Contato imediato + retorno em 2 dias' : 'Confirmação + acompanhamento em 5 dias',
      channel: values.open > values.total / 2 ? 'WhatsApp e aviso interno' : 'WhatsApp e e-mail',
    })).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [attendances])
  const conversion = number(crm.taxaConversao) ||
    (totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0)

  if (loading) return <div className="state-panel"><RefreshCw className="spin" /><span>Montando fluxo operacional…</span></div>
  if (error) return <div className="state-panel error"><strong>Não foi possível carregar o fluxo</strong><span>{error}</span><button onClick={() => setVersion((value) => value + 1)}>Tentar novamente</button></div>

  return <section className="operational-page">
    <div className="page-heading"><div><h1>Fluxo Operacional</h1><p>Etapas e indicadores consolidados diretamente da operação.</p></div><button className="period-button" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> Atualizar</button></div>
    <article className="panel flow-map-panel">
      <h2>Fluxo Operacional</h2>
      <div className="flow-track">
        {stages.map(({ title, detail, icon: Icon, value, target }, index) => <div className="flow-stage-wrap" key={title}><button type="button" className="flow-stage" onClick={() => onNavigate(target)}><span className="flow-stage-icon"><Icon size={29} /></span><strong>{title}</strong><small>{detail}</small><b>{value === undefined ? 'Indicador não publicado' : `${value.toLocaleString('pt-BR')} registro(s)`}</b></button>{index < stages.length - 1 && <span className="flow-arrow">›</span>}</div>)}
      </div>
    </article>
    <div className="flow-details-grid">
      <article className="panel funnel-panel"><h2>Funil de Conversão</h2><div className="funnel-bars">{funnel.map((item) => {
        const percentage = item.available && totalLeads > 0 ? Math.round((item.value / totalLeads) * 100) : null
        const width = item.available ? Math.max(item.value > 0 ? 7 : 0, (item.value / maximum) * 100) : 0
        return <div className="funnel-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${width}%` }} />{item.available ? <strong>{item.value.toLocaleString('pt-BR')}</strong> : <em>Aguardando API</em>}</div><b>{percentage === null ? '—' : `${percentage}%`}</b></div>
      })}</div></article>
      <article className="panel flow-metrics"><h2>Métricas do Fluxo</h2><dl>
        <div><dt>Taxa de conversão</dt><dd>{conversion.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</dd></div>
        <div><dt>Pipeline total</dt><dd>{currency(overview?.pipeline?.valor_total ?? number(central?.metrics.pipelineValueCents) / 100)}</dd></div>
        <div><dt>Forecast ponderado</dt><dd>{overview?.forecast?.weightedPipeline === undefined ? 'Não calculado' : currency(overview.forecast.weightedPipeline)}</dd></div>
        <div><dt>Taxa de aceite</dt><dd>{number(sales.taxaAceite).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</dd></div>
        <div><dt>Tarefas vencidas</dt><dd>{number(central?.metrics.overdueActivities).toLocaleString('pt-BR')}</dd></div>
      </dl><small>Atualizado em {analytics?.generatedAt ? new Date(analytics.generatedAt).toLocaleString('pt-BR') : 'agora'}</small></article>
    </div>
    <article className="panel communication-patterns"><div className="panel-heading"><div><h2>Padrões de comunicação dos leads</h2><span>Cadências sugeridas a partir dos tipos e estados dos atendimentos</span></div><strong>{attendances.length} atendimentos medidos</strong></div>
      {communicationPatterns.length ? <div className="communication-pattern-list">{communicationPatterns.map((pattern) => <div key={pattern.name}><div><strong>{pattern.name}</strong><span>{pattern.total} atendimento(s) · {pattern.open} em andamento</span></div><div><small>Cadência sugerida</small><b>{pattern.cadence}</b></div><div><small>Canais</small><b>{pattern.channel}</b></div></div>)}</div> : <div className="empty">Registre atendimentos para formar padrões de comunicação.</div>}
    </article>
  </section>
}
