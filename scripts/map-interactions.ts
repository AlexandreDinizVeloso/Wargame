import type { Page } from 'playwright-core';
export async function mapPoint(page: Page, provinceId: string) {
  const shape = page.locator(`.province-shape[data-province="${provinceId}"]`);
  const locate = () =>
    shape.evaluate((el) => {
      const shape = el as SVGGraphicsElement,
        box = shape.getBBox(),
        matrix = shape.getScreenCTM();
      if (!matrix) return null;
      for (let row = 1; row < 24; row++)
        for (let col = 1; col < 24; col++) {
          const q = new DOMPoint(
            box.x + (box.width * col) / 24,
            box.y + (box.height * row) / 24,
          ).matrixTransform(matrix);
          const hit = document.elementFromPoint(q.x, q.y);
          if (hit === el || (el.contains(hit) && hit?.closest('[data-province]') === el))
            return { x: q.x, y: q.y };
        }
      return null;
    });
  let point = await locate();
  if (!point) {
    await page.getByRole('button', { name: 'Resetar câmera', exact: true }).click();
    point = await locate();
  }
  if (!point)
    throw new Error(
      `Província ${provinceId} sem área exposta; mova/minimize a janela para interagir.`,
    );
  return point;
}
export async function rightClickProvince(page: Page, provinceId: string) {
  let point: { x: number; y: number };
  const inspector = page.locator('[data-context-panel]:not(.minimized)');
  let minimized = false;
  try {
    point = await mapPoint(page, provinceId);
  } catch {
    if (await inspector.count()) {
      await inspector.getByRole('button', { name: /^Minimizar / }).click();
      minimized = true;
    }
    point = await mapPoint(page, provinceId);
  }
  await page.mouse.click(point.x, point.y, { button: 'right' });
  if (minimized) {
    const restore = page
      .locator('[data-context-panel].minimized')
      .getByRole('button', { name: /^Restaurar (?!tamanho)/ });
    if (await restore.count()) await restore.click();
  }
}
