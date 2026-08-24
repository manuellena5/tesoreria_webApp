// ══════════════════════════════════════════════════════════════
// Service Worker — Tesorería Club
//
// VERSIONADO: subí este número cada vez que publiques cambios en
// index.html (o cualquier archivo cacheado). Al cambiar, el SW nuevo
// se instala, borra el caché viejo y la app avisa "Nueva versión
// disponible" para que el usuario actualice con un toque.
// ══════════════════════════════════════════════════════════════
const SW_VERSION = "88";
const CACHE_NAME = "tesoreria-cache-v" + SW_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./escudo.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Permite que la página fuerce la activación inmediata del SW en espera
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // no cachear POST (van directo a Apps Script)

  const url = new URL(req.url);

  // Navegación / app shell propio: network-first, cae a caché si no hay conexión.
  if (req.mode === "navigate" || APP_SHELL.some((p) => url.pathname.endsWith(p.replace("./", "")))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("./index.html")))
    );
    return;
  }

  // Todo lo demás (fuentes, CDN de xlsx, etc.): cache-first con actualización en segundo plano.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
