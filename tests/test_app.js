"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const domain = require("../demo-domain.js");
const knowledge = require("../synthetic-data.js");
const scenarios = require("../scenarios.js");

function fakeElement(id = "") {
  return {
    id,
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    value: id === "demoMode" ? "realtime" : "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    hidden: false,
    inert: false,
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    getClientRects() { return []; },
    focus() {},
    remove() {}
  };
}

function loadApp() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, fakeElement(id));
    return elements.get(id);
  };
  const body = element("body");
  body.dataset.view = "patient";
  const document = {
    body,
    activeElement: null,
    getElementById: element,
    createElement: () => fakeElement(),
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  const context = {
    AbortController,
    URLSearchParams,
    clearInterval,
    clearTimeout,
    console,
    document,
    navigator: {},
    performance,
    setInterval,
    setTimeout,
    window: {
      DEMO_SCENARIOS: scenarios,
      SYNTHETIC_KNOWLEDGE: knowledge,
      VOICE_DEMO_DOMAIN: domain,
      location: { search: "" },
      localStorage: { getItem() { return null; } },
      speechSynthesis: {
        getVoices() { return []; },
        addEventListener() {},
        cancel() {}
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(
    `${source}\n;globalThis.__appTestHooks = { state, updateVoiceVerificationFromCallerText, waitForServerVerification };`,
    context
  );
  return context;
}

test("caller verification and overlapping scheduling share one production request", async () => {
  const context = loadApp();
  const { state, updateVoiceVerificationFromCallerText, waitForServerVerification } =
    context.__appTestHooks;
  const channel = { readyState: "open" };
  let requestCount = 0;
  let resolveVerification;
  const verificationBody = new Promise(resolve => {
    resolveVerification = resolve;
  });

  state.dataChannel = channel;
  state.demoSessionId = "demo-session-1";
  state.realtimeSessionGeneration = 3;
  context.fetch = async url => {
    if (url === "/api/realtime/status") {
      return { ok: true, json: async () => ({ configured: false }) };
    }
    assert.equal(url, "/api/demo-tools/verify-session");
    requestCount += 1;
    return {
      ok: true,
      json: () => verificationBody
    };
  };

  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  const transcriptionOperation = state.verificationPromise;
  assert.ok(transcriptionOperation);

  const schedulingOperation = waitForServerVerification();
  assert.equal(state.verificationPromise, transcriptionOperation);
  assert.equal(requestCount, 0);

  await Promise.resolve();
  assert.equal(requestCount, 1);
  resolveVerification({
    status: "verified",
    scheduling_capability: "capability-1"
  });

  const result = await schedulingOperation;
  assert.equal(result.status, "verified");
  assert.equal(requestCount, 1);
  assert.equal(state.schedulingCapability, "capability-1");
  assert.equal(state.voiceVerified, true);
  assert.equal(state.verificationPromise, null);

  const authorizedResult = await waitForServerVerification();
  assert.equal(authorizedResult.status, "verified");
  assert.equal(requestCount, 1);
  assert.equal(state.schedulingCapability, "capability-1");
});

test("production verification retries only after an unsuccessful operation settles", async () => {
  const context = loadApp();
  const { state, updateVoiceVerificationFromCallerText, waitForServerVerification } =
    context.__appTestHooks;
  let requestCount = 0;

  state.dataChannel = { readyState: "open" };
  state.demoSessionId = "demo-session-2";
  state.realtimeSessionGeneration = 4;
  context.fetch = async url => {
    if (url === "/api/realtime/status") {
      return { ok: true, json: async () => ({ configured: false }) };
    }
    requestCount += 1;
    if (requestCount === 1) throw new Error("temporary failure");
    return {
      ok: true,
      json: async () => ({
        status: "verified",
        scheduling_capability: "capability-2"
      })
    };
  };

  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  const first = await waitForServerVerification();
  assert.equal(first.status, "service_failure");
  assert.equal(requestCount, 1);
  assert.equal(state.verificationPromise, null);

  const retry = await waitForServerVerification();
  assert.equal(retry.status, "verified");
  assert.equal(requestCount, 2);
  assert.equal(state.schedulingCapability, "capability-2");
});
