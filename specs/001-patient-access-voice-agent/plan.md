# Plan: Patient Access Voice Agent Executive Demo

## Spec-driven delivery rule

This deployment is spec-driven. For future changes, update `spec.md`, this `plan.md`, and `tasks.md` from the conversation before editing implementation files. Rebuild implementation from the updated specs, then reconcile README and validation notes. Update the constitution only when a durable principle or non-negotiable changes.

## Technical approach

Use a small local web app with vanilla HTML, CSS, JavaScript, and a Python standard-library server. This keeps setup lightweight while supporting a real Azure OpenAI Realtime voice moment without exposing the long-lived API key to the browser. The page is structured as a hospital access console rather than a generic chatbot.

The demo has two execution paths:

- **Realtime voice path**: default mode for the opening wow moment. The browser starts a WebRTC session using a short-lived client secret minted by `server.py`.
- **Scripted path**: deterministic 90-second sequence for reliable recording, fallback, and executive narration.

## UI surfaces

- **Patient view (Northlake MyHealth portal simulation)**: hospital website shell with a per-scenario page (Schedule & Imaging, Billing & Insurance, Language Access). The header shows a signed-in user chip for the active scenario persona. A floating "Talk to a virtual assistant" button opens a slide-in panel that shows the user's portal context (upcoming appointment, recent statement, or language preference) and embeds the agent surface. Closing the panel ends any live realtime session.
- **Executive view (access center console)**: call-type selector, queue metrics, call mode, answer/end controls, recording hook, scenario presets, supervisor view, captions, realtime status, and architecture/trust panels. Toggled from a top-right "Demo mode" pill.
- **Shared agent surface**: a single agent surface (call banner, mic orb, transcript) is moved between the patient panel and the executive console without disrupting the realtime session.
- **Scenario presets**: fast switching between patient access, revenue cycle, and multilingual access; switching scenarios while signed in updates the portal preview and scripted run-of-show.

## Integration seam

The browser rendering functions are event-driven. The scripted demo emits transcript, metric, packet, and scene events. The live path uses Azure OpenAI Realtime/WebRTC and updates the transcript from Realtime events when available.

The current deployment uses the preview/legacy WebRTC protocol for `gpt-realtime-1.5`:

- `server.py` loads `.env`, validates configuration, and mints short-lived Realtime client secrets.
- `AZURE_OPENAI_REALTIME_PROTOCOL=legacy-webrtc`
- `AZURE_OPENAI_REALTIME_REGION=eastus2`
- `AZURE_OPENAI_REALTIME_API_VERSION=2025-04-01-preview`
- Browser WebRTC URL: `https://eastus2.realtimeapi-preview.ai.azure.com/v1/realtimertc?model=gpt-realtime-1.5`

For GA deployments, the same server supports the `/openai/v1/realtime/client_secrets` and `/openai/v1/realtime/calls` path.

## Grounding strategy

Live voice instructions are built server-side from:

- selected scenario prompt and talk track from `scenarios.js`
- approved run-of-show steps from the selected scenario
- scenario-specific approved demo knowledge from `synthetic-data.js`
- production-style voice-agent policy in `server.py`

The model should sound like Riley, a warm and experienced patient access teammate at Northlake Health. It must use approved demo facts only, avoid inappropriate PHI collection, avoid clinical advice, and prepare staff-ready action packets or safe human handoffs.

For realism, the agent includes a validation step that asks for caller name and date of birth before preparing an action packet. This must be framed as demo validation, use only approved demo values from the knowledge pack, avoid account/member identifiers, and never repeat a full date of birth back to the caller.

The approved demo knowledge pack covers the topics a real access agent typically handles: facility addresses, hours, parking, accessibility, what to bring, arrival guidance, cancellation policy, telehealth availability, Northlake MyHealth portal capabilities, payment options at a high level, records requests, prescription refill routing, test results routing, language services and interpreter availability, callback windows and SLA, and after-hours/emergency guidance. The agent may answer in-bounds questions from this pack and must offer to add anything outside it to the staff handoff.

The agent-facing Realtime prompt, scenario spoken lines, action packet language, and knowledge values must not use the word "synthetic." The presenter will provide the public demo disclaimer separately.

## Validation

- Compile `server.py`.
- Serve locally with `python3 server.py`.
- Load in browser automation.
- Start the scripted demo and confirm transcript and metrics update.
- Confirm the Realtime status panel shows deployment, voice, protocol, and auth state.
- Confirm `/api/realtime/status` returns configured metadata.
- Confirm `/api/realtime/session` mints a short-lived token while masking secrets in any test output.
- Check console for errors and warnings.
