import type {
  AllowedApiRequest,
  ApiResult,
  LoginInput,
  PublicSession,
} from './contracts'
import {
  clearSession,
  loadSession,
  saveSession,
  toPublicSession,
} from './session-store'

const apiBase = (process.env.REIS_API_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
)
let refreshPromise: Promise<boolean> | null = null

type AuthResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: PublicSession['user']
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
  error?: { message?: string }
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'success' in value) {
    const envelope = value as ApiEnvelope<T>
    if (envelope.success === false) {
      throw new Error(envelope.error?.message ?? envelope.message ?? 'Falha na API')
    }
    return envelope.data as T
  }
  return value as T
}

function normalizeAuth(value: unknown): AuthResponse {
  const data = unwrap<Record<string, unknown>>(value)
  const accessToken = String(data.accessToken ?? data.access_token ?? data.token ?? '')
  const refreshToken = String(data.refreshToken ?? data.refresh_token ?? '')
  const expiresIn = Number(data.expiresIn ?? data.expires_in ?? 3600)
  const rawUser = (data.user ?? {}) as Record<string, unknown>
  if (!accessToken || !refreshToken || !rawUser.id) {
    throw new Error('Resposta de autenticação inválida')
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: data.expiresAt
      ? String(data.expiresAt)
      : new Date(Date.now() + expiresIn * 1000).toISOString(),
    user: {
      id: String(rawUser.id),
      name: String(rawUser.name ?? rawUser.nome ?? rawUser.email ?? 'Usuário'),
      email: String(rawUser.email ?? ''),
      companyId: rawUser.companyId
        ? String(rawUser.companyId)
        : rawUser.empresaId ? String(rawUser.empresaId) : undefined,
      role: rawUser.role ? String(rawUser.role) : undefined,
      avatarUrl: rawUser.avatarUrl ? String(rawUser.avatarUrl) : undefined,
      permissions: Array.isArray(rawUser.permissions)
        ? rawUser.permissions.map(String)
        : [],
    },
  }
}

async function fetchJson(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const session = await loadSession()
    if (!session) return false
    const response = await fetchJson('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
    if (!response.ok) {
      await clearSession()
      return false
    }
    const next = normalizeAuth(await response.json())
    await saveSession({ ...next, version: 1 })
    return true
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export async function login(input: LoginInput): Promise<PublicSession> {
  const response = await fetchJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('Não foi possível autenticar')
  const session = normalizeAuth(await response.json())
  await saveSession({ ...session, version: 1 })
  return toPublicSession({ ...session, version: 1 })
}

export async function logout(): Promise<void> {
  const session = await loadSession()
  if (session) {
    await fetchJson(
      '/auth/logout',
      { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) },
      session.accessToken,
    ).catch(() => undefined)
  }
  await clearSession()
}

export async function publicSession(): Promise<PublicSession | null> {
  const session = await loadSession()
  if (!session) return null
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    if (!await refresh()) return null
    const renewed = await loadSession()
    return renewed ? toPublicSession(renewed) : null
  }
  return toPublicSession(session)
}

export async function apiRequest(
  input: AllowedApiRequest,
  retried = false,
): Promise<ApiResult> {
  const session = await loadSession()
  const response = await fetchJson(
    input.path,
    {
      method: input.method,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: input.idempotencyKey
        ? { 'Idempotency-Key': input.idempotencyKey }
        : undefined,
    },
    session?.accessToken,
  )
  if (response.status === 401 && !retried && (await refresh())) {
    return apiRequest(input, true)
  }
  const body = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const envelope = body as ApiEnvelope<unknown> | null
    const fallback: Record<number, string> = {
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Seu perfil não possui permissão para esta operação.',
      422: 'Revise os campos informados.',
      429: 'Muitas solicitações. Aguarde e tente novamente.',
    }
    throw new Error(
      envelope?.error?.message ??
      envelope?.message ??
      fallback[response.status] ??
      `API indisponível (${response.status})`,
    )
  }
  return {
    data: unwrap(body),
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? undefined,
  }
}
