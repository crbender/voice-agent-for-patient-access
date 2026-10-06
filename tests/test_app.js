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
    `${source}\n;globalThis.__appTestHooks = { state, updateVoiceVerificationFromCallerText, waitForServerVerification, runClientSchedulingFallback, MAX_VERIFICATION_CONTEXT_CHARS };`,
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

function serverLimit(name) {
  const source = fs.readFileSync(path.join(__dirname, "..", "server.py"), "utf8");
  const match = source.match(new RegExp(`^${name}\\s*=\\s*([\\d_]+)\\s*$`, "m"));
  assert.ok(match, `${name} not found in server.py`);
  return Number(match[1].replace(/_/g, ""));
}

const FILLER = "so i was thinking about whether my mom can drive me there and what time works for her ";
const FILLER_WORDS = new Set(FILLER.trim().split(" "));

// Mirrors the server's length check so oversized client text surfaces as a 400.
function useVerifyEndpoint(context) {
  const limit = serverLimit("MAX_VERIFICATION_UTTERANCE_CHARS");
  const sent = [];
  context.fetch = async (url, options) => {
    if (url === "/api/realtime/status") {
      return { ok: true, status: 200, json: async () => ({ configured: false }) };
    }
    const text = JSON.parse(options.body).verification_text;
    sent.push(text);
    if (text.length > limit) {
      return { ok: false, status: 400, json: async () => ({ error: "too long" }) };
    }
    const verified = domain.matchesActiveVerification(
      text,
      knowledge.shared.signedInProfiles.access,
      knowledge.shared.validationProtocol.acceptedDemoValues
    );
    return {
      ok: true,
      status: 200,
      json: async () => (verified
        ? { status: "verified", scheduling_capability: "capability-long" }
        : { status: "validation_pending" })
    };
  };
  return sent;
}

function startLiveSession(state, demoSessionId) {
  state.dataChannel = { readyState: "open" };
  state.demoSessionId = demoSessionId;
  state.realtimeSessionGeneration = 7;
}

test("client verification bound equals both server verification limits", () => {
  const { MAX_VERIFICATION_CONTEXT_CHARS } = loadApp().__appTestHooks;
  assert.equal(MAX_VERIFICATION_CONTEXT_CHARS, serverLimit("MAX_VERIFICATION_CONTEXT_CHARS"));
  assert.equal(MAX_VERIFICATION_CONTEXT_CHARS, serverLimit("MAX_VERIFICATION_UTTERANCE_CHARS"));
});

test("more than 500 characters of caller speech before name and DOB still verifies", async () => {
  const context = loadApp();
  const { state, updateVoiceVerificationFromCallerText, waitForServerVerification,
    MAX_VERIFICATION_CONTEXT_CHARS } = context.__appTestHooks;
  startLiveSession(state, "demo-session-long-preamble");
  const sent = useVerifyEndpoint(context);

  for (let turn = 0; turn < 30; turn += 1) {
    updateVoiceVerificationFromCallerText(FILLER);
    assert.ok(state.callerVerificationText.length <= MAX_VERIFICATION_CONTEXT_CHARS);
  }
  assert.ok(FILLER.length * 30 > MAX_VERIFICATION_CONTEXT_CHARS);
  assert.ok(FILLER_WORDS.has(state.callerVerificationText.split(" ")[0]));

  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  const result = await waitForServerVerification();

  assert.equal(result.status, "verified");
  assert.equal(state.schedulingCapability, "capability-long");
  assert.ok(sent.length >= 1);
  assert.ok(sent.every(text => text.length <= MAX_VERIFICATION_CONTEXT_CHARS));
});

test("name and DOB more than 500 characters apart still verify", async () => {
  const context = loadApp();
  const { state, updateVoiceVerificationFromCallerText, waitForServerVerification } =
    context.__appTestHooks;
  startLiveSession(state, "demo-session-split-factors");
  const sent = useVerifyEndpoint(context);
  const gap = FILLER.repeat(8);
  assert.ok(gap.length > 500);

  updateVoiceVerificationFromCallerText("This is Jordan Lee.");
  updateVoiceVerificationFromCallerText(gap);
  assert.equal(sent.length, 0);
  updateVoiceVerificationFromCallerText("My date of birth is July 14, 1982.");
  const result = await waitForServerVerification();

  assert.equal(result.status, "verified");
  assert.equal(state.schedulingCapability, "capability-long");
  assert.equal(sent.length, 1);
});

test("a rejected verification request is a service failure, not missing evidence", async () => {
  const context = loadApp();
  const { state, updateVoiceVerificationFromCallerText, waitForServerVerification } =
    context.__appTestHooks;
  startLiveSession(state, "demo-session-rejected");
  context.fetch = async url => {
    if (url === "/api/realtime/status") {
      return { ok: true, status: 200, json: async () => ({ configured: false }) };
    }
    return { ok: false, status: 400, json: async () => ({ error: "bad request" }) };
  };

  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  const result = await waitForServerVerification();

  assert.equal(result.status, "service_failure");
  assert.equal(state.schedulingCapability, "");
});

function startAuthorizedWatchdogSession(context, scheduleResponder) {
  const { state } = context.__appTestHooks;
  const sentEvents = [];
  state.dataChannel = {
    readyState: "open",
    send(message) { sentEvents.push(JSON.parse(message)); }
  };
  state.demoSessionId = "demo-session-watchdog";
  state.realtimeSessionGeneration = 9;
  state.voiceVerified = true;
  state.schedulingCapability = "capability-watchdog";
  context.fetch = async url => {
    if (url === "/api/realtime/status") {
      return { ok: true, status: 200, json: async () => ({ configured: false }) };
    }
    assert.equal(url, "/api/demo-tools/confirm-appointment");
    return scheduleResponder();
  };
  return sentEvents;
}

function toolOutputs(sentEvents, callId) {
  return sentEvents.filter(event =>
    event.type === "conversation.item.create" &&
    event.item?.type === "function_call_output" &&
    event.item.call_id === callId
  );
}

test("watchdog fallback returns a tool error output when scheduling fails", async () => {
  const context = loadApp();
  const { runClientSchedulingFallback } = context.__appTestHooks;
  const sentEvents = startAuthorizedWatchdogSession(context, async () => {
    throw new Error("Scheduling system unavailable.");
  });

  await runClientSchedulingFallback("Friday at 11:30 AM", "watchdog:call-fail", "call-fail");

  const outputs = toolOutputs(sentEvents, "call-fail");
  assert.equal(outputs.length, 1);
  assert.equal(JSON.parse(outputs[0].item.output).status, "error");
});

test("each stalled tool call for an already-handled window still gets its own output", async () => {
  const context = loadApp();
  const { runClientSchedulingFallback } = context.__appTestHooks;
  const sentEvents = startAuthorizedWatchdogSession(context, async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: "confirmed",
      selected_slot_id: "fri-1130",
      confirmed_window: "Friday at 11:30 AM",
      confirmation_number: "NLH-48291"
    })
  }));

  await runClientSchedulingFallback("Friday at 11:30 AM", "watchdog:call-a", "call-a");
  await runClientSchedulingFallback("Friday at 11:30 AM", "watchdog:call-b", "call-b");

  assert.equal(toolOutputs(sentEvents, "call-a").length, 1);
  assert.equal(toolOutputs(sentEvents, "call-b").length, 1);
});
