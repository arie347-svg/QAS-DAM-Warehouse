import { MiddlewareHandler } from 'hono';
import { Env, Variables } from '../types';

export const requestIdMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const incomingId = c.req.header('x-request-id');
  const requestId = incomingId || crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('X-Request-Id', requestId);
};
