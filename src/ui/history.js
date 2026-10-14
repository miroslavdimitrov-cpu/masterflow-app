import { $, el } from '../lib/util.js';
import { supabase } from '../lib/supabase.js';

let open = null; // thread id being viewed

export async function rHistory() {
  const L = $('#hist');
  L.textContent = '';
  if (open) {
    const back = el('button', 'g', '← All days');
    back.onclick = () => { open = null; rHistory(); };
    L.append(back);
    const { data, error } = await supabase.from('chat_messages').select('role, content, created_at')
      .eq('thread_id', open.id).order('created_at').limit(300);
    L.append(el('h2', 0, open.thread_date));
    if (error) { L.append(el('div', 'empty', 'Could not load this day.')); return; }
    if (open.rolling_summary) L.append(el('div', 'card nt', 'Summary of earlier messages: ' + open.rolling_summary));
    for (const m of data) L.append(el('div', 'm ' + (m.role === 'user' ? 'u' : 'a'), m.content));
    return;
  }
  const { data, error } = await supabase.from('chat_threads').select('id, thread_date, rolling_summary')
    .order('thread_date', { ascending: false }).limit(60);
  if (error) { L.append(el('div', 'empty', 'Could not load your history.')); return; }
  if (!data.length) { L.append(el('div', 'empty', 'No conversations yet. Each day gets its own chat, and past days show up here.')); return; }
  for (const t of data) {
    const b = el('button', 'tile hbtn');
    b.append(el('b', 0, t.thread_date), el('span', 'nt', t.rolling_summary ? t.rolling_summary.slice(0, 120) : 'Open this day'));
    b.onclick = () => { open = t; rHistory(); };
    L.append(b);
  }
}
