# product-manager: final report

## What I produced
- `PRD.md` at the repo root. It replaces `docs/PRD.md` (used as input only). I did not delete `docs/PRD.md`; decisions.md says the old files go once the new ones exist, and IMPL.md doesn't exist yet. That's the controller's call.
- Contents: problem/users (pointing to the brief), goals/non-goals/anti-goals, metrics M1–M5 with tests E1 and E2, course-requirement table, 15 numbered user stories with "done when" (US-1..13 Must, US-14..15 Should), functional requirements (A1–A9 app, L1–L2 landing, B1–B7 back-end), an error-state table, non-functional requirements with a free-tier table, approach, 1-week scope with an explicit cut list, a suggested day-by-day order, risks (R1–R3 marked Unchecked), assumptions, and open questions.

## Key decisions and cuts (all labelled "my call" in the PRD where they are mine)
1. **Cut star + "You caught N terms" summary at Stop.** Not in the brief's first version and not part of the core listen -> card flow. Demo script updated so it no longer relies on it.
2. **Evals cut from 25 clips + two-prompt comparison to 15 clips, one prompt.** 10 Singlish clips are the same as E1's sentences (the eval run produces E1's prepared cards); 5 plain-English clips measure the must-not-worsen rule. The MERaLiON vs Whisper particle comparison is kept because it is how we report the "something new" honestly.
3. **Must-not-worsen made testable:** 0 plain-English sentences reworded in every eval run and the demo, plus automated tests that a "no Singlish" sentence shows exactly the transcript and that any meaning the model returns for it is ignored.
4. **8/10 read as the median E1 participant scoring 8+ with cards**, where a sentence counts only if meaning and stance are both right, scored by a Singaporean teammate. Flagged as Q1.
5. Also cut: the setting picker (only one setting), the offline clip queue (replaced by banner + kept cards + auto-resume + a "Missed some speech while offline" line), and Remotion. Tap-a-term and the home-screen manifest became Should-haves.
6. Kept every design call decisions.md lists as approved (access code, 45+15 min budget with demo key, Durable Object rate guard, KV transcript cache, fixed tone list, retry then two readings, eval audio out of git, person-scored meaning, prepared cards for E1).

## Unsure about
- Whether the median is the right reading of 8/10 (Q1).
- Whether a MERaLiON API key exists yet (Q2) and whether the OpenCode Go course key has usage limits (Q3).
- Timing of the phone-in-meeting test (Q4): if it runs after the build, switching to recap is late. I suggested day 1–2.
- E1's with-cards score is flattered by hearing each clip twice, and 3–5 people prove little; the PRD says to report both.
- The 15 s card-speed target and ~8 s clip length are guesses and labelled as such.
