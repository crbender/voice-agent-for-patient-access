# Tasks: Patient Access Voice Agent Executive Demo

Spec-driven rule: update `spec.md`, `plan.md`, and `tasks.md` before implementation changes; then rebuild from the updated specs and reconcile README/validation notes.

1. Add Spec Kit-style local artifacts: constitution, spec, plan, tasks.
2. Refine HTML UI into an executive demo command center.
3. Add scenario presets and director controls.
4. Add architecture/trust production-readiness panel.
5. Update README with Spec Kit workflow note and recording instructions.
6. Validate local serving and browser interaction.
7. Split the artifact into `index.html`, `styles.css`, `scenarios.js`, `app.js`, `synthetic-data.js`, and `server.py` for maintainability.
8. Add server-side Azure OpenAI Realtime token minting so the browser never receives the long-lived API key.
9. Add support for GA Realtime WebRTC as the primary protocol and preview/legacy WebRTC as an older-deployment fallback.
10. Add approved demo grounding data for patient access, revenue cycle, and multilingual access scenarios.
11. Rework the UI into a hospital access-console experience with caller context, queue, action packet, supervisor view, and realtime status.
12. Default the UI to live voice mode, make the mic/orb answer the call, and add an explicit end-conversation control.
13. Strengthen Realtime model instructions so the agent sounds like a production patient-access contact-center agent while staying grounded in approved demo data.
14. Refresh documentation and Spec Kit artifacts whenever implementation behavior, model protocol, or demo runbook changes.
15. Add demo name/date-of-birth validation protocol to the scripted flow, Realtime instructions, approved demo knowledge, and docs.
16. Add approved facility addresses, hours, parking notes, and location FAQ grounding for routine imaging-center questions.
17. Remove the word "synthetic" from agent-facing Realtime context, scenario spoken lines, action packet text, and approved knowledge values; leave the presenter responsible for the public disclaimer.
18. Name the agent persona Riley and warm up scripted lines and Realtime instructions to sound like an experienced contact-center teammate.
19. Expand the approved demo knowledge pack with the topics a real access agent receives: hours/parking/accessibility, what to bring, arrival, cancellation policy, telehealth, patient portal, payment options at a high level, records requests, prescription refill routing, test results routing, language services, callback SLA, and emergency guidance.
20. Revise scripted scenarios to include a warm greeting and one in-bounds off-script question per scenario that the agent answers helpfully from the approved knowledge pack.
21. Add a patient-portal patient view that simulates a signed-in MyHealth user. Header shows persona chip; assistant panel shows a portal preview card per scenario (upcoming appointment / recent statement / language preference); scripted scenarios reference the simulated portal data; Realtime instructions receive the signed-in profile and treat sign-in as the validation source.
22. Add public-sharing hygiene: GitHub Actions guard against tracked `.env` files, canonical `.env.example` template only, README pre-share warning, and tidy `.gitignore`.
23. Refactor Realtime defaults and docs to prefer `gpt-realtime-2` with GA WebRTC, while keeping legacy WebRTC as an older-deployment fallback.
24. Add a local deterministic mock scheduling endpoint for appointment reschedule confirmation. The endpoint must pause briefly, return a mock confirmation for available slots, and return a nearby alternate when the deterministic scenario rules mark a slot unavailable.
25. Add Realtime tool-call handling so live voice mode exposes `confirm_appointment_reschedule`, bridges model tool calls through the browser data channel to the local endpoint, returns tool output to the model, and updates transcript/action-packet UI honestly as a mock scheduling result.
26. Tune the `gpt-realtime-2` GA WebRTC path for smoother audio and faster tool-call completion: include recommended audio output modality, reduce tool stub delay to a short visible pause, and handle multiple GA Realtime function-call event shapes.
27. Update Riley's instructions so automated mock rescheduling is primary, callback is fallback only, and the agent can use brief context-aware small talk plus English-first/Spanish-second bilingual responses when requested.
28. Remove caller-facing mock/demo/stub language from the Realtime conversation and visible status while preserving internal architecture honesty in docs.
29. Add immediate scheduling-system waiting status for GA Realtime function-call start/delta events and tolerate arguments-done events without a tool name.
30. Showcase `gpt-realtime-2` with interruptible bilingual adaptation, stress-aware acknowledgement, two-step scheduling-system tool use, and a richer care access packet.
31. Make live voice mode intent-driven for public reuse: acknowledge signed-in MyHealth context, require voice-channel verification before any request handling, appointment-specific details, tool use, or action packets, allow confirmation/access-question/reschedule paths after verification, and keep the scripted run-of-show as examples rather than a required script.
32. Perform publish-readiness hygiene: ignore local presentation exports, document pre-publish secret checks, keep realtime diagnostics opt-in, and verify ignored local artifacts are not tracked.
