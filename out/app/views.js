// The surfaces, each a function from API data to HTML: the bounty list, the detail pane with
// its rewards and dates, the leaderboard, a profile, and the leaderboard index.

import { count, dateShort, dateUTC, esc, lede, money, moneyShort, percent, record, timeLeft, urgency, winRate } from './format.js';

const potOf = (b) => Number(b.potUsd ?? b.rewardAmount ?? 0);
const feeOf = (b) => Number(b.entryFeeUsd ?? 0);
const isOpen = (b, now = Date.now()) => new Date(b.deadline).getTime() > now;

/** The reward table rows with each place's share of the entry fees and what it pays now. */
export function rewardRows(b) {
  const rewards = b.rewards || {};
  const places = Object.keys(rewards).map(Number).sort((x, y) => x - y);
  const base = places.reduce((sum, p) => sum + Number(rewards[String(p)] || 0), 0);
  const extra = Math.max(0, potOf(b) - base);
  const rows = [];
  for (const place of places) {
    const value = Number(rewards[String(place)] || 0);
    const share = base > 0 ? (extra * value) / base : 0;
    const prev = rows[rows.length - 1];
    if (prev && prev.value === value && place === prev.to + 1) {
      prev.to = place;
      prev.share = share;
      prev.pays = value + share;
    } else {
      rows.push({ from: place, to: place, value, share, pays: value + share });
    }
  }
  return { rows, total: base + extra, extra };
}

/** The list column: tabs for live and ended, category chips, a sort, a filter, and the rows. */
export function listView(state, items, selectedSlug) {
  const now = Date.now();
  const live = items.filter((b) => isOpen(b, now));
  const ended = items.filter((b) => !isOpen(b, now));
  const pool = state.tab === 'ended' ? ended : live;
  const categories = [...new Set(pool.map((b) => b.category).filter(Boolean))].sort();
  let rows = pool.filter((b) => (state.cat ? b.category === state.cat : true));
  if (state.q) {
    const q = state.q.toLowerCase();
    rows = rows.filter((b) => (b.title || '').toLowerCase().includes(q) || (b.summary || '').toLowerCase().includes(q));
  }
  const sorters = {
    closing: (a, b) => new Date(a.deadline) - new Date(b.deadline),
    pot: (a, b) => potOf(b) - potOf(a),
    entries: (a, b) => (b.submissionCount || 0) - (a.submissionCount || 0),
  };
  rows = rows.slice().sort(sorters[state.sort] || sorters.closing);

  const chip = (label, on, data) =>
    `<button class="chip${on ? ' on' : ''}" type="button" ${data}>${esc(label)}</button>`;

  const list = rows
    .map((b) => {
      const active = b.slug === selectedSlug;
      const left = timeLeft(b.deadline);
      return `<a class="row${active ? ' on' : ''}" href="#/bounty/${encodeURIComponent(b.slug)}" data-slug="${esc(b.slug)}"${active ? ' aria-current="true"' : ''}>
        <span class="row-title">${esc(b.title)}</span>
        <span class="row-meta"><b>${money(potOf(b))}</b> pot · ${feeOf(b) > 0 ? money(feeOf(b)) + ' fee' : 'free'} · <span class="${urgency(b.deadline)}">${left === 'ended' ? 'ended' : left + ' left'}</span></span>
        <span class="row-entries">${count(b.submissionCount)} entries</span>
      </a>`;
    })
    .join('');

  return `<div class="filters">
      <div class="seg"><button type="button" data-tab="live" class="${state.tab === 'live' ? 'on' : ''}">Live ${live.length}</button><button type="button" data-tab="ended" class="${state.tab === 'ended' ? 'on' : ''}">Ended ${ended.length}</button></div>
      <div class="sumline"><b>${count(live.length)}</b> open · <b>${moneyShort(live.reduce((s, b) => s + potOf(b), 0))}</b> in pots · next deadline <b>${live.length ? timeLeft(Math.min(...live.map((b) => new Date(b.deadline).getTime()))) : '—'}</b></div>
      <div class="chips">
        ${chip('All', !state.cat, 'data-cat=""')}
        ${categories.map((c) => chip(c, state.cat === c, `data-cat="${esc(c)}"`)).join('')}
      </div>
      <div class="chips sorts">
        ${chip('Closing soon', state.sort === 'closing', 'data-sort="closing"')}
        ${chip('Biggest pot', state.sort === 'pot', 'data-sort="pot"')}
        ${chip('Most entries', state.sort === 'entries', 'data-sort="entries"')}
      </div>
      <input id="q" type="search" placeholder="Filter bounties by name" value="${esc(state.q)}" aria-label="Filter bounties by name">
    </div>
    <div class="rows">${list || '<p class="empty">No bounty matches this filter.</p>'}</div>`;
}

/** The detail pane: header, four tiles, then either the overview or the leaderboard tab. */
export function detailView(b, lb, state) {
  const { rows } = rewardRows(b);
  const top = rows[0]?.pays || 1;
  const rewards = rows
    .map((r) => `<tr>
        <td class="place">${r.from === r.to ? r.from : `${r.from}–${r.to}`}</td>
        <td class="num">${money(r.value)}</td>
        <td class="num muted">+${money(r.share)}</td>
        <td class="num strong">${money(r.pays)} <span class="bar"><i style="width:${Math.round((r.pays / top) * 100)}%"></i></span></td>
      </tr>`)
    .join('');

  const entries = (lb?.entries || []).slice(0, state.page);
  const lbRows = entries
    .map((e) => `<tr>
        <td class="place">${e.rank}</td>
        <td class="entry"><a href="#/profile/${encodeURIComponent(e.handle)}">${esc(e.title)}</a><span class="by">@${esc(e.handle)}</span></td>
        <td class="rate"><span class="bar"><i style="width:${Math.round((winRate(e.judge) ?? 0) * 100)}%"></i></span>${percent(winRate(e.judge))}</td>
        <td class="num muted">${record(e.judge)}</td>
      </tr>`)
    .join('');

  const tabs = `<div class="tabs">
      <button type="button" data-pane="overview" class="${state.pane === 'overview' ? 'on' : ''}">Overview</button>
      <button type="button" data-pane="leaderboard" class="${state.pane === 'leaderboard' ? 'on' : ''}">Leaderboard${lb ? ` <span class="pill">${count((lb.entries || []).length)}</span>` : ''}</button>
    </div>`;

  const overview = `<div class="cols">
      <section>
        <h2>Rewards at the live pot</h2>
        <table class="table rewards"><thead><tr><th>Place</th><th class="num">Base</th><th class="num">Fee share</th><th class="num">Pays now</th></tr></thead><tbody>${rewards}</tbody></table>
      </section>
      <section>
        <h2>Dates and phases</h2>
        <ul class="dates">
          <li><span>Opened</span><b>${dateShort(b.opensAt || b.publishedAt)}</b></li>
          <li><span>Now</span><b class="now">${dateShort(new Date().toISOString())}</b></li>
          <li><span>Deadline</span><b>${dateShort(b.deadline)}</b></li>
          <li><span>Results</span><b>after the final heat</b></li>
        </ul>
        <h2>Rules in one line</h2>
        <p class="prose">${esc(lede(b.summary || b.description, 260))}</p>
      </section>
    </div>
    <h2>Description</h2>
    <div class="prose long">${esc(b.description || '').replace(/\n{2,}/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`;

  const board = `<h2>Leaderboard · ${count((lb?.entries || []).length)} ranked entries</h2>
    <table class="table lb"><thead><tr><th>#</th><th>Entry</th><th>Win rate</th><th class="num">W–L</th></tr></thead>
    <tbody>${lbRows || '<tr><td colspan="4" class="empty">Nothing ranked yet.</td></tr>'}</tbody></table>
    ${lb && (lb.entries || []).length > state.page ? `<div class="more"><button type="button" id="more">Show 30 more · ${count(lb.entries.length - state.page)} left</button></div>` : ''}`;

  return `<header class="bhead">
      <div class="bhead-top"><span class="chip">${esc(b.category || 'Bounty')}</span><span class="badge ${isOpen(b) ? 'open' : 'ended'}">${isOpen(b) ? 'Open' : 'Ended'}</span><span class="byline">by ${esc(b.sponsor?.name || 'make.fun')}</span></div>
      <h1>${esc(b.title)}</h1>
      <p class="sub">${esc(lede(b.summary || '', 220))}</p>
    </header>
    <div class="tiles">
      <div><span>Live pot</span><b>${money(potOf(b))}</b><i>${money(b.rewardAmount ?? 0)} + ${money(Math.max(0, potOf(b) - Number(b.rewardAmount || 0)))} fees</i></div>
      <div><span>Entry fee</span><b>${feeOf(b) > 0 ? money(feeOf(b)) : 'free'}</b><i>${feeOf(b) > 0 ? 'once per account' : 'no fee'}</i></div>
      <div><span>Time left</span><b class="${urgency(b.deadline)}">${timeLeft(b.deadline)}</b><i>closes ${dateShort(b.deadline)}</i></div>
      <div><span>Entries</span><b>${count(b.submissionCount)}</b><i>${b.acceptingSubmissions === false ? 'closed' : 'accepted'}</i></div>
    </div>
    ${tabs}
    ${state.pane === 'leaderboard' ? board : overview}`;
}

/** The leaderboard index: every bounty in one table, linked to its own leaderboard. */
export function leaderboardsView(items) {
  const now = Date.now();
  const rows = items
    .slice()
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .map((b) => `<tr>
        <td class="entry"><a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">${esc(b.title)}</a><span class="by">${esc(b.category || '')}</span></td>
        <td class="num">${money(potOf(b))}</td>
        <td class="num">${count(b.submissionCount)}</td>
        <td class="num ${isOpen(b, now) ? '' : 'muted'}">${isOpen(b, now) ? timeLeft(b.deadline) + ' left' : 'ended'}</td>
      </tr>`)
    .join('');
  return `<header class="bhead"><div class="bhead-top"><span class="chip">Every bounty</span></div><h1>Leaderboards</h1><p class="sub">One board per bounty: every ranked entry, its win rate against the house, and the account behind it.</p></header>
    <table class="table lb"><thead><tr><th>Bounty</th><th class="num">Pot</th><th class="num">Entries</th><th class="num">Closes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** One account: its record, then the entries it made. */
export function profileView(p) {
  const rec = p.record || {};
  const solutions = (p.solutions || [])
    .map((s) => `<li><a href="#/bounty/${encodeURIComponent(s.competition?.slug || '')}">${esc(s.title)}</a><span class="by">${esc(s.competition?.title || '')}</span><span class="meta">${s.placement ? '#' + s.placement : 'unplaced'}${s.prize_usd ? ' · ' + money(s.prize_usd) : ''}</span></li>`)
    .join('');
  return `<header class="bhead profile">
      <span class="avatar">${esc((p.handle || '?').slice(0, 1).toUpperCase())}</span>
      <div><h1>@${esc(p.handle)}</h1><p class="sub">${p.display_name ? esc(p.display_name) + ' · ' : ''}joined ${dateUTC(p.joined_at)}</p></div>
    </header>
    <div class="tiles">
      <div><span>Bounties entered</span><b>${count(rec.competitions_entered)}</b></div>
      <div><span>Podium finishes</span><b>${count(rec.podium_finishes)}</b></div>
      <div><span>Prizes</span><b>${money(rec.prize_usd)}</b></div>
      <div><span>Best placement</span><b>${rec.best_placement ? '#' + rec.best_placement : '—'}</b></div>
    </div>
    <h2>Entries</h2>
    <ul class="solutions">${solutions || '<li class="empty">No entry yet.</li>'}</ul>`;
}
