import { describe, it, expect } from 'vitest';
import app from '../../worker/index';

interface HealthSuccessBody {
  success: boolean;
  data: {
    status: string;
    app: string;
    version: string;
    timestamp: string;
    requestId: string;
  };
}

interface ErrorBody {
  success: boolean;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

describe('Worker API - Health & Base Middlewares', () => {
  it('GET /api/health returns 200 and healthy status', async () => {
    const res = await app.request('/api/health', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthSuccessBody;

    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.app).toBe('qas-audit-app');
    expect(body.data.version).toBeDefined();
    expect(body.data.timestamp).toBeDefined();
    expect(body.data.requestId).toBeDefined();

    // Check header
    expect(res.headers.get('X-Request-Id')).toBeDefined();
  });

  it('GET /api/nonexistent returns 404 structured json error', async () => {
    const res = await app.request('/api/nonexistent', {
      method: 'GET',
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;

    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeDefined();
  });
});
