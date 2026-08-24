// Dispatch push service worker.
// Scope is "/" so it covers both /portal and /admin. This worker exists ONLY
// to receive push events — there is deliberately no offline caching here.

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // A malformed payload should never take the worker down.
    return;
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Collapse repeat notifications for the same ticket instead of stacking.
    tag: data.tag || undefined,
    data: { url: data.url || "/portal" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const target = event.notification.data && event.notification.data.url;
  if (!target) return;

  // Opening a fresh window is the fallback for every failure path, and it
  // must never reject — this is the last link in the waitUntil chain.
  function openFresh() {
    return self.clients.openWindow(target).catch(function () {});
  }

  // Focus an already-open Dispatch window and navigate it, rather than
  // opening a duplicate tab on every tap.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        for (const client of windowClients) {
          if ("focus" in client) {
            return client
              .navigate(target)
              .then(function (navigated) {
                // navigate() resolves with the post-navigation client, which
                // may be a different object; fall back to the original only
                // if it resolved with nothing.
                return (navigated || client).focus();
              })
              .catch(openFresh);
          }
        }
        return openFresh();
      })
      .catch(openFresh),
  );
});
