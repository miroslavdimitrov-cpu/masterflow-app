import { supabase } from './supabase.js';
import { D, msg, str } from './util.js';

export const DEF = {
  assistantName: 'Flow',
  tone: 'direct',
  methodology: 'One must-win task per day, done first',
  rules: '',
  voice: false,
  morning: '09:00',
  midday: '13:00',
  evening: '18:00',
  nudge: 0,
  onboarded: false,
  activeProject: null,
  timezone: 'UTC',
  model: '',
};

// client (camelCase) -> database column
export const COLS = {
  assistantName: 'assistant_name', tone: 'tone', methodology: 'methodology', rules: 'rules', voice: 'voice',
  morning: 'morning', midday: 'midday', evening: 'evening', nudge: 'nudge', onboarded: 'onboarded',
  activeProject: 'active_project', timezone: 'timezone', model: 'model',
};

export const S = {
  user: null,
  tasks: [],
  projects: [],
  set: { ...DEF },
  key: { has: false, last4: '', provider: '' },
  days: {},
  notes: [],
  thread: null,
  chat: [],
};

const subs = new Set();
export const onChange = (f) => { subs.add(f); };
export const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

const ok = (r) => { if (r.error) throw r.error; return r.data; };

// ---------- loading ----------
async function loadChat() {
  const day = D(Date.now());
  const t = ok(await supabase.from('chat_threads').select('*').eq('thread_date', day).maybeSingle());
  S.thread = t || null;
  if (!t) { S.chat = []; return; }
  const m = ok(await supabase.from('chat_messages').select('role, content, created_at')
    .eq('thread_id', t.id).order('created_at', { ascending: false }).limit(60));
  S.chat = (m || []).reverse();
}

const LOAD = {
  tasks: async () => { S.tasks = ok(await supabase.from('tasks').select('*').order('created_at')) || []; },
  projects: async () => { S.projects = ok(await supabase.from('projects').select('*').order('created_at')) || []; },
  settings: async () => {
    const r = ok(await supabase.from('user_settings').select('*').maybeSingle());
    const s = { ...DEF };
    if (r) {
      for (const k in COLS) if (r[COLS[k]] !== undefined) s[k] = r[COLS[k]];
      S.key = { has: !!r.has_key, last4: r.key_last4 || '', provider: r.key_provider || '' };
    }
    S.set = s;
  },
  days: async () => {
    const d = {};
    (ok(await supabase.from('day_summaries').select('*')) || []).forEach((r) => { d[r.day] = r; });
    S.days = d;
  },
  notes: async () => { S.notes = ok(await supabase.from('agent_notes').select('*').order('created_at')) || []; },
  chat: loadChat,
};

export async function refresh(keys) {
  await Promise.all(keys.map((k) => LOAD[k]()));
}

export async function loadAll() {
  await refresh(Object.keys(LOAD));
  emit();
}

// ---------- realtime ----------
const TABLE_KEY = {
  tasks: 'tasks', projects: 'projects', user_settings: 'settings', day_summaries: 'days',
  agent_notes: 'notes', chat_messages: 'chat', chat_threads: 'chat',
};
const dirty = new Set();
let timer = null;

function queue(key) {
  dirty.add(key);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const keys = [...dirty];
    dirty.clear();
    try { await refresh(keys); emit(); } catch (e) { console.error(e); }
  }, 150);
}

export function subscribe() {
  const ch = supabase.channel('mf-' + S.user.id);
  for (const table of Object.keys(TABLE_KEY)) {
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${S.user.id}` },
      () => queue(TABLE_KEY[table]));
  }
  ch.subscribe();
}

export async function start(user) {
  S.user = user;
  await loadAll();
  subscribe();
}

export function stop() {
  supabase.removeAllChannels();
  Object.assign(S, {
    user: null, tasks: [], projects: [], set: { ...DEF }, key: { has: false, last4: '', provider: '' },
    days: {}, notes: [], thread: null, chat: [],
  });
}

// ---------- mutations ----------
async function q(promise, keys) {
  const r = await promise;
  if (r.error) { msg('Couldn’t save: ' + r.error.message); throw r.error; }
  if (keys) await refresh(keys);
  emit();
  return r.data;
}

export const actP = () => S.projects.find((p) => p.id === S.set.activeProject) || S.projects[0] || null;

// tasks
export const addTask = (t) => q(supabase.from('tasks').insert({
  title: str(t.title, 200), type: t.type || 'short', note: str(t.note, 300),
  planned_date: t.planned_date ?? null, project_id: t.project_id ?? null,
}), ['tasks']);

export const updateTask = (id, patch) => q(supabase.from('tasks').update(patch).eq('id', id), ['tasks']);
export const deleteTask = (id) => q(supabase.from('tasks').delete().eq('id', id), ['tasks']);

export function setStatus(t, status) {
  const p = { status };
  if (status === 'doing') {
    p.started_at = new Date().toISOString();
    p.completed_at = null;
  } else {
    if (t.started_at) {
      p.minutes = (t.minutes || 0) + Math.max(1, Math.round((Date.now() - Date.parse(t.started_at)) / 60000));
      p.last_worked = D(Date.now());
      p.started_at = null;
    }
    p.completed_at = status === 'done' ? new Date().toISOString() : null;
  }
  return updateTask(t.id, p);
}

// projects
export async function addProject({ name, summary = '', goal = '', focus = '' }) {
  const r = await supabase.from('projects')
    .insert({ name: str(name, 60), summary: str(summary, 140), goal: str(goal, 500), focus: str(focus, 500) })
    .select().single();
  if (r.error) { msg('Couldn’t save: ' + r.error.message); throw r.error; }
  S.projects.push(r.data);
  if (!S.set.activeProject) await saveSettings({ activeProject: r.data.id });
  await refresh(['projects']);
  emit();
  return r.data.id;
}

export const updateProject = (id, patch) => q(supabase.from('projects').update(patch).eq('id', id), ['projects']);

export async function deleteProject(id) {
  await q(supabase.from('projects').delete().eq('id', id), ['projects', 'tasks', 'settings']);
}

/** Finds a project by id or (case-insensitive) name; creates it if it does not exist. */
export async function resolveProject(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const p = S.projects.find((x) => x.id === s || x.name.toLowerCase() === s.toLowerCase());
  return p ? p.id : addProject({ name: s.slice(0, 60) });
}

// settings
export function saveSettings(patch) {
  const row = {};
  for (const k in patch) if (COLS[k]) row[COLS[k]] = patch[k];
  return q(supabase.from('user_settings').update(row).eq('user_id', S.user.id), ['settings']);
}

// daily summaries
export const setDay = (day, results, suggestion) => q(
  supabase.from('day_summaries').upsert(
    { user_id: S.user.id, day, results: str(results, 500), suggestion: str(suggestion, 500) },
    { onConflict: 'user_id,day' }),
  ['days']);

// notes
export const addNote = (note) => q(supabase.from('agent_notes').insert({ note: str(note, 300) }), ['notes']);
export const deleteNote = (id) => q(supabase.from('agent_notes').delete().eq('id', id), ['notes']);

// chat
export async function ensureThread() {
  const day = D(Date.now());
  if (S.thread && S.thread.thread_date === day) return S.thread;
  let t = ok(await supabase.from('chat_threads').select('*').eq('thread_date', day).maybeSingle());
  if (!t) {
    const r = await supabase.from('chat_threads').insert({ thread_date: day }).select().single();
    if (r.error && r.error.code === '23505') {
      t = ok(await supabase.from('chat_threads').select('*').eq('thread_date', day).single());
    } else if (r.error) {
      throw r.error;
    } else {
      t = r.data;
    }
  }
  S.thread = t;
  return t;
}

export async function addMessage(role, content) {
  const t = await ensureThread();
  await q(supabase.from('chat_messages').insert({ thread_id: t.id, role, content: str(content, 8000) || '…' }), ['chat']);
}
