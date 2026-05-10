# Constitution: Patient Access Voice Agent Demo

## Principles

1. **Executive clarity first**: every screen must help a CIO, CTO, or COO understand business value within 10 seconds.
2. **Healthcare-safe by default**: use synthetic data only, avoid PHI, avoid clinical determinations, and make escalation visible.
3. **Demo reliability over novelty**: the artifact must have a deterministic scripted path even when live voice services are unavailable.
4. **Credential safety by design**: long-lived API keys stay server-side; the browser may receive only short-lived Realtime client secrets.
5. **Architecture honesty**: clearly label what is mocked and where Azure Realtime voice, grounded content, action packets, EHR, CRM, scheduling, and contact-center integrations would connect.
6. **Recording-ready polish**: interactions must be deterministic, punchy, and readable in a 90-second screen recording.

## Non-negotiables

- No real patient data.
- No hidden external calls during scripted demo playback.
- Live Realtime voice requires the local Python token service; the scripted path must remain usable without Azure connectivity.
- Preserve Clawpilot theme variables and accessible contrast.
- Keep Azure integration points documented, including model deployment, protocol, auth boundary, and fallback behavior.
- Keep Realtime voice instructions grounded in approved synthetic knowledge and explicit staff-escalation boundaries.
