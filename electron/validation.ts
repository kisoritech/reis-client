import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
})

const allowedRoots = [
  '/auth/me',
  '/crm/',
  '/calendar/',
  '/imobiliario/',
  '/automation/',
  '/analytics/',
  '/integrations/',
  '/health',
]

export const apiRequestSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
    path: z.string().startsWith('/').max(500),
    body: z.unknown().optional(),
    idempotencyKey: z.uuid().optional(),
  })
  .refine(
    ({ path }) =>
      !path.includes('..') &&
      !path.includes('://') &&
      allowedRoots.some((root) => path === root || path.startsWith(root)),
    'Endpoint não permitido',
  )
  .refine(
    ({ method, idempotencyKey }) =>
      method === 'GET' || method === 'DELETE' || Boolean(idempotencyKey),
    'Mutações exigem chave de idempotência',
  )

const deepLinkRoutes = [
  /^\/atendimentos\/[0-9a-f-]{36}$/i,
  /^\/calendar\/event\/[0-9a-f-]{36}$/i,
  /^\/crm\/deals\/[0-9a-f-]{36}$/i,
  /^\/imobiliario\/imoveis\/[0-9a-f-]{36}$/i,
  /^\/auth\/callback$/,
]

export function parseDeepLink(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'reis:') return null
    const path = `/${url.host}${url.pathname}`.replace(/\/+$/, '')
    if (!deepLinkRoutes.some((route) => route.test(path))) return null
    return `${path}${url.search}`
  } catch {
    return null
  }
}

export function isAllowedExternalUrl(value: string, hosts: Set<string>): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && hosts.has(url.hostname)
  } catch {
    return false
  }
}
