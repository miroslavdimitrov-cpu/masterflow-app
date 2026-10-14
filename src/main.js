import './styles.css';
import { supabase, configured } from './lib/supabase.js';
import { S, start, stop } from './lib/store.js';
import { initAuth, showAuth, showRecovery, hideAuth } from './ui/auth.js';
import { boot, teardown } from './ui/shell.js';

initAuth();

if (!configured) {
  showAuth();
} else {
  // A password-reset link lands here with type=recovery in the URL.
  let recovering = /type=recovery/.test(location.hash + location.search);
  let entering = false;
  if (recovering) showRecovery();

  const enter = async (user) => {
    if (recovering || entering || (S.user && S.user.id === user.id)) return;
    entering = true;
    try {
      hideAuth();
      await start(user);
      await boot();
    } catch (e) {
      console.error(e);
      stop();
      showAuth();
    } finally {
      entering = false;
    }
  };

  supabase.auth.onAuthStateChange((evt, session) => {
    if (evt === 'PASSWORD_RECOVERY') { recovering = true; showRecovery(); return; }
    if (evt === 'SIGNED_OUT') { stop(); teardown(); showAuth(); return; }
    if (session?.user && (evt === 'SIGNED_IN' || evt === 'INITIAL_SESSION')) {
      setTimeout(() => enter(session.user), 0); // never await Supabase calls inside this callback
    } else if (evt === 'INITIAL_SESSION' && !recovering) {
      showAuth();
    }
  });
}
