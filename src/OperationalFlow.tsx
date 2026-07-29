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
    ]).then(([centralResult, analyticsResult, overviewResult]) => {
      if (!current) return
      if (centralResult.status === 'fulfilled') setCentral(centralResult.value.data)
      if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data)
      if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value.data)
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

  const stages: FlowStage[] = [
    { title: 'Captação de Leads', detail: 'Prospecção ativa e inbound', icon: Search, value: totalLeads, target: 'leads' },
    { title: 'Nutrição', detail: 'Sequências e relacionamento', icon: Mail, target: 'leads' },
    { title: 'Oportunidade', detail: 'Qualificação e proposta', icon: Handshake, value: opportunities, target: 'oportunidades' },
    { title: 'Follow-up', detail: 'Agendamentos e retorno', icon: CalendarDays, value: followUps, target: 'fluxo' },
    { title: 'Fechamento', detail: 'Proposta e assinatura', icon: CheckCircle2, value: closedLeads, target: 'oportunidades' },
  ]

  const funnel = useMemo(() => [
    { label: 'Leads', value: totalLeads, available: true },
    { label: 'Nutrição', value: 0, available: false },
    { label: 'Oportunidades', value: opportunities, available: true },
    { label: 'Follow-ups', value: followUps, available: true },
    { label: 'Fechamentos', value: closedLeads, available: true },
  ], [closedLeads, followUps, opportunities, totalLeads])
  const maximum = Math.max(totalLeads, opportunities, followUps, closedLeads, 1)
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
  </section>
}
