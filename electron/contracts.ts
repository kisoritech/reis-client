export type PublicUser = {
  id: string
  name?: string
  email: string
  companyId?: string
  role?: string
  avatarUrl?: string
  permissions: string[]
}

export type PublicSession = {
  user: PublicUser
  expiresAt: string
}

export type LoginInput = { email: string; password: string }

export type AllowedApiRequest = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  idempotencyKey?: string
}

export type ApiResult<T = unknown> = {
  data: T
  requestId?: string
  status: number
}

export type ReisDesktopBridge = {
  auth: {
    login(input: LoginInput): Promise<PublicSession>
    logout(): Promise<void>
    session(): Promise<PublicSession | null>
  }
  api: {
    request(input: AllowedApiRequest): Promise<ApiResult>
  }
  system: {
    platform(): Promise<
      'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
    >
    appVersion(): Promise<string>
    openExternal(url: string): Promise<void>
  }
  deepLinks: {
    subscribe(callback: (path: string) => void): () => void
  }
}
