import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell, CircleHelp, Database, Globe2, HelpCircle, LockKeyhole,
  Mail, Palette, PlugZap, ShieldCheck, Star, UserRound, Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PublicSession } from '../electron/contracts'
import { apiRequest, mutationKey } from './api'

type SettingsTab =
  | 'profile' | 'appearance' | 'notifications' | 'security'
  | 'integrations' | 'privacy' | 'locale' | 'help'

type Preferences = {
  darkMode: boolean
  accent: string
  fontScale: number
  density: 'compact' | 'normal' | 'comfortable'
  emailNotifications: boolean
  desktopNotifications: boolean
  taskNotifications: boolean
  language: string
  timezone: string
}

type SettingsProps = {
  session: PublicSession
  onSessionChange: (session: PublicSession) => void
  onLogout: () => Promise<void>
}

const PREFERENCES_KEY = 'reis.preferences'
const defaults: Preferences = {
  darkMode: true,
  accent: '#c9a40a',
  fontScale: 100,
  density: 'normal',
  emailNotifications: true,
  desktopNotifications: true,
  taskNotifications: true,
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
}

const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: 'profile', label: 'Perfil & Conta', icon: UserRound },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: LockKeyhole },
  { id: 'integrations', label: 'Integrações', icon: PlugZap },
  { id: 'privacy', label: 'Dados & Privacidade', icon: Database },
  { id: 'locale', label: 'Idioma & Região', icon: Globe2 },
  { id: 'help', label: 'Ajuda & Suporte', icon: CircleHelp },
]

function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<Preferences>
    if (stored.accent === '#d1a70f') stored.accent = defaults.accent
    return { ...defaults, ...stored }
  } catch {
    return defaults
  }
}

function applyPreferences(value: Preferences) {
  const root = document.documentElement
  root.style.fontSize = `${value.fontScale}%`
  root.style.setProperty('--gold', value.accent)
  root.dataset.density = value.density
  root.dataset.theme = value.darkMode ? 'dark' : 'light'
}

applyPreferences(loadPreferences())

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" disabled={disabled} className={`settings-switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><i /></button>
}

function Message({ kind, children }: { kind: 'success' | 'error' | 'info'; children: string }) {
  return <div className={`settings-message ${kind}`}>{children}</div>
}

async function openExternal(url: string) {
  if (window.reisDesktop) await window.reisDesktop.system.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

export default function Settings({ session, onSessionChange, onLogout }: SettingsProps) {
  const [active, setActive] = useState<SettingsTab>('profile')
  const [preferences, setPreferences] = useState(loadPreferences)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  const updatePreferences = (patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next))
      applyPreferences(next)
      return next
    })
    setMessage({ kind: 'success', text: 'Preferências salvas neste dispositivo.' })
  }

  useEffect(() => setMessage(null), [active])

  return <section className="settings-page">
    <div className="page-heading"><div><h1>Configurações</h1><p>Gerencie sua conta e preferências do sistema.</p></div></div>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Seções das configurações">
        {tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <div className="settings-content">
        {message && <Message kind={message.kind}>{message.text}</Message>}
        {active === 'profile' && <ProfileSettings session={session} onSessionChange={onSessionChange} onMessage={setMessage} />}
        {active === 'appearance' && <AppearanceSettings value={preferences} onChange={updatePreferences} />}
        {active === 'notifications' && <NotificationSettings value={preferences} onChange={updatePreferences} />}
        {active === 'security' && <SecuritySettings session={session} />}
        {active === 'integrations' && <IntegrationSettings onMessage={setMessage} />}
        {active === 'privacy' && <PrivacySettings onLogout={onLogout} />}
        {active === 'locale' && <LocaleSettings value={preferences} onChange={updatePreferences} />}
        {active === 'help' && <HelpSettings />}
      </div>
    </div>
  </section>
}

function ProfileSettings({ session, onSessionChange, onMessage }: {
  session: PublicSession
  onSessionChange: (session: PublicSession) => void
  onMessage: (message: { kind: 'success' | 'error' | 'info'; text: string }) => void
}) {
  const [saving, setSaving] = useState(false)
  const canUpdate = session.user.permissions.some((permission) =>
    ['usuarios.update', 'usuarios.manage'].includes(permission),
  )
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    const values = new FormData(event.currentTarget)
    const body = {
      nome: String(values.get('name') ?? ''),
      telefone: String(values.get('phone') ?? '') || undefined,
    }
    try {
      await apiRequest({ method: 'PATCH', path: `/organizacao/usuarios/${session.user.id}`, body, idempotencyKey: mutationKey() })
      onSessionChange({ ...session, user: { ...session.user, name: body.nome } })
      onMessage({ kind: 'success', text: 'Perfil atualizado na API REIS.' })
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o perfil.' })
    } finally {
      setSaving(false)
    }
  }
  const name = session.user.name ?? session.user.email
  return <div><header className="settings-section-heading"><h2>Perfil & Conta</h2><p>Informações pessoais e preferências de conta.</p></header>
    <div className="profile-summary"><div className="profile-avatar">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><strong>{name}</strong><span>{session.user.email}</span><small>{session.user.role ?? 'Usuário'}</small></div></div>
    {!canUpdate && <Message kind="info">Seu perfil permite consultar estes dados, mas não alterá-los.</Message>}
    <form className="settings-form" onSubmit={submit}><label>Nome completo<input name="name" defaultValue={name} required disabled={!canUpdate} /></label><label>E-mail<input name="email" type="email" defaultValue={session.user.email} disabled title="A alteração de e-mail exige confirmação pelo provedor de autenticação" /></label><label>Telefone<input name="phone" placeholder="+55 (11) 99999-0000" disabled={!canUpdate} /></label><label>Empresa<input value={session.user.companyId ?? 'Empresa vinculada à sessão'} disabled /></label><label>Cargo<input value={session.user.role ?? 'Usuário'} disabled /></label><label>Fuso horário<input value="America/Sao_Paulo" disabled /></label><p className="settings-note full-field">O e-mail de acesso só poderá ser alterado quando a API sincronizar a mudança com o provedor de autenticação.</p><button className="gold-button" disabled={saving || !canUpdate}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></form>
  </div>
}

function AppearanceSettings({ value, onChange }: { value: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  const accents = ['#c9a40a', '#e6c456', '#438cdf', '#20ac68', '#9352b6', '#ef493c']
  return <div><header className="settings-section-heading"><h2>Aparência</h2><p>Personalize a interface visual do sistema.</p></header>
    <div className="settings-block row"><div><strong>Modo escuro</strong><span>Aparência escura do sistema</span></div><Switch checked={value.darkMode} onChange={(darkMode) => onChange({ darkMode })} label="Modo escuro" /></div>
    <div className="settings-block"><strong>Cor de destaque</strong><div className="accent-options">{accents.map((accent) => <button key={accent} type="button" aria-label={`Cor ${accent}`} className={value.accent === accent ? 'selected' : ''} style={{ background: accent }} onClick={() => onChange({ accent })} />)}</div></div>
    <div className="settings-block"><strong>Tamanho da fonte</strong><div className="font-range"><span>A</span><input type="range" min="90" max="115" value={value.fontScale} onChange={(event) => onChange({ fontScale: Number(event.target.value) })} /><span>A</span></div></div>
    <div className="settings-block"><strong>Densidade do layout</strong><div className="density-options">{(['compact', 'normal', 'comfortable'] as const).map((density) => <button type="button" className={value.density === density ? 'active' : ''} key={density} onClick={() => onChange({ density })}>{density === 'compact' ? 'Compacto' : density === 'normal' ? 'Normal' : 'Espaçoso'}</button>)}</div></div>
  </div>
}

function NotificationSettings({ value, onChange }: { value: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  const options = [
    ['emailNotifications', 'Notificações por e-mail', 'Resumos e alertas importantes na sua caixa de entrada'],
    ['desktopNotifications', 'Notificações do desktop', 'Avisos nativos quando o aplicativo estiver aberto'],
    ['taskNotifications', 'Lembretes operacionais', 'Tarefas, compromissos e negociações próximas'],
  ] as const
  return <div><header className="settings-section-heading"><h2>Notificações</h2><p>Escolha como deseja receber atualizações.</p></header>{options.map(([key, title, detail]) => <div className="settings-block row" key={key}><div><strong>{title}</strong><span>{detail}</span></div><Switch checked={value[key]} onChange={(checked) => onChange({ [key]: checked })} label={title} /></div>)}</div>
}

function SecuritySettings({ session }: { session: PublicSession }) {
  return <div><header className="settings-section-heading"><h2>Segurança</h2><p>Proteja sua conta e seus dados sensíveis.</p></header>
    <div className="settings-block"><strong>Alterar senha</strong><p className="settings-note">A API atual ainda não publicou um endpoint seguro de alteração de senha. Esta ação será habilitada assim que o contrato estiver disponível.</p><button className="outline-button" disabled>Alterar senha</button></div>
    <div className="settings-block row"><div><strong>Autenticação em dois fatores</strong><span>Gerenciada pelo provedor de autenticação</span></div><Switch checked={false} disabled onChange={() => undefined} label="Autenticação em dois fatores indisponível" /></div>
    <div className="settings-block"><strong>Sessão atual</strong><p className="settings-note">Sessão protegida até {new Date(session.expiresAt).toLocaleString('pt-BR')}. Tokens não são exibidos para o renderer.</p><div className="security-badge"><ShieldCheck size={17} /> Sessão protegida</div></div>
  </div>
}

function IntegrationSettings({ onMessage }: { onMessage: (message: { kind: 'success' | 'error' | 'info'; text: string }) => void }) {
  const [google, setGoogle] = useState<Record<string, unknown> | null>(null)
  const [whatsapp, setWhatsapp] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    const [googleResult, whatsappResult] = await Promise.allSettled([
      apiRequest<Record<string, unknown> | null>({ method: 'GET', path: '/integrations/google/calendar/status' }),
      apiRequest<Record<string, unknown>>({ method: 'GET', path: '/automation/messages/provider/status' }),
    ])
    setGoogle(googleResult.status === 'fulfilled' ? googleResult.value.data : null)
    setWhatsapp(whatsappResult.status === 'fulfilled' ? whatsappResult.value.data : null)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const connectGoogle = async () => {
    try {
      const result = await apiRequest<{ authorizationUrl: string }>({ method: 'POST', path: '/integrations/google/calendar/connect', body: {}, idempotencyKey: mutationKey() })
      await openExternal(result.data.authorizationUrl)
      onMessage({ kind: 'info', text: 'Conclua a autorização no navegador e retorne ao REIS.' })
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao conectar Google Calendar.' })
    }
  }
  const disconnectGoogle = async () => {
    try {
      await apiRequest({ method: 'POST', path: '/integrations/google/calendar/disconnect', body: {}, idempotencyKey: mutationKey() })
      await load()
      onMessage({ kind: 'success', text: 'Google Calendar desconectado.' })
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao desconectar.' })
    }
  }
  const googleConnected = google?.status === 'active'
  const whatsappConnected = Boolean((whatsapp?.whatsapp as Record<string, unknown> | undefined)?.enabled)
  const items = [
    { name: 'Google Calendar', connected: googleConnected, detail: String(google?.googleAccountEmail ?? ''), action: googleConnected ? disconnectGoogle : connectGoogle },
    { name: 'WhatsApp Business', connected: whatsappConnected, detail: whatsappConnected ? 'Provider ativo na API' : 'Provider não configurado' },
    { name: 'Slack', connected: false, detail: 'Integração ainda não disponível' },
    { name: 'Zapier', connected: false, detail: 'Integração ainda não disponível' },
    { name: 'HubSpot', connected: false, detail: 'Integração ainda não disponível' },
    { name: 'RD Station', connected: false, detail: 'Integração ainda não disponível' },
  ]
  return <div><header className="settings-section-heading"><h2>Integrações</h2><p>Conecte ferramentas e automatize seu fluxo.</p></header>{loading ? <div className="settings-loading">Consultando integrações na API…</div> : <div className="integration-grid">{items.map((item) => <article className="integration-card" key={item.name}><div className="integration-logo"><PlugZap size={20} /></div><div><strong>{item.name}</strong><span className={item.connected ? 'connected' : ''}>{item.connected ? 'Conectado' : item.detail}</span>{item.connected && item.detail && <small>{item.detail}</small>}</div><button type="button" className="outline-button" disabled={!item.action} onClick={item.action}>{item.action ? item.connected ? 'Desconectar' : 'Conectar' : 'Indisponível'}</button></article>)}</div>}</div>
}

function PrivacySettings({ onLogout }: { onLogout: () => Promise<void> }) {
  const clearPreferences = () => {
    localStorage.removeItem(PREFERENCES_KEY)
    applyPreferences(defaults)
    window.location.reload()
  }
  return <div><header className="settings-section-heading"><h2>Dados & Privacidade</h2><p>Controle os dados mantidos neste dispositivo.</p></header>
    <div className="settings-block row"><div><strong>Preferências locais</strong><span>Aparência, idioma e opções de notificação</span></div><button className="outline-button" onClick={clearPreferences}>Limpar dados locais</button></div>
    <div className="settings-block row"><div><strong>Encerrar sessão</strong><span>Remove os tokens locais e revoga a sessão atual</span></div><button className="danger-button" onClick={() => void onLogout()}>Sair deste dispositivo</button></div>
    <div className="settings-block danger-zone"><strong>Excluir conta</strong><p className="settings-note">A exclusão definitiva permanece indisponível porque a API não oferece esse endpoint. Nenhum dado será removido parcialmente pelo cliente.</p><button className="danger-button" disabled>Excluir conta</button></div>
  </div>
}

function LocaleSettings({ value, onChange }: { value: Preferences; onChange: (patch: Partial<Preferences>) => void }) {
  return <div><header className="settings-section-heading"><h2>Idioma & Região</h2><p>Ajuste formatos locais e o fuso horário.</p></header><div className="settings-form single"><label>Idioma<select value={value.language} onChange={(event) => onChange({ language: event.target.value })}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (United States)</option><option value="es">Español</option></select></label><label>Fuso horário<select value={value.timezone} onChange={(event) => onChange({ timezone: event.target.value })}><option value="America/Sao_Paulo">América/São Paulo</option><option value="America/Manaus">América/Manaus</option><option value="America/Recife">América/Recife</option><option value="UTC">UTC</option></select></label></div></div>
}

function HelpSettings() {
  const actions = [
    { title: 'Central de Ajuda', detail: 'Documentação da API e tutoriais', icon: HelpCircle, action: () => openExternal('https://api-reis.onrender.com/api/docs') },
    { title: 'Falar com o Suporte', detail: 'Consulte o responsável da sua empresa', icon: Mail },
    { title: 'Vídeos de Treinamento', detail: 'Conteúdo em preparação', icon: Video },
    { title: 'Notas de Versão', detail: 'Versão atual da aplicação', icon: Star },
  ]
  return <div><header className="settings-section-heading"><h2>Ajuda & Suporte</h2><p>Encontre documentação e canais de atendimento.</p></header><div className="help-grid">{actions.map(({ title, detail, icon: Icon, action }) => <button type="button" key={title} onClick={() => action?.()} disabled={!action}><span className="help-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></div>
}
