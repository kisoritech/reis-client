self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const notification = payload.notification || {};
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(notification.title || "REIS", {
      body: notification.body || "Nova solicitação de ligação",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.callRequestId
        ? `reis-call-${data.callRequestId}`
        : "reis-notification",
      data: {
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
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (existing) {
          existing.navigate(url);
          return existing.focus();
        }
        return clients.openWindow(url);
      }),
  );
});
