// Exercise the reported missing-environment and unreachable-API failures.
// Isolated server overrides never change the user's .env or running services.
import assert from 'node:assert/strict';
import { createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_ANON_KEY = '';
const dashboard = fileURLToPath(new URL('../frontend/dashboard/', import.meta.url));
const probe = createTcpServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const unavailablePort = probe.address().port;
const webProbe = createTcpServer();
await new Promise((resolve, reject) => { webProbe.once('error', reject); webProbe.listen(0, '127.0.0.1', resolve); });
const webPort = webProbe.address().port;
await new Promise((resolve) => probe.close(resolve));
await new Promise((resolve) => webProbe.close(resolve));
const server = await createServer({
  root: dashboard,
  configFile: fileURLToPath(new URL('../frontend/dashboard/vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: webPort, strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${unavailablePort}` } } },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: 'SproutSync setup is incomplete' }).waitFor();
  assert.match(await page.getByRole('alert').innerText(), /VITE_SUPABASE_URL/);
  assert.deepEqual(errors, []);
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.equal((await page.request.get(new URL(favicon, origin).href)).status(), 200);
  for (const path of ['/api/v1/health', '/api/v1/auth/me']) {
    const response = await page.request.get(origin + path);
    assert.equal(response.status(), 503);
    assert.match((await response.json()).detail, /Backend API unreachable/);
  }
  console.log('Browser smoke passed: missing configuration renders recovery instructions, favicon loads, and unavailable health/auth return JSON 503.');
} finally {
  await browser?.close();
  await server.close();
}
