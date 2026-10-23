import { getNationAuthority } from '../shared/economy';
import { rightClickProvince } from './map-interactions';
import { seedBrowserFixtures, fixturePeer, type FixtureSession } from './browser-fixtures';
import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GameView, PublicRoom } from '../shared/types';
let child: ChildProcess | undefined, debugPage: Page | undefined;
const temp = await mkdtemp(path.join(os.tmpdir(), 'concordia-browser-rc-'));
let base = process.env.BASE_URL;
const fixtures = !base ? seedBrowserFixtures(path.join(temp, 'rooms.json')) : null;
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
  const buttons = page.locator('.strategy-modal > header button[aria-label^="Fechar"]');
  while (await buttons.count()) await buttons.last().click();
}
async function selectProvince(page: Page, id: string) {
  await page.locator(`.province-shape[data-province="${id}"]`).press('Enter');
}
async function saveDownload(page: Page, label: string, filename: string) {
  if (!(await page.getByRole('button', { name: label, exact: true }).isVisible())) {
    await closeWindows(page);
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  }
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
    [0, 1, 2].map(async () => {
      const c = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      await c.addInitScript(() => {
        localStorage.setItem('concordia-interface', 'classic');
        localStorage.setItem('concordia-music-volume', '0');
      });
      return c;
    }),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    states = pages.map(observe),
    page = pages[0];
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const w = window as unknown as { audioNodes: number };
      w.audioNodes = (w.audioNodes ?? 0) + 1;
      return original.call(this);
    };
  });
  debugPage = page;
  await page.goto(base);
  await page.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await page.getByLabel('Como devemos chamar você?').fill('Capitã');
  await page.getByLabel('Cenário de Campanha', { exact: true }).selectOption('CLASSIC');
  await page.getByRole('button', { name: /Teatro continental/ }).click();
  await page.getByLabel('Nome da sala', { exact: true }).fill('Fronteiras v0.6');
  await page.getByLabel('Timer após o primeiro pronto').fill('120');
  await page.getByRole('button', { name: 'Reunir o conselho' }).click();
  await states[0].until((g) => g.phase === 'lobby');
  const room = states[0].get().code;
  const listed = (await fetch(`${base}/api/rooms`).then((r) => r.json())) as PublicRoom[];
  assert.ok(listed.some((r) => r.roomId === room && r.roomName === 'Fronteiras v0.6'));
  await page.getByRole('button', { name: /Ordem do Sol Invicto/ }).click();
  await states[0].until((g) => g.players[0].nationId === 'sol_invicto');
  for (let i = 1; i < 3; i++) {
    await pages[i].goto(base);
    await pages[i]
      .getByRole('heading', { name: '🌐 Salas Abertas (Entrar em 1 Clique)' })
      .waitFor();
    const card = pages[i].locator('.server-browser article').filter({ hasText: 'Fronteiras v0.6' });
    await card.getByRole('button', { name: 'Entrar na Sala', exact: true }).click();
    await states[i].until((g) => g.players.length === i + 1);
  }
  await page.getByRole('button', { name: 'Iniciar campanha' }).click();
  await Promise.all(states.map((s) => s.until((g) => g.phase === 'planning')));
  await pages[1].getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await pages[1].getByLabel('Seu nome', { exact: true }).fill('Almirante convidado');
  await pages[1].getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await states[0].until((g) => g.players[1].name === 'Almirante convidado');
  await pages[1].getByRole('button', { name: 'Fechar Conselho da nação', exact: true }).click();
  const collapseOutliner = page.getByRole('button', { name: 'Recolher Outliner', exact: true });
  if (await collapseOutliner.isVisible()) await collapseOutliner.click();
  let g = states[0].get();
  assert.equal(g.version, 7);
  assert.equal(g.turnDeadlineAt, null);
  assert.equal(g.players[0].secretObjectives.length, 2);
  assert.ok(g.players.slice(1).every((p) => p.secretObjectives.length === 0));
  await viewport(page);
  await page.getByText('Aguardando o 1º jogador finalizar', { exact: false }).waitFor();
  for (const name of ['Político', 'Suprimento', 'Economia', 'Diplomacia', 'Estabilidade'])
    await page.getByRole('button', { name: `Mapa ${name}`, exact: true }).click();
  assert.ok((await page.locator('.resource-badge').count()) > 0);
  await page.getByRole('button', { name: 'Mapa Economia', exact: true }).click();
  assert.ok((await page.locator('.resource-badge.emphasized').count()) > 0);
  await page.getByRole('button', { name: 'Objetivos', exact: true }).click();
  const secret = page.getByRole('dialog', { name: '🎯 Objetivos' });
  await secret.getByRole('button', { name: 'Escolher esta carta' }).first().click();
  await states[0].until((g) => g.players[0].selectedObjectiveId !== null);
  await closeWindows(page);
  assert.equal(g.allowBotSecretVictory, false);
  assert.ok((await page.locator('.strait-link').count()) > 0);
  for (let step = 0; step < 2; step++) {
    for (const p of pages) {
      const replay = p.getByRole('button', { name: 'Encerrar animação', exact: true });
      if (await replay.isVisible()) await replay.click();
      await p.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
    }
    await Promise.all(states.map((s) => s.until((g) => g.turn === step + 2)));
  }
  for (const p of pages) {
    const replay = p.getByRole('button', { name: 'Encerrar animação', exact: true });
    if (await replay.isVisible()) await replay.click();
  }
  g = states[0].get();
  const target = g.players[1];
  await page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  const dip = page.getByRole('dialog', { name: '👑 Diplomacia & Tratados' });
  await dip
    .getByRole('button', { name: `⚔️ Declarar Guerra a ${target.nation}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: /Ato de Guerra contra/ })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await closeWindows(page);
  const targetProvince = g.provinces.find((p) => p.ownerId === target.id)!;
  await selectProvince(page, targetProvince.id);
  const province = page.getByRole('region', { name: 'Inspeção de Província', exact: true });
  await province.getByRole('tab', { name: '📜 Diplomacia do Reino', exact: true }).click();
  await province
    .getByRole('button', { name: `⚔️ Declarar Guerra a ${target.nation}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: /Ato de Guerra contra/ })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await closeWindows(page);
  const own = g.battalions.find((a) => a.ownerId === g.players[0].id && !a.isFleet)!;
  await page.locator(`[data-battalion="${own.id}"]`).press('Enter');
  await closeWindows(page);
  await page.getByRole('region', { name: 'HUD tática de batalhão' }).waitFor();
  const leader = g.commanders.find((c) => c.assignedBattalionId === own.id)!;
  assert.ok(leader);
  const beforeCount = g.battalions.filter((a) => a.ownerId === g.players[0].id).length;
  await page.getByRole('button', { name: '➗ Dividir agora (50/50)', exact: true }).click();
  await states[0].until(
    (g) => g.battalions.filter((a) => a.ownerId === g.players[0].id).length === beforeCount + 1,
  );
  assert.equal(states[0].get().turn, 3);
  assert.equal(states[0].get().plannedOrders.length, 0);
  await page.getByRole('button', { name: '🔗 Fundir agora na província', exact: true }).click();
  await states[0].until(
    (g) => g.battalions.filter((a) => a.ownerId === g.players[0].id).length === beforeCount,
  );
  await page
    .getByRole('button', { name: '👣 Mover / Escolher Destino no Mapa', exact: true })
    .click();
  await page.getByRole('tab', { name: '🎖️ Líder', exact: true }).click();
  const leaderSelect = page.getByLabel('Líder atribuído (instantâneo)', { exact: true });
  await leaderSelect.selectOption('');
  await states[0].until(
    (g) => g.commanders.find((c) => c.id === leader.id)?.assignedBattalionId === null,
  );
  await leaderSelect.selectOption(leader.id);
  await states[0].until(
    (g) => g.commanders.find((c) => c.id === leader.id)?.assignedBattalionId === own.id,
  );
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-lider.png' });
  await closeWindows(page);
  await page.getByRole('tab', { name: '⚔️ Comando', exact: true }).click();
  await page.getByRole('button', { name: '➕ Reforçar / Recrutar Aqui', exact: true }).click();
  await page.getByRole('tab', { name: '🏛️ Cidade & Economia', exact: true }).click();
  assert.equal(await page.locator('.building-card').count(), 6);
  await page.getByRole('button', { name: /Construir Quartel/ }).click();
  await states[0].until((g) =>
    g.plannedOrders.some((o) => o.type === 'BUILD_BUILDING' && o.building === 'BARRACKS'),
  );
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-cidade.png' });
  await closeWindows(page);

  await page.locator(`[data-battalion="${own.id}"]`).press('Enter');
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
  assert.equal(await page.locator('.modal-backdrop').count(), 0);
  assert.equal(await page.locator('[role=dialog]').count(), 1);
  await modal.waitFor();
  await modal.getByRole('button', { name: '⚔️ Declarar Guerra e Marchar!', exact: true }).click();
  await states[0].until(
    (g) => g.wars.some((w) => w.active) && g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'),
  );
  await page
    .getByRole('button', { name: `Cancelar movimento de ${own.name}`, exact: true })
    .press('Enter');
  await states[0].until((g) => !g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'));
  await page.locator(`[data-battalion="${own.id}"]`).press('Enter');
  const badge = page.getByRole('button', { name: /🔔 Alertas críticos/ });
  if (await badge.isVisible()) await badge.click();
  const notices = page
    .getByRole('complementary', { name: 'Alertas pessoais críticos' })
    .getByRole('button', { name: 'Marcar alerta como lido', exact: true });
  while (await notices.count()) {
    const id = await notices
      .first()
      .evaluate((el) => el.closest('[data-notification-id]')!.getAttribute('data-notification-id'));
    await notices.first().press('Enter');
    await states[0].until((g) => g.readNotificationIds.includes(id!));
  }
  await states[0].until(
    (g) =>
      !g.notifications.some(
        (n) =>
          n.type !== 'WORLD' && n.severity === 'CRITICAL' && !g.readNotificationIds.includes(n.id),
      ),
  );
  const sourceNow = states[0].get().provinces.find((p) => p.id === own.provinceId)!;
  const adjacent = states[0]
    .get()
    .provinces.find(
      (p) => p.kind === 'LAND' && sourceNow.neighbors.includes(p.id) && p.ownerId === own.ownerId,
    )!;
  const destination = page.locator(
    `.province-shape[data-province="${adjacent.id}"][data-destination]`,
  );
  const destinationId = await destination.getAttribute('data-province');
  const neighbor = states[0].get().provinces.find((p) => p.id === destinationId)!;
  const neighborPoint = await destination.evaluate(
    (el) => {
      const box = (el as SVGGraphicsElement).getBBox();
      for (let row = 1; row < 16; row++)
        for (let col = 1; col < 16; col++) {
          const q = new DOMPoint(
            box.x + (box.width * col) / 16,
            box.y + (box.height * row) / 16,
          ).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);
          const x = q.x,
            y = q.y,
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
  await page.mouse.click(neighborPoint.x, neighborPoint.y, { button: 'right' });
  await states[0].until((g) =>
    g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION' || o.type === 'EMBARK_BATTALION'),
  );
  await page.getByRole('button', { name: '❌ Cancelar Ordem Atual', exact: true }).click();
  await states[0].until(
    (g) => !g.plannedOrders.some((o) => 'battalionId' in o && o.battalionId === own.id),
  );
  await page.getByRole('button', { name: '🏰 Entrincheirar (+Defesa)', exact: true }).click();
  await states[0].until((g) => g.plannedOrders.some((o) => o.type === 'ENTRENCH_BATTALION'));
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-comando.png' });
  await page
    .getByRole('button', { name: '👣 Mover / Escolher Destino no Mapa', exact: true })
    .click();
  await page.getByRole('tab', { name: '⚙️ Detalhes', exact: true }).click();
  await page.getByRole('button', { name: 'Treinar · 6 ouro', exact: true }).click();
  await states[0].until((g) => g.plannedOrders.some((o) => o.type === 'TRAIN_BATTALION'));
  await closeWindows(page);
  await rightClickProvince(page, adjacent.id);
  await states[0].until((g) =>
    g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION' && o.battalionId === own.id),
  );
  await page.getByRole('button', { name: 'Fechar Comando de Batalhão', exact: true }).click();
  await page.getByRole('button', { name: 'Crises & Coalizões', exact: true }).click();
  await page
    .getByRole('dialog', { name: '🌍 Crises & Coalizões', exact: true })
    .getByRole('heading', { name: 'Ameaça e contenção' })
    .waitFor();
  await closeWindows(page);
  await page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await Promise.all(states.map((s) => s.until((g) => g.turnDeadlineAt !== null)));
  assert.equal(states[0].get().firstReadyPlayerName, 'Capitã');
  assert.ok((await page.locator('.first-ready-banner.counting').count()) > 0);
  assert.ok(
    await page.evaluate(() => ((window as unknown as { audioNodes?: number }).audioNodes ?? 0) > 0),
    'Nenhum buffer PCM de áudio foi acionado.',
  );
  await pages[1].getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await pages[2].getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  await Promise.all(states.map((s) => s.until((g) => g.turn === 4)));
  assert.equal(states[0].get().turnDeadlineAt, null);
  await page.getByRole('button', { name: 'Encerrar animação', exact: true }).click();
  assert.equal(states[0].get().provinces.find((p) => p.id === own.provinceId)?.barracksLevel, 1);
  assert.equal(states[0].get().players[0].militaryXP, 6);
  // Attack an independent neighbor: no occupation is allowed on arrival.
  const activeNow = states[0].get().battalions.find((a) => a.id === own.id)!;
  const source = states[0].get().provinces.find((p) => p.id === activeNow.provinceId)!;
  const neutral = states[0]
    .get()
    .provinces.find((p) => p.kind === 'LAND' && !p.ownerId && source.neighbors.includes(p.id));
  assert.ok(neutral, 'A formação principal deve ter um vizinho independente para testar cerco.');
  for (let i = 0; i < pages.length; i++) {
    if (states[i].get().players[i].activeDilemma) {
      await pages[i]
        .getByRole('region', { name: 'Dilema Nacional', exact: true })
        .getByRole('button')
        .first()
        .click();
      await states[i].until((g) => !g.players[i].activeDilemma);
    }
  }
  assert.equal(neutral.ownerId, null);
  await page.locator(`[data-battalion="${own.id}"]`).press('Enter');
  await closeWindows(page);
  await rightClickProvince(page, neutral.id);
  await states[0].until((g) => g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION'));
  // Every client sends its ready command through the actual interface.
  for (const p of pages) {
    const replay = p.getByRole('button', { name: 'Encerrar animação', exact: true });
    if (await replay.isVisible()) await replay.click();
    await p.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  }
  await Promise.all(states.map((s) => s.until((g) => g.turn === 5)));
  await page.getByRole('button', { name: 'Encerrar animação', exact: true }).click();
  const besieged = states[0].get().provinces.find((p) => p.id === neutral.id)!;
  assert.equal(besieged.ownerId, null);
  assert.equal(besieged.siege?.progress, 1);
  assert.ok((await page.locator('.siege-miniature').count()) > 0);
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-cerco.png' });
  await page.getByRole('button', { name: 'Fechar Comando de Batalhão', exact: true }).click();
  const xpBeforeResearch = getNationAuthority(states[0].get().players[0]);
  await page.getByRole('button', { name: 'Árvore Militar', exact: true }).click();
  await page.locator('.skill-node').first().waitFor();
  assert.equal(await page.locator('.skill-node').count(), 16);
  const firstDoctrine = page
    .locator('.skill-node')
    .filter({ hasText: 'Formação de Escudos' })
    .getByRole('button');
  assert.ok(xpBeforeResearch < 25, 'A abertura escassa não financia uma doutrina imediatamente.');
  assert.equal(await firstDoctrine.isDisabled(), true);
  assert.match((await firstDoctrine.textContent()) ?? '', /Autoridade/i);
  assert.equal(states[0].get().players[0].unlockedSkills.includes('INF_T1'), false);
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-doutrinas.png' });
  await closeWindows(page);

  for (const p of pages) {
    const replay = p.getByRole('button', { name: 'Encerrar animação', exact: true });
    if (await replay.isVisible()) await replay.click();
    await p.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
  }
  await Promise.all(states.map((s) => s.until((g) => g.turn === 6)));
  await page.getByRole('button', { name: 'Encerrar animação', exact: true }).click();
  assert.equal(states[0].get().provinces.find((p) => p.id === neutral.id)?.ownerId, own.ownerId);
  assert.equal(states[0].get().provinces.find((p) => p.id === neutral.id)?.siege, null);
  const json = JSON.parse(
    await saveDownload(page, 'Baixar Relatório (.JSON)', '.local/exports/rc-browser.json'),
  );
  assert.equal(json.schemaVersion, 7);
  assert.equal(json.turnByTurnHistory.length, 5);
  assert.ok(json.worldHistory.length === 5);
  assert.ok(!('seed' in json.finalState));
  const txt = await saveDownload(page, 'Baixar Crônica (.TXT)', '.local/exports/rc-browser.txt');
  assert.match(txt, /RODADA 1/);
  await page.reload();
  await states[0].until((g) => g.turn === 6);
  await viewport(page);
  assert.equal(states[0].get().turnDeadlineAt, null);
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport(page);
  const mobileSkills = page.getByRole('button', { name: 'Árvore Militar', exact: true });
  await mobileSkills.scrollIntoViewIfNeeded();
  await mobileSkills.click();
  await viewport(page);
  await page.locator('.skill-node').first().waitFor();
  assert.equal(await page.locator('.skill-node').count(), 16);
  await page.screenshot({ path: '.local/screenshots/rc-multiplayer-celular.png' });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base);
  await viewport(mobilePage);
  await mobilePage
    .getByRole('heading', { name: '🌐 Salas Abertas (Entrar em 1 Clique)' })
    .waitFor();
  await mobilePage.screenshot({ path: '.local/screenshots/rc-multiplayer-inicio-celular.png' });
  if (fixtures) {
    const openFixture = async (session: FixtureSession) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      await context.addInitScript(() => localStorage.setItem('concordia-interface', 'classic'));
      await context.addInitScript(
        (s) => sessionStorage.setItem('concordia-session', JSON.stringify(s)),
        session,
      );
      const page = await context.newPage(),
        state = observe(page);
      debugPage = page;
      await page.goto(base!);
      await state.until((g) => g.code === session.code);
      return { context, page, state };
    };
    const lobby = await openFixture(fixtures.lobby[0]);
    const guest = await openFixture(fixtures.lobby[1]);
    await guest.page.getByLabel('Seu nome', { exact: true }).fill('Estrategista visitante');
    await guest.page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
    await lobby.state.until((g) => g.players[1].name === 'Estrategista visitante');
    assert.equal(await guest.page.locator('.bot-nation-label select').count(), 0);
    const botNation = lobby.page.getByRole('combobox', {
      name: 'Nação de Conselho 3',
      exact: true,
    });
    assert.equal(
      await botNation
        .locator('option[value="vespera"]')
        .evaluate((el) => (el as HTMLOptionElement).disabled),
      true,
    );
    await botNation.selectOption('ferro_norte');
    await lobby.state.until(
      (g) => g.players[2].nationId === 'ferro_norte' && g.players[3].nationId === 'aurelia',
    );
    await botNation.selectOption('kaldor');
    await lobby.state.until((g) => g.players[2].nationId === 'kaldor');
    await guest.state.until((g) => g.players[2].nationId === 'kaldor');
    await lobby.page.setViewportSize({ width: 390, height: 844 });
    await viewport(lobby.page);
    await lobby.page.screenshot({
      path: '.local/screenshots/rc-multiplayer-lobby-bots-celular.png',
    });
    await lobby.page.getByRole('button', { name: 'Iniciar campanha', exact: false }).click();
    await lobby.state.until(
      (g) =>
        g.phase === 'planning' &&
        g.provinces.some((p) => p.id === 'south-africa' && p.capitalOf === g.players[2].id),
    );
    const alerts = await openFixture(fixtures.alerts[0]);
    const critical = alerts.page.getByRole('complementary', { name: 'Alertas pessoais críticos' });
    await critical.waitFor();
    await critical.getByRole('button', { name: /🔔 Alertas críticos/ }).click();
    assert.ok(
      alerts.state
        .get()
        .notifications.some((n) => n.type === 'DECLARE_WAR' && n.severity === 'CRITICAL'),
    );
    const cameraBefore = await alerts.page.locator('[data-zoom]').getAttribute('data-zoom');
    await critical
      .locator('[data-notification="SIEGE_STARTED"]')
      .getByRole('button', { name: '📍 Focar no Mapa', exact: true })
      .click();
    assert.notEqual(
      await alerts.page.locator('[data-zoom]').getAttribute('data-zoom'),
      cameraBefore,
    );
    await alerts.page.keyboard.press('Escape');
    await alerts.page.locator('.province-shape[data-province="castile"]').press('Enter');
    await alerts.page
      .getByRole('tab', { name: '⚔️ Recrutamento & Guarnição', exact: true })
      .click();
    await alerts.page
      .getByRole('button', { name: '🛡️ Convocar Defesa da Pátria', exact: true })
      .click();
    await alerts.state.until((g) =>
      g.battalions.some(
        (a) => a.name === 'Defesa da Pátria' && a.infantry === 5 && a.morale === 90,
      ),
    );
    await critical
      .locator('[data-notification="PEACE_OFFER"]')
      .getByRole('button', { name: '❌ Recusar', exact: true })
      .click();
    await alerts.state.until((g) => !g.offers.some((o) => o.kind === 'peace'));
    const peer = await fixturePeer(base!, fixtures.alerts[1]);
    peer.send({ type: 'OFFER_PEACE', warId: fixtures.warId, terms: [] });
    await alerts.state.until((g) => g.offers.some((o) => o.kind === 'peace'));
    await critical
      .locator('[data-notification="PEACE_OFFER"]')
      .getByRole('button', { name: '✅ Aceitar', exact: true })
      .click();
    await alerts.state.until((g) => !g.wars.some((w) => w.active));
    peer.socket.close();
    await alerts.page.getByRole('button', { name: /🔔 Minha Nação/ }).click();
    await alerts.page.getByRole('region', { name: '🔔 Minha Nação', exact: true }).waitFor();
    assert.equal(
      await alerts.page.locator('.turn-panel .first-ready-banner, .turn-panel .panel-tabs').count(),
      0,
    );
    await alerts.page.getByRole('button', { name: 'Marcar todos como lidos', exact: true }).click();
    await alerts.page.getByRole('button', { name: 'Crônica', exact: true }).click();
    await alerts.page.getByRole('heading', { name: '🌍 Jornal do Mundo' }).waitFor();
    await alerts.page.screenshot({ path: '.local/screenshots/rc-multiplayer-notificacoes.png' });
    const sandbox = await openFixture(fixtures.sandbox[0]);
    await sandbox.page.getByRole('dialog', { name: 'Resultado da campanha' }).waitFor();
    assert.equal(await sandbox.page.locator('.modal-backdrop').count(), 0);
    await sandbox.page
      .getByRole('button', { name: '⚔️ Continuar Jogando (Modo Sandbox)', exact: true })
      .click();
    await sandbox.state.until(
      (g) => g.sandboxContinued && g.phase === 'planning' && g.victoryRecord !== null,
    );
    await sandbox.page.getByText(/Dominação Livre · vitória original preservada/).waitFor();
    await sandbox.page.screenshot({ path: '.local/screenshots/rc-multiplayer-sandbox.png' });
    const ferry = await openFixture(fixtures.transport[0]);
    const main = ferry.state
      .get()
      .battalions.find((a) => a.ownerId === fixtures.transport[0].playerId && !a.isFleet)!;
    assert.ok((await ferry.page.locator('.strait-link').count()) > 0);
    await ferry.page.locator(`[data-battalion="${main.id}"]`).press('Enter');
    await closeWindows(ferry.page);
    await rightClickProvince(ferry.page, 'maghreb');
    await ferry.state.until((g) =>
      g.plannedOrders.some((o) => o.type === 'MOVE_BATTALION' && o.path?.[0] === 'maghreb'),
    );
    await ferry.page.locator(`[data-battalion="${main.id}"]`).press('Enter');
    await ferry.page.getByRole('button', { name: '❌ Cancelar Ordem Atual', exact: true }).click();
    await rightClickProvince(ferry.page, 'brazil');
    await ferry.state.until((g) =>
      g.plannedOrders.some((o) => o.type === 'AUTO_TRANSPORT' && !o.fleetId),
    );
    await ferry.page
      .getByText('⛵ Travessia Marítima (15 Ouro)', { exact: false })
      .first()
      .waitFor();
    const treasury = ferry.state.get().players[0].gold;
    await ferry.page.screenshot({ path: '.local/screenshots/rc-multiplayer-fretamento.png' });
    await ferry.page.getByRole('button', { name: 'Confirmar ordens', exact: false }).click();
    const peers = await Promise.all(fixtures.transport.slice(1).map((s) => fixturePeer(base!, s)));
    for (const client of peers) client.send({ type: 'READY', ready: true });
    const crossed = await ferry.state.until((g) => g.turn === 2);
    assert.equal(crossed.battalions.find((a) => a.id === main.id)?.provinceId, 'brazil');
    assert.equal(crossed.battalions.find((a) => a.id === main.id)?.embarkedOnId, undefined);
    const economy = crossed.lastReport!.economy.find((e) => e.playerId === main.ownerId)!;
    assert.ok(Math.abs(crossed.players[0].gold - (treasury - 15 + economy.net)) < 0.02);
    for (const client of peers) client.socket.close();
    await ferry.page.getByRole('button', { name: 'Encerrar animação', exact: true }).click();
    await ferry.page.setViewportSize({ width: 390, height: 844 });
    await viewport(ferry.page);
    await ferry.page.screenshot({
      path: '.local/screenshots/rc-multiplayer-fretamento-celular.png',
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Smoke v1.01 passou: 3 navegadores, salas públicas, oito nações, cartas privadas, edição de nomes, nações dos bots e troca atômica, três acessos à guerra, pacto inicial, estreitos, fretamento pago, alertas pessoais, foco de câmera, aceitar/recusar, Defesa da Pátria, sandbox, fusão/divisão instantâneas, líderes, edifícios, doutrinas, cerco, comando tático, cancelamento, First-Ready, reconexão, cinco mapas, recursos, exportações e celular.',
  );
} catch (error) {
  await debugPage
    ?.screenshot({ path: '.local/screenshots/browser-v101-failure.png' })
    .catch(() => {});
  if (errors.length) console.error('Erros de navegador:', errors);
  throw error;
} finally {
  await browser.close();
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
  await rm(temp, { recursive: true, force: true });
}
