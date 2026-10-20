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
function observe(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
}
async function round(page: Page, n: number) {
  await page
    .getByRole('heading', { name: new RegExp(`Rodada ${String(n).padStart(2, '0')} /`) })
    .waitFor();
}
try {
  await mkdir('.local/screenshots', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
    page = await context.newPage();
  observe(page);
  await page.goto(base);
  await page.getByRole('button', { name: 'Jogar demonstração' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/inicio.png', fullPage: true });
  await page.getByRole('button', { name: 'Jogar demonstração' }).click();
  await round(page, 1);
  await page.getByRole('button', { name: 'Treinar', exact: true }).click();
  await page.getByRole('button', { name: 'Preparar ordem', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar ordem em Porto' }).waitFor();
  await page.screenshot({ path: '.local/screenshots/mapa.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar ordens' }).click();
  await round(page, 2);
  await page.reload();
  await round(page, 2);
  await page.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  await page.getByRole('button', { name: 'Propor aliança' }).first().click();
  await page.getByRole('button', { name: 'Romper aliança' }).waitFor();
  await page.getByLabel('Mensagem ao conselho').fill('A paz também é uma escolha.');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await page.getByText('A paz também é uma escolha.', { exact: true }).waitFor();
  await page.screenshot({ path: '.local/screenshots/diplomacia.png', fullPage: true });
  await page.getByRole('button', { name: 'Romper aliança' }).click();
  await page.getByText('Trégua até o fim da rodada 3.').waitFor();
  await page.getByRole('button', { name: 'Como jogar', exact: true }).click();
  await page.getByRole('heading', { name: 'Uma rodada, muitas decisões' }).waitFor();
  await page.getByRole('button', { name: 'Mapa do mundo' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/screenshots/celular.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Interface não deve ultrapassar a largura do celular.',
  );
  await context.close();
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  pages.forEach(observe);
  await Promise.all(pages.map((p) => p.goto(base)));
  const host = pages[0];
  await host.getByRole('button', { name: 'Criar uma sala', exact: true }).click();
  await host.getByLabel('Como devemos chamar você?').fill('Ana');
  await host.getByRole('button', { name: 'Reunir o conselho' }).click();
  await host.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  const code = await host.locator('.room-invite strong').innerText();
  for (const [index, guest] of pages.slice(1).entries()) {
    await guest.getByRole('button', { name: /Já tem um código/ }).click();
    await guest.getByLabel('Como devemos chamar você?').fill(index === 0 ? 'Bruno' : 'Clara');
    await guest.getByLabel('Código da sala', { exact: true }).fill(code);
    await guest.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
    await guest.getByRole('heading', { name: 'Reúna o conselho.' }).waitFor();
  }
  await host.getByRole('button', { name: 'Iniciar campanha' }).click();
  await Promise.all(pages.map((p) => round(p, 1)));
  for (const p of pages) await p.getByRole('button', { name: 'Confirmar ordens' }).click();
  await Promise.all(pages.map((p) => round(p, 2)));
  await pages[2].close();
  await host.getByRole('button', { name: 'Diplomacia', exact: true }).click();
  await host.getByRole('button', { name: 'Substituir ausente por bot' }).click();
  await host
    .getByRole('button', { name: 'Substituir ausente por bot' })
    .waitFor({ state: 'hidden' });
  assert.deepEqual(errors, [], 'O navegador não deve registrar exceções JavaScript.');
  console.log(
    'Navegador: demonstração, ordem, resolução, reconexão, aliança, ruptura, chat, regras, tela de 390px e partida com 3 pessoas passaram.',
  );
  console.log('Capturas em .local/screenshots/.');
} finally {
  await browser.close();
}
