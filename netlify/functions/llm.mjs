// POST /.netlify/functions/llm
// Body: { prompt, system?, tier?: 'main'|'fast', maxTokens? }
// Auth: Authorization: Bearer <Supabase access token>
// The user's provider key is decrypted here, used for one request, and never returned.
import { json, authUser, admin, decrypt, callModel, DEFAULT_MODELS } from '../lib/shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const user = await authUser(event);
    if (!user) return json(401, { error: 'unauthorized', message: 'Please sign in again.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_request' }); }

    const prompt = String(body.prompt || '');
    if (!prompt || prompt.length > 80000) return json(400, { error: 'bad_prompt', message: 'Prompt missing or too long.' });
    const system = String(body.system || '').slice(0, 12000);
    const tier = body.tier === 'fast' ? 'fast' : 'main';
    const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 1500, 100), 4000);

    const db = admin();
    const [sec, st] = await Promise.all([
      db.from('user_secrets').select('provider, ciphertext').eq('user_id', user.id).maybeSingle(),
      db.from('user_settings').select('model').eq('user_id', user.id).maybeSingle(),
    ]);
    if (!sec.data) return json(400, { error: 'no_key', message: 'Add your API key in Settings first.' });

    const provider = sec.data.provider;
    const apiKey = decrypt(sec.data.ciphertext);
    const model = (tier === 'main' && st.data?.model) || DEFAULT_MODELS[provider][tier];

    const text = await callModel({ provider, apiKey, model, system, prompt, maxTokens });
    return json(200, { text });
  } catch (e) {
    if (e.providerStatus === 401 || e.providerStatus === 403)
      return json(400, { error: 'bad_key', message: 'Your provider rejected the API key. Check it in Settings.' });
    if (e.providerStatus === 429)
      return json(429, { error: 'rate_limited', message: 'Your provider is rate limiting this key. Try again shortly.' });
    if (e.providerStatus)
      return json(502, { error: 'provider_error', message: e.message });
    console.error('llm function error:', e.message); // never log prompts or keys
    return json(500, { error: 'server_error', message: 'Something went wrong on the server.' });
  }
};
