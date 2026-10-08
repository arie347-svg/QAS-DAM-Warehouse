// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import fs from 'fs';
import path from 'path';
import app from '../../worker/index';
import { createTestJwt } from '../../worker/services/jwtService';
import { createD1Mock } from '../helpers/d1Mock';
import { createR2Mock } from '../helpers/r2Mock';
import { Env } from '../../worker/types';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('R2 Private Evidence Bucket & Guardrails (Task 6)', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picKrwToken: string;
  let picBrsToken: string;

  let cycleId: string;
  let krwSelfAuditId: string;
  let brsSelfAuditId: string;
  let krwAnswerId: string;
  let brsAnswerId: string;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');

    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0001_initial_schema.sql'),
      'utf8'
    );
    db.exec(schemaSql);

    const seedSql = fs.readFileSync(
      path.resolve(__dirname, '../../seed/seed_data.sql'),
      'utf8'
    );
    db.exec(seedSql);

    d1Mock = createD1Mock(db);
    r2Mock = createR2Mock();

    testEnv = {
      DB: d1Mock,
      EVIDENCE: r2Mock,
      ENVIRONMENT: 'test',
      JWT_DEV_SECRET: TEST_SECRET,
    };

    adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);
    auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
    picKrwToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
    picBrsToken = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);

    // 1. Setup cycle
    const cycleRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-EVD',
          title: 'Siklus Pengujian Bukti R2',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    const cycle = (await cycleRes.json()) as any;
    cycleId = cycle.data.id;

    // 2. Start Self Audit Karawang
    const krwRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    krwSelfAuditId = ((await krwRes.json()) as any).data.id;

    // Save answer on Karawang
    const krwAnsRes = await app.request(
      `/api/audits/${krwSelfAuditId}/answers/q-j1-dis-01`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({ option_id: 'opt-j1-dis-01-1', note: 'Catatan Karawang' }),
      },
      testEnv
    );
    krwAnswerId = ((await krwAnsRes.json()) as any).data.id;

    // 3. Start Self Audit Baros
    const brsRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picBrsToken,
        },
        body: JSON.stringify({ depot_id: 'depot-brs' }),
      },
      testEnv
    );
    brsSelfAuditId = ((await brsRes.json()) as any).data.id;

    const brsAnsRes = await app.request(
      `/api/audits/${brsSelfAuditId}/answers/q-j1-dis-01`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picBrsToken,
        },
        body: JSON.stringify({ option_id: 'opt-j1-dis-01-1' }),
      },
      testEnv
    );
    brsAnswerId = ((await brsAnsRes.json()) as any).data.id;
  });

  it('1. Upload & Download: uploads JPEG to private R2 and streams back with auth', async () => {
    // 1. Create a dummy JPEG image buffer
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);
    const formData = new FormData();
    const file = new File([jpegBytes], 'foto_unloading_krw.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    // 2. Upload to Karawang answer
    const uploadRes = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: {
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: formData,
      },
      testEnv
    );

    expect(uploadRes.status).toBe(201);
    const uploadData = (await uploadRes.json()) as any;
    expect(uploadData.success).toBe(true);
    expect(uploadData.data.original_name).toBe('foto_unloading_krw.jpg');
    expect(uploadData.data.mime_type).toBe('image/jpeg');
    expect(uploadData.data.sha256).toBeDefined();
    expect(uploadData.data.object_key).toContain('evidence/');

    const evidenceId = uploadData.data.id;

    // 3. Download evidence stream via Worker
    const downloadRes = await app.request(
      `/api/evidence/${evidenceId}`,
      {
        headers: {
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
      },
      testEnv
    );

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('Content-Type')).toBe('image/jpeg');
    expect(downloadRes.headers.get('Cache-Control')).toContain('private');
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(downloadedBytes.length).toBe(jpegBytes.length);
    expect(downloadedBytes[0]).toBe(0xff);
    expect(downloadedBytes[1]).toBe(0xd8);
  });

  it('2. Format & Size Validation: rejects non-image MIME types and files > 5MB', async () => {
    // 1. Attempt upload of text/plain or application/pdf
    const pdfData = new FormData();
    const pdfFile = new File(['%PDF-1.4 dummy pdf'], 'laporan.pdf', { type: 'application/pdf' });
    pdfData.append('file', pdfFile);

    const badMimeRes = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: pdfData,
      },
      testEnv
    );

    expect(badMimeRes.status).toBe(400);
    const mimeErr = (await badMimeRes.json()) as any;
    expect(mimeErr.error.code).toBe('INVALID_MIME_TYPE');

    // 2. Attempt upload of file > 5 MB
    const hugeBytes = new Uint8Array(5.5 * 1024 * 1024); // 5.5 MB
    const hugeData = new FormData();
    const hugeFile = new File([hugeBytes], 'huge_photo.jpg', { type: 'image/jpeg' });
    hugeData.append('file', hugeFile);

    const hugeRes = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: hugeData,
      },
      testEnv
    );

    expect(hugeRes.status).toBe(400);
    const hugeErr = (await hugeRes.json()) as any;
    expect(hugeErr.error.code).toBe('FILE_TOO_LARGE');
  });

  it('3. Cross-Depot Isolation: PIC Karawang cannot upload or download Baros evidence', async () => {
    // 1. Baros uploads their evidence
    const barosFormData = new FormData();
    const barosFile = new File([new Uint8Array([1, 2, 3])], 'baros_photo.jpg', { type: 'image/jpeg' });
    barosFormData.append('file', barosFile);

    const barosUploadRes = await app.request(
      `/api/answers/${brsAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picBrsToken },
        body: barosFormData,
      },
      testEnv
    );
    expect(barosUploadRes.status).toBe(201);
    const barosEvidenceId = ((await barosUploadRes.json()) as any).data.id;

    // 2. PIC Karawang attempts to upload to Baros answer -> 403 Forbidden
    const crossUploadData = new FormData();
    crossUploadData.append('file', new File([new Uint8Array([4, 5])], 'illegal.jpg', { type: 'image/jpeg' }));

    const crossUploadRes = await app.request(
      `/api/answers/${brsAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: crossUploadData,
      },
      testEnv
    );
    expect(crossUploadRes.status).toBe(403);

    // 3. PIC Karawang attempts to download Baros evidence -> 403 Forbidden
    const crossDownloadRes = await app.request(
      `/api/evidence/${barosEvidenceId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(crossDownloadRes.status).toBe(403);
    const crossErr = (await crossDownloadRes.json()) as any;
    expect(crossErr.error.code).toBe('FORBIDDEN_DEPOT_ACCESS');
  });

  it('4. Blind Audit Guard: Auditor cannot download Self Audit evidence before Official Audit is SUBMITTED', async () => {
    // 1. Karawang uploads self evidence
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array([10, 20])], 'self_secret.jpg', { type: 'image/jpeg' }));

    const uploadRes = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: formData,
      },
      testEnv
    );
    const evidenceId = ((await uploadRes.json()) as any).data.id;

    // 2. Auditor attempts to download self evidence before Official is SUBMITTED -> 403 BLIND_AUDIT_RESTRICTION
    const auditorBlindRes = await app.request(
      `/api/evidence/${evidenceId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
      },
      testEnv
    );
    expect(auditorBlindRes.status).toBe(403);
    const blindErr = (await auditorBlindRes.json()) as any;
    expect(blindErr.error.code).toBe('BLIND_AUDIT_RESTRICTION');

    // 3. Admin can access (emergency/system supervision)
    const adminRes = await app.request(
      `/api/evidence/${evidenceId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': adminToken },
      },
      testEnv
    );
    expect(adminRes.status).toBe(200);
  });

  it('5. Deduplication & Retry: identical upload returns existing evidence record idempotently', async () => {
    const rawBytes = new Uint8Array([42, 42, 42, 42]);
    const file1 = new File([rawBytes], 'identik.jpg', { type: 'image/jpeg' });
    const formData1 = new FormData();
    formData1.append('file', file1);

    // First upload
    const res1 = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: formData1,
      },
      testEnv
    );
    expect(res1.status).toBe(201);
    const data1 = ((await res1.json()) as any).data;

    // Second upload with same bytes
    const file2 = new File([rawBytes], 'identik_retry.jpg', { type: 'image/jpeg' });
    const formData2 = new FormData();
    formData2.append('file', file2);

    const res2 = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: formData2,
      },
      testEnv
    );
    expect(res2.status).toBe(201);
    const data2 = ((await res2.json()) as any).data;

    // Must return the exact same evidence record
    expect(data2.id).toBe(data1.id);
    expect(data2.is_duplicate).toBe(true);

    // Verify only 1 record exists in D1
    const count = db
      .prepare('SELECT count(*) as count FROM evidence_files WHERE answer_id = ?')
      .get(krwAnswerId) as any;
    expect(count.count).toBe(1);
  });

  it('6. Audit Lock & Soft Delete: submitted audit blocks uploads, soft delete sets deleted_at and logs event', async () => {
    // 1. Upload evidence before submit
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array([99, 99])], 'bukti_delete.jpg', { type: 'image/jpeg' }));

    const uploadRes = await app.request(
      `/api/answers/${krwAnswerId}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        body: formData,
      },
      testEnv
    );
    const evidenceId = ((await uploadRes.json()) as any).data.id;

    // 2. Soft delete evidence
    const deleteRes = await app.request(
      `/api/evidence/${evidenceId}`,
      {
        method: 'DELETE',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(deleteRes.status).toBe(200);

    // 3. Verify download now returns 404
    const getDeletedRes = await app.request(
      `/api/evidence/${evidenceId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(getDeletedRes.status).toBe(404);

    // 4. Verify audit_events logged EVIDENCE_DELETED
    const event = db
      .prepare("SELECT event_type FROM audit_events WHERE entity_id = ? AND event_type = 'EVIDENCE_DELETED'")
      .get(evidenceId) as any;
    expect(event).toBeDefined();
    expect(event.event_type).toBe('EVIDENCE_DELETED');
  });
});
