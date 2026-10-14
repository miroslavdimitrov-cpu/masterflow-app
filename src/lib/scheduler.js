// In-browser check-ins. These only fire while the app is open; real background
// notifications would need a server-side scheduler (see README, "Next steps").
import { S, addMessage } from './store.js';
import { D } from './util.js';
import { gather, summarize } from '../ui/profile.js';

let tick = null, nudgeTimer = null, lastNudge = null;

const fired = (k) => localStorage.getItem('mf_fired_' + k) === D(Date.now());
const mark = (k) => localStorage.setItem('mf_fired_' + k, D(Date.now()));

const MSG = {
  morning: "Time for your start-of-day brief. Say go and I'll run it.",
  midday: 'Midday check-in. How is the must-win going?',
  evening: "End of the day. I'm writing your summary now; you'll find it on your Profile page.",
};

export function startScheduler() {
  stopScheduler();
  tick = setInterval(() => {
    if (!S.user || !S.set.onboarded) return;
    const n = new Date();
    const hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    for (const k of ['morning', 'midday', 'evening']) {
      if (S.set[k] === hm && !fired(k)) {
        mark(k);
        addMessage('assistant', MSG[k]).catch(() => {});
        if (k === 'evening') {
          const d = D(n);
          summarize(d, gather().days[d] || { done: [], mins: 0 });
        }
      }
    }
  }, 30000);
  applyNudge();
}

/** Call whenever settings change. */
export function applyNudge() {
  const m = +S.set.nudge || 0;
  if (lastNudge === m) return;
  lastNudge = m;
  clearInterval(nudgeTimer);
  if (m > 0) {
    nudgeTimer = setInterval(() => {
      const t = S.tasks.find((x) => x.status === 'doing');
      if (t) addMessage('assistant', `Still on "${t.title}"? Tell me if you are stuck or switching.`).catch(() => {});
    }, m * 60000);
  }
}

export function stopScheduler() {
  clearInterval(tick);
  clearInterval(nudgeTimer);
  lastNudge = null;
}
