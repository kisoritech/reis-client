import { useEffect, useRef, useState } from "react";
import { Phone, X } from "lucide-react";
import {
  getCallRequest,
  updateCallRequest,
  type CallRequest,
} from "./callRelay";

export default function CallRequestPrompt() {
  const [request, setRequest] = useState<CallRequest | null>(null);
  const [error, setError] = useState("");
  const [openingDialer, setOpeningDialer] = useState(false);
  const autoDialStarted = useRef(false);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const id = parameters.get("callRequest");
    const autoDial = parameters.get("autoDial") === "1";
    if (!id) return;
    void getCallRequest(id)
      .then(async (value) => {
        setRequest(value);
        if (value.status === "requested") await updateCallRequest(id, "opened");
        const expired =
          value.status === "expired" || new Date(value.expiresAt) <= new Date();
        if (
          autoDial &&
          !expired &&
          value.status !== "canceled" &&
          value.status !== "dialer_opened" &&
          !autoDialStarted.current
        ) {
          autoDialStarted.current = true;
          setOpeningDialer(true);
          await updateCallRequest(id, "dialer_opened").catch(() => undefined);
          history.replaceState({}, "", window.location.pathname);
          window.location.assign(value.dialUri);
          setOpeningDialer(false);
        }
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível abrir a solicitação.",
        ),
      );
  }, []);
  if (!request && !error) return null;
  const close = (registerCancellation = true) => {
    if (
      registerCancellation &&
      request &&
      request.status !== "expired" &&
      request.status !== "dialer_opened" &&
      new Date(request.expiresAt) > new Date()
    ) {
      void updateCallRequest(request.id, "canceled").catch(() => undefined);
    }
    history.replaceState({}, "", window.location.pathname);
    setRequest(null);
    setError("");
  };
  const dial = async () => {
    if (!request) return;
    await updateCallRequest(request.id, "dialer_opened").catch(() => undefined);
    const dialUri = request.dialUri;
    close(false);
    window.location.assign(dialUri);
  };
  const expired =
    request &&
    (request.status === "expired" || new Date(request.expiresAt) <= new Date());
  return (
    <div
      className="dialog-backdrop call-request-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="dialog call-request-dialog">
        <button
          className="icon-button call-request-close"
          onClick={() => close()}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <Phone size={32} />
        <h2>{error ? "Solicitação indisponível" : "Ligação recebida"}</h2>
        <p>
          {openingDialer
            ? `Abrindo o discador para ${request?.targetName}â€¦`
            : error ||
            (expired
              ? "Este pedido de ligação expirou."
              : `Confirmar ligação para ${request?.targetName}?`)}
        </p>
        {request && !expired && (
          <>
            <strong>{request.phone}</strong>
            <button className="gold-button" onClick={() => void dial()}>
              <Phone size={17} />
              {openingDialer ? "Abrindoâ€¦" : "Abrir discador"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
