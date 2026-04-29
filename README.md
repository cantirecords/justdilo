# JustDilo

Tap. Speak. Done.

Speak naturally for 10s–2min, get organized, grouped, due-dated tasks instantly.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage, RLS)
- Groq (Whisper-large-v3-turbo + Llama 3.3 70B) — free + fast
- OpenAI (optional fallback)
- Deploys to Vercel

## Setup

### 1. Install

```bash
pnpm install   # or: npm install
```

### 2. Supabase

1. Create a project at https://supabase.com
2. Run `supabase/migrations/0001_init.sql` in the SQL editor
3. Enable Email auth (Magic Link) under Authentication → Providers
4. Set the Site URL to `http://localhost:3000` for dev (and your Vercel URL for prod)

### 3. Get a free Groq key

1. https://console.groq.com → create an API key
2. Or use OpenAI — set `OPENAI_API_KEY` and `AI_PROVIDER=openai`

### 4. Env vars

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
AI_PROVIDER=groq
```

### 5. Run

```bash
pnpm dev
```

Open http://localhost:3000 → magic-link sign-in → tap mic.

## Deploy

```bash
vercel
```

Then add the same env vars in the Vercel dashboard.

## Architecture

- `app/page.tsx` — server-rendered dashboard, hydrated with initial tasks
- `app/api/process-voice/route.ts` — receives audio → uploads → transcribes → extracts → saves
- `lib/ai.ts` — provider-agnostic transcription + JSON-mode extraction
- `proxy.ts` — Supabase auth refresh on every request (Next.js 16 middleware rename)

## Icons

Drop `icon-192.png` and `icon-512.png` into `public/icons/` for PWA installability.
