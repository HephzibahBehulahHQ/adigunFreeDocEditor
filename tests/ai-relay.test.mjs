import assert from "node:assert/strict";
import { once } from "node:events";
import { draftUrl, validateDraft } from "../ai-draft-model.js";
import { createRelay } from "../scripts/ai-relay.mjs";

const origin = "https://example.test";
const token = "test-token-not-a-credential";
const upstreamRequests = [];
const relay = createRelay({
  origin,
  upstream: "https://model.example.test/v1/chat/completions",
  model: "test-model",
  accessToken: token,
  providerKey: "test-provider-key",
  limitPerMinute: 3,
  async fetchProvider(url, options) {
    upstreamRequests.push({ url: url.href, body: JSON.parse(options.body), headers: options.headers });
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ title: "Review draft", slides: [{ title: "Overview", content: "Editable text" }] }) } }],
    }), { headers: { "Content-Type": "application/json" } });
  },
});
relay.listen(0, "127.0.0.1");
await once(relay, "listening");
try {
  const url = "http://127.0.0.1:" + relay.address().port + "/draft";
  const send = (data, { site = origin, authorization = token } = {}) => fetch(url, {
    method: "POST",
    headers: { Origin: site, Authorization: "Bearer " + authorization, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const input = { kind: "slides", prompt: "Draft a test deck", consent: true };
  assert.equal((await send(input, { site: "https://wrong.example" })).status, 403);
  assert.equal((await send(input, { authorization: "denied" })).status, 401);
  assert.equal((await send({ ...input, consent: false })).status, 400);
  assert.equal(upstreamRequests.length, 0);
  const accepted = await send(input);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal((await accepted.json()).draft.slides[0].title, "Overview");
  assert.equal(upstreamRequests[0].body.messages.at(-1).content, input.prompt);
  assert.equal(upstreamRequests[0].headers.Authorization, "Bearer test-provider-key");
  assert.equal((await send({ ...input, kind: "document" })).status, 502, "an invalid provider draft cannot enter the editor workflow");
  assert.equal((await send(input)).status, 429, "the relay bounds provider requests");
  assert.throws(() => draftUrl("http://untrusted.example/draft"), /HTTPS/);
  assert.throws(() => validateDraft("slides", { title: "", slides: [] }), /valid draft/);
} finally {
  await new Promise((resolve, reject) => relay.close((error) => error ? reject(error) : resolve()));
}
console.log("AI relay consent, origin, authentication, provider response validation, and rate limits passed.");
