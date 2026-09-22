/**
 * Redirects an alternate hostname to the canonical one.
 *
 * `www.convolab.us` and `convolab.us` both resolve to this service once both
 * Cloud Run domain mappings exist. Serving the app on two hostnames would split
 * the session cookie and fall foul of the CORS allowlist, which is a single
 * origin (`FRONTEND_URL`, see server.ts). So the alternate host is not served:
 * it is redirected to the canonical origin before the browser makes any API
 * call, which keeps one origin for cookies and CORS while still letting someone
 * who types "www" reach the site.
 *
 * A registrar-level redirect was considered first and rejected: Namecheap's URL
 * Redirect Record does not present a certificate for the redirected hostname,
 * so `https://www.convolab.us` would still fail its TLS handshake, which is the
 * exact symptom being fixed.
 */

/** Hostname the app should be served on, derived from FRONTEND_URL. */
export function canonicalHost(frontendUrl: string | undefined): string | null {
  if (!frontendUrl) return null;
  try {
    return new URL(frontendUrl).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The URL to redirect to, or null to serve the request as-is.
 *
 * Returns null unless the request's host is a `www.` form of the canonical
 * host. Deliberately narrow: an unrecognised host is served rather than
 * redirected, so a preview URL, a health check hitting the container directly,
 * or localhost is never bounced somewhere it cannot reach.
 */
export function canonicalRedirectTarget(
  requestHost: string | undefined,
  requestUrl: string,
  frontendUrl: string | undefined
): string | null {
  const canonical = canonicalHost(frontendUrl);
  if (!canonical || !requestHost) return null;

  // Compare without the port: the host header carries one, FRONTEND_URL may not.
  const strip = (h: string) => h.toLowerCase().split(':')[0];
  const from = strip(requestHost);
  const to = strip(canonical);
  if (from !== `www.${to}`) return null;

  return `https://${canonical}${requestUrl}`;
}
