export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];

export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Local calendar day as YYYY-MM-DD. Accepts ms, ISO string or Date. */
export const D = (n) => {
  const d = new Date(n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const fmt = (m) => (m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm');

export const clock = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  const q = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' : '') + q(m) + ':' + q(x);
};

export const str = (v, n) => String(v == null ? '' : v).slice(0, n);
export const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Pulls a JSON object out of a model reply, tolerating code fences and stray text. */
export function parseJson(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ }
  }
  return null;
}

export const msg = (t) => {
  const m = $('#msg');
  if (m) m.textContent = t || '';
};
