import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: bypasses RLS. Server-side only, never sent to the browser. */
export const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession);

/** Verifies the caller's Supabase JWT and returns the user (or null). */
export async function authUser(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), noSession);
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

// ---- AES-256-GCM encryption for stored provider keys ----
function secretKey() {
  const b = Buffer.from(env('SECRETS_ENCRYPTION_KEY'), 'base64');
  if (b.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 random bytes, base64 encoded');
  return b;
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decrypt(b64) {
  const b = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// ---- Providers ----
export const detectProvider = (key) =>
  key.startsWith('sk-ant-') ? 'anthropic' : key.startsWith('sk-') ? 'openai' : null;

export const DEFAULT_MODELS = {
  anthropic: { main: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' },
  openai: { main: 'gpt-4o', fast: 'gpt-4o-mini' },
};

const providerError = (status, message) => Object.assign(new Error(message), { providerStatus: status });

/** Cheap call that proves a key is valid before we store it. */
export async function verifyKey(provider, apiKey) {
  const r =
    provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/models?limit=1', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        })
      : await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
  return r.ok;
}

export async function callModel({ provider, apiKey, model, system, prompt, maxTokens }) {
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw providerError(r.status, j?.error?.message || 'The model request failed.');
    return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (provider === 'openai') {
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw providerError(r.status, j?.error?.message || 'The model request failed.');
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('Unsupported provider');
}
