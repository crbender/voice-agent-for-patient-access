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
9. Add support for both GA Realtime WebRTC and preview/legacy WebRTC protocol, including the current `gpt-realtime-1.5` deployment.
10. Add synthetic grounding data for patient access, revenue cycle, and multilingual access scenarios.
11. Rework the UI into a hospital access-console experience with caller context, queue, action packet, supervisor view, and realtime status.
12. Default the UI to live voice mode, make the mic/orb answer the call, and add an explicit end-conversation control.
13. Strengthen Realtime model instructions so the agent sounds like a production patient-access contact-center agent while staying grounded in synthetic data.
14. Refresh documentation and Spec Kit artifacts whenever implementation behavior, model protocol, or demo runbook changes.
15. Add demo name/date-of-birth validation protocol to the scripted flow, Realtime instructions, approved demo knowledge, and docs.
16. Add approved facility addresses, hours, parking notes, and location FAQ grounding for routine imaging-center questions.
17. Remove the word "synthetic" from agent-facing Realtime context, scenario spoken lines, action packet text, and approved knowledge values; leave the presenter responsible for the public disclaimer.
