import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { PublicSession } from "../electron/contracts";
import {
  apiConfiguration,
  apiRequest,
  apiUploadFile,
  mutationKey,
  ReisApiError,
} from "./api";
import LeadsPage from "./Leads";
import OperationalFlow from "./OperationalFlow";

type CatalogItem = {
  id: string;
  nome: string;
  codigo?: string;
  exigeAgendamento?: boolean;
  exigeFoto?: boolean;
};
type Catalogs = {
  tiposAtendimento: CatalogItem[];
  origens: CatalogItem[];
  statusNegociacao: CatalogItem[];
  periodos: CatalogItem[];
  papeisComerciais: CatalogItem[];
};
type Development = { id: string; nome: string; tipo?: string; cidade?: string };
type User = {
  id: string;
  empresaId?: string;
  nome?: string;
  name?: string;
  email?: string;
  ativo?: boolean;
  role?: string;
  cargo?: { nome?: string };
};
type CicManual = {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  ativo?: boolean;
};
type RelatedItem = { id: string; nome: string; telefone?: string };
type Money = { amount: string; currency: "BRL" };
type Attendance = Record<string, unknown> & {
  id: string;
  status?: string;
  cliente?: RelatedItem;
  empreendimento?: RelatedItem;
  responsavel?: RelatedItem;
  cic?: RelatedItem & { tipo?: "usuario" | "manual" };
  tipoAtendimento?: RelatedItem;
  valorNegociacao?: Money;
  observacoes?: string;
  foto?: { url?: string; mimeType?: string | null };
  fotoUrl?: string;
  createdAt?: string;
};
type AttendanceList = {
  items: Attendance[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type AttendanceImportBody = {
  sourceRow: number;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail?: string;
  periodoId?: string;
  tipoAtendimentoId: string;
  empreendimentoId?: string;
  statusNegociacaoId?: string;
  origemId?: string;
  cicId?: string;
  cicManualId?: string;
  responsavelId: string;
  valorNegociacao?: number;
  observacoes?: string;
};

type AttendanceImportRow = {
  sheetRow: number;
  clientName: string;
  phone: string;
  typeName: string;
  body?: AttendanceImportBody;
  errors: string[];
};

type AttendanceImportJob = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  failedRows: number;
  cancelRequested?: boolean;
  createdAt?: string;
  failures?: { row: number; error: string }[];
};

const normalizeLabel = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function importCell(row: Record<string, unknown>, aliases: string[]) {
  const wanted = aliases.map(normalizeLabel);
  const entry = Object.entries(row).find(([key]) =>
    wanted.includes(normalizeLabel(key)),
  );
  return String(entry?.[1] ?? "").trim();
}

const emptyCatalogs: Catalogs = {
  tiposAtendimento: [],
  origens: [],
  statusNegociacao: [],
  periodos: [],
  papeisComerciais: [],
};

function money(value: unknown) {
  const amount =
    value && typeof value === "object" && "amount" in value
      ? (value as Money).amount
      : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(amount ?? 0));
}

function apiErrorMessage(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  if (reason instanceof ReisApiError) {
    const fieldDetails = reason.fields
      ? Object.entries(reason.fields)
          .flatMap(([field, messages]) =>
            messages.map((message) => `${field}: ${message}`),
          )
          .join(" • ")
      : "";
    const message =
      reason.code === "DATABASE_SCHEMA_OUTDATED"
        ? "O serviço de atendimentos está temporariamente indisponível enquanto o banco é atualizado."
        : reason.code === "INVALID_ATTENDANCE_REFERENCE"
          ? `Revise os campos informados.${fieldDetails ? ` ${fieldDetails}` : ""}`
          : reason.status === 409
            ? "Já existe um registro conflitante com os dados informados."
            : reason.message;
    return `${message}${reason.requestId ? ` (protocolo ${reason.requestId})` : ""}`;
  }
  return reason.message;
}

function attendancePhoto(attendance: Attendance) {
  const value = attendance.foto?.url ?? attendance.fotoUrl;
  if (!value) return undefined;
  try {
    const apiBase = new URL(
      `${apiConfiguration.baseUrl.replace(/\/+$/, "")}/`,
      window.location.origin,
    );
    return new URL(value, apiBase).toString();
  } catch {
    return value;
  }
}

function AttendancePhoto({
  attendance,
  compact = false,
}: {
  attendance: Attendance;
  compact?: boolean;
}) {
  const url = attendancePhoto(attendance);
  if (compact)
    return url ? (
      <a
        className="attendance-photo-icon has-image"
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        title="Abrir imagem do atendimento"
        aria-label="Abrir imagem do atendimento"
      >
        <Camera size={16} />
      </a>
    ) : (
      <span
        className="attendance-photo-icon"
        title="Sem imagem vinculada"
        aria-label="Sem imagem vinculada"
      >
        <Camera size={16} />
      </span>
    );
  if (!url)
    return (
      <div className="attendance-photo-placeholder">
        <Camera size={28} />
        <span>Nenhuma imagem vinculada a este atendimento.</span>
      </div>
    );
  return (
    <a
      className="attendance-photo-view"
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title="Abrir imagem do atendimento"
    >
      <img
        src={url}
        alt={`Imagem do atendimento de ${attendance.cliente?.nome ?? "cliente"}`}
        loading="lazy"
      />
      <span>Abrir imagem original</span>
    </a>
  );
}

type AttendanceWorkspace = "records" | "leads" | "flow";

export default function AttendancesPage({
  session,
  refreshKey,
  search,
  onNavigate,
}: {
  session: PublicSession;
  refreshKey: number;
  search: string;
  onNavigate: (id: string) => void;
}) {
  const [workspace, setWorkspace] = useState<AttendanceWorkspace>("records");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [items, setItems] = useState<Attendance[]>([]);
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const sessionUser = useMemo<User>(
    () => ({
      id: session.user.id,
      nome: session.user.name,
      email: session.user.email,
      ativo: true,
    }),
    [session.user.email, session.user.id, session.user.name],
  );
  const [users, setUsers] = useState<User[]>([sessionUser]);
  const [manualCics, setManualCics] = useState<CicManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      apiRequest<AttendanceList | Attendance[]>({
        method: "GET",
        path: "/crm/atendimentos?limit=100",
      }),
      apiRequest<Catalogs>({ method: "GET", path: "/crm/catalogos" }),
      apiRequest<Development[]>({
        method: "GET",
        path: "/imobiliario/empreendimentos",
      }),
      apiRequest<User[]>({ method: "GET", path: "/organizacao/usuarios" }),
      apiRequest<CicManual[]>({ method: "GET", path: "/crm/cics" }),
    ])
      .then(
        ([
          attendanceResult,
          catalogResult,
          developmentResult,
          userResult,
          cicResult,
        ]) => {
          if (!current) return;
          if (attendanceResult.status === "fulfilled") {
            const payload = attendanceResult.value.data;
            setItems(Array.isArray(payload) ? payload : payload.items);
          } else {
            setError(
              apiErrorMessage(
                attendanceResult.reason,
                "Falha ao carregar atendimentos",
              ),
            );
          }
          if (catalogResult.status === "fulfilled")
            setCatalogs(catalogResult.value.data);
          if (developmentResult.status === "fulfilled")
            setDevelopments(developmentResult.value.data);
          if (userResult.status === "fulfilled") {
            const result = userResult.value.data.filter(
              (candidate) =>
                !session.user.companyId ||
                !candidate.empresaId ||
                candidate.empresaId === session.user.companyId,
            );
            setUsers(
              result.some((user) => user.id === session.user.id)
                ? result
                : [sessionUser, ...result],
            );
          }
          if (cicResult.status === "fulfilled")
            setManualCics(cicResult.value.data);
        },
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [
    refreshKey,
    session.user.companyId,
    session.user.id,
    sessionUser,
    version,
  ]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(term),
    );
  }, [items, query]);
  const openAttendance = async (attendance: Attendance) => {
    setError("");
    try {
      const result = await apiRequest<Attendance>({
        method: "GET",
        path: `/crm/atendimentos/${attendance.id}`,
      });
      setSelected({
        ...result.data,
        ...attendance,
        observacoes: result.data.observacoes ?? attendance.observacoes,
      });
    } catch (reason) {
      setError(apiErrorMessage(reason, "Não foi possível abrir o atendimento"));
    }
  };
  const workspaceNavigation = (id: string) => {
    if (id === "leads") setWorkspace("leads");
    else if (id === "fluxo" || id === "atendimentos")
      setWorkspace(id === "fluxo" ? "flow" : "records");
    else onNavigate(id);
  };
  const tabs = (
    <nav
      className="attendance-workspace-tabs"
      aria-label="Operação de atendimentos"
    >
      <button
        type="button"
        className={workspace === "records" ? "active" : ""}
        onClick={() => setWorkspace("records")}
      >
        Atendimentos
      </button>
      <button
        type="button"
        className={workspace === "leads" ? "active" : ""}
        onClick={() => setWorkspace("leads")}
      >
        Leads vinculados
      </button>
      <button
        type="button"
        className={workspace === "flow" ? "active" : ""}
        onClick={() => setWorkspace("flow")}
      >
        Fluxo &amp; comunicação
      </button>
    </nav>
  );
  if (workspace === "leads")
    return (
      <section className="attendance-workspace">
        {tabs}
        <LeadsPage search={search} refreshKey={refreshKey} />
      </section>
    );
  if (workspace === "flow")
    return (
      <section className="attendance-workspace">
        {tabs}
        <OperationalFlow
          refreshKey={refreshKey}
          onNavigate={workspaceNavigation}
        />
      </section>
    );
  if (mode === "form")
    return (
      <AttendanceForm
        session={session}
        catalogs={catalogs}
        developments={developments}
        users={users}
        manualCics={manualCics}
        onCancel={() => setMode("list")}
        onCreated={() => {
          setMode("list");
          setVersion((value) => value + 1);
        }}
      />
    );
  return (
    <section className="attendance-page">
      {tabs}
      <div className="page-heading">
        <div>
          <h1>Atendimentos</h1>
          <p>{items.length} registros comerciais encontrados.</p>
        </div>
        <div className="attendance-heading-actions">
          <button
            type="button"
            className="outline-button"
            onClick={() => setShowImport(true)}
          >
            <FileSpreadsheet size={18} /> Importar Excel
          </button>
          <button
            className="gold-button attendance-create"
            onClick={() => setMode("form")}
          >
            <Plus size={18} /> Novo atendimento
          </button>
        </div>
      </div>
      {showImport && (
        <AttendanceImportDialog
          catalogs={catalogs}
          developments={developments}
          users={users}
          manualCics={manualCics}
          session={session}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setVersion((value) => value + 1);
          }}
        />
      )}
      {selected && (
        <AttendanceDetails
          attendance={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            setVersion((value) => value + 1);
          }}
        />
      )}
      <article className="panel attendance-list-panel">
        <div className="attendance-list-toolbar">
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar no histórico…"
            />
          </label>
          <button
            type="button"
            onClick={() => setVersion((value) => value + 1)}
          >
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
        {loading && (
          <div className="state-panel">
            <RefreshCw className="spin" />
            <span>Consultando atendimentos…</span>
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
          <div className="table-scroll">
            <table className="data-table attendance-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Empreendimento</th>
                  <th>Tipo</th>
                  <th>Responsável</th>
                  <th>CIC</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Imagem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} onClick={() => void openAttendance(item)}>
                    <td data-label="Data" className="attendance-date">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td data-label="Cliente" className="attendance-client">
                      <strong>{item.cliente?.nome ?? "Não informado"}</strong>
                    </td>
                    <td data-label="Empreendimento">
                      {item.empreendimento?.nome ?? "Não informado"}
                    </td>
                    <td data-label="Tipo">
                      {item.tipoAtendimento?.nome ?? "Não informado"}
                    </td>
                    <td data-label="Responsável">
                      {item.responsavel?.nome ?? "Não informado"}
                    </td>
                    <td data-label="CIC">
                      {item.cic?.nome ?? "Não informado"}
                    </td>
                    <td data-label="Valor" className="attendance-value">
                      {item.valorNegociacao === undefined
                        ? "—"
                        : money(item.valorNegociacao)}
                    </td>
                    <td data-label="Status" className="attendance-status">
                      <span className="status-chip">
                        {item.status ?? "aberto"}
                      </span>
                    </td>
                    <td data-label="Imagem" className="attendance-image">
                      <AttendancePhoto attendance={item} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty">Nenhum atendimento encontrado.</div>
            )}
          </div>
        )}
      </article>
    </section>
  );
}

function AttendanceImportDialog({
  catalogs,
  developments,
  users,
  manualCics,
  session,
  onClose,
  onImported,
}: {
  catalogs: Catalogs;
  developments: Development[];
  users: User[];
  manualCics: CicManual[];
  session: PublicSession;
  onClose: () => void;
  onImported: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AttendanceImportRow[]>([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<AttendanceImportJob | null>(null);
  const [history, setHistory] = useState<AttendanceImportJob[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await apiRequest<AttendanceImportJob[]>({
        method: "GET",
        path: "/crm/atendimentos/imports",
      });
      setHistory(response.data);
    } catch {
      // O histórico é complementar e não deve impedir uma nova importação.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const poll = window.setInterval(() => {
      void apiRequest<AttendanceImportJob>({
        method: "GET",
        path: `/crm/atendimentos/imports/${job.id}`,
      })
        .then((response) => {
          setJob(response.data);
          if (!["queued", "processing"].includes(response.data.status)) {
            void loadHistory();
            if (response.data.importedRows > 0) onImported();
          }
        })
        .catch((reason) =>
          setMessage(apiErrorMessage(reason, "Não foi possível atualizar o progresso.")),
        );
    }, 1500);
    return () => window.clearInterval(poll);
  }, [job, loadHistory, onImported]);

  const findItem = <T extends { id: string; nome?: string; codigo?: string }>(
    items: T[],
    value: string,
  ) => {
    const normalized = normalizeLabel(value);
    return items.find(
      (item) =>
        item.id === value ||
        normalizeLabel(item.nome) === normalized ||
        normalizeLabel(item.codigo) === normalized,
    );
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      {
        "Nome do cliente": "Maria da Silva",
        Telefone: "65999999999",
        Email: "maria@exemplo.com",
        "Tipo de atendimento": catalogs.tiposAtendimento[0]?.nome ?? "Visita",
        Empreendimento: developments[0]?.nome ?? "",
        "Status da negociação": catalogs.statusNegociacao[0]?.nome ?? "",
        Origem: catalogs.origens[0]?.nome ?? "",
        Período: catalogs.periodos[0]?.nome ?? "",
        Responsável: session.user.name,
        CIC: "",
        "Valor da negociação": 350000,
        Observações: "Cliente importado por planilha",
      },
    ]);
    sheet["!cols"] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 28 },
      { wch: 24 },
      { wch: 24 },
      { wch: 23 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
      { wch: 22 },
      { wch: 22 },
      { wch: 38 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Atendimentos");
    XLSX.writeFile(book, "modelo-importacao-atendimentos-reis.xlsx");
  };

  const readFile = async (file: File) => {
    setReading(true);
    setMessage("");
    setRows([]);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      if (!source.length) throw new Error("A primeira aba da planilha está vazia.");
      if (source.length > 10000)
        throw new Error("A planilha pode conter no máximo 10.000 atendimentos.");

      const parsed = source.map((sourceRow, index): AttendanceImportRow => {
        const clientName = importCell(sourceRow, ["nome do cliente", "cliente"]);
        const phone = importCell(sourceRow, ["telefone", "celular", "whatsapp"]);
        const email = importCell(sourceRow, ["email", "e-mail"]);
        const typeName = importCell(sourceRow, ["tipo de atendimento", "tipo"]);
        const developmentName = importCell(sourceRow, ["empreendimento"]);
        const statusName = importCell(sourceRow, [
          "status da negociacao",
          "status negociacao",
        ]);
        const originName = importCell(sourceRow, ["origem"]);
        const periodName = importCell(sourceRow, ["periodo"]);
        const responsibleName = importCell(sourceRow, ["responsavel"]);
        const cicName = importCell(sourceRow, ["cic"]);
        const valueText = importCell(sourceRow, [
          "valor da negociacao",
          "valor negociacao",
          "valor",
        ]);
        const notes = importCell(sourceRow, ["observacoes", "observacao"]);
        const errors: string[] = [];
        const digits = phone.replace(/\D/g, "");
        const type = findItem(catalogs.tiposAtendimento, typeName);
        const development = developmentName
          ? findItem(developments, developmentName)
          : undefined;
        const status = statusName
          ? findItem(catalogs.statusNegociacao, statusName)
          : undefined;
        const origin = originName
          ? findItem(catalogs.origens, originName)
          : undefined;
        const period = periodName
          ? findItem(catalogs.periodos, periodName)
          : undefined;
        const responsible = responsibleName
          ? users.find(
              (user) =>
                user.id === responsibleName ||
                normalizeLabel(user.nome ?? user.name) ===
                  normalizeLabel(responsibleName) ||
                normalizeLabel(user.email) === normalizeLabel(responsibleName),
            )
          : users.find((user) => user.id === session.user.id) ?? session.user;
        const userCic = cicName
          ? users.find(
              (user) =>
                user.id === cicName ||
                normalizeLabel(user.nome ?? user.name) === normalizeLabel(cicName),
            )
          : undefined;
        const manualCic = cicName
          ? findItem(manualCics, cicName)
          : undefined;
        const numericValue = valueText
          ? Number(
              valueText
                .replace(/[^\d,.-]/g, "")
                .replace(/\.(?=\d{3}(?:\D|$))/g, "")
                .replace(",", "."),
            )
          : undefined;

        if (!clientName) errors.push("Nome do cliente não informado");
        if (digits.length < 8) errors.push("Telefone inválido");
        if (!type) errors.push("Tipo de atendimento não encontrado");
        if (developmentName && !development)
          errors.push("Empreendimento não encontrado");
        if (statusName && !status) errors.push("Status não encontrado");
        if (originName && !origin) errors.push("Origem não encontrada");
        if (periodName && !period) errors.push("Período não encontrado");
        if (!responsible) errors.push("Responsável não encontrado");
        if (cicName && !userCic && !manualCic) errors.push("CIC não encontrado");
        if (valueText && (!Number.isFinite(numericValue) || Number(numericValue) < 0))
          errors.push("Valor da negociação inválido");

        return {
          sheetRow: index + 2,
          clientName,
          phone,
          typeName,
          errors,
          body:
            errors.length || !type || !responsible
              ? undefined
              : {
                  sourceRow: index + 2,
                  clienteNome: clientName,
                  clienteTelefone: phone,
                  clienteEmail: email || undefined,
                  tipoAtendimentoId: type.id,
                  empreendimentoId: development?.id,
                  statusNegociacaoId: status?.id,
                  origemId: origin?.id,
                  periodoId: period?.id,
                  responsavelId: responsible.id,
                  cicId: userCic?.id,
                  cicManualId: userCic ? undefined : manualCic?.id,
                  valorNegociacao: numericValue,
                  observacoes: notes || undefined,
                },
        };
      });
      setRows(parsed);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Não foi possível ler a planilha.",
      );
    } finally {
      setReading(false);
    }
  };

  const validRows = rows.filter(
    (row): row is AttendanceImportRow & { body: AttendanceImportBody } =>
      Boolean(row.body),
  );
  const importRows = async () => {
    if (!validRows.length) return;
    setImporting(true);
    setMessage("");
    try {
      const result = await apiRequest<AttendanceImportJob>({
        method: "POST",
        path: "/crm/atendimentos/imports",
        body: {
          fileName: fileName || "importacao-atendimentos.xlsx",
          atendimentos: validRows.map((row) => row.body),
        },
        idempotencyKey: mutationKey(),
      });
      setJob(result.data);
      setRows([]);
      void loadHistory();
    } catch (reason) {
      setMessage(apiErrorMessage(reason, "Não foi possível importar os atendimentos."));
    } finally {
      setImporting(false);
    }
  };

  const updateJob = async (action: "cancel" | "retry") => {
    if (!job) return;
    setMessage("");
    try {
      const response = await apiRequest<AttendanceImportJob>({
        method: "POST",
        path: `/crm/atendimentos/imports/${job.id}/${action}`,
        body: {},
        idempotencyKey: mutationKey(),
      });
      setJob((current) => ({ ...current!, ...response.data }));
      void loadHistory();
    } catch (reason) {
      setMessage(apiErrorMessage(reason, `Não foi possível ${action === "cancel" ? "cancelar" : "retomar"} a importação.`));
    }
  };

  const progress = job
    ? Math.min(100, Math.round((job.processedRows / job.totalRows) * 100))
    : 0;
  const statusLabel: Record<string, string> = {
    queued: "Na fila",
    processing: "Processando",
    completed: "Concluída",
    completed_with_errors: "Concluída com erros",
    cancelled: "Cancelada",
    failed: "Falha operacional",
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog attendance-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-import-title"
      >
        <header className="attendance-import-heading">
          <div>
            <span className="release-eyebrow">Importação em lote</span>
            <h2 id="attendance-import-title">Importar atendimentos do Excel</h2>
            <p>Revise os registros antes de enviá-los para a API.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="attendance-import-actions">
          <button type="button" className="outline-button" onClick={() => void downloadTemplate()}>
            <Download size={17} /> Baixar modelo
          </button>
          <label className="gold-button">
            <Upload size={17} /> {reading ? "Lendo…" : "Selecionar Excel"}
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={reading || importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {fileName && <p className="attendance-import-file"><FileSpreadsheet size={17} /> {fileName}</p>}
        {rows.length > 0 && (
          <>
            <div className="attendance-import-summary">
              <span><strong>{rows.length}</strong> linhas</span>
              <span className="valid"><strong>{validRows.length}</strong> prontas</span>
              <span className="invalid"><strong>{rows.length - validRows.length}</strong> com erro</span>
            </div>
            <div className="attendance-import-preview">
              <table className="data-table">
                <thead><tr><th>Linha</th><th>Cliente</th><th>Telefone</th><th>Tipo</th><th>Validação</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sheetRow}>
                      <td>{row.sheetRow}</td>
                      <td>{row.clientName || "—"}</td>
                      <td>{row.phone || "—"}</td>
                      <td>{row.typeName || "—"}</td>
                      <td className={row.errors.length ? "import-error" : "import-valid"}>
                        {row.errors.length ? row.errors.join("; ") : "Pronta para importar"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {job && (
          <section className="attendance-import-progress" aria-live="polite">
            <div className="attendance-import-progress-heading">
              <div>
                <span>{statusLabel[job.status] ?? job.status}</span>
                <strong>{progress}%</strong>
              </div>
              <small>{job.fileName}</small>
            </div>
            <div className="attendance-import-progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="attendance-import-summary">
              <span><strong>{job.processedRows}</strong> processadas</span>
              <span className="valid"><strong>{job.importedRows}</strong> importadas</span>
              <span className="invalid"><strong>{job.failedRows}</strong> rejeitadas</span>
            </div>
            {job.failures && job.failures.length > 0 && (
              <div className="attendance-import-failures">
                <strong>Erros encontrados</strong>
                {job.failures.slice(0, 100).map((failure) => (
                  <span key={failure.row}>Linha {failure.row}: {failure.error}</span>
                ))}
              </div>
            )}
            <div className="attendance-import-job-actions">
              {["queued", "processing"].includes(job.status) && (
                <button type="button" className="outline-button" onClick={() => void updateJob("cancel")}>
                  Cancelar processamento
                </button>
              )}
              {["failed", "completed_with_errors", "cancelled"].includes(job.status) && (
                <button type="button" className="outline-button" onClick={() => void updateJob("retry")}>
                  Tentar linhas pendentes novamente
                </button>
              )}
            </div>
          </section>
        )}
        {history.length > 0 && (
          <details className="attendance-import-history">
            <summary>Histórico de importações ({history.length})</summary>
            <div>
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() =>
                    void apiRequest<AttendanceImportJob>({
                      method: "GET",
                      path: `/crm/atendimentos/imports/${item.id}`,
                    }).then((response) => setJob(response.data))
                  }
                >
                  <span><strong>{item.fileName}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : ""}</small></span>
                  <span>{statusLabel[item.status] ?? item.status}<small>{item.importedRows}/{item.totalRows} importadas</small></span>
                </button>
              ))}
            </div>
          </details>
        )}
        {message && <div className="settings-message error">{message}</div>}
        <footer className="dialog-actions">
          <button type="button" className="outline-button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="gold-button"
            disabled={!validRows.length || importing || Boolean(job && ["queued", "processing"].includes(job.status))}
            onClick={() => void importRows()}
          >
            {importing ? "Importando…" : `Importar ${validRows.length} atendimentos`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function AttendanceDetails({
  attendance,
  onClose,
  onChanged,
}: {
  attendance: Attendance;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const updateStatus = async (status: "aberto" | "concluido" | "cancelado") => {
    setWorking(true);
    setError("");
    try {
      await apiRequest({
        method: "PATCH",
        path: `/crm/atendimentos/${attendance.id}`,
        body: { status },
        idempotencyKey: mutationKey(),
      });
      onChanged();
    } catch (reason) {
      setError(
        apiErrorMessage(reason, "Não foi possível atualizar o atendimento"),
      );
      setWorking(false);
    }
  };
  const uploadPhoto = async () => {
    if (!photo) return;
    setWorking(true);
    setError("");
    try {
      await apiUploadFile(
        `/crm/atendimentos/${attendance.id}/foto/upload`,
        photo,
      );
      setPhoto(null);
      onChanged();
    } catch (reason) {
      setError(apiErrorMessage(reason, "Não foi possível enviar a imagem"));
      setWorking(false);
    }
  };
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="dialog attendance-details">
        <div className="panel-heading">
          <div>
            <span className="status-chip">{attendance.status ?? "aberto"}</span>
            <h2>{attendance.cliente?.nome ?? "Atendimento"}</h2>
            <p>{attendance.tipoAtendimento?.nome ?? "Atendimento comercial"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <dl className="opportunity-detail-grid">
          <div>
            <dt>Empreendimento</dt>
            <dd>{attendance.empreendimento?.nome ?? "Não informado"}</dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{attendance.responsavel?.nome ?? "Não informado"}</dd>
          </div>
          <div>
            <dt>CIC</dt>
            <dd>{attendance.cic?.nome ?? "Não informado"}</dd>
          </div>
          <div>
            <dt>Valor potencial</dt>
            <dd>
              {attendance.valorNegociacao === undefined
                ? "Não informado"
                : money(attendance.valorNegociacao)}
            </dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>
              {attendance.createdAt
                ? new Date(attendance.createdAt).toLocaleString("pt-BR")
                : "Não informada"}
            </dd>
          </div>
        </dl>
        {attendance.observacoes && (
          <div className="review-notes">
            <strong>Observações</strong>
            <p>{attendance.observacoes}</p>
          </div>
        )}
        <section className="attendance-photo-section">
          <strong>Imagem vinculada ao atendimento</strong>
          <AttendancePhoto attendance={attendance} />
          <div className="attendance-photo-upload">
            <label className="outline-button">
              <Camera size={16} />
              {photo
                ? photo.name
                : attendancePhoto(attendance)
                  ? "Substituir imagem"
                  : "Adicionar imagem"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={working}
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
            {photo && (
              <button
                type="button"
                className="gold-button"
                disabled={working}
                onClick={() => void uploadPhoto()}
              >
                {working ? "Enviando…" : "Enviar imagem"}
              </button>
            )}
          </div>
          <small>JPEG, PNG ou WebP, com tamanho máximo de 8 MB.</small>
        </section>
        {error && <div className="form-error">{error}</div>}
        <div className="dialog-actions">
          {attendance.status !== "cancelado" && (
            <button
              type="button"
              className="outline-button danger-action"
              disabled={working}
              onClick={() => void updateStatus("cancelado")}
            >
              Cancelar
            </button>
          )}
          {attendance.status !== "concluido" && (
            <button
              type="button"
              className="outline-button success-action"
              disabled={working}
              onClick={() => void updateStatus("concluido")}
            >
              Concluir
            </button>
          )}
          <button
            type="button"
            className="gold-button"
            disabled={working}
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceForm({
  session,
  catalogs,
  developments,
  users,
  manualCics,
  onCancel,
  onCreated,
}: {
  session: PublicSession;
  catalogs: Catalogs;
  developments: Development[];
  users: User[];
  manualCics: CicManual[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Record<string, string | boolean>>({
    clientName: "",
    phone: "",
    email: "",
    periodId: "",
    typeId: "",
    developmentId: "",
    negotiationStatusId: "",
    originId: "",
    cicId: "",
    responsibleId: session.user.id,
    value: "",
    notes: "",
    schedule: false,
    start: "",
    end: "",
    location: "",
    googleSync: false,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdAttendanceId, setCreatedAttendanceId] = useState("");
  const [error, setError] = useState("");
  const set = (key: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  const selectedType = catalogs.tiposAtendimento.find(
    (item) => item.id === values.typeId,
  );
  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photo]);
  const canAdvance =
    step === 1
      ? Boolean(
          values.clientName &&
          String(values.phone).replace(/\D/g, "").length >= 8,
        )
      : Boolean(
          values.typeId &&
          values.responsibleId &&
          (!values.schedule || (values.start && values.end)),
        );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < 3) {
      if (canAdvance) setStep((current) => current + 1);
      return;
    }
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = {
      clienteNome: values.clientName,
      clienteTelefone: values.phone,
      clienteEmail: values.email || undefined,
      periodoId: values.periodId || undefined,
      tipoAtendimentoId: values.typeId || undefined,
      empreendimentoId: values.developmentId || undefined,
      statusNegociacaoId: values.negotiationStatusId || undefined,
      origemId: values.originId || undefined,
      cicId: String(values.cicId).startsWith("user:")
        ? String(values.cicId).slice(5)
        : undefined,
      cicManualId: String(values.cicId).startsWith("manual:")
        ? String(values.cicId).slice(7)
        : undefined,
      responsavelId: values.responsibleId || undefined,
      valorNegociacao: values.value ? Number(values.value) : undefined,
      observacoes: values.notes || undefined,
    };
    if (values.schedule) {
      const start = new Date(String(values.start));
      const end = new Date(String(values.end));
      if (end <= start) {
        setError("O fim do agendamento deve ser posterior ao início.");
        setSaving(false);
        return;
      }
      body.agendamento = {
        tipo: selectedType?.codigo ?? "atendimento",
        titulo: `Atendimento — ${values.clientName}`,
        inicio: start.toISOString(),
        fim: end.toISOString(),
        local: values.location || undefined,
        descricao: values.notes || undefined,
        lembreteMinutos: 30,
        googleSyncEnabled: Boolean(values.googleSync),
      };
    }
    let attendanceSaved = Boolean(createdAttendanceId);
    try {
      let attendanceId = createdAttendanceId;
      if (!attendanceId) {
        const created = await apiRequest<{ atendimento: { id: string } }>({
          method: "POST",
          path: "/crm/atendimentos",
          body,
          idempotencyKey: mutationKey(),
        });
        attendanceId = created.data.atendimento.id;
        setCreatedAttendanceId(attendanceId);
        attendanceSaved = true;
      }
      if (photo) {
        await apiUploadFile(
          `/crm/atendimentos/${attendanceId}/foto/upload`,
          photo,
        );
      }
      onCreated();
    } catch (reason) {
      setError(
        attendanceSaved
          ? `O atendimento foi salvo, mas a imagem não foi enviada. ${apiErrorMessage(reason, "Tente enviar novamente.")}`
          : apiErrorMessage(reason, "Não foi possível registrar o atendimento"),
      );
      setSaving(false);
    }
  };

  return (
    <section className="attendance-form-page">
      <div className="page-heading">
        <div>
          <button type="button" className="back-link" onClick={onCancel}>
            <ArrowLeft size={17} /> Atendimentos
          </button>
          <h1>Novo atendimento</h1>
          <p>Registre o contato, o interesse e os próximos passos.</p>
        </div>
      </div>
      <div className="attendance-steps">
        {["Dados do cliente", "Formulário de atendimento", "Revisão"].map(
          (label, index) => (
            <div
              className={`${step === index + 1 ? "active" : ""} ${step > index + 1 ? "complete" : ""}`}
              key={label}
            >
              <i>{step > index + 1 ? <Check size={15} /> : index + 1}</i>
              <span>{label}</span>
            </div>
          ),
        )}
      </div>
      <form className="panel attendance-form-card" onSubmit={submit}>
        {step === 1 && (
          <div className="attendance-form-section">
            <header>
              <h2>Dados do cliente</h2>
              <p>
                Informe os dados necessários para identificar ou pré-cadastrar o
                cliente.
              </p>
            </header>
            <div className="attendance-fields">
              <label>
                Nome completo *
                <input
                  value={String(values.clientName)}
                  onChange={(event) => set("clientName", event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Telefone *
                <input
                  value={String(values.phone)}
                  onChange={(event) => set("phone", event.target.value)}
                  placeholder="(65) 9 9999-9999"
                  required
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={String(values.email)}
                  onChange={(event) => set("email", event.target.value)}
                />
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="attendance-form-section">
            <header>
              <h2>Formulário de Atendimento</h2>
              <p>
                Classifique o atendimento utilizando os catálogos da empresa.
              </p>
            </header>
            <div className="attendance-fields">
              <SelectField
                label="Período"
                value={String(values.periodId)}
                items={catalogs.periodos}
                onChange={(value) => set("periodId", value)}
              />
              <SelectField
                label="Tipo de atendimento *"
                value={String(values.typeId)}
                items={catalogs.tiposAtendimento}
                onChange={(value) => set("typeId", value)}
                required
              />
              <SelectField
                label="Empreendimento"
                value={String(values.developmentId)}
                items={developments}
                onChange={(value) => set("developmentId", value)}
              />
              <SelectField
                label="Status da negociação"
                value={String(values.negotiationStatusId)}
                items={catalogs.statusNegociacao}
                onChange={(value) => set("negotiationStatusId", value)}
              />
              <SelectField
                label="Origem"
                value={String(values.originId)}
                items={catalogs.origens}
                onChange={(value) => set("originId", value)}
              />
              <SelectField
                label="CIC"
                value={String(values.cicId)}
                items={[
                  ...users
                    .filter(
                      (user) =>
                        (user.role ?? user.cargo?.nome ?? "")
                          .trim()
                          .toLowerCase() !== "dev",
                    )
                    .map((user) => ({
                      id: `user:${user.id}`,
                      nome: user.nome ?? user.name ?? user.email ?? "Usuário",
                    })),
                  ...manualCics.map((cic) => ({
                    id: `manual:${cic.id}`,
                    nome: `${cic.nome} (CIC)`,
                  })),
                ]}
                onChange={(value) => set("cicId", value)}
              />
              <SelectField
                label="Responsável *"
                value={String(values.responsibleId)}
                items={users.map((user) => ({
                  id: user.id,
                  nome: user.nome ?? user.name ?? user.email ?? "Usuário",
                }))}
                onChange={(value) => set("responsibleId", value)}
                required
              />
              <label>
                Valor de negociação (R$)
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={String(values.value)}
                  onChange={(event) => set("value", event.target.value)}
                  placeholder="0,00"
                />
              </label>
              <label className="full-field">
                Observações
                <textarea
                  rows={4}
                  value={String(values.notes)}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </label>
              <label className="photo-field full-field">
                <span>Foto do atendimento</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setPhoto(event.target.files?.[0] ?? null)
                  }
                />
                <i>
                  <Camera size={20} />
                  {photo ? photo.name : "Selecionar foto para pré-visualização"}
                </i>
                {photoPreview && (
                  <span className="attendance-photo-preview">
                    <img
                      src={photoPreview}
                      alt="Pré-visualização da foto do atendimento"
                    />
                  </span>
                )}
                <small>
                  JPEG, PNG ou WebP, com tamanho máximo de 8 MB. A imagem será
                  enviada ao salvar o atendimento.
                </small>
              </label>
              <label className="attendance-check full-field">
                <input
                  type="checkbox"
                  checked={Boolean(values.schedule)}
                  onChange={(event) => set("schedule", event.target.checked)}
                />{" "}
                Criar agendamento junto com o atendimento
              </label>
              {values.schedule && (
                <>
                  <label>
                    Início
                    <input
                      type="datetime-local"
                      value={String(values.start)}
                      onChange={(event) => set("start", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="datetime-local"
                      value={String(values.end)}
                      onChange={(event) => set("end", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Local
                    <input
                      value={String(values.location)}
                      onChange={(event) => set("location", event.target.value)}
                    />
                  </label>
                  <label className="attendance-check">
                    <input
                      type="checkbox"
                      checked={Boolean(values.googleSync)}
                      onChange={(event) =>
                        set("googleSync", event.target.checked)
                      }
                    />{" "}
                    Sincronizar com Google Calendar
                  </label>
                </>
              )}
              {selectedType?.exigeFoto && (
                <div className="catalog-warning full-field">
                  Este tipo de atendimento exige foto conforme o catálogo da
                  empresa.
                </div>
              )}
            </div>
          </div>
        )}
        {step === 3 && (
          <AttendanceReview
            values={values}
            catalogs={catalogs}
            developments={developments}
            users={users}
            manualCics={manualCics}
            photo={photo}
          />
        )}
        {error && <div className="form-error">{error}</div>}
        <footer className="attendance-form-actions">
          {step > 1 ? (
            <button
              type="button"
              className="outline-button"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          ) : (
            <button type="button" className="outline-button" onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button
            className="gold-button"
            disabled={saving || (step < 3 && !canAdvance)}
          >
            {saving ? (
              "Registrando…"
            ) : step < 3 ? (
              <>
                Continuar <ArrowRight size={16} />
              </>
            ) : (
              <>
                Confirmar atendimento <Check size={16} />
              </>
            )}
          </button>
        </footer>
      </form>
    </section>
  );
}

function SelectField({
  label,
  value,
  items,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  items: Array<{ id: string; nome: string }>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        <option value="">Selecione…</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

function AttendanceReview({
  values,
  catalogs,
  developments,
  users,
  manualCics,
  photo,
}: {
  values: Record<string, string | boolean>;
  catalogs: Catalogs;
  developments: Development[];
  users: User[];
  manualCics: CicManual[];
  photo: File | null;
}) {
  const find = (
    items: Array<{ id: string; nome?: string; name?: string; email?: string }>,
    id: unknown,
  ) =>
    items.find((item) => item.id === id)?.nome ??
    items.find((item) => item.id === id)?.name ??
    items.find((item) => item.id === id)?.email ??
    "Não informado";
  const rows = [
    ["Cliente", values.clientName],
    ["Telefone", values.phone],
    ["E-mail", values.email || "Não informado"],
    ["Período", find(catalogs.periodos, values.periodId)],
    ["Tipo", find(catalogs.tiposAtendimento, values.typeId)],
    ["Empreendimento", find(developments, values.developmentId)],
    ["Status", find(catalogs.statusNegociacao, values.negotiationStatusId)],
    ["Origem", find(catalogs.origens, values.originId)],
    [
      "CIC",
      String(values.cicId).startsWith("manual:")
        ? find(manualCics, String(values.cicId).slice(7))
        : find(users, String(values.cicId).replace(/^user:/, "")),
    ],
    ["Responsável", find(users, values.responsibleId)],
    ["Valor", values.value ? money(values.value) : "Não informado"],
    ["Foto local", photo?.name ?? "Não selecionada"],
    [
      "Agendamento",
      values.schedule ? `${values.start} até ${values.end}` : "Não solicitado",
    ],
  ];
  return (
    <div className="attendance-form-section">
      <header>
        <h2>Revisão</h2>
        <p>Confira os dados antes de registrar na API REIS.</p>
      </header>
      <dl className="attendance-review">
        {rows.map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
      {values.notes && (
        <div className="review-notes">
          <strong>Observações</strong>
          <p>{values.notes}</p>
        </div>
      )}
    </div>
  );
}
