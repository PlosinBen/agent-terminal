import { test, expect } from '@playwright/test';

test.describe('App Startup', () => {
  test('should render the app layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="app-layout"]')).toBeVisible();
  });

  test('should show sidebar with Projects header', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('Projects');
  });

  test('should show empty state when no projects exist', async ({ page }) => {
    // Clear localStorage to ensure clean state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
  });

  test('should show new project button in sidebar', async ({ page }) => {
    await page.goto('/');
    const newBtn = page.locator('[data-testid="sidebar-new-btn"]');
    await expect(newBtn).toBeVisible();
  });
});
