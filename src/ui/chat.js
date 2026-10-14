import { $, el, D } from '../lib/util.js';
import { S, actP, updateProject, saveSettings, addTask, addMessage } from '../lib/store.js';
import { ui, hooks, RM } from '../lib/ui-state.js';
import { lanes } from './taskui.js';
import { sendMessage, openText } from '../lib/agent.js';

export function rChat() {
  const lg = $('#log');
  lg.textContent = '';
  const ms = S.chat.length
    ? S.chat
    : [{
        role: 'assistant',
        content: S.set.onboarded
          ? `Hi, I'm ${S.set.assistantName}. Tell me what's on your plate and I'll turn it into a plan.`
          : openText(),
      }];
  for (const m of ms) lg.append(el('div', 'm ' + (m.role === 'user' ? 'u' : 'a'), m.content));
  if (ui.busy) {
    const b = el('div', 'm a think'), d = el('span', 'dots');
    for (let i = 0; i < 3; i++) d.append(el('i'));
    b.append(d, el('span', 'rk', RM[ui.ri % RM.length]));
    lg.append(b);
  }
  lg.scrollTop = lg.scrollHeight;
  rPanel();
}

export function rPanel() {
  const a = actP(), sel = $('#pj'), sig = S.projects.map((p) => p.id + p.name).join('|');
  if (sel.dataset.sig !== sig) {
    sel.textContent = '';
    S.projects.forEach((p) => { const o = el('option', 0, p.name); o.value = p.id; sel.append(o); });
    sel.dataset.sig = sig;
  }
  if (a) sel.value = a.id;
  for (const k of ['goal', 'focus']) {
    const ta = $('#' + k);
    if (document.activeElement !== ta) ta.value = (a && a[k]) || '';
  }
  const b = $('#pl');
  b.textContent = '';
  lanes(a ? S.tasks.filter((t) => t.project_id === a.id) : [], b, 'card');
}

export async function submit(text) {
  text = (text || '').trim();
  if (!text || ui.busy) return;
  $('#in').value = '';
  if (hooks.beforeSend) hooks.beforeSend();
  ui.busy = true;
  ui.ri = Math.floor(Math.random() * RM.length);
  hooks.render();
  try {
    await sendMessage(text);
  } catch (e) {
    const note = e.code === 'no_key' || e.code === 'bad_key'
      ? 'I need a working API key to think. Add one in Settings (☰ menu), then try again.'
      : `Sorry, something went wrong: ${e.message}`;
    try { await addMessage('assistant', note); } catch { /* ignore */ }
  }
  ui.busy = false;
  hooks.render();
}

export function initChat() {
  $('#sd').onclick = () => submit($('#in').value);
  $('#in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit($('#in').value); }
  });
  $('#pj').onchange = (e) => saveSettings({ activeProject: e.target.value });
  for (const k of ['goal', 'focus']) {
    const ta = $('#' + k);
    ta.addEventListener('blur', () => {
      const a = actP();
      if (a && ta.value !== (a[k] || '')) updateProject(a.id, { [k]: ta.value });
    });
  }
  $('#nt').addEventListener('keydown', (e) => {
    const v = e.target.value.trim();
    if (e.key === 'Enter' && v) {
      e.target.value = '';
      addTask({ title: v, planned_date: D(Date.now()), project_id: (actP() || {}).id || null });
    }
  });
}
