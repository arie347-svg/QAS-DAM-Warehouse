import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { Env, Variables } from '../types';
import { requireAuth, requireMasterManager } from '../middleware/auth';
import {
  TemplateError,
  listTemplates,
  getTemplateVersionTree,
  cloneTemplateVersion,
  createSection,
  updateSection,
  deleteSection,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createOption,
  updateOption,
  deleteOption,
  validateAndSimulateVersion,
  publishTemplateVersion,
  retireTemplateVersion,
} from '../services/templateService';

export const templateRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes in this router require authentication and master manager authority
templateRouter.use('/admin/*', requireAuth, requireMasterManager);

// Helper for error handling in route handlers
async function handleAction<T>(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  action: (db: D1Database, userId: string, requestId: string) => Promise<T>
) {
  const requestId = c.get('requestId') || 'unknown';
  const user = c.get('user');
  const db = c.env.DB;

  if (!db) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Koneksi D1 tidak tersedia.', requestId },
      },
      500
    );
  }

  try {
    const data = await action(db, user?.id || 'system', requestId);
    return c.json({ success: true, data, requestId });
  } catch (err: unknown) {
    if (err instanceof TemplateError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message, requestId },
        },
        err.statusCode as ContentfulStatusCode
      );
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Data yang dikirim tidak valid.',
            details: err.flatten().fieldErrors,
            requestId,
          },
        },
        400
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[TEMPLATE_ROUTE_ERROR] ${message}`);
    return c.json(
      {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message, requestId },
      },
      500
    );
  }
}

// 1. Templates listing
templateRouter.get('/admin/templates', async (c) => {
  return handleAction(c, async (db) => {
    return await listTemplates(db);
  });
});

// 2. Template Version Tree Detail
templateRouter.get('/admin/template-versions/:id', async (c) => {
  const versionId = c.req.param('id');
  return handleAction(c, async (db) => {
    return await getTemplateVersionTree(db, versionId);
  });
});

// 3. Clone Version as New Draft
templateRouter.post('/admin/template-versions/:id/clone', async (c) => {
  const versionId = c.req.param('id');
  return handleAction(c, async (db, userId, reqId) => {
    return await cloneTemplateVersion(db, versionId, userId, reqId);
  });
});

// 4. Sections CRUD
templateRouter.post('/admin/template-versions/:id/sections', async (c) => {
  const versionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await createSection(db, versionId, body, userId, reqId);
  });
});

templateRouter.patch('/admin/sections/:id', async (c) => {
  const sectionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await updateSection(db, sectionId, body, userId, reqId);
  });
});

templateRouter.delete('/admin/sections/:id', async (c) => {
  const sectionId = c.req.param('id');
  return handleAction(c, async (db, userId, reqId) => {
    return await deleteSection(db, sectionId, userId, reqId);
  });
});

// 5. Questions CRUD
templateRouter.post('/admin/sections/:id/questions', async (c) => {
  const sectionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await createQuestion(db, sectionId, body, userId, reqId);
  });
});

templateRouter.patch('/admin/questions/:id', async (c) => {
  const questionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await updateQuestion(db, questionId, body, userId, reqId);
  });
});

templateRouter.delete('/admin/questions/:id', async (c) => {
  const questionId = c.req.param('id');
  return handleAction(c, async (db, userId, reqId) => {
    return await deleteQuestion(db, questionId, userId, reqId);
  });
});

// 6. Options CRUD
templateRouter.post('/admin/questions/:id/options', async (c) => {
  const questionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await createOption(db, questionId, body, userId, reqId);
  });
});

templateRouter.patch('/admin/options/:id', async (c) => {
  const optionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  return handleAction(c, async (db, userId, reqId) => {
    return await updateOption(db, optionId, body, userId, reqId);
  });
});

templateRouter.delete('/admin/options/:id', async (c) => {
  const optionId = c.req.param('id');
  return handleAction(c, async (db, userId, reqId) => {
    return await deleteOption(db, optionId, userId, reqId);
  });
});

// 7. Validate & Simulation
templateRouter.post('/admin/template-versions/:id/validate', async (c) => {
  const versionId = c.req.param('id');
  return handleAction(c, async (db) => {
    return await validateAndSimulateVersion(db, versionId);
  });
});

// 8. Publish Version (Immutable)
templateRouter.post('/admin/template-versions/:id/publish', async (c) => {
  const versionId = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as { scoring_config_json?: string };
  return handleAction(c, async (db, userId, reqId) => {
    return await publishTemplateVersion(db, versionId, userId, body.scoring_config_json, reqId);
  });
});

// 9. Retire Version
templateRouter.post('/admin/template-versions/:id/retire', async (c) => {
  const versionId = c.req.param('id');
  return handleAction(c, async (db, userId, reqId) => {
    return await retireTemplateVersion(db, versionId, userId, reqId);
  });
});
