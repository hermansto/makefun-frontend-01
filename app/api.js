// make.fun's public API: HTTPS GET, open CORS, no key. One cache for the whole session:
// a fresh answer is reused for 60 s, two views asking at once share one request, and a
// refresh can drop the entry. Every view goes through request(), so the header can count
// what it really spent.

const API = 'https://make.fun/api';
const TTL_MS = 5_000;
const REVALIDATE_MIN_MS = 4_000;

/** path -> { at, data, etag }; path -> Promise while in flight; last revalidation per path. */
const cache = new Map();
const inFlight = new Map();
const revalidating = new Map();

/** What this view has cost so far: network calls, cache hits, 304 revalidations. */
export const stats = { requests: 0, cached: 0, revalidated: 0, lastAt: 0 };

/** Drop one path (or all of them) so the next read goes to the network. */
export function bust(path) {
  if (path) cache.delete(path);
  else cache.clear();
}

/** Revalidate a stale answer in the background: the view keeps the bytes it has.
    The browser's own HTTP cache does the conditional request (cache: 'no-cache'), so no
    custom header is sent and no preflight is needed; a 304 shows up as a zero-transfer
    resource timing entry. */
function revalidate(path) {
  const hit = cache.get(path);
  if (!hit) return;
  const last = revalidating.get(path) || 0;
  if (Date.now() - last < REVALIDATE_MIN_MS) return;
  revalidating.set(path, Date.now());
  const url = API + path;
  fetch(url, { cache: 'no-cache', headers: { accept: 'application/json' } })
    .then(async (res) => {
      if (!res.ok) return;
      const entries = performance.getEntriesByName(url).slice(-1)[0];
      const revalidated = entries && entries.transferSize === 0;
      const data = await res.json().catch(() => hit.data);
      cache.set(url.replace(API, ''), { at: Date.now(), data, etag: res.headers.get('etag') || hit.etag });
      if (revalidated) stats.revalidated += 1;
      stats.lastAt = Date.now();
    })
    .catch(() => {});
}

function request(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) {
    stats.cached += 1;
    stats.lastAt = hit.at;
    return Promise.resolve(hit.data);
  }
  if (hit) {
    // Stale: paint at once from memory, then revalidate with If-None-Match.
    stats.cached += 1;
    revalidate(path);
    return Promise.resolve(hit.data);
  }
  const pending = inFlight.get(path);
  if (pending) return pending;
  stats.requests += 1;
  const headers = { accept: 'application/json' };
  if (hit && hit.etag) headers['if-none-match'] = hit.etag;
  const call = fetch(API + path, { headers })
    .then(async (res) => {
      if (res.status === 304 && hit) {
        stats.revalidated += 1;
        stats.lastAt = Date.now();
        cache.set(path, { at: Date.now(), data: hit.data, etag: hit.etag });
        inFlight.delete(path);
        return hit.data;
      }
      if (!res.ok) throw new Error(`make.fun answered ${res.status}`);
      const data = await res.json();
      cache.set(path, { at: Date.now(), data, etag: res.headers.get('etag') || undefined });
      stats.lastAt = Date.now();
      inFlight.delete(path);
      return data;
    })
    .catch((err) => {
      inFlight.delete(path);
      throw err;
    });
  inFlight.set(path, call);
  return call;
}

/** The open and recently ended board, one request. */
export const board = () => request('/competitions?status=open&activity=times');
/** One bounty: rewards, dates, rules, description. */
export const bounty = (slug) => request(`/competitions/${encodeURIComponent(slug)}`);
/** One bounty's ranked entries. */
export const leaderboard = (slug) => request(`/competitions/${encodeURIComponent(slug)}/leaderboard`);
/** One account's public record and entries. */
export const profile = (handle) => request(`/profiles/${encodeURIComponent(handle)}`);
