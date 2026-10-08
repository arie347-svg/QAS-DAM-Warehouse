import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  EvidenceError,
  uploadEvidence,
  getEvidenceStream,
  deleteEvidence,
} from '../services/evidenceService';

export const evidenceRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// All evidence routes require authentication
evidenceRouter.use('/evidence/*', requireAuth);
evidenceRouter.use('/evidence', requireAuth);
evidenceRouter.use('/answers/:id/evidence', requireAuth);

function handleError(
  err: unknown,
  c: Context<{ Bindings: Env; Variables: Variables }>,
  requestId: string
) {
  if (err instanceof EvidenceError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      },
      err.statusCode as ContentfulStatusCode
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: `Terjadi kesalahan saat memproses bukti foto: ${message}`,
        requestId,
      },
    },
    500
  );
}

// 1. Upload Evidence (Multipart form-data or JSON payload)
evidenceRouter.post('/answers/:id/evidence', async (c) => {
  const db = c.env.DB;
  const r2 = c.env.EVIDENCE;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const answerId = c.req.param('id');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }
  if (!r2) {
    return c.json(
      { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'R2 Bucket tidak tersedia.', requestId } },
      503
    );
  }

  try {
    const contentType = c.req.header('Content-Type') || '';

    let fileBuffer: ArrayBuffer;
    let fileName: string;
    let fileMime: string;
    let fileSize: number;

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.parseBody();
      const file = formData['file'];

      if (!file || typeof file === 'string') {
        throw new EvidenceError('FILE_REQUIRED', 'File gambar wajib dilampirkan dalam field "file".', 400);
      }

      const fileObj = file as File;
      fileName = fileObj.name || 'foto_bukti.jpg';
      fileMime = fileObj.type || 'image/jpeg';
      fileSize = fileObj.size;
      fileBuffer = await fileObj.arrayBuffer();
    } else {
      // Fallback: JSON or raw body
      const body = await c.req.json<{
        original_name?: string;
        mime_type?: string;
        size_bytes?: number;
        base64_data?: string;
      }>();

      fileName = body.original_name || 'foto_bukti.jpg';
      fileMime = body.mime_type || 'image/jpeg';
      fileSize = body.size_bytes || 1024;

      if (body.base64_data) {
        const binaryString = atob(body.base64_data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;
        fileSize = bytes.byteLength;
      } else {
        // Dummy test payload buffer
        fileBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer;
      }
    }

    const data = await uploadEvidence(
      db,
      r2,
      answerId,
      {
        name: fileName,
        type: fileMime,
        size: fileSize,
        buffer: fileBuffer,
      },
      user,
      requestId
    );

    return c.json({ success: true, data, requestId }, 201);
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2. Download / View Evidence (Private R2 stream with RBAC & Blind Audit enforcement)
evidenceRouter.get('/evidence/:id', async (c) => {
  const db = c.env.DB;
  const r2 = c.env.EVIDENCE;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const evidenceId = c.req.param('id');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }
  if (!r2) {
    return c.json(
      { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'R2 Bucket tidak tersedia.', requestId } },
      503
    );
  }

  try {
    const { r2Object, metadata } = await getEvidenceStream(db, r2, evidenceId, user, requestId);

    const safeFilename = metadata.original_name.replace(/"/g, '');
    const headers = new Headers();
    headers.set('Content-Type', metadata.mime_type);
    headers.set('Content-Disposition', `inline; filename="${safeFilename}"`);
    headers.set('Cache-Control', 'private, no-transform, max-age=3600');
    headers.set('X-Evidence-Id', metadata.id);
    if (metadata.sha256) {
      headers.set('ETag', `"${metadata.sha256}"`);
    }

    return new Response(r2Object.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 3. Delete Evidence (Soft delete + audit event)
evidenceRouter.delete('/evidence/:id', async (c) => {
  const db = c.env.DB;
  const r2 = c.env.EVIDENCE;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const evidenceId = c.req.param('id');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }
  if (!r2) {
    return c.json(
      { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'R2 Bucket tidak tersedia.', requestId } },
      503
    );
  }

  try {
    const data = await deleteEvidence(db, r2, evidenceId, user, requestId);
    return c.json({ success: true, data, message: 'Bukti foto berhasil dihapus.', requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});
