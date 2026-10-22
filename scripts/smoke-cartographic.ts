import { mapPoint, rightClickProvince } from './map-interactions';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
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
    await context.addInitScript(() => {
      const stats = { buffers: 0, oscillatorTypes: [] as string[] };
      (window as unknown as { foleyStats: typeof stats }).foleyStats = stats;
      const buffer = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () {
        stats.buffers++;
        return buffer.call(this);
      };
      const oscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () {
        const node = oscillator.call(this),
          start = node.start.bind(node);
        node.start = function (when?: number) {
          stats.oscillatorTypes.push(node.type);
          return start(when);
        };
        return node;
      };
    });

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
  assert.equal(
    await card.locator('.region-heading .province-overview, span > form.province-ping').count(),
    0,
  );
  assert.equal(await card.locator('.province-overview > div').count(), 5);
  const box = (await card.boundingBox())!;
  assert.equal(box.width, 480);
  assert.equal(box.height, 540);
  assert.equal(await card.evaluate((e) => e.scrollWidth > e.clientWidth), false);
  assert.equal(await page.locator('.first-ready-banner').count(), 1);
  const header = card.locator('.window-title');
  let headerBox = (await header.boundingBox())!;
  await page.mouse.move(headerBox.x + 80, headerBox.y + 18);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 140, headerBox.y - 42, { steps: 6 });
  await page.mouse.up();
  const moved = (await card.boundingBox())!;
  assert.ok(moved.x > box.x + 40 && moved.y < box.y - 40);
  for (const [kind, dx, dy] of [
    ['largura', 70, 0],
    ['altura', 0, 30],
    ['canto', 20, -15],
  ] as const) {
    const handle = await card
      .getByRole('button', { name: `Redimensionar Inspeção de Província: ${kind}`, exact: true })
      .boundingBox();
    assert.ok(handle);
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + dx, handle.y + handle.height / 2 + dy, {
      steps: 5,
    });
    await page.mouse.up();
  }
  const resized = (await card.boundingBox())!;
  assert.ok(resized.width > moved.width + 70 && resized.height > moved.height);
  await page.reload();
  await page.locator('[data-interface="cartographic"]').waitFor();
  await page.locator('.province-shape[data-province="portugal"]').press('Enter');
  const persisted = (await card.boundingBox())!;
  assert.ok(
    Math.abs(persisted.width - resized.width) <= 1 && Math.abs(persisted.x - resized.x) <= 1,
  );
  await card
    .getByRole('button', {
      name: 'Restaurar tamanho e posição de Inspeção de Província',
      exact: true,
    })
    .click();
  assert.equal((await card.boundingBox())!.width, 480);
  assert.equal((await card.boundingBox())!.height, 540);
  await card.getByRole('button', { name: 'Minimizar Inspeção de Província', exact: true }).click();
  assert.equal((await card.boundingBox())!.height, 42);
  await card.getByRole('button', { name: 'Restaurar Inspeção de Província', exact: true }).click();

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
  const ordersBeforeSelection = JSON.stringify(get().plannedOrders);
  const neutralPoint = await mapPoint(page, 'maghreb');
  await page.mouse.move(neutralPoint.x, neutralPoint.y);
  await page.getByRole('tooltip', { name: 'Prévia de combate' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/v095-battle-preview.png' });
  await page.mouse.click(neutralPoint.x, neutralPoint.y);
  await card.waitFor();
  await card
    .getByRole('heading', {
      name: get().provinces.find((p) => p.id === 'maghreb')!.name,
      exact: true,
    })
    .waitFor();
  assert.equal(JSON.stringify(get().plannedOrders), ordersBeforeSelection);
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  const panStart = await page.locator('.map-stage').getAttribute('data-camera-x');
  const panPoint = await mapPoint(page, 'maghreb');
  await page.mouse.move(panPoint.x, panPoint.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(panPoint.x + 12, panPoint.y, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  assert.notEqual(await page.locator('.map-stage').getAttribute('data-camera-x'), panStart);
  assert.equal(JSON.stringify(get().plannedOrders), ordersBeforeSelection);
  const buffersBefore = await page.evaluate(
    () => (window as unknown as { foleyStats: { buffers: number } }).foleyStats.buffers,
  );
  await rightClickProvince(page, 'maghreb');
  await until((g) =>
    g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION' && o.battalionId === main.id),
  );
  assert.ok(
    await page.evaluate(
      (before) =>
        (window as unknown as { foleyStats: { buffers: number } }).foleyStats.buffers >= before + 3,
      buffersBefore,
    ),
    'Travessia pelo estreito deve usar ruídos de navegação.',
  );
  await page.getByRole('button', { name: '❌ Cancelar Ordem Atual', exact: true }).click();
  await until((g) => !g.plannedOrders.some((o) => 'battalionId' in o && o.battalionId === main.id));
  const pingPoint = await mapPoint(page, 'maghreb');
  await page.keyboard.down('Alt');
  await page.mouse.click(pingPoint.x, pingPoint.y);
  await page.keyboard.up('Alt');
  await page.locator('[data-map-ping]').waitFor();
  assert.equal(await page.locator('[data-window="battalion"]').count(), 1);
  assert.equal(JSON.stringify(get().plannedOrders), ordersBeforeSelection);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-map-ping]').length === 0,
    null,
    { timeout: 8000 },
  );
  await page.locator('.province-shape[data-province="portugal"]').press('Enter');
  await card.getByLabel('Nota do sinal para aliados', { exact: true }).fill('Defender o porto');
  await card.getByRole('button', { name: '📍 Sinalizar no Mapa', exact: true }).click();
  await page.locator('[data-map-ping]').filter({ hasText: 'Defender o porto' }).waitFor();
  assert.equal(JSON.stringify(get().plannedOrders), ordersBeforeSelection);
  await page.screenshot({ path: '.local/screenshots/v095-province-ping.png' });

  const fleet = get().battalions.find((a) => a.ownerId === main.ownerId && a.isFleet)!;
  const beforeSail = await page.evaluate(
    () => (window as unknown as { foleyStats: { buffers: number } }).foleyStats.buffers,
  );
  await page.locator(`[data-battalion="${fleet.id}"]`).press('Enter');
  assert.ok(
    await page.evaluate(
      (before) =>
        (window as unknown as { foleyStats: { buffers: number } }).foleyStats.buffers >= before + 3,
      beforeSail,
    ),
  );
  await page.getByRole('button', { name: 'Crises & Coalizões', exact: true }).click();
  const center = page.locator('[data-window="strategy-center"]');
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
    await page
      .getByRole('button', {
        name: name === 'Estatísticas' ? 'Estatísticas da campanha' : name,
        exact: true,
      })
      .click();
    assert.equal(await center.locator('.strategy-tabs').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 1);
  }
  await center.getByRole('region', { name: 'Estatísticas da campanha', exact: true }).waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await center.evaluate((e) => e.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await center.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Crônica', exact: true }).click();
  const news = page.getByRole('region', { name: '🗺️ Crônica', exact: true });
  await news.waitFor();
  assert.equal(await news.locator('.panel-tabs,.first-ready-banner').count(), 0);
  assert.equal(await page.locator('.first-ready-banner').count(), 1);
  await news.getByRole('button', { name: 'Marcar todos como lidos', exact: true }).click();
  await page.getByRole('button', { name: 'Comércio & Mares', exact: true }).click();
  await center.waitFor();
  await page.locator('.map-stage').click({ position: { x: 12, y: 300 } });
  await center.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manual de campanha' }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator(`[data-battalion="${main.id}"]`).press('Enter');
  await rightClickProvince(page, 'brazil');
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
  await page.locator('.turn-replay').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.turn-replay,.siege-flame,.siege-smoke'),
    null,
    { timeout: 5500 },
  );
  assert.equal(await page.locator('.turn-replay,.siege-flame,.siege-smoke').count(), 0);
  await page.getByRole('button', { name: 'Rever Animação do Turno', exact: true }).click();
  await page.locator('.turn-replay').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.turn-replay,.siege-flame,.siege-smoke'),
    null,
    { timeout: 5500 },
  );

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
  assert.equal(await visuals.page.locator('.siege-flame').count(), 0);
  assert.ok((await visuals.page.locator('.siege-progress-label').count()) > 0);
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
  await rightClickProvince(lesson.page, 'maghreb');
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
    await lesson.page
      .getByRole('dialog', {
        name:
          label === 'Diplomacia'
            ? '👑 Diplomacia & Tratados'
            : label === 'Comércio & Mares'
              ? '⚓ Comércio & Mares'
              : '🎯 Objetivos',
      })
      .waitFor();
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
  const soundStats = await lesson.page.evaluate(
    () =>
      (window as unknown as { foleyStats: { buffers: number; oscillatorTypes: string[] } })
        .foleyStats,
  );
  assert.ok(soundStats.buffers >= 20, 'Marcha e combate devem usar camadas de buffers de ruído.');
  assert.ok(
    soundStats.oscillatorTypes.every((type) => type === 'sine'),
    'Efeitos sem osciladores sawtooth/square. Música desativada no smoke.',
  );

  const gold = await open(fixtures.gold[0]);
  await gold.page.locator('[data-campaign-era="ERA_EMPIRES"]').waitFor();
  for (const [key, id] of [
    ['F1', 'POLITICAL'],
    ['F2', 'ECONOMIC'],
    ['F3', 'LOGISTICS'],
    ['F4', 'DIPLOMATIC'],
    ['F5', 'UNREST'],
  ] as const) {
    await gold.page.keyboard.press(key);
    await gold.page.locator(`[data-map-legend="${id}"]`).waitFor();
  }
  await gold.page.keyboard.press('F2');
  assert.ok((await gold.page.locator('.lens-badge').count()) > 20);
  const outliner = gold.page.getByRole('complementary', { name: 'Outliner militar e econômico' });
  await outliner.waitFor();
  const ownGold = gold.get().battalions.filter((a) => a.ownerId === gold.get().players[0].id);
  assert.equal(await outliner.locator('[data-outliner-unit]').count(), ownGold.length);
  await gold.page.keyboard.press('o');
  assert.equal(
    await outliner.getByRole('button', { name: 'Abrir Outliner', exact: true }).count(),
    1,
  );
  await gold.page.keyboard.press('o');
  await gold.page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await gold.page.keyboard.press('Tab');
  await gold.page.locator('[data-window="battalion"]').waitFor();
  await outliner.locator('[data-outliner-city]').first().click();
  await gold.page.locator('[data-window="province"]').waitFor();
  await gold.page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  const treaty = gold.page.getByRole('region', { name: 'Mesa de Tratados de Paz' });
  await treaty.waitFor();
  assert.ok(gold.get().wars[0].warScore >= 25);
  await treaty.getByRole('checkbox', { name: /Reparações de Guerra/ }).check();
  await treaty.getByText('Custo das cláusulas: 25/', { exact: false }).waitFor();
  await treaty.getByRole('button', { name: 'Enviar proposta de paz', exact: true }).click();
  const proposal = await gold.until((g) => g.offers.some((o) => o.kind === 'peace'));
  const goldPeer = await fixturePeer(base, fixtures.gold[1]);
  goldPeer.send({
    type: 'ANSWER_OFFER',
    offerId: proposal.offers.find((o) => o.kind === 'peace')!.id,
    accept: true,
  });
  await gold.until((g) => g.wars.every((w) => !w.active));
  goldPeer.socket.close();
  await gold.page.keyboard.press('Escape');
  await gold.page.getByRole('button', { name: 'Estatísticas da campanha', exact: true }).click();
  await gold.page.getByRole('tab', { name: '🎬 Time-Lapse do Mapa', exact: true }).click();
  const timeLapse = gold.page.getByRole('region', { name: 'Time-Lapse do Mapa', exact: true });
  await timeLapse.waitFor();
  assert.ok((await timeLapse.locator('[data-history-province]').count()) > 40);
  await timeLapse.getByLabel('Velocidade do Time-Lapse', { exact: true }).selectOption('4');
  await timeLapse.getByRole('button', { name: 'Reproduzir Time-Lapse' }).click();
  await timeLapse
    .getByRole('img', { name: `História do mapa · rodada ${gold.get().turn}` })
    .waitFor();
  await timeLapse.getByRole('button', { name: 'Rodada anterior', exact: true }).click();
  await gold.page.screenshot({ path: '.local/screenshots/gold-timelapse.png' });
  await gold.page.keyboard.press('Escape');
  await gold.page.getByRole('button', { name: 'Perfil do Estrategista', exact: true }).click();
  const profile = gold.page.getByRole('dialog', { name: '🏅 Perfil do Estrategista', exact: true });
  await profile.waitFor();
  assert.equal(await profile.locator('[data-achievement]').count(), 12);
  await profile.getByLabel('Nome do estrategista', { exact: true }).fill('Estrategista Gold');
  await gold.page.screenshot({ path: '.local/screenshots/gold-profile.png' });
  await gold.page.keyboard.press('Escape');
  await gold.page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  const saveEvent = gold.page.waitForEvent('download');
  await gold.page.getByRole('button', { name: '💾 Exportar Save JSON', exact: true }).click();
  const saveFile = await saveEvent;
  const savePath = '.local/exports/gold-save.json';
  await mkdir('.local/exports', { recursive: true });
  await saveFile.saveAs(savePath);
  const saveData = await readFile(savePath, 'utf8');
  assert.equal(JSON.parse(saveData).format, 'CONCORDIA_SAVE_098');
  assert.ok(!('sessions' in JSON.parse(saveData)));
  const imported = await open();
  await imported.page
    .getByLabel('Importar Cenário / Save JSON', { exact: true })
    .setInputFiles(savePath);
  await imported.until((g) => g.code !== gold.get().code && g.matchConfig.ruleset === 'GOLD_098');
  assert.equal(imported.get().isPublic, false);
  assert.equal(imported.get().turn, gold.get().turn);
  assert.deepEqual(imported.get().battalions, gold.get().battalions);
  await imported.page
    .getByRole('button', { name: /🔗 Convite privado de/ })
    .first()
    .waitFor();
  await gold.page.reload();
  await gold.page.locator('[data-interface]').waitFor();
  await gold.page.getByRole('button', { name: 'Perfil do Estrategista', exact: true }).click();
  await gold.page.getByLabel('Nome do estrategista', { exact: true }).waitFor();
  assert.equal(
    await gold.page.getByLabel('Nome do estrategista', { exact: true }).inputValue(),
    'Estrategista Gold',
  );
  const roomUI = await open();
  await roomUI.page.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await roomUI.page
    .getByLabel('Cenário de Campanha', { exact: true })
    .selectOption('IRON_CROWN_EUROPE');
  await roomUI.page.getByRole('button', { name: 'Reunir o conselho' }).click();
  await roomUI.until(
    (g) => g.phase === 'lobby' && g.matchConfig.scenarioId === 'IRON_CROWN_EUROPE',
  );
  await roomUI.page.getByText('✨ Friend-Pass Ativo:', { exact: false }).waitFor();
  await roomUI.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await roomUI.page
    .getByRole('button', { name: '🔗 Copiar Link de Convite da Sala', exact: true })
    .click();
  const invitation = await roomUI.page.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(invitation).searchParams.get('room'), roomUI.get().code);
  const friend = await open();
  await friend.page.goto(invitation);
  assert.equal(
    await friend.page.getByLabel('Código da sala', { exact: true }).inputValue(),
    roomUI.get().code,
  );
  assert.deepEqual(errors, []);
  console.log(
    'v0.98 cartográfico passou: SVG sem caixas, seis construções, neve/cerco, inspeção 480×540, seleção/movimento/pan, janelas persistentes, sinais efêmeros, replay limitado a 4s, áudio Foley, contexto único, central exclusiva/teclado/mapa, fretamento multiplayer, alertas, volumes separados, celular, tutorial completo de cinco passos e gráficos/medalhas; cinco lentes F1–F5, outliner O/Tab, tratados Gold, time-lapse, perfil persistente, save portátil e Friend-Pass.',
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
