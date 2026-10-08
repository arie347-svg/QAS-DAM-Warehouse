import { describe, it, expect } from 'vitest';
import app from '../../worker/index';
import { getPendingSyncCount } from '../../src/lib/offlineDraft';

describe('System Status API & Diagnostics', () => {
  it('GET /api/system/status returns 200 with server, database, storage, and activities', async () => {
    const res = await app.request('/api/system/status', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        server: {
          status: string;
          uptime: string;
          environment: string;
          app_version: string;
          colo: string;
          timestamp: string;
        };
        database: {
          status: string;
          latency_ms: number;
          driver: string;
          records: {
            total_records: number;
          };
        };
        storage: {
          total_used_formatted: string;
          total_capacity_formatted: string;
          breakdown: {
            audits: { percentage: number };
            master: { percentage: number };
            logs: { percentage: number };
          };
        };
        activities: Array<{
          id: string;
          action: string;
          actor: string;
        }>;
      };
    };

    expect(body.success).toBe(true);
    expect(body.data.server.status).toBe('online');
    expect(body.data.server.uptime).toBeDefined();
    expect(body.data.server.colo).toBeDefined();
    expect(body.data.database.driver).toContain('Cloudflare D1');
    expect(body.data.storage.breakdown.audits.percentage).toBeGreaterThan(0);
    expect(Array.isArray(body.data.activities)).toBe(true);
    expect(body.data.activities.length).toBeGreaterThan(0);
  });

  it('getPendingSyncCount returns offline queue structure gracefully', async () => {
    const counts = await getPendingSyncCount();
    expect(counts).toHaveProperty('totalPendingDrafts');
    expect(counts).toHaveProperty('totalPendingAnswers');
    expect(typeof counts.totalPendingDrafts).toBe('number');
    expect(typeof counts.totalPendingAnswers).toBe('number');
  });
});
