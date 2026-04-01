import { test, expect } from '@playwright/test';

/**
 * Helper to create a project via the UI flow.
 * Assumes clean state (no existing projects).
 */
async function createProject(page: import('@playwright/test').Page, name?: string) {
  await page.locator('[data-testid="sidebar-new-btn"]').click();
  const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
  await expect(items.first()).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });

  if (name) {
    await page.locator('[data-testid="project-name-input"]').fill(name);
  }

  await page.locator('[data-testid="project-setup-create"]').click();
  await expect(page.locator('[data-testid="project-setup-dialog"]')).not.toBeVisible();
}

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[data-testid="empty-state"]')).toContainText('open a project', { timeout: 10_000 });
  });

  test('should show "No projects" when empty', async ({ page }) => {
    await expect(page.locator('[data-testid="sidebar"]')).toContainText('No projects');
  });

  test('should add project to sidebar after creation', async ({ page }) => {
    await createProject(page, 'Test Project');

    const sidebarItems = page.locator('[data-testid="sidebar"] .sidebar-item');
    await expect(sidebarItems).toHaveCount(1, { timeout: 10_000 });
    await expect(sidebarItems.first()).toContainText('Test Project');
  });

  test('should mark active project in sidebar', async ({ page }) => {
    await createProject(page, 'Active Project');

    const sidebarItem = page.locator('[data-testid="sidebar"] .sidebar-item');
    await expect(sidebarItem.first()).toHaveClass(/active/, { timeout: 10_000 });
  });

  test('should open settings panel', async ({ page }) => {
    await page.locator('[data-testid="sidebar-settings-btn"]').click();
    // Settings panel should be visible (it doesn't have testid yet, use class)
    await expect(page.locator('.settings-panel')).toBeVisible();
  });

  test('should close project via context menu', async ({ page }) => {
    await createProject(page, 'To Close');

    const sidebarItem = page.locator('[data-testid="sidebar"] .sidebar-item');
    await expect(sidebarItem).toHaveCount(1, { timeout: 10_000 });

    // Right-click to open context menu
    await sidebarItem.first().click({ button: 'right' });

    // Click Close in context menu
    const closeBtn = page.locator('.context-menu-item', { hasText: 'Close' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Project should be removed
    await expect(sidebarItem).toHaveCount(0);
  });
});
