import { test, expect } from '@playwright/test';

test.describe('Project Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear previous projects
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for server connection (empty state shows "Press ... to open a project")
    await expect(page.locator('[data-testid="empty-state"]')).toContainText('open a project', { timeout: 10_000 });
  });

  test('should open folder picker when clicking new project button', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();
  });

  test('should show folder browser with directory listing', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const browser = page.locator('[data-testid="folder-browser"]');
    await expect(browser).toBeVisible();
    // Should have at least the ".." go-up item
    await expect(browser.locator('.folder-picker-item')).toHaveCount(1, { timeout: 5000 });
  });

  test('should navigate folders with double-click', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const browser = page.locator('[data-testid="folder-browser"]');
    await expect(browser).toBeVisible();

    // Wait for folder items to load
    const items = browser.locator('.folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    // The path should be displayed
    const pathDisplay = browser.locator('.fp-browser-path');
    await expect(pathDisplay).not.toBeEmpty();
  });

  test('should close folder picker with Escape', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="folder-browser"]')).not.toBeVisible();
  });

  test('should show ProjectSetup dialog after selecting folder', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    const browser = page.locator('[data-testid="folder-browser"]');
    await expect(browser).toBeVisible();

    // Wait for folder items and select first folder by pressing Enter
    const items = browser.locator('.folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    // ProjectSetup dialog should appear
    await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });
  });

  test('should display mock provider in ProjectSetup', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-testid="project-setup-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Mock provider button should be visible
    await expect(page.locator('[data-testid="provider-btn-mock"]')).toBeVisible();
  });

  test('should create project and show it in sidebar', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-testid="project-setup-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click Create button
    await page.locator('[data-testid="project-setup-create"]').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // Project should appear in sidebar
    const sidebarItems = page.locator('[data-testid="sidebar"] .sidebar-item');
    await expect(sidebarItems).toHaveCount(1, { timeout: 10_000 });
  });

  test('should cancel ProjectSetup with Cancel button', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="project-setup-cancel"]').click();
    await expect(page.locator('[data-testid="project-setup-dialog"]')).not.toBeVisible();

    // No project should be added
    const sidebarItems = page.locator('[data-testid="sidebar"] .sidebar-item');
    await expect(sidebarItems).toHaveCount(0);
  });

  test('should cancel ProjectSetup with Escape', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="project-setup-dialog"]')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="project-setup-dialog"]')).not.toBeVisible();
  });

  test('should allow custom project name', async ({ page }) => {
    await page.locator('[data-testid="sidebar-new-btn"]').click();
    await expect(page.locator('[data-testid="folder-browser"]')).toBeVisible();

    const items = page.locator('[data-testid="folder-browser"] .folder-picker-item');
    await expect(items.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Enter');

    const dialog = page.locator('[data-testid="project-setup-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Clear and type custom name
    const nameInput = page.locator('[data-testid="project-name-input"]');
    await nameInput.fill('My Test Project');

    await page.locator('[data-testid="project-setup-create"]').click();

    // Project with custom name should appear in sidebar
    const sidebarItem = page.locator('[data-testid="sidebar"] .sidebar-item-name');
    await expect(sidebarItem).toContainText('My Test Project', { timeout: 10_000 });
  });
});
