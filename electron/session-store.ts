import { app, safeStorage } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PublicSession } from './contracts'

type StoredSession = PublicSession & {
  accessToken: string
  refreshToken: string
  version: 1
}

const sessionPath = () => join(app.getPath('userData'), 'session.bin')

export async function saveSession(session: StoredSession): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro do sistema não está disponível')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(session))
  await writeFile(sessionPath(), encrypted, { mode: 0o600 })
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = await readFile(sessionPath())
    const value: unknown = JSON.parse(safeStorage.decryptString(encrypted))
    if (!value || typeof value !== 'object' || !('version' in value)) return null
    return value as StoredSession
  } catch {
    return null
  }
}

export async function clearSession(): Promise<void> {
  await unlink(sessionPath()).catch(() => undefined)
}

export function toPublicSession(session: StoredSession): PublicSession {
  return { user: session.user, expiresAt: session.expiresAt }
}
