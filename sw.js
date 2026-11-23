/* Offline cache for the practice page. tools/publish-site.sh copies this to site/sw.js
   and fills in VERSION and FILES. Don't edit site/sw.js by hand.
   - The page: network first (so updates show), cached copy when offline.
   - The class videos (videos/*.mp4): saved on install, served from the cache,
     with Range support (iPhone/iPad Safari asks for videos in byte ranges). */
const VERSION = "91b9e5177c27";
const FILES = ["./", "./videos/mb-nov.mp4", "./videos/mb-ou.mp4"];
const CACHE = "mf-" + VERSION;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const f of FILES) {
      const r = await fetch(f, { cache: "reload" });
      if (r.ok) await c.put(f, r);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromCacheWithRange(req) {
  const url = new URL(req.url);
  const key = "./" + url.pathname.split("/").slice(-2).join("/");
  const c = await caches.open(CACHE);
  let r = await c.match(key);
  if (!r) {
    r = await fetch(key);                 // not saved yet: get the whole file and keep it
    if (!r.ok) return r;
    await c.put(key, r.clone());
  }
  const range = req.headers.get("range");
  if (!range) return r;
  const buf = await r.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - +m[2]; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end || start >= buf.byteLength) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buf.byteLength}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": r.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // YouTube etc.: browser as usual
  if (/\/videos\/[^/]+\.mp4$/.test(url.pathname)) {
    e.respondWith(fromCacheWithRange(req).catch(() => new Response(null, { status: 504 })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put("./", r.clone());
        return r;
      } catch (err) {
        return (await caches.match("./", { cacheName: CACHE })) || Response.error();
      }
    })());
  }
});
