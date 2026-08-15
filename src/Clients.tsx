import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Mail,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { apiRequest } from "./api";
import { callContact } from "./calling";

type Account = Record<string, unknown> & {
  id?: string;
  nome?: string;
  name?: string;
  email?: string;
  telefone?: string;
  phone?: string;
  cliente?: { nome?: string; email?: string; telefone?: string };
};

type Attendance = Record<string, unknown> & {
  id: string;
  status?: string;
  createdAt?: string;
  observacoes?: string;
  cliente?: { nome?: string; email?: string; telefone?: string };
  tipoAtendimento?: { nome?: string };
  empreendimento?: { nome?: string };
  responsavel?: { nome?: string };
};

type Page<T> = { items: T[] };
type AttendancePayload = Attendance[] | { items: Attendance[] };
type ClientRecord = {
  key: string;
  accountId?: string;
  name: string;
  email?: string;
  phone?: string;
  attendances: Attendance[];
};

function normalizedName(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function accountName(account: Account) {
  return String(
    account.cliente?.nome ?? account.nome ?? account.name ?? "",
  ).trim();
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CL"
  );
}

export default function ClientsPage({
  search,
  refreshKey,
}: {
  search: string;
  refreshKey: number;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([
      apiRequest<Page<Account>>({
        method: "GET",
        path: "/crm/accounts?page=1&limit=100",
      }),
      apiRequest<AttendancePayload>({
        method: "GET",
        path: "/crm/atendimentos?limit=100",
      }),
    ])
      .then(([accountResult, attendanceResult]) => {
        if (!current) return;
        setAccounts(accountResult.data.items ?? []);
        const payload = attendanceResult.data;
        setAttendances(Array.isArray(payload) ? payload : payload.items);
      })
      .catch(
        (reason: unknown) =>
          current &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar os clientes.",
          ),
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [refreshKey, version]);

  const clients = useMemo(() => {
    const grouped = new Map<string, ClientRecord>();
    for (const account of accounts) {
      const name = accountName(account);
      const key = normalizedName(name);
      if (!key) continue;
      grouped.set(key, {
        key,
        accountId: account.id,
        name,
        email: account.cliente?.email ?? account.email,
        phone: account.cliente?.telefone ?? account.telefone ?? account.phone,
        attendances: [],
      });
    }
    for (const attendance of attendances) {
      const name = String(
        attendance.cliente?.nome ?? attendance.clienteNome ?? "",
      ).trim();
      const key = normalizedName(name);
      if (!key) continue;
      const client = grouped.get(key) ?? {
        key,
        name,
        email: attendance.cliente?.email,
        phone: attendance.cliente?.telefone,
        attendances: [],
      };
      client.attendances.push(attendance);
      grouped.set(key, client);
    }
    return [...grouped.values()]
      .map((client) => ({
        ...client,
        attendances: client.attendances.toSorted(
          (a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0),
        ),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [accounts, attendances]);

  const visible = useMemo(() => {
    const term = normalizedName(clientSearch || search);
    return term
      ? clients.filter((client) => normalizedName(client.name).includes(term))
      : clients;
  }, [clientSearch, clients, search]);
  const selected =
    visible.find((client) => client.key === selectedKey) ?? visible[0];

  const dialSelected = async () => {
    if (!selected?.phone || !selected.accountId) return;
    setCalling(true);
    setError("");
    try {
      await callContact({
        phone: selected.phone,
        targetName: selected.name,
        accountId: selected.accountId,
        source: "clients",
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "NÃ£o foi possÃ­vel abrir o discador.",
      );
    } finally {
      setCalling(false);
    }
  };

  return (
    <section className="clients-page">
      <div className="page-heading">
        <div>
          <h1>Clientes</h1>
          <p>
            Consulte clientes e todo o histórico vinculado pelo nome informado
            no atendimento.
          </p>
        </div>
        <button
          className="period-button"
          onClick={() => setVersion((value) => value + 1)}
        >
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>
      {loading && (
        <div className="state-panel">
          <RefreshCw className="spin" />
          <span>Carregando clientes…</span>
        </div>
      )}
      {error && (
        <div className="state-panel error">
          <strong>Não foi possível carregar os clientes</strong>
          <span>{error}</span>
          <button onClick={() => setVersion((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && (
        <div className="clients-workspace">
          <article className="panel clients-list-panel">
            <div className="panel-heading">
              <div>
                <h2>Clientes cadastrados</h2>
                <span>{visible.length} cliente(s)</span>
              </div>
              <button
                type="button"
                className="client-search-trigger"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar cliente"
                aria-expanded={searchOpen}
              >
                <Search size={18} />
              </button>
            </div>
            {searchOpen && (
              <div className="client-search-box">
                <Search size={17} />
                <input
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Digite o nome do cliente…"
                  aria-label="Nome do cliente"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setClientSearch("");
                    setSearchOpen(false);
                  }}
                  aria-label="Fechar busca"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="clients-list">
              {visible.map((client) => (
                <button
                  type="button"
                  className={selected?.key === client.key ? "active" : ""}
                  key={client.key}
                  onClick={() => setSelectedKey(client.key)}
                >
                  <i>{initials(client.name)}</i>
                  <span>
                    <strong>{client.name}</strong>
                    <small>
                      {client.email ?? client.phone ?? "Contato não informado"}
                    </small>
                  </span>
                  <b>{client.attendances.length}</b>
                </button>
              ))}
              {!visible.length && (
                <div className="empty">
                  <Search size={22} />
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>
          </article>
          <article className="panel client-history-panel">
            {selected ? (
              <>
                <header className="client-profile">
                  <i>{initials(selected.name)}</i>
                  <div>
                    <h2>{selected.name}</h2>
                    <span>
                      {selected.attendances.length} atendimento(s) vinculado(s)
                    </span>
                  </div>
                  {selected.phone && selected.accountId && (
                    <button
                      type="button"
                      className="gold-button"
                      disabled={calling}
                      onClick={() => void dialSelected()}
                    >
                      <Phone size={16} />
                      {calling ? "Abrindo..." : "Ligar"}
                    </button>
                  )}
                </header>
                <div className="client-contact-row">
                  {selected.phone && (
                    <span>
                      <Phone size={14} />
                      {selected.phone}
                    </span>
                  )}
                  {selected.email && (
                    <span>
                      <Mail size={14} />
                      {selected.email}
                    </span>
                  )}
                </div>
                <div className="client-history">
                  <h3>
                    <Clock3 size={17} /> Histórico de atendimento
                  </h3>
                  {selected.attendances.length ? (
                    <ol>
                      {selected.attendances.map((attendance) => (
                        <li key={attendance.id}>
                          <span className="history-line" />
                          <div>
                            <header>
                              <strong>
                                {attendance.tipoAtendimento?.nome ??
                                  "Atendimento"}
                              </strong>
                              <span className="status-chip">
                                {attendance.status ?? "aberto"}
                              </span>
                            </header>
                            <time>
                              {attendance.createdAt
                                ? new Date(attendance.createdAt).toLocaleString(
                                    "pt-BR",
                                  )
                                : "Data não informada"}
                            </time>
                            <small>
                              {[
                                attendance.empreendimento?.nome,
                                attendance.responsavel?.nome,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Detalhes não informados"}
                            </small>
                            {attendance.observacoes && (
                              <p>{attendance.observacoes}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="empty">
                      <UserRound size={24} />
                      Nenhum atendimento vinculado a este nome.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty">
                Selecione um cliente para visualizar o histórico.
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
