// POST   /.netlify/functions/save-key  { apiKey, model? }  -> validates, encrypts and stores the key
// DELETE /.netlify/functions/save-key                      -> removes the stored key
import { json, authUser, admin, encrypt, detectProvider, verifyKey } from '../lib/shared.mjs';

export const handler = async (event) => {
  try {
    const user = await authUser(event);
    if (!user) return json(401, { error: 'unauthorized', message: 'Please sign in again.' });
    const db = admin();

    if (event.httpMethod === 'DELETE') {
      await db.from('user_secrets').delete().eq('user_id', user.id);
      await db.from('user_settings').update({ has_key: false, key_provider: null, key_last4: null }).eq('user_id', user.id);
      return json(200, { ok: true });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_request' }); }

    const apiKey = String(body.apiKey || '').trim();
    const provider = detectProvider(apiKey);
    if (!provider || apiKey.length < 20 || apiKey.length > 300)
      return json(400, { error: 'bad_format', message: 'That does not look like an Anthropic (sk-ant-…) or OpenAI (sk-…) key.' });

    if (!(await verifyKey(provider, apiKey)))
      return json(400, { error: 'bad_key', message: `${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} rejected that key.` });

    const { error: e1 } = await db
      .from('user_secrets')
      .upsert({ user_id: user.id, provider, ciphertext: encrypt(apiKey) }, { onConflict: 'user_id' });
    if (e1) throw e1;

    const patch = { has_key: true, key_provider: provider, key_last4: apiKey.slice(-4) };
    if (typeof body.model === 'string') patch.model = body.model.trim().slice(0, 100);
    const { error: e2 } = await db.from('user_settings').update(patch).eq('user_id', user.id);
    if (e2) throw e2;

    return json(200, { ok: true, provider, last4: patch.key_last4 });
  } catch (e) {
    console.error('save-key function error:', e.message);
    return json(500, { error: 'server_error', message: 'Could not save the key.' });
  }
};
