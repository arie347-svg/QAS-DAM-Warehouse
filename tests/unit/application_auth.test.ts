// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import app from '../../worker/index';
import { createD1Mock } from '../helpers/d1Mock';
import type { Env } from '../../worker/types';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const ORIGIN = 'http://localhost';

function cookieFrom(response: Response): string {
  const value = response.headers.get('set-cookie');
  if (!value) throw new Error('Session cookie tidak ditemukan');
  return value.split(';')[0];
}

describe('Tahap 1 - Application Authentication', () => {
  let db: any;
  let env: Env;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    for (const file of [
      '0001_initial_schema.sql',
      '0003_notifications.sql',
      '0004_application_auth.sql',
    ]) {
      db.exec(fs.readFileSync(path.resolve(__dirname, `../../migrations/${file}`), 'utf8'));
      if (file === '0001_initial_schema.sql') {
        db.exec(fs.readFileSync(path.resolve(__dirname, '../../seed/seed_data.sql'), 'utf8'));
      }
    }
    env = { DB: createD1Mock(db), ENVIRONMENT: 'test' };
  });

  async function login(password = '12345', rememberMe = false) {
    return app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        email: 'ari.imam@daya-motora.com',
        password,
        rememberMe,
      }),
    }, env);
  }

  it('menerima password awal, membuat cookie aman, dan mewajibkan pergantian password', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.success).toBe(true);
    expect(payload.data.mustChangePassword).toBe(true);
    const setCookie = response.headers.get('set-cookie') || '';
    expect(setCookie).toContain('qas_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');

    const cookie = cookieFrom(response);
    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, env);
    expect(me.status).toBe(200);
    expect(((await me.json()) as any).data.mustChangePassword).toBe(true);

    const protectedResponse = await app.request('/api/cycles', { headers: { Cookie: cookie } }, env);
    expect(protectedResponse.status).toBe(403);
    expect(((await protectedResponse.json()) as any).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('mengganti password, mencabut session lain, dan mengizinkan login dengan password baru', async () => {
    const initialLogin = await login();
    const cookie = cookieFrom(initialLogin);
    const change = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: ORIGIN },
      body: JSON.stringify({
        currentPassword: '12345',
        newPassword: 'GudangAman2026',
        confirmPassword: 'GudangAman2026',
      }),
    }, env);
    expect(change.status).toBe(200);
    expect(((await change.json()) as any).data.mustChangePassword).toBe(false);

    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, env);
    expect(me.status).toBe(200);
    expect(((await me.json()) as any).data.mustChangePassword).toBe(false);

    expect((await login('12345')).status).toBe(401);
    expect((await login('GudangAman2026')).status).toBe(200);
  });

  it('mencabut session saat logout', async () => {
    const loginResponse = await login();
    const cookie = cookieFrom(loginResponse);
    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: ORIGIN },
    }, env);
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('qas_session=');

    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, env);
    expect(me.status).toBe(401);
  });

  it('mengunci akun setelah lima password salah', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await login('password-salah');
      expect(response.status).toBe(401);
    }
    const fifth = await login('password-salah');
    expect(fifth.status).toBe(429);
    expect(((await fifth.json()) as any).error.code).toBe('ACCOUNT_TEMPORARILY_LOCKED');
    expect((await login('12345')).status).toBe(429);
  });

  it('menggunakan masa session panjang hanya saat Remember Me aktif', async () => {
    const response = await login('12345', true);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=2592000');
    const row = db.prepare('SELECT remember_me FROM user_sessions LIMIT 1').get() as { remember_me: number };
    expect(row.remember_me).toBe(1);
  });

  it('menolak password baru yang lemah dan email yang tidak terdaftar', async () => {
    const loginResponse = await login();
    const cookie = cookieFrom(loginResponse);
    const weak = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: ORIGIN },
      body: JSON.stringify({ currentPassword: '12345', newPassword: 'abcdefg', confirmPassword: 'abcdefg' }),
    }, env);
    expect(weak.status).toBe(400);
    expect(((await weak.json()) as any).error.code).toBe('WEAK_PASSWORD');

    const unknown = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@daya-motora.com', password: '12345' }),
    }, env);
    expect(unknown.status).toBe(401);
    expect(((await unknown.json()) as any).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('menolak perubahan data dari origin lain untuk session aplikasi', async () => {
    const loginResponse = await login();
    const cookie = cookieFrom(loginResponse);
    const response = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://situs-lain.invalid',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({
        currentPassword: '12345',
        newPassword: 'GudangAman2026',
        confirmPassword: 'GudangAman2026',
      }),
    }, env);
    expect(response.status).toBe(403);
    expect(((await response.json()) as any).error.code).toBe('CSRF_REJECTED');
  });
});
