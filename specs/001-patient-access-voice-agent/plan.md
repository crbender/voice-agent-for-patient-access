# Plan: Patient Access Voice Agent Executive Demo

## Spec-driven delivery rule

This deployment is spec-driven. For future changes, update `spec.md`, this `plan.md`, and `tasks.md` from the conversation before editing implementation files. Rebuild implementation from the updated specs, then reconcile README and validation notes. Update the constitution only when a durable principle or non-negotiable changes.

## Technical approach

Use a small local web app with vanilla HTML, CSS, JavaScript, and a Python standard-library server. This keeps setup lightweight while supporting a real Azure OpenAI Realtime voice moment without exposing the long-lived API key to the browser. The page is structured as a hospital access console rather than a generic chatbot.

The demo has two execution paths:

- **Realtime voice path**: default mode for the opening wow moment. The browser starts a GA WebRTC session for `gpt-realtime-2` using a short-lived client secret minted by `server.py`.
- **Scripted path**: deterministic 90-second sequence for reliable recording, fallback, and executive narration.

## UI surfaces

- **Patient view (Northlake MyHealth portal simulation)**: hospital website shell with a per-scenario page (Schedule & Imaging, Billing & Insurance, Language Access). The header shows a signed-in user chip for the active scenario persona. A floating "Talk to a virtual assistant" button opens a slide-in panel that shows the user's portal context (upcoming appointment, recent statement, or language preference) and embeds the agent surface. Closing the panel ends any live realtime session.
- **Executive view (access center console)**: call-type selector, queue metrics, call mode, answer/end controls, recording hook, scenario presets, supervisor view, captions, realtime status, and architecture/trust panels. Toggled from a top-right "Demo mode" pill.
- **Shared agent surface**: a single agent surface (call banner, mic orb, transcript) is moved between the patient panel and the executive console without disrupting the realtime session.
- **Scenario presets**: fast switching between patient access, revenue cycle, and multilingual access; switching scenarios while signed in updates the portal preview and scripted run-of-show.

## Integration seam

The browser rendering functions are event-driven. The scripted demo emits transcript, metric, packet, and scene events. The live path uses Azure OpenAI Realtime/WebRTC and updates the transcript from Realtime events when available.

The primary deployment uses the GA WebRTC protocol for `gpt-realtime-2`:

- `server.py` loads `.env`, validates configuration, and mints short-lived Realtime client secrets.
- `AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-2`
- `AZURE_OPENAI_REALTIME_PROTOCOL=ga-webrtc`
- Client secret endpoint: `/openai/v1/realtime/client_secrets`
- Browser WebRTC URL: `/openai/v1/realtime/calls`

The legacy WebRTC path remains available only as a fallback for older `gpt-realtime-1.5` deployments.

## Mock scheduling tool seam

Live voice mode exposes a Realtime tool named `confirm_appointment_reschedule`. The model should request this tool in the patient-access workflow after voice-channel validation and a requested appointment window. Automated mock rescheduling is the primary flow; callback tasks are fallback behavior only when the mock scheduling system cannot complete the request or the request needs human judgment.

The browser listens for Realtime function/tool-call events on the data channel, calls a local Python endpoint (`/api/demo-tools/confirm-appointment`), waits briefly to make the tool action visible, and sends the tool result back to the model. The local endpoint is a deterministic stub only; it does not call scheduling, EHR, CRM, or contact-center systems. Caller-facing copy uses realistic "scheduling system" language. The client must handle the GA Realtime function-call item shapes (`response.function_call_arguments.done`, `response.output_item.done`, `conversation.item.added`, `conversation.item.done`, and function calls surfaced in `response.done`) so tool calls do not appear to hang if emitted through a different server event.

Deterministic availability is scenario-based:

- Patient access: normal requested slots return a mock confirmation. A known unavailable requested window returns unavailable plus a nearby alternate slot.
- Revenue cycle and multilingual access: return unsupported for scheduling confirmation and instruct the model to route to the appropriate staff workflow.

The UI should immediately show that the scheduling system is checking availability, then update the transcript/action packet with the scheduling result. It must not show mock/demo language in the caller-facing transcript.

For the gpt-realtime-2 showcase pass, the scripted patient-access flow intentionally exercises a multi-turn reasoning path, while live voice mode stays intent-driven. Live voice always starts with voice-channel verification, even for signed-in MyHealth users. After verification, a caller can confirm the existing appointment, ask approved access questions, request a reschedule, choose from returned options, or change direction. The action packet should show validation state, current visit or requested slot, options/confirmed slot when applicable, language preference, caregiver context, and staff-safe prep notes.

## Grounding strategy

Live voice instructions are built server-side from:

- selected scenario prompt and talk track from `scenarios.js`
- example run-of-show steps from the selected scenario for tone and demo intent
- scenario-specific approved demo knowledge from `synthetic-data.js`
- production-style voice-agent policy in `server.py`

The model should sound like Riley, a warm and experienced patient access teammate at Northlake Health. It must use approved demo facts only, avoid inappropriate PHI collection, avoid clinical advice, and prepare staff-ready action packets or safe human handoffs.

Riley may use brief, context-aware small talk to make the scenario feel more natural, such as acknowledging that Jordan's mother is driving or that bilingual instructions can help both the patient and caregiver. If the caller requests bilingual support, Riley should answer in English first and Spanish second.

For realism and safety, every live voice interaction begins with validation that asks for caller name and date of birth before appointment-specific details, access answers, tool use, or action-packet preparation. This must be framed as voice-channel verification, use only approved demo values from the knowledge pack, avoid account/member identifiers, and never repeat a full date of birth back to the caller.

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
- Confirm `/api/demo-tools/confirm-appointment` returns deterministic mock availability without calling external systems.
- Confirm Realtime tool-call handling can call the local stub and return a tool result to the model.
- Check console for errors and warnings.

## Publish-readiness remediation

Keep the runtime lightweight and demo-oriented while enforcing the boundaries the
experience claims on screen:

- Serve only `index.html`, CSS, browser JavaScript, and other explicitly approved
  public assets. Apply the same allowlist to GET and HEAD.
- Emit correct MIME types plus a CSP that permits same-origin assets, the data
  favicon, microphone access, and HTTPS Azure Realtime SDP calls.
- Require bounded JSON requests and same-origin browser POSTs from either
  `127.0.0.1` or `localhost` on the configured port.
- Treat the server's role/safety prompt and scenario-key mapping as
  authoritative. Treat browser knowledge and example turns as bounded,
  delimited demo data.
- Scope verification to the active signed-in profile and require both name and
  date of birth before enabling scheduling.
- Resolve scheduling with canonical server-owned slots and context. Natural
  language may find options, but only an allowlisted exact slot or slot ID can
  be confirmed.
- Compact and validate the complete active-scenario grounding payload; never
  slice serialized JSON.
- Use one scenario-selection path for both patient and executive controls.
- Make the assistant panel an accessible modal and honor reduced motion.
- Keep DOM-free domain logic importable by Node so the core behavior can be
  tested without adding a browser dependency to CI.

## Regression strategy

- Python `unittest` covers the static allowlist, response headers, request
  validation, scheduling resolution, authoritative context, scenario
  validation, and grounding completeness.
- Node's built-in test runner covers active-profile verification and safe
  scheduling-window inference.
- CI runs both suites plus Python and JavaScript syntax checks.
- The optional Playwright screenshot utility remains a visual smoke path, but
  its dependency is not required for core CI.
