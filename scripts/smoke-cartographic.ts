import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import type { GameView } from '../shared/types';
import { orderCost } from '../shared/rules';
import { seedBrowserFixtures, fixturePeer, type FixtureSession } from './browser-fixtures';
const temp = await mkdtemp(path.join(os.tmpdir(), 'concordia-rc-'));
const fixtures = seedBrowserFixtures(path.join(temp, 'rooms.json'));
let server: ChildProcess | undefined, debugPage: Page | undefined;
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
    'Viewport sem rolagem externa.',
  );
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
  let diagnostics = '';
  server.stderr?.on('data', (c) => (diagnostics += String(c)));
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Servidor não iniciou: ${diagnostics}`)),
      15000,
    );
    server!.once('message', (m) => {
      if (m && typeof m === 'object' && 'port' in m) {
        clearTimeout(timer);
        resolve(Number(m.port));
      }
    });
    server!.once('exit', (c) => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou ${c}: ${diagnostics}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const open = async (session?: FixtureSession) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => localStorage.setItem('concordia-music-volume', '0'));
    if (session)
      await context.addInitScript(
        (s) => sessionStorage.setItem('concordia-session', JSON.stringify(s)),
        session,
      );
    const page = await context.newPage();
    debugPage = page;
    page.setDefaultTimeout(12000);
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
    const until = async (predicate: (g: GameView) => boolean) => {
      const end = Date.now() + 12000;
      while (Date.now() < end) {
        if (state && predicate(state)) return state;
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error(`Estado esperado não recebido, rodada ${state?.turn}.`);
    };
    await page.goto(base);
    if (session) await until((g) => g.code === session.code);
    return {
      page,
      context,
      until,
      get: () => {
        assert.ok(state);
        return state;
      },
    };
  };
  const { page, until, get } = await open(fixtures.transport[0]);
  await page.locator('[data-interface="cartographic"]').waitFor();
  await viewport(page);
  assert.equal(await page.locator('.province-relief').count(), 56);
  assert.equal(await page.locator('[data-miniature="compass"]').count(), 13);
  assert.ok((await page.locator('[data-miniature="army"]').count()) > 0);
  assert.ok((await page.locator('[data-miniature="fleet"]').count()) > 0);
  assert.equal(await page.locator('[data-miniature] rect').count(), 0);
  assert.ok((await page.locator('[data-sea-route]').count()) > 0);
  await page.locator('.province-shape[data-province="portugal"]').press('Enter');
  const card = page.getByRole('region', { name: 'Inspeção de Província', exact: true });
  await card.waitFor();
  const box = (await card.boundingBox())!;
  assert.ok(box.width * box.height <= 1440 * 960 * 0.2);
  const covered = await page.locator('[data-hud-surface]').evaluateAll((elements) =>
    elements.reduce((n, e) => {
      const b = e.getBoundingClientRect();
      return n + b.width * b.height;
    }, 0),
  );
  assert.ok(
    covered <= 1440 * 960 * 0.2,
    `HUD e dock cobrem ${((covered / (1440 * 960)) * 100).toFixed(1)}%, alvo ≤20%.`,
  );
  await card.getByRole('tab', { name: '🏛️ Cidade & Economia', exact: true }).click();
  await card.getByRole('button', { name: /Construir Quartel/ }).click();
  const planned = await until((g) =>
    g.plannedOrders.some((o) => o.type === 'BUILD_BUILDING' && o.building === 'BARRACKS'),
  );
  const build = planned.plannedOrders.find((o) => o.type === 'BUILD_BUILDING')!,
    buildGold = orderCost(
      build,
      planned.provinces.find((p) => p.id === 'portugal'),
      planned.players[0],
      planned,
    ).gold;
  await card.getByRole('tab', { name: '⚔️ Recrutamento & Guarnição', exact: true }).click();
  assert.equal(await card.getByLabel('Cavalaria', { exact: true }).isDisabled(), true);
  assert.equal(await card.locator('.building-card:visible').count(), 0);
  const main = get().battalions.find((a) => a.ownerId === get().players[0].id && !a.isFleet)!;
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  assert.equal(await page.locator('[data-context-panel]').count(), 1);
  assert.equal(await card.count(), 0);
  await page.getByRole('tab', { name: '🎖️ Líder', exact: true }).click();
  await page.getByLabel('Líder atribuído (instantâneo)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Crises & Coalizões', exact: true }).click();
  const center = page.getByRole('dialog', { name: 'Conselho Estratégico', exact: true });
  await center.waitFor();
  assert.equal(await page.locator('[data-context-panel]').count(), 0);
  await center.getByRole('heading', { name: 'Ameaça e contenção' }).waitFor();
  for (const name of [
    'Diplomacia',
    'Árvore Militar',
    'Comércio & Mares',
    'Objetivos',
    'Estatísticas',
  ]) {
    await center.getByRole('tab', { name, exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
  }
  await center.getByRole('region', { name: 'Estatísticas da campanha', exact: true }).waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await center.evaluate((e) => e.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await center.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Comércio & Mares', exact: true }).click();
  await center.waitFor();
  await page.locator('[data-modal-backdrop]').click({ position: { x: 4, y: 200 } });
  await center.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manual de campanha' }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  await page.locator('.province-shape[data-province="brazil"]').press('Enter');
  await until((g) => g.plannedOrders.some((o) => o.type === 'AUTO_TRANSPORT' && !o.fleetId));
  const treasury = get().players[0].gold;
  await page.screenshot({ path: '.local/screenshots/rc-map-desktop.png' });
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  const peers = await Promise.all(fixtures.transport.slice(1).map((s) => fixturePeer(base, s)));
  try {
    for (const peer of peers) peer.send({ type: 'READY', ready: true });
    const crossed = await until((g) => g.turn === 2);
    assert.equal(crossed.battalions.find((a) => a.id === main.id)?.provinceId, 'brazil');
    const economy = crossed.lastReport!.economy.find((e) => e.playerId === main.ownerId)!;
    assert.ok(Math.abs(crossed.players[0].gold - (treasury - 15 - buildGold + economy.net)) < 0.02);
    assert.equal(crossed.provinces.find((p) => p.id === 'portugal')!.barracksLevel, 1);
    assert.ok(crossed.history[0].analytics?.length === 3);
  } finally {
    for (const peer of peers) peer.socket.close();
  }
  await page.locator('[data-turn-announcement]').waitFor();
  const replay = page.getByRole('button', { name: 'Encerrar animação', exact: true });
  if (await replay.isVisible()) await replay.click();
  const critical = page.getByRole('complementary', { name: 'Alertas pessoais críticos' });
  await critical.waitFor();
  assert.equal(await critical.locator('[data-notification]').count(), 0);
  await critical.getByRole('button', { name: /Alertas críticos/ }).click();
  const cameraBefore = await page.locator('[data-zoom]').getAttribute('data-zoom');
  await critical.getByRole('button', { name: '📍 Focar no Mapa', exact: true }).first().click();
  assert.notEqual(await page.locator('[data-zoom]').getAttribute('data-zoom'), cameraBefore);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Conselho da nação', exact: true });
  await menu.getByLabel('Seu nome', { exact: true }).fill('Capitã do Atlas');
  await menu.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await until((g) => g.players[0].name === 'Capitã do Atlas');
  const musicSlider = menu.getByRole('slider', { name: 'Volume da música', exact: true });
  await musicSlider.press('Home');
  for (let i = 0; i < 8; i++) await musicSlider.press('ArrowRight');
  assert.equal(await page.evaluate(() => localStorage.getItem('concordia-music-volume')), '0.4');
  await menu.getByRole('button', { name: 'Silenciar música', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('concordia-music-volume')), '0');
  const effectsSlider = menu.getByRole('slider', { name: 'Volume dos efeitos', exact: true });
  await effectsSlider.press('Home');
  for (let i = 0; i < 12; i++) await effectsSlider.press('ArrowRight');
  assert.equal(await page.evaluate(() => localStorage.getItem('concordia-effects-volume')), '0.6');
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport(page);
  const toggle = menu.getByRole('checkbox', { name: 'Relevo cartográfico 2,5D', exact: true });
  await toggle.uncheck();
  await page.locator('[data-interface="classic"]').waitFor();
  await toggle.check();
  await page.keyboard.press('Escape');
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  const mobileBox = (await page.locator('[data-context-panel]').boundingBox())!;
  assert.ok(
    mobileBox.x >= 0 &&
      mobileBox.x + mobileBox.width <= 390 &&
      mobileBox.y + mobileBox.height <= 844,
  );
  await page.screenshot({ path: '.local/screenshots/rc-map-mobile.png' });
  const visuals = await open(fixtures.visual[0]);
  await visuals.page.locator('[data-winter-frost]').first().waitFor();
  assert.ok((await visuals.page.locator('.siege-flame').count()) > 0);
  for (const kind of ['FORT', 'BARRACKS', 'MARKET', 'PORT', 'FOUNDRY', 'TEMPLE'])
    assert.ok((await visuals.page.locator(`[data-structure="${kind}"]`).count()) > 0);
  assert.ok((await visuals.page.locator('[data-composition="artillery"]').count()) > 0);
  assert.ok((await visuals.page.locator('[data-composition="cavalry"]').count()) > 0);
  assert.ok((await visuals.page.locator('.miniature-crown').count()) > 0);
  assert.ok((await visuals.page.locator('.miniature-alert').count()) > 0);
  assert.equal(await visuals.page.locator('[data-miniature] rect').count(), 0);
  await visuals.page.screenshot({ path: '.local/screenshots/rc-miniatures-winter.png' });
  const lesson = await open();
  await lesson.page
    .getByRole('button', { name: '🎓 Tutorial Rápido (5 Passos)', exact: true })
    .click();
  await lesson.until((g) => g.matchConfig.tutorial === true && g.phase === 'planning');
  assert.equal(lesson.get().isPublic, false);
  assert.equal(lesson.get().players.filter((p) => !p.bot).length, 1);
  const step = (n: number) => lesson.page.locator(`[data-tutorial-step="${n}"]`).waitFor();
  await step(1);
  const learner = lesson.get().players[0],
    army = lesson.get().battalions.find((a) => a.ownerId === learner.id && !a.isFleet)!;
  await lesson.page.locator(`[data-battalion="${army.id}"]`).press('Enter');
  await lesson.page.locator('.province-shape[data-province="maghreb"]').press('Enter');
  await step(2);
  for (
    let i = 0;
    i < 4 && lesson.get().provinces.find((p) => p.id === 'maghreb')!.ownerId !== learner.id;
    i++
  ) {
    const next = lesson.get().turn + 1;
    await lesson.page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
    await lesson.until((g) => g.turn === next);
  }
  await step(3);
  await lesson.page.keyboard.press('Escape');
  await lesson.page.locator('.province-shape[data-province="portugal"]').press('Enter');
  await lesson.page.getByRole('button', { name: /Construir Quartel/ }).click();
  await lesson.until((g) => g.plannedOrders.some((o) => o.type === 'BUILD_BUILDING'));
  const afterBuild = lesson.get().turn + 1;
  await lesson.page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await lesson.until((g) => g.turn === afterBuild);
  await step(4);
  await lesson.page.getByRole('tab', { name: '⚔️ Recrutamento & Guarnição', exact: true }).click();
  await lesson.page.getByRole('button', { name: /^Recrutar batalhão/ }).click();
  await lesson.until((g) => g.plannedOrders.some((o) => o.type === 'RECRUIT_BATTALION'));
  await lesson.page.locator(`[data-battalion="${army.id}"]`).press('Enter');
  await lesson.page.getByRole('tab', { name: '🎖️ Líder', exact: true }).click();
  const commander = lesson.get().commanders.find((c) => c.ownerId === learner.id && !c.isAdmiral)!;
  await lesson.page
    .getByLabel('Líder atribuído (instantâneo)', { exact: true })
    .selectOption(commander.id);
  await step(5);
  for (const label of ['Diplomacia', 'Comércio & Mares', 'Objetivos']) {
    await lesson.page.getByRole('button', { name: label, exact: true }).click();
    await lesson.page.getByRole('dialog', { name: 'Conselho Estratégico' }).waitFor();
    await lesson.page.keyboard.press('Escape');
  }
  await lesson.page.getByRole('button', { name: 'Concluir tutorial', exact: true }).click();
  assert.equal(await lesson.page.locator('[data-tutorial-step]').count(), 0);
  await lesson.page.getByRole('button', { name: 'Estatísticas da campanha', exact: true }).click();
  const stats = lesson.page.getByRole('region', { name: 'Estatísticas da campanha', exact: true });
  await stats.waitFor();
  for (const label of ['Expansão Territorial', 'Poderio Econômico', 'Força Militar & Batalhas']) {
    await stats.getByRole('tab', { name: label, exact: true }).click();
    assert.ok((await stats.locator('[data-chart-series]').count()) === 3);
  }
  assert.equal(await stats.locator('[data-medal]').count(), 4);
  await lesson.page.screenshot({ path: '.local/screenshots/rc-analytics.png' });
  await viewport(lesson.page);
  assert.deepEqual(errors, []);
  console.log(
    'RC cartográfico passou: SVG sem caixas, seis construções, neve/cerco, HUD ≤20%, contexto único, central exclusiva/teclado/mapa, fretamento multiplayer, alertas, volumes separados, celular, tutorial completo de cinco passos e gráficos/medalhas.',
  );
} catch (error) {
  await debugPage?.screenshot({ path: '.local/screenshots/rc-failure.png' }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (server && server.exitCode === null) {
    const ended = once(server, 'exit');
    server.kill('SIGTERM');
    await ended;
  }
  await rm(temp, { recursive: true, force: true });
}
