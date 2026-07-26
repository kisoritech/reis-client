import { useMemo, useState } from 'react'
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  GitBranch,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Target,
  UsersRound,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'

type Section = {
  id: string
  label: string
  icon: LucideIcon
}

const sections: Section[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: UsersRound },
  { id: 'oportunidades', label: 'Oportunidades', icon: Target },
  { id: 'fluxo', label: 'Fluxo Operacional', icon: GitBranch },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
]

const metrics = [
  {
    label: 'Novos contatos',
    value: '1.245',
    growth: '+12.5%',
    icon: UsersRound,
  },
  {
    label: 'Deals fechados',
    value: '86',
    growth: '+8.2%',
    icon: CheckCircle2,
  },
  {
    label: 'Tarefas concluídas',
    value: '234',
    growth: '+15.3%',
    icon: Target,
  },
  {
    label: 'Receita gerada',
    value: 'R$ 890k',
    growth: '+21.7%',
    icon: CircleDollarSign,
  },
]

const sellers = [
  ['Marina Costa', '42', 'R$ 184.500'],
  ['Lucas Almeida', '36', 'R$ 152.300'],
  ['Carla Mendes', '31', 'R$ 138.900'],
  ['Rafael Souza', '28', 'R$ 121.600'],
]

const statusItems = [
  ['Novo', '34%', '#f5ce39'],
  ['Nutrição', '22%', '#dab025'],
  ['Oportunidade', '18%', '#9d7b13'],
  ['Follow-up', '16%', '#765a0a'],
  ['Fechado', '10%', '#4b3907'],
]

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">R</div>
      <div>
        <strong>Renan Reis</strong>
        <span>CRM Pro</span>
      </div>
    </div>
  )
}

function PerformanceChart() {
  const points =
    '0,113 80,82 160,91 240,56 320,48 400,28 480,37 560,8 640,16 720,-4 800,-15 880,-42'
  return (
    <div className="chart-wrap" aria-label="Gráfico de performance dos últimos 12 meses">
      <div className="y-axis">
        <span>1000</span><span>750</span><span>500</span><span>250</span><span>0</span>
      </div>
      <div className="plot">
        <svg viewBox="0 -55 880 180" preserveAspectRatio="none" role="img">
          <defs>
            <linearGradient id="performance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c99d0b" stopOpacity=".35" />
              <stop offset="1" stopColor="#c99d0b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M ${points} L880,125 L0,125 Z`} fill="url(#performance-fill)" />
          <polyline points={points} fill="none" stroke="#d4a70e" strokeWidth="2.4" />
        </svg>
        <div className="x-axis">
          {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(
            (month) => <span key={month}>{month}</span>,
          )}
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral de desempenho — Julho 2025</p>
        </div>
        <button className="period-button" type="button">Últimos 12 meses</button>
      </div>

      <section className="metrics-grid" aria-label="Indicadores principais">
        {metrics.map(({ label, value, growth, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <div className="metric-icon"><Icon size={23} /></div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>↑ {growth} este mês</small>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel performance-panel">
          <div className="panel-heading">
            <h2>Performance Overview</h2>
            <span>Últimos 12 meses</span>
          </div>
          <PerformanceChart />
        </article>

        <article className="panel status-panel">
          <h2>Distribuição de Status</h2>
          <div className="donut" aria-label="34% novo, 22% nutrição, 18% oportunidade, 16% follow-up, 10% fechado" />
          <ul className="status-list">
            {statusItems.map(([label, value, color]) => (
              <li key={label}>
                <span><i style={{ background: color }} />{label}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel region-panel">
          <h2>Vendas por Região</h2>
          <div className="bars" aria-label="Gráfico de vendas por região">
            {[72, 48, 91, 64, 84, 53, 77].map((height, index) => (
              <div className="bar-column" key={height}>
                <span style={{ height: `${height}%` }} />
                <small>{['Sul', 'SE', 'NE', 'CO', 'N', 'Int.', 'Web'][index]}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel sellers-panel">
          <div className="panel-heading">
            <h2>Top Vendedores</h2>
            <button type="button">Ver todos</button>
          </div>
          <table>
            <thead><tr><th>Nome</th><th>Deals</th><th>Receita</th></tr></thead>
            <tbody>
              {sellers.map(([name, deals, revenue], index) => (
                <tr key={name}>
                  <td><i>{index + 1}</i>{name}</td><td>{deals}</td><td>{revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </>
  )
}

function ModulePage({ section }: { section: Section }) {
  const Icon = section.icon
  return (
    <section className="module-page">
      <div className="page-heading">
        <div><h1>{section.label}</h1><p>Gerencie suas operações em um único lugar.</p></div>
        <button className="gold-button" type="button">+ Novo registro</button>
      </div>
      <div className="module-card">
        <div className="module-card-icon"><Icon size={30} /></div>
        <div>
          <h2>{section.label}</h2>
          <p>Este módulo está preparado para receber os dados da API REIS.</p>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [activeId, setActiveId] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notifications, setNotifications] = useState(3)
  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeId) ?? sections[0],
    [activeId],
  )

  const navigate = (id: string) => {
    setActiveId(id)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="close-sidebar" type="button" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>
        <button className="collapse-button" type="button" aria-label="Recolher menu"><ChevronLeft size={18} /></button>
        <nav aria-label="Navegação principal">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              className={activeId === id ? 'active' : ''}
              key={id}
              type="button"
              onClick={() => navigate(id)}
            >
              <Icon size={20} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" onClick={() => navigate('configuracoes')}>
            <Settings size={20} /><span>Configurações</span>
          </button>
          <div className="user-mini">
            <div className="avatar">RR</div>
            <div><strong>Renan Reis</strong><span>Admin</span></div>
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}

      <div className="workspace">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <label className="search-box">
            <Search size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar leads, deals, contatos..."
              aria-label="Buscar"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={16} /></button>}
          </label>
          <div className="top-actions">
            <button className="notification" type="button" onClick={() => setNotifications(0)} aria-label={`${notifications} notificações`}>
              <Bell size={19} />{notifications > 0 && <i />}
            </button>
            <button className="profile-button" type="button" aria-label="Abrir perfil">RR</button>
          </div>
        </header>

        <main>
          {query && <div className="search-feedback">Resultados para “{query}” serão exibidos aqui.</div>}
          {activeId === 'dashboard'
            ? <Dashboard />
            : <ModulePage section={activeSection} />}
        </main>
      </div>
    </div>
  )
}

export default App
