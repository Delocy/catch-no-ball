Catch No Ball is a Cloudflare Worker plus a phone web page. It turns Singlish into one card per sentence (what was said, what it meant, one tone label). See IMPL.md for the plan and PRD.md for the requirements.

## Conventions

- Split IO from pure logic. IO functions take their dependencies (`fetchImpl`, `env`, `deps`) as arguments. Test the pure part, and test IO with injected fakes. Unit tests never make real network calls.
- Secrets come from `env` only (`.dev.vars` locally, `wrangler secret put` for deploys), never in code, `wrangler.toml` or committed files. The only secrets are `OPENCODE_API_KEY` and `MERALION_API_KEY`.
- Run `npm test` and `npm run coverage` (exit 0, over 80%) before handing over.
- No runtime npm dependencies and no build step. `wrangler` is the only dev dependency.
- Tested code must not import `.html`/`.css` files or `cloudflare:workers`. Only `src/index.js` imports text files.
- Client JS lives in `src/client/*.js`, is served at `/client/<name>`, and uses relative imports. `src/client/app.js` is DOM glue only and makes no decisions: every branch lives in a tested module.
- Escape all model output before it reaches HTML.
- `public/`, `evals/` and `docs/presentation/` belong to teammates; do not edit them from here.
- Main-flow files owned by A: `src/`, `test/`, `package.json`, `wrangler.toml`, `.dev.vars.example`, `CLAUDE.md`.
