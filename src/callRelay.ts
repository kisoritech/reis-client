import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { apiRequest, mutationKey } from "./api";

export type CallDevice = {
  id: string;
  name: string;
  platform: string;
  active: boolean;
  lastSeenAt: string;
  createdAt: string;
};
export type CallRequest = {
  id: string;
  phone: string;
  targetName: string;
  source: string;
  status: string;
  delivery: string | null;
  expiresAt: string;
  createdAt: string;
  dialUri: string;
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function firebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    import.meta.env.VITE_FIREBASE_VAPID_KEY,
  );
}

export async function registerThisPhone(): Promise<CallDevice> {
  if (window.reisDesktop)
    throw new Error(
      "Abra o REIS pelo navegador do celular para vincular este aparelho.",
    );
  if (!firebaseConfigured())
    throw new Error(
      "As variáveis públicas do Firebase ainda não foram configuradas na Vercel.",
    );
  if (!(await isSupported()) || !("serviceWorker" in navigator))
    throw new Error(
      "Este navegador não oferece notificações push compatíveis.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Permita as notificações para receber pedidos de ligação.");
  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const fcmToken = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!fcmToken)
    throw new Error("O Firebase não retornou o identificador deste aparelho.");
  const installationId = getInstallationId();
  const response = await apiRequest<CallDevice>({
    method: "POST",
    path: "/crm/call-devices",
    body: {
      installationId,
      name: mobileDeviceName(),
      platform: /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "ios"
        : /Android/i.test(navigator.userAgent)
          ? "android"
          : "web",
      fcmToken,
    },
    idempotencyKey: mutationKey(),
  });
  return response.data;
}

export async function listCallDevices() {
  return (
    await apiRequest<CallDevice[]>({ method: "GET", path: "/crm/call-devices" })
  ).data;
}
export async function revokeCallDevice(id: string) {
  await apiRequest({ method: "DELETE", path: `/crm/call-devices/${id}` });
}
export async function sendCallToPhone(target: {
  phone: string;
  targetName: string;
  accountId: string;
}) {
  return (
    await apiRequest<CallRequest>({
      method: "POST",
      path: "/crm/call-requests",
      body: { ...target, source: "clients" },
      idempotencyKey: mutationKey(),
    })
  ).data;
}
export async function getCallRequest(id: string) {
  return (
    await apiRequest<CallRequest>({
      method: "GET",
      path: `/crm/call-requests/${id}`,
    })
  ).data;
}
export async function updateCallRequest(
  id: string,
  status: "opened" | "dialer_opened" | "canceled",
) {
  return (
    await apiRequest<CallRequest>({
      method: "PATCH",
      path: `/crm/call-requests/${id}/status`,
      body: { status },
      idempotencyKey: mutationKey(),
    })
  ).data;
}
function getInstallationId() {
  const key = "reis.call-relay.installation";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}
function mobileDeviceName() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "iPhone / iPad"
    : /Android/i.test(navigator.userAgent)
      ? "Celular Android"
      : "Navegador web";
}
