import { _electron as electron } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp = await mkdtemp('/tmp/concordia-desktop-');
const app = await electron.launch({
  executablePath:
    process.env.CONCORDIA_DESKTOP_EXECUTABLE ??
    path.resolve('desktop/node_modules/electron/dist/electron'),
  args: [
    ...(process.env.CONCORDIA_DESKTOP_EXECUTABLE ? [] : [path.resolve('desktop')]),
    '--no-sandbox',
    ...(process.env.DISPLAY ? [] : ['--ozone-platform=headless']),
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-zygote',
  ],
  env: {
    ...process.env,
    CONCORDIA_DIAGNOSTICS: '1',
    CONCORDIA_DATA_DIR: temp,
    XDG_CACHE_HOME: path.join(temp, 'cache'),
  },
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Criar uma sala', exact: true }).waitFor();
  const health = await page.evaluate(() => fetch('/api/health').then((r) => r.json()));
  assert.equal(health.version, '1.1.0');
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  await page.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await page.getByLabel('Como devemos chamar você?').fill('Desktop');
  await page.getByLabel('Cenário de Campanha', { exact: true }).selectOption('AGE_OF_SAIL');
  await page.getByRole('button', { name: 'Reunir o conselho' }).click();
  await page.getByText('✨ Friend-Pass Ativo:', { exact: false }).waitFor();
  console.log(
    'Desktop: Electron real iniciou servidor isolado, frontend, WebSocket e lobby, com renderer isolado.',
  );
} finally {
  await app.close();
  await rm(temp, { recursive: true, force: true });
}
