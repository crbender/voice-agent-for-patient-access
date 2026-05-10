# Plan: Patient Access Voice Agent Executive Demo

## Technical approach

Use a single self-contained HTML file with vanilla JavaScript. This keeps setup under one minute, avoids dependency installs, and makes screen recording reliable. The page will be structured as an executive command center rather than a generic chatbot.

## UI surfaces

- **Demo stage**: animated voice orb, transcript, and run controls.
- **Operational signal panel**: containment, wait time avoided, language readiness, and action packet.
- **Director panel**: hook, timestamps, captions, and close.
- **Scenario panel**: fast switching between patient access, revenue cycle, and multilingual access.
- **Architecture/trust panel**: production integration map, governance notes, and synthetic data notice.

## Integration seam

The scripted demo emits transcript, metric, packet, and scene events. A production Azure Voice Live API client can replace the scripted event source while keeping the UI rendering functions.

## Validation

- Serve locally with Python HTTP server.
- Load in browser automation.
- Start the scripted demo and confirm transcript and metrics update.
- Check console for errors and warnings.
