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
    const next = (await response.json()) as AuthResponse
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
  const session = (await response.json()) as AuthResponse
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
  return session ? toPublicSession(session) : null
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
    throw new Error(`API indisponível (${response.status})`)
  }
  return {
    data: body,
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? undefined,
  }
}
