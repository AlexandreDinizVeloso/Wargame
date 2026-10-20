import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import type { GameView } from '../shared/types';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
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
  page.on('websocket', (socket) =>
    socket.on('framereceived', (event) => {
      try {
        const m = JSON.parse(String(event.payload));
        if (m.type === 'state') state = m.state;
      } catch {}
    }),
  );
  return {
    get: () => {
      assert.ok(state);
      return state;
    },
    async until(predicate: (g: GameView) => boolean) {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        if (state && predicate(state)) return state;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('Estado esperado não recebido do servidor.');
    },
  };
}
async function viewport(page: Page) {
  const v = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: innerWidth,
    vh: innerHeight,
  }));
  assert.ok(v.w <= v.vw + 1 && v.h <= v.vh + 1, `Viewport rolou: ${JSON.stringify(v)}`);
}
async function drag(
  page: Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
  button: 'left' | 'middle' | 'right' = 'left',
) {
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up({ button });
}
async function savedDownload(page: Page, button: ReturnType<Page['getByRole']>, filename: string) {
  const downloading = page.waitForEvent('download');
  await button.click();
  const file = await downloading;
  await file.saveAs(filename);
  return readFile(filename, 'utf8');
}
try {
  await mkdir('.local/screenshots', { recursive: true });
  await mkdir('.local/exports', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(),
    state = observe(page);
  await page.addInitScript(() => {
    const native = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const w = window as unknown as { audioNodes: number };
      w.audioNodes = (w.audioNodes ?? 0) + 1;
      return native.call(this);
    };
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'Jogar demonstração' }).waitFor();
  await viewport(page);
  await page.screenshot({ path: '.local/screenshots/v3-inicio.png' });
  await page.getByRole('button', { name: 'Jogar demonstração' }).click();
  await state.until((g) => g.phase === 'planning');
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).waitFor();
  await viewport(page);
  assert.equal(state.get().version, 3);
  assert.equal(state.get().provinces.filter((p) => p.kind === 'LAND').length, 16);
  for (const [i, mode] of [
    'POLITICAL',
    'RELIGIOUS',
    'ECONOMIC_SUPPLY',
    'DIPLOMATIC',
    'UNREST',
  ].entries()) {
    await page.keyboard.press(String(i + 1));
    await page.waitForFunction(
      (m) => document.querySelector('.map-stage')?.getAttribute('data-mode') === m,
      mode,
    );
  }
  await page.keyboard.press('1');
  await page.mouse.move(950, 430);
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(
    () => document.querySelector('.map-stage')?.getAttribute('data-zoom') === '3.500',
  );
  await page.mouse.wheel(0, 10000);
  await page.waitForFunction(
    () => document.querySelector('.map-stage')?.getAttribute('data-zoom') === '0.800',
  );
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  for (const button of ['middle', 'right'] as const) {
    const before = await page.locator('.map-stage').getAttribute('data-camera-x');
    await drag(page, 950, 430, 65, 25, button);
    assert.notEqual(await page.locator('.map-stage').getAttribute('data-camera-x'), before);
  }
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const spaceBefore = await page.locator('.map-stage').getAttribute('data-camera-x');
  await page.keyboard.down('Space');
  await drag(page, 950, 430, 65, 25);
  await page.keyboard.up('Space');
  assert.notEqual(await page.locator('.map-stage').getAttribute('data-camera-x'), spaceBefore);
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  await page.getByRole('button', { name: 'Província', exact: true }).click();
  const city = page.getByRole('region', { name: 'Inspeção de Província' });
  await city.waitFor();
  assert.ok(await city.getByRole('heading', { name: 'Portugal', exact: true }).isVisible());
  await city.getByRole('button', { name: 'Desanexar Inspeção de Província' }).click();
  assert.equal(await city.getAttribute('data-docked'), 'false');
  let box = (await city.boundingBox())!;
  await drag(page, box.x + 100, box.y + 20, 80, 20);
  const moved = (await city.boundingBox())!;
  assert.ok(moved.x > box.x + 60);
  const resize = await city
    .getByRole('button', { name: 'Redimensionar Inspeção de Província' })
    .boundingBox();
  assert.ok(resize);
  await drag(page, resize.x + resize.width / 2, resize.y + resize.height / 2, 45, 20);
  box = (await city.boundingBox())!;
  assert.ok(box.width > 360);
  const geometry = { x: box.x, y: box.y, width: box.width };
  await city.getByRole('button', { name: 'Minimizar Inspeção de Província' }).click();
  assert.ok((await city.boundingBox())!.height < 50);
  await city.getByRole('button', { name: 'Fechar Inspeção de Província' }).click();
  await page.getByRole('button', { name: 'Província', exact: true }).click();
  assert.ok((await city.boundingBox())!.height < 50);
  await city.getByRole('button', { name: 'Restaurar Inspeção de Província' }).click();
  await page.reload();
  await state.until((g) => g.phase === 'planning');
  await page.getByRole('button', { name: 'Província', exact: true }).click();
  await city.waitFor();
  const persisted = (await city.boundingBox())!;
  assert.equal(persisted.x, geometry.x);
  assert.equal(persisted.width, geometry.width);
  await city.getByRole('button', { name: /Construir mercado/ }).click();
  await state.until((g) => g.plannedOrders.some((o) => o.type === 'BUILD_MARKET'));
  await city.getByRole('button', { name: 'Fechar Inspeção de Província' }).click();
  await page.locator('[data-battalion="army-1"]').click();
  const army = page.getByRole('region', { name: 'Comando de Batalhão' });
  await army.waitFor();
  assert.equal(await city.count(), 0);
  await army.getByRole('button', { name: /Treinar · 6 ouro/ }).click();
  await state.until((g) => g.plannedOrders.length === 2);
  assert.ok(
    state.get().plannedOrders.some((o) => o.type === 'BUILD_MARKET') &&
      state.get().plannedOrders.some((o) => o.type === 'TRAIN_BATTALION'),
  );
  await page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  const diplomacy = page.getByRole('region', { name: 'Diplomacia & Guerras' });
  await diplomacy.locator('.realm-row').filter({ hasText: 'Coroa de Castela' }).click();
  await diplomacy.locator('summary').filter({ hasText: 'Declaração formal de guerra' }).click();
  await diplomacy.getByRole('button', { name: 'Declarar guerra', exact: true }).click();
  await state.until((g) => g.wars.some((w) => w.active));
  await diplomacy.getByRole('button', { name: 'Fechar Diplomacia & Guerras' }).click();
  await page
    .locator('path.province-shape[data-province="castile"]')
    .click({ button: 'right', force: true });
  await state.until((g) => g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'));
  await page.locator('.planned-route').waitFor();
  assert.equal(state.get().plannedOrders.length, 2);
  await page.screenshot({ path: '.local/screenshots/v3-ordens.png' });
  await army.getByRole('button', { name: 'Fechar Comando de Batalhão' }).click();
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await state.until((g) => g.turn === 2);
  await page.locator('.turn-replay').waitFor();
  assert.ok(state.get().lastReport!.battles.length > 0);
  await page.locator('.battle-burst').first().waitFor({ timeout: 5000 });
  assert.match((await page.locator('.casualty-badge').first().textContent()) ?? '', /−\d+ tropas/);
  await page.screenshot({ path: '.local/screenshots/v3-replay.png' });
  await page.locator('.turn-replay').waitFor({ state: 'hidden', timeout: 7000 });
  await page
    .locator('.footer-tabs')
    .getByRole('button', { name: /Relatórios/ })
    .click();
  const report = page.getByRole('region', { name: 'Relatório do Turno' });
  await report.locator('.battle-report summary').first().click();
  await page.screenshot({ path: '.local/screenshots/v3-relatorio.png' });
  await report.getByRole('button', { name: 'Rever Animação do Turno' }).click();
  await page.locator('.turn-replay').waitFor();
  await page.getByRole('button', { name: 'Encerrar animação' }).click();
  await report.getByRole('button', { name: 'Fechar Relatório do Turno' }).click();
  const data = JSON.parse(
    await savedDownload(
      page,
      page.getByRole('button', { name: 'Baixar Relatório (.JSON)', exact: true }),
      '.local/exports/v3-match.json',
    ),
  );
  assert.equal(data.schemaVersion, 3);
  assert.equal(data.turnByTurnHistory.length, 1);
  for (const key of [
    'matchConfig',
    'nations',
    'wars',
    'battles',
    'dietHistory',
    'economyMetrics',
    'finalState',
  ])
    assert.ok(key in data);
  assert.equal('seed' in data.finalState, false);
  const txt = await savedDownload(
    page,
    page.getByRole('button', { name: 'Baixar Crônica (.TXT)', exact: true }),
    '.local/exports/v3-chronicle.txt',
  );
  assert.ok(txt.includes('RODADA 1') && txt.includes('ESTATÍSTICAS FINAIS'));
  await page.getByRole('button', { name: 'Silenciar som' }).click();
  const muted = await page.evaluate(() => (window as unknown as { audioNodes: number }).audioNodes);
  await page.getByRole('button', { name: 'Mapa Religião', exact: true }).click();
  assert.equal(
    await page.evaluate(() => (window as unknown as { audioNodes: number }).audioNodes),
    muted,
  );
  assert.equal(await page.locator('.game-viewport').getAttribute('data-audio-muted'), 'true');
  await page.getByRole('button', { name: 'Ativar som' }).click();
  await page.getByRole('button', { name: 'Mapa Político', exact: true }).click();
  assert.ok(
    (await page.evaluate(() => (window as unknown as { audioNodes: number }).audioNodes)) > muted,
  );
  await page.getByRole('button', { name: 'Conselho público' }).click();
  await page.getByLabel('Mensagem ao conselho').fill('Que a paz dure cinco rodadas.');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await page
    .locator('.chat-messages p')
    .filter({ hasText: 'Que a paz dure cinco rodadas.' })
    .waitFor();
  await page.getByRole('button', { name: 'Fechar Relatório do Turno' }).click();
  await page.getByRole('button', { name: 'Dieta Imperial', exact: true }).click();
  const diet = page.getByRole('region', { name: 'Dieta Imperial' });
  await diet.getByRole('button', { name: 'Ingressar na Dieta' }).click();
  await state.until((g) => g.diet.memberRealmIds.includes(g.players[0].id));
  await page.screenshot({ path: '.local/screenshots/v3-dieta.png' });
  await diet.getByRole('button', { name: 'Fechar Dieta Imperial' }).click();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByLabel('Política religiosa').selectOption('INQUISITION');
  await state.until((g) => g.players[0].religiousPolicy === 'INQUISITION');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manual de campanha' }).waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport(page);
  const ready = (await page
    .getByRole('button', { name: 'Confirmar ordens', exact: false })
    .boundingBox())!;
  assert.ok(ready.x >= 0 && ready.x + ready.width <= 391);
  await page.getByRole('button', { name: 'Província', exact: true }).click();
  await city.waitFor();
  const mobile = (await city.boundingBox())!;
  assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 391 && mobile.y + mobile.height <= 845);
  await page.screenshot({ path: '.local/screenshots/v3-celular.png' });
  await context.close();
  const contexts = await Promise.all(
      [0, 1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })),
    ),
    pages = await Promise.all(contexts.map((c) => c.newPage())),
    states = pages.map(observe);
  await Promise.all(pages.map((p) => p.goto(base)));
  const host = pages[0];
  await host.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  assert.equal(await host.locator('.entry-form .nation-card').count(), 8);
  await host.getByLabel('Como devemos chamar você?').fill('Ana');
  await host.getByLabel('Teatro da partida').selectOption('AMERICAS');
  await host.getByRole('button', { name: 'Reunir o conselho' }).click();
  await host.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  const code = await host.locator('.room-invite strong').innerText();
  assert.equal(states[0].get().theater, 'AMERICAS');
  for (const [i, guest] of pages.slice(1).entries()) {
    await guest.getByRole('button', { name: 'Entrar na campanha', exact: true }).click();
    await guest.getByLabel('Como devemos chamar você?').fill(i === 0 ? 'Bruno' : 'Clara');
    await guest.getByLabel('Código da sala').fill(code);
    await guest.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
    await guest.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  }
  await host.getByRole('button', { name: /Império Ming/ }).click();
  await states[0].until((g) => g.players[0].nationId === 'MING');
  await host.getByLabel('Cenário').selectOption('campaign');
  await states[0].until((g) => g.provinces.filter((p) => p.kind === 'LAND').length === 56);
  await host.getByRole('button', { name: 'Iniciar campanha', exact: true }).click();
  await Promise.all(states.map((s) => s.until((g) => g.phase === 'planning')));
  for (const [i, p] of pages.entries()) {
    await p.getByRole('button', { name: 'Dieta Imperial', exact: true }).click();
    const d = p.getByRole('region', { name: 'Dieta Imperial' });
    await d.getByRole('button', { name: 'Ingressar na Dieta' }).click();
    await states[i].until((g) => g.diet.memberRealmIds.includes(g.players[i].id));
    if (i > 0) {
      await d.getByRole('button', { name: 'Votar em Império Ming', exact: true }).click();
    }
    await d.getByRole('button', { name: 'Fechar Dieta Imperial' }).click();
  }
  for (const p of pages)
    await p.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await Promise.all(states.map((s) => s.until((g) => g.turn === 2)));
  await pages[2].close();
  await host.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  const hd = host.getByRole('region', { name: 'Diplomacia & Guerras' });
  await hd.locator('.realm-row').filter({ hasText: 'Clara' }).click();
  await hd.getByRole('button', { name: 'Substituir ausente por bot' }).click();
  await states[0].until((g) => g.players.find((p) => p.name === 'Clara')?.bot === true);
  await hd.getByRole('button', { name: 'Fechar Diplomacia & Guerras' }).click();
  for (let turn = 2; turn <= 5; turn++) {
    for (const p of pages.slice(0, 2))
      await p.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
    await states[0].until((g) => (turn === 5 ? g.phase === 'finished' : g.turn === turn + 1));
  }
  const final = await states[0].until((g) => g.phase === 'finished');
  assert.equal(final.winnerObjective, 'IMPERIAL_PACIFICATION');
  assert.equal(final.winnerId, final.players[0].id);
  const result = host.getByRole('dialog', { name: 'Resultado da campanha' });
  await result.waitFor();
  const endData = JSON.parse(
    await savedDownload(
      host,
      result.getByRole('button', { name: 'Baixar Relatório (.JSON)', exact: true }),
      '.local/exports/v3-final.json',
    ),
  );
  assert.equal(endData.turnByTurnHistory.length, 5);
  assert.equal(endData.finalState.winnerObjective, 'IMPERIAL_PACIFICATION');
  const endTxt = await savedDownload(
    host,
    result.getByRole('button', { name: 'Baixar Crônica (.TXT)', exact: true }),
    '.local/exports/v3-final.txt',
  );
  assert.ok(endTxt.includes('RODADA 5'));
  await host.screenshot({ path: '.local/screenshots/v3-vitoria.png' });
  assert.deepEqual(errors, [], 'Não deve haver erros no navegador.');
  console.log(
    'v0.3 verificada: mapa orgânico, 5 modos, pan/zoom, janelas móveis/redimensionáveis/persistentes, ordens separadas, guerra formal, marcha, replay, áudio/mute, JSON/TXT, Dieta, celular, 3 jogadores e vitória imperial em cinco rodadas.',
  );
} finally {
  await browser.close();
}
