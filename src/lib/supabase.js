import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

// Names (never values) of build-time variables that were empty, for a clearer error message.
export const missing = [['VITE_SUPABASE_URL', url], ['VITE_SUPABASE_ANON_KEY', key]]
  .filter(([, v]) => !v)
  .map(([n]) => n);

export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
