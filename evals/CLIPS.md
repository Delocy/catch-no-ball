# Eval clips

The 15 eval clips are real Singaporean conversation from the IMDA National Speech Corpus, Part 3, as published by MERaLiON on Hugging Face: [Multitask-National-Speech-Corpus-v1](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1), subset `ASR-PART3-Test`. The audio is not committed (the licence is not confirmed, and `evals/clips/` is gitignored).

**Get the audio:** run `node evals/fetch-clips.js` from the repo root. It reads `evals/references.json` and saves each clip to `evals/clips/` (16 kHz mono WAV, the format the app takes). Or open a row link below and play or download it in the Hugging Face viewer.

Clips 01–10 contain Singlish particles. Clips 11–15 are the most plain-English rows found, for the plain-English check (M2). Full reference transcripts are in `references.json`.

| Clip | Row | Length | Singlish | Particles | Starts with | Listen |
|---|---|---|---|---|---|---|
| 01.wav | 14 | 18 s | yes | lah | cannot lah because the momo only showing at cathay… | [row 14](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=14) |
| 02.wav | 4 | 28 s | yes | lah | ah even the NTUC that NTUC the the thing… | [row 4](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=4) |
| 03.wav | 20 | 28 s | yes | lah | some some tech job lah and then he because… | [row 20](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=20) |
| 04.wav | 41 | 28 s | yes | lah, lor | that's one of the pettiest reason lah why I… | [row 41](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=41) |
| 05.wav | 25 | 25 s | yes | lah, leh | even though my work place is very near ya… | [row 25](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=25) |
| 06.wav | 17 | 23 s | yes | lah | that's leadership why was there a gap in your… | [row 17](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=17) |
| 07.wav | 29 | 27 s | yes | lah | like so he's like a senior so he has… | [row 29](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=29) |
| 08.wav | 34 | 28 s | yes | lah | thing that I need to do on my own… | [row 34](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=34) |
| 09.wav | 3 | 27 s | yes | lah | okay so I don't think there's any difference in… | [row 3](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=3) |
| 10.wav | 16 | 29 s | yes | lah | nobody put us and very random places that we… | [row 16](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=16) |
| 11.wav | 2 | 16 s | no | — | the sun or is he facing towards the book… | [row 2](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=2) |
| 12.wav | 31 | 30 s | no | — | primary secondary school is almost free man is free… | [row 31](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=31) |
| 13.wav | 33 | 29 s | no | — | in our bank right now I would expedite our… | [row 33](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=33) |
| 14.wav | 43 | 25 s | no | — | I like the challenge of learning new things later… | [row 43](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=43) |
| 15.wav | 27 | 25 s | no | — | I honestly don't know how to describe a colour… | [row 27](https://huggingface.co/datasets/MERaLiON/Multitask-National-Speech-Corpus-v1/viewer/ASR-PART3-Test/train?row=27) |

**Limits:** these are casual two-speaker chats of 16–30 s, not one-sentence office lines of 3–10 s as the plan describes, and tone and meaning in `references.json` are one person's judgment.
