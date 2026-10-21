import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GameView, PublicRoom } from '../shared/types';
let child: ChildProcess | undefined;
const temp = await mkdtemp(path.join(os.tmpdir(), 'concordia-browser-v4-'));
let base = process.env.BASE_URL;
if (!base) {
  child = fork(path.resolve('server/index.ts'), ['--production'], {
    execArgv: ['--import', 'tsx'],
    silent: true,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      ROOMS_STATE_FILE: path.join(temp, 'rooms.json'),
    },
  });
  let diagnostics = '';
  child.stderr?.on('data', (b) => (diagnostics += String(b)));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Servidor não iniciou: ${diagnostics}`)),
      15000,
    );
    child!.on('message', (m) => {
      if (m && typeof m === 'object' && 'port' in m) {
        clearTimeout(timer);
        resolve(Number(m.port));
      }
    });
    child!.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou ${code}: ${diagnostics}`));
    });
  });
  base = `http://127.0.0.1:${port}`;
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
function observe(page: Page) {
  let state: GameView | null = null;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('websocket', (s) =>
    s.on('framereceived', (e) => {
      try {
        const m = JSON.parse(String(e.payload));
        if (m.type === 'state') state = m.state as GameView;
      } catch {}
    }),
  );
  return {
    get: () => {
      assert.ok(state);
      return state;
    },
    until: async (predicate: (g: GameView) => boolean) => {
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        if (state && predicate(state)) return state;
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error(`Estado esperado não recebido (rodada ${state?.turn}).`);
    },
  };
}
async function viewport(page: Page) {
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    'Viewport com rolagem externa.',
  );
}
async function closeWindows(page: Page) {
  const buttons = page.locator('.window-controls button[aria-label^="Fechar"]');
  while (await buttons.count()) await buttons.last().click();
}
async function selectProvince(page: Page, id: string) {
  await page.locator(`.province-shape[data-province="${id}"]`).press('Enter');
}
async function saveDownload(page: Page, label: string, filename: string) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const file = await downloaded;
  await file.saveAs(filename);
  return readFile(filename, 'utf8');
}
try {
  await mkdir('.local/screenshots', { recursive: true });
  await mkdir('.local/exports', { recursive: true });
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 960 } })),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    states = pages.map(observe),
    page = pages[0];
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const w = window as unknown as { audioNodes: number };
      w.audioNodes = (w.audioNodes ?? 0) + 1;
      return original.call(this);
    };
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await page.getByLabel('Como devemos chamar você?').fill('Capitã');
  await page.getByLabel('Nome da sala', { exact: true }).fill('Fronteiras v0.4');
  await page.getByLabel('Timer após o primeiro pronto').fill('15');
  await page.getByRole('button', { name: 'Reunir o conselho' }).click();
  await states[0].until((g) => g.phase === 'lobby');
  const room = states[0].get().code;
  const listed = (await fetch(`${base}/api/rooms`).then((r) => r.json())) as PublicRoom[];
  assert.ok(listed.some((r) => r.roomId === room && r.roomName === 'Fronteiras v0.4'));
  await page.getByRole('button', { name: /Ordem do Sol Invicto/ }).click();
  await states[0].until((g) => g.players[0].nationId === 'sol_invicto');
  for (let i = 1; i < 3; i++) {
    await pages[i].goto(base);
    await pages[i].getByRole('heading', { name: '🌐 Salas Abertas (Server Browser)' }).waitFor();
    const card = pages[i].locator('.server-browser article').filter({ hasText: 'Fronteiras v0.4' });
    await card.getByRole('button', { name: 'Entrar na Sala', exact: true }).click();
    await states[i].until((g) => g.players.length === i + 1);
  }
  await page.getByRole('button', { name: 'Iniciar campanha' }).click();
  await Promise.all(states.map((s) => s.until((g) => g.phase === 'planning')));
  let g = states[0].get();
  assert.equal(g.version, 4);
  assert.equal(g.turnDeadlineAt, null);
  assert.equal(g.players[0].secretObjectives.length, 2);
  assert.ok(g.players.slice(1).every((p) => p.secretObjectives.length === 0));
  await viewport(page);
  await page.getByText('Aguardando o 1º jogador finalizar', { exact: false }).waitFor();
  for (const name of ['Político', 'Religião', 'Economia', 'Diplomacia', 'Estabilidade'])
    await page.getByRole('button', { name: `Mapa ${name}`, exact: true }).click();
  assert.ok((await page.locator('.resource-badge').count()) > 0);
  await page.getByRole('button', { name: 'Mapa Economia', exact: true }).click();
  assert.ok((await page.locator('.resource-badge.emphasized').count()) > 0);
  await page.getByRole('button', { name: '🎯 Meu Objetivo Secreto', exact: true }).click();
  const secret = page.getByRole('region', { name: 'Meu Objetivo Secreto', exact: true });
  await secret.getByRole('button', { name: 'Escolher esta carta' }).first().click();
  await states[0].until((g) => g.players[0].selectedObjectiveId !== null);
  await closeWindows(page);
  const target = g.players[1];
  await page.getByRole('button', { name: `Diplomacia com ${target.nation}`, exact: true }).click();
  const dip = page.getByRole('region', { name: 'Diplomacia & Guerras', exact: true });
  await dip
    .getByRole('button', { name: `⚔️ Declarar Guerra a ${target.nation}`, exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await closeWindows(page);
  const targetProvince = g.provinces.find((p) => p.ownerId === target.id)!;
  await selectProvince(page, targetProvince.id);
  const province = page.getByRole('region', { name: 'Inspeção de Província', exact: true });
  await province
    .getByRole('button', { name: `⚔️ Declarar Guerra a ${target.nation}`, exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await closeWindows(page);
  const own = g.battalions.find((a) => a.ownerId === g.players[0].id && !a.isFleet)!;
  await page.locator(`[data-battalion="${own.id}"]`).press('Enter');
  await closeWindows(page);
  await page.getByRole('region', { name: 'HUD tática de batalhão' }).waitFor();
  assert.ok((await page.locator('[data-destination]').count()) > 0);
  await page
    .locator(`.province-shape[data-province="${targetProvince.id}"]`)
    .dispatchEvent('contextmenu');
  // The right-button gesture exercises the tactical handler through the real map pointer sequence.
  const position = await page
    .locator(`.province-shape[data-province="${targetProvince.id}"]`)
    .evaluate(
      (el, p) => {
        const q = new DOMPoint(p.x, p.y).matrixTransform(
          (el as SVGGraphicsElement).getScreenCTM()!,
        );
        return { x: q.x, y: q.y };
      },
      { x: targetProvince.x, y: targetProvince.y },
    );
  await page.mouse.click(position.x, position.y, { button: 'right' });
  const modal = page.getByRole('dialog', { name: `Ato de Guerra contra ${target.nation}` });
  await modal.waitFor();
  await modal.getByRole('button', { name: '⚔️ Declarar Guerra e Marchar!', exact: true }).click();
  await states[0].until(
    (g) => g.wars.some((w) => w.active) && g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'),
  );
  await page
    .getByRole('button', { name: `Cancelar movimento de ${own.name}`, exact: true })
    .press('Enter');
  await states[0].until((g) => !g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'));
  const destination = page.locator('[data-destination]').first();
  const destinationId = await destination.getAttribute('data-province');
  const neighbor = states[0].get().provinces.find((p) => p.id === destinationId)!;
  const neighborPoint = await destination.evaluate(
    (el, p) => {
      const point = new DOMPoint(p.x, p.y).matrixTransform(
        (el as SVGGraphicsElement).getScreenCTM()!,
      );
      for (const dy of [-18, -25, 18, 25, 0])
        for (const dx of [0, -18, 18, -28, 28]) {
          const x = point.x + dx,
            y = point.y + dy,
            hit = document.elementFromPoint(x, y);
          if (
            hit?.classList.contains('province-shape') &&
            hit.getAttribute('data-province') === el.getAttribute('data-province')
          )
            return { x, y };
        }
      throw new Error('Sem superfície de província disponível para clique.');
    },
    { x: neighbor.x, y: neighbor.y },
  );
  await page.mouse.click(neighborPoint.x, neighborPoint.y);
  await states[0].until((g) =>
    g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION' || o.type === 'EMBARK_BATTALION'),
  );
  await page.getByRole('button', { name: '❌ Cancelar Ordem Atual', exact: true }).click();
  await states[0].until((g) => g.plannedOrders.length === 0);
  await page.getByRole('button', { name: '🏰 Entrincheirar (+Defesa)', exact: true }).click();
  await states[0].until((g) => g.plannedOrders.some((o) => o.type === 'ENTRENCH_BATTALION'));
  await page.screenshot({ path: '.local/screenshots/v4-comando.png' });
  await page.getByRole('button', { name: 'Desmarcar batalhão', exact: true }).click();
  await page.getByRole('button', { name: 'Mundo & Coalizões', exact: true }).click();
  await page
    .getByRole('region', { name: 'Mundo & Coalizões', exact: true })
    .getByRole('heading', { name: 'Ameaça e contenção' })
    .waitFor();
  await closeWindows(page);
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await Promise.all(states.map((s) => s.until((g) => g.turnDeadlineAt !== null)));
  assert.equal(states[0].get().firstReadyPlayerName, 'Capitã');
  assert.ok((await page.locator('.first-ready-banner.counting').count()) > 0);
  assert.ok(
    await page.evaluate(() => ((window as unknown as { audioNodes?: number }).audioNodes ?? 0) > 0),
    'Áudio sintetizado não foi acionado.',
  );
  await pages[1].getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await pages[2].getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await Promise.all(states.map((s) => s.until((g) => g.turn === 2)));
  assert.equal(states[0].get().turnDeadlineAt, null);
  await page.getByRole('button', { name: 'Encerrar animação', exact: true }).click();
  const json = JSON.parse(
    await saveDownload(page, 'Baixar Relatório (.JSON)', '.local/exports/v4-browser.json'),
  );
  assert.equal(json.schemaVersion, 4);
  assert.equal(json.turnByTurnHistory.length, 1);
  assert.ok(json.worldHistory.length === 1);
  assert.ok(!('seed' in json.finalState));
  const txt = await saveDownload(page, 'Baixar Crônica (.TXT)', '.local/exports/v4-browser.txt');
  assert.match(txt, /RODADA 1/);
  await page.reload();
  await states[0].until((g) => g.turn === 2);
  await viewport(page);
  assert.equal(states[0].get().turnDeadlineAt, null);
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport(page);
  await page.screenshot({ path: '.local/screenshots/v4-celular.png' });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base);
  await viewport(mobilePage);
  await mobilePage.getByRole('heading', { name: '🌐 Salas Abertas (Server Browser)' }).waitFor();
  await mobilePage.screenshot({ path: '.local/screenshots/v4-inicio-celular.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Smoke v0.4 passou: 3 navegadores, salas públicas, oito nações, cartas privadas, três acessos à guerra, comando tático, cancelamento, First-Ready, reconexão, cinco mapas, recursos, exportações e celular.',
  );
} finally {
  await browser.close();
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
  await rm(temp, { recursive: true, force: true });
}
