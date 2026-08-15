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
  const result = await apiRequest<CallAttempt>({
    method: "POST",
    path: "/crm/call-attempts",
    body: target,
    idempotencyKey: mutationKey(),
  });
  if (!/^tel:\+[1-9]\d{7,14}$/.test(result.data.dialUri)) {
    throw new Error("A API retornou um telefone invÃ¡lido para discagem");
  }
  if (window.reisDesktop)
    await window.reisDesktop.system.openExternal(result.data.dialUri);
  else window.location.assign(result.data.dialUri);
  return result.data;
}
