import { $, el } from '../lib/util.js';
import { S, actP, addTask, addProject, updateProject, deleteProject, saveSettings } from '../lib/store.js';
import { D } from '../lib/util.js';
import { ui } from '../lib/ui-state.js';
import { lanes } from './taskui.js';

const hue = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const fail = () => {};

export function rProjects() {
  const L = $('#prj');
  if (L.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  L.textContent = '';
  const groups = S.projects.map((p) => ({ p, l: S.tasks.filter((t) => t.project_id === p.id) }));
  const loose = S.tasks.filter((t) => !S.projects.some((p) => p.id === t.project_id));
  if (loose.length) groups.push({ p: null, l: loose });
  const key = (g) => (g.p ? g.p.id : '_');

  if (ui.selP) {
    const g = groups.find((x) => key(x) === ui.selP);
    if (g) { $('#pnew').hidden = true; return detail(L, g); }
    ui.selP = null;
  }
  $('#pnew').hidden = false;
  if (!groups.length) {
    L.append(el('div', 'empty', 'No projects yet. Add one above, or tell the agent about your projects in chat.'));
    return;
  }
  const grid = el('div', 'grid');
  for (const g of groups) {
    const nm = g.p ? g.p.name : 'General';
    const done = g.l.filter((t) => t.status === 'done').length;
    const c = el('button', 'tile'), cv = el('div', 'cv', nm.trim().charAt(0).toUpperCase());
    cv.style.background = g.p ? `hsl(${hue(nm)},45%,38%)` : 'var(--mute)';
    c.append(
      cv, el('b', 0, nm),
      el('span', 'nt', g.p ? (g.p.summary || 'No summary yet. Ask the agent to write one.') : 'Tasks without a project.'),
      el('span', 'nt', `${done} done · ${g.l.length - done} open`));
    c.onclick = () => { ui.selP = key(g); rProjects(); };
    grid.append(c);
  }
  L.append(grid);
}

function detail(L, g) {
  const p = g.p, c = el('div', 'card'), h = el('div', 'ph');
  const back = el('button', 'g', '← All projects');
  back.onclick = () => { ui.selP = null; rProjects(); };
  c.append(back);
  if (p) {
    const n = el('input', 'pn');
    n.value = p.name;
    n.onchange = () => updateProject(p.id, { name: n.value.trim().slice(0, 60) || p.name }).catch(fail);
    const act = actP();
    const m = el('button', 'g', act && act.id === p.id ? 'Active ✓' : 'Make active');
    m.onclick = () => saveSettings({ activeProject: p.id }).catch(fail);
    const d = el('button', 'g', 'Delete');
    d.title = 'Removes the project; its tasks move to General';
    d.onclick = () => { ui.selP = null; deleteProject(p.id).catch(fail); };
    h.append(n, m, d);
    c.append(h);
    const s = el('input');
    s.value = p.summary || '';
    s.placeholder = 'One-line summary of this project';
    s.setAttribute('maxlength', '140');
    s.onchange = () => updateProject(p.id, { summary: s.value.trim().slice(0, 140) }).catch(fail);
    c.append(s);
  } else {
    h.append(el('h2', 0, 'General'));
    c.append(h);
  }
  const done = g.l.filter((t) => t.status === 'done').length;
  c.append(el('div', 'nt', `${done} done · ${g.l.length - done} open`));
  const a = el('input');
  a.placeholder = 'Add a task for today, press Enter';
  a.setAttribute('maxlength', '200');
  a.onkeydown = (e) => {
    const v = a.value.trim();
    if (e.key === 'Enter' && v) {
      a.value = '';
      addTask({ title: v, planned_date: D(Date.now()), project_id: p ? p.id : null }).catch(fail);
    }
  };
  c.append(a);
  lanes(g.l, c, 'lane', true);
  L.append(c);
}

export function initProjects() {
  $('#np').addEventListener('keydown', (e) => {
    const v = e.target.value.trim();
    if (e.key === 'Enter' && v) { e.target.value = ''; addProject({ name: v }).catch(fail); }
  });
}
