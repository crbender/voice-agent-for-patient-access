# Voice Agent for Patient Access

A Spec Kit-inspired, screen-recordable executive demo scaffold for a healthcare voice-agent experience. The app runs reliably in scripted mode and can optionally use Azure OpenAI Realtime WebRTC with a supported GPT Realtime deployment.

## Spec-driven workflow

This deployment is spec-driven. Before changing implementation files, update the Spec Kit artifacts to reflect the requested behavior and then rebuild from those specs:

1. Update `specs/001-patient-access-voice-agent/spec.md` for user-facing behavior, acceptance criteria, and safety requirements.
2. Update `specs/001-patient-access-voice-agent/plan.md` for architecture, protocol, grounding, validation, and integration changes.
3. Update `specs/001-patient-access-voice-agent/tasks.md` for implementation tasks.
4. Update `.specify/memory/constitution.md` only when a durable project principle or non-negotiable changes.
5. Implement changes in `index.html`, `styles.css`, `scenarios.js`, `synthetic-data.js`, `app.js`, and `server.py` from the updated spec.
6. Validate the app and reconcile documentation before recording.

## What is included

- `index.html` — recording-ready UI shell with Clawpilot theme support.
- `styles.css` — polished executive command-center styling.
- `scenarios.js` — three 90-second demo stories: patient access, revenue cycle, multilingual access.
- `app.js` — deterministic demo runner, browser speech synthesis, scenario switching, and optional WebRTC voice session.
- `server.py` — dependency-free static server plus `/api/realtime/*` token service.
- `.env.example` and `env.example` — local environment templates for Azure OpenAI Realtime.
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

## Optional: live voice with GPT Realtime

This uses Azure OpenAI Realtime with a server-side token service. For the current `gpt-realtime-1.5` deployment, the app is configured for the preview/legacy WebRTC flow:

- Server-side token minting: `/openai/realtimeapi/sessions`
- Browser WebRTC call setup: `https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc`
- Your API key stays in `.env` on the local Python server.
- The browser receives only a short-lived realtime client secret.

### 1. Create `.env`

```bash
cd "/Users/carlbender/work/Voice Agent for Patient Access"
cp env.example .env
```

Edit `.env` and replace only `PASTE-YOUR-KEY-HERE`. `AZURE_OPENAI_REALTIME_DEPLOYMENT` must be the deployment name of a Realtime speech-in/speech-out model, such as `gpt-realtime`, `gpt-realtime-mini`, `gpt-realtime-1.5`, `gpt-4o-realtime-preview`, or `gpt-4o-mini-realtime-preview`.

Do not use `azureml://registries/azure-openai/models/gpt-realtime-whisper/versions/2026-05-07` for this WebRTC voice-agent path. That model package is not one of the GPT Realtime conversational session models accepted by `/openai/v1/realtime/client_secrets`.

```bash
AZURE_OPENAI_ENDPOINT=https://YOURENDPOINT.cognitiveservices.azure.com
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-1.5
AZURE_OPENAI_API_KEY=PASTE-YOUR-KEY-HERE
AZURE_OPENAI_REALTIME_VOICE=alloy
AZURE_OPENAI_REALTIME_PROTOCOL=legacy-webrtc
AZURE_OPENAI_REALTIME_REGION=eastus2
AZURE_OPENAI_REALTIME_API_VERSION=2025-04-01-preview
REALTIME_TRANSCRIPTION_MODEL=whisper-1
PORT=8787
```

`.env` is ignored by git. Do not paste keys into `app.js`, `index.html`, screenshots, docs, or chat.

### 2. Restart the server

```bash
python3 server.py
```

Refresh the browser. The right panel should say **Realtime voice configured**.

### 3. Use the live voice moment

1. Leave **Realtime voice: mic + GPT Realtime** selected in Call mode.
2. Click **Answer call** or the large mic icon and allow microphone access.
3. Say: “I need to reschedule my appointment.”
4. When the agent asks for validation, use synthetic values only: “Jordan Lee, July 14, 1982.”
5. Ask a routine location question: “What is the address for Northlake Imaging Center?”
6. Use **End conversation** before returning to the deterministic 90-second scripted flow.

For recording, use live voice as the opening wow moment, then run the scripted flow as the dependable executive narrative.

The live model is grounded by passing the selected scenario's talk track and full run-of-show into the Realtime session instructions. For the most consistent output, keep your test utterances close to the script, such as “I need to reschedule my imaging appointment” or “Do I need approved prep instructions?”

The live model also receives a synthetic knowledge pack from `synthetic-data.js`. Use these safe test prompts:

- Patient access: “I need to reschedule my imaging appointment tomorrow morning.”
- Patient access validation: “Jordan Lee, July 14, 1982.”
- Patient access location: “What is the address for Northlake Imaging Center?”
- Patient access: “Do I need to fast before my imaging visit?”
- Patient access: “I am not sure which clinic I should go to.”
- Revenue cycle: “I got a statement and I do not understand if insurance processed it.”
- Revenue cycle validation: “Alex Morgan, February 3, 1975.”
- Revenue cycle: “What happens if the payer needs more information?”
- Multilingual access: “I prefer Spanish and need help confirming my appointment.”
- Multilingual access validation: “Elena Garcia, September 9, 1984.”
- Multilingual access: “I am worried I missed an instruction and need help in another language.”

## Recording flow

1. Start with the browser full screen.
2. Pick **Patient access** for the strongest healthcare front-door story.
3. Optional: click **Answer call** and speak one patient-access request.
4. Click **Start 90s Demo**.
5. Let the transcript, voice animation, metrics, and action packet update on screen.
6. At the end, show the right panel: trust controls, architecture map, captions, and realtime status.

## What is mocked

- Operational metrics such as containment and wait avoided.
- Tool invocation and action packet creation.
- Human handoff state.
- Production scheduling, identity verification, EHR, CRM, and contact-center integrations. The demo validation step uses synthetic name/date-of-birth values only.

## Production integration seam

The scripted UI is event-driven. Replace the scripted event source in `app.js` with Azure Realtime events, Azure Voice Live API events, or another orchestration layer while keeping these render functions:

```js
addMessage({ who, type, text });
updateMetrics({ metrics });
updatePacket({ packet, tag });
setSpeaking(trueOrFalse);
```

The realtime path currently demonstrates browser microphone input, server-minted ephemeral credentials, Azure WebRTC negotiation, live model audio, and transcript events.

## Safety boundary

Use synthetic data for public demos. The validation step may ask for a synthetic name and synthetic date of birth to mirror common access-center protocol, but do not send real PHI, credentials, real appointment data, or real billing data through this scaffold. The API key stays server-side in `.env`; the browser never receives it.
