// Downloads the eval clips listed in evals/references.json into evals/clips/.
// Each entry's "source" names a row of MERaLiON/Multitask-National-Speech-Corpus-v1 (ASR-PART3-Test).
// Usage (from the repo root): node evals/fetch-clips.js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DATASET = "MERaLiON/Multitask-National-Speech-Corpus-v1";
const CONFIG = "ASR-PART3-Test";
const ROWS_API = "https://datasets-server.huggingface.co/rows";

export function rowFromSource(source) {
  const m = /row (\d+)$/.exec(source ?? "");
  if (!m) throw new Error(`can't read a row number from source "${source}"`);
  return Number(m[1]);
}

async function fetchRow(row) {
  const url = `${ROWS_API}?dataset=${encodeURIComponent(DATASET)}&config=${CONFIG}&split=train&offset=${row}&length=1`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()).rows[0].row;
    if (attempt === 3) throw new Error(`row ${row}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}

async function main() {
  const refs = JSON.parse(await readFile("evals/references.json", "utf8"));
  await mkdir("evals/clips", { recursive: true });
  for (const ref of refs) {
    const row = rowFromSource(ref.source);
    const { context } = await fetchRow(row);
    const src = Array.isArray(context) ? context[0].src : context.src;
    const audio = await fetch(src);
    if (!audio.ok) throw new Error(`${ref.clip}: audio HTTP ${audio.status}`);
    await writeFile(`evals/clips/${ref.clip}`, Buffer.from(await audio.arrayBuffer()));
    console.log(`${ref.clip}  row ${row}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
