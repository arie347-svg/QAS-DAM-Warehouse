// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import fs from 'fs';
import path from 'path';
import app from '../../worker/index';
import { createTestJwt } from '../../worker/services/jwtService';
import { createD1Mock } from '../helpers/d1Mock';
import { Env } from '../../worker/types';
import { TemplateVersionTree } from '../../worker/services/templateService';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Master Template Versioning, Draft CRUD & Immutability (Task 4)', () => {
  let d1Mock: D1Database;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picToken: string;

  beforeEach(async () => {
    const db = new DatabaseSync(':memory:');
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
    testEnv = {
      DB: d1Mock,
      ENVIRONMENT: 'test',
      JWT_DEV_SECRET: TEST_SECRET,
    };

    adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);
    auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
    picToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
  });

  it('RBAC: allows Admin and Auditor with master permission, rejects regular PIC with 403', async () => {
    // 1. PIC access -> 403
    const picRes = await app.request('/api/admin/templates', {
      headers: { 'Cf-Access-Jwt-Assertion': picToken },
    }, testEnv);
    expect(picRes.status).toBe(403);

    // 2. Admin access -> 200
    const adminRes = await app.request('/api/admin/templates', {
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);
    expect(adminRes.status).toBe(200);

    // 3. Auditor access -> 200
    const auditorRes = await app.request('/api/admin/templates', {
      headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
    }, testEnv);
    expect(auditorRes.status).toBe(200);
  });

  it('lists templates and retrieves full tree of version 1 (17 questions, 4 sections)', async () => {
    // 1. List templates
    const listRes = await app.request('/api/admin/templates', {
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { success: boolean; data: Array<{ code: string; versions: Array<{ status: string }> }> };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].code).toBe('QAS-LOG-SMH');
    expect(listBody.data[0].versions).toHaveLength(1);
    expect(listBody.data[0].versions[0].status).toBe('DRAFT');

    // 2. Get tree detail of version 1
    const treeRes = await app.request('/api/admin/template-versions/ver-qas-log-v1', {
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(treeRes.status).toBe(200);
    const treeBody = (await treeRes.json()) as { success: boolean; data: TemplateVersionTree };
    expect(treeBody.data.sections).toHaveLength(4);

    const allQuestions = treeBody.data.sections.flatMap((s) => s.questions);
    expect(allQuestions).toHaveLength(17);
    const allOptions = allQuestions.flatMap((q) => q.options);
    expect(allOptions).toHaveLength(74);
  });

  it('DRAFT CRUD: allows adding, updating, and deleting section on DRAFT version', async () => {
    // 1. Add section
    const addSecRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/sections', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'J3-TEST',
        title: 'Seksi Uji Coba Tambahan',
        display_order: 5,
        weight: 10,
      }),
    }, testEnv);

    expect(addSecRes.status).toBe(200);
    const addBody = (await addSecRes.json()) as { success: boolean; data: { id: string } };
    const newSecId = addBody.data.id;

    // 2. Update section
    const updateSecRes = await app.request(`/api/admin/sections/${newSecId}`, {
      method: 'PATCH',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Seksi Uji Coba Diperbarui',
        display_order: 6,
      }),
    }, testEnv);

    expect(updateSecRes.status).toBe(200);

    // 3. Delete section
    const delSecRes = await app.request(`/api/admin/sections/${newSecId}`, {
      method: 'DELETE',
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(delSecRes.status).toBe(200);
  });

  it('DRAFT CRUD: rejects duplicate section code within same version with 400', async () => {
    const dupRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/sections', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'J1-DIS', // already exists
        title: 'Duplicate Section',
        display_order: 10,
      }),
    }, testEnv);

    expect(dupRes.status).toBe(400);
    const body = (await dupRes.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('DUPLICATE_SECTION_CODE');
  });

  it('Immutability Guard (AC-18): strictly rejects modifications on PUBLISHED or RETIRED versions', async () => {
    // 1. Manually mark version as PUBLISHED
    await d1Mock.prepare("UPDATE audit_template_versions SET status = 'PUBLISHED' WHERE id = 'ver-qas-log-v1'").run();

    // 2. Attempt to add section to PUBLISHED version
    const addSecRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/sections', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'J3-ILLEGAL',
        title: 'Illegal Section',
        display_order: 10,
      }),
    }, testEnv);

    expect(addSecRes.status).toBe(400);
    const body = (await addSecRes.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('IMMUTABLE_VERSION_MODIFICATION');

    // 3. Attempt to update existing section on PUBLISHED version
    const patchSecRes = await app.request('/api/admin/sections/sec-j1-dis', {
      method: 'PATCH',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Modified on Published' }),
    }, testEnv);

    expect(patchSecRes.status).toBe(400);

    // 4. Attempt to delete section on PUBLISHED version
    const delSecRes = await app.request('/api/admin/sections/sec-j1-dis', {
      method: 'DELETE',
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(delSecRes.status).toBe(400);
  });

  it('Clone Version (AC-16): creates a new DRAFT version with cloned questions and options', async () => {
    // 1. Clone version 1
    const cloneRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/clone', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(cloneRes.status).toBe(200);
    const cloneBody = (await cloneRes.json()) as { success: boolean; data: TemplateVersionTree };
    expect(cloneBody.success).toBe(true);
    expect(cloneBody.data.version_no).toBe(2);
    expect(cloneBody.data.status).toBe('DRAFT');
    expect(cloneBody.data.sections).toHaveLength(4);

    const clonedQuestions = cloneBody.data.sections.flatMap((s) => s.questions);
    expect(clonedQuestions).toHaveLength(17);

    // Verify audit event TEMPLATE_VERSION_CLONED was recorded
    const event = await d1Mock
      .prepare("SELECT * FROM audit_events WHERE event_type = 'TEMPLATE_VERSION_CLONED'")
      .first<{ event_type: string; actor_user_id: string }>();

    expect(event).toBeDefined();
    expect(event?.event_type).toBe('TEMPLATE_VERSION_CLONED');
    expect(event?.actor_user_id).toBe('user-admin');
  });

  it('Validation & Simulation (AC-20, AC-21): verifies structure, reports missing scoring, and blocks unverified publish', async () => {
    // 1. Validate version 1 (which has null scoring)
    const valRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/validate', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(valRes.status).toBe(200);
    const valBody = (await valRes.json()) as {
      success: boolean;
      data: {
        version_no: number;
        isValidForPublish: boolean;
        warnings: string[];
        summary: { total_questions: number; evidence_required_questions: number };
      };
    };
    expect(valBody.data.version_no).toBe(1);
    expect(valBody.data.summary.total_questions).toBe(17);
    expect(valBody.data.summary.evidence_required_questions).toBe(17); // All 17 normalized questions require evidence
    // Unverified scoring: isValidForPublish must be false until Gate 5 scoring is configured
    expect(valBody.data.isValidForPublish).toBe(false);
    expect(valBody.data.warnings.length).toBeGreaterThan(0);

    // 2. Attempting to publish without scoring config is rejected with 400 (AC-20)
    const pubRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/publish', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }, testEnv);

    expect(pubRes.status).toBe(400);
    const pubBody = (await pubRes.json()) as { success: boolean; error: { code: string } };
    expect(pubBody.error.code).toBe('PUBLISH_VALIDATION_FAILED');
  });

  it('Publishing with authorized scoring config: updates status to PUBLISHED and logs audit trail', async () => {
    // Fill all option numeric scores to satisfy publish requirements
    await d1Mock.prepare('UPDATE answer_options SET numeric_value = 4').run();

    const authorizedScoringConfig = JSON.stringify({
      formula: 'weighted_average',
      rounding_decimals: 2,
      categories: [
        { label: 'BAIK SEKALI', min: 4.0, max: 5.0 },
        { label: 'BAIK', min: 3.0, max: 3.99 },
        { label: 'CUKUP', min: 2.0, max: 2.99 },
      ],
    });

    const pubRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/publish', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scoring_config_json: authorizedScoringConfig }),
    }, testEnv);

    expect(pubRes.status).toBe(200);
    const pubBody = (await pubRes.json()) as { success: boolean; data: { status: string; published_at: string } };
    expect(pubBody.data.status).toBe('PUBLISHED');
    expect(pubBody.data.published_at).toBeDefined();

    // Verify audit event TEMPLATE_VERSION_PUBLISHED
    const event = await d1Mock
      .prepare("SELECT * FROM audit_events WHERE event_type = 'TEMPLATE_VERSION_PUBLISHED'")
      .first<{ event_type: string }>();

    expect(event).toBeDefined();
    expect(event?.event_type).toBe('TEMPLATE_VERSION_PUBLISHED');
  });

  it('Retire Version: transitions version to RETIRED status', async () => {
    const retRes = await app.request('/api/admin/template-versions/ver-qas-log-v1/retire', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);

    expect(retRes.status).toBe(200);
    const retBody = (await retRes.json()) as { success: boolean; data: { status: string } };
    expect(retBody.data.status).toBe('RETIRED');
  });
});
