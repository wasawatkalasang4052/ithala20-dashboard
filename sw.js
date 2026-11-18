const CACHE = 'ithala20-v18';
const STATIC = [
  '/style.css',
  '/app.js',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // ลบ cache เก่าทั้งหมด แล้ว claim clients ทันที
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => {
      // บอกทุก tab ให้ reload เอาเวอร์ชันใหม่
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Network first: API calls + HTML + app.js + style.css (ได้ของใหม่เสมอ)
  if (
    url.includes('supabase.co') ||
    url.includes('telegram') ||
    url.includes('openweathermap') ||
    url.endsWith('.html') ||
    url.endsWith('/') ||
    url.endsWith('app.js') ||
    url.endsWith('style.css')
  ) {
    e.respondWith(
      fetch(e.request).then(res => {
        // อัพเดท cache ด้วยของใหม่เสมอ
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache first: manifest / assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
