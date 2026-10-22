const { app, BrowserWindow, dialog, shell } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
if (process.env.CONCORDIA_DATA_DIR)
  app.setPath('userData', path.resolve(process.env.CONCORDIA_DATA_DIR));
let server;
let mainWindow;
let quitting = false;
async function launch() {
  const external = process.env.CONCORDIA_SERVER_URL;
  let url;
  if (external) {
    const parsed = new URL(external);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Use um endereço HTTP ou HTTPS para o servidor.');
    url = parsed.href;
  } else {
    const root = app.isPackaged
      ? path.join(process.resourcesPath, 'game')
      : path.resolve(__dirname, '..');
    server = fork(path.join(root, 'server/index.ts'), ['--production'], {
      cwd: root,
      execPath: process.execPath,
      execArgv: ['--import', path.join(root, 'node_modules/tsx/dist/loader.mjs')],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOST: '127.0.0.1',
        PORT: '0',
        ROOMS_STATE_FILE: path.join(app.getPath('userData'), 'rooms-state.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    if (process.env.CONCORDIA_DIAGNOSTICS)
      server.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('O servidor local não iniciou em 20 segundos.')),
        20000,
      );
      server.once('message', (m) => {
        if (m?.type === 'listening') {
          clearTimeout(timer);
          resolve(m.port);
        }
      });
      server.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      server.once('exit', (code) => {
        clearTimeout(timer);
        if (!quitting) reject(new Error(`Servidor encerrado (${code}).`));
      });
    });
    url = `http://127.0.0.1:${port}`;
  }
  const origin = new URL(url).origin;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 390,
    minHeight: 680,
    title: 'Concórdia',
    backgroundColor: '#102c38',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (e, target) => {
    if (new URL(target).origin !== origin) e.preventDefault();
  });
  await window.loadURL(url);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app
    .whenReady()
    .then(launch)
    .catch((error) => {
      console.error(error.stack);
      dialog.showErrorBox('Concórdia', error.message);
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (mainWindow) app.quit();
  });
  app.on('before-quit', (event) => {
    if (!server || quitting || server.exitCode !== null) return;
    event.preventDefault();
    quitting = true;
    server.once('exit', () => app.quit());
    server.kill('SIGTERM');
    setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
      app.quit();
    }, 4000).unref();
  });
}
