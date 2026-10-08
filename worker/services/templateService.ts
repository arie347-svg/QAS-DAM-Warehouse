import { 
  createSectionSchema, 
  updateSectionSchema, 
  createQuestionSchema, 
  updateQuestionSchema, 
  createOptionSchema, 
  updateOptionSchema 
} from '../validators/templateSchemas';

export interface TemplateVersionTree {
  id: string;
  template_id: string;
  template_code: string;
  template_name: string;
  version_no: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  scoring_config_json: string | null;
  published_at: string | null;
  published_by: string | null;
  sections: Array<{
    id: string;
    code: string;
    title: string;
    display_order: number;
    weight: number | null;
    questions: Array<{
      id: string;
      code: string;
      prompt: string;
      display_order: number;
      evidence_required: boolean;
      is_required: boolean;
      weight: number | null;
      options: Array<{
        id: string;
        code: string;
        label: string;
        numeric_value: number | null;
        display_order: number;
        is_na: boolean;
      }>;
    }>;
  }>;
}

export class TemplateError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Asserts that a template version is in DRAFT status.
 * Rejects operations on PUBLISHED or RETIRED versions (Immutability Guard).
 */
export async function assertDraftVersion(db: D1Database, versionId: string): Promise<void> {
  const version = await db
    .prepare('SELECT status, version_no FROM audit_template_versions WHERE id = ?')
    .bind(versionId)
    .first<{ status: string; version_no: number }>();

  if (!version) {
    throw new TemplateError('NOT_FOUND', `Versi template dengan ID ${versionId} tidak ditemukan.`, 404);
  }

  if (version.status !== 'DRAFT') {
    throw new TemplateError(
      'IMMUTABLE_VERSION_MODIFICATION',
      `Perubahan ditolak: Versi template ${version.version_no} berstatus ${version.status} bersifat immutable. Silakan lakukan Clone ke versi DRAFT baru.`,
      400
    );
  }
}

/**
 * Logs an event to audit_events table.
 */
async function logAuditEvent(
  db: D1Database,
  eventType: string,
  entityType: string,
  entityId: string,
  actorUserId: string,
  reason: string,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (id, entity_type, entity_id, event_type, actor_user_id, reason, payload_json, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      entityType,
      entityId,
      eventType,
      actorUserId,
      reason,
      JSON.stringify(payload),
      requestId || null,
      new Date().toISOString()
    )
    .run();
}

/**
 * List all templates and their versions.
 */
export async function listTemplates(db: D1Database) {
  const templates = await db
    .prepare('SELECT id, code, name, is_active FROM audit_templates ORDER BY code')
    .all<{ id: string; code: string; name: string; is_active: number }>();

  const versions = await db
    .prepare(
      `SELECT id, template_id, version_no, status, published_at, scoring_config_json
       FROM audit_template_versions
       ORDER BY template_id, version_no DESC`
    )
    .all<{
      id: string;
      template_id: string;
      version_no: number;
      status: string;
      published_at: string | null;
      scoring_config_json: string | null;
    }>();

  return (templates.results || []).map((t) => ({
    ...t,
    is_active: t.is_active === 1,
    versions: (versions.results || []).filter((v) => v.template_id === t.id),
  }));
}

/**
 * Get full hierarchical tree of a template version (Sections -> Questions -> Options).
 */
export async function getTemplateVersionTree(
  db: D1Database,
  versionId: string
): Promise<TemplateVersionTree> {
  const versionRow = await db
    .prepare(
      `SELECT v.id, v.template_id, t.code as template_code, t.name as template_name,
              v.version_no, v.status, v.scoring_config_json, v.published_at, v.published_by
       FROM audit_template_versions v
       JOIN audit_templates t ON v.template_id = t.id
       WHERE v.id = ?`
    )
    .bind(versionId)
    .first<{
      id: string;
      template_id: string;
      template_code: string;
      template_name: string;
      version_no: number;
      status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
      scoring_config_json: string | null;
      published_at: string | null;
      published_by: string | null;
    }>();

  if (!versionRow) {
    throw new TemplateError('NOT_FOUND', `Versi template ${versionId} tidak ditemukan.`, 404);
  }

  // Get sections
  const sections = await db
    .prepare('SELECT id, code, title, display_order, weight FROM audit_sections WHERE version_id = ? ORDER BY display_order')
    .bind(versionId)
    .all<{ id: string; code: string; title: string; display_order: number; weight: number | null }>();

  // Get all questions in this version
  const questions = await db
    .prepare(
      `SELECT q.id, q.section_id, q.code, q.prompt, q.display_order, q.evidence_required, q.is_required, q.weight
       FROM audit_questions q
       JOIN audit_sections s ON q.section_id = s.id
       WHERE s.version_id = ?
       ORDER BY q.display_order`
    )
    .bind(versionId)
    .all<{
      id: string;
      section_id: string;
      code: string;
      prompt: string;
      display_order: number;
      evidence_required: number;
      is_required: number;
      weight: number | null;
    }>();

  // Get all options in this version
  const options = await db
    .prepare(
      `SELECT o.id, o.question_id, o.code, o.label, o.numeric_value, o.display_order, o.is_na
       FROM answer_options o
       JOIN audit_questions q ON o.question_id = q.id
       JOIN audit_sections s ON q.section_id = s.id
       WHERE s.version_id = ?
       ORDER BY o.display_order`
    )
    .bind(versionId)
    .all<{
      id: string;
      question_id: string;
      code: string;
      label: string;
      numeric_value: number | null;
      display_order: number;
      is_na: number;
    }>();

  // Build tree
  const treeSections = (sections.results || []).map((sec) => {
    const secQuestions = (questions.results || [])
      .filter((q) => q.section_id === sec.id)
      .map((q) => {
        const qOptions = (options.results || [])
          .filter((o) => o.question_id === q.id)
          .map((o) => ({
            id: o.id,
            code: o.code,
            label: o.label,
            numeric_value: o.numeric_value,
            display_order: o.display_order,
            is_na: o.is_na === 1,
          }));

        return {
          id: q.id,
          code: q.code,
          prompt: q.prompt,
          display_order: q.display_order,
          evidence_required: q.evidence_required === 1,
          is_required: q.is_required === 1,
          weight: q.weight,
          options: qOptions,
        };
      });

    return {
      id: sec.id,
      code: sec.code,
      title: sec.title,
      display_order: sec.display_order,
      weight: sec.weight,
      questions: secQuestions,
    };
  });

  return {
    ...versionRow,
    sections: treeSections,
  };
}

/**
 * Clones an existing template version into a new DRAFT version.
 */
export async function cloneTemplateVersion(
  db: D1Database,
  sourceVersionId: string,
  actorUserId: string,
  requestId?: string
): Promise<TemplateVersionTree> {
  const sourceTree = await getTemplateVersionTree(db, sourceVersionId);

  // Find next version_no
  const maxVersion = await db
    .prepare('SELECT MAX(version_no) as max_v FROM audit_template_versions WHERE template_id = ?')
    .bind(sourceTree.template_id)
    .first<{ max_v: number }>();

  const newVersionNo = (maxVersion?.max_v || 0) + 1;
  const newVersionId = `ver-${sourceTree.template_code.toLowerCase()}-v${newVersionNo}-${crypto.randomUUID().substring(0, 8)}`;

  // 1. Create new template version in DRAFT status
  await db
    .prepare(
      `INSERT INTO audit_template_versions (id, template_id, version_no, status, scoring_config_json, published_at, published_by)
       VALUES (?, ?, ?, 'DRAFT', ?, NULL, NULL)`
    )
    .bind(newVersionId, sourceTree.template_id, newVersionNo, sourceTree.scoring_config_json)
    .run();

  // 2. Clone sections, questions, and options
  for (const sec of sourceTree.sections) {
    const newSecId = `sec-${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO audit_sections (id, version_id, code, title, display_order, weight)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(newSecId, newVersionId, sec.code, sec.title, sec.display_order, sec.weight)
      .run();

    for (const q of sec.questions) {
      const newQId = `q-${crypto.randomUUID()}`;
      await db
        .prepare(
          `INSERT INTO audit_questions (id, section_id, code, prompt, display_order, evidence_required, is_required, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newQId,
          newSecId,
          q.code,
          q.prompt,
          q.display_order,
          q.evidence_required ? 1 : 0,
          q.is_required ? 1 : 0,
          q.weight
        )
        .run();

      for (const opt of q.options) {
        const newOptId = `opt-${crypto.randomUUID()}`;
        await db
          .prepare(
            `INSERT INTO answer_options (id, question_id, code, label, numeric_value, display_order, is_na)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newOptId,
            newQId,
            opt.code,
            opt.label,
            opt.numeric_value,
            opt.display_order,
            opt.is_na ? 1 : 0
          )
          .run();
      }
    }
  }

  // 3. Log audit event
  await logAuditEvent(
    db,
    'TEMPLATE_VERSION_CLONED',
    'TEMPLATE_VERSION',
    newVersionId,
    actorUserId,
    `Clone dari versi ${sourceTree.version_no} ke versi DRAFT ${newVersionNo}`,
    {
      template_id: sourceTree.template_id,
      source_version_id: sourceVersionId,
      source_version_no: sourceTree.version_no,
      new_version_no: newVersionNo,
    },
    requestId
  );

  return await getTemplateVersionTree(db, newVersionId);
}

/* -------------------------------------------------------------
 * CRUD: Sections (Draft only)
 * ------------------------------------------------------------- */

export async function createSection(
  db: D1Database,
  versionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  await assertDraftVersion(db, versionId);
  const data = createSectionSchema.parse(rawPayload);

  // Check code uniqueness within version
  const existing = await db
    .prepare('SELECT id FROM audit_sections WHERE version_id = ? AND code = ?')
    .bind(versionId, data.code)
    .first();
  if (existing) {
    throw new TemplateError('DUPLICATE_SECTION_CODE', `Kode seksi '${data.code}' sudah digunakan pada versi ini.`);
  }

  const sectionId = `sec-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO audit_sections (id, version_id, code, title, display_order, weight)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(sectionId, versionId, data.code, data.title, data.display_order, data.weight ?? null)
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'SECTION',
    sectionId,
    actorUserId,
    `Menambah seksi ${data.code}`,
    { version_id: versionId, ...data },
    requestId
  );

  return { id: sectionId, version_id: versionId, ...data };
}

export async function updateSection(
  db: D1Database,
  sectionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  const section = await db
    .prepare('SELECT version_id, code, title, display_order, weight FROM audit_sections WHERE id = ?')
    .bind(sectionId)
    .first<{ version_id: string; code: string; title: string; display_order: number; weight: number | null }>();

  if (!section) {
    throw new TemplateError('NOT_FOUND', `Seksi ${sectionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, section.version_id);
  const data = updateSectionSchema.parse(rawPayload);

  if (data.code && data.code !== section.code) {
    const existing = await db
      .prepare('SELECT id FROM audit_sections WHERE version_id = ? AND code = ? AND id != ?')
      .bind(section.version_id, data.code, sectionId)
      .first();
    if (existing) {
      throw new TemplateError('DUPLICATE_SECTION_CODE', `Kode seksi '${data.code}' sudah digunakan.`);
    }
  }

  const updated = {
    code: data.code ?? section.code,
    title: data.title ?? section.title,
    display_order: data.display_order ?? section.display_order,
    weight: data.weight !== undefined ? data.weight : section.weight,
  };

  await db
    .prepare(
      `UPDATE audit_sections
       SET code = ?, title = ?, display_order = ?, weight = ?
       WHERE id = ?`
    )
    .bind(updated.code, updated.title, updated.display_order, updated.weight, sectionId)
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'SECTION',
    sectionId,
    actorUserId,
    `Mengubah seksi ${updated.code}`,
    { old: section, new: updated },
    requestId
  );

  return { id: sectionId, version_id: section.version_id, ...updated };
}

export async function deleteSection(
  db: D1Database,
  sectionId: string,
  actorUserId: string,
  requestId?: string
) {
  const section = await db
    .prepare('SELECT version_id, code FROM audit_sections WHERE id = ?')
    .bind(sectionId)
    .first<{ version_id: string; code: string }>();

  if (!section) {
    throw new TemplateError('NOT_FOUND', `Seksi ${sectionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, section.version_id);

  // Check if questions are used in any audit
  const used = await db
    .prepare(
      `SELECT COUNT(*) as count FROM audit_answers a
       JOIN audit_questions q ON a.question_id = q.id
       WHERE q.section_id = ?`
    )
    .bind(sectionId)
    .first<{ count: number }>();

  if (used && used.count > 0) {
    throw new TemplateError(
      'SECTION_IN_USE',
      'Seksi ini tidak dapat dihapus karena soal di dalamnya memiliki riwayat jawaban audit.'
    );
  }

  await db.prepare('DELETE FROM audit_sections WHERE id = ?').bind(sectionId).run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'SECTION',
    sectionId,
    actorUserId,
    `Menghapus seksi ${section.code}`,
    { version_id: section.version_id, code: section.code },
    requestId
  );

  return { success: true, deleted_id: sectionId };
}

/* -------------------------------------------------------------
 * CRUD: Questions (Draft only)
 * ------------------------------------------------------------- */

export async function createQuestion(
  db: D1Database,
  sectionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  const section = await db
    .prepare('SELECT version_id FROM audit_sections WHERE id = ?')
    .bind(sectionId)
    .first<{ version_id: string }>();

  if (!section) {
    throw new TemplateError('NOT_FOUND', `Seksi ${sectionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, section.version_id);
  const data = createQuestionSchema.parse(rawPayload);

  const existing = await db
    .prepare('SELECT id FROM audit_questions WHERE section_id = ? AND code = ?')
    .bind(sectionId, data.code)
    .first();
  if (existing) {
    throw new TemplateError('DUPLICATE_QUESTION_CODE', `Kode soal '${data.code}' sudah digunakan pada seksi ini.`);
  }

  const questionId = `q-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO audit_questions (id, section_id, code, prompt, display_order, evidence_required, is_required, weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      questionId,
      sectionId,
      data.code,
      data.prompt,
      data.display_order,
      data.evidence_required ? 1 : 0,
      data.is_required ? 1 : 0,
      data.weight ?? null
    )
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'QUESTION',
    questionId,
    actorUserId,
    `Menambah pertanyaan ${data.code}`,
    { section_id: sectionId, ...data },
    requestId
  );

  return { id: questionId, section_id: sectionId, ...data };
}

export async function updateQuestion(
  db: D1Database,
  questionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  const question = await db
    .prepare(
      `SELECT q.section_id, s.version_id, q.code, q.prompt, q.display_order, q.evidence_required, q.is_required, q.weight
       FROM audit_questions q
       JOIN audit_sections s ON q.section_id = s.id
       WHERE q.id = ?`
    )
    .bind(questionId)
    .first<{
      section_id: string;
      version_id: string;
      code: string;
      prompt: string;
      display_order: number;
      evidence_required: number;
      is_required: number;
      weight: number | null;
    }>();

  if (!question) {
    throw new TemplateError('NOT_FOUND', `Pertanyaan ${questionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, question.version_id);
  const data = updateQuestionSchema.parse(rawPayload);

  if (data.code && data.code !== question.code) {
    const existing = await db
      .prepare('SELECT id FROM audit_questions WHERE section_id = ? AND code = ? AND id != ?')
      .bind(question.section_id, data.code, questionId)
      .first();
    if (existing) {
      throw new TemplateError('DUPLICATE_QUESTION_CODE', `Kode soal '${data.code}' sudah digunakan.`);
    }
  }

  const updated = {
    code: data.code ?? question.code,
    prompt: data.prompt ?? question.prompt,
    display_order: data.display_order ?? question.display_order,
    evidence_required: data.evidence_required !== undefined ? (data.evidence_required ? 1 : 0) : question.evidence_required,
    is_required: data.is_required !== undefined ? (data.is_required ? 1 : 0) : question.is_required,
    weight: data.weight !== undefined ? data.weight : question.weight,
  };

  await db
    .prepare(
      `UPDATE audit_questions
       SET code = ?, prompt = ?, display_order = ?, evidence_required = ?, is_required = ?, weight = ?
       WHERE id = ?`
    )
    .bind(
      updated.code,
      updated.prompt,
      updated.display_order,
      updated.evidence_required,
      updated.is_required,
      updated.weight,
      questionId
    )
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'QUESTION',
    questionId,
    actorUserId,
    `Mengubah pertanyaan ${updated.code}`,
    { old: question, new: updated },
    requestId
  );

  return { id: questionId, ...updated, evidence_required: updated.evidence_required === 1, is_required: updated.is_required === 1 };
}

export async function deleteQuestion(
  db: D1Database,
  questionId: string,
  actorUserId: string,
  requestId?: string
) {
  const question = await db
    .prepare(
      `SELECT q.code, s.version_id
       FROM audit_questions q
       JOIN audit_sections s ON q.section_id = s.id
       WHERE q.id = ?`
    )
    .bind(questionId)
    .first<{ code: string; version_id: string }>();

  if (!question) {
    throw new TemplateError('NOT_FOUND', `Pertanyaan ${questionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, question.version_id);

  // Check if answers exist
  const used = await db
    .prepare('SELECT COUNT(*) as count FROM audit_answers WHERE question_id = ?')
    .bind(questionId)
    .first<{ count: number }>();

  if (used && used.count > 0) {
    throw new TemplateError('QUESTION_IN_USE', 'Pertanyaan tidak dapat dihapus karena sudah memiliki riwayat jawaban.');
  }

  await db.prepare('DELETE FROM audit_questions WHERE id = ?').bind(questionId).run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'QUESTION',
    questionId,
    actorUserId,
    `Menghapus pertanyaan ${question.code}`,
    { version_id: question.version_id, code: question.code },
    requestId
  );

  return { success: true, deleted_id: questionId };
}

/* -------------------------------------------------------------
 * CRUD: Options (Draft only)
 * ------------------------------------------------------------- */

export async function createOption(
  db: D1Database,
  questionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  const qInfo = await db
    .prepare(
      `SELECT s.version_id
       FROM audit_questions q
       JOIN audit_sections s ON q.section_id = s.id
       WHERE q.id = ?`
    )
    .bind(questionId)
    .first<{ version_id: string }>();

  if (!qInfo) {
    throw new TemplateError('NOT_FOUND', `Pertanyaan ${questionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, qInfo.version_id);
  const data = createOptionSchema.parse(rawPayload);

  const existing = await db
    .prepare('SELECT id FROM answer_options WHERE question_id = ? AND code = ?')
    .bind(questionId, data.code)
    .first();
  if (existing) {
    throw new TemplateError('DUPLICATE_OPTION_CODE', `Kode opsi '${data.code}' sudah digunakan pada pertanyaan ini.`);
  }

  const optionId = `opt-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO answer_options (id, question_id, code, label, numeric_value, display_order, is_na)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      optionId,
      questionId,
      data.code,
      data.label,
      data.numeric_value ?? null,
      data.display_order,
      data.is_na ? 1 : 0
    )
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'OPTION',
    optionId,
    actorUserId,
    `Menambah pilihan jawaban ${data.code}`,
    { question_id: questionId, ...data },
    requestId
  );

  return { id: optionId, question_id: questionId, ...data };
}

export async function updateOption(
  db: D1Database,
  optionId: string,
  rawPayload: unknown,
  actorUserId: string,
  requestId?: string
) {
  const optInfo = await db
    .prepare(
      `SELECT o.question_id, s.version_id, o.code, o.label, o.numeric_value, o.display_order, o.is_na
       FROM answer_options o
       JOIN audit_questions q ON o.question_id = q.id
       JOIN audit_sections s ON q.section_id = s.id
       WHERE o.id = ?`
    )
    .bind(optionId)
    .first<{
      question_id: string;
      version_id: string;
      code: string;
      label: string;
      numeric_value: number | null;
      display_order: number;
      is_na: number;
    }>();

  if (!optInfo) {
    throw new TemplateError('NOT_FOUND', `Pilihan ${optionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, optInfo.version_id);
  const data = updateOptionSchema.parse(rawPayload);

  if (data.code && data.code !== optInfo.code) {
    const existing = await db
      .prepare('SELECT id FROM answer_options WHERE question_id = ? AND code = ? AND id != ?')
      .bind(optInfo.question_id, data.code, optionId)
      .first();
    if (existing) {
      throw new TemplateError('DUPLICATE_OPTION_CODE', `Kode opsi '${data.code}' sudah digunakan.`);
    }
  }

  const updated = {
    code: data.code ?? optInfo.code,
    label: data.label ?? optInfo.label,
    numeric_value: data.numeric_value !== undefined ? data.numeric_value : optInfo.numeric_value,
    display_order: data.display_order ?? optInfo.display_order,
    is_na: data.is_na !== undefined ? (data.is_na ? 1 : 0) : optInfo.is_na,
  };

  await db
    .prepare(
      `UPDATE answer_options
       SET code = ?, label = ?, numeric_value = ?, display_order = ?, is_na = ?
       WHERE id = ?`
    )
    .bind(
      updated.code,
      updated.label,
      updated.numeric_value,
      updated.display_order,
      updated.is_na,
      optionId
    )
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'OPTION',
    optionId,
    actorUserId,
    `Mengubah pilihan jawaban ${updated.code}`,
    { old: optInfo, new: updated },
    requestId
  );

  return { id: optionId, ...updated, is_na: updated.is_na === 1 };
}

export async function deleteOption(
  db: D1Database,
  optionId: string,
  actorUserId: string,
  requestId?: string
) {
  const optInfo = await db
    .prepare(
      `SELECT o.code, s.version_id
       FROM answer_options o
       JOIN audit_questions q ON o.question_id = q.id
       JOIN audit_sections s ON q.section_id = s.id
       WHERE o.id = ?`
    )
    .bind(optionId)
    .first<{ code: string; version_id: string }>();

  if (!optInfo) {
    throw new TemplateError('NOT_FOUND', `Pilihan ${optionId} tidak ditemukan.`, 404);
  }

  await assertDraftVersion(db, optInfo.version_id);

  const used = await db
    .prepare('SELECT COUNT(*) as count FROM audit_answers WHERE option_id = ?')
    .bind(optionId)
    .first<{ count: number }>();

  if (used && used.count > 0) {
    throw new TemplateError('OPTION_IN_USE', 'Pilihan tidak dapat dihapus karena pernah dipilih dalam jawaban audit.');
  }

  await db.prepare('DELETE FROM answer_options WHERE id = ?').bind(optionId).run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'OPTION',
    optionId,
    actorUserId,
    `Menghapus pilihan jawaban ${optInfo.code}`,
    { version_id: optInfo.version_id, code: optInfo.code },
    requestId
  );

  return { success: true, deleted_id: optionId };
}

/* -------------------------------------------------------------
 * Validation & Simulation (AC-20, AC-21)
 * ------------------------------------------------------------- */

export async function validateAndSimulateVersion(db: D1Database, versionId: string) {
  const tree = await getTemplateVersionTree(db, versionId);

  const errors: string[] = [];
  const warnings: string[] = [];

  let totalQuestions = 0;
  let evidenceQuestions = 0;
  let questionsWithNullScore = 0;
  let maxPossibleScore = 0;
  let minPossibleScore = 0;

  // 1. Sections validation
  if (tree.sections.length === 0) {
    errors.push('Template harus memiliki setidaknya satu seksi.');
  }

  const sectionCodes = new Set<string>();
  const sectionOrders = new Set<number>();

  for (const sec of tree.sections) {
    if (sectionCodes.has(sec.code)) {
      errors.push(`Kode seksi duplikat ditemukan: '${sec.code}'.`);
    }
    sectionCodes.add(sec.code);

    if (sectionOrders.has(sec.display_order)) {
      errors.push(`Urutan seksi duplikat ditemukan pada posisi ${sec.display_order}.`);
    }
    sectionOrders.add(sec.display_order);

    if (sec.questions.length === 0) {
      warnings.push(`Seksi '${sec.code}' (${sec.title}) tidak memiliki pertanyaan.`);
    }

    const qCodes = new Set<string>();
    const qOrders = new Set<number>();

    for (const q of sec.questions) {
      totalQuestions++;
      if (q.evidence_required) evidenceQuestions++;

      if (qCodes.has(q.code)) {
        errors.push(`Kode pertanyaan duplikat ditemukan: '${q.code}'.`);
      }
      qCodes.add(q.code);

      if (qOrders.has(q.display_order)) {
        errors.push(`Urutan pertanyaan duplikat di seksi '${sec.code}': ${q.display_order}.`);
      }
      qOrders.add(q.display_order);

      // Check options
      if (q.options.length < 2) {
        errors.push(`Pertanyaan '${q.code}' harus memiliki setidaknya 2 pilihan jawaban (saat ini ${q.options.length}).`);
      }

      const optScores = q.options
        .map((o) => o.numeric_value)
        .filter((s): s is number => s !== null);

      if (optScores.length < q.options.length) {
        questionsWithNullScore++;
      } else if (optScores.length > 0) {
        maxPossibleScore += Math.max(...optScores);
        minPossibleScore += Math.min(...optScores);
      }
    }
  }

  // Scoring engine readiness check (Gate 5 guardrail)
  const isScoringConfigured = tree.scoring_config_json !== null && questionsWithNullScore === 0;

  if (questionsWithNullScore > 0) {
    warnings.push(
      `Terdapat ${questionsWithNullScore} pertanyaan dengan nilai numerik pilihan yang belum diatur (Gate 5 Blocker).`
    );
  }

  if (!tree.scoring_config_json) {
    warnings.push('Formula penilaian dan batas kategori (scoring_config_json) belum disahkan oleh Process Owner (Gate 5).');
  }

  const isValidForPublish = errors.length === 0 && isScoringConfigured;

  return {
    version_id: versionId,
    version_no: tree.version_no,
    status: tree.status,
    isValidForPublish,
    errors,
    warnings,
    summary: {
      total_sections: tree.sections.length,
      total_questions: totalQuestions,
      evidence_required_questions: evidenceQuestions,
      questions_with_unconfigured_scores: questionsWithNullScore,
      is_scoring_configured: isScoringConfigured,
      max_possible_sum: maxPossibleScore,
      min_possible_sum: minPossibleScore,
    },
  };
}

/* -------------------------------------------------------------
 * Publish & Retire
 * ------------------------------------------------------------- */

export async function publishTemplateVersion(
  db: D1Database,
  versionId: string,
  actorUserId: string,
  scoringConfigJson?: string,
  requestId?: string
) {
  await assertDraftVersion(db, versionId);

  // If scoringConfigJson is supplied, save it first
  if (scoringConfigJson) {
    await db
      .prepare('UPDATE audit_template_versions SET scoring_config_json = ? WHERE id = ?')
      .bind(scoringConfigJson, versionId)
      .run();
  }

  // Validate readiness
  const validation = await validateAndSimulateVersion(db, versionId);
  if (!validation.isValidForPublish) {
    throw new TemplateError(
      'PUBLISH_VALIDATION_FAILED',
      `Publikasi versi template ditolak: ${validation.errors.concat(validation.warnings).join('; ')}`,
      400
    );
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE audit_template_versions
       SET status = 'PUBLISHED', published_at = ?, published_by = ?
       WHERE id = ?`
    )
    .bind(now, actorUserId, versionId)
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_VERSION_PUBLISHED',
    'TEMPLATE_VERSION',
    versionId,
    actorUserId,
    `Publikasi versi template ${validation.version_no}`,
    { version_no: validation.version_no, published_at: now },
    requestId
  );

  return {
    success: true,
    version_id: versionId,
    status: 'PUBLISHED',
    published_at: now,
  };
}

export async function retireTemplateVersion(
  db: D1Database,
  versionId: string,
  actorUserId: string,
  requestId?: string
) {
  const version = await db
    .prepare('SELECT status, version_no FROM audit_template_versions WHERE id = ?')
    .bind(versionId)
    .first<{ status: string; version_no: number }>();

  if (!version) {
    throw new TemplateError('NOT_FOUND', `Versi template ${versionId} tidak ditemukan.`, 404);
  }

  if (version.status === 'RETIRED') {
    return { success: true, version_id: versionId, status: 'RETIRED' };
  }

  await db
    .prepare("UPDATE audit_template_versions SET status = 'RETIRED' WHERE id = ?")
    .bind(versionId)
    .run();

  await logAuditEvent(
    db,
    'TEMPLATE_MASTER_CHANGED',
    'TEMPLATE_VERSION',
    versionId,
    actorUserId,
    `Menonaktifkan (Retire) versi template ${version.version_no}`,
    { version_no: version.version_no, previous_status: version.status },
    requestId
  );

  return { success: true, version_id: versionId, status: 'RETIRED' };
}
