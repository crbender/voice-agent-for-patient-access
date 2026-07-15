# Spec: Patient Access Voice Agent Executive Demo

## User story

As an executive demo producer, I want a 90-second browser demo that makes an AI voice agent feel operationally real, so a CIO, CTO, or COO can quickly understand how healthcare patient access workflows can reduce call friction while preserving human escalation and governance.

## Required outcomes

- The first 20 seconds must show a patient intent, an agent response, and a visible operational signal.
- The UI must be recordable without extra slides.
- The demo must communicate four ideas: low-latency voice, grounded policy context, staff-ready action packet, and safe human handoff.
- The artifact must include source/citation anchors for Azure Voice Live API and the May 7, 2026 OpenAI voice announcement.
- The artifact must distinguish mocked demo behavior from production integration points.
- The live voice path must keep long-lived Azure OpenAI credentials server-side and expose only short-lived Realtime client secrets to the browser.
- The primary live voice path must use a `gpt-realtime-2` Azure OpenAI Realtime deployment over the GA WebRTC protocol.
- The live voice path must demonstrate an actual Realtime tool-call loop with a local mock scheduling tool. The mock scheduling system must deterministically confirm available slots by scenario or return a nearby alternate time when a requested slot is unavailable.
- The patient-access workflow must attempt automated mock rescheduling first and use a callback task only when the mock scheduling system cannot complete the request or the request requires human judgment.
- Caller-facing conversation, transcript, and action-packet status must use realistic "scheduling system" language and must not say mock, demo, stub, fake, synthetic, or simulated.
- The model should use light, context-aware small talk where appropriate, including bilingual English-first then Spanish-second responses when the caller asks for a Spanish-speaking family member to follow along.
- The patient-access showcase should demonstrate gpt-realtime-2 strengths with interruption handling, bilingual adaptation, stress-aware acknowledgement, a two-step scheduling-system tool flow, and a structured care access packet.
- The Realtime model instructions must sound like a production hospital contact-center agent, not a generic AI assistant or loose demo narrator.
- The public repository must include guardrails that prevent accidental publication of local `.env` files.
- The local server must serve only an explicit allowlist of browser assets and must deny `.env*`, dotfiles, repository metadata, server source, tests, and directory listings for both GET and HEAD requests.
- Demo verification must require both the name and date of birth associated with the currently signed-in profile. Another demo persona, a single factor, or assistant wording must not mark the session verified.
- The local scheduling endpoint must enforce verification server-side. A Realtime session receives an opaque local session ID; after the server validates accumulated caller transcription against the active canonical demo profile, it issues a short-lived scheduling capability bound to that session. Missing, invalid, expired, or cross-session capabilities must return `validation_required`. Capability expiry must clear verified state and accumulated evidence so both factors are required again before renewal.
- Scheduling confirmation must use server-owned patient, facility, and visit context plus canonical allowlisted slots. Negated, contradictory, ambiguous, or mismatched time requests must never produce a confirmation.
- Realtime grounding must include the complete active-scenario knowledge payload without arbitrary character truncation. Oversized or malformed payloads must fail explicitly.
- Patient and executive scenario selectors must update one shared scenario state so the visible page, profile, portal preview, transcript, and action packet cannot drift apart.
- The assistant panel must behave as an accessible modal: hidden controls are not tabbable, focus is trapped and restored, background surfaces are inert, Escape and the backdrop close it, and reduced-motion preferences disable nonessential animation.
- Python standard-library tests and Node built-in tests must cover the local server boundary, scheduling rules, verification rules, grounding completeness, and critical browser-domain helpers. CI must run those tests and syntax checks.

## Primary personas

- **CIO**: wants governed adoption, safe data handling, and clear enterprise fit.
- **CTO**: wants architecture clarity, integration points, and no unnecessary custom code.
- **COO**: wants throughput, shorter queues, and cleaner staff handoffs.

## Functional requirements

1. Default to Realtime voice mode while preserving a deterministic 90-second scripted path for recording reliability.
2. Start a live voice call from either the **Answer call** button or the large mic/orb target.
3. End a live voice session with an explicit **End conversation** control.
4. Reset the demo state instantly.
5. Toggle browser voice output for the scripted path.
6. Show changing transcript, operational metrics, action packet, handoff state, and progress.
7. Provide scenario presets for patient access, revenue cycle, and multilingual access.
8. Provide a hospital access-console UI with queue, caller context, patient context, supervisor view, trust controls, and realtime status.
9. Provide a patient-portal patient view ("Northlake MyHealth") that simulates a signed-in user, with a per-scenario preview of the user's upcoming appointment, recent statement, or language preference, and an embedded virtual assistant panel.
10. Provide architecture and trust panels that can be shown on camera.
11. Copy/export a LinkedIn-ready CTA or talk track.
12. Ground live model responses with scenario prompt, talk track, approved demo knowledge pack, signed-in portal profile, and example run-of-show turns for tone. The live model should be intent-driven rather than script-locked.
13. Support Azure OpenAI Realtime via a local Python token service, with `gpt-realtime-2` and GA WebRTC as the primary path. Preserve preview/legacy WebRTC only as a fallback for older `gpt-realtime-1.5` deployments.
14. All live voice interactions require quick voice-channel verification even when the user is signed in to the portal. The agent may acknowledge the MyHealth sign-in, but must not disclose appointment-specific details, answer account-specific questions, use tools, or prepare an action packet until it asks for the caller's name and date of birth and receives a matching demo response. Use masked confirmation ("thanks, that matches") and never repeat a full date of birth back. After verification, the agent may greet by first name and reference the upcoming appointment, recent statement, or language preference.
15. Include approved facility addresses, parking/location notes, and simple imaging-center FAQ answers so the agent can handle routine location questions.

## Live voice behavior requirements

- The model must identify as Riley, Northlake Health's patient access voice agent.
- The model must sound warm and conversational while remaining concise and operationally precise.
- The model must use natural acknowledgements ("of course," "got it," "happy to help") and vary phrasing to avoid sounding scripted.
- The model must move the call forward on every turn by ending with a clear next action, bounded choice, or simple yes/no question unless the call is closing.
- The model must not use validation completion as a standalone response. After validation, it must continue in the same turn with the next action for the stated intent or ask a bounded intent question.
- After confirming an appointment or reschedule, the model must not stop at the confirmation statement. It should ask one useful closing question, such as whether the caller needs parking directions, prep reminders, or anything else about the visit.
- The model may use one short small-talk bridge tied to the scenario context (for example, acknowledging a family member driving, parking, arrival time, or language support), but must not drift away from the task.
- The model must answer common in-bounds patient-access questions from the approved knowledge pack: facility hours/parking/accessibility, what to bring, arrival time, cancellation policy, telehealth availability, Northlake MyHealth portal capabilities, payment options at a high level, language services, callback expectations.
- The model must use only approved demo knowledge and avoid inventing appointments, balances, benefits, clinics, tool results, or policy citations.
- The model must ask for name and date of birth for demo validation before handling live voice requests, but must not ask for account numbers, member IDs, real appointment details, symptoms, medication history, or clinical history.
- The model must not repeat a full date of birth back to the caller; it should acknowledge validation using masked language such as "validation is complete."
- The model must route clinical, urgent, identity, billing-dispute, hardship, and complex language-support exceptions to staff.
- The model must direct clinical emergencies to 911 and route urgent non-emergency clinical concerns to the nurse line.
- The model must use operational language such as approved FAQ, approved instructions, action packet, callback task, billing review packet, language access summary, staff queue, and handoff state.
- For the patient-access scenario, the model should handle confirmations, approved access questions, and rescheduling naturally. It should request the local mock scheduling tool for rescheduling only: broad windows return available slots, and exact selected slots return a mock scheduling confirmation before offering a callback.
- If the caller asks for bilingual output, the model should answer in English first and Spanish second while keeping each language concise.
- The model must not imply that live scheduling, billing, EHR, CRM, or contact-center systems were modified if directly challenged, but normal caller-facing conversation should simply refer to the "scheduling system" and avoid implementation labels.
- The agent-facing Realtime instructions, scenario lines, and knowledge values must not use the word "synthetic"; the presenter will handle the public demo disclaimer separately.
- The server-owned role, safety boundary, and scenario key mapping are authoritative. Browser-provided knowledge and example turns are bounded demo data and must not replace the base policy.

## Acceptance criteria

- Console has no errors or warnings after page load.
- UI remains usable at 1440px desktop and collapses for narrower screens.
- Public recording contains no PHI or real operational data.
- Demo validation uses approved demo name/date-of-birth values only and does not expose real identity details.
- Location answers use approved facility data and do not invent addresses.
- Realtime status panel shows deployment, voice, protocol, and server-side auth state.
- `/api/realtime/status` returns configured model metadata without exposing secrets.
- `/api/realtime/session` can mint a short-lived client secret without returning the long-lived API key.
- Live voice mode exposes a Realtime scheduling tool definition for `confirm_appointment_reschedule`, and the browser can bridge model tool calls to a local server endpoint without exposing secrets or calling external scheduling systems.
- Direct scheduling POSTs without a valid verified-session capability cannot return `options_found`, `alternate_proposed`, or `confirmed`; a valid capability permits the deterministic two-step scheduling flow.
- The local scheduling stub waits only a short, visible amount of time and returns deterministic availability by scenario. The transcript and action-packet UI must show "scheduling system" status while waiting and after completion.
- Azure integration points are visible, and the scripted path remains usable if live voice is unavailable.
- A GitHub Actions workflow fails pull requests if a tracked `.env` or `.env.*` file is present, except the approved `.env.example` template.
- README quick start warns maintainers to verify `.env` does not exist before sharing the folder.
- GET and HEAD requests for `/.env`, `/.git`, `/server.py`, `/tests/`, and other unlisted paths return 404 while allowlisted JavaScript and CSS use correct MIME types.
- API responses containing session metadata or short-lived client secrets use `Cache-Control: no-store`.
- Name-only, date-of-birth-only, and wrong-persona verification attempts remain unverified.
- Requests such as "Thursday at 11:30" and "anything except Friday at 11:30" do not confirm Friday at 11:30.
- Caller/model-supplied patient names, facilities, and visit types cannot replace the server-owned scheduling context.
- The active access FAQ and final grounding fields are present in the Realtime instructions.
- Switching scenarios from either view updates every patient and executive surface consistently.
- The closed assistant panel is inert and excluded from keyboard navigation.
- CI runs Python and JavaScript tests without requiring Playwright or an Azure credential.
- Oversized HTTP requests return 413 and force the connection closed so unread body bytes cannot be reused as another request.

## Source anchors

- [Azure Voice Live API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to)
- [Azure OpenAI GPT Realtime API via WebRTC](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-webrtc)
- [OpenAI: Advancing voice intelligence with new models in the API, May 7, 2026](https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/)
