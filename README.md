# MasterFlow

A voice-first productivity agent: it plans your day around your projects, tracks time, and writes an end-of-day review. You chat with it; it can change any task, project, goal or setting for you.

**Stack:** Vite (vanilla JS) · Supabase (Postgres, Auth, Realtime, RLS) · Netlify (hosting + two serverless functions) · bring-your-own Anthropic or OpenAI key.

```
index.html, src/            the app (no framework)
netlify/functions/llm.mjs   proxies chat to the model using the user's stored key
netlify/functions/save-key.mjs  validates, encrypts and stores the key
netlify/lib/shared.mjs      auth check, AES-256-GCM encryption, provider calls
supabase/migrations/0001_init.sql   tables, RLS policies, triggers, realtime
netlify.toml                build settings, SPA fallback, security headers
```

## How the key handling works

Users paste their own API key in **Settings**. The browser sends it once to `save-key`, which checks it with the provider, encrypts it (AES-256-GCM) and stores it in `user_secrets`. That table has **no client access at all**; only the Netlify functions (service role) can read it. The key is never sent back to the browser, only "saved, ends in 1234". Chat requests go to `llm`, which decrypts the key for that single request.

## Deploy, step by step

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste all of `supabase/migrations/0001_init.sql`, run it. (Or use the CLI: `supabase link` then `supabase db push`.) Run it once; it is not safe to re-run on the same database.
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key (the last one is secret).
4. **Authentication → Providers → Email**: keep it enabled. Decide on "Confirm email". On means new users must click an email link before signing in; the app handles both.
5. After Netlify gives you a URL (step 3), come back to **Authentication → URL Configuration**, set **Site URL** to it and add it under **Redirect URLs** (also `http://localhost:8888` for local development). Confirmation and password-reset links depend on this.

### 2. GitHub
```bash
cd masterflow
git init
git add .
git commit -m "MasterFlow"
git branch -M main
git remote add origin https://github.com/YOUR-USER/masterflow.git
git push -u origin main
```
`.env` files are git-ignored. Never commit keys.

### 3. Netlify
1. **Add new site → Import from Git**, pick the repo. Build settings come from `netlify.toml` (`npm run build`, publish `dist`, functions in `netlify/functions`).
2. **Site configuration → Environment variables**, add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
| `SECRETS_ENCRYPTION_KEY` | output of `openssl rand -base64 32` |

3. Deploy. Then finish step 1.5 with the live URL.

### 4. First run checklist
1. Open the site, **Create account**, confirm the email if required, sign in.
2. The agent greets you, explains how it works and asks setup questions, but it can't answer until you add a key: **☰ → Settings → Model**, paste a key, **Save key**.
3. Answer the setup questions. Projects appear under **Projects**, and the board appears beside the chat.
4. Open the site in a second browser: changes should appear live (Realtime).
5. Try the 🎤 button. Browsers ask for microphone permission on the first use (HTTPS required, which Netlify provides).

## Local development
```bash
npm install
cp .env.example .env     # fill in the values
npm i -g netlify-cli
netlify dev              # app on http://localhost:8888 with the functions working
```
`npm run dev` alone serves only the front end; chat and key saving need the functions, so use `netlify dev`.

## Security notes
- **Row Level Security** is on for every table; each row is readable and writable only by its owner. A task or message can only reference the same user's project or thread (checked in the policies).
- Clients cannot write `has_key`, `key_provider` or `key_last4` (column-level grants), so they cannot fake key status.
- The anon key is public by design. The **service-role key bypasses RLS**: keep it only in Netlify's environment variables.
- If you ever change `SECRETS_ENCRYPTION_KEY`, stored keys become unreadable and users must re-enter them. Back the value up.
- `netlify.toml` sets a fairly strict Content-Security-Policy. If you add a script, font or API from another host, add it to `connect-src` / `script-src` or the browser will block it.

## Known limits and next steps
- **Not yet tested against live Supabase or Netlify.** The code passes syntax checks and a unit check of the crypto and parsing helpers, but you should expect to fix small things on first deploy. Send me the browser console or Netlify function log and I will fix them.
- **Check-ins and the 18:00 summary only run while the app is open in a browser.** Real background scheduling needs a server job (Supabase scheduled Edge Function or Netlify scheduled function) plus web push notifications.
- **Voice** uses the browser's built-in speech recognition and synthesis (Chrome and Safari; not Firefox). A more reliable version records audio and sends it to a speech-to-text service from a function.
- **Default models** (`claude-sonnet-5-5`, `claude-haiku-5-5`, `gpt-4o`, `gpt-4o-mini`) are set in `netlify/lib/shared.mjs`; users can override the main model in Settings. Update them when your providers retire models.
- Cost control: each request sends the settings, the active project's open tasks, a short rolling summary and the last 12 messages, never the whole history. Chats are one thread per day.
- Data from the claude.ai prototype is not migrated.
