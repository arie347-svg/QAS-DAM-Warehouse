import { ErrorHandler } from 'hono';
import { Env, Variables } from '../types';

export const errorHandler: ErrorHandler<{ Bindings: Env; Variables: Variables }> = (err, c) => {
  const requestId = c.get('requestId') || 'unknown';
  console.error(`[ERROR] [${requestId}] ${err.name}: ${err.message}`);
  
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Terjadi kesalahan pada server. Silakan coba kembali nanti.',
        requestId,
      },
    },
    500
  );
};
