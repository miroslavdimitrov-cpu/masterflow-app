import { $, msg } from '../lib/util.js';
import { supabase, configured } from '../lib/supabase.js';

let mode = 'signin'; // signin | signup | reset | recover

const COPY = {
  signin: ['Welcome back', 'Sign in', 'Create an account'],
  signup: ['Create your account', 'Create account', 'I already have an account'],
  reset: ['Reset your password', 'Send reset link', 'Back to sign in'],
  recover: ['Choose a new password', 'Save password', ''],
};

function paint() {
  const [title, btn, alt] = COPY[mode];
  $('#at').textContent = title;
  $('#ab').textContent = btn;
  $('#as').textContent = alt;
  $('#as').hidden = !alt;
  $('#af').hidden = mode !== 'signin';
  $('#ae-wrap').hidden = mode === 'recover';
  $('#ap-wrap').hidden = mode === 'reset';
  $('#ap').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  $('#am').textContent = '';
}

const say = (t, bad) => { const m = $('#am'); m.textContent = t; m.style.color = bad ? 'var(--acc)' : 'var(--mute)'; };

export function showAuth() {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  if (!configured) {
    say('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).', true);
    $('#ab').disabled = true;
    return;
  }
  paint();
}

export function showRecovery() {
  mode = 'recover';
  $('#app').hidden = true;
  $('#auth').hidden = false;
  paint();
}

export const hideAuth = () => { $('#auth').hidden = true; $('#app').hidden = false; };

async function submit() {
  const email = $('#ae').value.trim(), pass = $('#ap').value;
  const b = $('#ab');
  b.disabled = true;
  try {
    if (mode === 'reset') {
      if (!email) return say('Enter your email first.', true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      if (error) return say(error.message, true);
      return say('If that email has an account, a reset link is on its way.');
    }
    if (mode === 'recover') {
      if (pass.length < 8) return say('Use at least 8 characters.', true);
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) return say(error.message, true);
      $('#ap').value = '';
      location.replace(location.origin); // reload into the signed-in app
      return;
    }
    if (!email || !pass) return say('Enter your email and password.', true);
    if (mode === 'signup') {
      if (pass.length < 8) return say('Use at least 8 characters.', true);
      const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin } });
      if (error) return say(error.message, true);
      if (!data.session) return say('Check your inbox to confirm your email, then sign in.');
      return; // signed in immediately; the auth listener boots the app
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) say(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, true);
  } finally {
    b.disabled = false;
  }
}

export function initAuth() {
  $('#ab').onclick = submit;
  for (const id of ['#ae', '#ap']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $('#as').onclick = (e) => { e.preventDefault(); mode = mode === 'signin' ? 'signup' : 'signin'; paint(); };
  $('#af').onclick = (e) => { e.preventDefault(); mode = 'reset'; paint(); };
  msg('');
}
