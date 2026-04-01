import { test, expect } from '@playwright/test';

test.describe('Provider Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[data-testid="empty-state"]')).toContainText('open a project', { timeout: 10_000 });
  });

  test('should show mock provider as default selection', async ({ page }) => {
    // Open folder picker and select folder
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-testid="project-setup-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Mock provider should be active by default (it's the only one)
    const mockBtn = page.locator('[data-testid="provider-btn-mock"]');
    await expect(mockBtn).toHaveClass(/active/);
  });

  test('should show provider label in status line after project creation', async ({ page }) => {
    // Create a project
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="project-setup-create"]').click();

    // Wait for project to connect and status line to appear
    const statusLine = page.locator('[data-testid="status-line"]');
    await expect(statusLine).toBeVisible({ timeout: 15_000 });

    // Provider label should show "Mock (Testing)"
    const providerLabel = page.locator('[data-testid="status-provider-label"]');
    await expect(providerLabel).toContainText('Mock', { timeout: 10_000 });
  });

  test('should show provider in sidebar for non-claude providers', async ({ page }) => {
    // Create a project with mock provider
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[data-testid="project-setup-create"]').click();

    // Sidebar should show provider label for non-claude provider
    const providerLabel = page.locator('[data-testid="sidebar-provider-label"]');
    await expect(providerLabel).toContainText('mock', { timeout: 10_000 });
  });
});
