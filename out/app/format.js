// Small helpers that turn API values into the page's words.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe for an HTML string. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Dollars: 1234 -> '$1,234', '0.50' -> '$0.50', null -> '$0'. */
export function money(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$0';
  const cents = Math.round(n * 100) / 100;
  return cents.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(cents) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** A large amount for a tile: '$12.4k' past a thousand. */
export function moneyShort(value) {
  const n = Number(value ?? 0);
  if (n >= 1000) return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return money(n);
}

/** A count with thousands separators. */
export function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

/** Time until an ISO deadline: '3d 4h', '5h 12m', '42m', 'ended'. */
export function timeLeft(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

/** How close a deadline is: hot, warm or calm. */
export function urgency(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'over';
  if (ms < 6 * 3_600_000) return 'hot';
  if (ms < 48 * 3_600_000) return 'warm';
  return 'calm';
}

/** A date in UTC: '17 Nov 2026, 12:30 UTC'. */
export function dateUTC(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }) + ' UTC';
}

/** A short UTC date: '17 Nov 12:30 UTC'. */
export function dateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }) + ' UTC';
}

/** A 0..1 rate as a percentage with one decimal. */
export function percent(rate) {
  const n = Number(rate);
  return Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '—';
}

/** An entry's judge record: '11–0', or '—'. */
export function record(judge) {
  if (!judge || !judge.matches) return '—';
  return `${judge.wins}–${judge.losses}`;
}

/** The win rate a judge record works out to, or null. */
export function winRate(judge) {
  if (!judge || !judge.matches) return null;
  return judge.wins / judge.matches;
}

/** The first paragraph of a long text, trimmed. */
export function lede(text, max = 150) {
  const first = String(text ?? '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  return first.length <= max ? first : first.slice(0, max - 1).replace(/[,;:\s]\S*$/, '') + '…';
}
