import * as jose from 'jose';
import { Env } from '../types';

let cachedJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
let cachedTeamDomain: string | null = null;

export interface VerifiedJwtPayload {
  email: string;
  sub: string;
  [key: string]: unknown;
}

/**
 * Validates Cloudflare Access JWT Assertion header.
 * Staging & Production uses Cloudflare Zero Trust Remote JWKS.
 * Local development & test environments can use JWT_DEV_SECRET.
 */
export async function verifyAccessJwt(
  token: string,
  env: Env
): Promise<VerifiedJwtPayload> {
  const configuredTeamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  const teamDomain = configuredTeamDomain
    ?.replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .replace(/\.cloudflareaccess\.com$/i, '');

  // 1. Production / Staging Cloudflare Access Validation
  if (teamDomain && audience) {
    if (!cachedJWKS || cachedTeamDomain !== teamDomain) {
      const certsUrl = new URL(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
      cachedJWKS = jose.createRemoteJWKSet(certsUrl);
      cachedTeamDomain = teamDomain;
    }

    const { payload } = await jose.jwtVerify(token, cachedJWKS, {
      issuer: `https://${teamDomain}.cloudflareaccess.com`,
      audience: audience,
    });

    const identity = (payload as Record<string, unknown>).identity as Record<string, unknown> | undefined;
    const email = (payload.email || identity?.email) as string | undefined;
    if (!email) {
      throw new Error('JWT Cloudflare Access tidak memiliki claim email yang valid.');
    }

    return {
      email: email.toLowerCase(),
      sub: payload.sub || email,
      ...payload,
    };
  }

  // 2. Test/local validation only. Production and staging must never fall back
  // to an application HMAC secret or a built-in default key.
  const devSecret = env.JWT_DEV_SECRET;
  if (env.ENVIRONMENT !== 'production' && env.ENVIRONMENT !== 'staging' && devSecret) {
    const secretKey = new TextEncoder().encode(devSecret);
    const { payload } = await jose.jwtVerify(token, secretKey);

    const email = payload.email as string | undefined;
    if (!email) {
      throw new Error('JWT token tidak memiliki claim email yang valid.');
    }

    return {
      email: email.toLowerCase(),
      sub: payload.sub || email,
      ...payload,
    };
  }

  throw new Error('Konfigurasi Cloudflare Access (ACCESS_TEAM_DOMAIN / ACCESS_AUD) belum diatur.');
}

/**
 * Helper utility for local development and test suites to generate signed JWTs.
 */
export async function createTestJwt(
  payload: { email: string; sub?: string; exp?: number | string },
  secret: string = 'test-secret-must-be-at-least-32-chars-long!'
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  const jwt = new jose.SignJWT({
    email: payload.email,
    sub: payload.sub || payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt();

  if (payload.exp) {
    jwt.setExpirationTime(payload.exp);
  } else {
    jwt.setExpirationTime('2h');
  }

  return await jwt.sign(secretKey);
}
