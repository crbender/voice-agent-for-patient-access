const state = {
  scenarioKey: "access",
  timers: [],
  muted: false,
  running: false,
  realtimeAvailable: false,
  peerConnection: null,
  dataChannel: null,
  localStream: null,
  remoteAudio: null,
  scriptStartedAt: 0,
  totalScenes: 0,
  currentSceneIndex: -1,
  ttsVoice: null
};

const SCENARIO_ICONS = {
  access: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h10M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/></svg>',
  revenue: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 14h2M13 14h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  multilingual: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.8"/></svg>'
};

const AVATAR_AGENT = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 11a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.5v5M12 8v8M15 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const AVATAR_SYSTEM = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.8"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="1.8"/></svg>';

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
  assistantPanelTitle: document.getElementById("assistantPanelTitle"),
  assistantPanelClose: document.getElementById("assistantPanelClose"),
  assistantSlot: document.getElementById("assistantSlot"),
  executiveAgentSlot: document.getElementById("executiveAgentSlot"),
  agentSurface: document.getElementById("agentSurface"),
  patientStartBtn: document.getElementById("patientStartBtn"),
  patientStopBtn: document.getElementById("patientStopBtn")
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
      if (state.peerConnection) stopRealtimeSession();
      state.scenarioKey = button.dataset.scenario;
      resetDemo();
      renderScenario();
      renderScenarioCards();
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
  renderSceneChips();
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
  els.transcript.appendChild(row);
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

function setSpeaking(isSpeaking) {
  els.agentFace.classList.toggle("is-speaking", isSpeaking);
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
  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => setSpeaking(false);
  utterance.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(utterance);
}

function clearTimers() {
  state.timers.forEach(timer => {
    window.clearTimeout(timer);
    window.clearInterval(timer);
  });
  state.timers = [];
  window.speechSynthesis?.cancel();
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
    const response = await fetch("/api/realtime/status");
    if (!response.ok) throw new Error("No proxy");
    const data = await response.json();
    state.realtimeAvailable = Boolean(data.configured);
    els.realtimeStatus.textContent = data.configured ? "Realtime voice configured" : "Realtime voice not configured";
    els.realtimeDetail.textContent = data.configured
      ? `Deployment: ${data.deployment}. Voice: ${data.voice}. Protocol: ${data.protocol}. Auth: ${data.auth}.`
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
  addMessage({ who: "Realtime setup", type: "system", text: "Minting short-lived client secret. Your API key stays on the local server." });

  try {
    const sessionResponse = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: scenario().label,
        systemPrompt: scenario().systemPrompt,
        talkTrack: scenario().talkTrack,
        close: scenario().close,
        knowledge: {
          shared: window.SYNTHETIC_KNOWLEDGE?.shared || {},
          scenario: window.SYNTHETIC_KNOWLEDGE?.[state.scenarioKey] || {}
        },
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
    if (!sessionResponse.ok) {
      const azureMessage = sessionData.error?.message || sessionData.error || "Realtime session request failed.";
      throw new Error(sessionData.guidance ? `${azureMessage} ${sessionData.guidance}` : azureMessage);
    }

    const peerConnection = new RTCPeerConnection();
    const remoteAudio = new Audio();
    remoteAudio.autoplay = true;
    state.peerConnection = peerConnection;
    state.remoteAudio = remoteAudio;
    els.agentFace.classList.add("is-live");

    peerConnection.ontrack = event => {
      remoteAudio.srcObject = event.streams[0];
      setSpeaking(true);
    };
    peerConnection.onconnectionstatechange = () => {
      const s = peerConnection.connectionState;
      if (s === "connected") {
        setConnectionState("live", "Live voice");
        if (els.orbLiveLabel) els.orbLiveLabel.textContent = "Conversation live";
      } else if (s === "failed" || s === "disconnected") {
        setConnectionState("error", `Voice: ${s}`);
      } else {
        setConnectionState("warn", `Voice: ${s}`);
      }
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.localStream.getTracks().forEach(track => peerConnection.addTrack(track, state.localStream));

    const dataChannel = peerConnection.createDataChannel("realtime-channel");
    state.dataChannel = dataChannel;
    dataChannel.addEventListener("open", () => {
      addMessage({ who: "Realtime voice", type: "system", text: "Live microphone session is open. Say: I need to reschedule my appointment." });
      dataChannel.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: sessionData.instructions,
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true
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
            text: `Start the ${scenario().label} demo. Ask one concise patient-access opening question, then stay grounded in the approved run-of-show.`
          }]
        }
      }));
      dataChannel.send(JSON.stringify({ type: "response.create" }));
    });
    dataChannel.addEventListener("message", event => handleRealtimeEvent(event.data));
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
    if (!sdpResponse.ok) throw new Error(await sdpResponse.text());
    await peerConnection.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    els.startRealtimeBtn.textContent = "Conversation live";
    showToast("Live realtime voice connected.");
  } catch (error) {
    addMessage({ who: "Realtime error", type: "system", text: error.message || String(error) });
    stopRealtimeSession();
  }
}

function handleRealtimeEvent(rawMessage) {
  let event;
  try {
    event = JSON.parse(rawMessage);
  } catch {
    return;
  }

  if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
    addMessage({ who: "Caller", type: "patient", text: event.transcript });
  }
  if ((event.type === "response.output_audio_transcript.done" || event.type === "response.output_text.done") && (event.transcript || event.text)) {
    addMessage({ who: "Realtime agent", type: "agent", text: event.transcript || event.text });
  }
  if (event.type === "response.output_audio_transcript.delta" || event.type === "output_audio_buffer.started") {
    setSpeaking(true);
  }
  if (event.type === "output_audio_buffer.stopped" || event.type === "response.done") {
    setSpeaking(false);
  }
  if (event.type === "error" && event.error?.message) {
    addMessage({ who: "Realtime error", type: "system", text: event.error.message });
  }
}

function stopRealtimeSession() {
  state.dataChannel?.close();
  state.peerConnection?.close();
  state.localStream?.getTracks().forEach(track => track.stop());
  state.remoteAudio?.pause();
  state.dataChannel = null;
  state.peerConnection = null;
  state.localStream = null;
  state.remoteAudio = null;
  els.startRealtimeBtn.disabled = false;
  els.startRealtimeBtn.textContent = "Answer call";
  els.stopRealtimeBtn.disabled = true;
  els.agentFace.classList.remove("is-live");
  if (els.orbLiveLabel) els.orbLiveLabel.textContent = "Tap mic to answer";
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
els.startRealtimeBtn.addEventListener("click", startRealtimeSession);
els.stopRealtimeBtn.addEventListener("click", stopRealtimeSession);
els.agentFace.addEventListener("click", startRealtimeSession);
els.agentFace.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    startRealtimeSession();
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
        <p>The assistant uses approved sample data for this demo. Anything outside routine access goes to a teammate.</p>
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
}

function setSitePage(key) {
  if (!SITE_PAGES[key]) return;
  if (state.peerConnection) stopRealtimeSession();
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
  // Move the agent surface into the right slot
  const target = view === "patient" ? els.assistantSlot : els.executiveAgentSlot;
  if (target && els.agentSurface && els.agentSurface.parentElement !== target) {
    target.appendChild(els.agentSurface);
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
  els.assistantPanel.classList.add("open");
  els.assistantPanel.setAttribute("aria-hidden", "false");
}

function closeAssistantPanel() {
  if (!els.assistantPanel) return;
  els.assistantPanel.classList.remove("open");
  els.assistantPanel.setAttribute("aria-hidden", "true");
}

els.executiveApp = document.getElementById("executiveApp");

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
if (els.patientStartBtn) els.patientStartBtn.addEventListener("click", startRealtimeSession);
if (els.patientStopBtn) els.patientStopBtn.addEventListener("click", stopRealtimeSession);

renderScenario();
renderScenarioCards();
renderSitePage();
resetDemo();
els.demoMode.value = "realtime";
ensureTtsVoice();
setView(els.body.dataset.view || "patient");
checkRealtime();
