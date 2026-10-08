import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface AuditDraftAnswer {
  optionId: string | null;
  note: string | null;
  improvementTitle?: string | null;
  evidence?: Array<{
    id: string;
    original_name: string;
    size_bytes: number;
    preview_url?: string;
    base64_data?: string;
  }>;
  updatedAt: string;
  syncState?: 'pending' | 'synced';
  serverVersion?: number;
}

export interface DraftSummary {
  answeredCount: number;
  evidenceCount: number;
  lastActiveIndex: number;
  updatedAt: string;
}

interface AuditDraftsDB extends DBSchema {
  auditDrafts: {
    key: string; // auditId
    value: {
      auditId: string;
      answers: Record<string, AuditDraftAnswer>;
      lastActiveIndex?: number;
      lastSavedLocally: string;
    };
  };
}

const DB_NAME = 'qas_audit_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AuditDraftsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AuditDraftsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AuditDraftsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('auditDrafts')) {
          db.createObjectStore('auditDrafts', { keyPath: 'auditId' });
        }
      },
    });
  }
  return dbPromise;
}

const DRAFT_SUMMARY_PREFIX = 'qas_draft_summary_';

/**
 * Returns synchronous draft summary from LocalStorage.
 */
export function getStoredDraftSummary(auditId: string): DraftSummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_SUMMARY_PREFIX + auditId);
    if (!raw) return null;
    return JSON.parse(raw) as DraftSummary;
  } catch {
    return null;
  }
}

/**
 * Saves a single question answer to local IndexedDB draft.
 */
export async function saveDraftLocally(
  auditId: string,
  questionId: string,
  optionId: string | null,
  note: string | null,
  improvementTitle?: string | null,
  evidence?: Array<{ id: string; original_name: string; size_bytes: number; preview_url?: string }>,
  lastActiveIndex?: number
): Promise<void> {
  try {
    const db = await getDb();
    const existing = await db.get('auditDrafts', auditId);
    const answers = existing?.answers || {};

    answers[questionId] = {
      optionId,
      note,
      improvementTitle: improvementTitle || null,
      evidence: evidence !== undefined ? evidence : answers[questionId]?.evidence || [],
      updatedAt: new Date().toISOString(),
      syncState: 'pending',
    };

    const finalLastIndex = lastActiveIndex ?? existing?.lastActiveIndex ?? 0;

    await db.put('auditDrafts', {
      auditId,
      answers,
      lastActiveIndex: finalLastIndex,
      lastSavedLocally: new Date().toISOString(),
    });

    // Update synchronous summary for immediate card reactivity
    const answeredCount = Object.values(answers).filter((a) => a.optionId !== null).length;
    const evidenceCount = Object.values(answers).reduce((acc, a) => acc + (a.evidence?.length || 0), 0);

    if (typeof window !== 'undefined') {
      const summary: DraftSummary = {
        answeredCount,
        evidenceCount,
        lastActiveIndex: finalLastIndex,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_SUMMARY_PREFIX + auditId, JSON.stringify(summary));

      // Also mirror into local mock DB format so legacy readers get updated
      const mockAnswers: Record<string, { option_id: string | null; note: string; evidence: Array<{ id: string; original_name: string; size_bytes: number }> }> = {};
      Object.entries(answers).forEach(([qId, val]) => {
        mockAnswers[qId] = {
          option_id: val.optionId,
          note: val.note || '',
          evidence: val.evidence || [],
        };
      });
      localStorage.setItem(`qas_mock_db_answers_${auditId}`, JSON.stringify(mockAnswers));

      window.dispatchEvent(new Event('qas-draft-changed'));
    }
  } catch (err) {
    console.warn('Gagal menyimpan draft lokal ke IndexedDB:', err);
  }
}

/**
 * Saves full audit answers map to local IndexedDB draft non-blockingly.
 */
export async function saveFullAuditDraftLocally(
  auditId: string,
  answersMap: Record<
    string,
    {
      option_id: string | null;
      note: string | null;
      improvement_title?: string | null;
      evidence?: Array<{ id: string; original_name: string; size_bytes: number; preview_url?: string }>;
    }
  >,
  lastActiveIndex?: number
): Promise<void> {
  try {
    const db = await getDb();
    const existing = await db.get('auditDrafts', auditId);
    const answers = existing?.answers || {};

    Object.entries(answersMap).forEach(([qId, val]) => {
      answers[qId] = {
        optionId: val.option_id,
        note: val.note,
        improvementTitle: val.improvement_title || null,
        evidence: val.evidence || [],
        updatedAt: new Date().toISOString(),
        syncState: 'pending',
      };
    });

    const finalLastIndex = lastActiveIndex ?? existing?.lastActiveIndex ?? 0;

    await db.put('auditDrafts', {
      auditId,
      answers,
      lastActiveIndex: finalLastIndex,
      lastSavedLocally: new Date().toISOString(),
    });

    // Update synchronous summary for immediate card reactivity
    const answeredCount = Object.values(answers).filter((a) => a.optionId !== null).length;
    const evidenceCount = Object.values(answers).reduce((acc, a) => acc + (a.evidence?.length || 0), 0);

    if (typeof window !== 'undefined') {
      const summary: DraftSummary = {
        answeredCount,
        evidenceCount,
        lastActiveIndex: finalLastIndex,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_SUMMARY_PREFIX + auditId, JSON.stringify(summary));

      // Also mirror into local mock DB format so legacy readers get updated
      const mockAnswers: Record<string, { option_id: string | null; note: string; evidence: Array<{ id: string; original_name: string; size_bytes: number }> }> = {};
      Object.entries(answers).forEach(([qId, val]) => {
        mockAnswers[qId] = {
          option_id: val.optionId,
          note: val.note || '',
          evidence: val.evidence || [],
        };
      });
      localStorage.setItem(`qas_mock_db_answers_${auditId}`, JSON.stringify(mockAnswers));

      window.dispatchEvent(new Event('qas-draft-changed'));
    }
  } catch (err) {
    console.warn('Gagal menyimpan draft penuh ke IndexedDB:', err);
  }
}

/**
 * Retrieves all locally cached answers and metadata for an audit.
 */
export async function getDraftAnswers(
  auditId: string
): Promise<{ answers: Record<string, AuditDraftAnswer>; lastActiveIndex?: number } | null> {
  try {
    const db = await getDb();
    const draft = await db.get('auditDrafts', auditId);
    return draft ? { answers: draft.answers, lastActiveIndex: draft.lastActiveIndex } : null;
  } catch (err) {
    console.warn('Gagal membaca draft lokal dari IndexedDB:', err);
    return null;
  }
}

/** Marks one cached answer as persisted in D1. Synced cache never overrides D1 on reload. */
export async function markDraftAnswerSynced(
  auditId: string,
  questionId: string,
  serverVersion: number
): Promise<void> {
  const db = await getDb();
  const draft = await db.get('auditDrafts', auditId);
  const answer = draft?.answers[questionId];
  if (!draft || !answer) return;

  draft.answers[questionId] = {
    ...answer,
    syncState: 'synced',
    serverVersion,
  };
  draft.lastSavedLocally = new Date().toISOString();
  await db.put('auditDrafts', draft);
}

/**
 * Clears local draft when audit is submitted.
 */
export async function clearDraftLocally(auditId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('auditDrafts', auditId);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DRAFT_SUMMARY_PREFIX + auditId);
      window.dispatchEvent(new Event('qas-draft-changed'));
    }
  } catch (err) {
    console.warn('Gagal menghapus draft lokal dari IndexedDB:', err);
  }
}

/**
 * Clears all local audit drafts from IndexedDB.
 */
export async function clearAllDraftsLocally(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('auditDrafts');
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT_SUMMARY_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new Event('qas-draft-changed'));
    }
  } catch (err) {
    console.warn('Gagal membersihkan seluruh draft lokal dari IndexedDB:', err);
  }
}

/**
 * Returns the count of pending offline drafts and answers in IndexedDB.
 */
export async function getPendingSyncCount(): Promise<{ totalPendingDrafts: number; totalPendingAnswers: number }> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return { totalPendingDrafts: 0, totalPendingAnswers: 0 };
  }
  try {
    const db = await getDb();
    const allDrafts = await db.getAll('auditDrafts');
    let totalPendingAnswers = 0;
    let totalPendingDrafts = 0;

    for (const draft of allDrafts) {
      let draftHasPending = false;
      for (const ans of Object.values(draft.answers || {})) {
        if (ans.syncState !== 'synced') {
          totalPendingAnswers++;
          draftHasPending = true;
        }
      }
      if (draftHasPending) {
        totalPendingDrafts++;
      }
    }
    return { totalPendingDrafts, totalPendingAnswers };
  } catch (err) {
    console.warn('Gagal membaca antrean pending sync IndexedDB:', err);
    return { totalPendingDrafts: 0, totalPendingAnswers: 0 };
  }
}

