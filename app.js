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
  toast: document.getElementById("toast")
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

renderScenario();
renderScenarioCards();
resetDemo();
els.demoMode.value = "realtime";
ensureTtsVoice();
checkRealtime();
