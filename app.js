const state = {
  scenarioKey: "access",
  timers: [],
  muted: false,
  lastFocusedElement: null,
  running: false,
  connecting: false,
  realtimeAvailable: false,
  peerConnection: null,
  dataChannel: null,
  handledToolCalls: new Set(),
  toolCallArgumentDeltas: new Map(),
  toolCallNames: new Map(),
  pendingToolTimers: new Map(),
  pendingToolStatuses: new Set(),
  schedulingFallbacks: new Set(),
  schedulingWindowsHandled: new Set(),
  voiceVerified: false,
  demoSessionId: "",
  schedulingCapability: "",
  verificationPromise: null,
  liveConversationHints: {
    languagePreference: "",
    caregiverContext: ""
  },
  // Agent transcript turns keyed by Realtime response id, so late terminal events from an
  // older response cannot attach to a newer one.
  agentTurns: new Map(),
  // Which flow owns the action packet: "none", "live-context", or "scheduling".
  packetOwner: "none",
  liveMilestoneRank: 0,
  liveValidated: false,
  lastCallerTranscript: "",
  callerVerificationText: "",
  // Realtime response lifecycle, used to avoid colliding scheduling follow-ups.
  activeResponseId: null,
  pendingSchedulingFollowup: null,
  inFlightFollowups: new Map(),
  sentFollowupCallIds: new Set(),
  sentToolOutputCallIds: new Set(),
  followupSeq: 0,
  realtimeSessionGeneration: 0,
  localStream: null,
  remoteAudio: null,
  realtimeEventLog: [],
  audioPlaybackLog: [],
  totalScenes: 0,
  currentSceneIndex: -1,
  ttsVoice: null,
  currentUtterance: null
};

const SCENARIO_ICONS = {
  access: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/></svg>',
  revenue: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 14h2M13 14h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  multilingual: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.8"/></svg>'
};

const AVATAR_AGENT = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 11a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.5v5M12 8v8M15 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const AVATAR_SYSTEM = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.8"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="1.8"/></svg>';

const SCHEDULING_TOOL_NAME = "confirm_appointment_reschedule";
const MAX_TRANSCRIPT_MESSAGES = 200;
const DOMAIN = window.VOICE_DEMO_DOMAIN;
// Reasoning-capable models emit tool arguments more slowly; only fall back after a real stall.
const TOOL_CALL_WATCHDOG_MS = 4000;
const VERIFICATION_TIMEOUT_MS = 6000;
// Must equal server.py MAX_VERIFICATION_CONTEXT_CHARS and MAX_VERIFICATION_UTTERANCE_CHARS.
const MAX_VERIFICATION_CONTEXT_CHARS = 2000;
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 8000;
const DEBUG_REALTIME = new URLSearchParams(window.location.search).has("debugRealtime") ||
  window.localStorage?.getItem("voiceDemoDebug") === "1";

const els = {
  scenarioGrid: document.getElementById("scenarioGrid"),
  demoMode: document.getElementById("demoMode"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  muteBtn: document.getElementById("muteBtn"),
  copyScriptBtn: document.getElementById("copyScriptBtn"),
  startRealtimeBtn: document.getElementById("startRealtimeBtn"),
  stopRealtimeBtn: document.getElementById("stopRealtimeBtn"),
  hookLine: document.getElementById("hookLine"),
  callerTitle: document.getElementById("callerTitle"),
  patientContext: document.getElementById("patientContext"),
  scenarioEyebrow: document.getElementById("scenarioEyebrow"),
  scenarioTitle: document.getElementById("scenarioTitle"),
  transcript: document.getElementById("transcript"),
  agentFace: document.getElementById("agentFace"),
  containment: document.getElementById("containment"),
  waitTime: document.getElementById("waitTime"),
  languages: document.getElementById("languages"),
  actionPacket: document.getElementById("actionPacket"),
  handoffTag: document.getElementById("handoffTag"),
  progress: document.getElementById("progress"),
  timeLabel: document.getElementById("timeLabel"),
  sceneLabel: document.getElementById("sceneLabel"),
  captionList: document.getElementById("captionList"),
  realtimeStatus: document.getElementById("foundryStatus"),
  realtimeDetail: document.getElementById("foundryDetail"),
  connectionLabel: document.getElementById("connectionLabel"),
  connectionDot: document.getElementById("connectionDot"),
  kpiContainment: document.getElementById("kpiContainment"),
  sceneChips: document.getElementById("sceneChips"),
  orbScenarioChip: document.getElementById("orbScenarioChip"),
  orbLiveBadge: document.getElementById("orbLiveBadge"),
  orbLiveLabel: document.getElementById("orbLiveLabel"),
  toast: document.getElementById("toast"),
  // Patient site + assistant panel
  body: document.body,
  viewSwitch: document.getElementById("viewSwitch"),
  viewSwitchState: document.getElementById("viewSwitchState"),
  siteNav: document.getElementById("siteNav"),
  sitePage: document.getElementById("sitePage"),
  assistantFab: document.getElementById("assistantFab"),
  assistantPanel: document.getElementById("assistantPanel"),
  assistantBackdrop: document.getElementById("assistantBackdrop"),
  patientApp: document.getElementById("patientApp"),
  assistantPanelTitle: document.getElementById("assistantPanelTitle"),
  assistantPanelClose: document.getElementById("assistantPanelClose"),
  assistantSlot: document.getElementById("assistantSlot"),
  executiveAgentSlot: document.getElementById("executiveAgentSlot"),
  agentSurface: document.getElementById("agentSurface"),
  patientStartBtn: document.getElementById("patientStartBtn"),
  patientStopBtn: document.getElementById("patientStopBtn"),
  panelExecutiveViewBtn: document.getElementById("panelExecutiveViewBtn"),
  executiveApp: document.getElementById("executiveApp"),
  callerEyebrow: document.getElementById("callerEyebrow"),
  siteUserName: document.getElementById("siteUserName"),
  siteUserAvatar: document.getElementById("siteUserAvatar"),
  siteUserHint: document.getElementById("siteUserHint")
};

function scenario() {
  return window.DEMO_SCENARIOS[state.scenarioKey];
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function renderScenarioCards() {
  els.scenarioGrid.innerHTML = Object.entries(window.DEMO_SCENARIOS).map(([key, item]) => `
    <button class="scenario-card ${key === state.scenarioKey ? "active" : ""}" data-scenario="${key}">
      <span class="scenario-icon">${SCENARIO_ICONS[key] || ""}</span>
      <span class="scenario-body">
        <b>${item.label}</b>
        <span>${item.summary}</span>
      </span>
    </button>
  `).join("");

  els.scenarioGrid.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      // Executive cards and patient navigation share one selection path so both views stay
      // synchronized on the active scenario.
      setSitePage(button.dataset.scenario);
    });
  });
}

function renderScenario() {
  const item = scenario();
  const context = {
    access: {
      caller: "Jordan Lee · Imaging access",
      lines: ["Need: reschedule or clarify instructions", "Validation: name + DOB", "Location: Northlake Imaging Center"]
    },
    revenue: {
      caller: "Alex Morgan · Billing support",
      lines: ["Need: statement and claim-status explanation", "Validation: name + DOB", "Boundary: no account numbers"]
    },
    multilingual: {
      caller: "Elena Garcia · Language access",
      lines: ["Need: appointment confirmation in Spanish", "Validation: name + DOB", "Boundary: route clinical translation"]
    }
  }[state.scenarioKey];
  els.hookLine.textContent = `“${item.hook}”`;
  els.callerTitle.textContent = context.caller;
  els.patientContext.innerHTML = context.lines.map(line => `<span>${line}</span>`).join("");
  els.scenarioEyebrow.textContent = item.label;
  els.scenarioTitle.textContent = item.title;
  els.captionList.innerHTML = item.captions.map(caption => `<div class="caption-item">${caption}</div>`).join("");
  if (els.orbScenarioChip) els.orbScenarioChip.textContent = item.label;
  renderSignedInUser();
  renderSceneChips();
}

function signedInProfileForCurrentScenario() {
  return (window.SYNTHETIC_KNOWLEDGE?.shared?.signedInProfiles || {})[state.scenarioKey] || null;
}

function renderSignedInUser() {
  const profile = signedInProfileForCurrentScenario();
  if (!profile) return;
  if (els.siteUserName) els.siteUserName.textContent = profile.displayName;
  if (els.siteUserAvatar) {
    els.siteUserAvatar.textContent = profile.displayName
      .split(/\s+/)
      .map(p => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  if (els.siteUserHint) {
    els.siteUserHint.textContent = profile.languagePreference
      ? `Signed in · ${profile.languagePreference}`
      : `Member since ${profile.memberSince}`;
  }
}

function renderSceneChips() {
  if (!els.sceneChips) return;
  const scenes = scenario().script.map(s => s.scene);
  state.totalScenes = scenes.length;
  els.sceneChips.innerHTML = scenes.map((s, i) => `<span class="scene-chip" data-i="${i}">${s}</span>`).join("");
}

function setSceneChipActive(index) {
  if (!els.sceneChips) return;
  state.currentSceneIndex = index;
  els.sceneChips.querySelectorAll(".scene-chip").forEach((chip, i) => {
    chip.classList.toggle("is-active", i === index);
    chip.classList.toggle("is-done", i < index);
  });
}

function addMessage(item) {
  const isPatient = item.type === "patient";
  const isSystem = item.type === "system";
  const row = document.createElement("div");
  row.className = `bubble-row ${isPatient ? "patient" : isSystem ? "system" : "agent"}`;

  const ts = formatTimestamp();
  const initials = (item.who || "").split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const avatarHtml = isPatient
    ? `<div class="avatar">${initials}</div>`
    : isSystem
      ? `<div class="avatar system">${AVATAR_SYSTEM}</div>`
      : `<div class="avatar agent">${AVATAR_AGENT}</div>`;

  const bubbleHtml = `<div class="bubble ${isPatient ? "patient" : isSystem ? "system" : ""}">
    <span class="who"><span>${escapeHtml(item.who || "")}</span><span class="ts">${ts}</span></span>
    ${escapeHtml(item.text)}
  </div>`;

  row.innerHTML = isPatient ? `${bubbleHtml}${avatarHtml}` : `${avatarHtml}${bubbleHtml}`;
  els.transcript.querySelector(".empty-state")?.remove();
  els.transcript.appendChild(row);
  const rows = els.transcript.querySelectorAll(".bubble-row");
  for (let index = 0; index < rows.length - MAX_TRANSCRIPT_MESSAGES; index += 1) {
    rows[index].remove();
  }
  els.transcript.scrollTop = els.transcript.scrollHeight;
  return row;
}

function formatTimestamp() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateMetrics(item) {
  if (!item.metrics) return;
  els.containment.textContent = item.metrics[0];
  els.waitTime.textContent = item.metrics[1];
  els.languages.textContent = item.metrics[2];
  if (els.kpiContainment) els.kpiContainment.textContent = item.metrics[0];
}

function updatePacket(item) {
  if (!item.packet) return;
  els.actionPacket.innerHTML = item.packet.map(line => `<span>${escapeHtml(line)}</span>`).join("");
  if (item.tag) {
    els.handoffTag.textContent = item.tag;
    els.handoffTag.classList.toggle("hot", item.tag !== "Complete");
    els.handoffTag.classList.toggle("complete", item.tag === "Complete");
  }
}

function setActionPacketLines(lines, tag = "Confirmed", owner = "scheduling") {
  state.packetOwner = owner;
  els.actionPacket.innerHTML = lines.map(line => `<span>${escapeHtml(line)}</span>`).join("");
  els.handoffTag.textContent = tag;
  els.handoffTag.classList.toggle("hot", tag !== "Complete" && tag !== "Confirmed");
  els.handoffTag.classList.toggle("complete", tag === "Complete" || tag === "Confirmed");
}

// Live calls advance the executive KPIs at the same milestones the scripted access run uses.
// Milestones only move forward within a call.
const LIVE_MILESTONES = {
  connected: { rank: 1, containment: "10%", waitAvoided: "2m" },
  verified: { rank: 2, containment: "30%", waitAvoided: "5m" },
  options: { rank: 3, containment: "60%", waitAvoided: "9m" },
  confirmed: { rank: 4, containment: "88%", waitAvoided: "14m" }
};

const LIVE_INTENT_LINES = {
  access: "Intent: patient access call",
  revenue: "Intent: billing support call",
  multilingual: "Intent: language access call"
};

function recordLiveMilestone(name) {
  const milestone = LIVE_MILESTONES[name];
  if (milestone && milestone.rank > state.liveMilestoneRank) {
    state.liveMilestoneRank = milestone.rank;
    els.containment.textContent = milestone.containment;
    els.waitTime.textContent = milestone.waitAvoided;
    if (els.kpiContainment) els.kpiContainment.textContent = milestone.containment;
  }
  updateLiveLanguageMetric();
}

function updateLiveLanguageMetric() {
  const bilingual = state.scenarioKey === "multilingual" ||
    Boolean(state.liveConversationHints.languagePreference);
  els.languages.textContent = bilingual ? "2" : "1";
}

function recordSchedulingMilestone(result) {
  if (result.status === "options_found" || result.status === "alternate_proposed") {
    recordLiveMilestone("options");
  } else if (result.status === "confirmed") {
    recordLiveMilestone("confirmed");
  }
}

function showSchedulingResultPacket(result) {
  setActionPacketLines(
    formatSchedulingPacket(result),
    result.status === "confirmed" ? "Confirmed" : "Needs patient"
  );
  recordSchedulingMilestone(result);
}

// The live context packet never overwrites a scheduling packet, which carries more detail.
function renderLiveContextPacket() {
  if (state.packetOwner === "scheduling") return;
  const hints = state.liveConversationHints;
  setActionPacketLines([
    LIVE_INTENT_LINES[state.scenarioKey] || "Intent: live call",
    state.liveValidated ? "Validation: complete" : "Validation: pending (name + DOB)",
    hints.languagePreference ? `Language: ${hints.languagePreference}` : null,
    hints.caregiverContext ? `Caregiver context: ${hints.caregiverContext}` : null,
    "Escalation: not required"
  ].filter(Boolean), state.liveValidated ? "In progress" : "Pending", "live-context");
}

// Patient access counts as validated only once the server issues a scheduling capability;
// the other scenarios have no server step, so the client match is final for them.
function markLiveValidated() {
  if (state.liveValidated) return;
  state.liveValidated = true;
  recordLiveMilestone("verified");
  renderLiveContextPacket();
}

function setSpeaking(isSpeaking) {
  els.agentFace.classList.toggle("is-speaking", isSpeaking);
}

function logAudioPlayback(eventName, detail = {}) {
  const entry = {
    at: new Date().toISOString(),
    event: eventName,
    ...detail
  };
  state.audioPlaybackLog.push(entry);
  if (state.audioPlaybackLog.length > 80) state.audioPlaybackLog.shift();
  if (DEBUG_REALTIME) console.debug("[realtime-audio]", entry);
}

function logRealtimeEvent(event) {
  const entry = {
    at: new Date().toISOString(),
    type: event.type,
    itemType: event.item?.type || event.output_item?.type,
    itemName: event.item?.name || event.output_item?.name || event.name,
    callId: event.call_id || event.item?.call_id || event.output_item?.call_id,
    hasTranscript: Boolean(event.transcript || event.text || event.delta)
  };
  state.realtimeEventLog.push(entry);
  if (state.realtimeEventLog.length > 160) state.realtimeEventLog.shift();
  if (DEBUG_REALTIME) console.debug("[realtime-event]", entry);
}

function ensureRemoteAudioPlayback(reason = "realtime-audio") {
  const audio = state.remoteAudio;
  if (!audio || !audio.srcObject) {
    logAudioPlayback("play-skipped", { reason, hasAudio: Boolean(audio), hasSrcObject: Boolean(audio?.srcObject) });
    return;
  }
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise
      .then(() => logAudioPlayback("play-resolved", { reason, paused: audio.paused, readyState: audio.readyState }))
      .catch(error => {
        logAudioPlayback("play-rejected", { reason, message: error.message, name: error.name });
        setConnectionState("warn", `Audio blocked: ${error.message || reason}`);
    });
  }
}

function pickTtsVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const preferredNames = [
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
    "Karen",
    "Google UK English Female"
  ];
  for (const name of preferredNames) {
    const match = voices.find(v => v.name === name);
    if (match) return match;
  }
  return (
    voices.find(v => v.lang === "en-US" && /female|aria|jenny|samantha|karen/i.test(v.name)) ||
    voices.find(v => v.lang === "en-US") ||
    voices.find(v => v.lang && v.lang.startsWith("en")) ||
    voices[0]
  );
}

function ensureTtsVoice() {
  if (state.ttsVoice) return;
  state.ttsVoice = pickTtsVoice();
  if (!state.ttsVoice && "speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      state.ttsVoice = pickTtsVoice();
    };
  }
}

function speak(text) {
  if (state.muted || !("speechSynthesis" in window)) return;
  ensureTtsVoice();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (state.ttsVoice) {
    utterance.voice = state.ttsVoice;
    utterance.lang = state.ttsVoice.lang;
  }
  utterance.rate = 1.03;
  utterance.pitch = 1;
  state.currentUtterance = utterance;
  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => {
    if (state.currentUtterance === utterance) state.currentUtterance = null;
    setSpeaking(false);
  };
  utterance.onerror = () => {
    if (state.currentUtterance === utterance) state.currentUtterance = null;
    setSpeaking(false);
  };
  window.speechSynthesis.speak(utterance);
}

function clearTimers() {
  state.timers.forEach(timer => {
    window.clearTimeout(timer);
    window.clearInterval(timer);
  });
  state.timers = [];
  window.speechSynthesis?.cancel();
  state.currentUtterance = null;
  setSpeaking(false);
}

function resetDemo() {
  clearTimers();
  if (isRealtimeSessionActive()) stopRealtimeSession();
  state.running = false;
  els.startBtn.disabled = false;
  els.transcript.innerHTML = `<div class="empty-state"><b>Ready when you are.</b><span>Press <strong>Start 90s Demo</strong> for the scripted run, or tap the mic to answer a live call. The first patient turn lands immediately.</span></div>`;
  els.progress.style.width = "0%";
  els.timeLabel.textContent = "0:00";
  els.sceneLabel.textContent = "Ready";
  els.containment.textContent = "0%";
  els.waitTime.textContent = "0m";
  els.languages.textContent = "1";
  if (els.kpiContainment) els.kpiContainment.textContent = "0%";
  els.handoffTag.textContent = "Pending";
  els.handoffTag.classList.add("hot");
  els.handoffTag.classList.remove("complete");
  els.actionPacket.innerHTML = `<span>Intent: not detected yet</span><span>Validation: pending</span><span>Escalation: not required</span>`;
  state.packetOwner = "none";
  setSceneChipActive(-1);
}

async function playItem(item) {
  const displayItem = { ...item };
  addMessage(displayItem);
  updateMetrics(displayItem);
  updatePacket(displayItem);
  els.timeLabel.textContent = displayItem.time;
  els.sceneLabel.textContent = displayItem.scene;
  if (displayItem.speak) speak(displayItem.text);
  if (!displayItem.speak) {
    setSpeaking(true);
    window.setTimeout(() => setSpeaking(false), 900);
  }
}

function runScriptedDemo() {
  if (state.running) return;
  resetDemo();
  state.running = true;
  els.startBtn.disabled = true;

  const started = Date.now();
  const progressTimer = window.setInterval(() => {
    const elapsed = Date.now() - started;
    const pct = Math.min(100, (elapsed / 90000) * 100);
    els.progress.style.width = `${pct}%`;
    if (pct >= 100) {
      window.clearInterval(progressTimer);
      els.startBtn.disabled = false;
      state.running = false;
    }
  }, 400);
  state.timers.push(progressTimer);

  scenario().script.forEach((item, i) => {
    state.timers.push(window.setTimeout(() => {
      playItem(item);
      setSceneChipActive(i);
    }, item.at));
  });

  state.timers.push(window.setTimeout(() => {
    els.startBtn.disabled = false;
    state.running = false;
    showToast("Demo complete. Reset or run another scenario.");
  }, 90500));
}

async function checkRealtime() {
  try {
    const response = await fetch("/api/realtime/status");
    if (!response.ok) throw new Error("No proxy");
    const data = await response.json();
    state.realtimeAvailable = Boolean(data.configured);
    els.realtimeStatus.textContent = data.configured ? "Realtime voice configured" : "Realtime voice not configured";
    els.realtimeDetail.textContent = data.configured
      ? `Deployment: ${data.deployment}. Voice: ${data.voice}. Protocol: ${data.protocol}. Auth: ${data.auth}.`
      : data.endpointInsecure
        ? "AZURE_OPENAI_ENDPOINT must use https:// (or the wss:// Foundry URL). Update .env, then restart server.py."
        : "Add AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_REALTIME_DEPLOYMENT, and AZURE_OPENAI_API_KEY to .env, then restart server.py.";
    setConnectionState(data.configured ? "ready" : "idle", data.configured ? "Realtime-ready" : "Scripted mode");
  } catch {
    state.realtimeAvailable = false;
    els.realtimeStatus.textContent = "Static file mode";
    els.realtimeDetail.textContent = "Use python3 server.py for optional realtime token service. Scripted recording mode still works.";
    setConnectionState("idle", "Scripted mode");
  }
}

function setConnectionState(kind, label) {
  if (els.connectionLabel) els.connectionLabel.textContent = label;
  if (els.connectionDot) {
    els.connectionDot.classList.remove("live", "warn", "idle", "error");
    els.connectionDot.classList.add(kind === "live" ? "live" : kind === "warn" ? "warn" : kind === "error" ? "error" : "idle");
  }
}

async function startRealtimeSession() {
  if (state.peerConnection || state.connecting) {
    showToast("Conversation is already live.");
    return;
  }
  if (!state.realtimeAvailable) {
    showToast("Realtime voice is not configured yet. Add the .env values and restart server.py.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    showToast("This browser does not support the required microphone/WebRTC APIs.");
    return;
  }

  els.startRealtimeBtn.disabled = true;
  els.startRealtimeBtn.textContent = "Connecting...";
  els.stopRealtimeBtn.disabled = false;
  if (els.patientStartBtn) { els.patientStartBtn.disabled = true; els.patientStartBtn.textContent = "Connecting..."; }
  if (els.patientStopBtn) els.patientStopBtn.disabled = false;
  showToast("Connecting to Riley...");

  // Ending, resetting, or switching scenarios during startup invalidates this attempt, so
  // every await below is followed by a generation check before touching shared state.
  state.connecting = true;
  const startGeneration = state.realtimeSessionGeneration;
  const isStartupCurrent = () =>
    state.connecting && state.realtimeSessionGeneration === startGeneration;
  // Ask for the microphone while the session is minted; the stream stays local to this
  // attempt until it is adopted, and is released on any failure or stale exit.
  const microphone = DOMAIN.requestEarlyMicrophone(navigator.mediaDevices, {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  try {
    state.realtimeEventLog = [];
    state.audioPlaybackLog = [];
    const scopedContext = DOMAIN.buildScopedRealtimeContext(
      window.SYNTHETIC_KNOWLEDGE,
      state.scenarioKey
    );
    const sessionResponse = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey: state.scenarioKey,
        knowledge: scopedContext.knowledge,
        signedInProfile: scopedContext.profile,
        demoScript: scenario().script.map(item => ({
          scene: item.scene,
          who: item.who,
          type: item.type,
          text: item.text,
          packet: item.packet || []
        }))
      })
    });
    const sessionData = await sessionResponse.json();
    if (!isStartupCurrent()) return;
    if (!sessionResponse.ok) {
      const azureMessage = sessionData.error?.message || sessionData.error || "Realtime session request failed.";
      throw new Error(sessionData.guidance ? `${azureMessage} ${sessionData.guidance}` : azureMessage);
    }
    if (!sessionData.demoSessionId) {
      throw new Error("Realtime session did not include demo authorization state.");
    }
    if (sessionData.protocol === "legacy-webrtc" && !sessionData.sessionUpdate) {
      throw new Error("Realtime session did not include its session configuration.");
    }
    state.demoSessionId = sessionData.demoSessionId;
    state.schedulingCapability = "";
    state.voiceVerified = false;

    const peerConnection = new RTCPeerConnection();
    const remoteAudio = document.createElement("audio");
    remoteAudio.id = "realtimeRemoteAudio";
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.preload = "auto";
    remoteAudio.style.position = "fixed";
    remoteAudio.style.left = "-9999px";
    remoteAudio.style.width = "1px";
    remoteAudio.style.height = "1px";
    remoteAudio.setAttribute("aria-hidden", "true");
    document.body.appendChild(remoteAudio);
    state.peerConnection = peerConnection;
    state.remoteAudio = remoteAudio;

    peerConnection.ontrack = event => {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.muted = false;
      remoteAudio.volume = 1;
      logAudioPlayback("track", {
        kind: event.track.kind,
        streams: event.streams.length,
        trackMuted: event.track.muted,
        trackState: event.track.readyState
      });
      event.track.onmute = () => logAudioPlayback("track-muted", { trackState: event.track.readyState });
      event.track.onunmute = () => {
        logAudioPlayback("track-unmuted", { trackState: event.track.readyState });
        ensureRemoteAudioPlayback("remote-track-unmuted");
      };
      event.track.onended = () => logAudioPlayback("track-ended", { trackState: event.track.readyState });
      remoteAudio.onloadstart = () => logAudioPlayback("loadstart");
      remoteAudio.oncanplay = () => logAudioPlayback("canplay", { readyState: remoteAudio.readyState });
      remoteAudio.onplay = () => logAudioPlayback("play", { currentTime: remoteAudio.currentTime });
      remoteAudio.onplaying = () => {
        logAudioPlayback("playing", { currentTime: remoteAudio.currentTime });
        setSpeaking(true);
      };
      remoteAudio.onpause = () => {
        logAudioPlayback("pause", { currentTime: remoteAudio.currentTime, connectionState: state.peerConnection?.connectionState });
        if (state.peerConnection && state.peerConnection.connectionState === "connected") {
          ensureRemoteAudioPlayback("remote-audio-paused");
        }
      };
      remoteAudio.onwaiting = () => logAudioPlayback("waiting", { readyState: remoteAudio.readyState });
      remoteAudio.onstalled = () => logAudioPlayback("stalled", { readyState: remoteAudio.readyState });
      remoteAudio.onended = () => {
        logAudioPlayback("ended");
        setSpeaking(false);
      };
      remoteAudio.onerror = () => {
        logAudioPlayback("error", { code: remoteAudio.error?.code, message: remoteAudio.error?.message });
        setConnectionState("warn", "Audio playback issue");
      };
      ensureRemoteAudioPlayback("remote-track");
      setSpeaking(true);
    };
    peerConnection.onconnectionstatechange = () => {
      const s = peerConnection.connectionState;
      if (s === "connected") {
        if (state.dataChannel?.readyState === "open") {
          setConnectionState("live", "Live voice");
          if (els.orbLiveLabel) els.orbLiveLabel.textContent = isPatientView() ? "Tap mic to end" : "Conversation live";
        } else {
          setConnectionState("warn", "Connecting...");
        }
      } else if (s === "failed" || s === "disconnected") {
        setConnectionState("error", `Voice: ${s}`);
      } else {
        setConnectionState("warn", `Voice: ${s}`);
      }
    };

    const localStream = await microphone.promise;
    if (!isStartupCurrent()) {
      peerConnection.close();
      return;
    }
    state.localStream = microphone.adopt(localStream);
    state.localStream.getTracks().forEach(track => peerConnection.addTrack(track, state.localStream));

    const dataChannel = peerConnection.createDataChannel("realtime-channel");
    state.dataChannel = dataChannel;
    // Messages still queued on an ended call's channel must never reach a newer call.
    dataChannel.addEventListener("message", event => {
      if (state.realtimeSessionGeneration !== startGeneration || state.dataChannel !== dataChannel) return;
      handleRealtimeEvent(event.data);
    });
    dataChannel.addEventListener("close", () => setSpeaking(false));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const sdpResponse = await fetch(sessionData.callsUrl, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${sessionData.token}`,
        "Content-Type": "application/sdp"
      }
    });
    if (!isStartupCurrent()) return;
    if (!sdpResponse.ok) throw new Error(await sdpResponse.text());
    const answerSdp = await sdpResponse.text();
    if (!isStartupCurrent()) return;
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    if (!isStartupCurrent()) return;
    await DOMAIN.waitForDataChannelOpen(dataChannel, DATA_CHANNEL_OPEN_TIMEOUT_MS);
    if (!isStartupCurrent()) return;
    els.agentFace.classList.add("is-live");
    sendOpeningEvents(dataChannel, sessionData.sessionUpdate, scenario().label);
    state.liveMilestoneRank = 0;
    state.liveValidated = false;
    state.packetOwner = "none";
    recordLiveMilestone("connected");
    renderLiveContextPacket();
    els.startRealtimeBtn.textContent = "Conversation live";
    if (els.patientStartBtn) els.patientStartBtn.textContent = "Conversation live";
    setConnectionState("live", "Live voice");
    if (els.orbLiveLabel) els.orbLiveLabel.textContent = isPatientView() ? "Tap mic to end" : "Conversation live";
    showToast("Live realtime voice connected.");
  } catch (error) {
    // A stale startup failure must never tear down a newer session.
    if (!isStartupCurrent()) return;
    addMessage({ who: "Realtime error", type: "system", text: error.message || String(error) });
    stopRealtimeSession();
  } finally {
    microphone.release();
    if (state.realtimeSessionGeneration === startGeneration) state.connecting = false;
  }
}

// The opening turn keeps the session prompt in force: the context item is factual, and the
// response.create carries no instructions because those would replace the session prompt.
// GA sessions already run with the minted configuration, so only legacy sessions send an update.
function sendOpeningEvents(channel, sessionUpdate, scenarioLabel) {
  if (sessionUpdate) channel.send(JSON.stringify({ type: "session.update", session: sessionUpdate }));
  channel.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "system",
      content: [{
        type: "input_text",
        text: `A signed-in Northlake MyHealth user just opened the live voice assistant for the ${scenarioLabel} workflow.`
      }]
    }
  }));
  channel.send(JSON.stringify({
    type: "response.create",
    response: { output_modalities: ["audio"] }
  }));
}

function handleRealtimeEvent(rawMessage) {
  let event;
  try {
    event = JSON.parse(rawMessage);
  } catch {
    return;
  }
  logRealtimeEvent(event);

  if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
    state.lastCallerTranscript = event.transcript;
    addMessage({ who: "Caller", type: "patient", text: event.transcript });
    updateVoiceVerificationFromCallerText(event.transcript);
    updateLiveConversationHints(event.transcript);
  }
  if (event.type === "response.output_audio_transcript.done" && event.transcript) {
    agentTurnFor(event.response_id).segments.push(event.transcript);
  }
  if (event.type === "response.output_audio_transcript.delta" && event.delta) {
    agentTurnFor(event.response_id).deltaText += event.delta;
    ensureRemoteAudioPlayback("audio-transcript-delta");
    setSpeaking(true);
  }
  if (event.type === "output_audio_buffer.started") {
    ensureRemoteAudioPlayback("output-audio-started");
    setSpeaking(true);
  }
  if (event.type === "output_audio_buffer.stopped") {
    finalizeAgentTurn(event.response_id);
    setSpeaking(false);
  }
  if (event.type === "output_audio_buffer.cleared") {
    markAgentTurnInterrupted(event.response_id);
    setSpeaking(false);
  }
  if (event.type === "response.created") {
    state.activeResponseId = event.response?.id || "active";
  }
  if (event.type === "response.done") {
    state.activeResponseId = null;
    if (event.response?.status === "cancelled") {
      markAgentTurnInterrupted(event.response?.id);
    } else {
      finalizeAgentTurn(event.response?.id);
    }
    flushPendingSchedulingFollowup();
  }
  if (event.type === "error") {
    handleRealtimeErrorEvent(event);
  }
  maybeHandleRealtimeToolCall(event);
}

// A rejected scheduling follow-up is only silent when we actually requeue it.
// Every other failure stays visible.
function handleRealtimeErrorEvent(event) {
  const causeEventId = event.error?.event_id || event.event_id;
  const rejectedFollowup = causeEventId ? state.inFlightFollowups.get(causeEventId) : null;
  if (causeEventId) state.inFlightFollowups.delete(causeEventId);

  if (rejectedFollowup && event.error?.code === "conversation_already_has_active_response") {
    state.sentFollowupCallIds.delete(rejectedFollowup.callId);
    state.pendingSchedulingFollowup = rejectedFollowup;
    logRealtimeEvent({ type: "scheduling-followup.requeued", callId: rejectedFollowup.callId });
    return;
  }

  if (event.error?.message) {
    addMessage({ who: "Realtime error", type: "system", text: event.error.message });
  }
}

const MAX_TRACKED_AGENT_TURNS = 8;
const INTERRUPTED_SUFFIX = " (interrupted)";

// Events without a response id belong to the most recent turn.
function agentTurnFor(responseId) {
  const turns = state.agentTurns;
  const key = responseId || [...turns.keys()].pop() || "current";
  let turn = turns.get(key);
  if (!turn) {
    turn = { segments: [], deltaText: "", row: null, interrupted: false };
    turns.set(key, turn);
    while (turns.size > MAX_TRACKED_AGENT_TURNS) turns.delete(turns.keys().next().value);
  }
  return turn;
}

function agentTurnText(turn) {
  const segments = turn.segments.map(normalizeWhitespace).filter(Boolean);
  return cleanAgentTurn(segments.length ? segments.join(" ") : turn.deltaText);
}

// Rendering happens once, at the first terminal event that has text; later terminal events
// for the same response can only add the interrupted marker.
function finalizeAgentTurn(responseId) {
  if (!responseId && state.agentTurns.size === 0) return;
  const turn = agentTurnFor(responseId);
  if (turn.row) return;
  const text = agentTurnText(turn);
  if (!text) return;
  turn.row = addMessage({
    who: "Riley",
    type: "agent",
    text: turn.interrupted ? `${text}${INTERRUPTED_SUFFIX}` : text
  });
}

function markAgentTurnInterrupted(responseId) {
  if (!responseId && state.agentTurns.size === 0) return;
  const turn = agentTurnFor(responseId);
  if (turn.interrupted) return;
  turn.interrupted = true;
  if (turn.row) {
    (turn.row.querySelector(".bubble") || turn.row).insertAdjacentText("beforeend", INTERRUPTED_SUFFIX);
  } else {
    finalizeAgentTurn(responseId);
  }
}

// Ending a call mid-sentence still records what Riley had said so far.
function flushOpenAgentTurns() {
  for (const turn of state.agentTurns.values()) {
    if (turn.row) continue;
    const text = agentTurnText(turn);
    if (text) addMessage({ who: "Riley", type: "agent", text: `${text}${INTERRUPTED_SUFFIX}` });
  }
  state.agentTurns = new Map();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanAgentTurn(value) {
  return normalizeWhitespace(value)
    .replace(/^(okay,\s*)?thanks for that[—-]\s*let me think through the next scheduling step with you\.\s*/i, "")
    .replace(/(^|\s)let me check what(?:'|’)?s available around friday\.\s*/i, " ")
    .replace(/(^|\s)confirm that new time for you now\.\s*/i, " ")
    .replace(/(^|\s)result shows\s+/i, " ")
    .replace(/(^|\s)result is\s+/i, " ")
    .replace(/^complete,\s*/i, "");
}

function maybeHandleRealtimeToolCall(event) {
  const item = findSchedulingToolItem(event);
  const callId = event.call_id || item?.call_id || item?.id;

  if (item?.type === "function_call" && callId && item.name) {
    state.toolCallNames.set(callId, item.name);
  }

  if (event.type === "response.function_call_arguments.delta" && event.call_id && event.delta) {
    const current = state.toolCallArgumentDeltas.get(event.call_id) || "";
    state.toolCallArgumentDeltas.set(event.call_id, current + event.delta);
    if ((event.name || state.toolCallNames.get(event.call_id)) === SCHEDULING_TOOL_NAME) {
      showSchedulingPending(event.call_id);
    }
    return;
  }

  const directName = event.name || event.tool_name;
  const itemName = item?.name || item?.tool_name;
  const knownName = callId ? state.toolCallNames.get(callId) : undefined;
  const isArgumentDone = event.type === "response.function_call_arguments.done";
  const isFunctionItemAdded = event.type === "response.output_item.added" && item?.type === "function_call";
  const isFunctionItemDone = event.type === "response.output_item.done" && item?.type === "function_call";
  const isConversationItemAdded = event.type === "conversation.item.added" && item?.type === "function_call";
  const isConversationItemDone = event.type === "conversation.item.done" && item?.type === "function_call";
  const isConversationItemCreatedComplete = event.type === "conversation.item.created" && item?.type === "function_call" && item?.status === "completed";
  const isResponseDoneFunction = event.type === "response.done" && item?.type === "function_call";
  const name = directName || itemName || knownName;
  if (name !== SCHEDULING_TOOL_NAME) return;

  if (isFunctionItemAdded || isConversationItemAdded) {
    showSchedulingPending(callId);
    schedulePendingToolWatchdog(callId);
    return;
  }

  if (!isArgumentDone && !isFunctionItemDone && !isConversationItemDone && !isConversationItemCreatedComplete && !isResponseDoneFunction) return;

  if (!callId || state.handledToolCalls.has(callId)) return;
  state.handledToolCalls.add(callId);
  clearPendingToolState(callId);

  const rawArguments = event.arguments || item?.arguments || state.toolCallArgumentDeltas.get(callId) || "{}";
  state.toolCallArgumentDeltas.delete(callId);
  handleSchedulingToolCall(callId, rawArguments);
}

function showSchedulingPending(callId) {
  if (!callId || state.pendingToolStatuses.has(callId)) return;
  state.pendingToolStatuses.add(callId);
  setActionPacketLines([
    "Scheduling system: availability check",
    "Scheduling system: checking availability",
    "Status: waiting for result"
  ], "Checking");
}

function schedulePendingToolWatchdog(callId) {
  if (!callId || state.pendingToolTimers.has(callId)) return;
  const timer = setTimeout(() => {
    state.pendingToolTimers.delete(callId);
    if (state.handledToolCalls.has(callId)) return;
    const requestedWindow = inferSchedulingWindowFromText(state.lastCallerTranscript);
    if (!requestedWindow) return;
    state.handledToolCalls.add(callId);
    runClientSchedulingFallback(requestedWindow, `watchdog:${callId}`, callId);
  }, TOOL_CALL_WATCHDOG_MS);
  state.pendingToolTimers.set(callId, timer);
}

function clearPendingToolWatchdog(callId) {
  const timer = state.pendingToolTimers.get(callId);
  if (timer) clearTimeout(timer);
  state.pendingToolTimers.delete(callId);
}

function clearPendingToolState(callId) {
  clearPendingToolWatchdog(callId);
  state.pendingToolStatuses.delete(callId);
}

function findSchedulingToolItem(event) {
  const candidates = [
    event.item,
    event.output_item,
    ...(Array.isArray(event.response?.output) ? event.response.output : [])
  ].filter(Boolean);
  return candidates.find(item => item?.type === "function_call" && item?.name === SCHEDULING_TOOL_NAME) || candidates[0] || null;
}

async function handleSchedulingToolCall(callId, rawArguments) {
  const sessionGeneration = state.realtimeSessionGeneration;
  const sessionChannel = state.dataChannel;
  let args = {};
  try {
    args = typeof rawArguments === "string" ? JSON.parse(rawArguments || "{}") : rawArguments;
  } catch {
    args = {};
  }

  const payload = {
    scenario_key: state.scenarioKey,
    requested_window: args.requested_window || args.requestedWindow || args.preferred_window || "",
    selected_slot_id: args.selected_slot_id || args.selectedSlotId || "",
    language_preference: args.language_preference || args.languagePreference || "",
    caregiver_context: args.caregiver_context || args.caregiverContext || ""
  };

  const verification = await waitForServerVerification();
  if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;

  if (state.scenarioKey === "access" && verification.status === "service_failure") {
    sendVerificationFailureToolOutput(callId, sessionGeneration, sessionChannel);
    return;
  }

  if (state.scenarioKey === "access" && !hasSchedulingAuthorization()) {
    const result = {
      status: "validation_required",
      message: "Voice-channel verification is required before scheduling.",
      next_action: "Ask for caller name and date of birth before checking appointment availability."
    };
    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      "Ask for caller name and date of birth, then continue the scheduling workflow. Do not ask for a callback.",
      sessionGeneration,
      sessionChannel
    );
    return;
  }

  if (!payload.requested_window.trim()) {
    const result = {
      status: "needs_clarification",
      message: "Scheduling needs a requested day or time window before checking availability.",
      next_action: "Ask the caller what day or time window works best."
    };
    setActionPacketLines(formatSchedulingPacket(result), "Needs patient");
    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      "Ask what day or time window works best before checking the scheduling system. Do not confirm or imply a slot is booked.",
      sessionGeneration,
      sessionChannel
    );
    return;
  }

  addMessage({
    who: "Scheduling system",
    type: "system",
    text: `Checking appointment availability for ${payload.requested_window}...`
  });
  setActionPacketLines([
    "Scheduling system: availability check",
    `Requested window: ${payload.requested_window}`,
    "Scheduling system: checking availability"
  ], "Checking");

  try {
    const startedAt = performance.now();
    const response = await fetch("/api/demo-tools/confirm-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        demo_session_id: state.demoSessionId,
        scheduling_capability: state.schedulingCapability
      })
    });
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    const result = await response.json();
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    result.client_elapsed_ms = Math.round(performance.now() - startedAt);
    if (result.status === "validation_required") {
      clearSchedulingAuthorization();
    } else if (!response.ok) {
      throw new Error(result.error || "Scheduling tool failed.");
    }

    const resultText = formatSchedulingResult(result);
    addMessage({ who: "Scheduling system", type: "system", text: resultText });
    showSchedulingResultPacket(result);
    state.pendingToolStatuses.delete(callId);

    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      schedulingFollowupInstructions(result),
      sessionGeneration,
      sessionChannel
    );
  } catch (error) {
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    const result = {
      status: "error",
      message: error.message || String(error),
      next_action: "Route to staff queue."
    };
    addMessage({ who: "Scheduling system", type: "system", text: result.message });
    state.pendingToolStatuses.delete(callId);
    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      "Continue the call naturally. Route this to staff if the scheduling result is unavailable and do not discuss implementation details.",
      sessionGeneration,
      sessionChannel
    );
  }
}

function updateVoiceVerificationFromCallerText(text) {
  const combined = DOMAIN.normalizeVerificationText(
    `${state.callerVerificationText} ${text}`
  );
  // Keep only the most recent evidence the server accepts, dropping any word cut by the trim.
  const start = combined.length - MAX_VERIFICATION_CONTEXT_CHARS;
  state.callerVerificationText = start <= 0
    ? combined
    : combined[start - 1] === " "
      ? combined.slice(start)
      : combined.slice(start).replace(/^\S*\s?/, "");
  if (callerProvidedFullVerification()) {
    state.voiceVerified = true;
    if (state.scenarioKey === "access") {
      syncServerVerification(state.callerVerificationText);
    } else {
      markLiveValidated();
    }
  }
}

// Single source of truth for demo verification: the active signed-in persona must match on
// both name and date of birth. Evidence accumulates across turns, so the caller may supply
// the name and the date of birth in separate answers. Riley announcing success is never
// enough, and another valid demo persona cannot unlock this workflow.
function callerProvidedFullVerification() {
  return DOMAIN.matchesActiveVerification(
    state.callerVerificationText,
    signedInProfileForCurrentScenario(),
    window.SYNTHETIC_KNOWLEDGE?.shared?.validationProtocol?.acceptedDemoValues || []
  );
}

// Keep one verification request in flight per realtime/demo session. Scheduling reuses that
// operation, while settled failures may be retried and stale completions are discarded.
function syncServerVerification(text) {
  if (state.scenarioKey !== "access" || !state.demoSessionId || state.schedulingCapability) {
    return Promise.resolve(null);
  }

  const demoSessionId = state.demoSessionId;
  const sessionGeneration = state.realtimeSessionGeneration;
  const sessionChannel = state.dataChannel;
  const activeOperation = state.verificationPromise;
  if (
    activeOperation &&
    activeOperation.sessionGeneration === sessionGeneration &&
    activeOperation.sessionChannel === sessionChannel &&
    activeOperation.demoSessionId === demoSessionId
  ) {
    return activeOperation;
  }

  const operation = Promise.resolve().then(async () => {
      if (hasSchedulingAuthorization()) return { status: "verified", scheduling_capability: state.schedulingCapability };
      if (!isVerificationSessionCurrent(sessionGeneration, sessionChannel, demoSessionId)) return null;
      try {
        const { response, body: result } = await DOMAIN.fetchJsonWithDeadline(
          fetch,
          "/api/demo-tools/verify-session",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demo_session_id: demoSessionId, verification_text: text })
          },
          VERIFICATION_TIMEOUT_MS
        );
        if (!isVerificationSessionCurrent(sessionGeneration, sessionChannel, demoSessionId)) return null;
        if (response.ok && result.status === "verified" && result.scheduling_capability) {
          state.schedulingCapability = result.scheduling_capability;
          state.voiceVerified = true;
          markLiveValidated();
        } else if (result.status === "validation_required") {
          clearSchedulingAuthorization();
        } else if (response.status === 400) {
          // A rejected request is a service problem, not missing caller evidence.
          logRealtimeEvent({ type: "verification.sync_rejected", status: response.status });
          return {
            status: "service_failure",
            message: "Voice verification is temporarily unavailable."
          };
        }
        return result;
      } catch (error) {
        if (isVerificationSessionCurrent(sessionGeneration, sessionChannel, demoSessionId)) {
          logRealtimeEvent({ type: "verification.sync_failed", message: String(error) });
          return {
            status: "service_failure",
            message: "Voice verification is temporarily unavailable."
          };
        }
        return null;
      }
    });

  operation.sessionGeneration = sessionGeneration;
  operation.sessionChannel = sessionChannel;
  operation.demoSessionId = demoSessionId;
  const clearOperation = () => {
    if (state.verificationPromise === operation) {
      state.verificationPromise = null;
    }
  };
  operation.then(clearOperation, clearOperation);
  state.verificationPromise = operation;
  return operation;
}

function isVerificationSessionCurrent(sessionGeneration, sessionChannel, demoSessionId) {
  return isSchedulingSessionCurrent(sessionGeneration, sessionChannel) &&
    state.demoSessionId === demoSessionId;
}

async function waitForServerVerification() {
  if (!callerProvidedFullVerification()) return { status: "missing_evidence" };
  if (hasSchedulingAuthorization()) return { status: "verified" };

  const operation = syncServerVerification(state.callerVerificationText);
  try {
    const result = await DOMAIN.withDeadline(
      operation,
      VERIFICATION_TIMEOUT_MS + 500,
      "Voice verification"
    );
    if (hasSchedulingAuthorization()) return { status: "verified" };
    return result?.status === "service_failure"
      ? result
      : { status: "missing_evidence" };
  } catch (error) {
    logRealtimeEvent({ type: "verification.wait_failed", message: String(error) });
    return {
      status: "service_failure",
      message: "Voice verification is temporarily unavailable."
    };
  }
}

function sendVerificationFailureToolOutput(callId, sessionGeneration, sessionChannel) {
  const result = {
    status: "error",
    message: "Voice verification is temporarily unavailable. Please retry, or ask staff to continue safely.",
    next_action: "Retry voice verification or route the caller to staff."
  };
  addMessage({ who: "Verification service", type: "system", text: result.message });
  setActionPacketLines([
    "Validation: service unavailable",
    "Next: retry verification or route to staff",
    "Status: staff-safe"
  ], "Needs staff");
  state.pendingToolStatuses.delete(callId);
  sendSchedulingFunctionOutputToRealtime(
    callId,
    result,
    "Explain that verification is temporarily unavailable. Offer to retry or route to staff, and do not attempt scheduling.",
    sessionGeneration,
    sessionChannel
  );
}

function hasSchedulingAuthorization() {
  return Boolean(state.voiceVerified && state.demoSessionId && state.schedulingCapability);
}

// Expired or rejected capabilities must require fresh caller evidence, so accumulated
// verification text is discarded along with the capability.
function clearSchedulingAuthorization() {
  state.schedulingCapability = "";
  state.voiceVerified = false;
  state.callerVerificationText = "";
  state.liveValidated = false;
}

function updateLiveConversationHints(text) {
  const detected = DOMAIN.detectConversationHints(text);
  const hints = state.liveConversationHints;
  let changed = false;
  for (const key of ["languagePreference", "caregiverContext"]) {
    if (key in detected && hints[key] !== detected[key]) {
      hints[key] = detected[key];
      changed = true;
    }
  }
  if (changed) {
    updateLiveLanguageMetric();
    renderLiveContextPacket();
  }
}

// Conservative inference: negated, conflicting, or ambiguous phrasing yields no window so
// the watchdog fallback never books something the caller did not ask for.
function inferSchedulingWindowFromText(text) {
  return DOMAIN.inferSchedulingWindowFromText(text);
}

async function runClientSchedulingFallback(requestedWindow, stage, callId = null) {
  const sessionGeneration = state.realtimeSessionGeneration;
  const sessionChannel = state.dataChannel;
  if (!state.voiceVerified && callerProvidedFullVerification()) {
    state.voiceVerified = true;
  }

  const verification = await waitForServerVerification();
  if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;

  if (state.scenarioKey === "access" && verification.status === "service_failure") {
    if (callId) sendVerificationFailureToolOutput(callId, sessionGeneration, sessionChannel);
    return;
  }

  if (state.scenarioKey === "access" && !hasSchedulingAuthorization()) {
    if (callId) {
      sendSchedulingFunctionOutputToRealtime(
        callId,
        {
          status: "validation_required",
          message: "Voice-channel verification is required before scheduling.",
          next_action: "Ask for caller name and date of birth before checking appointment availability."
        },
        "Ask for caller name and date of birth, then continue the scheduling workflow. Do not ask for a callback.",
        sessionGeneration,
        sessionChannel
      );
    }
    return;
  }

  const fallbackKey = `${stage}:${requestedWindow}`;
  const windowKey = requestedWindow.toLowerCase();
  // A tool call needs its own output, so only call-less fallbacks are de-duplicated by window.
  if (!callId) {
    if (state.schedulingFallbacks.has(fallbackKey)) return;
    if (state.schedulingWindowsHandled.has(windowKey)) return;
  }
  state.schedulingFallbacks.add(fallbackKey);
  state.schedulingWindowsHandled.add(windowKey);

  const payload = {
    scenario_key: state.scenarioKey,
    requested_window: requestedWindow,
    language_preference: state.liveConversationHints.languagePreference,
    caregiver_context: state.liveConversationHints.caregiverContext
  };

  addMessage({
    who: "Scheduling system",
    type: "system",
    text: `Checking appointment availability for ${requestedWindow}...`
  });
  setActionPacketLines([
    "Scheduling system: availability check",
    `Requested window: ${requestedWindow}`,
    "Scheduling system: checking availability"
  ], "Checking");

  try {
    const startedAt = performance.now();
    const response = await fetch("/api/demo-tools/confirm-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        demo_session_id: state.demoSessionId,
        scheduling_capability: state.schedulingCapability
      })
    });
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    const result = await response.json();
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    result.client_elapsed_ms = Math.round(performance.now() - startedAt);
    if (result.status === "validation_required") {
      clearSchedulingAuthorization();
    } else if (!response.ok) {
      throw new Error(result.error || "Scheduling tool failed.");
    }

    const resultText = formatSchedulingResult(result);
    addMessage({ who: "Scheduling system", type: "system", text: resultText });
    showSchedulingResultPacket(result);
    if (callId) {
      sendSchedulingFunctionOutputToRealtime(
        callId,
        result,
        schedulingFollowupInstructions(result),
        sessionGeneration,
        sessionChannel
      );
    }
  } catch (error) {
    if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel)) return;
    const result = {
      status: "error",
      message: error.message || String(error),
      next_action: "Route to staff queue."
    };
    addMessage({ who: "Scheduling system", type: "system", text: result.message });
    if (callId) {
      state.pendingToolStatuses.delete(callId);
      sendSchedulingFunctionOutputToRealtime(
        callId,
        result,
        "Continue the call naturally. Route this to staff if the scheduling result is unavailable and do not discuss implementation details.",
        sessionGeneration,
        sessionChannel
      );
    }
  }
}

function schedulingFollowupInstructions(result) {
  if (result.status === "validation_required") {
    return "Ask for caller name and date of birth, then continue the scheduling workflow. Do not imply that availability was checked and do not ask for a callback.";
  }
  if (result.status === "options_found") {
    return "Continue the call naturally. Offer the available scheduling options in plain language, recommend the best fit if helpful, and ask which slot works. When the caller chooses, call the scheduling tool again with that option's exact window and its slot_id. Do not say anything is booked yet.";
  }
  if (result.status === "needs_clarification") {
    return "Ask what day or time window works best before checking the scheduling system. Do not confirm or imply a slot is booked.";
  }
  if (result.status === "confirmed") {
    return "Continue the call naturally. Tell the caller the scheduling system confirmed the slot and include the confirmation number. Do not end there: ask one closing next-step question, such as whether they need parking directions, prep reminders, or anything else about the visit. Do not ask for a callback.";
  }
  return "Continue the call naturally using the scheduling system result. End with a clear next step or bounded question. Do not discuss implementation details and do not ask for a callback unless the result says staff follow-up is required.";
}

function isRealtimeChannelOpen(channel = state.dataChannel) {
  return Boolean(channel) && channel.readyState === "open";
}

function isSchedulingSessionCurrent(sessionGeneration, sessionChannel) {
  return state.realtimeSessionGeneration === sessionGeneration &&
    state.dataChannel === sessionChannel;
}

function sendSchedulingFunctionOutputToRealtime(
  callId,
  result,
  responseGuidance,
  sessionGeneration = state.realtimeSessionGeneration,
  sessionChannel = state.dataChannel
) {
  if (!isSchedulingSessionCurrent(sessionGeneration, sessionChannel) || !isRealtimeChannelOpen(sessionChannel)) return;

  // The model accepts exactly one output per tool-call id. Turn guidance rides in the tool
  // result because response-level instructions would replace the whole session prompt.
  if (!state.sentToolOutputCallIds.has(callId)) {
    state.sentToolOutputCallIds.add(callId);
    sessionChannel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(toModelSchedulingResult(result, responseGuidance))
      }
    }));
  }

  requestSchedulingFollowup(callId);
}

// Riley should speak the scheduling result exactly once. If a response is already being
// generated, defer instead of racing it; the deferred turn is released by response.done.
function requestSchedulingFollowup(callId) {
  if (state.sentFollowupCallIds.has(callId)) return;
  const followup = { callId };
  if (state.activeResponseId) {
    state.pendingSchedulingFollowup = followup;
    return;
  }
  submitSchedulingFollowup(followup);
}

function submitSchedulingFollowup(followup) {
  if (!isRealtimeChannelOpen()) return;
  const eventId = `sched_followup_${++state.followupSeq}`;
  state.sentFollowupCallIds.add(followup.callId);
  state.inFlightFollowups.set(eventId, followup);
  state.dataChannel.send(JSON.stringify({
    event_id: eventId,
    type: "response.create",
    response: { output_modalities: ["audio"] }
  }));
}

function flushPendingSchedulingFollowup() {
  const pending = state.pendingSchedulingFollowup;
  if (!pending) return;
  state.pendingSchedulingFollowup = null;
  if (!isRealtimeChannelOpen()) return;
  submitSchedulingFollowup(pending);
}

function toModelSchedulingResult(result, responseGuidance = "") {
  return {
    status: result.status,
    selected_slot_id: result.selected_slot_id,
    alternate_slot_id: result.alternate_slot_id,
    patient_name: result.patient_name,
    requested_window: result.requested_window,
    alternate_window: result.alternate_window,
    available_slots: result.available_slots,
    confirmed_window: result.confirmed_window,
    confirmation_number: result.confirmation_number,
    visit_type: result.visit_type,
    facility: result.facility,
    language_preference: result.language_preference,
    caregiver_context: result.caregiver_context,
    reason: result.reason,
    message: result.message,
    next_action: result.next_action,
    response_guidance: responseGuidance || undefined
  };
}

function formatSchedulingResult(result) {
  if (result.status === "confirmed") {
    return `Confirmed ${result.visit_type || "visit"} at ${result.facility || "Northlake"} for ${result.confirmed_window}. Confirmation ${result.confirmation_number}.`;
  }
  if (result.status === "options_found") {
    const slots = (result.available_slots || []).slice(0, 3).map(slot => slot.window).join("; ");
    return `Available openings found: ${slots}.`;
  }
  if (result.status === "alternate_proposed") {
    return `${result.reason || "The requested window is full."} Later same-morning opening: ${result.alternate_window}.`;
  }
  return result.message || "Scheduling system returned a staff handoff.";
}

function formatSchedulingPacket(result) {
  if (result.status === "confirmed") {
    return [
      "Care access packet: ready",
      "Intent: reschedule imaging",
      "Validation: complete",
      "Scheduling system: confirmed",
      result.requested_window ? `Requested: ${result.requested_window}` : null,
      `Confirmation: ${result.confirmation_number}`,
      `Slot: ${result.confirmed_window}`,
      `Facility: ${result.facility}`,
      result.language_preference ? `Language: ${result.language_preference}` : null,
      result.caregiver_context ? `Caregiver context: ${result.caregiver_context}` : null,
      "Status: confirmed"
    ].filter(Boolean);
  }
  if (result.status === "alternate_proposed") {
    return [
      "Care access packet: updating",
      "Intent: reschedule imaging",
      "Validation: complete",
      "Scheduling system: alternate found",
      `Requested: ${result.requested_window}`,
      `Alternate: ${result.alternate_window}`,
      result.language_preference ? `Language: ${result.language_preference}` : null,
      result.caregiver_context ? `Caregiver context: ${result.caregiver_context}` : null,
      "Next: ask caller to accept alternate",
      "Status: alternate proposed"
    ].filter(Boolean);
  }
  if (result.status === "options_found") {
    const slots = result.available_slots || [];
    return [
      "Care access packet: updating",
      "Intent: reschedule imaging",
      "Validation: complete",
      "Scheduling system: options found",
      `Requested: ${result.requested_window}`,
      ...slots.slice(0, 3).map((slot, index) => `Option ${index + 1}: ${slot.window} (${slot.fit})`),
      result.language_preference ? `Language: ${result.language_preference}` : null,
      result.caregiver_context ? `Caregiver context: ${result.caregiver_context}` : null,
      "Next: ask caller to choose a slot",
      "Status: options offered"
    ].filter(Boolean);
  }
  if (result.status === "needs_clarification") {
    return [
      "Care access packet: updating",
      "Intent: reschedule imaging",
      "Validation: complete",
      "Scheduling system: needs requested window",
      result.next_action || "Next: ask caller for a day or time window",
      "Status: needs patient"
    ].filter(Boolean);
  }
  return [
    "Scheduling system: staff review",
    result.next_action || "Route to staff queue",
    "Status: staff review"
  ];
}

// Startup counts as active so reset, scenario changes, and panel closure invalidate a
// session that is still connecting.
function isRealtimeSessionActive() {
  return Boolean(state.peerConnection) || state.connecting;
}

function stopRealtimeSession() {
  state.realtimeSessionGeneration += 1;
  state.connecting = false;
  state.dataChannel?.close();
  state.peerConnection?.close();
  state.localStream?.getTracks().forEach(track => track.stop());
  state.remoteAudio?.pause();
  state.remoteAudio?.remove();
  state.dataChannel = null;
  state.handledToolCalls = new Set();
  state.toolCallArgumentDeltas = new Map();
  state.toolCallNames = new Map();
  state.pendingToolTimers.forEach(timer => clearTimeout(timer));
  state.pendingToolTimers = new Map();
  state.pendingToolStatuses = new Set();
  state.schedulingFallbacks = new Set();
  state.schedulingWindowsHandled = new Set();
  state.voiceVerified = false;
  state.demoSessionId = "";
  state.schedulingCapability = "";
  state.verificationPromise = null;
  state.liveConversationHints = { languagePreference: "", caregiverContext: "" };
  flushOpenAgentTurns();
  state.packetOwner = "none";
  state.liveMilestoneRank = 0;
  state.liveValidated = false;
  state.lastCallerTranscript = "";
  state.callerVerificationText = "";
  // Pending realtime work must never leak into the next session.
  state.activeResponseId = null;
  state.pendingSchedulingFollowup = null;
  state.inFlightFollowups = new Map();
  state.sentFollowupCallIds = new Set();
  state.sentToolOutputCallIds = new Set();
  state.peerConnection = null;
  state.localStream = null;
  state.remoteAudio = null;
  els.startRealtimeBtn.disabled = false;
  els.startRealtimeBtn.textContent = "Answer call";
  els.stopRealtimeBtn.disabled = true;
  if (els.patientStartBtn) { els.patientStartBtn.disabled = false; els.patientStartBtn.textContent = "Start conversation"; }
  if (els.patientStopBtn) els.patientStopBtn.disabled = true;
  els.agentFace.classList.remove("is-live");
  if (els.orbLiveLabel) els.orbLiveLabel.textContent = isPatientView() ? "Tap mic to chat" : "Tap mic to answer";
  setSpeaking(false);
  setConnectionState(state.realtimeAvailable ? "ready" : "idle", state.realtimeAvailable ? "Realtime-ready" : "Scripted mode");
}

els.startBtn.addEventListener("click", runScriptedDemo);
els.resetBtn.addEventListener("click", resetDemo);
els.muteBtn.addEventListener("click", () => {
  state.muted = !state.muted;
  els.muteBtn.textContent = state.muted ? "Voice: Off" : "Voice: On";
  if (state.muted) {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }
});
els.copyScriptBtn.addEventListener("click", async () => {
  const text = `${scenario().hook}\n\n${scenario().talkTrack}\n\n${scenario().close}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Talk track copied.");
  } catch {
    showToast("Copy unavailable in this browser.");
  }
});
els.demoMode.addEventListener("change", () => {
  if (els.demoMode.value === "realtime" && !state.realtimeAvailable) {
    showToast("Realtime voice selected, but the token service is not configured yet.");
  }
});
function isPatientView() {
  return document.body.dataset.view === "patient";
}

function toggleRealtimeSession() {
  if (state.peerConnection) {
    stopRealtimeSession();
  } else {
    startRealtimeSession();
  }
}

els.startRealtimeBtn.addEventListener("click", startRealtimeSession);
els.stopRealtimeBtn.addEventListener("click", stopRealtimeSession);
els.agentFace.addEventListener("click", toggleRealtimeSession);
els.agentFace.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleRealtimeSession();
  }
});

// --- Patient site + assistant panel -----------------------------------

const SITE_PAGES = {
  access: {
    eyebrow: "Schedule & Imaging",
    title: "Schedule your visit, get clear prep instructions, and find your way in.",
    body: "Most routine scheduling and imaging questions can be handled in under two minutes with our virtual assistant. We loop in a teammate any time it isn\u2019t routine.",
    actions: [
      { label: "Reschedule a visit", primary: true, intent: "reschedule" },
      { label: "Find an imaging center", primary: false, intent: "location" },
      { label: "Prep instructions", primary: false, intent: "prep" }
    ],
    tiles: [
      { title: "Imaging", body: "Northlake Imaging Center, with parking and accessibility notes.", icon: "image" },
      { title: "Primary care", body: "Harborview Clinic offers same-week openings for established patients.", icon: "clinic" },
      { title: "Specialty", body: "Riverside Specialty Pavilion for cardiology, endocrinology, and more.", icon: "specialty" }
    ],
    info: {
      heading: "What to bring",
      list: ["Photo ID", "Insurance card if you have one", "Any prior records the office requested", "Plan to arrive 15 minutes early"]
    },
    callout: "Need to reschedule? Tap the assistant."
  },
  revenue: {
    eyebrow: "Billing & Insurance",
    title: "Understand your statement, and set up a payment plan if you need one.",
    body: "Our virtual assistant can walk you through how a claim moves and prepare a billing review without asking for your account number. A teammate handles disputes and hardship reviews.",
    actions: [
      { label: "Explain my statement", primary: true, intent: "explain" },
      { label: "Pay online", primary: false, intent: "pay" },
      { label: "Request a payment plan", primary: false, intent: "plan" }
    ],
    tiles: [
      { title: "Statement explainer", body: "Walk through pending vs. processed without exposing account details.", icon: "doc" },
      { title: "Payment plans", body: "Capture interest and route to the billing team for follow-up.", icon: "card" },
      { title: "Financial assistance", body: "Hardship reviews go to a billing specialist for safe handling.", icon: "shield" }
    ],
    info: {
      heading: "Ways to pay",
      list: ["Online in Northlake MyHealth", "By phone with the billing team", "By mailed check", "Payment plan, on request"]
    },
    callout: "Have a statement question? Tap the assistant."
  },
  multilingual: {
    eyebrow: "Language Access",
    title: "Get help in your preferred language, with a certified interpreter when you need one.",
    body: "Northlake Health supports access calls directly in English and Spanish, and arranges certified interpreters for many other languages. Clinical translation always routes to a human.",
    actions: [
      { label: "Confirm a visit", primary: true, intent: "confirm" },
      { label: "Request an interpreter", primary: false, intent: "interpreter" },
      { label: "Family on the callback", primary: false, intent: "family" }
    ],
    tiles: [
      { title: "Direct support", body: "English and Spanish, available now through the assistant.", icon: "globe" },
      { title: "Certified interpreters", body: "Mandarin, Vietnamese, Russian, Arabic, Tagalog, Somali, and ASL on request.", icon: "speech" },
      { title: "Accessibility", body: "Wheelchair access at all locations; ASL scheduling routes to our coordinator.", icon: "access" }
    ],
    info: {
      heading: "How language access works",
      list: [
        "The assistant captures your preferred language",
        "Routine confirmations are handled directly",
        "Clinical or complex needs route to certified language services",
        "You\u2019ll see a callback in your preferred window"
      ]
    },
    callout: "Prefer another language? Tap the assistant."
  }
};

const SITE_HERO_ART = {
  access: '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><defs><linearGradient id="hgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.18"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.04"/></linearGradient></defs><rect x="28" y="40" width="144" height="120" rx="16" fill="url(#hgA)" stroke="currentColor" stroke-width="2"/><path d="M28 72h144" stroke="currentColor" stroke-width="2"/><path d="M64 32v20M136 32v20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="70" cy="100" r="6" fill="currentColor"/><circle cx="100" cy="100" r="6" fill="currentColor" opacity="0.55"/><circle cx="130" cy="100" r="6" fill="currentColor" opacity="0.3"/><circle cx="70" cy="128" r="6" fill="currentColor" opacity="0.3"/><circle cx="100" cy="128" r="6" fill="currentColor"/><circle cx="130" cy="128" r="6" fill="currentColor" opacity="0.55"/></svg>',
  revenue: '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><defs><linearGradient id="hgR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.18"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.04"/></linearGradient></defs><rect x="44" y="36" width="112" height="140" rx="14" fill="url(#hgR)" stroke="currentColor" stroke-width="2"/><path d="M64 64h72M64 84h72M64 104h48M64 124h60" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="100" cy="158" r="14" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="2"/><path d="M96 152v12M104 152v12M93 158h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  multilingual: '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><defs><linearGradient id="hgM" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.18"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.04"/></linearGradient></defs><circle cx="100" cy="100" r="68" fill="url(#hgM)" stroke="currentColor" stroke-width="2"/><path d="M32 100h136M100 32a92 92 0 0 1 0 136M100 32a92 92 0 0 0 0 136" stroke="currentColor" stroke-width="2"/><path d="M64 70h72M64 100h72M64 130h48" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/></svg>'
};

const SITE_STATS = [
  { value: "1.2M", label: "patient visits a year" },
  { value: "24/7", label: "virtual assistant" },
  { value: "9 languages", label: "with certified interpreters" },
  { value: "<2 min", label: "for routine access" }
];

const SITE_TRUST_BADGES = [
  "Accredited care",
  "Secure by design",
  "PHI protected",
  "Available in English & Spanish"
];

const SITE_TILE_ICONS = {
  image: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="11" r="2" stroke="currentColor" stroke-width="1.8"/><path d="M21 17l-5-5-8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  clinic: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 21V8l8-5 8 5v13" stroke="currentColor" stroke-width="1.8"/><path d="M10 21v-5h4v5M12 11v4M10 13h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  specialty: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-7-11a5 5 0 0 1 10 0 5 5 0 0 1 10 0c0 6.5-7 11-7 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14H6z" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M7 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" stroke="currentColor" stroke-width="1.8"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.8"/></svg>',
  speech: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H8l-4 4z" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h8M8 12h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  access: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 8l3 5h4l3 5M9 8l-2 11M12 13v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

function renderSitePage() {
  const page = SITE_PAGES[state.scenarioKey];
  if (!page || !els.sitePage) return;
  const actions = page.actions.map(a => `<button class="btn ${a.primary ? "primary" : ""}" data-intent="${a.intent}">${a.label}</button>`).join("");
  const tiles = page.tiles.map(t => `
    <button class="site-tile" type="button">
      <span class="site-tile-icon">${SITE_TILE_ICONS[t.icon] || ""}</span>
      <b>${t.title}</b>
      <span>${t.body}</span>
    </button>
  `).join("");
  const trustBadges = SITE_TRUST_BADGES.map(b => `<span class="site-trust-badge">${b}</span>`).join("");
  const stats = SITE_STATS.map(s => `<div class="site-stat"><b>${s.value}</b><span>${s.label}</span></div>`).join("");
  els.sitePage.innerHTML = `
    <section class="site-hero">
      <div>
        <span class="site-hero-eyebrow">${page.eyebrow}</span>
        <h1>${page.title}</h1>
        <p>${page.body}</p>
        <div class="site-hero-actions">${actions}</div>
        <div class="site-trust-row">${trustBadges}</div>
      </div>
      <div class="site-hero-art">${SITE_HERO_ART[state.scenarioKey] || ""}</div>
    </section>
    <section class="site-stats">${stats}</section>
    <section class="site-tiles">${tiles}</section>
    <section class="site-info">
      <div class="site-info-card">
        <h3>${page.info.heading}</h3>
        <ul>${page.info.list.map(item => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="site-info-card">
        <h3>${page.callout}</h3>
        <p>Anything outside routine access goes to a teammate, with the right context carried forward.</p>
      </div>
    </section>
  `;
  els.sitePage.querySelectorAll("[data-intent]").forEach(btn => {
    btn.addEventListener("click", () => openAssistantPanel());
  });
  els.sitePage.querySelectorAll(".site-tile").forEach(btn => {
    btn.addEventListener("click", () => openAssistantPanel());
  });
  if (els.assistantPanelTitle) {
    els.assistantPanelTitle.textContent = page.callout || "How can I help today?";
  }
  renderPortalPreview();
}

function renderPortalPreview() {
  const host = document.getElementById("portalPreview");
  if (!host) return;
  const profile = signedInProfileForCurrentScenario();
  if (!profile) { host.innerHTML = ""; return; }
  let body = "";
  if (profile.upcomingAppointment) {
    const a = profile.upcomingAppointment;
    body = `
      <div class="portal-card-header">
        <b>Your next visit</b>
        <span class="pill">${escapeHtml(a.status)}</span>
      </div>
      <div class="portal-card-grid">
        <div><div class="label">Type</div><div class="value">${escapeHtml(a.type)}</div></div>
        <div><div class="label">When</div><div class="value">${escapeHtml(a.when)}</div></div>
        <div><div class="label">Where</div><div class="value">${escapeHtml(a.facility)}</div></div>
        <div><div class="label">Provider</div><div class="value">${escapeHtml(a.provider)}</div></div>
        <div><div class="label">Check-in</div><div class="value">${escapeHtml(a.checkInWindow)}</div></div>
        <div><div class="label">Prep</div><div class="value">${escapeHtml(a.prep)}</div></div>
      </div>`;
  } else if (profile.recentStatement) {
    const s = profile.recentStatement;
    body = `
      <div class="portal-card-header">
        <b>Recent statement</b>
        <span class="pill">${escapeHtml(s.status)}</span>
      </div>
      <div class="portal-card-grid">
        <div><div class="label">Date of service</div><div class="value">${escapeHtml(s.dateOfService)}</div></div>
        <div><div class="label">Summary</div><div class="value">${escapeHtml(s.summary)}</div></div>
        <div><div class="label">Payer</div><div class="value">${escapeHtml(s.payerNote)}</div></div>
        <div><div class="label">Your responsibility</div><div class="value">${escapeHtml(s.patientResponsibility)}</div></div>
      </div>`;
  }
  host.innerHTML = body ? `<div class="portal-card">${body}</div>` : "";
}

function setSitePage(key) {
  if (!SITE_PAGES[key]) return;
  if (isRealtimeSessionActive()) {
    stopRealtimeSession();
    showToast("Conversation ended; switching to " + SITE_PAGES[key].eyebrow + ".");
  }
  state.scenarioKey = key;
  resetDemo();
  renderScenario();
  renderScenarioCards();
  renderSitePage();
  if (els.siteNav) {
    els.siteNav.querySelectorAll(".site-nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === key));
  }
}

function setView(view) {
  if (view !== "patient" && view !== "executive") return;
  els.body.dataset.view = view;
  if (els.viewSwitchState) els.viewSwitchState.textContent = view === "patient" ? "Patient view" : "Executive view";
  if (els.executiveApp) els.executiveApp.setAttribute("aria-hidden", view === "executive" ? "false" : "true");
  if (els.patientApp) {
    els.patientApp.inert = DOMAIN.isPatientBackgroundInert(
      view,
      els.assistantPanel?.classList.contains("open")
    );
  }
  if (els.callerEyebrow) els.callerEyebrow.textContent = view === "patient" ? "Active user" : "Active caller";
  // Move the agent surface into the right slot
  const target = view === "patient" ? els.assistantSlot : els.executiveAgentSlot;
  if (target && els.agentSurface && els.agentSurface.parentElement !== target) {
    target.appendChild(els.agentSurface);
  }
  // Update orb label for the current view + state
  if (els.orbLiveLabel) {
    if (state.peerConnection) {
      els.orbLiveLabel.textContent = view === "patient" ? "Tap mic to end" : "Conversation live";
    } else {
      els.orbLiveLabel.textContent = view === "patient" ? "Tap mic to chat" : "Tap mic to answer";
    }
  }
  // Leaving patient view hides the modal but keeps a live call running; the agent surface
  // moves to the executive slot so the presenter can show the dashboard mid-call.
  if (view === "executive") closeAssistantPanel({ endSession: false, restoreFocus: false });
}

function openAssistantPanel() {
  if (!els.assistantPanel) return;
  if (els.body.dataset.view !== "patient") setView("patient");
  // Ensure agent surface is in the panel slot
  if (els.agentSurface && els.assistantSlot && els.agentSurface.parentElement !== els.assistantSlot) {
    els.assistantSlot.appendChild(els.agentSurface);
  }
  // Re-render in case state changed while the panel was closed
  renderSignedInUser();
  renderPortalPreview();
  state.lastFocusedElement = document.activeElement;
  els.assistantPanel.inert = false;
  els.assistantPanel.classList.add("open");
  els.assistantPanel.setAttribute("aria-hidden", "false");
  if (els.patientApp) els.patientApp.inert = true;
  if (els.assistantFab) {
    els.assistantFab.inert = true;
    els.assistantFab.setAttribute("aria-expanded", "true");
  }
  if (els.viewSwitch) els.viewSwitch.inert = true;
  if (els.assistantBackdrop) els.assistantBackdrop.hidden = false;
  // During a live call the start button is disabled, so focus the active End control.
  const focusTarget = [els.patientStartBtn, els.patientStopBtn, els.assistantPanelClose]
    .find(element => element && !element.disabled);
  focusWithoutScroll(focusTarget);
}

function closeAssistantPanel({ endSession = true, restoreFocus = true } = {}) {
  if (!els.assistantPanel) return;
  const wasOpen = els.assistantPanel.classList.contains("open");
  if (endSession && isRealtimeSessionActive()) {
    stopRealtimeSession();
    showToast("Conversation ended.");
  }
  els.assistantPanel.classList.remove("open");
  els.assistantPanel.setAttribute("aria-hidden", "true");
  els.assistantPanel.inert = true;
  if (els.patientApp) {
    els.patientApp.inert = DOMAIN.isPatientBackgroundInert(els.body.dataset.view, false);
  }
  if (els.assistantFab) {
    els.assistantFab.inert = false;
    els.assistantFab.setAttribute("aria-expanded", "false");
  }
  if (els.viewSwitch) els.viewSwitch.inert = false;
  if (els.assistantBackdrop) els.assistantBackdrop.hidden = true;
  const focusTarget = state.lastFocusedElement?.isConnected
    ? state.lastFocusedElement
    : els.assistantFab;
  state.lastFocusedElement = null;
  if (restoreFocus && wasOpen && focusTarget) {
    try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
  }
}

function trapAssistantPanelFocus(event) {
  if (event.key !== "Tab" || !els.assistantPanel?.classList.contains("open")) return;
  const focusable = [...els.assistantPanel.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(element => !element.inert && element.getClientRects().length > 0);
  if (focusable.length === 0) {
    event.preventDefault();
    els.assistantPanel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

els.executiveApp = els.executiveApp || document.getElementById("executiveApp");

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.assistantPanel && els.assistantPanel.classList.contains("open")) {
    closeAssistantPanel();
    return;
  }
  trapAssistantPanelFocus(event);
});
if (els.assistantBackdrop) els.assistantBackdrop.addEventListener("click", () => closeAssistantPanel());

function focusWithoutScroll(element) {
  if (!element) return;
  try { element.focus({ preventScroll: true }); } catch { element.focus(); }
}

// A live call follows the presenter between views: patient view reopens the panel, and
// executive view shows the same call with the dashboard.
function switchView(next) {
  setView(next);
  if (next === "patient" && isRealtimeSessionActive()) {
    openAssistantPanel();
  } else if (next === "executive") {
    focusWithoutScroll(els.agentFace);
  }
}

if (els.viewSwitch) {
  els.viewSwitch.addEventListener("click", () => {
    switchView(els.body.dataset.view === "patient" ? "executive" : "patient");
  });
}
if (els.panelExecutiveViewBtn) {
  els.panelExecutiveViewBtn.addEventListener("click", () => switchView("executive"));
}
if (els.siteNav) {
  els.siteNav.querySelectorAll(".site-nav-link").forEach(btn => {
    btn.addEventListener("click", () => setSitePage(btn.dataset.page));
  });
}
if (els.assistantFab) els.assistantFab.addEventListener("click", () => {
  openAssistantPanel();
});
if (els.assistantPanelClose) els.assistantPanelClose.addEventListener("click", () => closeAssistantPanel());
if (els.patientStartBtn) els.patientStartBtn.addEventListener("click", startRealtimeSession);
if (els.patientStopBtn) els.patientStopBtn.addEventListener("click", stopRealtimeSession);

window.voiceDemoDiagnostics = () => ({
  connectionState: state.peerConnection?.connectionState || "not-connected",
  iceConnectionState: state.peerConnection?.iceConnectionState || "not-connected",
  dataChannelState: state.dataChannel?.readyState || "not-open",
  remoteAudio: state.remoteAudio ? {
    paused: state.remoteAudio.paused,
    muted: state.remoteAudio.muted,
    volume: state.remoteAudio.volume,
    readyState: state.remoteAudio.readyState,
    currentTime: state.remoteAudio.currentTime,
    hasSrcObject: Boolean(state.remoteAudio.srcObject)
  } : null,
  localAudioTracks: state.localStream
    ? state.localStream.getAudioTracks().map(track => ({
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label
      }))
    : [],
  recentAudio: state.audioPlaybackLog.slice(-30),
  recentEvents: state.realtimeEventLog.slice(-50)
});

renderScenario();
renderScenarioCards();
renderSitePage();
resetDemo();
els.demoMode.value = "realtime";
ensureTtsVoice();
setView(els.body.dataset.view === "executive" ? "executive" : "patient");
checkRealtime();
