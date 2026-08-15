import { apiRequest, mutationKey } from "./api";

type CallSource = "clients" | "leads" | "opportunities" | "attendances";

type CallTarget = {
  phone: string;
  targetName: string;
  source: CallSource;
  accountId?: string;
  leadId?: string;
};

type CallAttempt = {
  id: string;
  status: "dial_requested";
  phone: string;
  dialUri: string;
  createdAt: string;
};

export async function callContact(target: CallTarget): Promise<CallAttempt> {
  const request = apiRequest<CallAttempt>({
    method: "POST",
    path: "/crm/call-attempts",
    body: target,
    idempotencyKey: mutationKey(),
  });
  if (!window.reisDesktop) {
    window.location.assign(localDialUri(target.phone));
  }
  const result = await request;
  if (!/^tel:\+[1-9]\d{7,14}$/.test(result.data.dialUri)) {
    throw new Error("A API retornou um telefone invÃ¡lido para discagem");
  }
  if (window.reisDesktop) {
    await window.reisDesktop.system.openExternal(result.data.dialUri);
  }
  return result.data;
}

function localDialUri(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  const normalized = raw.startsWith("+")
    ? digits
    : digits.length === 10 || digits.length === 11
      ? `55${digits}`
      : digits;
  if (
    normalized.length < 10 ||
    normalized.length > 15 ||
    normalized.startsWith("0")
  ) {
    throw new Error("Telefone inválido para discagem");
  }
  return `tel:+${normalized}`;
}
