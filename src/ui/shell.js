import { $, $$, clock } from '../lib/util.js';
import { S, onChange, actP, addMessage, saveSettings } from '../lib/store.js';
import { ui, hooks, RM } from '../lib/ui-state.js';
import { supabase } from '../lib/supabase.js';
import { openText } from '../lib/agent.js';
import { initMic } from '../lib/voice.js';
import { startScheduler, applyNudge, stopScheduler } from '../lib/scheduler.js';
import { rChat, initChat, submit } from './chat.js';
import { rProjects, initProjects } from './projects.js';
import { rProfile, initProfile } from './profile.js';
import { rSettings, initSettings } from './settings.js';
import { rHistory } from './history.js';

const pages = { chat: rChat, projects: rProjects, profile: rProfile, history: rHistory, settings: rSettings };

function hasBoard() {
  const h = !!actP();
  $('#chat').classList.toggle('hb', h);
  document.body.classList.toggle('hb', h);
}

export function render() {
  hasBoard();
  applyNudge();
  if (ui.cur !== 'history') pages[ui.cur]();
  if (ui.cur !== 'chat' && !$('#dr').hidden) rChat();
}

/** Moves the chat column into a floating drawer so the agent is reachable from any page. */
function dock(open) {
  const col = $('.col'), dr = $('#dr');
  if (open) { dr.appendChild(col); dr.hidden = false; }
  else { $('#chat').prepend(col); dr.hidden = true; }
}

export function go(p) {
  if (p === 'chat') dock(false);
  ui.cur = p;
  $$('.pg').forEach((e) => { e.hidden = e.id !== p; });
  $$('.bar [data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
  document.body.dataset.p = p;
  hasBoard();
  pages[p]();
}

const logout = () => supabase.auth.signOut();

let wired = false;
function wire() {
  wired = true;
  $$('.bar [data-p]').forEach((b) => {
    b.onclick = () => {
      go(b.dataset.p);
      $('#mn').hidden = true;
      if (b.dataset.p === 'chat') $('#chat').classList.remove('open');
    };
  });
  $('#hm').onclick = () => { $('#mn').hidden = !$('#mn').hidden; };
  document.addEventListener('click', (e) => { if (!e.target.closest('#mn,#hm')) $('#mn').hidden = true; });
  $('#lo2').onclick = logout;

  $('#tb').onclick = () => {
    const narrow = matchMedia('(max-width:820px)').matches, c = $('#chat');
    if (ui.cur !== 'chat') {
      go('chat');
      c.classList.remove('nob');
      if (narrow) c.classList.add('open');
      return;
    }
    c.classList.toggle(narrow ? 'open' : 'nob');
  };
  $('#fc').onclick = () => {
    const open = $('#dr').hidden;
    dock(open);
    if (open) rChat();
  };

  initChat(); initProjects(); initProfile(); initSettings(logout); initMic(submit);
  onChange(render);

  let tk = 0;
  setInterval(() => {
    $$('.tm').forEach((e) => { e.textContent = '⏱ ' + clock(Date.now() - e.dataset.s); });
    if (ui.busy && ++tk % 3 === 0) {
      ui.ri++;
      const k = $('.think .rk');
      if (k) k.textContent = RM[ui.ri % RM.length];
    }
  }, 1000);
}

export async function boot() {
  if (!wired) wire();
  hooks.render = render;
  hooks.beforeSend = () => { if (ui.cur !== 'chat' && $('#dr').hidden) dock(true); };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && S.set.timezone !== tz) saveSettings({ timezone: tz }).catch(() => {});

  go('chat');
  startScheduler();
  // First run: the agent opens the conversation with the walkthrough and question 1.
  if (!S.chat.length && !S.set.onboarded) addMessage('assistant', openText()).catch(() => {});
}

export function teardown() {
  stopScheduler();
  dock(false);
  ui.cur = 'chat';
  ui.selP = null;
  ui.busy = false;
  for (const id of ['#log', '#pl', '#prj', '#dl', '#pa', '#stats', '#hist']) $(id).textContent = '';
  $('#pj').textContent = '';
  delete $('#pj').dataset.sig;
  $('#mn').hidden = true;
}
