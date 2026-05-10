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
- The Realtime model instructions must sound like a production hospital contact-center agent, not a generic AI assistant or loose demo narrator.

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
9. Provide architecture and trust panels that can be shown on camera.
10. Copy/export a LinkedIn-ready CTA or talk track.
11. Ground live model responses with scenario prompt, talk track, approved run-of-show, and approved demo knowledge pack.
12. Support Azure OpenAI Realtime via a local Python token service, including the preview/legacy WebRTC flow required for the current `gpt-realtime-1.5` deployment.
13. Include a common access-center validation step using demo caller name and demo date of birth before preparing an action packet.
14. Include approved facility addresses, parking/location notes, and simple imaging-center FAQ answers so the agent can handle routine location questions.

## Live voice behavior requirements

- The model must identify as Northlake Health's patient access voice agent.
- The model must ask one focused question at a time and keep each response concise.
- The model must use only approved demo knowledge and avoid inventing appointments, balances, benefits, clinics, tool results, or policy citations.
- The model may ask for name and date of birth for demo validation, but must not ask for account numbers, member IDs, real appointment details, symptoms, medication history, or clinical history.
- The model must not repeat a full date of birth back to the caller; it should acknowledge validation using masked language such as "validation is complete."
- The model must route clinical, urgent, identity, billing-dispute, hardship, and complex language-support exceptions to staff.
- The model must use operational language such as approved FAQ, approved instructions, action packet, callback task, billing review packet, language access summary, staff queue, and handoff state.
- The model must clearly state that the demo prepares a staff-ready task and does not modify live scheduling, billing, EHR, or CRM systems.
- The model may answer simple location questions using only the approved facility names, addresses, hours, parking notes, and wayfinding guidance.
- The agent-facing Realtime instructions, scenario lines, and knowledge values must not use the word "synthetic"; the presenter will handle the public demo disclaimer separately.

## Acceptance criteria

- Demo starts with one click and updates within two seconds.
- Console has no errors or warnings after page load.
- UI remains usable at 1440px desktop and collapses for narrower screens.
- Public recording contains no PHI or real operational data.
- Demo validation uses approved demo name/date-of-birth values only and does not expose real identity details.
- Location answers use approved facility data and do not invent addresses.
- Realtime status panel shows deployment, voice, protocol, and server-side auth state.
- `/api/realtime/status` returns configured model metadata without exposing secrets.
- `/api/realtime/session` can mint a short-lived client secret without returning the long-lived API key.
- Azure integration points are visible, and the scripted path remains usable if live voice is unavailable.
