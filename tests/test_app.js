"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const domain = require("../demo-domain.js");
const knowledge = require("../synthetic-data.js");
const scenarios = require("../scenarios.js");

function fakeClassList() {
  const classes = new Set();
  return {
    add(...names) { names.forEach(name => classes.add(name)); },
    remove(...names) { names.forEach(name => classes.delete(name)); },
    toggle(name, force) {
      const enabled = force === undefined ? !classes.has(name) : Boolean(force);
      if (enabled) classes.add(name); else classes.delete(name);
      return enabled;
    },
    contains(name) { return classes.has(name); }
  };
}

const focusLog = [];

function fakeElement(id = "") {
  return {
    id,
    classList: fakeClassList(),
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
    isConnected: true,
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      child.parentElement?.children?.splice(child.parentElement.children.indexOf(child), 1);
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    insertAdjacentText(_position, text) { this.innerHTML += text; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    getClientRects() { return []; },
    focus() { focusLog.push(id); },
    pause() {},
    remove() {}
  };
}

function loadApp(overrides = {}) {
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
    ...overrides.context,
    window: {
      DEMO_SCENARIOS: scenarios,
      SYNTHETIC_KNOWLEDGE: knowledge,
      VOICE_DEMO_DOMAIN: domain,
      location: { search: "" },
      localStorage: { getItem() { return null; } },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      speechSynthesis: {
        getVoices() { return []; },
        addEventListener() {},
        cancel() {}
      },
      ...overrides.window
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(
    `${source}\n;globalThis.__appTestHooks = { state, els, updateVoiceVerificationFromCallerText, waitForServerVerification, runClientSchedulingFallback, handleRealtimeEvent, handleRealtimeErrorEvent, sendOpeningEvents, sendSchedulingFunctionOutputToRealtime, updateLiveConversationHints, showSchedulingResultPacket, recordLiveMilestone, switchView, openAssistantPanel, closeAssistantPanel, startRealtimeSession, stopRealtimeSession, MAX_VERIFICATION_CONTEXT_CHARS };`,
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

// --- PR #5: prompt-preserving responses, live dashboard, transcript, startup ---

function recordingChannel() {
  const sent = [];
  return { sent, channel: { readyState: "open", close() {}, send(message) { sent.push(JSON.parse(message)); } } };
}

function startFakeLiveSession(state, channel, scenarioKey = "access") {
  state.scenarioKey = scenarioKey;
  state.dataChannel = channel;
  state.peerConnection = { close() {}, connectionState: "connected" };
  state.demoSessionId = "demo-session-pr5";
  state.realtimeSessionGeneration = 21;
}

function packetText(els) {
  return els.actionPacket.innerHTML;
}

function rileyRows(els) {
  return els.transcript.children.filter(row => row.innerHTML.includes("Riley"));
}

test("scheduling follow-ups keep the session prompt and carry guidance in the tool result", () => {
  const context = loadApp();
  const { state, sendSchedulingFunctionOutputToRealtime } = context.__appTestHooks;
  const { sent, channel } = recordingChannel();
  startFakeLiveSession(state, channel);

  sendSchedulingFunctionOutputToRealtime("call-options", { status: "options_found" }, "Offer the options.");
  sendSchedulingFunctionOutputToRealtime("call-confirmed", { status: "confirmed" }, "Confirm the booking.");

  const outputs = sent.filter(event => event.item?.type === "function_call_output");
  assert.deepEqual(outputs.map(event => JSON.parse(event.item.output).response_guidance),
    ["Offer the options.", "Confirm the booking."]);
  const responses = sent.filter(event => event.type === "response.create");
  assert.equal(responses.length, 2);
  for (const event of responses) {
    assert.equal("instructions" in event.response, false);
    assert.deepEqual(event.response.output_modalities, ["audio"]);
  }
  assert.equal(sent.some(event => event.item?.role === "system"), false);
});

test("a requeued follow-up resends only the bare response.create", () => {
  const context = loadApp();
  const { state, sendSchedulingFunctionOutputToRealtime, handleRealtimeEvent } = context.__appTestHooks;
  const { sent, channel } = recordingChannel();
  startFakeLiveSession(state, channel);

  sendSchedulingFunctionOutputToRealtime("call-requeue", { status: "confirmed" }, "Confirm.");
  const firstResponse = sent.find(event => event.type === "response.create");
  handleRealtimeEvent(JSON.stringify({
    type: "error",
    error: { code: "conversation_already_has_active_response", event_id: firstResponse.event_id }
  }));
  handleRealtimeEvent(JSON.stringify({ type: "response.done", response: { id: "resp-other", status: "completed" } }));

  assert.equal(sent.filter(event => event.item?.type === "function_call_output").length, 1);
  const responses = sent.filter(event => event.type === "response.create");
  assert.equal(responses.length, 2);
  assert.equal(responses.every(event => !("instructions" in event.response)), true);
});

test("the opening turn sends a factual system item and a bare response.create", () => {
  const context = loadApp();
  const { sendOpeningEvents } = context.__appTestHooks;
  const { sent, channel } = recordingChannel();

  sendOpeningEvents(channel, null, "Patient access");

  assert.deepEqual(sent.map(event => event.type), ["conversation.item.create", "response.create"]);
  assert.equal(sent[0].item.role, "system");
  assert.match(sent[0].item.content[0].text, /Patient access workflow/);
  assert.doesNotMatch(sent[0].item.content[0].text, /verif|ask|date of birth/i);
  assert.equal("instructions" in sent[1].response, false);
});

test("legacy sessions send their configuration before the opening turn", () => {
  const context = loadApp();
  const { sendOpeningEvents } = context.__appTestHooks;
  const { sent, channel } = recordingChannel();
  const sessionUpdate = { type: "realtime", instructions: "SESSION PROMPT" };

  sendOpeningEvents(channel, sessionUpdate, "Patient access");

  assert.deepEqual(sent.map(event => event.type),
    ["session.update", "conversation.item.create", "response.create"]);
  assert.deepEqual(sent[0].session, sessionUpdate);
});

test("patient access shows validation complete only after the server verifies", async () => {
  let resolveVerification;
  const context = loadApp();
  const { state, els, updateVoiceVerificationFromCallerText, waitForServerVerification } =
    context.__appTestHooks;
  const { channel } = recordingChannel();
  startFakeLiveSession(state, channel);
  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: () => new Promise(resolve => { resolveVerification = resolve; })
  });

  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(packetText(els), /Validation: complete/);
  assert.notEqual(els.containment.textContent, "30%");

  resolveVerification({ status: "verified", scheduling_capability: "capability-pr5" });
  await waitForServerVerification();
  assert.match(packetText(els), /Validation: complete/);
  assert.equal(els.containment.textContent, "30%");
  assert.equal(els.waitTime.textContent, "5m");
});

test("failed or rejected server verification never advances the live dashboard", async () => {
  for (const reply of [
    { ok: false, status: 400, json: async () => ({ error: "bad" }) },
    { ok: true, status: 200, json: async () => ({ status: "validation_pending" }) },
    { ok: false, status: 403, json: async () => ({ status: "validation_required" }) }
  ]) {
    const context = loadApp();
    const { state, els, updateVoiceVerificationFromCallerText, waitForServerVerification } =
      context.__appTestHooks;
    startFakeLiveSession(state, recordingChannel().channel);
    context.fetch = async () => reply;
    updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
    await waitForServerVerification();
    assert.doesNotMatch(packetText(els), /Validation: complete/);
    assert.equal(state.liveValidated, false);
  }
});

test("stale server verification results do not touch a newer session's dashboard", async () => {
  let resolveVerification;
  const context = loadApp();
  const { state, els, updateVoiceVerificationFromCallerText } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);
  context.fetch = async () => ({
    ok: true,
    status: 200,
    json: () => new Promise(resolve => { resolveVerification = resolve; })
  });
  updateVoiceVerificationFromCallerText("Jordan Lee, July 14, 1982");
  const pending = state.verificationPromise;
  await new Promise(resolve => setImmediate(resolve));

  state.realtimeSessionGeneration += 1;
  resolveVerification({ status: "verified", scheduling_capability: "stale" });
  await pending;

  assert.equal(state.liveValidated, false);
  assert.doesNotMatch(packetText(els), /Validation: complete/);
});

test("scenarios without a server verification step validate on the client match", () => {
  const context = loadApp();
  const { state, els, updateVoiceVerificationFromCallerText } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel, "revenue");

  updateVoiceVerificationFromCallerText("This is Alex Morgan, February 3, 1975.");

  assert.match(packetText(els), /Intent: billing support call/);
  assert.match(packetText(els), /Validation: complete/);
  assert.equal(els.containment.textContent, "30%");
});

test("live hints update the packet and language count only for affirmative requests", () => {
  const context = loadApp();
  const { state, els, updateLiveConversationHints } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);

  updateLiveConversationHints("I don't need Spanish, and my mom cannot drive me.");
  assert.equal(els.languages.textContent, "1");
  assert.doesNotMatch(packetText(els), /Language:|Caregiver/);

  updateLiveConversationHints("My mom is driving me, so English first and then Spanish please.");
  assert.equal(els.languages.textContent, "2");
  assert.match(packetText(els), /Language: English first, Spanish second/);
  assert.match(packetText(els), /Caregiver context: mother driving/);
});

test("live hints never overwrite a scheduling packet, and milestones never regress", () => {
  const context = loadApp();
  const { state, els, showSchedulingResultPacket, updateLiveConversationHints, recordLiveMilestone } =
    context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);

  showSchedulingResultPacket({
    status: "confirmed",
    confirmed_window: "Friday at 11:30 AM",
    confirmation_number: "NLH-48291"
  });
  const schedulingPacket = packetText(els);
  updateLiveConversationHints("Spanish please");
  recordLiveMilestone("verified");

  assert.equal(packetText(els), schedulingPacket);
  assert.equal(els.containment.textContent, "88%");
  assert.equal(els.waitTime.textContent, "14m");
  assert.equal(els.languages.textContent, "2");
});

test("switching views keeps the live call; only an explicit panel close ends it", () => {
  focusLog.length = 0;
  const context = loadApp();
  const { state, els, switchView, openAssistantPanel, closeAssistantPanel } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);
  const peerConnection = state.peerConnection;

  openAssistantPanel();
  switchView("executive");
  assert.equal(state.peerConnection, peerConnection);
  assert.equal(els.assistantPanel.classList.contains("open"), false);
  assert.equal(els.agentSurface.parentElement, els.executiveAgentSlot);
  assert.equal(focusLog.at(-1), "agentFace");
  assert.equal(els.patientApp.inert, true);

  switchView("patient");
  assert.equal(state.peerConnection, peerConnection);
  assert.equal(els.assistantPanel.classList.contains("open"), true);
  assert.equal(els.agentSurface.parentElement, els.assistantSlot);

  closeAssistantPanel();
  assert.equal(state.peerConnection, null);
  assert.equal(els.assistantPanel.classList.contains("open"), false);
});

function sendEvents(handleRealtimeEvent, events) {
  for (const event of events) handleRealtimeEvent(JSON.stringify(event));
}

const transcriptDone = (id, text) => ({ type: "response.output_audio_transcript.done", response_id: id, transcript: text });
const responseDone = (id, status = "completed") => ({ type: "response.done", response: { id, status } });

test("agent turns render once for every terminal-event ordering", () => {
  const orderings = {
    "done only": id => [transcriptDone(id, "Hello there."), responseDone(id)],
    "stopped then done": id => [transcriptDone(id, "Hello there."), { type: "output_audio_buffer.stopped", response_id: id }, responseDone(id)],
    "done then stopped": id => [transcriptDone(id, "Hello there."), responseDone(id), { type: "output_audio_buffer.stopped", response_id: id }]
  };
  for (const [name, events] of Object.entries(orderings)) {
    const context = loadApp();
    const { els, handleRealtimeEvent } = context.__appTestHooks;
    sendEvents(handleRealtimeEvent, events("resp-1"));
    const rows = rileyRows(els);
    assert.equal(rows.length, 1, name);
    assert.doesNotMatch(rows[0].innerHTML, /interrupted/, name);
  }
});

test("barge-in marks the turn interrupted exactly once in either order", () => {
  for (const [name, events] of Object.entries({
    "cleared then done": [transcriptDone("resp-2", "Your options are"), { type: "output_audio_buffer.cleared", response_id: "resp-2" }, responseDone("resp-2", "cancelled")],
    "done then cleared": [transcriptDone("resp-2", "Your options are"), responseDone("resp-2"), { type: "output_audio_buffer.cleared", response_id: "resp-2" }]
  })) {
    const context = loadApp();
    const { els, handleRealtimeEvent } = context.__appTestHooks;
    sendEvents(handleRealtimeEvent, events);
    const rows = rileyRows(els);
    assert.equal(rows.length, 1, name);
    assert.equal(rows[0].innerHTML.match(/\(interrupted\)/g).length, 1, name);
  }
});

test("cleared before any transcript renders interrupted as soon as the text arrives", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent } = context.__appTestHooks;
  sendEvents(handleRealtimeEvent, [{ type: "output_audio_buffer.cleared", response_id: "resp-3" }]);

  // No transcript text yet, so there is nothing to render.
  assert.equal(rileyRows(els).length, 0);

  // The row must appear the moment the transcript arrives -- no later terminal event required.
  sendEvents(handleRealtimeEvent, [transcriptDone("resp-3", "Your options are")]);
  const rows = rileyRows(els);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].innerHTML.match(/\(interrupted\)/g).length, 1);
  assert.match(rows[0].innerHTML, /Your options are/);
});

test("a second transcript segment after an early interrupted render is not dropped", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent } = context.__appTestHooks;
  sendEvents(handleRealtimeEvent, [
    { type: "output_audio_buffer.cleared", response_id: "resp-3b" },
    transcriptDone("resp-3b", "Your options are")
  ]);

  // The first segment already forced a render; a later segment for the same response must
  // update that row instead of being silently tracked but never shown.
  sendEvents(handleRealtimeEvent, [transcriptDone("resp-3b", "the morning or the afternoon.")]);

  const rows = rileyRows(els);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].innerHTML.match(/\(interrupted\)/g).length, 1);
  assert.match(rows[0].innerHTML, /Your options are the morning or the afternoon\./);
});

test("ending a call between response.done and output_audio_buffer.stopped marks the cut-off reply interrupted", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent, stopRealtimeSession, state } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);
  sendEvents(handleRealtimeEvent, [transcriptDone("resp-4", "Your appointment is confirmed."), responseDone("resp-4")]);

  // response.done already rendered the row, but the audio was still playing when the call ended.
  const rows = rileyRows(els);
  assert.equal(rows.length, 1);
  assert.doesNotMatch(rows[0].innerHTML, /interrupted/);

  stopRealtimeSession();

  const finalRows = rileyRows(els);
  assert.equal(finalRows.length, 1);
  assert.match(finalRows[0].innerHTML, /Your appointment is confirmed\./);
  assert.equal(finalRows[0].innerHTML.match(/\(interrupted\)/g).length, 1);
});

test("a fully played reply is left unmarked when the call ends", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent, stopRealtimeSession, state } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);
  sendEvents(handleRealtimeEvent, [
    transcriptDone("resp-5", "Your appointment is confirmed."),
    { type: "output_audio_buffer.stopped", response_id: "resp-5" },
    responseDone("resp-5")
  ]);

  stopRealtimeSession();

  const rows = rileyRows(els);
  assert.equal(rows.length, 1);
  assert.doesNotMatch(rows[0].innerHTML, /interrupted/);
});

test("late terminal events from an older response never touch a newer turn", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent } = context.__appTestHooks;
  sendEvents(handleRealtimeEvent, [
    transcriptDone("resp-a", "First answer."),
    responseDone("resp-a"),
    { type: "response.output_audio_transcript.delta", response_id: "resp-b", delta: "Second " },
    { type: "output_audio_buffer.stopped", response_id: "resp-a" },
    { type: "output_audio_buffer.cleared", response_id: "resp-a" },
    transcriptDone("resp-b", "Second answer."),
    responseDone("resp-b")
  ]);

  const rows = rileyRows(els);
  assert.equal(rows.length, 2);
  assert.match(rows[0].innerHTML, /First answer\./);
  assert.match(rows[0].innerHTML, /\(interrupted\)/);
  assert.match(rows[1].innerHTML, /Second answer\./);
  assert.doesNotMatch(rows[1].innerHTML, /interrupted/);
});

test("ending a call records an unfinished agent turn as interrupted", () => {
  const context = loadApp();
  const { els, handleRealtimeEvent, stopRealtimeSession, state } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);
  sendEvents(handleRealtimeEvent, [
    { type: "response.output_audio_transcript.delta", response_id: "resp-c", delta: "Let me check" }
  ]);

  stopRealtimeSession();

  const rows = rileyRows(els);
  assert.equal(rows.length, 1);
  assert.match(rows[0].innerHTML, /Let me check \(interrupted\)/);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } };
}

function loadStartupApp() {
  const micRequests = [];
  const sessionRequests = [];
  const peerConnections = [];
  class FakePeerConnection {
    constructor() { peerConnections.push(this); this.closed = false; this.channels = []; }
    addTrack() {}
    createDataChannel() {
      const listeners = {};
      const channel = {
        readyState: "open",
        listeners,
        sent: [],
        addEventListener(type, handler) { listeners[type] = handler; },
        close() {},
        send(message) { this.sent.push(JSON.parse(message)); }
      };
      this.channels.push(channel);
      return channel;
    }
    async createOffer() { return { type: "offer", sdp: "v=0" }; }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() { this.closed = true; }
  }
  const navigator = {
    mediaDevices: {
      getUserMedia() {
        const request = deferred();
        micRequests.push(request);
        return request.promise;
      }
    }
  };
  const context = loadApp({
    context: { navigator, RTCPeerConnection: FakePeerConnection },
    window: { RTCPeerConnection: FakePeerConnection }
  });
  context.fetch = url => {
    const request = deferred();
    sessionRequests.push({ url, ...request });
    return request.promise;
  };
  context.__appTestHooks.state.realtimeAvailable = true;
  return { context, micRequests, sessionRequests, peerConnections };
}

const okSession = () => ({
  ok: true,
  json: async () => ({
    demoSessionId: "demo-startup",
    sessionUpdate: null,
    protocol: "ga-webrtc",
    callsUrl: "https://demo.openai.azure.com/openai/v1/realtime/calls",
    token: "token"
  })
});

const flush = () => new Promise(resolve => setImmediate(resolve));

test("the microphone is requested before the session mint resolves", async () => {
  const { context, micRequests, sessionRequests } = loadStartupApp();
  context.__appTestHooks.startRealtimeSession();
  await flush();

  assert.equal(micRequests.length, 1);
  assert.equal(sessionRequests.length, 1);
  sessionRequests[0].resolve({ ok: false, json: async () => ({ error: "stop here" }) });
  await flush();
});

test("a mint failure stops a microphone stream that resolves later", async () => {
  const { context, micRequests, sessionRequests } = loadStartupApp();
  const startup = context.__appTestHooks.startRealtimeSession();
  await flush();
  sessionRequests[0].resolve({ ok: false, json: async () => ({ error: "mint failed" }) });
  await startup;

  const { track, stream } = fakeStream();
  micRequests[0].resolve(stream);
  await flush();
  assert.equal(track.stopped, true);
  assert.equal(context.__appTestHooks.state.localStream, null);
});

test("a microphone rejection during the mint surfaces visibly without an unhandled rejection", async () => {
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on("unhandledRejection", onUnhandled);
  try {
    const { context, micRequests, sessionRequests, peerConnections } = loadStartupApp();
    const { state, els } = context.__appTestHooks;
    const startup = context.__appTestHooks.startRealtimeSession();
    await flush();
    micRequests[0].reject(new Error("Permission denied"));
    await flush();
    sessionRequests[0].resolve(okSession());
    await startup;
    await flush();

    assert.equal(unhandled, 0);
    assert.equal(state.peerConnection, null);
    assert.equal(peerConnections[0].closed, true);
    assert.match(els.transcript.children.at(-1).innerHTML, /Permission denied/);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("stopping during startup releases the microphone and never builds a connection", async () => {
  const { context, micRequests, sessionRequests, peerConnections } = loadStartupApp();
  const { state, startRealtimeSession, stopRealtimeSession } = context.__appTestHooks;
  const startup = startRealtimeSession();
  await flush();
  stopRealtimeSession();

  const { track, stream } = fakeStream();
  micRequests[0].resolve(stream);
  sessionRequests[0].resolve(okSession());
  await startup;
  await flush();

  assert.equal(track.stopped, true);
  assert.equal(peerConnections.length, 0);
  assert.equal(state.localStream, null);
});

test("an old startup's microphone never affects a newer startup", async () => {
  const { context, micRequests, sessionRequests } = loadStartupApp();
  const { state, startRealtimeSession, stopRealtimeSession } = context.__appTestHooks;
  const first = startRealtimeSession();
  await flush();
  stopRealtimeSession();
  startRealtimeSession();
  await flush();

  const oldMic = fakeStream();
  const newMic = fakeStream();
  sessionRequests[0].resolve(okSession());
  micRequests[0].resolve(oldMic.stream);
  micRequests[1].resolve(newMic.stream);
  await first;
  await flush();

  assert.equal(oldMic.track.stopped, true);
  assert.equal(newMic.track.stopped, false);
  assert.equal(state.connecting, true);
  assert.equal(state.localStream, null);
});

test("messages from an ended call's data channel never reach a newer call", async () => {
  const { context, micRequests, sessionRequests, peerConnections } = loadStartupApp();
  const { state, els, startRealtimeSession, stopRealtimeSession } = context.__appTestHooks;
  const callerRows = () => els.transcript.children.filter(row => row.innerHTML.includes("Caller")).length;

  const first = startRealtimeSession();
  await flush();
  micRequests[0].resolve(fakeStream().stream);
  sessionRequests[0].resolve(okSession());
  await flush();
  sessionRequests[1].resolve({ ok: true, text: async () => "v=0" });
  await first;
  const oldChannel = peerConnections[0].channels[0];
  const transcription = transcript => ({
    data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript })
  });

  oldChannel.listeners.message(transcription("Hello there."));
  assert.equal(callerRows(), 1);

  stopRealtimeSession();
  startRealtimeSession();
  await flush();
  const requestsBefore = sessionRequests.length;
  oldChannel.listeners.message(transcription("Jordan Lee, July 14, 1982"));
  oldChannel.listeners.message({
    data: JSON.stringify({
      type: "response.function_call_arguments.done",
      call_id: "stale-call",
      name: "confirm_appointment_reschedule",
      arguments: JSON.stringify({ requested_window: "Friday morning" })
    })
  });
  await flush();

  assert.equal(callerRows(), 1);
  assert.equal(state.callerVerificationText, "");
  assert.equal(state.handledToolCalls.size, 0);
  assert.equal(sessionRequests.length, requestsBefore);
});

test("a later correction clears a live hint from the packet", () => {
  const context = loadApp();
  const { state, els, updateLiveConversationHints } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);

  updateLiveConversationHints("Spanish please, my mom is driving me.");
  assert.match(packetText(els), /Language: English first, Spanish second/);
  assert.equal(els.languages.textContent, "2");

  updateLiveConversationHints("Actually English only, and my mom is not driving me after all.");
  assert.doesNotMatch(packetText(els), /Language:|Caregiver/);
  assert.equal(els.languages.textContent, "1");
  assert.deepEqual({ ...state.liveConversationHints }, { languagePreference: "", caregiverContext: "" });
});

test("a correction split across two transcript events still clears the hint", () => {
  const context = loadApp();
  const { state, els, updateLiveConversationHints } = context.__appTestHooks;
  startFakeLiveSession(state, recordingChannel().channel);

  updateLiveConversationHints("My mom is driving me.");
  assert.match(packetText(els), /Caregiver context: mother driving/);

  // The correction itself never mentions "mom" or "driving"; only the rolling context from
  // the prior event lets it be recognized.
  updateLiveConversationHints("Actually, not this time.");
  assert.doesNotMatch(packetText(els), /Caregiver/);
  assert.equal(state.liveConversationHints.caregiverContext, "");
});

test("ending a call while minting hangs stops a late microphone stream immediately", async () => {
  const { context, micRequests, sessionRequests } = loadStartupApp();
  const { state, startRealtimeSession, stopRealtimeSession } = context.__appTestHooks;
  startRealtimeSession();
  await flush();
  assert.equal(sessionRequests.length, 1);
  assert.ok(state.pendingMicrophone);

  stopRealtimeSession();
  assert.equal(state.pendingMicrophone, null);
  stopRealtimeSession();

  const { track, stream } = fakeStream();
  micRequests[0].resolve(stream);
  await flush();

  assert.equal(track.stopped, true);
  assert.equal(state.localStream, null);
});
