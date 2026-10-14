import { $, el, D, fmt } from '../lib/util.js';
import { S, actP } from '../lib/store.js';
import { generateSummary } from '../lib/agent.js';
import { msg } from '../lib/util.js';

/** Aggregates this month's work, overall and per project. */
export function gather() {
  const m = D(Date.now()).slice(0, 7);
  const days = {}, pj = {};
  const day = (d) => days[d] || (days[d] = { done: [], mins: 0 });
  const P = (t) => {
    const k = S.projects.some((p) => p.id === t.project_id) ? t.project_id : '_';
    return pj[k] || (pj[k] = { dm: 0, tot: 0, mins: 0, open: 0 });
  };
  let tot = 0, dm = 0;
  for (const t of S.tasks) {
    const q = P(t);
    if (t.status === 'done' && t.completed_at) {
      tot++; q.tot++;
      const d = D(t.completed_at);
      if (d.startsWith(m)) { dm++; q.dm++; day(d).done.push(t.title); }
    } else if (t.status !== 'done') {
      q.open++;
    }
    if (t.minutes && t.last_worked && t.last_worked.startsWith(m)) {
      day(t.last_worked).mins += t.minutes;
      q.mins += t.minutes;
    }
  }
  for (const d in S.days) if (d.startsWith(m)) day(d);
  return { days, pj, tot, dm, mins: Object.values(days).reduce((a, x) => a + x.mins, 0) };
}

export async function summarize(day, data, btn) {
  const label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }
  try {
    await generateSummary(day, data);
    msg('');
  } catch (e) {
    msg(e.code === 'no_key' || e.code === 'bad_key' ? 'Add a working API key in Settings to write summaries.' : "Couldn't write the summary: " + e.message);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

export function rProfile() {
  const g = gather(), active = Object.keys(g.days).length;
  const st = $('#stats');
  st.textContent = '';
  const stats = [
    [g.dm, 'Done this month'], [g.tot, 'Done all time'], [fmt(g.mins), 'Worked this month'],
    [active ? fmt(Math.round(g.mins / active)) : '–', 'Avg per active day'],
  ];
  for (const [n, l] of stats) {
    const c = el('div', 'stat');
    c.append(el('b', 0, String(n)), el('span', 0, l));
    st.append(c);
  }

  const pa = $('#pa');
  pa.textContent = '';
  const pk = [...S.projects.map((p) => [p.id, p.name]), ['_', 'General']].filter(([k]) => g.pj[k]);
  if (!pk.length) pa.append(el('div', 'empty', 'No project activity yet.'));
  for (const [k, name] of pk) {
    const q = g.pj[k], pc = g.mins ? Math.round((100 * q.mins) / g.mins) : 0;
    const c = el('div', 'card'), h = el('h2'), bar = el('div', 'bar2'), i = el('i');
    h.append(el('span', 0, name), el('span', 0, q.open + ' open'));
    i.style.width = pc + '%';
    bar.append(i);
    c.append(h, el('div', 0, `${q.dm} done this month · ${q.tot} all time · ${fmt(q.mins)} worked this month`), bar,
      el('div', 'nt', pc + "% of this month's time"));
    pa.append(c);
  }

  const L = $('#dl');
  L.textContent = '';
  const ks = Object.keys(g.days).sort().reverse();
  if (!ks.length) L.append(el('div', 'empty', 'Nothing logged this month yet. Finish a task or start a timer (▶) and it shows up here.'));
  for (const d of ks) {
    const x = g.days[d], r = S.days[d] || {}, c = el('div', 'card'), h = el('h2');
    h.append(el('span', 0, d), el('span', 0, `${x.done.length} done · ${fmt(x.mins)}`));
    c.append(h);
    if (x.done.length) c.append(el('div', 'nt', 'Done: ' + x.done.join('; ')));
    if (r.results) c.append(el('div', 0, 'Results: ' + r.results));
    if (r.suggestion) c.append(el('div', 'sg', 'Suggestion: ' + r.suggestion));
    const b = el('button', 'g', r.results ? 'Regenerate summary' : 'Generate summary');
    b.onclick = () => summarize(d, x, b);
    c.append(b);
    L.append(c);
  }
}

export function initProfile() {
  $('#gs').onclick = () => {
    const d = D(Date.now());
    summarize(d, gather().days[d] || { done: [], mins: 0 }, $('#gs'));
  };
}
