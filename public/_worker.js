const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://qas-audit-staging.ari-imam.workers.dev; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'X-XSS-Protection': '0',
};

function applySecurityHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Forward API requests to the active staging backend worker with security headers
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, 'https://qas-audit-staging.ari-imam.workers.dev');
      const apiResponse = await fetch(new Request(targetUrl, request));
      return applySecurityHeaders(apiResponse);
    }

    // 2. Serve static assets from Cloudflare Pages
    let res = await env.ASSETS.fetch(request);

    // 3. Single Page Application (SPA) fallback for client-side routing on page reload
    if (res.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      res = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
    }

    return applySecurityHeaders(res);
  }
};
