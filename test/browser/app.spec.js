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
    await page.locator('#diplomacy-view').click();
    const panel = page.locator('.hud-panel');
    await expect.poll(async () => {
      const panelBounds = await panel.boundingBox();
      return Math.ceil(panelBounds.x + panelBounds.width);
    }).toBeLessThanOrEqual(390);
    const panelBounds = await panel.boundingBox();
    expect(panelBounds.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(844);
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

test('navigates galaxy, system, and planet views with keyboard-accessible controls', async ({ page }) => {
  await page.goto('/');
  test.skip(await page.locator('#fatal-error').isVisible(), 'System navigation requires WebGL');

  await page.keyboard.press('f');
  await expect(page.locator('#system-selector')).toBeFocused();
  await page.locator('#system-selector').selectOption('solara');
  await expect(page.locator('#navigation-status')).toContainText('SYSTEM · SOLARA');
  await expect(page.locator('#panel-heading')).toHaveText('SYSTEM COMMAND');
  await expect(page.locator('[data-system-planet="solara-prime"]')).toBeVisible();
  await expect(page.locator('#back-view')).toBeEnabled();

  await page.locator('[data-system-planet="solara-prime"]').click();
  await expect(page.locator('#navigation-status')).toContainText('PLANET · SOLARA-PRIME');
  await expect(page.locator('#back-view')).toHaveText('BACK TO SYSTEM');

  await page.keyboard.press('Escape');
  await expect(page.locator('#navigation-status')).toContainText('SYSTEM · SOLARA');
  await expect(page.locator('#panel-heading')).toHaveText('SYSTEM COMMAND');
  await page.keyboard.press('Escape');
  await expect(page.locator('#navigation-status')).toContainText('GALAXY VIEW');
  await expect(page.locator('#system-selector')).toHaveValue('');
  await expect(page.locator('#back-view')).toBeDisabled();
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

test('performs a deterministic diplomatic action from the HUD', async ({ page }) => {
  await page.goto('/');
  await page.locator('#diplomacy-view').click();
  await expect(page.locator('#panel-heading')).toHaveText('DIPLOMATIC COMMAND');
  const relationship = page.locator('[data-relationship="independent"]');
  await relationship.locator('[data-diplomacy-action="IMPROVE_RELATIONS"]').click();

  await expect(page.locator('#navigation-status')).toContainText('IMPROVE RELATIONS · INDEPENDENT');
  await expect(page.locator('#planet-content')).toContainText('900 CR');
  await expect(relationship).toContainText('Opinion 22');
});

test('proposes and signs a non-aggression pact from the HUD', async ({ page }) => {
  await page.goto('/');
  await page.locator('#diplomacy-view').click();
  const relationship = page.locator('[data-relationship="independent"]');

  await relationship.locator('[data-treaty-proposal="NON_AGGRESSION"]').click();
  await expect(relationship).toContainText('PENDING · NON-AGGRESSION PACT');
  await expect(page.locator('#navigation-status')).toContainText('NON-AGGRESSION PACT PROPOSED');

  await page.locator('#advance-turn').click();
  await expect(relationship).toContainText('Non-Aggression Pact');
  await expect(relationship.locator('[data-break-treaty="NON_AGGRESSION"]')).toBeVisible();
  await expect(page.locator('#navigation-status')).toContainText('1 TREATY SIGNED');
});

test('exposes alliance-gated vassalage from the diplomacy HUD', async ({ page }) => {
  await page.goto('/');
  await page.locator('#diplomacy-view').click();
  const relationship = page.locator('[data-relationship="independent"]');
  const vassalage = relationship.locator('[data-treaty-proposal="VASSALAGE"]');

  await expect(vassalage).toBeVisible();
  await expect(vassalage).toBeDisabled();
  await expect(vassalage).toHaveAttribute('title', 'Requires an active alliance');
  await expect(vassalage).toContainText('250 CR');
});

test('renders subject restrictions and the independence control from a valid save', async ({ page }) => {
  await page.goto('/');
  await page.locator('#save-game').click();
  await page.evaluate(() => {
    const key = 'galaxy-command-save-v5:autosave';
    const envelope = JSON.parse(localStorage.getItem(key));
    const relationship = envelope.state.diplomacy['aurora::independent'];
    relationship.treaties = [];
    relationship.pendingOffer = null;
    relationship.vassalage = {
      overlordId: 'independent',
      subjectId: 'aurora',
      startedTurn: envelope.state.turn,
    };
    relationship.stance = 'VASSAL';
    localStorage.setItem(key, JSON.stringify(envelope));
  });
  await page.locator('#load-game').click();
  await expect(page.locator('#navigation-status')).toContainText('LOADED TURN 1');
  await page.locator('#diplomacy-view').click();

  const overlord = page.locator('[data-relationship="independent"]');
  await expect(overlord).toContainText('OVERLORD');
  const independence = overlord.locator('[data-declare-independence]');
  await expect(independence).toBeDisabled();
  await expect(independence).toHaveAttribute('title', 'Independence available in 3 turn(s)');

  const thirdPartyAction = page
    .locator('[data-relationship="vanguard"]')
    .locator('[data-diplomacy-action="IMPROVE_RELATIONS"]');
  await expect(thirdPartyAction).toBeDisabled();
  await expect(thirdPartyAction).toHaveAttribute('title', 'A subject cannot conduct independent diplomacy');
});
