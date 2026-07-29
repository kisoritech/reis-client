import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
} from 'electron'
import { join } from 'node:path'
import { apiRequest, login, logout, publicSession } from './api-client'
import {
  apiRequestSchema,
  isAllowedExternalUrl,
  loginSchema,
  parseDeepLink,
} from './validation'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

protocol.registerSchemesAsPrivileged([
  { scheme: 'reis-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const externalHosts = new Set(
  (process.env.REIS_ALLOWED_EXTERNAL_HOSTS ?? 'localhost,app.seudominio.com,api-reis.onrender.com,accounts.google.com')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
)
let mainWindow: BrowserWindow | null = null
let pendingDeepLink: string | null = null

function isTrustedSender(senderUrl: string): boolean {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return senderUrl.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  }
  return senderUrl.startsWith('reis-app://renderer/')
}

function registerIpc(): void {
  const handle = (
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!event.senderFrame || !isTrustedSender(event.senderFrame.url)) {
        throw new Error('Emissor IPC inválido')
      }
      return listener(event, ...args)
    })
  }
  handle('auth:login', (_event, value) => login(loginSchema.parse(value)))
  handle('auth:logout', () => logout())
  handle('auth:session', () => publicSession())
  handle('api:request', (_event, value) => apiRequest(apiRequestSchema.parse(value)))
  handle('system:platform', () => process.platform)
  handle('system:version', () => app.getVersion())
  handle('system:open-external', async (_event, value) => {
    if (typeof value !== 'string' || !isAllowedExternalUrl(value, externalHosts)) {
      throw new Error('URL externa não permitida')
    }
    await shell.openExternal(value)
  })
}

function sendDeepLink(value: string): void {
  const path = parseDeepLink(value)
  if (!path) return
  if (mainWindow?.webContents.isLoading()) pendingDeepLink = path
  else mainWindow?.webContents.send('deep-link', path)
  mainWindow?.show()
  mainWindow?.focus()
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      mainWindow?.webContents.send('deep-link', pendingDeepLink)
      pendingDeepLink = null
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, externalHosts)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      : url.startsWith('reis-app://renderer/')
    if (!allowed) event.preventDefault()
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadURL('reis-app://renderer/index.html')
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

app.on('second-instance', (_event, argv) => {
  const link = argv.find((arg) => arg.startsWith('reis://'))
  if (link) sendDeepLink(link)
  else mainWindow?.show()
})
app.on('open-url', (event, url) => {
  event.preventDefault()
  sendDeepLink(url)
})

void app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient('reis')
  protocol.handle('reis-app', (request) => {
    const pathname = new URL(request.url).pathname.replace(/^\/+/, '')
    const rendererRoot = join(import.meta.dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`)
    const safePath = pathname && !pathname.includes('..') ? pathname : 'index.html'
    return net.fetch(new URL(`file://${join(rendererRoot, safePath)}`).toString())
  })
  registerIpc()
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Preferências…', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('deep-link', '/preferencias') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]),
  )
  await createWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
