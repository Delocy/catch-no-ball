# Catch No Ball: product requirements

**Status:** draft for approval, 2026-11-20
**Deadline:** the build ships within 1 week.
**Replaces:** `docs/PRD.md` (used as input). The why lives in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md); this document does not repeat it.
**Tagline:** *For when you catch no ball.*

Labels used below:
- **(guess)** means a number nobody has measured yet.
- **(my call)** means a product decision made in this document, not by the user. Each one can be overruled.
- **Unchecked** marks a risk that has not been tested.

---

## 1. Problem, users, why

**Problem.** Newcomers at a Singapore office miss what colleagues mean, tone included, when meeting talk slips into Singlish. They nod along, read a reluctant "can lor" as a firm yes, and end up redoing work. More in the brief (Problem, Evidence).

**Primary user.** A foreign professional in their first three months at a Singapore office, holding their own phone in a team meeting.

**People affected but not users.** The Singaporean colleagues speaking. They never touch the app, but their speech is sent for transcription, so they must be told the app is on.

**Other audiences for this build.**

| Who | What they need from it |
|---|---|
| Course assessors (IDG AI 301) | The course requirements in section 4, shown at the live presentation and in the video. |
| The presenter on demo day | A demo that works within free-tier limits, using reserved MERaLiON minutes. |
| E1 test participants (3–5 non-Singaporean classmates) | A short test session using prepared cards (section 3). |

**The product in one line.** Hold the phone in a meeting. It listens and shows a card for each Singlish sentence: what was said, what it meant, and the tone. Plain-English sentences show faded and unchanged.

---

## 2. Goals, non-goals, anti-goals

**Goals (this week)**
1. With the cards, a newcomer understands 8 of 10 Singlish office sentences correctly, tone included (section 3).
2. Plain-English sentences are never reworded (section 3).
3. A card arrives soon enough after the sentence that the newcomer can still follow the conversation.
4. A working, deployed demo that meets every course requirement and costs nothing.

**Non-goals**
- Anything outside Singlish in Singapore offices: no lunch, hawker or family settings, and no Mandarin/Malay/Hokkien modes.
- Translating sentences that are already plain English.
- Lessons, quizzes, full meeting transcripts or meeting minutes.
- Accounts, login, or history across sessions.
- Use in real, day-to-day meetings. The free MERaLiON tier (1 hour of audio a month) only covers course events: evals, the E1 test, rehearsals and the demo.
- Everything in section 8 "Later", including the Anki glossary over MCP (MCP is not a course rule).

**Anti-goals (a failure even if it technically works)**
- **Confident wrong tone.** Calling a reluctant "can lor" a firm yes is the exact harm we exist to stop. When unsure, show two readings, never one guess.
- **Rewording plain English.** It adds noise and trains the user to ignore cards. This is the must-not-worsen rule.
- **Listening secretly.** The "Translating" label is always visible while the mic is on, and audio is never stored.
- **A wall of text.** If a card takes more than a glance, the user stops following the meeting.
- **A chatbot.** There is no chat box. The model works behind the cards.

---

## 3. Success metrics

| Metric | Target | How it is measured | When |
|---|---|---|---|
| **M1. Comprehension (the success metric)** | **8 of 10** with cards. Today's level is 4–5 of 10 **(guess)**. | Test E1, below. | Day 5–6 |
| **M2. Must not get worse: plain English is never reworded** | **0** plain-English sentences reworded, in every eval run and in the demo. | Test E2's plain-English clips, plus automated tests (below). | Every eval run |
| M3. Card speed | A card shows within **15 s of the end of the clip** it came from **(guess: target to measure, not a promise)**. | Time from clip end to card on screen, logged during the eval run and a rehearsal. | Day 4–5 |
| M4. Test coverage | **Over 80%** line coverage. | Node's built-in coverage report from `node --test`. | Every slice |
| M5. Cost | **$0**. | No paid plan or custom domain is ever turned on. | Whole week |

### E1. Comprehension test (measures M1)

- **Sentences:** 10 office Singlish sentences, recorded by Singaporean teammates. At least 2 are deliberately ambiguous (for example "can meh" vs "can lor"). A Singaporean teammate writes the reference meaning and tone for each.
- **People:** 3–5 non-Singaporean classmates.
- **Without cards:** each participant hears the 10 clips and answers, for each one, "what did they mean?" and "were they agreeing, refusing or unsure?". This checks the 4–5 guess.
- **With cards:** they hear the clips again, this time with the app's cards. The cards are **prepared**: generated once from an eval run and shown from a fixed page or screenshots, so E1 uses no network calls and no MERaLiON quota (approved earlier).
- **Scoring:** a sentence counts as understood only if both the meaning and the stance are right. A Singaporean teammate scores each answer against the reference. Meaning is scored by a person, not by a script (approved earlier).
- **Pass (my call):** the **median** participant scores 8 or more out of 10 with cards. See open question Q1.
- **Honest limits:** 3–5 people is too few to prove anything statistically. Hearing a clip a second time helps on its own, so the with-cards score is flattered. Report both points in the presentation.

### E2. Pipeline eval (measures M2, feeds E1, compares speech recognisers)

Kept small for the 1-week deadline: **15 clips** instead of the earlier 25 (my call).

| Clips | Count | Why |
|---|---|---|
| The E1 Singlish sentences | 10 | Same clips as E1. The eval run produces E1's prepared cards. |
| Plain-English office sentences | 5 | Checks M2. |

An eval script sends each clip through the real pipeline and prints a score table:

| Score | Checked by |
|---|---|
| Plain English left alone: each plain clip is marked "no Singlish" and shows the transcript only, with no meaning or tone line. **Any miss fails M2.** | Script |
| Tone matches the reference label | Script |
| Ambiguous clips get two readings, not one confident guess | Script |
| Meaning matches the reference | A person |
| Particles kept (lah, lor, meh, siam...): MERaLiON vs Whisper on the same clips | Script, shown as a chart in the presentation |

- Eval audio stays out of git and is shared privately. Only the reference text file is committed (approved earlier).
- Everyone recorded agrees to their clips being sent to MERaLiON (A*STAR) and Whisper (Cloudflare).
- One eval run takes at least 3 minutes because of MERaLiON's 5 requests a minute limit, and uses about 2 minutes of audio **(guess: about 8 s per clip)**.

### M2 also has automated tests

- When the model says a sentence has no Singlish, the card shows exactly the transcript text, faded, with no meaning, tone or terms.
- If the model returns a meaning for a sentence it marked as plain English, the app ignores it.

---

## 4. Course requirements

| Requirement | How it is met | Where |
|---|---|---|
| Product thinking first | PRODUCT_BRIEF.md, then this PRD, then IMPL.md | Done / this doc |
| AI back-end on the course's OpenCode Go key, not a chatbot over features | OpenCode Go decides whether each sentence has Singlish, then writes the meaning, tone and terms that fill the card. There is no chat box. | US-4 to US-6, B4 |
| Landing page with product name and logo | `/` shows the name, a hand-drawn logo, tagline and an example card | US-1, L1 |
| "Something new" the course hasn't taught | **MERaLiON**, A*STAR's Singapore-built speech model, as the main speech recogniser. Kept even if it drops particles; the result is reported honestly with the MERaLiON vs Whisper chart. | B2, E2 |
| Video demo | A narrated click-through, recorded with QuickTime | Day 6 |
| Live presentation | Demo, the E1 before/after result, and the particle chart | Demo day |
| Deploy online (optional) | Deployed on a free `*.workers.dev` address | Day 6 |

---

## 5. User stories

Numbered so they can be sliced. **Must** = in the 1-week build. **Should** = only if the musts are done and tested.

| # | Story | Priority |
|---|---|---|
| US-1 | Open the app from the landing page | Must |
| US-2 | Enter the access code once | Must |
| US-3 | Start listening, with consent | Must |
| US-4 | See a card for each Singlish sentence | Must |
| US-5 | Plain English shows faded and unchanged | Must |
| US-6 | See two readings when the meaning is unclear | Must |
| US-7 | Type what I heard when the app couldn't catch it | Must |
| US-8 | Type a line instead of listening | Must |
| US-9 | Keep my cards when the connection drops | Must |
| US-10 | Keep working when MERaLiON is unavailable | Must |
| US-11 | Retry when the meaning couldn't be worked out | Must |
| US-12 | Presenter uses the reserved demo minutes | Must |
| US-13 | Team runs the eval set and gets a score table | Must |
| US-14 | Tap a Singlish term to see what it means | Should |
| US-15 | Add the app to the home screen | Should |

**US-1. Open the app from the landing page.** As a newcomer, I land on the site and get to the app in one tap.
*Done when:* `/` shows the name, logo, tagline, a one-paragraph explanation, an example card and the privacy line (L1); "Open the app" goes to the app; the page reads well on a phone in portrait.

**US-2. Enter the access code once.** As a newcomer given the code, I type it once and the app remembers it on this device.
*Done when:* a correct code is stored on the device and not asked for again; a wrong code shows "That code didn't work" and spends no MERaLiON or OpenCode Go quota; every `/api/*` request without a valid code gets a 401.

**US-3. Start listening, with consent.** As a newcomer, I tap Listen and tell the table I'm using a translator.
*Done when:* tapping Listen asks for the microphone; once allowed, a "Translating" label and the reminder "Let the table know you're using a translator" show; the label stays visible for as long as the mic is on; Stop turns off the mic and the label.

**US-4. See a card for each Singlish sentence.** As a newcomer, I glance once and keep following.
*Done when:* each Singlish sentence shows one card with what was said (Singlish terms underlined), what it meant (one short sentence) and one tone label from the fixed list (firm, reluctant, doubtful, joking, casual, neutral); cards appear in the order spoken; the newest card is at the bottom and the view auto-scrolls unless I have scrolled up; recording continues while earlier clips are processed.

**US-5. Plain English shows faded and unchanged.** As a newcomer, I look only when there's something to read.
*Done when:* a plain-English sentence shows as one faded line with exactly the transcribed words, and no meaning, tone or terms. This is the must-not-worsen rule (M2).

**US-6. See two readings when the meaning is unclear.** As a newcomer, I'm never given one confident wrong guess.
*Done when:* if the model isn't sure of the meaning or tone, the app retries once with the previous 2–3 sentences as context; if it's still unsure, the card shows "Could mean: … or …" with a tone for each reading.

**US-7. Type what I heard.** As a newcomer, when a clip had speech the app couldn't make out, I can type what I heard.
*Done when:* the card says "Couldn't catch that" with a text box; typed text goes through the same steps as speech, minus transcription, and becomes a normal card. A silent clip shows nothing.

**US-8. Type a line instead of listening.** As a newcomer, I can paste or type a Singlish line, for example from a group chat, or when the mic is blocked.
*Done when:* a text box is always available and produces cards the same way as speech; if mic permission is denied, the app explains how to allow it and offers the text box.

**US-9. Keep my cards when the connection drops.** As a newcomer, I don't lose what I've already read.
*Done when:* a "Subtitles paused, reconnecting" banner shows; cards already shown stay; listening resumes by itself when the connection is back, without me tapping anything; if audio was missed, a faded line says "Missed some speech while offline". (Queuing clips offline is cut, see section 8.)

**US-10. Keep working when MERaLiON is unavailable.** As a newcomer, I still get cards if the main speech recogniser is at its limit or failing.
*Done when:* the app switches to Whisper by itself and shows a small "Backup mode" label that stays visible while backup is in use.

**US-11. Retry when the meaning couldn't be worked out.** As a newcomer, I can still see what was said if the interpretation step fails.
*Done when:* the card shows the transcript with "Meaning unavailable, tap to retry"; tapping retries that sentence only.

**US-12. Presenter uses the reserved demo minutes.** As the presenter, my phone can use MERaLiON on demo day even after normal use has spent its share.
*Done when:* a secret demo key lets a session use the last 15 reserved minutes; without it, sessions switch to Whisper once 45 minutes are used this month.

**US-13. Team runs the eval set.** As the team, we run one command over the 15 clips and get the score table in E2.
*Done when:* the script prints the table, including the plain-English check (M2) and the MERaLiON vs Whisper particle count, and saves the cards for E1.

**US-14 (Should). Tap a term.** As a newcomer, I tap an underlined word like *siam* and see "skip / avoid".
*Done when:* a small sheet shows the term, a short gloss and a "Learn more" link to `https://singlishdict.app/?q=<term>`; if the model doesn't know the word, the sheet says "New to me" and keeps the link.

**US-15 (Should). Add to home screen.** As a newcomer, I open Catch No Ball from a phone shortcut, as in the brief's walkthrough.
*Done when:* the site has a web app manifest and icon, and "Add to Home Screen" opens the app.

---

## 6. Functional requirements

### The app (phone web page)

| ID | Requirement | Story |
|---|---|---|
| A1 | Setting is fixed to **Office meeting** and sent to the model as context (for example "confirm" means "definitely"). No setting picker. | US-4 |
| A2 | Listen / Stop, the always-visible "Translating" label, and the reminder to tell the table. | US-3 |
| A3 | Records about 15 s clips and sends each to the Worker in the format MERaLiON accepts (16 kHz mono, at most 30 s). Clips are sent in order; recording continues while earlier clips are processed. | US-4 |
| A4 | Card layout: what was said (terms underlined), what it meant (one short sentence), one tone label from the fixed list. | US-4 |
| A5 | Plain-English sentences: one faded line, transcript verbatim, nothing else. | US-5 |
| A6 | Two readings when unsure. | US-6 |
| A7 | Always-available text box that produces cards the same way as speech. | US-7, US-8 |
| A8 | Access code asked once, stored on the device. | US-2 |
| A9 | (Should) Term sheet with gloss and singlishdict.app link. Link out only; no scraping or AI use of that site (its terms forbid it). | US-14 |

### Landing page

| ID | Requirement | Story |
|---|---|---|
| L1 | At `/`: name, logo (a speech bubble with a small ball inside, hand-drawn SVG), tagline, one-paragraph explanation, an example card, an "Open the app" button, and a privacy line: "Audio is sent to A*STAR's MERaLiON service for transcription and is never stored by us." | US-1 |
| L2 | (Should) Web app manifest and icon. | US-15 |

### Back-end (one Cloudflare Worker)

| ID | Requirement |
|---|---|
| B1 | One Worker serves the landing page, the app and the API. |
| B2 | **Transcription.** MERaLiON first. Whisper (Workers AI) as backup. A setting forces Whisper during development so MERaLiON's monthly hour isn't spent while building. |
| B3 | **Rate guard.** Never more than 5 MERaLiON requests in any minute. Over the limit, use Whisper rather than wait. The count must be accurate across requests (a Durable Object, approved earlier). |
| B3a | **Monthly budget.** The same counter tracks MERaLiON audio used this calendar month: 45 minutes for normal use, the last 15 reserved for the demo key (US-12). |
| B3b | **Access code** on every `/api/*` request. Without it: 401, and no quota is spent. |
| B4 | **Interpretation** on OpenCode Go with the course key. For each sentence it returns: what was said, whether it has Singlish, the meaning, a tone from the fixed list, whether it is confident, up to two alternative readings, and the Singlish terms with glosses. The Worker checks the reply's shape; a malformed reply counts as an OpenCode Go error (US-11). Every call sends a session id and an app-specific user-agent. |
| B5 | The previous clip's last sentence is sent as context, so a sentence cut in half by a clip boundary can be joined up. |
| B6 | **Transcript cache** in KV, keyed by an audio fingerprint, kept 7 days at most, so eval re-runs don't spend MERaLiON quota. Audio itself is never stored. |
| B7 | Secrets come only from the environment, never from code or config files in git. |

### Error states the user sees

| Situation | What the user sees | Story |
|---|---|---|
| Speech in the clip, but it couldn't be transcribed | Card: "Couldn't catch that" + text box | US-7 |
| Silence | Nothing | US-7 |
| Network down or Worker unreachable | Banner: "Subtitles paused, reconnecting". Cards stay. Then "Missed some speech while offline" if audio was lost. | US-9 |
| MERaLiON at its rate limit, over budget, or erroring | Switches to Whisper, "Backup mode" label | US-10 |
| Both speech recognisers fail | Card: "Couldn't catch that" + text box | US-7 |
| OpenCode Go erroring or malformed reply | Transcript + "Meaning unavailable, tap to retry" | US-11 |
| Model unsure after one retry | "Could mean: … or …" | US-6 |
| Mic permission denied | How to allow the mic, plus the text box | US-8 |
| Browser can't record audio | "This browser can't listen. Type instead." + text box | US-8 |
| Wrong or missing access code | "That code didn't work" | US-2 |

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Phone-first** | Works in Safari on iPhone and Chrome on Android, portrait, one-handed. Large type, high contrast, dark mode. HTTPS (needed for the mic) comes with `workers.dev`. |
| **Speed** | Card within 15 s of the end of its clip, under normal conditions (M3, guess). Clip length (about 15 s) plus processing means a card lands roughly 5–15 s after the sentence. |
| **Glanceable** | Meaning is one short sentence. Tone is one word. |
| **Privacy and consent** | "Translating" label always visible while listening; the user is prompted to tell the table. Audio is never stored. Audio goes to A*STAR (MERaLiON) or Cloudflare (Whisper); transcripts go to OpenCode Go. Transcripts may sit in the KV cache for up to 7 days; nothing is linked to a person. The landing page says where audio goes. Everyone recorded for evals agrees first. |
| **Honest UI** | "Translating" and "Backup mode" are never hidden. Unsure means two readings. |
| **Free tiers and budget** | $0. Free tiers only; no paid plans, no custom domain. Limits below. |
| **Test coverage** | Over 80% line coverage, measured with `node --test` coverage on every slice. |
| **Conventions** | Follow the sibling project Lunch Uncle: plain JS Worker, wrangler 4, no runtime npm dependencies, no build step. |

### Free-tier limits

| Service | Free limit | How we stay inside it |
|---|---|---|
| MERaLiON | 5 requests/min, 1,000 requests/month, 1 hour of audio/month, 100k tokens/month | ~15 s clips (4 a minute), rate guard, 45 + 15 minute budget, Whisper during development, transcript cache. |
| Workers AI Whisper | About 214 audio minutes a day | Development and backup only. |
| Cloudflare Workers | 100k requests/day, 10 ms CPU per request | Requests mostly wait on network calls, which isn't CPU time. Audio conversion happens on the phone. |
| OpenCode Go | Course key; meant for coding agents, traffic is monitored | Keep calls modest: one call per clip, one retry at most. See Q3. |

---

## 8. Constraints, approach and scope

### Chosen approach (engineering owns the detailed design in IMPL.md)

```
Phone ── ~15 s clip ──► Worker ──► MERaLiON (speech to text)
                          │          └─ limit, budget or error ──► Whisper (backup mode)
                          ├──► OpenCode Go (Singlish? meaning, tone, terms)
                          │          └─ unsure ──► retry with context ──► two readings
                          └──► cards back to the phone
```

- **Short clips, chosen by the user.** Live streaming was rejected as too risky. A recap after the meeting is the **fallback** if the phone-in-meeting test fails: the same pipeline, with cards shown at Stop instead of live.
- One Cloudflare Worker on the free plan serves everything (B1).
- MERaLiON stays the main speech recogniser even if it drops particles.

### 1-week scope

| In this build (Must) | Only if time (Should) | Cut from the earlier PRD, and why |
|---|---|---|
| US-1 to US-13 | US-14 tap a term | **Star a term and the "You caught N terms" summary at Stop.** Not in the brief's first version; it's a learning feature, not the core listen → card flow. |
| Landing page with name and logo | US-15 home-screen shortcut | **Setting picker.** Office meeting is the only setting, so a picker screen adds nothing. |
| E1 (10 sentences) and E2 (15 clips) | | **Offline clip queue.** Hard to get right in a week; the banner, kept cards and auto-resume cover the user's main worry. |
| Deploy on `workers.dev`, video, presentation | | **25-clip eval set and comparing two prompts.** Evals stay small: 15 clips, one prompt. Tune the prompt only if E2 shows a problem. |
| | | **Remotion video.** QuickTime click-through meets the requirement. |

**Demo script (60 s), updated for the cuts:**
1. A Singaporean teammate says "Eh the deadline confirm cannot shift one lah, we just siam the meeting and go makan first lor."
2. A foreign classmate holds the phone. A card appears with the meaning and a *firm* tone label.
3. A teammate says one plain-English sentence. It shows faded and unchanged.
4. Ask the room: "Before the app, how many of you caught that?" Then show the E1 before/after result.

### Suggested order for the week (engineering may change it)

| Day | Focus |
|---|---|
| 1 | The three unchecked risks (R1–R3 below), before building on them. Worker skeleton, access code. |
| 2–3 | Listen → clip → MERaLiON → OpenCode Go → card. Plain English faded. Two readings. |
| 4 | Error states, Whisper backup, rate guard and budget, landing page. |
| 5 | Record clips, run E2, run E1. |
| 6 | Deploy, video, presentation. |
| 7 | Buffer. Should-haves only if everything above is done. |

### Later (not this week)

Anki glossary over MCP; starred terms and summary; live streaming captions; recap mode as a switch; "explain more" cultural notes; reply helper; lunch and other settings; other languages mixed in; offline clip queue; noisy-room support.

---

## 9. Risks, assumptions and open questions

### Risks

| # | Risk | Status | Check | If it fails |
|---|---|---|---|---|
| R1 | **MERaLiON drops particles** (lah, lor, meh, siam), which carry the tone. | **Unchecked** | Record 5 clips in the MERaLiON playground. Pass: 4 of 5 keep the particles. Day 1. | Keep MERaLiON (user's decision). The interpretation step uses context and word choice for tone. Report it honestly with the particle chart. |
| R2 | **People won't look at a phone mid-meeting** (the brief's riskiest bet). | **Unchecked** | The brief's mock meeting with 3–5 classmates. Pass: 3 of 5 would use it during or right after, and at most 1 finds it too awkward. | If most say "only after", show cards at Stop instead (recap). Same pipeline. |
| R3 | **MERaLiON's request format** is unconfirmed (looks OpenAI-style: multipart `file` in, JSON `text` out). | **Unchecked** | One real request with our key on day 1, before building transcription. | Adjust the request; Whisper covers the gap meanwhile. |
| R4 | Phones record webm (Chrome) or mp4 (Safari); MERaLiON wants 16 kHz mono. | Unchecked | Part of R3: convert on the phone, test on both. | Conversion on the phone is the plan; the Worker's CPU limit rules out doing it there. |
| R5 | The 15 s target (M3) is missed. | Unmeasured | Timings from E2 and a rehearsal. | Shorter clips (more MERaLiON requests), or accept and report it. |
| R6 | The E1 sample is small, and hearing a clip twice inflates the with-cards score. | Known | — | Report it in the presentation. |
| R7 | MERaLiON's monthly hour runs out before demo day. | Guarded | Budget counter, demo key, Whisper in development. | Demo on Whisper with "Backup mode" showing. |
| R8 | A 15 s clip cuts a sentence in half. | Known | E2 clips are single sentences, so this shows up only live. | The previous sentence is sent as context (B5). |

### Assumptions

- We have a MERaLiON API key (Q2, answered).
- The course's OpenCode Go key can be called from a Worker. Lunch Uncle already does this, which suggests it works.
- The 4–5 of 10 baseline is a **guess**; E1's without-cards run checks it.
- Singaporean teammates are available to record clips and write references this week.
- The office-meeting setting is enough for the demo; noisy lunch rooms are out of scope.

### Open questions

Answered by the user (2026-11-20):
- **Q1.** "8 of 10" means the **median participant** scores 8 or more with cards.
- **Q2.** **We have a MERaLiON API key.** The user puts it in `.dev.vars` when the first speech slice needs it.
- **Q4.** The phone-in-meeting test (R2) **runs on day 1–2**, before the slices go far.

Still open:
- **Q3.** Is there any usage limit on the course's OpenCode Go key we should design for?
