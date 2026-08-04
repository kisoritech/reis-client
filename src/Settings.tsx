import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell, CircleHelp, Database, Globe2, HelpCircle, LockKeyhole,
  Mail, Palette, Pencil, PlugZap, Save, ShieldCheck, Star, Trash2, UserPlus, UserRound, UsersRound, Video, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PublicSession } from '../electron/contracts'
import { apiRequest, mutationKey } from './api'

type SettingsTab =
  | 'profile' | 'users' | 'appearance' | 'notifications' | 'security'
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
  { id: 'users', label: 'Usuários', icon: UsersRound },
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
  const isDev = session.user.role?.trim().toLowerCase() === 'dev'

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
        {tabs.filter(({ id }) => id !== 'users' || isDev).map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <div className="settings-content">
        {message && <Message kind={message.kind}>{message.text}</Message>}
        {active === 'profile' && <ProfileSettings session={session} onSessionChange={onSessionChange} onMessage={setMessage} />}
        {active === 'users' && isDev && <UsersSettings session={session} onSessionChange={onSessionChange} onMessage={setMessage} />}
        {active === 'appearance' && <AppearanceSettings value={preferences} onChange={updatePreferences} />}
        {active === 'notifications' && <NotificationSettings value={preferences} onChange={updatePreferences} />}
        {active === 'security' && <SecuritySettings session={session} />}
        {active === 'integrations' && <IntegrationSettings onMessage={setMessage} />}
        {active === 'privacy' && <PrivacySettings session={session} onLogout={onLogout} onMessage={setMessage} />}
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
      const refreshed = await apiRequest<OrganizationUser[]>({ method: 'GET', path: '/organizacao/usuarios' })
      const persisted = refreshed.data.find((user) => user.id === session.user.id)
      if (!persisted) throw new Error('A API não retornou o usuário atualizado.')
      const persistedName = persisted.nome ?? persisted.name ?? body.nome
      const persistedPhone = persisted.telefone ?? persisted.phone
      if (persistedName !== body.nome || (persistedPhone ?? '') !== (body.telefone ?? '')) {
        throw new Error('A API recebeu a alteração, mas não persistiu todos os dados. Tente novamente.')
      }
      onSessionChange({ ...session, user: { ...session.user, name: persistedName, phone: persistedPhone } })
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
    <form className="settings-form" onSubmit={submit}><label>Nome completo<input name="name" defaultValue={name} required disabled={!canUpdate} /></label><label>E-mail<input name="email" type="email" defaultValue={session.user.email} disabled title="A alteração de e-mail exige confirmação pelo provedor de autenticação" /></label><label>Telefone<input name="phone" type="tel" defaultValue={session.user.phone ?? ''} placeholder="+55 (11) 99999-0000" disabled={!canUpdate} /></label><label>Empresa<input value={session.user.companyId ?? 'Empresa vinculada à sessão'} disabled /></label><label>Cargo<input value={session.user.role ?? 'Usuário'} disabled /></label><label>Fuso horário<input value="America/Sao_Paulo" disabled /></label><p className="settings-note full-field">O e-mail de acesso só poderá ser alterado quando a API sincronizar a mudança com o provedor de autenticação.</p><button className="gold-button" disabled={saving || !canUpdate}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></form>
  </div>
}

type OrganizationUser = { id: string; nome?: string; name?: string; email: string; telefone?: string; phone?: string; ativo?: boolean; cargoId?: string; cargo?: { id?: string; nome?: string }; role?: string }
type OrganizationRole = { id: string; nome?: string; name?: string; descricao?: string; empresaId?: string }

function UsersSettings({ session, onSessionChange, onMessage }: {
  session: PublicSession
  onSessionChange: (session: PublicSession) => void
  onMessage: (message: { kind: 'success' | 'error' | 'info'; text: string }) => void
}) {
  const [users, setUsers] = useState<OrganizationUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ nome: '', telefone: '', cargoId: '' })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [roles, setRoles] = useState<OrganizationRole[]>([])
  const [creating, setCreating] = useState(false)
  const canManage = session.user.role?.trim().toLowerCase() === 'dev'

  const loadUsers = async () => {
    const result = await apiRequest<OrganizationUser[]>({ method: 'GET', path: '/organizacao/usuarios' })
    setUsers(result.data)
    return result.data
  }
  const loadRoles = async () => {
    const result = await apiRequest<OrganizationRole[]>({ method: 'GET', path: '/organizacao/cargos' })
    setRoles(result.data)
    return result.data
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([loadUsers(), loadRoles()])
      .catch((error) => onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar os usuários.' }))
      .finally(() => setLoading(false))
    // A lista deve ser carregada apenas quando a seção é aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage])

  const edit = (user: OrganizationUser) => {
    setEditingId(user.id)
    setDraft({ nome: user.nome ?? user.name ?? '', telefone: user.telefone ?? user.phone ?? '', cargoId: user.cargoId ?? user.cargo?.id ?? '' })
  }
  const save = async (user: OrganizationUser) => {
    setSavingId(user.id)
    try {
      await apiRequest({ method: 'PATCH', path: `/organizacao/usuarios/${user.id}`, body: { ...draft, cargoId: draft.cargoId || undefined }, idempotencyKey: mutationKey() })
      const persisted = (await loadUsers()).find((item) => item.id === user.id)
      if (!persisted) throw new Error('A API não retornou o usuário atualizado.')
      const persistedName = persisted.nome ?? persisted.name ?? ''
      const persistedPhone = persisted.telefone ?? persisted.phone ?? ''
      if (persistedName !== draft.nome || persistedPhone !== draft.telefone) {
        throw new Error('A API recebeu a alteração, mas não persistiu todos os dados. Tente novamente.')
      }
      if (user.id === session.user.id) onSessionChange({ ...session, user: { ...session.user, name: persistedName, phone: persistedPhone } })
      setEditingId(null)
      onMessage({ kind: 'success', text: 'Usuário atualizado com sucesso.' })
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível atualizar o usuário.' })
    } finally { setSavingId(null) }
  }
  const toggleStatus = async (user: OrganizationUser) => {
    const ativo = user.ativo === false
    const action = ativo ? 'reativar' : 'desativar'
    if (!window.confirm(`Deseja realmente ${action} a conta de ${user.nome ?? user.name ?? user.email}?`)) return
    setSavingId(user.id)
    try {
      await apiRequest({ method: 'PATCH', path: `/organizacao/usuarios/${user.id}/status`, body: { ativo }, idempotencyKey: mutationKey() })
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, ativo } : item))
      onMessage({ kind: 'success', text: ativo ? 'Conta reativada.' : 'Conta desativada e sem acesso ao sistema.' })
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : `Não foi possível ${action} a conta.` })
    } finally { setSavingId(null) }
  }

  return <div><header className="settings-section-heading users-heading"><div><h2>Usuários</h2><p>Edite os dados diretamente na tabela e gerencie o acesso das contas.</p></div><button type="button" className="gold-button" onClick={() => setCreating(true)}><UserPlus size={17} /> Novo usuário</button></header>
    {creating && <CreateUserDialog users={users} onClose={() => setCreating(false)} onCreated={async () => { const updated = await loadUsers(); await loadRoles(); return updated }} onSuccess={() => onMessage({ kind: 'success', text: 'Usuário criado e confirmado na API.' })} />}
    {!canManage && <Message kind="info">Seu perfil não possui permissão para alterar usuários.</Message>}
    {loading ? <div className="settings-loading">Carregando usuários…</div> : <div className="users-table-scroll"><table className="users-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Cargo</th><th>Status</th><th aria-label="Ações" /></tr></thead><tbody>{users.map((user) => {
      const editing = editingId === user.id
      return <tr key={user.id}><td>{editing ? <input value={draft.nome} onChange={(event) => setDraft((value) => ({ ...value, nome: event.target.value }))} /> : user.nome ?? user.name ?? '—'}</td><td>{user.email}</td><td>{editing ? <input type="tel" value={draft.telefone} onChange={(event) => setDraft((value) => ({ ...value, telefone: event.target.value }))} /> : user.telefone ?? user.phone ?? '—'}</td><td>{editing ? <select value={draft.cargoId} onChange={(event) => setDraft((value) => ({ ...value, cargoId: event.target.value }))}><option value="">Sem cargo</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.nome ?? role.name}</option>)}</select> : user.cargo?.nome ?? user.role ?? '—'}</td><td><span className={`user-status ${user.ativo === false ? 'inactive' : 'active'}`}>{user.ativo === false ? 'Inativo' : 'Ativo'}</span></td><td><div className="user-row-actions">{editing ? <><button type="button" className="icon-button" title="Salvar" disabled={savingId === user.id || !draft.nome.trim()} onClick={() => void save(user)}><Save size={17} /></button><button type="button" className="icon-button" title="Cancelar" onClick={() => setEditingId(null)}><X size={17} /></button></> : <button type="button" className="icon-button" title="Editar usuário" disabled={!canManage || savingId === user.id} onClick={() => edit(user)}><Pencil size={17} /></button>}<button type="button" className={user.ativo === false ? 'icon-button' : 'icon-button destructive'} title={user.ativo === false ? 'Reativar conta' : 'Desativar conta'} disabled={!canManage || savingId === user.id || user.id === session.user.id} onClick={() => void toggleStatus(user)}><Trash2 size={17} /></button></div></td></tr>
    })}</tbody></table></div>}
    <CargoManager roles={roles} onReload={loadRoles} onMessage={onMessage} />
    <p className="settings-note">A API preserva o histórico ao desativar contas e bloqueia novos acessos. A conta atual pode ser desativada em Dados &amp; Privacidade.</p>
  </div>
}

function CreateUserDialog({ users, onClose, onCreated, onSuccess }: { users: OrganizationUser[]; onClose: () => void; onCreated: () => Promise<OrganizationUser[]>; onSuccess: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const values = new FormData(event.currentTarget)
    const nome = String(values.get('name') ?? '').trim()
    const email = String(values.get('email') ?? '').trim().toLowerCase()
    const telefone = String(values.get('phone') ?? '').trim()
    const password = String(values.get('password') ?? '')
    const perfil = String(values.get('profile') ?? 'usuario_padrao')
    if (users.some((user) => user.email.trim().toLowerCase() === email)) {
      setError('Já existe um usuário cadastrado com este e-mail.')
      return
    }
    if (telefone && !/^\+[1-9]\d{7,14}$/.test(telefone)) {
      setError('Informe o telefone no formato internacional, por exemplo +5565999999999.')
      return
    }
    if (password.length < 6) {
      setError('A senha provisória deve ter pelo menos 6 caracteres.')
      return
    }
    setSaving(true)
    try {
      const body = { nome, email, telefone: telefone || undefined, password, perfil }
      await apiRequest<OrganizationUser>({ method: 'POST', path: '/organizacao/usuarios', body, idempotencyKey: mutationKey() })
      const persisted = (await onCreated()).some((user) => user.email.trim().toLowerCase() === email)
      if (!persisted) throw new Error('A API recebeu o cadastro, mas o novo usuário não apareceu na listagem.')
      onSuccess()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar o usuário.')
      setSaving(false)
    }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="dialog user-dialog" onSubmit={submit}><div className="panel-heading"><div><h2>Novo usuário</h2><p>Cadastre os dados e defina o perfil inicial de acesso.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="dialog-fields"><label>Nome completo<input name="name" minLength={2} required autoFocus /></label><label>E-mail de acesso<input name="email" type="email" required /></label><label>Telefone<input name="phone" type="tel" placeholder="+5565999999999" /></label><label>Perfil inicial<select name="profile" defaultValue="usuario_padrao"><option value="usuario_padrao">Usuário padrão</option><option value="gerente">Gerente</option><option value="usuario_master">Usuário master</option><option value="ceo">CEO</option><option value="dev">Dev</option></select></label><label className="full-field">Senha provisória<input name="password" type="password" minLength={6} autoComplete="new-password" required placeholder="Mínimo de 6 caracteres" /></label></div>{error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button className="gold-button" disabled={saving}>{saving ? 'Cadastrando…' : 'Cadastrar usuário'}</button></div></form></div>
}

function CargoManager({ roles, onReload, onMessage }: { roles: OrganizationRole[]; onReload: () => Promise<OrganizationRole[]>; onMessage: (message: { kind: 'success' | 'error' | 'info'; text: string }) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [working, setWorking] = useState(false)
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setWorking(true)
    try {
      await apiRequest({ method: 'POST', path: '/organizacao/cargos', body: { nome: name.trim(), descricao: description.trim() || undefined }, idempotencyKey: mutationKey() })
      await onReload(); setName(''); setDescription('')
      onMessage({ kind: 'success', text: 'Cargo criado com sucesso.' })
    } catch (error) { onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o cargo.' }) }
    finally { setWorking(false) }
  }
  const rename = async (role: OrganizationRole) => {
    const nome = window.prompt('Novo nome do cargo:', role.nome ?? role.name ?? '')?.trim()
    if (!nome) return
    try { await apiRequest({ method: 'PATCH', path: `/organizacao/cargos/${role.id}`, body: { nome }, idempotencyKey: mutationKey() }); await onReload(); onMessage({ kind: 'success', text: 'Cargo atualizado.' }) }
    catch (error) { onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível atualizar o cargo.' }) }
  }
  const remove = async (role: OrganizationRole) => {
    if (!window.confirm(`Excluir o cargo ${role.nome ?? role.name}?`)) return
    try { await apiRequest({ method: 'DELETE', path: `/organizacao/cargos/${role.id}` }); await onReload(); onMessage({ kind: 'success', text: 'Cargo excluído.' }) }
    catch (error) { onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir o cargo.' }) }
  }
  return <section className="cargo-manager"><div><h3>Cargos</h3><p>Crie cargos e depois atribua-os pela edição do usuário.</p></div><form onSubmit={create}><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="Nome do cargo" /><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Descrição (opcional)" /><button className="outline-button" disabled={working}>{working ? 'Criando…' : 'Adicionar cargo'}</button></form><div className="cargo-list">{roles.map((role) => <div key={role.id}><span><strong>{role.nome ?? role.name}</strong><small>{role.descricao || 'Sem descrição'}</small></span><div><button type="button" className="icon-button" title="Editar cargo" onClick={() => void rename(role)}><Pencil size={16} /></button><button type="button" className="icon-button destructive" title="Excluir cargo" onClick={() => void remove(role)}><Trash2 size={16} /></button></div></div>)}</div></section>
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

function PrivacySettings({ session, onLogout, onMessage }: { session: PublicSession; onLogout: () => Promise<void>; onMessage: (message: { kind: 'success' | 'error' | 'info'; text: string }) => void }) {
  const [deleting, setDeleting] = useState(false)
  const clearPreferences = () => {
    localStorage.removeItem(PREFERENCES_KEY)
    applyPreferences(defaults)
    window.location.reload()
  }
  const deleteAccount = async () => {
    if (!window.confirm('Deseja desativar sua conta? O acesso será encerrado imediatamente.')) return
    setDeleting(true)
    try {
      await apiRequest({ method: 'PATCH', path: `/organizacao/usuarios/${session.user.id}/status`, body: { ativo: false }, idempotencyKey: mutationKey() })
      await onLogout()
    } catch (error) {
      onMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível desativar sua conta.' })
      setDeleting(false)
    }
  }
  return <div><header className="settings-section-heading"><h2>Dados & Privacidade</h2><p>Controle os dados mantidos neste dispositivo.</p></header>
    <div className="settings-block row"><div><strong>Preferências locais</strong><span>Aparência, idioma e opções de notificação</span></div><button className="outline-button" onClick={clearPreferences}>Limpar dados locais</button></div>
    <div className="settings-block row"><div><strong>Encerrar sessão</strong><span>Remove os tokens locais e revoga a sessão atual</span></div><button className="danger-button" onClick={() => void onLogout()}>Sair deste dispositivo</button></div>
    <div className="settings-block danger-zone"><strong>Excluir conta</strong><p className="settings-note">Sua conta será desativada, o acesso será encerrado e o histórico corporativo será preservado.</p><button className="danger-button" disabled={deleting} onClick={() => void deleteAccount()}>{deleting ? 'Excluindo…' : 'Excluir minha conta'}</button></div>
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
