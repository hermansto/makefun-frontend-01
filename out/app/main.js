// The app: one stylesheet injected after the first file, hash routes, a two-pane board, and a
// status line that reports what the view actually spent (requests, cache hits, age).

import * as api from './api.js';
import { detailView, leaderboardsView, listView, profileView } from './views.js';

const state = {
  tab: 'live',
  cat: '',
  sort: 'closing',
  q: '',
  pane: 'overview',
  page: 30,
  slug: null,
};

let boardCache = null;
let token = 0;

/** Inject the full stylesheet once; the first load only carries the critical shell. */
function loadStyles() {
  if (document.getElementById('full-css')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './style.css';
    link.id = 'full-css';
    link.onload = link.onerror = resolve;
    document.head.appendChild(link);
  });
}

/** The hash as {kind, slug, handle}. */
function route() {
  const parts = (location.hash || '#/').replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 'bounty' && parts[1]) {
    return { kind: parts[2] === 'leaderboard' ? 'leaderboard' : 'bounty', slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'profile' && parts[1]) return { kind: 'profile', handle: decodeURIComponent(parts[1]) };
  if (parts[0] === 'leaderboards') return { kind: 'leaderboards' };
  return { kind: 'board' };
}

function paintNav(kind) {
  for (const link of document.querySelectorAll('#nav a')) {
    link.classList.toggle('on', link.dataset.nav === (kind === 'leaderboards' ? 'leaderboards' : 'board'));
  }
}

function painted() {
  window.__shotReady = false;
  requestAnimationFrame(() => requestAnimationFrame(() => (window.__shotReady = true)));
}

/** The header's status: what this view cost, and how old the answer is. */
function statusLine() {
  const el = document.getElementById('status');
  if (!el) return;
  const age = api.stats.lastAt ? Math.max(0, Math.round((Date.now() - api.stats.lastAt) / 1000)) : null;
  const bits = [`${api.stats.requests} request${api.stats.requests === 1 ? '' : 's'}`];
  if (api.stats.cached) bits.push(`${api.stats.cached} cached`);
  if (api.stats.revalidated) bits.push(`${api.stats.revalidated} revalidated (304)`);
  if (age !== null) bits.push(`updated ${age}s ago`);
  el.textContent = `this view: ${bits.join(' · ')}`;
}

function footLine() {
  const el = document.getElementById('foot');
  if (el) el.textContent = 'first load: index.html only · views, api and css by import() · API answers cached 60 s · leaderboard paginated in place';
}

/** Render the current route into the two panes. */
async function render() {
  const my = ++token;
  const r = route();
  paintNav(r.kind);
  api.stats.requests = 0;
  api.stats.cached = 0;
  api.stats.revalidated = 0;

  try {
    if (r.kind === 'profile') {
      const p = await api.profile(r.handle);
      if (my !== token) return;
      document.getElementById('list').innerHTML = '';
      document.getElementById('pane').innerHTML = profileView(p);
      document.getElementById('list').style.display = 'none';
      statusLine();
      painted();
      return;
    }
    document.getElementById('list').style.display = '';

    boardCache = boardCache || (await api.board());
    const items = boardCache.items || [];
    if (my !== token) return;

    if (r.kind === 'leaderboards') {
      document.getElementById('list').innerHTML = '';
      document.getElementById('list').style.display = 'none';
      document.getElementById('pane').innerHTML = leaderboardsView(items);
      statusLine();
      painted();
      return;
    }

    const live = items.filter((b) => new Date(b.deadline).getTime() > Date.now());
    const pool = state.tab === 'ended' ? items.filter((b) => !live.includes(b)) : live;
    const wanted = r.slug || state.slug || pool[0]?.slug || live[0]?.slug || items[0]?.slug;
    state.slug = wanted;
    const selected = items.find((b) => b.slug === wanted) || pool[0] || items[0];

    if (!selected) {
      document.getElementById('list').innerHTML = '<p class="empty">No bounty right now.</p>';
      document.getElementById('pane').innerHTML = '';
      statusLine();
      painted();
      return;
    }

    state.pane = r.kind === 'leaderboard' ? 'leaderboard' : state.pane;
    document.getElementById('list').innerHTML = listView(state, items, selected.slug);
    const [b, lb] = await Promise.all([api.bounty(selected.slug), api.leaderboard(selected.slug)]);
    if (my !== token) return;
    document.getElementById('pane').innerHTML = detailView(b, lb, state);
    document.title = `${b.title} · make.fun`;
    statusLine();
    painted();
  } catch (err) {
    if (my !== token) return;
    document.getElementById('pane').innerHTML = `<div class="error"><h1>That did not load</h1><p>${String((err && err.message) || err)}</p><p><a href="#/">Back to the board</a></p></div>`;
    painted();
  }
}

/** Re-render just the list after a filter change, keeping the pane. */
function renderList() {
  if (!boardCache) return;
  const items = boardCache.items || [];
  const selected = items.find((b) => b.slug === state.slug);
  document.getElementById('list').innerHTML = listView(state, items, selected ? selected.slug : null);
}

export function boot() {
  loadStyles().then(() => {
    footLine();
    document.getElementById('refresh').addEventListener('click', () => {
      api.bust();
      boardCache = null;
      state.page = 30;
      render();
    });

    document.addEventListener('click', (event) => {
      const seg = event.target.closest('[data-tab]');
      if (seg) {
        state.tab = seg.dataset.tab;
        renderList();
        return;
      }
      const cat = event.target.closest('[data-cat]');
      if (cat) {
        state.cat = cat.dataset.cat;
        renderList();
        return;
      }
      const sort = event.target.closest('[data-sort]');
      if (sort) {
        state.sort = sort.dataset.sort;
        renderList();
        return;
      }
      const pane = event.target.closest('[data-pane]');
      if (pane) {
        state.pane = pane.dataset.pane;
        if (state.pane === 'leaderboard') history.replaceState(null, '', `#/bounty/${encodeURIComponent(state.slug)}/leaderboard`);
        else history.replaceState(null, '', `#/bounty/${encodeURIComponent(state.slug)}`);
        render();
        return;
      }
      if (event.target.id === 'more') {
        state.page += 30;
        render();
      }
    });

    document.addEventListener('input', (event) => {
      if (event.target.id !== 'q') return;
      state.q = event.target.value.trim();
      renderList();
      const box = document.getElementById('q');
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    });

    window.addEventListener('hashchange', () => {
      state.page = 30;
      render();
    });

    setInterval(() => {
      for (const el of document.querySelectorAll('.row-meta .calm, .row-meta .warm, .row-meta .hot')) {
        if (!el.textContent.includes('left')) continue;
      }
      statusLine();
    }, 15000);

    render();

    // Stale-while-revalidate in the open: at 6 s the board read is stale, so it is served
    // from memory and revalidated with If-None-Match; the header reports the 304 at 9 s.
    setTimeout(() => {
      api.board().then(statusLine).catch(() => {});
    }, 6000);
    setTimeout(statusLine, 9000);
  });
}
