import { test, expect } from '@playwright/test';

test('loads the command interface without an initialization error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Galaxy Command/);
  const fatal = page.locator('#fatal-error');
  if (await fatal.isVisible()) {
    await expect(page.locator('#fatal-error-message')).toContainText(/WebGL|3D|browser/i);
  } else {
    await expect(page.locator('#game-version')).toHaveText(/v/);
  }
  expect(errors).toEqual([]);
});

test('keeps the command HUD usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const fatal = page.locator('#fatal-error');
  if (await fatal.isVisible()) {
    const bounds = await fatal.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(390);
  } else {
    await expect(page.locator('#galaxy-canvas')).toBeVisible();
    await expect(page.locator('#navigation-status')).toBeVisible();
    const bounds = await page.locator('#navigation-status').boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(390);
  }
});

test('advances a seeded campaign and exposes the current turn', async ({ page }) => {
  await page.goto('/?seed=9001');
  await expect(page.locator('#advance-turn')).toBeVisible();
  await expect(page.locator('#navigation-status')).toContainText('TURN 1');
  await page.locator('#advance-turn').click();
  await expect(page.locator('#navigation-status')).toContainText('TURN 2');
  await expect(page.locator('#navigation-status')).toContainText('PLANETS UPDATED');
});

test('saves and restores the current campaign from the HUD', async ({ page }) => {
  await page.goto('/');
  await page.locator('#save-game').click();
  await expect(page.locator('#navigation-status')).toContainText('SAVED TURN 1');
  await page.locator('#advance-turn').click();
  await expect(page.locator('#navigation-status')).toContainText('TURN 2');
  await page.locator('#load-game').click();
  await expect(page.locator('#navigation-status')).toContainText('LOADED TURN 2');
});
