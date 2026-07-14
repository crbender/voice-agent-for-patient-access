"use strict";

const state = {
  scenarioKey: "access",
  timers: [],
  muted: false,
  running: false,
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
  callerVerificationProvided: false,
  demoSessionId: "",
  schedulingCapability: "",
  verificationPromise: null,
  liveConversationHints: {
    languagePreference: "",
    caregiverContext: ""
  },
  agentTranscriptBuffer: "",
  agentAudioTurnText: "",
  agentAudioSegments: [],
  agentAudioTurnStarted: false,
  callbackDriftCancelled: false,
  lastCallerTranscript: "",
  callerVerificationText: "",
  localStream: null,
  remoteAudio: null,
  realtimeEventLog: [],
  audioPlaybackLog: [],
  scriptStartedAt: 0,
  totalScenes: 0,
  currentSceneIndex: -1,
  ttsVoice: null,
  currentUtterance: null,
  lastFocusedElement: null,
  stoppingRealtime: false
};

const SCENARIO_ICONS = {
  access: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/></svg>',
  revenue: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 14h2M13 14h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  multilingual: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.8"/></svg>'
};

const AVATAR_AGENT = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 11a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.5v5M12 8v8M15 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const AVATAR_SYSTEM = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.8"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="1.8"/></svg>';

const SCHEDULING_TOOL_NAME = "confirm_appointment_reschedule";
const MAX_TRANSCRIPT_MESSAGES = 80;
const DOMAIN = window.VOICE_DEMO_DOMAIN;
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
  patientApp: document.getElementById("patientApp"),
  assistantFab: document.getElementById("assistantFab"),
  assistantBackdrop: document.getElementById("assistantBackdrop"),
  assistantPanel: document.getElementById("assistantPanel"),
  assistantPanelTitle: document.getElementById("assistantPanelTitle"),
  assistantPanelClose: document.getElementById("assistantPanelClose"),
  assistantSlot: document.getElementById("assistantSlot"),
  executiveAgentSlot: document.getElementById("executiveAgentSlot"),
  agentSurface: document.getElementById("agentSurface"),
  patientStartBtn: document.getElementById("patientStartBtn"),
  patientStopBtn: document.getElementById("patientStopBtn"),
  executiveApp: document.getElementById("executiveApp"),
  callerEyebrow: document.getElementById("callerEyebrow"),
  siteUserName: document.getElementById("siteUserName"),
  siteUserAvatar: document.getElementById("siteUserAvatar"),
  siteUserHint: document.getElementById("siteUserHint")
};

function scenario() {
  return window.DEMO_SCENARIOS[state.scenarioKey];
}

function activeVerificationRecord() {
  const acceptedValues = window.SYNTHETIC_KNOWLEDGE?.shared?.validationProtocol?.acceptedDemoValues || [];
  return DOMAIN.findActiveVerificationRecord(signedInProfileForCurrentScenario(), acceptedValues);
}

function scopedRealtimeKnowledge() {
  return DOMAIN.buildScopedRealtimeContext(
    window.SYNTHETIC_KNOWLEDGE,
    state.scenarioKey
  ).knowledge;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function waitForDataChannelOpen(dataChannel, timeoutMs = 10000) {
  if (dataChannel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Realtime data channel did not become ready."));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("close", handleClose);
      dataChannel.removeEventListener("error", handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      reject(new Error("Realtime data channel closed before it was ready."));
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Realtime data channel failed before it was ready."));
    };
    dataChannel.addEventListener("open", handleOpen);
    dataChannel.addEventListener("close", handleClose);
    dataChannel.addEventListener("error", handleError);
  });
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
    button.addEventListener("click", () => selectScenario(button.dataset.scenario));
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
  while (els.transcript.querySelectorAll(".bubble-row").length > MAX_TRANSCRIPT_MESSAGES) {
    els.transcript.querySelector(".bubble-row")?.remove();
  }
  els.transcript.scrollTop = els.transcript.scrollHeight;
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
  els.actionPacket.innerHTML = item.packet.map(line => `<span>${line}</span>`).join("");
  if (item.tag) {
    els.handoffTag.textContent = item.tag;
    els.handoffTag.classList.toggle("hot", item.tag !== "Complete");
    els.handoffTag.classList.toggle("complete", item.tag === "Complete");
  }
}

function setActionPacketLines(lines, tag = "Confirmed") {
  els.actionPacket.innerHTML = lines.map(line => `<span>${escapeHtml(line)}</span>`).join("");
  els.handoffTag.textContent = tag;
  els.handoffTag.classList.toggle("hot", tag !== "Complete" && tag !== "Confirmed");
  els.handoffTag.classList.toggle("complete", tag === "Complete" || tag === "Confirmed");
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
    const response = await fetchWithTimeout("/api/realtime/status", {}, 3000);
    if (!response.ok) throw new Error("No proxy");
    const data = await response.json();
    state.realtimeAvailable = Boolean(data.configured);
    els.realtimeStatus.textContent = data.configured ? "Realtime configuration detected" : "Realtime voice not configured";
    els.realtimeDetail.textContent = data.configured
      ? `Deployment: ${data.deployment}. Voice: ${data.voice}. Protocol: ${data.protocol}. Auth: ${data.auth}.`
      : "Add AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_REALTIME_DEPLOYMENT, and AZURE_OPENAI_API_KEY to .env, then restart server.py.";
    setConnectionState(data.configured ? "ready" : "idle", data.configured ? "Configured" : "Scripted mode");
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
  if (state.peerConnection) {
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

  try {
    state.realtimeEventLog = [];
    state.audioPlaybackLog = [];
    const sessionResponse = await fetchWithTimeout("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey: state.scenarioKey,
        knowledge: scopedRealtimeKnowledge(),
        signedInProfile: signedInProfileForCurrentScenario(),
        demoScript: scenario().script.map(item => ({
          scene: item.scene,
          who: item.who,
          type: item.type,
          text: item.text,
          packet: item.packet || []
        }))
      })
    }, 15000);
    const sessionData = await sessionResponse.json();
    if (!sessionResponse.ok) {
      const azureMessage = sessionData.error?.message || sessionData.error || "Realtime session request failed.";
      throw new Error(sessionData.guidance ? `${azureMessage} ${sessionData.guidance}` : azureMessage);
    }
    if (!sessionData.demoSessionId) {
      throw new Error("Realtime session did not include demo authorization state.");
    }
    state.demoSessionId = sessionData.demoSessionId;
    state.schedulingCapability = "";
    state.voiceVerified = false;

    const peerConnection = new RTCPeerConnection();
    const remoteAudio = document.createElement("audio");
    remoteAudio.id = "realtimeRemoteAudio";
    remoteAudio.className = "realtime-remote-audio";
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.preload = "auto";
    remoteAudio.setAttribute("aria-hidden", "true");
    document.body.appendChild(remoteAudio);
    state.peerConnection = peerConnection;
    state.remoteAudio = remoteAudio;
    els.agentFace.classList.add("is-live");

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
        setConnectionState("live", "Live voice");
        if (els.orbLiveLabel) els.orbLiveLabel.textContent = isPatientView() ? "Tap mic to end" : "Conversation live";
      } else if (s === "failed") {
        setConnectionState("error", `Voice: ${s}`);
        if (state.peerConnection === peerConnection) {
          addMessage({
            who: "Realtime status",
            type: "system",
            text: "The live voice connection ended unexpectedly. You can retry or use the scripted demo."
          });
          stopRealtimeSession();
        }
      } else if (s === "disconnected") {
        setConnectionState("error", `Voice: ${s}`);
      } else {
        setConnectionState("warn", `Voice: ${s}`);
      }
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    state.localStream.getTracks().forEach(track => peerConnection.addTrack(track, state.localStream));

    const dataChannel = peerConnection.createDataChannel("realtime-channel");
    state.dataChannel = dataChannel;
    dataChannel.addEventListener("open", () => {
      showToast("Riley is ready.");
      dataChannel.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: sessionData.instructions,
          tools: sessionData.tools || [],
          tool_choice: "auto",
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: { model: sessionData.transcriptionModel || "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.35,
                prefix_padding_ms: 500,
                silence_duration_ms: 1050,
                create_response: true
              }
            },
            output: { voice: sessionData.voice || "alloy" }
          }
        }
      }));
      dataChannel.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `A signed-in Northlake MyHealth user opened the live voice assistant for the ${scenario().label} workflow. Start naturally as Riley, acknowledge the MyHealth sign-in, and perform voice-channel verification before handling any request or mentioning appointment-specific details. Ask only for the caller's name and date of birth. After verification, follow the caller's intent naturally; they may confirm the visit, ask an access question, request a reschedule, choose an offered slot, or change direction.`
          }]
        }
      }));
      dataChannel.send(JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: "Respond with audio. Start with a brief Riley greeting, acknowledge the signed-in MyHealth context, and ask for voice-channel verification with name and date of birth. Do not mention appointment-specific details or handle the caller's request until verification is complete. End with that verification question so the caller knows exactly what to do next."
        }
      }));
    });
    dataChannel.addEventListener("message", event => handleRealtimeEvent(event.data));
    dataChannel.addEventListener("close", () => {
      setSpeaking(false);
      if (!state.stoppingRealtime && state.dataChannel === dataChannel) {
        addMessage({
          who: "Realtime status",
          type: "system",
          text: "The live voice channel closed. You can retry or use the scripted demo."
        });
        stopRealtimeSession();
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const sdpResponse = await fetchWithTimeout(sessionData.callsUrl, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${sessionData.token}`,
        "Content-Type": "application/sdp"
      }
    }, 15000);
    if (!sdpResponse.ok) throw new Error(`Realtime connection failed with status ${sdpResponse.status}.`);
    await peerConnection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    await waitForDataChannelOpen(dataChannel);
    els.startRealtimeBtn.textContent = "Conversation live";
    if (els.patientStartBtn) els.patientStartBtn.textContent = "Conversation live";
    showToast("Live realtime voice connected.");
  } catch (error) {
    if (DEBUG_REALTIME) console.error("[realtime-start]", error);
    addMessage({
      who: "Realtime status",
      type: "system",
      text: "Live voice could not start. Check the local configuration and retry, or use the scripted demo."
    });
    stopRealtimeSession();
  }
}

function handleRealtimeEvent(rawMessage) {
  let event;
  try {
    event = JSON.parse(rawMessage);
  } catch (error) {
    if (DEBUG_REALTIME) console.warn("[realtime-event-invalid]", error);
    return;
  }
  logRealtimeEvent(event);

  if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
    state.lastCallerTranscript = event.transcript;
    addMessage({ who: "Caller", type: "patient", text: event.transcript });
    updateVoiceVerificationFromCallerText(event.transcript);
    syncServerVerification(event.transcript);
    updateLiveConversationHints(event.transcript);
  }
  if (event.type === "response.output_audio_transcript.done" && event.transcript) {
    const agentText = event.transcript;
    state.agentAudioSegments.push(agentText);
    state.callbackDriftCancelled = false;
  }
  if (event.type === "response.output_audio_transcript.delta" && event.delta) {
    state.agentTranscriptBuffer += event.delta;
    state.agentAudioTurnText += event.delta;
    ensureRemoteAudioPlayback("audio-transcript-delta");
    setSpeaking(true);
  }
  if (event.type === "output_audio_buffer.started") {
    state.agentAudioTurnStarted = true;
    state.agentAudioTurnText = "";
    state.agentAudioSegments = [];
    state.agentTranscriptBuffer = "";
    ensureRemoteAudioPlayback("output-audio-started");
    setSpeaking(true);
  }
  if (event.type === "output_audio_buffer.stopped") {
    flushAgentAudioTurn();
    setSpeaking(false);
  }
  if (event.type === "error" && event.error?.message) {
    if (DEBUG_REALTIME) console.error("[realtime-service]", event.error);
    addMessage({
      who: "Realtime status",
      type: "system",
      text: "The live voice service reported an error. End the conversation and retry."
    });
  }
  maybeHandleRealtimeToolCall(event);
}

function flushAgentAudioTurn() {
  const segments = state.agentAudioSegments.map(normalizeWhitespace).filter(Boolean);
  const text = segments.length
    ? cleanAgentTurn(segments.join(" "))
    : cleanAgentTurn(state.agentAudioTurnText);
  if (text) {
    addMessage({ who: "Riley", type: "agent", text });
  }
  state.agentAudioTurnText = "";
  state.agentAudioSegments = [];
  state.agentTranscriptBuffer = "";
  state.agentAudioTurnStarted = false;
  state.callbackDriftCancelled = false;
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
    clearPendingToolWatchdog(event.call_id);
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
  }, 12000);
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
    caregiver_context: args.caregiver_context || args.caregiverContext || "",
    demo_session_id: state.demoSessionId,
    scheduling_capability: state.schedulingCapability
  };

  await waitForServerVerification();
  payload.demo_session_id = state.demoSessionId;
  payload.scheduling_capability = state.schedulingCapability;

  if (state.scenarioKey === "access" && !hasSchedulingAuthorization()) {
    const result = {
      status: "validation_required",
      message: "Server-verified voice-channel verification is required before scheduling.",
      next_action: "Ask for caller name and date of birth before checking appointment availability."
    };
    sendSchedulingFunctionOutputToRealtime(callId, result, "Ask for caller name and date of birth, then continue the scheduling workflow. Do not ask for a callback.");
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
      "Ask what day or time window works best before checking the scheduling system. Do not confirm or imply a slot is booked."
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
    const response = await fetchWithTimeout("/api/demo-tools/confirm-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, 8000);
    const result = await response.json();
    result.client_elapsed_ms = Math.round(performance.now() - startedAt);
    if (result.status === "validation_required") {
      state.voiceVerified = false;
      state.schedulingCapability = "";
    }
    if (!response.ok && result.status !== "validation_required") {
      throw new Error(result.error || "Scheduling tool failed.");
    }

    const resultText = formatSchedulingResult(result);
    addMessage({ who: "Scheduling system", type: "system", text: resultText });
    setActionPacketLines(formatSchedulingPacket(result), result.status === "confirmed" ? "Confirmed" : "Needs patient");
    state.pendingToolStatuses.delete(callId);

    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      schedulingFollowupInstructions(result)
    );
  } catch (error) {
    const result = {
      status: "error",
      message: "Scheduling is temporarily unavailable.",
      next_action: "Route to staff queue."
    };
    if (DEBUG_REALTIME) console.error("[scheduling-tool]", error);
    addMessage({ who: "Scheduling system", type: "system", text: result.message });
    state.pendingToolStatuses.delete(callId);
    sendSchedulingFunctionOutputToRealtime(
      callId,
      result,
      "Continue the call naturally. Route this to staff if the scheduling result is unavailable and do not discuss implementation details."
    );
  }
}

function updateVoiceVerificationFromCallerText(text) {
  state.callerVerificationText = DOMAIN.normalizeVerificationText(`${state.callerVerificationText} ${text}`);
  const acceptedValues = window.SYNTHETIC_KNOWLEDGE?.shared?.validationProtocol?.acceptedDemoValues || [];
  const matchesActiveProfile = DOMAIN.matchesActiveVerification(
    state.callerVerificationText,
    signedInProfileForCurrentScenario(),
    acceptedValues
  );
  if (matchesActiveProfile) {
    state.callerVerificationProvided = true;
  }
}

function syncServerVerification(text) {
  if (
    state.scenarioKey !== "access" ||
    !state.demoSessionId ||
    state.schedulingCapability
  ) {
    return Promise.resolve(null);
  }

  const demoSessionId = state.demoSessionId;
  const previous = state.verificationPromise || Promise.resolve();
  const operation = previous
    .catch(() => null)
    .then(async () => {
      if (state.demoSessionId !== demoSessionId) return null;
      try {
        const response = await fetchWithTimeout(
          "/api/demo-tools/verify-session",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              demo_session_id: demoSessionId,
              verification_text: text
            })
          },
          5000
        );
        const result = await response.json();
        if (state.demoSessionId !== demoSessionId) return result;
        if (
          response.ok &&
          result.status === "verified" &&
          result.scheduling_capability
        ) {
          state.schedulingCapability = result.scheduling_capability;
          state.voiceVerified = true;
          state.callerVerificationProvided = true;
        } else if (result.status === "validation_required") {
          state.schedulingCapability = "";
          state.voiceVerified = false;
        }
        return result;
      } catch (error) {
        if (DEBUG_REALTIME) console.error("[server-verification]", error);
        return null;
      }
    });

  state.verificationPromise = operation;
  operation.finally(() => {
    if (state.verificationPromise === operation) {
      state.verificationPromise = null;
    }
  });
  return operation;
}

async function waitForServerVerification() {
  if (state.verificationPromise) {
    await state.verificationPromise;
  }
}

function hasSchedulingAuthorization() {
  return Boolean(
    state.voiceVerified &&
    state.demoSessionId &&
    state.schedulingCapability
  );
}

function updateLiveConversationHints(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("spanish") || normalized.includes("español")) {
    state.liveConversationHints.languagePreference = "English first, Spanish second";
  }
  if (normalized.includes("mom") || normalized.includes("mother")) {
    state.liveConversationHints.caregiverContext = "mother driving";
  }
}

function inferSchedulingWindowFromText(text) {
  return DOMAIN.inferSchedulingWindowFromText(text);
}

async function runClientSchedulingFallback(requestedWindow, stage, callId = null) {
  await waitForServerVerification();

  if (state.scenarioKey === "access" && !hasSchedulingAuthorization()) {
    if (callId) {
      sendSchedulingFunctionOutputToRealtime(
        callId,
        {
          status: "validation_required",
          message: "Voice-channel verification is required before scheduling.",
          next_action: "Ask for caller name and date of birth before checking appointment availability."
        },
        "Ask for caller name and date of birth, then continue the scheduling workflow. Do not ask for a callback."
      );
    }
    return;
  }

  const fallbackKey = `${stage}:${requestedWindow}`;
  if (state.schedulingFallbacks.has(fallbackKey)) return;
  const windowKey = requestedWindow.toLowerCase();
  if (state.schedulingWindowsHandled.has(windowKey)) return;
  state.schedulingFallbacks.add(fallbackKey);
  state.schedulingWindowsHandled.add(windowKey);

  const payload = {
    scenario_key: state.scenarioKey,
    requested_window: requestedWindow,
    language_preference: state.liveConversationHints.languagePreference,
    caregiver_context: state.liveConversationHints.caregiverContext,
    demo_session_id: state.demoSessionId,
    scheduling_capability: state.schedulingCapability
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
    const response = await fetchWithTimeout("/api/demo-tools/confirm-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, 8000);
    const result = await response.json();
    result.client_elapsed_ms = Math.round(performance.now() - startedAt);
    if (result.status === "validation_required") {
      state.voiceVerified = false;
      state.schedulingCapability = "";
    }
    if (!response.ok && result.status !== "validation_required") {
      throw new Error(result.error || "Scheduling tool failed.");
    }

    const resultText = formatSchedulingResult(result);
    addMessage({ who: "Scheduling system", type: "system", text: resultText });
    setActionPacketLines(formatSchedulingPacket(result), result.status === "confirmed" ? "Confirmed" : "Needs patient");
    if (callId) {
      sendSchedulingFunctionOutputToRealtime(
        callId,
        result,
        schedulingFollowupInstructions(result)
      );
    }
  } catch (error) {
    if (DEBUG_REALTIME) console.error("[scheduling-fallback]", error);
    const result = {
      status: "error",
      message: "Scheduling is temporarily unavailable.",
      next_action: "Route to staff queue."
    };
    addMessage({ who: "Scheduling system", type: "system", text: result.message });
    if (callId) {
      sendSchedulingFunctionOutputToRealtime(
        callId,
        result,
        "Continue naturally and route this request to staff because scheduling is unavailable. Do not discuss implementation details."
      );
    }
  }
}

function schedulingFollowupInstructions(result) {
  if (result.status === "validation_required") {
    return "Ask for caller name and date of birth, then continue the scheduling workflow. Do not imply that availability was checked.";
  }
  if (result.status === "options_found") {
    return "Continue the call naturally. Offer the available scheduling options in plain language and ask which works. When the caller chooses, call the scheduling tool again with that option's exact window and slot_id. Do not say anything is booked yet.";
  }
  if (result.status === "needs_clarification") {
    return "Ask what day or time window works best before checking the scheduling system. Do not confirm or imply a slot is booked.";
  }
  if (result.status === "confirmed") {
    return "Continue the call naturally. Tell the caller the scheduling system confirmed the slot and include the confirmation number. Do not end there: ask one closing next-step question, such as whether they need parking directions, prep reminders, or anything else about the visit. Do not ask for a callback.";
  }
  return "Continue the call naturally using the scheduling system result. End with a clear next step or bounded question. Do not discuss implementation details and do not ask for a callback unless the result says staff follow-up is required.";
}

function sendSchedulingFunctionOutputToRealtime(callId, result, instructions) {
  if (!callId) return false;
  if (!state.dataChannel || state.dataChannel.readyState !== "open") {
    logRealtimeEvent({ type: "function-output-skipped", call_id: callId });
    showToast("Scheduling result could not be returned because the voice channel closed.");
    return false;
  }
  const modelResult = toModelSchedulingResult(result);
  try {
    state.dataChannel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(modelResult)
      }
    }));
    state.dataChannel.send(JSON.stringify({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions
      }
    }));
    return true;
  } catch (error) {
    if (DEBUG_REALTIME) console.error("[function-output]", error);
    showToast("Scheduling result could not be returned to the voice session.");
    return false;
  }
}

function toModelSchedulingResult(result) {
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
    next_action: result.next_action
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

function stopRealtimeSession() {
  if (state.stoppingRealtime) return;
  state.stoppingRealtime = true;
  const dataChannel = state.dataChannel;
  const peerConnection = state.peerConnection;
  const localStream = state.localStream;
  const remoteAudio = state.remoteAudio;
  state.dataChannel = null;
  state.peerConnection = null;
  state.localStream = null;
  state.remoteAudio = null;
  dataChannel?.close();
  peerConnection?.close();
  localStream?.getTracks().forEach(track => track.stop());
  remoteAudio?.pause();
  remoteAudio?.remove();
  state.handledToolCalls = new Set();
  state.toolCallArgumentDeltas = new Map();
  state.toolCallNames = new Map();
  state.pendingToolTimers.forEach(timer => clearTimeout(timer));
  state.pendingToolTimers = new Map();
  state.pendingToolStatuses = new Set();
  state.schedulingFallbacks = new Set();
  state.schedulingWindowsHandled = new Set();
  state.voiceVerified = false;
  state.callerVerificationProvided = false;
  state.demoSessionId = "";
  state.schedulingCapability = "";
  state.verificationPromise = null;
  state.liveConversationHints = { languagePreference: "", caregiverContext: "" };
  state.agentTranscriptBuffer = "";
  state.agentAudioTurnText = "";
  state.agentAudioSegments = [];
  state.agentAudioTurnStarted = false;
  state.callbackDriftCancelled = false;
  state.lastCallerTranscript = "";
  state.callerVerificationText = "";
  els.startRealtimeBtn.disabled = false;
  els.startRealtimeBtn.textContent = "Answer call";
  els.stopRealtimeBtn.disabled = true;
  if (els.patientStartBtn) { els.patientStartBtn.disabled = false; els.patientStartBtn.textContent = "Start conversation"; }
  if (els.patientStopBtn) els.patientStopBtn.disabled = true;
  els.agentFace.classList.remove("is-live");
  if (els.orbLiveLabel) els.orbLiveLabel.textContent = isPatientView() ? "Tap mic to chat" : "Tap mic to answer";
  setSpeaking(false);
  setConnectionState(state.realtimeAvailable ? "ready" : "idle", state.realtimeAvailable ? "Configured" : "Scripted mode");
  state.stoppingRealtime = false;
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
  "Synthetic demo data",
  "Server-side credentials",
  "Human escalation",
  "English & Spanish demo"
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

function updateSiteNavigation(key) {
  if (!els.siteNav) return;
  els.siteNav.querySelectorAll(".site-nav-link").forEach(button => {
    const isActive = button.dataset.page === key;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function selectScenario(key) {
  if (!SITE_PAGES[key]) return;
  if (state.peerConnection) {
    stopRealtimeSession();
    showToast("Conversation ended; switching to " + SITE_PAGES[key].eyebrow + ".");
  }
  state.scenarioKey = key;
  resetDemo();
  renderScenario();
  renderScenarioCards();
  renderSitePage();
  updateSiteNavigation(key);
}

function setSitePage(key) {
  selectScenario(key);
}

function setView(view) {
  if (view !== "patient" && view !== "executive") return;
  els.body.dataset.view = view;
  if (els.viewSwitchState) els.viewSwitchState.textContent = view === "patient" ? "Patient view" : "Executive view";
  if (els.executiveApp) els.executiveApp.setAttribute("aria-hidden", view === "executive" ? "false" : "true");
  if (els.patientApp) {
    els.patientApp.setAttribute("aria-hidden", view === "patient" ? "false" : "true");
    els.patientApp.inert = view !== "patient" ||
      Boolean(els.assistantPanel?.classList.contains("open"));
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
  // Closing the panel makes sense when leaving patient view
  if (view === "executive") closeAssistantPanel();
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
  const focusTarget = els.patientStartBtn || els.assistantPanelClose;
  if (focusTarget) {
    try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
  }
}

function closeAssistantPanel() {
  if (!els.assistantPanel) return;
  const wasOpen = els.assistantPanel.classList.contains("open");
  if (state.peerConnection) {
    stopRealtimeSession();
    showToast("Conversation ended.");
  }
  els.assistantPanel.classList.remove("open");
  els.assistantPanel.setAttribute("aria-hidden", "true");
  els.assistantPanel.inert = true;
  if (els.patientApp) els.patientApp.inert = els.body.dataset.view !== "patient";
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
  if (wasOpen && focusTarget) {
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

if (els.viewSwitch) {
  els.viewSwitch.addEventListener("click", () => {
    const next = els.body.dataset.view === "patient" ? "executive" : "patient";
    setView(next);
  });
}
if (els.siteNav) {
  els.siteNav.querySelectorAll(".site-nav-link").forEach(btn => {
    btn.addEventListener("click", () => setSitePage(btn.dataset.page));
  });
}
if (els.assistantFab) els.assistantFab.addEventListener("click", () => {
  openAssistantPanel();
});
if (els.assistantPanelClose) els.assistantPanelClose.addEventListener("click", closeAssistantPanel);
if (els.assistantBackdrop) els.assistantBackdrop.addEventListener("click", closeAssistantPanel);
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
