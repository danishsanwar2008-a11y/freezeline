# FreezeLine

FreezeLine is an AI agent for water utilities during hard freezes: it scores freeze risk house by house and builds a coordinated drip plan, so at-risk homes are protected while water pressure stays above 20 psi. The demo replays Winter Storm Uri (Feb 14–18, 2021) over Houston on the City Operations console, the only screen, which is for utility officials. Households never see the console: they get texts and calls, and sign up on the public `/register` page.

## Run it on Windows

1. Install [Node.js 20 or newer](https://nodejs.org) and [Git](https://git-scm.com/download/win).
2. In PowerShell:

```powershell
git clone https://github.com/danishsanwar2008-a11y/freezeline.git
cd freezeline
npm install                          # also copies the MapLibre worker into public/
Copy-Item .env.example .env.local    # then fill in the values (see below)
npm run dev
```

3. Open http://localhost:3000/console and sign in with the console password.

Checks before you push: `npm test` and `npm run messages:check`.

## Values to get from Danish

Put these in `.env.local`. Never commit that file; it is git-ignored.

| Variable | Needed? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server and scripts only) |
| `CONSOLE_PASSWORD` | Yes. The shared password for `/console` (sign in at `/login`) |
| `LLM_PROVIDER` | No. Keep `pregenerated` (pre-written text, no AI calls) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Only if `LLM_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | Only if `LLM_PROVIDER=anthropic` |

## Project rules

`CLAUDE.md` (and `AGENTS.md`, which it includes) holds the project rules: the phase plan, who sees what, the honesty and crew rules, and the visual design rules. Read it before changing anything.
