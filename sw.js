const CACHE_NAME = "blckt-cache-v0.2.0";
const urlsToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./blkct.js",
  "./libs/three.js",
  "./libs/tween.js",
  "./icon.png",
  "./icon192.png",
  "./media/favicon.ico",
  "./fonts/InterDisplay-Bold.woff2",
  "./fonts/InterDisplay-Italic.woff2",
  "./fonts/InterDisplay-Regular.woff2",
  "./fonts/inter.css",
  "./fonts/monoid-bold.woff2",
  "./fonts/monoid-regular.woff2",
  "./fonts/monoid.css",
  "./fonts/SixtyFour.woff2",
  "./fonts/sixtyfour.css",
];

// Install event: opens a cache and adds the core files to it.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    }),
  );
});

// Fetch event: serves assets from cache if available, otherwise fetches from network.
self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request);
    }),
  );
});

// Activate event: cleans up old caches.
self.addEventListener("activate", function (event) {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});
