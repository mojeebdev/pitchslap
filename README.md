# PitchSlap

Brutally honest AI-powered pitch feedback for founders. Paste your startup idea (2–5 sentences) and get a no-sugarcoating roast + 3 actionable fixes from a simulated seed-stage VC.

**Live demo:** https://pitchslap.vercel.app (when deployed)

## How it works

- Uses OpenRouter (free tier) with `meta-llama/llama-3.3-70b-instruct:free`
- Strict rate limiting: 3 requests per minute per IP (in-memory + OpenRouter limits)
- Clean JSON output enforced via system prompt + robust parsing
- Fully stateless — no database, no logins

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local`:

```env
OPENROUTER_API_KEY=your_key_here
```

Open http://localhost:3000

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import the project on [Vercel](https://vercel.com).
3. Add the following **Environment Variable** in Vercel:
   - `OPENROUTER_API_KEY` → your OpenRouter key
4. Deploy.

The app is ready for serverless (no persistent state required).

**Note on rate limiting:** The in-memory rate limiter (3 req/min) works well locally but has limited effect on Vercel due to stateless functions. Real protection comes from OpenRouter's free tier limits + the UX messages we show users.

## Tech Stack

- Next.js 16 + TypeScript + Tailwind
- OpenRouter API
- EB Garamond + DM Mono fonts

## Future Improvements (optional)

- Better rate limiting (Vercel KV / Upstash)
- Multiple model fallbacks
- Custom logo / favicon

Built for the 30 Days of Vibeathons challenge by [@mojeebeth](https://x.com/mojeebeth) — [mojeeb.xyz](https://mojeeb.xyz)
