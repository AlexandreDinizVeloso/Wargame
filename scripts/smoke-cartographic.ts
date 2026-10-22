import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page, type Locator } from 'playwright-core';
import type { GameView } from '../shared/types';
import { orderCost } from '../shared/rules';
import { seedBrowserFixtures, fixturePeer } from './browser-fixtures';
const temp = await mkdtemp(path.join(os.tmpdir(), 'concordia-cartographic-'));
const fixtures = seedBrowserFixtures(path.join(temp, 'rooms.json'));
let server: ChildProcess | undefined;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
async function viewport(page: Page) {
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    'Viewport não deve ter rolagem externa.',
  );
}
async function gesture(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + Math.min(45, box.width / 2),
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}
try {
  await mkdir('.local/screenshots', { recursive: true });
  server = fork(path.resolve('server/index.ts'), ['--production'], {
    execArgv: ['--import', 'tsx'],
    silent: true,
    env: {
      ...process.env,
      PORT: '0',
      HOST: '127.0.0.1',
      ROOMS_STATE_FILE: path.join(temp, 'rooms.json'),
    },
  });
  const address = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Servidor do protótipo não iniciou.')), 15000);
    server!.once('message', (m) => {
      if (m && typeof m === 'object' && 'port' in m) {
        clearTimeout(timer);
        resolve(Number(m.port));
      }
    });
    server!.once('exit', (c) => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou: ${c}`));
    });
  });
  const base = `http://127.0.0.1:${address}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(
    (s) => sessionStorage.setItem('concordia-session', JSON.stringify(s)),
    fixtures.transport[0],
  );
  const page = await context.newPage();
  let state: GameView | undefined;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  page.on('websocket', (s) =>
    s.on('framereceived', (r) => {
      const m = JSON.parse(String(r.payload));
      if (m.type === 'state') state = m.state;
    }),
  );
  const until = async (p: (g: GameView) => boolean) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (state && p(state)) return state;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Estado esperado não recebido: rodada ${state?.turn}`);
  };
  await page.goto(base);
  await until((g) => g.code === 'FERRY6');
  await page.locator('[data-interface="cartographic"]').waitFor();
  await viewport(page);
  assert.equal(await page.locator('.province-relief').count(), 56);
  assert.ok((await page.locator('[data-infrastructure]').count()) > 0);
  const province = page.locator('.province-shape[data-province="portugal"]');
  await province.press('Enter');
  const card = page.getByRole('region', { name: 'Inspeção de Província', exact: true });
  await card.waitFor();
  assert.equal(await page.locator('[data-context-panel]').count(), 1);
  const box = await card.boundingBox();
  assert.ok(
    box && box.width * box.height <= 1440 * 960 * 0.2,
    'Painel contextual cobre no máximo 20% do desktop.',
  );
  await card.getByRole('tab', { name: '🏗️ Construir', exact: true }).click();
  await card.getByRole('button', { name: /Construir Quartel/ }).click();
  const planned = await until((g) =>
    g.plannedOrders.some((o) => o.type === 'BUILD_BUILDING' && o.building === 'BARRACKS'),
  );
  const build = planned.plannedOrders.find((o) => o.type === 'BUILD_BUILDING')!;
  const buildGold = orderCost(
    build,
    planned.provinces.find((p) => p.id === 'portugal'),
    planned.players[0],
    planned,
  ).gold;
  await card.getByRole('tab', { name: '⚔️ Recrutar', exact: true }).click();
  await card.getByText('Capacidade de Recrutamento Local:', { exact: false }).waitFor();
  assert.equal(await card.getByLabel('Cavalaria', { exact: true }).isDisabled(), true);
  assert.equal(await card.locator('.building-card:visible').count(), 0);
  await card.getByRole('tab', { name: '👑 Diplomacia', exact: true }).click();
  await card.getByRole('button', { name: 'Abrir conselho diplomático', exact: true }).waitFor();
  const main = state!.battalions.find((a) => a.ownerId === state!.players[0].id && !a.isFleet)!;
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  await page.getByRole('region', { name: 'Comando de Batalhão', exact: true }).waitFor();
  assert.equal(await page.locator('[data-context-panel]').count(), 1);
  assert.equal(
    await page.getByRole('region', { name: 'Inspeção de Província', exact: true }).count(),
    0,
  );
  await page.locator('.advanced-command > summary').click();
  await page.getByLabel('Líder atribuído (instantâneo)', { exact: true }).waitFor();
  await page.locator('.advanced-command > summary').click();
  await page.getByRole('button', { name: 'Mundo & Coalizões', exact: false }).click();
  const world = page.getByRole('region', { name: 'Mundo & Coalizões', exact: true });
  await world.waitFor();
  assert.equal(await page.locator('[data-context-panel]').count(), 1);
  assert.equal(await page.locator('.modal-backdrop, .consultation-backdrop').count(), 0);
  const beforeDrag = (await world.boundingBox())!;
  await gesture(page, world.locator('.window-title'), -430, 30);
  const afterDrag = (await world.boundingBox())!;
  assert.ok(afterDrag.x < beforeDrag.x - 350 && afterDrag.y > beforeDrag.y + 20);
  await gesture(
    page,
    world.getByRole('button', { name: 'Redimensionar Mundo & Coalizões' }),
    120,
    -80,
  );
  const resized = (await world.boundingBox())!;
  assert.ok(resized.width > afterDrag.width + 100 && resized.height < afterDrag.height - 60);
  await world.getByRole('button', { name: 'Minimizar Mundo & Coalizões' }).click();
  assert.equal((await world.boundingBox())!.height, 42);
  await world.getByRole('button', { name: 'Restaurar Mundo & Coalizões' }).click();
  await page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  const diplomacy = page.getByRole('region', { name: 'Diplomacia & Guerras', exact: true });
  await diplomacy.waitFor();
  await page.getByRole('button', { name: /Doutrinas & Árvore de Tropas/ }).click();
  const skills = page.getByRole('region', { name: 'Doutrinas & Árvore de Tropas', exact: true });
  await skills.waitFor();
  assert.equal(await page.locator('.modal-backdrop, .consultation-backdrop').count(), 0);
  await page.screenshot({ path: '.local/screenshots/v7-floating-consultations.png' });
  await page.keyboard.press('Escape');
  await skills.waitFor({ state: 'detached' });
  await diplomacy.waitFor();
  await page.keyboard.press('Escape');
  await diplomacy.waitFor({ state: 'detached' });
  await world.waitFor();
  // Background map remains interactive, and consultations survive context changes.
  await page.getByRole('button', { name: 'Fechar Comando de Batalhão', exact: true }).click();
  await page.locator('.province-shape[data-province="brazil"]').click();
  await page.getByRole('region', { name: 'Inspeção de Província', exact: true }).waitFor();
  await world.waitFor();
  await world.getByRole('button', { name: 'Fechar Mundo & Coalizões' }).click();
  await page.getByRole('button', { name: 'Mundo & Coalizões', exact: true }).click();
  const reopened = (await world.boundingBox())!;
  assert.ok(Math.abs(reopened.x - resized.x) < 2 && Math.abs(reopened.width - resized.width) < 2);
  await page.keyboard.press('Escape');
  await world.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  const manual = page.getByRole('region', { name: 'Manual de campanha', exact: true });
  await manual.waitFor();
  await manual.getByRole('button', { name: 'Redimensionar Manual de campanha' }).waitFor();
  assert.equal(await page.locator('.modal-backdrop').count(), 0);
  await page.keyboard.press('Escape');
  await manual.waitFor({ state: 'detached' });
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  await page.locator('.province-shape[data-province="brazil"]').press('Enter');
  await until((g) => g.plannedOrders.some((o) => o.type === 'AUTO_TRANSPORT' && !o.fleetId));
  const treasury = state!.players[0].gold;
  await page.screenshot({ path: '.local/screenshots/v7-cartographic-desktop.png' });
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  const peers = await Promise.all(fixtures.transport.slice(1).map((s) => fixturePeer(base, s)));
  try {
    for (const p of peers) p.send({ type: 'READY', ready: true });
    const crossed = await until((g) => g.turn === 2);
    assert.equal(crossed.battalions.find((a) => a.id === main.id)?.provinceId, 'brazil');
    const economy = crossed.lastReport!.economy.find((e) => e.playerId === main.ownerId)!;
    assert.ok(Math.abs(crossed.players[0].gold - (treasury - 15 - buildGold + economy.net)) < 0.02);
    assert.equal(crossed.provinces.find((p) => p.id === 'portugal')!.barracksLevel, 1);
    const replay = page.getByRole('button', { name: 'Encerrar animação', exact: true });
    if (await replay.isVisible()) await replay.click();
    const critical = page.getByRole('complementary', { name: 'Alertas pessoais críticos' });
    await critical.waitFor();
    const cameraBefore = await page.locator('[data-zoom]').getAttribute('data-zoom');
    await critical.getByRole('button', { name: '📍 Focar no Mapa', exact: true }).click();
    assert.notEqual(await page.locator('[data-zoom]').getAttribute('data-zoom'), cameraBefore);
    await page.setViewportSize({ width: 390, height: 844 });
    await viewport(page);
    const army = page.getByRole('region', { name: 'Comando de Batalhão', exact: true });
    const mobileBox = await army.boundingBox();
    assert.ok(
      mobileBox &&
        mobileBox.x >= 0 &&
        mobileBox.y >= 0 &&
        mobileBox.x + mobileBox.width <= 390 &&
        mobileBox.y + mobileBox.height <= 844,
    );
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    const menu = page.getByRole('region', { name: 'Conselho da nação', exact: true });
    await menu.getByLabel('Seu nome', { exact: true }).fill('Capitã do Atlas');
    await menu.getByRole('button', { name: 'Salvar nome', exact: true }).click();
    await until((g) => g.players[0].name === 'Capitã do Atlas');
    const toggle = menu.getByRole('checkbox', {
      name: 'Mapa cartográfico · HUD compacta',
      exact: true,
    });
    await toggle.uncheck();
    await page.locator('[data-interface="classic"]').waitFor();
    await toggle.check();
    await page.locator('[data-interface="cartographic"]').waitFor();
    await page.getByRole('button', { name: 'Fechar Conselho da nação', exact: true }).click();
    await viewport(page);
    await page.screenshot({ path: '.local/screenshots/v7-cartographic-mobile.png' });
  } finally {
    for (const p of peers) p.socket.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Protótipo cartográfico passou: relevo, infraestrutura, contexto compacto, abas de cidade, quartel, recrutamento, comando avançado, popups móveis/redimensionáveis/minimizáveis, coexistência, geometria persistida, mapa interativo e Esc, fretamento com três participantes, alertas, nome, comparação clássica e celular.',
  );
} finally {
  await browser.close();
  if (server && server.exitCode === null) {
    const ended = once(server, 'exit');
    server.kill('SIGTERM');
    await ended;
  }
  await rm(temp, { recursive: true, force: true });
}
