const CACHE_NAME = "fruitworks-v17";
const BASE_URL = new URL(self.registration.scope).pathname;
const PRECACHE_URLS = [
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}fruitworks-icon.svg`,
  `${BASE_URL}fruitworks-icon-192.png`,
  `${BASE_URL}fruitworks-icon-512.png`,
  `${BASE_URL}apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const shouldNetworkFirst =
    event.request.mode === "navigate" ||
    (isSameOrigin && ["document", "script", "style", "worker", "manifest"].includes(event.request.destination));

  if (shouldNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match(BASE_URL))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type !== "opaque") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      });
    }),
  );
});
