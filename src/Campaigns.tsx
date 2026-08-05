import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle, CheckCircle2, CirclePause, Eye, Megaphone, Play,
  RefreshCw, RotateCcw, Send, ShieldCheck, XCircle,
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

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [provider, setProvider] = useState<ProviderStatus | null>(null)
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
    const [campaignResult, providerResult] = await Promise.allSettled([
      apiRequest<unknown>({ method: 'GET', path: '/automation/campaigns' }),
      apiRequest<ProviderStatus>({ method: 'GET', path: '/automation/messages/provider/status' }),
    ])
    if (campaignResult.status === 'fulfilled') setCampaigns(arrayFrom(campaignResult.value.data))
    else setError(campaignResult.reason instanceof Error ? campaignResult.reason.message : 'Falha ao consultar campanhas.')
    setProvider(providerResult.status === 'fulfilled' ? providerResult.value.data : null)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])
  const connected = Boolean(provider?.whatsapp?.enabled)
  const selectedStatus = selected ? campaignStatus(selected) : ''
  const canStart = connected && approved && Boolean(preview)

  const openCampaign = async (campaign: Campaign) => {
    setSelected(campaign); setPreview(null); setResults(null); setApproved(false); setScheduledAt('')
    if (!campaign.id) return
    try {
      const detail = await apiRequest<Campaign>({ method: 'GET', path: `/automation/campaigns/${campaign.id}` })
      setSelected(detail.data)
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

    {creating && <CreateCampaign onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); setMessage('Campanha criada como rascunho.') }} />}
    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><div className="dialog campaign-dialog"><div className="panel-heading"><div><span className="status-chip">{statuses[selectedStatus] ?? selectedStatus}</span><h2>{label(selected)}</h2></div><button className="icon-button" onClick={() => setSelected(null)}><XCircle /></button></div>
      <div className="campaign-safety"><ShieldCheck size={20} /><div><strong>Barreiras antes do envio</strong><p>O início só é liberado após conexão do provider, preview e confirmação de consentimento.</p></div></div>
      <div className="campaign-action-grid">
        <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('preview')}><Eye size={16} /> Gerar preview</button>
        <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('results')}><CheckCircle2 size={16} /> Resultados</button>
        {selectedStatus === 'paused' ? <button className="outline-button" disabled={Boolean(busy)} onClick={() => void execute('resume')}><RotateCcw size={16} /> Retomar</button> : <button className="outline-button" disabled={Boolean(busy) || !['running', 'scheduled'].includes(selectedStatus)} onClick={() => void execute('pause')}><CirclePause size={16} /> Pausar</button>}
        <button className="outline-button destructive" disabled={Boolean(busy) || ['completed', 'cancelled'].includes(selectedStatus)} onClick={() => void execute('cancel')}><XCircle size={16} /> Cancelar</button>
      </div>
      {preview && <pre className="campaign-json">{JSON.stringify(preview, null, 2)}</pre>}
      {results && <pre className="campaign-json">{JSON.stringify(results, null, 2)}</pre>}
      <div className="campaign-schedule"><label>Agendar envio<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><button className="outline-button" disabled={Boolean(busy) || !scheduledAt || !preview || !approved} onClick={() => void execute('schedule')}><Send size={16} /> Agendar</button></div>
      <label className="campaign-consent"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span>Confirmo que o público do preview possui opt-in válido para WhatsApp e que pedidos de descadastro foram excluídos.</span></label>
      <button className="gold-button campaign-start" disabled={Boolean(busy) || !canStart || !['draft', 'scheduled', 'paused'].includes(selectedStatus)} onClick={() => void execute('start')}><Play size={17} /> Iniciar campanha</button>
    </div></div>}
  </section>
}

function CreateCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    const values = new FormData(event.currentTarget)
    const body = {
      contractVersion: CAMPAIGN_CONTRACT_VERSION,
      name: String(values.get('name') ?? '').trim(),
      description: String(values.get('description') ?? '').trim() || undefined,
      channel: 'whatsapp',
      template: { name: String(values.get('template') ?? '').trim(), language: String(values.get('language') ?? 'pt_BR') },
      audience: { source: 'crm_accounts', segment: String(values.get('segment') ?? '').trim() || undefined, requireOptIn: true, excludeOptOut: true, requireValidPhone: true },
      delivery: { batchSize: Number(values.get('batchSize') ?? 25), intervalMs: Number(values.get('intervalMs') ?? 1000), dailyLimit: Number(values.get('dailyLimit') ?? 250) },
      status: 'draft',
    }
    try {
      await apiRequest({ method: 'POST', path: '/automation/campaigns', body, idempotencyKey: mutationKey() })
      await onCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a campanha.'); setSaving(false) }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="dialog campaign-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Nova campanha</h2><p>Será salva como rascunho, sem envio automático.</p></div><button type="button" className="icon-button" onClick={onClose}><XCircle /></button></div>
    <div className="dialog-fields"><label>Nome da campanha<input name="name" required minLength={3} autoFocus /></label><label>Template aprovado na Meta<input name="template" required placeholder="ex.: lancamento_imovel_v1" /></label><label>Idioma do template<select name="language" defaultValue="pt_BR"><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês (EUA)</option><option value="es">Espanhol</option></select></label><label>Segmento do CRM<input name="segment" placeholder="ex.: compradores_cuiaba" /></label><label>Destinatários por lote<input name="batchSize" type="number" min="1" max="100" defaultValue="25" required /></label><label>Intervalo entre envios (ms)<input name="intervalMs" type="number" min="250" max="60000" defaultValue="1000" required /></label><label>Limite diário inicial<input name="dailyLimit" type="number" min="1" max="100000" defaultValue="250" required /></label><label className="full-field">Descrição<textarea name="description" rows={3} /></label></div>
    <div className="campaign-safety"><AlertTriangle size={20} /><p>O público será limitado a contatos com telefone válido e opt-in, excluindo opt-outs. A API também deve validar essas regras.</p></div>
    {error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}><Send size={16} /> {saving ? 'Criando…' : 'Criar rascunho'}</button></div>
  </form></div>
}
