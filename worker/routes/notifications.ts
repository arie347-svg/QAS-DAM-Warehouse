import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { Env, Variables } from '../types';

interface AuditNotificationSource {
  id: string;
  audit_type: 'SELF' | 'OFFICIAL';
  status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
  depot_id: string;
  depot_name: string;
  assigned_user_id: string;
  due_at: string;
  submitted_at: string | null;
}

export const notificationRouter = new Hono<{ Bindings: Env; Variables: Variables }>();
const notificationUpdateSchema = z.object({ read: z.boolean() }).strict();

async function materializeNotifications(db: D1Database, user: NonNullable<Variables['user']>) {
  const globalAccess = user.scopes.some((scope) => scope.role === 'ADMIN' || scope.role === 'AUDITOR_QAS');
  const depotIds = new Set(user.scopes.map((scope) => scope.depotId).filter(Boolean));
  const result = await db.prepare(`
    SELECT a.id, a.audit_type, a.status, a.depot_id, d.name AS depot_name,
      a.assigned_user_id,
      CASE WHEN a.audit_type = 'SELF' THEN c.self_due_at ELSE c.official_due_at END AS due_at,
      a.submitted_at
    FROM audits a
    JOIN audit_cycles c ON c.id = a.cycle_id
    JOIN depots d ON d.id = a.depot_id
    WHERE c.status = 'OPEN' AND a.status <> 'VOID'
  `).all<AuditNotificationSource>();

  const now = Date.now();
  for (const audit of result.results || []) {
    if (!globalAccess && !depotIds.has(audit.depot_id)) continue;

    let type: 'DEADLINE' | 'COMPLETED' | null = null;
    let title = '';
    let message = '';
    let dedupeKey = '';
    if (audit.status === 'SUBMITTED') {
      type = 'COMPLETED';
      title = `${audit.audit_type === 'SELF' ? 'Self Audit' : 'Audit Resmi'} selesai`;
      message = `${audit.depot_name} telah menyelesaikan audit.`;
      dedupeKey = `${audit.id}:submitted:${audit.submitted_at || 'done'}`;
    } else {
      const days = Math.ceil((new Date(audit.due_at).getTime() - now) / 86_400_000);
      if (days <= 3) {
        type = 'DEADLINE';
        title = days < 0 ? 'Audit melewati batas waktu' : 'Batas waktu audit mendekat';
        message = `${audit.depot_name}: ${days < 0 ? `terlambat ${Math.abs(days)} hari` : `${Math.max(days, 0)} hari tersisa`}.`;
        dedupeKey = `${audit.id}:deadline:${new Date(audit.due_at).toISOString().slice(0, 10)}`;
      }
    }

    if (!type) continue;
    await db.prepare(`
      INSERT OR IGNORE INTO notifications
        (id, user_id, audit_id, type, title, message, dedupe_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `ntf-${crypto.randomUUID()}`,
      user.id,
      audit.id,
      type,
      title,
      message,
      dedupeKey,
      new Date().toISOString()
    ).run();
  }
}

notificationRouter.get('/notifications', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  if (!db || !user) return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.' } }, 500);

  await materializeNotifications(db, user);
  const result = await db.prepare(`
    SELECT id, audit_id, type, title, message, read_at, created_at
    FROM notifications
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(user.id).all();
  return c.json({ success: true, data: result.results || [] });
});

notificationRouter.patch('/notifications/:id', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  if (!db || !user) return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.' } }, 500);
  const parsed = notificationUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Status baca tidak valid.' } }, 400);
  }
  const updated = await db.prepare(`
    UPDATE notifications SET read_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(parsed.data.read ? new Date().toISOString() : null, c.req.param('id'), user.id).run();
  if ((updated.meta?.changes || 0) === 0) {
    return c.json({ success: false, error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notifikasi tidak ditemukan.' } }, 404);
  }
  return c.json({ success: true });
});

notificationRouter.delete('/notifications/:id', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  if (!db || !user) return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.' } }, 500);
  const deleted = await db.prepare(`
    UPDATE notifications SET deleted_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), c.req.param('id'), user.id).run();
  if ((deleted.meta?.changes || 0) === 0) {
    return c.json({ success: false, error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notifikasi tidak ditemukan.' } }, 404);
  }
  return c.json({ success: true });
});
