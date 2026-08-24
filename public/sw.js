// Dispatch push service worker.
// Scope is "/" so it covers both /portal and /admin. This worker exists ONLY
// to receive push events — there is deliberately no offline caching here.

// Without these, a new worker sits in "waiting" until every instance of the
// app is closed, so a change to this file needs the app deleted and
// reinstalled before it takes effect. There is no cached state to protect
// here — the worker only handles push — so activating immediately is safe.
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // A malformed payload should never take the worker down.
    return;
  }

  // On the silent-notification investigation of 2026-08-24: iOS displays
  // these on the lock screen but never plays a sound or fires an Apple Watch
  // haptic. Ruled out by device testing, in order — notification settings
  // (Sounds on, Immediate delivery, other apps audible), `urgency` (raised
  // to high in lib/push.ts), tag collapsing (a brand-new ticket with a fresh
  // tag was also silent), `renotify` (removed, no change), Apple Watch
  // routing (a second phone with no watch paired is also silent), and
  // finally a payload stripped to bare title + body, which was ALSO silent.
  //
  // That last test is conclusive: the cause is WebKit's handling of web push
  // on iOS, not anything in this file. The options below were restored
  // afterwards because they cost nothing and make the tray entry better.
  // Do not re-litigate the sound from here — it is not reachable from the
  // payload.
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Collapse repeat notifications for the same ticket instead of stacking.
    tag: data.tag || undefined,
    data: { url: data.url || "/portal" },
  };

  // Show the notification and bump the badge together. bumpBadge never
  // rejects, so a platform without Badging support cannot stop the
  // notification from being shown.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      bumpBadge(),
    ]),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  // Reset before the target guard below: tapping a notification has cleared
  // it either way, so the badge must not survive even when there is no URL
  // to open. waitUntil may be called more than once per event.
  event.waitUntil(resetBadge());

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

// ─── App icon badge ─────────────────────────────────────────────────────────
// setAppBadge has no getter, so the count has to be persisted somewhere the
// worker can reach after it has been killed and restarted. IndexedDB is the
// only durable store available in a service worker.

const BADGE_DB = "dispatch-badge";
const BADGE_STORE = "state";
const BADGE_KEY = "count";

function badgeDb() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(BADGE_DB, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore(BADGE_STORE);
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

function readBadge() {
  return badgeDb()
    .then(function (db) {
      return new Promise(function (resolve) {
        const req = db.transaction(BADGE_STORE, "readonly").objectStore(BADGE_STORE).get(BADGE_KEY);
        req.onsuccess = function () {
          resolve(typeof req.result === "number" ? req.result : 0);
        };
        req.onerror = function () {
          resolve(0);
        };
      });
    })
    .catch(function () {
      return 0;
    });
}

function writeBadge(n) {
  return badgeDb()
    .then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(BADGE_STORE, "readwrite");
        tx.objectStore(BADGE_STORE).put(n, BADGE_KEY);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
      });
    })
    .catch(function () {});
}

// Badging is unsupported outside installed apps (and on plain Safari), so
// every call is guarded. A missing badge must never break the notification.
function bumpBadge() {
  return readBadge()
    .then(function (n) {
      const next = n + 1;
      return writeBadge(next).then(function () {
        if (self.navigator && self.navigator.setAppBadge) {
          return self.navigator.setAppBadge(next);
        }
      });
    })
    .catch(function () {});
}

function resetBadge() {
  return writeBadge(0)
    .then(function () {
      if (self.navigator && self.navigator.clearAppBadge) {
        return self.navigator.clearAppBadge();
      }
    })
    .catch(function () {});
}

// The page clears the badge when it is opened or refocused — the worker owns
// the stored count, so the page asks rather than writing it itself.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "dispatch:clear-badge") {
    event.waitUntil(resetBadge());
  }
});
