import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('command HUD has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
  expect(seriousViolations).toEqual([]);
});

test('keyboard shortcuts advance turns and keep focus visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('n');
  await expect(page.locator('#navigation-status')).toContainText('TURN 2');
  await page.locator('#save-game').focus();
  await expect(page.locator('#save-game')).toBeFocused();
  const outline = await page.locator('#save-game').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
});

test('reduced-motion preference disables decorative animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const panelTransition = await page.locator('.hud-panel').evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(panelTransition).toBe('0s');
});
