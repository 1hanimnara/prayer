// 묻는 기도 — Service Worker v2
// 역할: 알림 표시 전용 (스케줄링은 앱에서 담당)

const CACHE_NAME = 'mutnun-prayer-v2';
const BASE_URL   = 'https://1hanimnara.github.io/prayer';

// ── 설치
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([BASE_URL + '/', BASE_URL + '/index.html']).catch(() => {})
    )
  );
});

// ── 활성화
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── 네트워크 캐싱
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});

// ── 앱 → SW 메시지 수신
self.addEventListener('message', e => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'SHOW_NOTIFICATION') {
    e.waitUntil(
      self.registration.showNotification(data.title || '묻는 기도 🙏', {
        body:               data.body || '기도 시간입니다',
        tag:                data.tag  || 'prayer-alarm',
        requireInteraction: false,
        vibrate:            [200, 100, 200],
        data: { url: BASE_URL + '/' }
      })
    );
  }
});

// ── Periodic Background Sync
self.addEventListener('periodicsync', e => {
  if (e.tag === 'prayer-alarm-check') {
    e.waitUntil(checkAndFire());
  }
});

// ── SW 자체 알람 체크 (백그라운드)
async function checkAndFire() {
  const alarmData = await getStorage('prayerAlarms_v1');
  if (!alarmData) return;
  let alarms;
  try { alarms = JSON.parse(alarmData); } catch(e) { return; }

  const now   = new Date();
  const cTime = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const cDay  = now.getDay();

  for (const alarm of alarms) {
    if (!alarm.active) continue;
    if (alarm.time !== cTime) continue;
    if (!alarm.days.includes(cDay)) continue;

    const lastKey     = 'lastFired_' + alarm.id;
    const todayMinKey = now.toDateString() + '_' + cTime;
    const lastFired   = await getStorage(lastKey);
    if (lastFired === todayMinKey) continue;
    await setStorage(lastKey, todayMinKey);

    await self.registration.showNotification('묻는 기도 🙏', {
      body: '기도 시간입니다 (' + alarm.time + ')',
      tag:  alarm.id,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { url: BASE_URL + '/' }
    });
  }
}

// ── IndexedDB 헬퍼 (SW는 localStorage 접근 불가)
function getStorage(key) {
  return new Promise(resolve => {
    const req = indexedDB.open('sw-store', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => {
      const db  = e.target.result;
      const get = db.transaction('kv','readonly').objectStore('kv').get(key);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror   = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

function setStorage(key, value) {
  return new Promise(resolve => {
    const req = indexedDB.open('sw-store', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => {
      const tx = e.target.result.transaction('kv','readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    };
    req.onerror = resolve;
  });
}

// ── 알림 클릭 → 앱 열기
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || BASE_URL + '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(BASE_URL) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
