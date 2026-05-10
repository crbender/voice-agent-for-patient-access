# Voice Agent for Patient Access

A Spec Kit-inspired, screen-recordable executive demo scaffold for a healthcare voice-agent experience. The app runs reliably in scripted mode and can optionally call an Azure Foundry/OpenAI-compatible chat deployment through a local Python proxy.

## What is included

- `index.html` — recording-ready UI shell with Clawpilot theme support.
- `styles.css` — polished executive command-center styling.
- `scenarios.js` — three 90-second demo stories: patient access, revenue cycle, multilingual access.
- `app.js` — deterministic demo runner, browser speech synthesis, scenario switching, and optional Foundry assist mode.
- `server.py` — dependency-free static server plus optional Entra-authenticated `/api/foundry/*` proxy.
- `.env.example` — environment variable template for local Foundry wiring.
- `.specify/` and `specs/` — local Spec Kit-style constitution, spec, plan, and tasks.

## Fast launch: reliable scripted recording

```bash
cd "/Users/carlbender/work/Voice Agent for Patient Access"
python3 server.py
```

Open:

```text
http://127.0.0.1:8787
```

Choose a scenario, keep **Scripted** mode selected, and click **Start 90s Demo**.

## Optional: Azure Foundry assist mode with Entra

This path uses Entra ID through Azure CLI. No API keys are required and no model credential is sent to the browser.

### 1. Sign in to the demo tenant

```bash
az login --tenant "YOUR-DEMO-TENANT-ID"
az account set --subscription "YOUR-SUBSCRIPTION-ID-OR-NAME"
```

Your signed-in user needs data-plane permission to call the Foundry/Azure OpenAI deployment. In Azure RBAC, common roles include **Cognitive Services OpenAI User** for invoking deployments, or your internal equivalent role.

### 2. Configure local non-secret settings

You can use either `env.example` or the hidden `.env.example` template:

```bash
export FOUNDRY_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com"
export FOUNDRY_DEPLOYMENT="model-router-demo"
export FOUNDRY_API_VERSION="2025-01-01-preview"
export AZURE_TENANT_ID="YOUR-DEMO-TENANT-ID"
python3 server.py
```

Then select **Foundry assist** in the UI. The scripted timeline still controls the demo, but agent response beats can be rewritten by the configured Foundry model. If the proxy is not configured or a model call fails, the app falls back to scripted lines.

You can also bypass the Azure OpenAI deployment URL builder with:

```bash
export FOUNDRY_CHAT_URL="https://YOUR-FULL-CHAT-COMPLETIONS-URL"
```

### 3. If Azure CLI is not available

For locked-down machines, you can provide a short-lived Entra token instead of letting `server.py` call `az`:

```bash
export FOUNDRY_ACCESS_TOKEN="PASTE-SHORT-LIVED-ENTRA-TOKEN"
python3 server.py
```

Prefer Azure CLI for normal demos because it avoids pasting bearer tokens into shell history.

## Recording flow

1. Start with the browser full screen.
2. Pick **Patient access** for the strongest healthcare front-door story.
3. Say the hook shown in the left panel.
4. Click **Start 90s Demo**.
5. Let the transcript, voice animation, metrics, and action packet update on screen.
6. At the end, show the right panel: trust controls, architecture map, captions, and Foundry status.

## What is mocked

- Patient utterances.
- Operational metrics such as containment and wait avoided.
- Tool invocation and action packet creation.
- Human handoff state.

## Production integration seam

The UI is event-driven. Replace the scripted event source in `app.js` with Azure Voice Live API events or another orchestration layer while keeping these render functions:

```js
addMessage({ who, type, text });
updateMetrics({ metrics });
updatePacket({ packet, tag });
setSpeaking(trueOrFalse);
```

## Safety boundary

Use synthetic data for public demos. Do not send PHI, credentials, real appointment data, or real billing data through this scaffold. The proxy acquires an Entra token server-side; the browser never receives model credentials.
