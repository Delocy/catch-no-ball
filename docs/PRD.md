# Catch No Ball: project requirements

**Status:** draft, 2026-11-20
**Builds on:** [PRODUCT_BRIEF.md](../PRODUCT_BRIEF.md) (the why) and the "Project ideas brainstorm" session (stack and free-tier research).
**Tagline:** *For when you catch no ball.*

---

## 1. Why this exists

Foreign professionals in their first three months at a Singapore office lose what colleagues mean when talk slips into Singlish. The words are only half of it. The tone is the rest: "can lor" is a reluctant yes, and "confirm cannot one lah" is a firm no. Rather than keep asking, newcomers nod along, misread decisions, and end up redoing work.

Catch No Ball listens on the newcomer's phone during a meeting and shows a card for each Singlish sentence: what was said, what it meant, and the tone. Plain English sentences stay faded, so the user only looks when there's something to read.

This is also a course project (IDG AI 301). The course rules are listed in section 3.

## 2. Who it's for

**Primary user:** a foreign professional in their first three months at a Singapore office, sitting in a team meeting and holding their own phone.

**Not the user:** the Singaporean colleagues speaking. They never touch the app. They are told it's on (see F2).

## 3. Course requirements (constraints)

| Requirement | How we meet it |
|---|---|
| Go through product thinking first | PRODUCT_BRIEF.md |
| AI back-end using the course OpenCode Go key, not "a chatbot over existing features" | OpenCode Go decides whether each sentence has Singlish, then writes the meaning, tone and terms. There is no chat box. |
| Landing page with product name and logo | F10 |
| "Something new" the course hasn't taught | **MERaLiON**, A*STAR's Singapore-built speech model, used for Singlish speech recognition. *(My call. Remotion for the video is a backup.)* |
| Video demo (marketing video or narrated click-through) | D2 |
| Live presentation | D3 |
| Deploy online (optional) | We deploy, on a free `*.workers.dev` address. |

**Money constraint:** everything runs on free tiers. Nothing in this document needs a paid plan or a custom domain.

**MCP is not a course requirement.** The course rules are the six rows above. MCP came from a classmate's example structure (voice models, fast decision model, own loop, MCP, evals), which we borrowed, not from the rules. That's why the Anki glossary is under "Later" (section 13).

## 4. Goals, non-goals, anti-goals

**Goals (v1)**
1. A newcomer understands more Singlish sentences correctly, tone included, with the app than without it.
2. A card appears quickly enough that the newcomer can still follow the conversation it belongs to (target in section 9).
3. A working demo on demo day that runs within free-tier limits.

**Non-goals (taken from the brief)**
- Anything outside Singlish in Singapore offices: no hawker, family or Mandarin/Malay/Hokkien modes in v1.
- Translating sentences that are already plain English.
- Lessons, quizzes or full meeting transcripts.
- Accounts, login or history across sessions.

**Anti-goals (a failure even if it technically works)**
- **Confident wrong tone.** Calling a reluctant "can lor" a firm yes is the exact harm we exist to stop. When unsure, show both readings. Never guess.
- **"Translating" plain English.** Rewording sentences that were already clear adds noise and trains the user to ignore cards.
- **Recording people secretly.** The app always shows that it's listening, and it never stores audio.
- **A wall of text.** If the user has to read every card in full, they stop following the meeting.

## 5. Approaches considered

How audio gets from the phone to a card:

| Approach | What the user sees | Trade-off |
|---|---|---|
| **A. Short clips (chosen)** | The phone records in ~15 s chunks. Each chunk goes through the Worker to MERaLiON, then OpenCode Go. A card appears ~5–15 s after the sentence. | Simple to build and test. Keeps under MERaLiON's 5 requests/minute. "Nearly live", not word by word. |
| B. Live streaming | Words appear as people speak, like captions. | Most impressive, but MERaLiON's streaming limits and docs are unconfirmed, and holding a connection open through Workers is more work. Too risky for demo day. Listed under "later". |
| C. Recap after the meeting | All cards appear at once after Stop. | Cheapest, but the user stays lost *during* the meeting. Kept as the fallback if the riskiest-bet test (brief) says people won't look at their phone mid-meeting. |

The user picked **A**.

## 6. User stories (v1)

From the brief, with "done when":

1. **Start listening.** As a newcomer, I start listening and tell the table I'm using a translator. *Done when a "Translating" label shows.*
2. **Glance and follow.** As a newcomer, I glance once and keep following. *Done when a card shows what was said, what it meant, and the tone.*
3. **Only look when needed.** As a newcomer, I look only when there's something to read. *Done when plain-English sentences show faded.*
4. **Understand a word.** As a newcomer, I tap a highlighted word like *siam* and see "skip / avoid", with a link to learn more.
5. **Keep words.** As a newcomer, I star a word, and at Stop I see "You caught N Singlish terms" with my starred words.

## 7. Functional requirements

### The app (phone-first web page)

**F1. Pick a setting.** The start screen offers **Office meeting**, which is the only setting in v1. The choice is sent as context to the model, so for example "confirm" is read as "definitely".

**F2. Listen with consent.**
- Tapping **Listen** asks for microphone permission, then shows a persistent **"Translating"** label and a reminder: "Let the table know you're using a translator."
- The label stays visible for as long as the mic is on.
- Tapping **Stop** ends listening and opens the summary (F7).

**F3. Capture audio in chunks.**
- Record in chunks of about 15 seconds.
- Each chunk is sent to the Worker as 16 kHz mono audio, which is what MERaLiON expects. Max 30 s per request.
- Chunks are sent in order, and their cards show in order.
- Recording continues while earlier chunks are being processed.

**F4. Show a card per sentence.** Each sentence in a chunk becomes one card:

```
┌───────────────────────────────────────────┐
│ "Eh the deadline confirm cannot shift     │
│  one lah"                                 │  ← what was said (Singlish terms underlined)
│ The deadline definitely can't be moved.   │  ← what it meant (one short sentence)
│ [ firm ]                                  │  ← tone label
└───────────────────────────────────────────┘
```
- **Plain English sentences** show as a single faded line. There's no meaning or tone for them.
- **Tone labels** come from a fixed set: `firm`, `reluctant`, `doubtful`, `joking`, `casual`, `neutral`. *(My call. The model must pick from this list.)*
- The newest card is at the bottom, and the view auto-scrolls unless the user has scrolled up.

**F5. Unclear meaning shows both readings.** If the model isn't confident about the meaning or the tone:
1. Retry once with the previous 2–3 sentences as context.
2. If it's still unsure, show both readings: "Could mean: *they doubt it* **or** *they're asking you*." Never show just one guess.

**F6. Tap a term.**
- Tapping an underlined term opens a small sheet with the term, a short plain-English gloss, a **star** button, and a **"Learn more"** link to `https://singlishdict.app/?q=<term>`.
- If the model doesn't recognise the word, the sheet says **"New to me"** and keeps the Learn more link.

**F7. Summary at Stop.**
- Shows "You caught N Singlish terms" (N = distinct terms highlighted this session) and lists the starred ones, each with its gloss and Learn more link.
- Starred terms stay on this device (browser storage) so they survive a reload. There's no account.

**F8. When things go wrong.**

| Situation | What the user sees |
|---|---|
| A chunk couldn't be transcribed (noise, silence, garbled) | A card: **"Couldn't catch that"** with a text box to type what they heard. Typed text goes through the same steps as speech, minus transcription. |
| Silence (no speech in the chunk) | Nothing. No card. |
| Network down or the Worker unreachable | A banner: **"Subtitles paused, reconnecting"**. Cards already shown stay. Recording continues, and queued chunks are sent when the connection is back. *(How many to queue is the builder's call, but never lose cards already shown.)* |
| MERaLiON at its limit or erroring | Switch to Whisper automatically and show a small **"Backup mode"** label. |
| OpenCode Go erroring | The card shows the transcript only, with "Meaning unavailable, tap to retry". |
| Mic permission denied | A screen explaining how to allow the mic, plus a **type instead** box. |

**F9. Type instead.** A text box is always available, for the "Couldn't catch that" case or for pasting a Singlish line from a group chat. It produces cards the same way.

### Landing page

**F10. Landing page** at `/`:
- Name, logo (a speech bubble with a small ball inside, hand-drawn SVG), tagline, a one-paragraph explanation, and an example card.
- An **Open the app** button that goes to the app (e.g. `/app`).
- A line on privacy: audio is sent to A*STAR's MERaLiON service for transcription and is not stored by us.
- It works as a home-screen shortcut (web app manifest and icon).

## 8. How a chunk is processed (back-end)

```
Phone ──15 s audio──► Worker /api/chunk
                       │
                       ├─► transcribe: MERaLiON /v1/audio/transcriptions
                       │      ├─ limit hit or error ──► Workers AI whisper-large-v3-turbo (backup mode)
                       │      └─ cache: transcript keyed by audio hash (KV)
                       │
                       ├─► interpret: OpenCode Go chat completion
                       │      input: transcript, setting, previous 2–3 sentences
                       │      output: JSON (below)
                       │      low confidence ──► retry once with more context ──► still low: two readings
                       │
                       └─► return cards JSON to the phone
```

**B1. One Worker** serves the landing page, the app page and the API. It follows the Lunch Uncle setup: a plain JavaScript Worker, `wrangler`, no runtime npm dependencies, HTML imported as text, and `node --test` for tests.

**B2. Transcription.**
- Primary: MERaLiON hosted API, `POST https://api.meralion.ai/v1/audio/transcriptions`, with a Bearer key from `env.MERALION_API_KEY`.
- Backup: Workers AI `@cf/openai/whisper-large-v3-turbo`.
- A config flag forces Whisper for development, so we don't spend MERaLiON's monthly hour while building.

**B3. MERaLiON rate guard.**
- The Worker must never send more than 5 MERaLiON requests in any minute.
- Over the limit, go to Whisper rather than wait.
- How the count is kept (Durable Object or otherwise) is the builder's call. It must be accurate across requests, and KV alone is not.

**B3a. Monthly MERaLiON budget.** *(My call.)*
- The same counter as B3 also tracks MERaLiON audio seconds used this calendar month.
- Once 45 minutes are used, normal sessions go to Whisper. The last 15 minutes are kept for the demo.
- A **demo flag** (a secret-protected setting, e.g. an env var or a request header only the presenter's phone sends) lets a session use the reserved minutes.
- v1 is meant for course events (evals, the E1 test, rehearsals, the demo), not daily use in real meetings. The free tier can't cover real meetings.
- Only one phone should use MERaLiON at a time. Other phones in the room go to Whisper and show "Backup mode", which is fine.

**B3b. Access code.** *(My call.)*
- The API is on a public URL, so every `/api/*` request must carry a shared access code, checked against `env.ACCESS_CODE`.
- The app asks for the code once and remembers it on the device.
- Without the code, the API returns 401 and spends no quota.
- This protects the MERaLiON quota and the course key without accounts. The landing page stays public.

**B4. Interpretation.** OpenCode Go, OpenAI-compatible:
- Base URL `https://opencode.ai/inference/go/v1`. Lunch Uncle already uses this with `deepseek-v4.1-flash`. Start with that model, and pick another if evals say so.
- Every call sends `x-opencode-session` (one id per listening session) and an app-specific `user-agent`.
- Key from `env.OPENCODE_API_KEY`.

Response shape (one entry per sentence):
```json
{
  "sentences": [
    {
      "said": "Eh the deadline confirm cannot shift one lah",
      "hasSinglish": true,
      "meaning": "The deadline definitely can't be moved.",
      "tone": "firm",
      "confident": true,
      "readings": [],
      "terms": [
        { "term": "confirm", "gloss": "definitely", "known": true },
        { "term": "lah", "gloss": "adds emphasis; here, firm", "known": true }
      ]
    }
  ]
}
```
- When `confident` is false after the retry, `readings` holds two `{ "meaning", "tone" }` alternatives, and the card shows both.
- The Worker validates this shape. A malformed reply counts as an OpenCode Go error (F8).

**B5. Sentence splitting.** A 15 s chunk may cut a sentence in half. The previous chunk's last sentence is sent as context so the model can join it up. How exactly to handle the split is the builder's call.

**B6. Data handling.**
- Audio is never stored, by us or in the cache.
- Transcripts may be cached in KV by audio hash, with a TTL of 7 days or less, only to avoid re-transcribing the same clip during evals.
- Nothing is linked to a person.

**B7. Secrets** live in `.dev.vars` locally (gitignored) and in `wrangler secret put` for deploys. They never go in code or `wrangler.toml`.

## 9. Non-functional requirements

- **Phone-first.** Works in Safari on iPhone and Chrome on Android, in portrait, one-handed. Microphone access needs HTTPS, which `workers.dev` provides.
- **Speed.** A card appears within **15 s of the end of the chunk it belongs to** in normal conditions. This is a target to measure, not yet a promise.
- **Glanceable.** "What it meant" is one short sentence. Tone is one word. Cards use large type and high contrast, and support dark mode.
- **Free.** Stay within free tiers (section 11).
- **Honest UI.** The "Translating" label and the "Backup mode" label are never hidden.

## 10. Evals and success

**E1. Comprehension test (the success metric).**
- Play 10 Singlish office sentences to 3–5 non-Singaporeans, with and without the app's cards.
- Ask "what did they mean?" and "were they agreeing, refusing or unsure?".
- Count how many they get fully right. The baseline guess is 4–5 out of 10, and this test checks it.

**E2. Model evals: 25 recorded clips.**
- Each clip is ~8 s of office Singlish, with a reference meaning and tone written by a Singaporean. Include some plain-English clips and some deliberately ambiguous ones (can meh / can lor).

| Score | What it checks |
|---|---|
| Meaning correct | Does `meaning` match the reference? |
| Tone correct | Does `tone` match the reference label? |
| Plain English left alone | Are plain clips marked `hasSinglish: false`? |
| Ambiguity honest | Do ambiguous clips get two readings, not one confident guess? |
| Particles kept (ASR) | Does the transcript keep lah/lor/meh/siam? **Compare MERaLiON with Whisper on the same clips.** |

Compare **two interpretation prompts** on the same set and keep the better one.

- An eval script runs the 25 clips through the real pipeline and prints a score table.
- Your team records the clips. A Singaporean teammate writes each reference meaning and tone.
- *(My call)* **Audio stays out of git.** Clips go in a gitignored `evals/clips/` folder (shared privately). Only the reference text file (`evals/references.json`: clip filename, reference meaning, tone, hasSinglish, ambiguous) is committed. Everyone recorded agrees to the clips being sent to MERaLiON and Whisper.
- *(My call)* **E1 uses prepared cards.** Cards for the 10 test sentences are generated once from an eval run and shown from a fixed page or screenshots. E1 then measures whether the cards help, without depending on live network calls or using MERaLiON's quota.

**Targets:** not set yet (open question 1). The brief leaves "target" and "must not get worse" blank.

## 11. Free-tier budget

| Service | Free limit | How we stay inside it |
|---|---|---|
| MERaLiON API | 5 req/min, 1,000 req/month, **1 hour audio/month**, 100k tokens/month | 15 s chunks (4/min), rate guard (B3), develop on Whisper, cache transcripts. One eval run ≈ 3–4 min of audio, a 3-min demo ≈ 3 min, so there's room for ~10 eval runs plus rehearsals. |
| Workers AI (Whisper) | 10,000 neurons/day ≈ 214 audio min/day | Development and backup only. |
| Cloudflare Workers | 100,000 req/day, 10 ms CPU per request | Requests mostly wait on network calls, which doesn't count as CPU time. Keep any audio work on the phone. |
| OpenCode Go | Course key | Confirm the course pays. It's meant for coding agents and traffic is monitored, so keep calls modest. |

## 12. Deliverables

- **D1.** The deployed Worker: landing page, app and API at `catchnoball.<account>.workers.dev`.
- **D2.** Demo video: a narrated click-through recorded with QuickTime. Remotion is optional.
- **D3.** Live presentation, including the E1 before/after result and the MERaLiON vs Whisper particle chart.
- **D4.** The eval script and the 25-clip set.

**Demo script (60 s):**
1. A Singaporean teammate says "Eh the deadline confirm cannot shift one lah, we just siam the meeting and go makan first lor."
2. A foreign classmate holds the phone, and the card appears with the meaning and a *firm* tone label.
3. Tap *siam*, star it, tap Stop, and show "You caught N Singlish terms".
4. Ask the room: "Before the app, how many of you caught that?"

## 13. Later (not required for v1)

- **Glossary to Anki via MCP.** Starred terms go into an Anki deck through AnkiConnect, for review outside the app. This is the course's MCP piece if time allows. It's described here, but v1 doesn't need it.
- Live streaming captions (approach B).
- Recap mode (approach C), as a switch.
- "Explain more" cultural notes per card. Reply helper.
- Hawker, lunch and casual settings, and other languages mixed in.

## 14. Risks and open questions

**Risks to test early (cheapest first)**
1. **MERaLiON keeps Singlish intact.** Record 5 clips in the MERaLiON playground and check that lah/lor/siam survive. Pass: 4 of 5. *Not run yet.*
   **If it fails (decided):** keep MERaLiON as the main recogniser anyway, since it's the "something new". The interpretation prompt must cope with missing particles, using context and word choice for tone. Report the result honestly in the presentation with the MERaLiON vs Whisper chart (E2).
2. **People will look at a phone mid-meeting.** This is the riskiest bet in the brief, tested with a mock meeting and 3–5 people. If most say "only after", switch to approach C. *Not run yet.*
3. **MERaLiON's accepted audio formats.** Phones record webm/opus (Chrome) or mp4/aac (Safari). We may need to convert to 16 kHz mono WAV on the phone. Check before building F3.
4. **OpenCode Go from an app.** It's designed for coding agents. Lunch Uncle already calls it from a Worker, which suggests it works.
5. **Noisy lunch rooms.** Out of scope for v1 (office meeting only). Note it as a known limit.

**Open questions for you**
1. What target counts as working (e.g. 8/10 on E1), and what must not get worse?
2. Is there a submission deadline? It decides how much of section 13 is realistic.

## 15. Left to the builder

- Exact chunk length (12–20 s is fine) and how sentences split across chunks (B5).
- How the MERaLiON rate guard is implemented (B3).
- How many chunks to queue offline (F8).
- The prompt wording, as long as it returns the B4 shape and uses the fixed tone list.
- The file layout inside the Worker, following the Lunch Uncle conventions.
- Visual design beyond the card layout in F4.
