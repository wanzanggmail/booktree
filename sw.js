const CACHE_NAME = "chaeknamu-cbt-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/render.js",
  "./data/quizzes.json",
  "./data/goldenbell/questions.json",
  "./data/goldenbell/answers.json",
  "./data/dictionary/questions.json",
  "./data/dictionary/answers.json",
  "./icons/favicon.ico",
  "./icons/favicon-32x32.png",
  "./icons/favicon-96x96.png",
  "./icons/android-icon-192x192.png",
  "./icons/apple-icon.png",
  "./icons/apple-icon-180x180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    ASSETS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch (err) {
        console.warn("precache failed:", url, err);
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || !response.ok) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const fallback =
            (await caches.match("./index.html")) || (await caches.match("index.html"));
          return fallback;
        });
    })
  );
});
