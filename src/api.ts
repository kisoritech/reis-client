import type {
  AllowedApiRequest,
  ApiResult,
  LoginInput,
  PublicSession,
  PublicUser,
} from "../electron/contracts";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[]>;
  };
  meta?: { requestId?: string };
};

type StoredWebSession = PublicSession & {
  accessToken: string;
  refreshToken: string;
};

export class ReisApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly fields?: Record<string, string[]>;
  readonly retryAfter?: number;

  constructor(
    message: string,
    status: number,
    code?: string,
    requestId?: string,
    fields?: Record<string, string[]>,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ReisApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

export const SESSION_EXPIRED_EVENT = "reis:session-expired";

// Durante o desenvolvimento web, o proxy mantém as chamadas na mesma origem.
// Isso permite usar a API publicada sem depender da configuração CORS remota.
const API_BASE = (
  import.meta.env.DEV
    ? "/api/v1"
    : (import.meta.env.VITE_API_BASE_URL ??
      import.meta.env.VITE_REIS_API_URL ??
      "https://api-reis.vercel.app/api/v1")
).replace(/\/+$/, "");
const STORAGE_KEY = "reis.web.session";
let refreshPromise: Promise<boolean> | null = null;

function readWebSession(): StoredWebSession | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredWebSession) : null;
  } catch {
    return null;
  }
}

function writeWebSession(session: StoredWebSession | null) {
  if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(STORAGE_KEY);
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "success" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.success)
      throw new Error(
        envelope.error?.message ?? envelope.message ?? "Falha na API",
      );
    return envelope.data as T;
  }
  return body as T;
}

function normalizeUser(value: Record<string, unknown>): PublicUser {
  return {
    id: String(value.id ?? ""),
    name: String(value.name ?? value.nome ?? value.email ?? "Usuário"),
    email: String(value.email ?? ""),
    phone: value.phone
      ? String(value.phone)
      : value.telefone
        ? String(value.telefone)
        : undefined,
    companyId: value.companyId
      ? String(value.companyId)
      : value.empresaId
        ? String(value.empresaId)
        : undefined,
    role:
      value.role && typeof value.role !== "object"
        ? String(value.role)
        : value.cargo &&
            typeof value.cargo === "object" &&
            "nome" in value.cargo
          ? String((value.cargo as { nome: unknown }).nome)
          : undefined,
    avatarUrl: value.avatarUrl ? String(value.avatarUrl) : undefined,
    permissions: Array.isArray(value.permissions)
      ? value.permissions.map(String)
      : [],
  };
}

function normalizeAuth(body: unknown): StoredWebSession {
  const data = unwrap<Record<string, unknown>>(body);
  const accessToken = String(
    data.accessToken ?? data.access_token ?? data.token ?? "",
  );
  const refreshToken = String(data.refreshToken ?? data.refresh_token ?? "");
  const expiresIn = Number(data.expiresIn ?? data.expires_in ?? 3600);
  const expiresAt = data.expiresAt
    ? String(data.expiresAt)
    : new Date(Date.now() + expiresIn * 1000).toISOString();
  if (!accessToken || !refreshToken || !data.user)
    throw new Error("Resposta de autenticação inválida");
  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: normalizeUser(data.user as Record<string, unknown>),
  };
}

async function webFetch(
  path: string,
  init: RequestInit,
  retry = true,
): Promise<Response> {
  const session = readWebSession();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ReisApiError(
        "A API demorou mais de 15 segundos para responder",
        0,
      );
    }
    throw new ReisApiError("Sem conexão com a API REIS", 0);
  } finally {
    window.clearTimeout(timeout);
  }
  if (
    response.status === 401 &&
    retry &&
    session &&
    (await refreshWebSession())
  ) {
    return webFetch(path, init, false);
  }
  if (response.status === 401 && session) {
    writeWebSession(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
}

async function refreshWebSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = readWebSession();
    if (!current) return false;
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!response.ok) {
      writeWebSession(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      return false;
    }
    writeWebSession(normalizeAuth(await response.json()));
    return true;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = body as ApiEnvelope<unknown> | null;
    const fallback: Record<number, string> = {
      401: "Sua sessão expirou. Entre novamente.",
      403: "Seu perfil não possui permissão para esta operação.",
      422: "Revise os campos informados.",
      429: "Muitas solicitações. Aguarde e tente novamente.",
    };
    const fieldDetails = envelope?.error?.fields
      ? Object.entries(envelope.error.fields)
          .flatMap(([field, messages]) =>
            messages.map((message) => `${field}: ${message}`),
          )
          .join(" • ")
      : "";
    const message =
      envelope?.error?.message ??
      envelope?.message ??
      fallback[response.status] ??
      `API indisponível (${response.status})`;
    throw new ReisApiError(
      fieldDetails ? `${message} • ${fieldDetails}` : message,
      response.status,
      envelope?.error?.code,
      response.headers.get("x-request-id") ?? envelope?.meta?.requestId,
      envelope?.error?.fields,
      Number(response.headers.get("retry-after")) || undefined,
    );
  }
  return {
    data: unwrap<T>(body),
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
  };
}

export const authApi = {
  async session(): Promise<PublicSession | null> {
    if (window.reisDesktop) return window.reisDesktop.auth.session();
    const session = readWebSession();
    if (!session) return null;
    if (
      new Date(session.expiresAt).getTime() <= Date.now() &&
      !(await refreshWebSession())
    ) {
      return null;
    }
    const current = readWebSession();
    if (!current) return null;
    try {
      const response = await webFetch("/auth/me", { method: "GET" });
      if (response.ok) {
        const value = unwrap<Record<string, unknown>>(await response.json());
        const rawUser = (value.user ?? value) as Record<string, unknown>;
        current.user = { ...current.user, ...normalizeUser(rawUser) };
        writeWebSession(current);
      }
    } catch {
      // A sessão local continua válida quando a consulta de perfil estiver temporariamente indisponível.
    }
    return { user: current.user, expiresAt: current.expiresAt };
  },
  async login(input: LoginInput): Promise<PublicSession> {
    if (window.reisDesktop) return window.reisDesktop.auth.login(input);
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as ApiEnvelope<unknown> | null;
      throw new Error(
        body?.error?.message ?? body?.message ?? "E-mail ou senha inválidos",
      );
    }
    const session = normalizeAuth(await response.json());
    writeWebSession(session);
    return { user: session.user, expiresAt: session.expiresAt };
  },
  async logout() {
    if (window.reisDesktop) return window.reisDesktop.auth.logout();
    const session = readWebSession();
    if (session) {
      await webFetch("/auth/logout", { method: "POST" }, false).catch(
        () => undefined,
      );
    }
    writeWebSession(null);
  },
};

export async function apiRequest<T>(
  input: AllowedApiRequest,
): Promise<ApiResult<T>> {
  if (window.reisDesktop) {
    return window.reisDesktop.api.request(input) as Promise<ApiResult<T>>;
  }
  const response = await webFetch(input.path, {
    method: input.method,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: input.idempotencyKey
      ? { "Idempotency-Key": input.idempotencyKey }
      : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiUploadFile<T>(
  path: string,
  file: File,
): Promise<ApiResult<T>> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Selecione uma imagem JPEG, PNG ou WebP");
  }
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 8 MB");
  }
  if (window.reisDesktop) {
    return window.reisDesktop.api.upload({
      path,
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
    }) as Promise<ApiResult<T>>;
  }
  const form = new FormData();
  form.append("file", file, file.name);
  return parseResponse<T>(await webFetch(path, { method: "POST", body: form }));
}

export async function apiHealth() {
  return apiRequest<{
    status: string;
    database?: { status?: string };
    timestamp?: string;
  }>({ method: "GET", path: "/health" });
}

export const apiConfiguration = {
  baseUrl: API_BASE,
  mode: window.reisDesktop ? "desktop" : "web",
};

export function mutationKey() {
  return crypto.randomUUID();
}
