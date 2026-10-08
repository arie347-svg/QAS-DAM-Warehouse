// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { Layout } from '../../src/components/Layout';
import { registerServiceWorker, useNetworkStatus } from '../../src/serviceWorkerRegistration';

describe('Task 11: PWA, Service Worker & Mobile Viewport 360px Matrix', () => {
  // 1. PWA Web App Manifest Validation
  it('1. Validates that manifest.json exists with required PWA metadata', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifestContent.name).toBe('Audit QAS - Motorcycle Logistic');
    expect(manifestContent.short_name).toBe('Audit QAS');
    expect(manifestContent.start_url).toMatch(/^\/(\?source=pwa)?$/);
    expect(manifestContent.display).toBe('standalone');
    expect(manifestContent.background_color).toBe('#F2F4F7');
    expect(manifestContent.theme_color).toBe('#0B2D57');
    expect(Array.isArray(manifestContent.icons)).toBe(true);
    expect(manifestContent.icons.length).toBeGreaterThanOrEqual(1);

    // Ensure icon covers 192x192 or 512x512
    const iconSizes = manifestContent.icons.map((i: { sizes: string }) => i.sizes);
    expect(iconSizes.some((s: string) => s.includes('192x192') || s.includes('512x512'))).toBe(true);
  });

  // 2. Service Worker File Validation
  it('2. Validates that sw.js exists with caching and offline fallback strategies', () => {
    const swPath = path.resolve(__dirname, '../../public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, 'utf8');
    expect(swContent).toMatch(/qas-audit-cache-v[1-9]/);
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("addEventListener('activate'");
    expect(swContent).toContain("addEventListener('fetch'");
    expect(swContent).toContain("url.pathname.startsWith('/api/')");
    expect(swContent).toContain('/index.html');
  });

  // 3. HTML Viewport & Meta Tags
  it('3. Validates index.html contains correct mobile viewport and theme-color tags', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    expect(htmlContent).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(htmlContent).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(htmlContent).toContain('<meta name="theme-color" content="#0B2D57" />');
    expect(htmlContent).toContain('<html lang="id">');
  });

  // 4. Service Worker Registration Module
  it('4. Confirms service worker registration functions and hooks are exported', () => {
    expect(typeof registerServiceWorker).toBe('function');
    expect(typeof useNetworkStatus).toBe('function');
  });

  // 5. Layout Mobile Navigation & 360px Viewport Compliance
  it('5. Renders mobile touch-friendly bottom navigation with min 48px targets and no horizontal overflow', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Layout />
      </MemoryRouter>
    );

    // Check main container overflow prevention
    const rootLayout = container.querySelector('.overflow-x-hidden');
    expect(rootLayout).not.toBeNull();
    expect(rootLayout?.className).toContain('w-full');
    expect(rootLayout?.className).toContain('max-w-full');

    // Check Mobile Bottom Navigation Bar presence
    const bottomNav = screen.getByLabelText('Navigasi Bawah Mobile');
    expect(bottomNav).toBeInTheDocument();

    // Verify all mobile navigation links have touch-friendly height >= 48px (min-h-[48px])
    const navLinks = bottomNav.querySelectorAll('a');
    expect(navLinks.length).toBe(5);

    navLinks.forEach((link) => {
      expect(link.className).toContain('min-h-[48px]');
    });
  });

  // 6. CycleListPage Mobile Card View & Touch Target Compliance
  it('6. Validates CycleListPage renders mobile card list and min 44px action buttons', async () => {
    const { CycleListPage } = await import('../../src/features/audit/CycleListPage');
    const { container } = render(
      <MemoryRouter initialEntries={['/cycles']}>
        <CycleListPage />
      </MemoryRouter>
    );

    // Verify card action buttons have min 44px touch targets
    const buttons = container.querySelectorAll('button');
    const min44Buttons = Array.from(buttons).filter((b) => b.className.includes('min-h-[44px]'));
    expect(min44Buttons.length).toBeGreaterThanOrEqual(2);
  });

  // 7. UserManagementPage Mobile Card Actions & Elastic Modals
  it('7. Validates UserManagementPage renders touch-friendly user card buttons and elastic modals', async () => {
    const { UserManagementPage } = await import('../../src/features/users/UserManagementPage');
    const { container } = render(
      <MemoryRouter initialEntries={['/users']}>
        <UserManagementPage />
      </MemoryRouter>
    );

    // Verify user card buttons have min-h-[40px] touch targets
    const userCardButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.className.includes('min-h-[40px]')
    );
    expect(userCardButtons.length).toBeGreaterThanOrEqual(2);
  });
});
