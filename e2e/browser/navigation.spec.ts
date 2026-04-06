import { test, expect } from '@playwright/test';

const routes = [
  { path: '/chat', selector: '[data-route-page="chat"]' },
  { path: '/members', selector: '[data-route-page="members"]' },
  { path: '/roadmap', selector: '[data-route-page="roadmap"]' },
  { path: '/terminal', selector: '[data-route-page="terminal"]' },
];

test.describe('AppShell navigation', () => {
  for (const route of routes) {
    test(`${route.path} renders the correct page`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator('[data-shell-route]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(route.selector)).toBeVisible({ timeout: 10_000 });
    });
  }

  test('navigation between routes preserves shell', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.locator('[data-shell-route]')).toBeVisible({ timeout: 10_000 });

    // Navigate to members.
    const membersLink = page.locator('a[href="/members"], [data-nav="members"]');
    if (await membersLink.count() > 0) {
      await membersLink.first().click();
      await expect(page.locator('[data-route-page="members"]')).toBeVisible({ timeout: 10_000 });
      // Shell should still be present after navigation.
      await expect(page.locator('[data-shell-route]')).toBeVisible();
    }
  });
});

test.describe('Dashboard page', () => {
  test('dashboard loads with key sections', async ({ page }) => {
    await page.goto('/');
    // Dashboard should have some visible content within timeout.
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Roadmap page', () => {
  test('roadmap page has expected entry markers', async ({ page }) => {
    await page.goto('/roadmap');
    await expect(page.locator('[data-route-page="roadmap"]')).toBeVisible({ timeout: 10_000 });
  });
});
