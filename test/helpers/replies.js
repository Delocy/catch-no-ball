// Builds one valid model reply string for interpret tests. Outside the test glob.
export function sentence(overrides = {}) {
  return {
    said: "Eh the deadline confirm cannot shift one lah",
    hasSinglish: true,
    meaning: "The deadline is fixed and will not move.",
    tone: "firm",
    confident: true,
    readings: [],
    terms: [{ term: "confirm", gloss: "definitely", known: true }],
    ...overrides,
  };
}
export function ok(overrides = {}) {
  return JSON.stringify({ sentences: [sentence(overrides)] });
}
export function chatResponse(content, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
