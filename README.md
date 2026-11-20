# Catch No Ball

*For when you catch no ball.*

A phone web app for newcomers at Singapore offices. It listens during a meeting and shows a card for each Singlish sentence: what was said, what it meant, and the tone (firm, reluctant, doubtful…). Plain-English sentences are shown faded and unchanged.

- **Speech:** MERaLiON (A*STAR's Singapore-built speech model) turns Singlish audio into a transcript plus its own reading of the meaning and the tone of voice.
- **Cards:** OpenCode Go (the course's AI back-end) checks that reading and writes the final card.
- **Backup:** Whisper on Cloudflare Workers AI takes over automatically if MERaLiON is unavailable ("Backup mode").
- **Hosting:** one Cloudflare Worker on the free plan. `public/` is served as static files.

## Read these first

| Doc | What it's for |
|---|---|
| [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) | The problem, who it's for, the riskiest bet |
| [PRD.md](PRD.md) | Requirements: user stories, success metrics (8/10 comprehension; plain English never reworded), scope for the 1-week build |
| [IMPL.md](IMPL.md) | The build plan: **Team split** (who owns what) and the 9 vertical slices |
| [reports/](reports/) | Status logs and summaries from each step |

## Who owns what

Everyone edits only their own folders, so we can all work at the same time without merge conflicts. The details and exact contracts are in the **Team split** section of [IMPL.md](IMPL.md).

| Person | Owns | Work |
|---|---|---|
| **A** | `src/`, `test/`, `package.json`, `wrangler.toml` and other shared config | The app pipeline (slices 1–4, 6, 8) and deploys |
| **B** | `evals/`, `reports/r1-*`, `reports/r2-*` | Day-1 risk checks, the 15 eval clips and `evals/references.json`, the eval scripts (slice 7) |
| **C** | `public/`, `docs/presentation/` | The landing page, logo, icons and manifest (front end of slices 5 and 9), the demo video, the presentation |

## How we work

1. Get the latest main:
   ```bash
   git pull origin main
   ```
2. **B and C:** work on your own branch and open a pull request to `main`. Touch only your own folders.
   ```bash
   git switch -c c/landing-page
   ```
3. A reviews and merges PRs. A's approved slices go straight to `main`.
4. Need a change in a shared file (`package.json`, `wrangler.toml`, `src/`)? Ask A.

## Secrets and privacy

- API keys (`OPENCODE_API_KEY`, `MERALION_API_KEY`) and `ACCESS_CODE` / `DEMO_KEY` live only in A's `.dev.vars`, which git ignores. Never commit or paste them in chat.
- Eval recordings are people's voices. Keep them in `evals/clips/` (git ignores it) and share them privately. Everyone recorded must agree to their audio being sent to MERaLiON (A*STAR) and Cloudflare.
- MERaLiON's free tier is small (1 hour of audio a month), so only A's app and the eval runs use the key.

## Running it

There's no app code yet. Slice 1 adds `package.json` and the `npm test` / `npm run dev` / `npm run coverage` scripts, and this section will be updated then. Test coverage must stay above 80%.
