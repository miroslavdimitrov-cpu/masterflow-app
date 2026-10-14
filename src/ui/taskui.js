import { S, setStatus, updateTask, deleteTask } from '../lib/store.js';
import { el, D, fmt, clock } from '../lib/util.js';
import { ui } from '../lib/ui-state.js';

export const TY = { urgent: '⚡ urgent', deep: '🧠 deep', short: '✂ quick' };
export const PR = [['now', 'Today'], ['next', 'Tomorrow'], ['later', 'Long term'], ['past', 'Earlier']];

export const dateOf = (t) => t.planned_date || null;

export function lane(t) {
  const d = dateOf(t), today = D(Date.now());
  if (t.status === 'done' && t.completed_at && D(t.completed_at) < today) return 'past';
  if (!d) return 'later';
  if (d <= today) return 'now';
  return d === D(Date.now() + 864e5) ? 'next' : 'later';
}

const fail = () => {}; // errors are already surfaced by the store

export function row(t) {
  const r = el('div', 't' + (t.status === 'done' ? ' done' : '') + (t.status === 'doing' ? ' doing' : ''));
  const ck = el('button', 'ck', t.status === 'done' ? '✓' : '');
  ck.title = t.status === 'done' ? 'Mark as not done' : 'Mark as done';
  ck.onclick = () => setStatus(t, t.status === 'done' ? 'todo' : 'done').catch(fail);

  const bd = el('div', 'b'), ti = el('div', 'ti', t.title || '');
  if (t.type) ti.append(el('span', 'chip', TY[t.type] || t.type));
  const pj = S.projects.find((p) => p.id === t.project_id);
  if (pj && ui.cur !== 'projects') ti.append(el('span', 'chip', pj.name));
  if (t.status === 'doing' && t.started_at) {
    const s = Date.parse(t.started_at);
    const tm = el('span', 'chip st tm', '⏱ ' + clock(Date.now() - s));
    tm.dataset.s = s;
    ti.append(tm);
  }
  const dd = dateOf(t);
  if (dd && dd < D(Date.now()) && t.status !== 'done') ti.append(el('span', 'chip st', 'overdue'));
  if (t.minutes) ti.append(el('span', 'chip', fmt(t.minutes)));
  bd.append(ti);
  if (t.note) bd.append(el('div', 'nt', t.note));

  const di = el('input', 'di');
  di.type = 'date';
  di.value = dd || '';
  di.title = 'Planned day (empty = long term)';
  di.onchange = () => updateTask(t.id, { planned_date: di.value || null }).catch(fail);
  bd.append(di);

  const ct = el('div', 'ctl');
  if (t.status !== 'done') {
    const s = el('button', 'g', t.status === 'doing' ? '⏸' : '▶');
    s.title = t.status === 'doing' ? 'Pause' : 'Start timer';
    s.onclick = () => setStatus(t, t.status === 'doing' ? 'todo' : 'doing').catch(fail);
    ct.append(s);
  }
  const x = el('button', 'g', '✕');
  x.title = 'Delete';
  x.onclick = () => deleteTask(t.id).catch(fail);
  ct.append(x);
  r.append(ck, bd, ct);
  return r;
}

export function lanes(list, into, cls, all) {
  for (const [k, label] of PR) {
    const l = list.filter((t) => lane(t) === k).sort((a, c) =>
      (a.status === 'done') - (c.status === 'done') ||
      (dateOf(a) || '9999').localeCompare(dateOf(c) || '9999') ||
      a.created_at.localeCompare(c.created_at));
    if (!l.length || (k === 'past' && !all)) continue;
    const c = el('div', cls), h = el('h2');
    h.append(el('span', 0, label), el('span', 0, l.filter((t) => t.status !== 'done').length + ' open'));
    c.append(h);
    l.forEach((t) => c.append(row(t)));
    into.append(c);
  }
}
