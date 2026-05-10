# Spec: Patient Access Voice Agent Executive Demo

## User story

As an executive demo producer, I want a 90-second browser demo that makes an AI voice agent feel operationally real, so a CIO, CTO, or COO can quickly understand how healthcare patient access workflows can reduce call friction while preserving human escalation and governance.

## Required outcomes

- The first 20 seconds must show a patient intent, an agent response, and a visible operational signal.
- The UI must be recordable without extra slides.
- The demo must communicate four ideas: low-latency voice, grounded policy context, function-calling action packet, and safe human handoff.
- The artifact must include source/citation anchors for Azure Voice Live API and the May 7, 2026 OpenAI voice announcement.
- The artifact must distinguish mocked demo behavior from production integration points.

## Primary personas

- **CIO**: wants governed adoption, safe data handling, and clear enterprise fit.
- **CTO**: wants architecture clarity, integration points, and no unnecessary custom code.
- **COO**: wants throughput, shorter queues, and cleaner staff handoffs.

## Functional requirements

1. Start a deterministic 90-second scripted patient access demo.
2. Reset the demo state instantly.
3. Toggle browser voice output.
4. Show changing transcript, metrics, handoff packet, and progress.
5. Provide scenario presets for patient access, revenue cycle, and multilingual access.
6. Provide a director mode panel with exact camera lines and timestamps.
7. Provide architecture and trust panels that can be shown on camera.
8. Copy/export a LinkedIn-ready CTA or talk track.

## Acceptance criteria

- Demo starts with one click and updates within two seconds.
- Console has no errors or warnings after page load.
- UI remains usable at 1440px desktop and collapses for narrower screens.
- Public recording contains no PHI or real operational data.
- Azure integration points are visible but not required.
