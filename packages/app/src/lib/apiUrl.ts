// Where the API and the public website live, relative to wherever this bundle
// is running. On the web both are the page's own origin (the Vite proxy in dev,
// the same Cloud Run service in production), so the defaults are empty and
// every path stays relative. Inside the Capacitor app the page is served from
// capacitor://localhost or https://localhost, so the build sets:
//   VITE_API_URL     the API origin, e.g. https://convolab.us
//   VITE_PUBLIC_URL  the website origin used in links people share (invites)
const API_BASE = trimTrailingSlash(import.meta.env.VITE_API_URL ?? '');
const PUBLIC_BASE = trimTrailingSlash(import.meta.env.VITE_PUBLIC_URL ?? '');

export function trimTrailingSlash(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

// `path` starts with '/'. An empty base leaves it relative to the page.
export function joinBase(base: string, path: string): string {
  return `${base}${path}`;
}

// http(s) origin -> ws(s) URL for the same host.
export function toWebSocketUrl(origin: string, path: string): string {
  return `${origin.replace(/^http/, 'ws')}${path}`;
}

export function apiUrl(path: string): string {
  return joinBase(API_BASE, path);
}

export function wsUrl(path: string): string {
  return toWebSocketUrl(API_BASE || window.location.origin, path);
}

export function publicUrl(path: string): string {
  return joinBase(PUBLIC_BASE || window.location.origin, path);
}
