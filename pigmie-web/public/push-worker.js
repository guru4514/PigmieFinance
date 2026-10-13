// Imported by the generated PWA worker; never register a competing worker.
const legacyAccountCaches = ['due-today-cache', 'customers-cache', 'loans-cache', 'dashboard-cache', 'static-assets'];
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all(legacyAccountCaches.map((name) => caches.delete(name))));
});
self.addEventListener('push', (event) => {
  let target = '/app/dashboard';
  try { if (event.data?.json()?.url === '/portal/dashboard') target = '/portal/dashboard'; } catch { /* Malformed payload remains generic. */ }
  // A shared device may now belong to a different account. No personal/financial details on its lock screen.
  event.waitUntil(self.registration.showNotification('PigmieFinance', {
    body: 'You have a new notification. Sign in to view it.', icon: '/vite.svg', badge: '/vite.svg',
    tag: 'pigmie-notification', data: { url: target },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url === '/portal/dashboard' ? '/portal/dashboard' : '/app/dashboard';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
