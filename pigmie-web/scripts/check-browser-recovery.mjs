// Real desktop Chromium verification using an isolated profile and dummy credentials only.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recoveryRoot = resolve(root, '../.recovery');
mkdirSync(recoveryRoot, { recursive: true });
const profile = resolve(recoveryRoot, `browser-recovery-${randomUUID()}`);
mkdirSync(profile);
const chrome = [process.env.PIGMIE_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((path) => path && existsSync(path));
assert(chrome, 'A local Chrome or Edge installation is required');
const origin = 'http://127.0.0.1:4183';
const accountA = '00000000-0000-4000-8000-000000000001';
const accountB = '00000000-0000-4000-8000-000000000002';
const syntheticCollection = {
  clientGeneratedId: '00000000-0000-4000-8000-000000000003',
  loanId: '00000000-0000-4000-8000-000000000004',
  amount: 1, collectionDate: '2026-10-11', collectedAt: '2026-10-11T12:00:00.000Z', collectionMethod: 'cash',
  queuedAt: '2026-10-11T12:00:00.000Z',
  owner: { authUserId: accountA, organizationId: '00000000-0000-4000-8000-000000000005', staffId: '00000000-0000-4000-8000-000000000006' },
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(predicate, message, seconds = 30) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) { if (await predicate()) return; await wait(100); }
  throw new Error(message);
}
let server, browser, socket, nextId = 0;
const requests = new Map();
function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Browser command timeout: ${method}`)); }, 15_000);
    requests.set(id, { resolve: (value) => { clearTimeout(timer); resolveResult(value); }, reject: () => { clearTimeout(timer); reject(new Error(`Browser command failed: ${method}`)); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert(!response.exceptionDetails, 'Browser evaluation failed (details suppressed)');
  return response.result.value;
}
async function launch() {
  const activePort = resolve(profile, 'DevToolsActivePort');
  if (existsSync(activePort)) rmSync(activePort);
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(activePort), 'Browser did not start');
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(String(data));
    if (event.id) { const request = requests.get(event.id); requests.delete(event.id); if (event.error) request?.reject(); else request?.resolve(event.result); }
    // A failing API is deliberate: the harness never contacts a real backend/provider.
    if (event.method === 'Fetch.requestPaused') void call('Fetch.fulfillRequest', { requestId: event.params.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"message":"Synthetic offline verification"}').toString('base64') });
  });
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*example.supabase.co*'] });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*api/v1/*' }] });
}
async function setAccount(id) {
  await evaluate(`(() => {
    const id = ${JSON.stringify(id)};
    const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_');
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: id, exp: 4070908800, iat: 1791676800, aal: 'aal2', role: 'authenticated' }) + '.synthetic_signature';
    localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic_refresh', expires_at: 4070908800, expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-11T00:00:00Z' } }));
  })()`);
}
async function offline(value) { await call('Network.emulateNetworkConditions', { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); }
async function recoveryCount(expected) {
  await until(async () => (await evaluate('document.body.innerText')).includes(`${expected} collection(s) saved on this device for this account.`), 'Recovery count was not displayed');
  assert((await evaluate('document.body.innerText')).includes('Connect to recover your workspace'));
}
async function stopBrowser() {
  if (!browser) return;
  if (browser.exitCode !== null) { socket?.close(); browser = undefined; return; }
  const stopped = new Promise((done) => browser.once('exit', done));
  try { await call('Browser.close'); } catch { browser.kill(); }
  await stopped; socket?.close(); browser = undefined;
}
let originalWorker, phase = 'isolated browser startup';
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')));
  Object.assign(env, { APP_ENV: 'staging', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_dummy_browser_test', VITE_API_URL: '/api/v1' });
  execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, env, stdio: 'pipe', windowsHide: true });
  server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4183', '--strictPort'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  await until(async () => { try { return (await fetch(origin)).ok; } catch { return false; } }, 'Preview did not start');
  await launch();
  await call('Page.navigate', { url: `${origin}/login` });
  phase = 'initial service-worker installation';
  await until(async () => evaluate('(async () => !!(await navigator.serviceWorker.getRegistration())?.active)()'), 'Service worker did not install');
  await call('Page.reload');
  await until(async () => evaluate('!!navigator.serviceWorker.controller'), 'Service worker did not control the app');
  phase = 'synthetic offline cold start';
  await setAccount(accountA);
  await evaluate(`new Promise((done, reject) => {
    const open = indexedDB.open('pigmie-offline', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pending-collections', { keyPath: 'clientGeneratedId' });
    open.onerror = () => reject(new Error('Synthetic storage failure'));
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('pending-collections', 'readwrite'); tx.objectStore('pending-collections').add(${JSON.stringify(syntheticCollection)}); tx.oncomplete = () => { db.close(); done(true); }; tx.onerror = () => reject(new Error('Synthetic storage failure')); };
  })`);
  await offline(true);
  await call('Page.navigate', { url: `${origin}/app/dashboard` });
  await recoveryCount(1);
  console.log('PASS: actual offline navigation loads the cached app shell and account-only recovery count');
  phase = 'account switching';
  await setAccount(accountB); await call('Page.reload'); await recoveryCount(0);
  await setAccount(accountA); await call('Page.reload'); await recoveryCount(1);
  console.log('PASS: account switching hides another account\'s queue and switching back preserves it');
  phase = 'full browser restart';
  await stopBrowser(); await launch(); await offline(true);
  await call('Page.navigate', { url: `${origin}/app/dashboard` }); await recoveryCount(1);
  console.log('PASS: full browser-process restart offline preserves the queued collection');
  phase = 'service-worker upgrade';
  await offline(false);
  const workerPath = resolve(root, 'dist/sw.js');
  originalWorker = readFileSync(workerPath, 'utf8');
  writeFileSync(workerPath, `// synthetic upgrade ${randomUUID()}\n${originalWorker}`);
  await evaluate('(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); return true; })()');
  await until(async () => evaluate('(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)()'), 'Upgrade did not wait for consent');
  await until(async () => (await evaluate('document.body.innerText')).includes('Reload now'), 'App did not offer explicit update action');
  await recoveryCount(1);
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Reload now').click()");
  await until(async () => evaluate('(async () => !(await navigator.serviceWorker.getRegistration())?.waiting)()'), 'Update did not activate');
  await recoveryCount(1);
  console.log('PASS: service-worker upgrade waits for the reload action and preserves the IndexedDB queue');
  phase = 'synthetic storage loss';
  // Explicit storage-loss test uses only this isolated, synthetic profile.
  await evaluate(`new Promise((done) => { const request = indexedDB.deleteDatabase('pigmie-offline'); request.onsuccess = () => done(true); })`);
  await call('Page.reload'); await recoveryCount(0);
  console.log('PASS: simulated storage loss reports zero local records; no fabricated recovery or posting');
  console.log('LIMIT: desktop Chromium only; mobile OS eviction, installed PWA and real device MFA remain hardware verification');
} catch {
  console.error(`Browser recovery verification failed during ${phase}; raw browser/provider diagnostics suppressed.`);
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      console.error(JSON.stringify(await evaluate(`({
        recoveryVisible: document.body.innerText.includes('Connect to recover your workspace'),
        loginVisible: !!document.querySelector('input[type="password"]'),
        queuedCountVisible: document.body.innerText.includes('collection(s) saved'),
        sessionPresent: !!localStorage.getItem('sb-example-auth-token'),
        serviceWorkerControlled: !!navigator.serviceWorker.controller,
        applicationMounted: !!document.querySelector('#root')?.children.length,
        errorBoundaryVisible: document.body.innerText.includes('Something went wrong'),
        loadingVisible: !!document.querySelector('.animate-spin'),
        loginRoute: location.pathname === '/login',
        offlineInterstitial: document.body.innerText.includes('No internet'),
        rootTextLength: document.querySelector('#root')?.textContent?.length,
        rootElementTags: [...document.querySelectorAll('#root *')].slice(0, 10).map(element => element.tagName),
        svgPresent: !!document.querySelector('#root svg'),
        bodyTextLength: document.body.innerText.length,
        applicationRoute: location.pathname === '/app/dashboard',
        offline: !navigator.onLine,
      })`)));
    } catch { /* Diagnostics must never contain page data or tokens. */ }
  }
  process.exitCode = 1;
} finally {
  if (originalWorker) writeFileSync(resolve(root, 'dist/sw.js'), originalWorker);
  await stopBrowser();
  if (server && server.exitCode === null) { const stopped = new Promise((done) => server.once('exit', done)); server.kill(); await stopped; }
  const checked = realpathSync(profile);
  assert(checked.startsWith(realpathSync(recoveryRoot) + sep), 'Refusing cleanup outside recovery root');
  rmSync(checked, { recursive: true, force: true });
}
