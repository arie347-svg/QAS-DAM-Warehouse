import { test, expect } from '@playwright/test';

test.describe('E2E Smoke and Responsiveness', () => {
  test('homepage renders without error and fits 360px viewport without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Audit QAS/i);

    // Check branding visibility
    const heading = page.locator('text=Audit Quality Assurance System');
    await expect(heading).toBeVisible();

    // Verify no horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance for subpixel rounding
  });
});
