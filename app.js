const state = {
  scenarioKey: "access",
  timers: [],
  muted: false,
  running: false,
  foundryAvailable: false
};

const els = {
  scenarioGrid: document.getElementById("scenarioGrid"),
  demoMode: document.getElementById("demoMode"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  muteBtn: document.getElementById("muteBtn"),
  copyScriptBtn: document.getElementById("copyScriptBtn"),
  hookLine: document.getElementById("hookLine"),
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
  foundryStatus: document.getElementById("foundryStatus"),
  foundryDetail: document.getElementById("foundryDetail"),
  connectionLabel: document.getElementById("connectionLabel"),
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
      <b>${item.label}</b>
      <span>${item.summary}</span>
    </button>
  `).join("");

  els.scenarioGrid.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      state.scenarioKey = button.dataset.scenario;
      resetDemo();
      renderScenario();
      renderScenarioCards();
    });
  });
}

function renderScenario() {
  const item = scenario();
  els.hookLine.textContent = `“${item.hook}”`;
  els.scenarioEyebrow.textContent = item.label;
  els.scenarioTitle.textContent = item.title;
  els.captionList.innerHTML = item.captions.map(caption => `<div class="caption-item">${caption}</div>`).join("");
}

function addMessage(item) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${item.type === "patient" ? "patient" : item.type === "system" ? "system" : ""}`;
  bubble.innerHTML = `<span class="who">${item.who}</span>${item.text}`;
  els.transcript.appendChild(bubble);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function updateMetrics(item) {
  if (!item.metrics) return;
  els.containment.textContent = item.metrics[0];
  els.waitTime.textContent = item.metrics[1];
  els.languages.textContent = item.metrics[2];
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

function speak(text) {
  if (state.muted || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
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
  els.transcript.innerHTML = `<div class="bubble"><span class="who">Demo producer note</span>Press Start. Keep the browser full screen. The first patient turn lands immediately.</div>`;
  els.progress.style.width = "0%";
  els.timeLabel.textContent = "0:00";
  els.sceneLabel.textContent = "Ready";
  els.containment.textContent = "0%";
  els.waitTime.textContent = "0m";
  els.languages.textContent = "1";
  els.handoffTag.textContent = "Pending";
  els.handoffTag.classList.add("hot");
  els.handoffTag.classList.remove("complete");
  els.actionPacket.innerHTML = `<span>Intent: not detected yet</span><span>Tool: none</span><span>Escalation: not required</span>`;
}

async function getFoundryReply(currentItem) {
  if (!state.foundryAvailable || currentItem.type !== "agent") return currentItem.text;

  try {
    const body = {
      scenario: scenario().label,
      systemPrompt: scenario().systemPrompt,
      patientContext: els.transcript.innerText,
      requestedBeat: currentItem.scene,
      fallback: currentItem.text
    };
    const response = await fetch("/api/foundry/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return currentItem.text;
    const data = await response.json();
    return data.reply || currentItem.text;
  } catch {
    return currentItem.text;
  }
}

async function playItem(item) {
  const displayItem = { ...item };
  if (els.demoMode.value === "foundry") {
    displayItem.text = await getFoundryReply(item);
  }
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

  scenario().script.forEach(item => {
    state.timers.push(window.setTimeout(() => playItem(item), item.at));
  });

  state.timers.push(window.setTimeout(() => {
    els.startBtn.disabled = false;
    state.running = false;
    showToast("Demo complete. Reset or run another scenario.");
  }, 90500));
}

async function checkFoundry() {
  try {
    const response = await fetch("/api/foundry/status");
    if (!response.ok) throw new Error("No proxy");
    const data = await response.json();
    state.foundryAvailable = Boolean(data.configured);
    els.foundryStatus.textContent = data.configured ? "Foundry proxy configured" : "Foundry proxy not configured";
    els.foundryDetail.textContent = data.configured
      ? `Deployment: ${data.deployment}. Auth: ${data.auth}. Live replies are available in Foundry assist mode.`
      : "Run server.py with FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT after az login to enable live model replies.";
    els.connectionLabel.textContent = data.configured ? "Foundry-ready" : "Scripted mode";
  } catch {
    state.foundryAvailable = false;
    els.foundryStatus.textContent = "Static file mode";
    els.foundryDetail.textContent = "Use python3 server.py for optional Foundry model proxy. Scripted recording mode still works.";
    els.connectionLabel.textContent = "Scripted mode";
  }
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
  if (els.demoMode.value === "foundry" && !state.foundryAvailable) {
    showToast("Foundry assist selected, but proxy is not configured. Scripted replies will be used.");
  }
});

renderScenario();
renderScenarioCards();
resetDemo();
checkFoundry();
