import { $, $$, msg } from '../lib/util.js';
import { supabase } from '../lib/supabase.js';
import { S, COLS, saveSettings, refresh, emit } from '../lib/store.js';
import { speak } from '../lib/voice.js';

export function rSettings() {
  $$('#settings [data-k]').forEach((e) => {
    if (document.activeElement === e) return;
    const v = S.set[e.dataset.k];
    if (e.type === 'checkbox') e.checked = !!v;
    else e.value = v == null ? '' : v;
  });
  $('#acct').textContent = S.user ? S.user.email : '';
  const k = S.key;
  $('#ks').textContent = k.has
    ? `Key saved (${k.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}, ends in ${k.last4}). It is stored encrypted on the server and never shown again.`
    : 'No key saved yet. The agent needs one to answer.';
  $('#rk').hidden = !k.has;
}

async function keyCall(method, body) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/.netlify/functions/save-key', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || 'Request failed');
  return j;
}

export function initSettings(onLogout) {
  $('#settings').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k || !(k in COLS)) return;
    const t = e.target;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, Math.min(240, +t.value || 0)) : t.value;
    saveSettings({ [k]: v }).catch(() => {});
  });

  $('#tv').onclick = () => speak(`Hi, I'm ${S.set.assistantName}. This is how I sound.`);

  $('#sk').onclick = async () => {
    const key = $('#ak').value.trim();
    if (!key) { msg('Paste your API key first.'); return; }
    const b = $('#sk');
    b.disabled = true;
    b.textContent = 'Checking…';
    try {
      await keyCall('POST', { apiKey: key, model: S.set.model });
      $('#ak').value = '';
      await refresh(['settings']);
      emit();
      msg('');
    } catch (e) { msg(e.message); }
    b.disabled = false;
    b.textContent = 'Save key';
  };

  $('#rk').onclick = async () => {
    try { await keyCall('DELETE'); await refresh(['settings']); emit(); msg(''); } catch (e) { msg(e.message); }
  };

  $('#lo').onclick = onLogout;
}
