import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
} from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  apiRequest,
  apiUpload,
  login,
  logout,
  publicSession,
} from "./api-client";
import {
  apiRequestSchema,
  apiUploadSchema,
  isAllowedExternalUrl,
  loginSchema,
  parseDeepLink,
} from "./validation";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Squirrel inicia o executável durante instalação, atualização e remoção.
// Nesses eventos o aplicativo deve encerrar antes de criar janelas ou registrar IPC.
if (squirrelStartup) app.quit();

protocol.registerSchemesAsPrivileged([
  {
    scheme: "reis-app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const externalHosts = new Set(
  (
    process.env.REIS_ALLOWED_EXTERNAL_HOSTS ??
    "localhost,app.seudominio.com,api-reis.onrender.com,accounts.google.com,github.com,wa.me"
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
);
let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

function isTrustedSender(senderUrl: string): boolean {
  try {
    const sender = new URL(senderUrl);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return sender.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    }
    return sender.protocol === "reis-app:" && sender.hostname === "renderer";
  } catch {
    return false;
  }
}

function registerIpc(): void {
  const handle = (
    channel: string,
    listener: (
      event: Electron.IpcMainInvokeEvent,
      ...args: unknown[]
    ) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!event.senderFrame || !isTrustedSender(event.senderFrame.url)) {
        throw new Error("Emissor IPC inválido");
      }
      return listener(event, ...args);
    });
  };
  handle("auth:login", (_event, value) => login(loginSchema.parse(value)));
  handle("auth:logout", () => logout());
  handle("auth:session", () => publicSession());
  handle("api:request", (_event, value) =>
    apiRequest(apiRequestSchema.parse(value)),
  );
  handle("api:upload", (_event, value) =>
    apiUpload(apiUploadSchema.parse(value)),
  );
  handle("system:platform", () => process.platform);
  handle("system:version", () => app.getVersion());
  handle("system:open-external", async (_event, value) => {
    if (
      typeof value !== "string" ||
      !isAllowedExternalUrl(value, externalHosts)
    ) {
      throw new Error("URL externa não permitida");
    }
    await shell.openExternal(value);
  });
  handle("system:open-user-manual", async () => {
    const manualName = "Manual_Completo_de_Uso_REIS_Client_v1.pdf";
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await shell.openExternal(
        new URL(manualName, MAIN_WINDOW_VITE_DEV_SERVER_URL).toString(),
      );
      return;
    }
    const manualPath = join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}`,
      manualName,
    );
    const error = await shell.openPath(manualPath);
    if (error) throw new Error(error);
  });
}

function sendDeepLink(value: string): void {
  const path = parseDeepLink(value);
  if (!path) return;
  if (mainWindow?.webContents.isLoading()) pendingDeepLink = path;
  else mainWindow?.webContents.send("deep-link", path);
  mainWindow?.show();
  mainWindow?.focus();
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    icon: join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/icon-512.png`),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingDeepLink) {
      mainWindow?.webContents.send("deep-link", pendingDeepLink);
      pendingDeepLink = null;
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, externalHosts)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedSender(url)) event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadURL("reis-app://renderer/index.html");
  }
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

app.on("second-instance", (_event, argv) => {
  const link = argv.find((arg) => arg.startsWith("reis://"));
  if (link) sendDeepLink(link);
  else mainWindow?.show();
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  sendDeepLink(url);
});

void app.whenReady().then(async () => {
  app.setAsDefaultProtocolClient("reis");
  protocol.handle("reis-app", (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname).replace(
      /^[/\\]+/,
      "",
    );
    const rendererRoot = join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}`,
    );
    const requestedPath = resolve(rendererRoot, pathname || "index.html");
    const relativePath = relative(rendererRoot, requestedPath);
    const safePath =
      relativePath &&
      !relativePath.startsWith("..") &&
      !relativePath.includes(":")
        ? requestedPath
        : resolve(rendererRoot, "index.html");
    return net.fetch(pathToFileURL(safePath).toString());
  });
  registerIpc();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Preferências…",
            accelerator: "CmdOrCtrl+,",
            click: () =>
              mainWindow?.webContents.send("deep-link", "/preferencias"),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
