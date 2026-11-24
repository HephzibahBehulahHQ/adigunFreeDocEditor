import assert from "node:assert/strict";
import test from "node:test";
import bot from "../cloudflare/product-bot.mjs";
import worker from "../cloudflare/index.mjs";

const host = "https://adigunfreedoceditor.hephzibahbehulah.com";
const makeRequest = (body, options = {}) => {
  const method = options.method || "POST";
  return new Request(`${options.origin || host}/api/bot`, {
  method,
  headers: options.headers || { Origin: options.requestOrigin || options.origin || host, "Content-Type": "application/json" },
  body: body === undefined || ["GET", "HEAD"].includes(method) ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
};
const envWith = (run = async () => ({ response: "Use File → New document." }), limit = async () => ({ success: true })) => ({
  AI: { run }, BOT_LIMITER: { limit },
});
const body = (overrides = {}) => ({ messages: [{ role: "user", content: "How do I create a document?" }], consent: true, language: "en", ...overrides });

test("product bot requires same-origin JSON POST and configured bindings", async () => {
  assert.equal((await bot.fetch(makeRequest(body(), { method: "GET" }), envWith())).status, 405);
  assert.equal((await bot.fetch(makeRequest(body(), { requestOrigin: "https://other.example" }), envWith())).status, 403);
  assert.equal((await bot.fetch(makeRequest(body(), { headers: { Origin: host, "Content-Type": "text/plain" } }), envWith())).status, 415);
  assert.equal((await bot.fetch(makeRequest(body()), {})).status, 503);
  assert.equal((await bot.fetch(new Request("https://other.example/api/bot", { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: JSON.stringify(body()) }), envWith())).status, 404);
});

test("consent, conversation shape and request bounds are checked before model use", async () => {
  let calls = 0;
  const env = envWith(async () => { calls++; return { response: "answer" }; });
  for (const input of [body({ consent: false }), body({ messages: [] }), body({ messages: [{ role: "assistant", content: "no user turn" }] }), body({ messages: Array.from({ length: 9 }, () => ({ role: "user", content: "question" })) }), body({ messages: [{ role: "user", content: "x".repeat(1501) }] })]) {
    const response = await bot.fetch(makeRequest(input), env);
    assert.ok(response.status === 400 || response.status === 413);
  }
  assert.equal((await bot.fetch(makeRequest("x".repeat(12_001)), env)).status, 413);
  assert.equal(calls, 0);
});

test("rate limiter fails closed and protects the product-scoped budget", async () => {
  let key;
  const denied = envWith(undefined, async (input) => { key = input.key; return { success: false }; });
  const response = await bot.fetch(makeRequest(body()), denied);
  assert.equal(response.status, 429);
  assert.equal(key, "freedoc-bot:unknown");
  assert.equal((await bot.fetch(makeRequest(body()), { AI: { run: async () => ({ response: "x" }) }, BOT_LIMITER: { limit: async () => { throw new Error("offline"); } } })).status, 503);
});

test("assistant sends only scoped conversation and asks for the selected language", async () => {
  let model, input, limiterKey;
  const env = envWith(async (selectedModel, payload) => { model = selectedModel; input = payload; return { response: "Open the New document action." }; }, async ({ key }) => { limiterKey = key; return { success: true }; });
  const response = await bot.fetch(makeRequest(body({ language: "de", messages: [{ role: "user", content: "How do I create a document?" }] })), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "Open the New document action." });
  assert.equal(model, "@cf/zai-org/glm-4.7-flash");
  assert.equal(limiterKey, "freedoc-bot:unknown");
  assert.match(input.messages[0].content, /German/);
  assert.equal(input.max_tokens, 500);
  assert.equal(JSON.stringify(input).includes("PRIVATE OPEN DOCUMENT CONTENT"), false);
});

test("product Worker routes the Adigun BOT request without changing account or asset routing", async () => {
  const env = { ...envWith(), ASSETS: { fetch: async () => new Response("static asset") } };
  const botResponse = await worker.fetch(makeRequest(body()), env);
  assert.equal(botResponse.status, 200);
  assert.deepEqual(await botResponse.json(), { answer: "Use File → New document." });
  const assetResponse = await worker.fetch(new Request(`${host}/help.html`), env);
  assert.equal(await assetResponse.text(), "static asset");
});
