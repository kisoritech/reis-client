import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Download, Filter, Plus, RefreshCw, X } from "lucide-react";
import { apiRequest, mutationKey } from "./api";

type LeadRow = Record<string, unknown> & {
  id?: string;
  nome?: string;
  name?: string;
  email?: string;
  telefone?: string;
  phone?: string;
  observacoes?: string;
  segment?: string;
  status?: string | { nome?: string; name?: string };
  etapa?: string;
  score?: number;
  valorPotencial?: number;
  potentialValue?: number;
  updatedAt?: string;
  createdAt?: string;
  _count?: { leads?: number; contatos?: number; oportunidades?: number };
  totalAtendimentos?: number;
  atendimentosRecentes?: Array<{
    id: string;
    status?: string;
    observacoes?: string;
    valorNegociacao?: number | null;
    createdAt?: string;
    tipoAtendimento?: { nome?: string };
    empreendimento?: { nome?: string };
  }>;
  cliente?: {
    id: string;
    nome?: string;
    email?: string;
    telefone?: string;
  };
  origem?: string;
  prioridade?: string;
};

type LeadPageData = {
  items: LeadRow[];
  page: number;
  total: number;
  totalPages: number;
};
type LeadStatus = { id: string; nome: string };
type LeadHistory = {
  id: string;
  motivo?: string;
  createdAt: string;
  statusAnterior?: LeadStatus;
  statusNovo?: LeadStatus;
  usuario?: { nome?: string };
};

function leadName(row: LeadRow) {
  return String(
    row.cliente?.nome ?? row.nome ?? row.name ?? "Contato sem nome",
  );
}

function stageName(row: LeadRow) {
  if (typeof row.status === "string") return row.status;
  if (row.status && typeof row.status === "object") {
    return String(row.status.nome ?? row.status.name ?? "Sem etapa");
  }
  return String(row.etapa ?? "Sem etapa");
}

function formatDate(value: unknown) {
  if (!value) return "Não informado";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? "Não informado"
    : parsed.toLocaleDateString("pt-BR");
}

function formatPotential(row: LeadRow) {
  const raw = row.valorPotencial ?? row.potentialValue;
  if (raw === undefined || raw === null) return "Não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(raw));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function LeadsPage({
  search,
  refreshKey,
}: {
  search: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<LeadPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [stage, setStage] = useState("Todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(search ? { search } : {}),
    });
    apiRequest<LeadPageData>({ method: "GET", path: `/crm/leads?${query}` })
      .then((result) => current && setData(result.data))
      .catch(
        (reason: unknown) =>
          current &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar leads",
          ),
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [page, search, refreshKey, version]);

  useEffect(() => {
    apiRequest<LeadStatus[]>({ method: "GET", path: "/crm/lead-statuses" })
      .then((result) => setStatuses(result.data))
      .catch(() => setStatuses([]));
  }, [refreshKey, version]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search]);

  const visible = useMemo(() => {
    const rows = data?.items ?? [];
    return rows.filter((row) => {
      const matchesStage =
        stage === "Todos" ||
        stageName(row).toLocaleLowerCase("pt-BR") ===
          stage.toLocaleLowerCase("pt-BR");
      const timestamp = row.updatedAt ?? row.createdAt;
      const matchesDate =
        !fromDate ||
        (timestamp &&
          new Date(String(timestamp)).getTime() >=
            new Date(`${fromDate}T00:00:00`).getTime());
      return matchesStage && Boolean(matchesDate);
    });
  }, [data, fromDate, stage]);

  const allSelected =
    visible.length > 0 &&
    visible.every((row) => row.id && selected.has(row.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else
      setSelected(new Set(visible.flatMap((row) => (row.id ? [row.id] : []))));
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exportRows = () => {
    const rows = selected.size
      ? visible.filter((row) => row.id && selected.has(row.id))
      : visible;
    const csv = [
      [
        "Nome",
        "E-mail",
        "Telefone",
        "Segmento/Empresa",
        "Etapa",
        "Último contato",
        "Valor potencial",
        "Score",
      ]
        .map(escapeCsv)
        .join(";"),
      ...rows.map((row) =>
        [
          leadName(row),
          row.cliente?.email ?? row.email,
          row.cliente?.telefone ?? row.telefone ?? row.phone,
          row.origem ?? row.observacoes ?? row.segment,
          stageName(row),
          formatDate(row.updatedAt ?? row.createdAt),
          formatPotential(row),
          row.score ?? "Não informado",
        ]
          .map(escapeCsv)
          .join(";"),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leads-reis-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const stageTabs = ["Todos", ...statuses.map((status) => status.nome)];

  return (
    <section className="leads-page">
      <div className="page-heading">
        <div>
          <h1>Leads</h1>
          <p>{data?.total ?? 0} contatos encontrados</p>
        </div>
        <button
          className="gold-button lead-create"
          onClick={() => setCreating(true)}
        >
          <Plus size={18} /> Novo lead
        </button>
      </div>
      {creating && (
        <NewLeadDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setVersion((value) => value + 1);
          }}
        />
      )}
      {selectedLead?.id && (
        <LeadDetails
          lead={selectedLead}
          statuses={statuses}
          onClose={() => setSelectedLead(null)}
          onChanged={() => {
            setSelectedLead(null);
            setVersion((value) => value + 1);
          }}
        />
      )}
      <article className="panel leads-panel">
        <div className="lead-toolbar">
          <div
            className="lead-stages"
            role="tablist"
            aria-label="Etapas dos leads"
          >
            {stageTabs.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={stage === item}
                className={stage === item ? "active" : ""}
                key={item}
                onClick={() => setStage(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="lead-actions">
            <button
              type="button"
              className={filterOpen || fromDate ? "active" : ""}
              onClick={() => setFilterOpen((value) => !value)}
            >
              <Filter size={16} /> Filtrar
            </button>
            <button
              type="button"
              onClick={exportRows}
              disabled={!visible.length}
            >
              <Download size={16} /> Exportar
            </button>
          </div>
        </div>
        {filterOpen && (
          <div className="lead-filters">
            <label>
              Contato atualizado a partir de
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => setFromDate("")}>
              Limpar filtro
            </button>
          </div>
        )}
        {selected.size > 0 && (
          <div className="selection-bar">
            <strong>{selected.size} selecionado(s)</strong>
            <button type="button" onClick={() => setSelected(new Set())}>
              <X size={15} /> Limpar seleção
            </button>
          </div>
        )}
        {loading && (
          <div className="state-panel">
            <RefreshCw className="spin" />
            <span>Buscando leads na API…</span>
          </div>
        )}
        {error && (
          <div className="state-panel error">
            <strong>Não foi possível carregar</strong>
            <span>{error}</span>
            <button onClick={() => setVersion((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="lead-table-scroll">
            <table className="lead-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th>Nome</th>
                  <th>Empresa / segmento</th>
                  <th>Status</th>
                  <th>Data de contato</th>
                  <th>Valor potencial</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const id = String(row.id ?? index);
                  const score = row.score;
                  const email = row.cliente?.email ?? row.email;
                  const phone =
                    row.cliente?.telefone ?? row.telefone ?? row.phone;
                  return (
                    <tr
                      key={id}
                      className={selected.has(id) ? "selected" : ""}
                      onClick={() => row.id && setSelectedLead(row)}
                    >
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggle(id)}
                          aria-label={`Selecionar ${leadName(row)}`}
                        />
                      </td>
                      <td>
                        <div className="lead-person">
                          <i>{initials(leadName(row))}</i>
                          <div>
                            <strong>{leadName(row)}</strong>
                            <small>
                              {email
                                ? String(email)
                                : phone
                                  ? String(phone)
                                  : "Sem contato informado"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {String(
                          row.origem ??
                            row.observacoes ??
                            row.segment ??
                            "Não informado",
                        )}
                      </td>
                      <td>
                        <span
                          className={`lead-status status-${stageName(row).toLowerCase().replaceAll(" ", "-")}`}
                        >
                          {stageName(row)}
                        </span>
                      </td>
                      <td>{formatDate(row.updatedAt ?? row.createdAt)}</td>
                      <td className="potential">{formatPotential(row)}</td>
                      <td>
                        <div className="score-cell">
                          <span>{score ?? "—"}</span>
                          <i>
                            <b
                              style={{
                                width:
                                  score === undefined
                                    ? "0%"
                                    : `${Math.max(0, Math.min(100, Number(score)))}%`,
                              }}
                            />
                          </i>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <div className="empty">
                Nenhum lead corresponde aos filtros selecionados.
              </div>
            )}
          </div>
        )}
        {data && (
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {Math.max(data.totalPages, 1)}
            </span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </article>
    </section>
  );
}

function LeadDetails({
  lead,
  statuses,
  onClose,
  onChanged,
}: {
  lead: LeadRow;
  statuses: LeadStatus[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [history, setHistory] = useState<LeadHistory[]>([]);
  const [statusId, setStatusId] = useState(
    typeof lead.status === "object" && lead.status
      ? String((lead.status as { id?: string }).id ?? "")
      : "",
  );
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!lead.id) return;
    apiRequest<LeadHistory[]>({
      method: "GET",
      path: `/crm/leads/${lead.id}/history`,
    })
      .then((result) => setHistory(result.data))
      .catch((failure) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Falha ao carregar histórico",
        ),
      );
  }, [lead.id]);
  const saveStatus = async () => {
    if (!lead.id || !statusId) return;
    setWorking(true);
    setError("");
    try {
      await apiRequest({
        method: "PATCH",
        path: `/crm/leads/${lead.id}/status`,
        body: { statusId, motivo: reason || undefined },
        idempotencyKey: mutationKey(),
      });
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível atualizar o lead",
      );
      setWorking(false);
    }
  };
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="dialog lead-details">
        <div className="panel-heading">
          <div>
            <span className="lead-status">{stageName(lead)}</span>
            <h2>{leadName(lead)}</h2>
            <p>
              {lead.cliente?.email ??
                lead.cliente?.telefone ??
                "Contato não informado"}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        <dl className="opportunity-detail-grid">
          <div>
            <dt>Origem</dt>
            <dd>{lead.origem ?? "Não informada"}</dd>
          </div>
          <div>
            <dt>Prioridade</dt>
            <dd>{lead.prioridade ?? "Não definida"}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{lead.score ?? 0}</dd>
          </div>
          <div>
            <dt>Valor potencial</dt>
            <dd>{formatPotential(lead)}</dd>
          </div>
        </dl>
        {lead.observacoes && (
          <div className="review-notes">
            <strong>Observações</strong>
            <p>{lead.observacoes}</p>
          </div>
        )}
        <div className="lead-status-editor">
          <label>
            Nova etapa
            <select
              value={statusId}
              onChange={(event) => setStatusId(event.target.value)}
            >
              <option value="">Selecione…</option>
              {statuses.map((status) => (
                <option value={status.id} key={status.id}>
                  {status.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo / contexto
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Registre por que o lead mudou de etapa"
            />
          </label>
          <button
            type="button"
            className="gold-button"
            disabled={working || !statusId}
            onClick={() => void saveStatus()}
          >
            Atualizar etapa
          </button>
        </div>
        <div className="lead-attendance-history">
          <div>
            <strong>Atendimentos vinculados</strong>
            <span>
              {lead.totalAtendimentos ?? lead.atendimentosRecentes?.length ?? 0}{" "}
              registro(s)
            </span>
          </div>
          {lead.atendimentosRecentes?.length ? (
            <ul>
              {lead.atendimentosRecentes.map((attendance) => (
                <li key={attendance.id}>
                  <div>
                    <strong>
                      {attendance.tipoAtendimento?.nome ?? "Atendimento"}
                    </strong>
                    <span className="status-chip">
                      {attendance.status ?? "aberto"}
                    </span>
                  </div>
                  <small>
                    {attendance.createdAt
                      ? new Date(attendance.createdAt).toLocaleString("pt-BR")
                      : "Data não informada"}
                    {attendance.empreendimento?.nome
                      ? ` · ${attendance.empreendimento.nome}`
                      : ""}
                    {attendance.valorNegociacao
                      ? ` · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(attendance.valorNegociacao)}`
                      : ""}
                  </small>
                  {attendance.observacoes && <p>{attendance.observacoes}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-note">Nenhum atendimento vinculado.</p>
          )}
        </div>
        <div className="lead-history">
          <strong>Histórico de etapas</strong>
          {history.length ? (
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.statusAnterior?.nome ?? "Entrada"} →{" "}
                    {item.statusNovo?.nome ?? "Etapa"}
                  </span>
                  <small>
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                    {item.usuario?.nome ? ` · ${item.usuario.nome}` : ""}
                    {item.motivo ? ` · ${item.motivo}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-note">
              Nenhuma mudança de etapa registrada.
            </p>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="outline-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function NewLeadDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const accountBody = {
      name: String(values.get("name") ?? ""),
      email: String(values.get("email") ?? "") || undefined,
      phone: String(values.get("phone") ?? "") || undefined,
      document: String(values.get("document") ?? "") || undefined,
      segment: String(values.get("segment") ?? "") || undefined,
    };
    try {
      const account = await apiRequest<{ id: string }>({
        method: "POST",
        path: "/crm/accounts",
        body: accountBody,
        idempotencyKey: mutationKey(),
      });
      await apiRequest({
        method: "POST",
        path: "/crm/leads",
        body: {
          clienteId: account.data.id,
          origem: String(values.get("origin") ?? "") || "cadastro_manual",
          prioridade: String(values.get("priority") ?? "") || "media",
          score: Number(values.get("score") ?? 0),
          valorPotencial: Number(values.get("potentialValue") ?? 0),
          observacoes: String(values.get("notes") ?? "") || undefined,
        },
        idempotencyKey: mutationKey(),
      });
      onCreated();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível criar o lead",
      );
      setSaving(false);
    }
  };
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="dialog lead-dialog" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <h2>Novo lead</h2>
            <p>Cadastre o cliente e o lead comercial na API REIS.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="dialog-fields">
          <label>
            Nome completo
            <input name="name" required autoFocus />
          </label>
          <label>
            E-mail
            <input name="email" type="email" />
          </label>
          <label>
            Telefone
            <input name="phone" />
          </label>
          <label>
            CPF/CNPJ
            <input name="document" />
          </label>
          <label>
            Empresa / segmento
            <input name="segment" />
          </label>
          <label>
            Origem
            <input name="origin" placeholder="Indicação, WhatsApp, site…" />
          </label>
          <label>
            Prioridade
            <select name="priority" defaultValue="media">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label>
            Score
            <input name="score" type="number" min="0" defaultValue="0" />
          </label>
          <label>
            Valor potencial (R$)
            <input
              name="potentialValue"
              type="number"
              min="0"
              step=".01"
              defaultValue="0"
            />
          </label>
          <label className="full-field">
            Observações
            <textarea name="notes" rows={3} />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="outline-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="gold-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
