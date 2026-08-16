self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const notification = payload.notification || {};
  const data = payload.data || {};
  const phone = /^\+[1-9]\d{7,14}$/.test(data.phone || "")
    ? data.phone
    : null;
  event.waitUntil(
    self.registration.showNotification(notification.title || "REIS", {
      body: notification.body || "Nova solicitação de ligação",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.callRequestId
        ? `reis-call-${data.callRequestId}`
        : "reis-notification",
      data: {
        dialUri: phone ? `tel:${phone}` : null,
        url: data.callRequestId
          ? `/?callRequest=${encodeURIComponent(data.callRequestId)}&autoDial=1`
          : "/",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin)
    .href;
  const dialUri = event.notification.data?.dialUri;
  event.waitUntil(
    (async () => {
      if (/^tel:\+[1-9]\d{7,14}$/.test(dialUri || "")) {
        try {
          const dialer = await clients.openWindow(dialUri);
          if (dialer) return dialer;
        } catch {
          // Navegadores que bloqueiam esquemas externos seguem pelo fallback.
        }
      }
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
        const existing = windows.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (existing) {
          await existing.navigate(url);
          return existing.focus();
        }
        return clients.openWindow(url);
    })(),
  );
});
