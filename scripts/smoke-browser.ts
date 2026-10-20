import { chromium, type Page } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
const observe = (page: Page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
};
async function round(page: Page, n: number) {
  await page
    .getByRole('heading', { name: new RegExp(`Rodada ${String(n).padStart(2, '0')} /`) })
    .waitFor();
}
async function mapAttribute(page: Page, key: string) {
  return Number(await page.locator('.map-stage').getAttribute(key));
}
async function assertViewport(page: Page) {
  const result = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    gameWidth: document.querySelector('.game-viewport')?.getBoundingClientRect().width,
    gameHeight: document.querySelector('.game-viewport')?.getBoundingClientRect().height,
  }));
  assert.ok(
    result.width <= result.viewportWidth + 1 && result.height <= result.viewportHeight + 1,
    `A HUD não deve rolar a página: ${JSON.stringify(result)}`,
  );
  assert.equal(result.gameWidth, result.viewportWidth);
  assert.equal(result.gameHeight, result.viewportHeight);
}
try {
  await mkdir('.local/screenshots', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }),
    page = await context.newPage();
  observe(page);
  await page.goto(base);
  await page.getByRole('button', { name: 'Jogar demonstração' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/inicio-v2.png' });
  await page.getByRole('button', { name: 'Jogar demonstração' }).click();
  await round(page, 1);
  await assertViewport(page);
  for (let key = 1; key <= 5; key++) {
    await page.keyboard.press(String(key));
    const modes = ['POLITICAL', 'RELIGIOUS', 'ECONOMIC_SUPPLY', 'DIPLOMATIC', 'UNREST'];
    await page.waitForFunction(
      (expected) => document.querySelector('.map-stage')?.getAttribute('data-mode') === expected,
      modes[key - 1],
    );
  }
  await page.keyboard.press('1');
  await page.mouse.move(990, 450);
  await page.mouse.wheel(0, -250);
  await page.waitForFunction(
    () => Number(document.querySelector('.map-stage')?.getAttribute('data-zoom')) > 1,
  );
  await page.mouse.wheel(0, -10000);
  await page.waitForFunction(
    () => Number(document.querySelector('.map-stage')?.getAttribute('data-zoom')) === 3.5,
  );
  await page.mouse.wheel(0, 10000);
  await page.waitForFunction(
    () => Number(document.querySelector('.map-stage')?.getAttribute('data-zoom')) === 0.8,
  );
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const beforeSpacePan = await mapAttribute(page, 'data-camera-x');
  await page.keyboard.down('Space');
  await page.mouse.move(950, 450);
  await page.mouse.down();
  await page.mouse.move(1020, 480, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  assert.notEqual(await mapAttribute(page, 'data-camera-x'), beforeSpacePan);
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('.map-stage')?.getAttribute('data-zoom')) === 1,
  );
  for (const button of ['right', 'middle'] as const) {
    const before = await mapAttribute(page, 'data-camera-x');
    await page.mouse.move(950, 450);
    await page.mouse.down({ button });
    await page.mouse.move(1030, 480, { steps: 8 });
    await page.mouse.up({ button });
    assert.notEqual(await mapAttribute(page, 'data-camera-x'), before);
  }
  await page.getByRole('button', { name: 'Resetar câmera' }).click();
  await page.locator('[data-province="p16"]').click();
  await page.getByRole('heading', { name: 'Porto', exact: true }).waitFor();
  await page.getByRole('button', { name: /Treinar exército/ }).click();
  await page.getByRole('button', { name: 'Cancelar ordem em Porto' }).waitFor();
  await page.getByRole('button', { name: 'Cancelar ordem em Porto' }).click();
  await page.getByRole('button', { name: 'Fechar gaveta' }).click();
  await page.getByRole('button', { name: 'Recolher painel' }).click();
  await page.locator('[data-province="p8"]').click({ button: 'right' });
  await page.getByRole('heading', { name: 'Preparar marcha' }).waitFor();
  await page.getByRole('button', { name: 'Preparar marcha', exact: true }).click();
  await page.locator('.planned-route').waitFor();
  assert.equal(await page.locator('.planned-route').count(), 1);
  await page.getByRole('button', { name: 'Cancelar ordem em Porto' }).click();
  await page.getByRole('button', { name: 'Recolher painel' }).click();
  await page.locator('[data-province="p16"]').focus();
  await page.keyboard.press('Enter');
  const beforeGold = await page.getByTestId('treasury').innerText();
  await page.getByRole('button', { name: /Contratar mercenários/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-province="p16"]')
      ?.getAttribute('aria-label')
      ?.includes('9 tropas'),
  );
  assert.notEqual(await page.getByTestId('treasury').innerText(), beforeGold);
  await page.getByRole('button', { name: /Recrutar tropas/ }).click();
  await page.getByRole('button', { name: 'Cancelar ordem em Porto' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/hud-provincia.png' });
  await page.getByRole('button', { name: 'Confirmar ordens' }).click();
  await round(page, 2);
  await page.reload();
  await round(page, 2);
  await page.getByRole('button', { name: /Relatórios/ }).click();
  await page.locator('.battle-report summary').first().click();
  await page.screenshot({ path: '.local/screenshots/hud-batalhas.png' });
  await page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  await page.locator('.realm-row').filter({ hasText: 'Coroa de Castela' }).click();
  await page.getByRole('button', { name: 'Propor aliança', exact: true }).click();
  await page.getByRole('button', { name: 'Romper aliança', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Solicitar acesso militar', exact: true }).click();
  await page.getByRole('button', { name: 'Acesso militar concedido', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Embargo comercial', exact: true }).click();
  await page.getByRole('button', { name: 'Retirar embargo', exact: true }).waitFor();
  await page.getByLabel('Ouro para ação diplomática').fill('1');
  await page.getByRole('button', { name: /Enviar subsídio/ }).click();
  await page.getByLabel('Ouro para ação diplomática').fill('12');
  await page.getByRole('button', { name: /Financiar rebeldes/ }).click();
  await page.screenshot({ path: '.local/screenshots/hud-diplomacia.png' });
  await page.getByRole('button', { name: 'Romper aliança', exact: true }).click();
  await page.getByText('Trégua até o fim da rodada 3.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Conselho público', exact: true }).click();
  await page.getByLabel('Mensagem ao conselho').fill('A paz também é uma escolha.');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await page.getByText('A paz também é uma escolha.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manual de campanha' }).waitFor();
  await page.keyboard.press('Escape');
  if (await page.getByRole('button', { name: 'Fechar gaveta' }).count())
    await page.getByRole('button', { name: 'Fechar gaveta' }).click();
  if (await page.getByRole('button', { name: 'Recolher painel' }).count())
    await page.getByRole('button', { name: 'Recolher painel' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertViewport(page);
  const readyBox = await page.getByRole('button', { name: 'Confirmar ordens' }).boundingBox();
  assert.ok(
    readyBox && readyBox.x >= 0 && readyBox.x + readyBox.width <= 391,
    'Confirmar ordens deve permanecer acessível no celular.',
  );
  await page.screenshot({ path: '.local/screenshots/hud-celular.png' });
  await context.close();
  const contexts = await Promise.all(
      [0, 1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })),
    ),
    pages = await Promise.all(contexts.map((c) => c.newPage()));
  pages.forEach(observe);
  await Promise.all(pages.map((p) => p.goto(base)));
  const host = pages[0];
  await host.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await host.getByLabel('Como devemos chamar você?').fill('Ana');
  await host.getByRole('button', { name: 'Reunir o conselho' }).click();
  await host.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  const code = await host.locator('.room-invite strong').innerText();
  for (const [index, guest] of pages.slice(1).entries()) {
    await guest.getByRole('button', { name: 'Entrar na campanha', exact: true }).click();
    await guest.getByLabel('Como devemos chamar você?').fill(index === 0 ? 'Bruno' : 'Clara');
    await guest.getByLabel('Código da sala', { exact: true }).fill(code);
    await guest.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
    await guest.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  }
  await host.getByRole('button', { name: 'Iniciar campanha', exact: true }).click();
  await Promise.all(pages.map((p) => round(p, 1)));
  for (const p of pages) await p.getByRole('button', { name: 'Confirmar ordens' }).click();
  await Promise.all(pages.map((p) => round(p, 2)));
  await pages[2].close();
  await host.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  await host.locator('.realm-row').filter({ hasText: 'Clara' }).click();
  await host.getByRole('button', { name: 'Substituir ausente por bot' }).click();
  await host
    .getByRole('button', { name: 'Substituir ausente por bot' })
    .waitFor({ state: 'hidden' });
  assert.deepEqual(errors, [], 'O navegador não deve registrar erros.');
  console.log(
    'HUD verificada: viewport fixa, 5 modos/atalhos, zoom 0,8–3,5, pan direito/meio, clique tático, fila/cancelamento, mercenários, rodada/reconexão, relatórios, diplomacia, chat, celular e 3 jogadores.',
  );
  console.log('Capturas em .local/screenshots/.');
} finally {
  await browser.close();
}
