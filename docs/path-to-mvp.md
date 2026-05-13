# From Demo to MVP: What It Would Take to Make This Real

This document is a forward-looking FAQ for healthcare leaders and builders who
have seen the **Voice Agent for Patient Access** demo and want to understand
what would be required to evolve it into a production-grade MVP for a real
health system.

> This is intentionally a vision document, not a procurement checklist. Every
> provider environment is different. Use this as a starting frame for scoping
> conversations with clinical, compliance, security, IT, and operations
> stakeholders.

---

## TL;DR

The demo proves the *operating pattern*: realtime voice + grounding + action
packet + explicit human handoff, with a clean trust boundary.

An MVP turns that pattern into a **bounded, observable, integrated service**
that a real access center can put in front of a small number of real patients,
for a small number of low-risk workflows, with safety rails that satisfy
clinical, compliance, security, and operations leaders.

The shortest honest answer: expect to invest in **identity, integration,
grounding, governance, and operations** before you invest in more agent
"intelligence."

---

## Scope and product questions

### What workflows should an MVP actually target first?

Pick narrow, high-volume, low-clinical-risk workflows where a clean handoff is
acceptable when the agent is unsure. Good early candidates:

- Appointment reschedule and cancel for non-urgent visit types
- Location, parking, arrival, and prep-instruction questions
- Statement explanation at a high level (no balances, no negotiation)
- Language preference capture and routing to certified interpreters
- Callback scheduling and queue position questions

Explicitly out of scope for MVP:

- Triage, symptom assessment, or any clinical advice
- Prior authorization decisions
- Financial hardship determinations
- Controlled-substance or prescription workflows
- Anything that would create a medical record entry without human review

### What does "done" look like for MVP?

A useful MVP definition has four properties:

1. **Bounded** — a written list of intents the agent will handle, and a written
   list of intents it must escalate.
2. **Grounded** — every factual answer traces to an approved source
   (scheduling system, location database, policy doc, etc.).
3. **Observable** — every session produces a structured action packet, a
   transcript, and a decision trail an auditor can read.
4. **Integrated** — at least one real downstream system is updated as a result
   of the call (e.g., a reschedule actually moves the appointment).

If any of those four are missing, it is still a prototype.

---

## Identity and patient matching

### How do you know who is on the phone?

The demo uses a signed-in portal persona. Real life is messier. An MVP needs a
defensible identity strategy, typically layered:

- **Channel signal:** caller ID, portal SSO, SMS deep link, or known device.
- **Knowledge factors:** name, date of birth, and one additional non-sensitive
  factor (e.g., recent appointment date).
- **Step-up auth for sensitive actions:** push notification to the portal app,
  one-time code via SMS or email, or transfer to a human for verification.
- **Negative paths:** what happens on mismatch, partial match, minor accounts,
  guardianship, and shared phone numbers.

### What about minors, caregivers, and proxy access?

This is one of the most underestimated parts of patient access. MVP must define:

- Which workflows are allowed for proxies and under what consent.
- How proxy relationships are verified against the source of truth.
- How the agent behaves when it cannot confirm the relationship.

---

## Integration and grounding

### What systems does this need to talk to for MVP?

At minimum, plan for read or read/write integration with:

- **EHR / scheduling system** (Epic, Oracle Health, Meditech, athenahealth,
  etc.) for appointment lookup, reschedule, cancel, and provider availability.
- **Patient demographics and identity** for matching and language preference.
- **Location and facility data** for parking, accessibility, and hours.
- **Policy and FAQ content** for prep instructions, cancellation policy, and
  telehealth availability.
- **Interpreter services** for language routing.
- **Contact center platform** for warm transfer and queue handoff.
- **Identity provider** for portal SSO and step-up auth.

### Read-only or read/write?

Start read-only plus *staged* writes. The agent proposes an action; a human or
a deterministic backend service commits it. Move to direct writes only after
you have telemetry showing the proposed actions are accurate and safe.

### How do you keep answers grounded?

Three layers:

1. **Structured retrieval** for facts (appointments, locations, hours).
2. **Policy retrieval** for approved language on prep, cancellation, billing
   workflow, and telehealth.
3. **Hard refusals** for anything outside the allowed intent list, including
   clinical questions, balances, and hardship.

If the agent cannot ground an answer, it should say so and offer a handoff.

---

## Safety, clinical, and compliance

### Is this a medical device?

For the workflows above, almost certainly not — but that determination is a
regulatory question, not an engineering one. Document the intended use, the
exclusion list, and the escalation behavior, and review with your regulatory
and clinical leadership early. Re-review whenever the intent list expands.

### What clinical governance is required?

At a minimum:

- A named clinical owner who signs off on the intent list and the escalation
  list.
- A written protocol for emergencies (the agent should always direct to 911
  and end the workflow).
- A periodic review of transcripts and action packets for clinical drift.
- A change-control process when prompts, grounding data, or models change.

### What does HIPAA require here?

This is provider- and counsel-specific, but plan for:

- A **Business Associate Agreement** with your model and infrastructure
  providers (e.g., Microsoft for Azure OpenAI).
- A documented **minimum necessary** data flow — the agent should see only
  what it needs.
- **Encryption in transit and at rest**, including audio and transcripts.
- **Access controls and audit logs** for anyone who can view sessions.
- A **records retention policy** for audio, transcripts, and action packets.
- **Patient notice and consent** language appropriate to your jurisdiction and
  channel (including state-level call-recording laws).

### What about bias, equity, and accessibility?

Plan for explicit testing of:

- Performance across accents, dialects, and non-native English speakers.
- Performance in Spanish and any other languages you commit to supporting.
- Behavior with assistive technologies and TTY/relay services.
- Behavior with low-bandwidth or low-quality audio.

Publish the limitations you find. Bias you do not measure is bias you ship.

---

## Security and the trust boundary

### What changes from the demo's trust model?

The demo already keeps the long-lived API key server-side and mints short-lived
session credentials for the browser. That pattern is the right shape. For MVP,
extend it with:

- A hardened token-minting service with rate limits and abuse detection.
- Per-tenant and per-user scoping on session credentials.
- Strict CORS, CSP, and origin checks on the browser side.
- Secret management via a real vault (Azure Key Vault, AWS Secrets Manager,
  HashiCorp Vault), not `.env` files.
- Network egress controls so the model endpoint, EHR, and identity provider
  are the only outbound destinations from the service.
- Threat modeling for prompt injection via grounding data, transcripts, and
  user speech.

### What about prompt injection?

Treat any text the agent ingests — patient utterances, FAQ content, scheduling
notes — as untrusted. Constrain tool use to a small, typed set of actions.
Never let retrieved content rewrite the system prompt or expand the intent
list at runtime.

---

## Operations and the human side

### Who owns this in the access center?

An MVP needs a named operational owner before it needs a model upgrade. That
owner is responsible for:

- The intent and escalation lists
- The action-packet schema staff will actually consume
- The handoff experience (warm transfer, context preservation, wait times)
- The daily review of escalations and failed calls
- The feedback loop back into prompts and grounding

### What does the staff experience look like?

The action packet from the demo is the seed of this. For MVP, staff need:

- A queue view of agent-handled sessions awaiting review or action.
- One-click acceptance of routine actions (e.g., commit the reschedule).
- A clear reason code and transcript snippet for every escalation.
- The ability to flag a session for prompt or grounding improvement.

### What telemetry would make operations trust it?

Track and publish, at minimum:

- Containment rate by intent
- Escalation rate by reason
- Patient-reported satisfaction (short post-call signal)
- Staff override and correction rate on proposed actions
- Time-to-resolution vs. the legacy phone path
- Latency, error, and dropped-call rates
- Language and accessibility breakdowns

If you cannot answer "is this actually helping patients and staff?" with data,
you do not have an MVP yet.

---

## Architecture and engineering

### What in the demo is reusable, and what gets replaced?

Reusable patterns:

- Dual-view operating model (patient experience + executive console)
- Server-side credential minting for realtime voice
- Scenario grounding and approved-context pattern
- Action packet as the unit of work for staff
- Explicit handoff state

Replaced for MVP:

- Static `scenarios.js` and `synthetic-data.js` → real retrieval against
  scheduling, policy, and location systems
- Single-process Python static server → a deployed service with auth,
  logging, autoscaling, and per-tenant config
- Demo persona → real identity and patient-matching flow
- Local `.env` → managed secrets and per-environment configuration
- Browser-only state → durable session, transcript, and action-packet
  storage with retention policy

### What does a realistic MVP architecture look like?

A reasonable shape:

- **Browser client** for the patient surface and the staff console.
- **Edge / API layer** for auth, rate limiting, and routing.
- **Session service** that mints realtime credentials, manages call state,
  and enforces the intent list.
- **Tooling layer** that exposes a small, typed set of actions (lookup
  appointment, propose reschedule, fetch location info, route to interpreter,
  create action packet).
- **Grounding layer** for policy and FAQ retrieval.
- **Integration adapters** for EHR, identity, contact center, and interpreter
  services.
- **Observability stack** for transcripts, action packets, metrics, and audit
  logs.
- **Admin surface** for intent-list changes, prompt updates, and review
  workflows, all under change control.

### Build, buy, or partner?

Most health systems will land on a mix. The browser experience and the
operational console are often worth building because they are how your
patients and staff actually feel the product. The EHR adapters, contact
center integration, and interpreter routing are usually better bought or
partnered. The model and realtime transport are bought.

The piece you should never outsource is the **intent list, escalation list,
and action-packet schema**. That is your operating model.

---

## Rollout

### How would you actually launch this?

A defensible rollout looks roughly like:

1. **Internal dogfood** with staff playing patients, against synthetic data.
2. **Shadow mode** alongside the live phone line, with no patient impact.
3. **Opt-in pilot** with a small cohort, a narrow intent list, and a clear
   off-ramp to a human at any time.
4. **Expanded pilot** across more locations or service lines, with telemetry
   gates between stages.
5. **General availability** for the intents that have cleared the gates,
   while keeping the rest in pilot.

At every stage, the question is the same: *is the agent making patients and
staff better off, and can we prove it?*

### What is the minimum viable team?

Roughly:

- Product owner with access-center context
- Clinical sponsor
- Compliance and privacy partner
- Security partner
- 1–2 engineers for the voice/agent service
- 1 engineer for EHR and identity integration
- 1 designer for patient and staff surfaces
- Access-center operations lead
- An executive sponsor who will defend the scope when it is asked to grow too
  fast

---

## Common questions

### Will this replace our access center staff?

No, and that should not be the goal. The point is to remove avoidable friction
before it reaches staff and to make handoffs cleaner when humans are needed.
The right success metric is staff effectiveness and patient experience, not
headcount.

### How long until MVP?

Variable, and dependent almost entirely on integration and governance, not on
model capability. Plan in quarters, not weeks, and plan the governance work in
parallel with the engineering work, not after it.

### Why not just use an off-the-shelf IVR or chatbot?

You can, and for some workflows you should. The reason to invest in a realtime
voice agent is the *experience* — conversational latency, natural turn-taking,
and language flexibility — combined with the *operating pattern* of grounding,
action packets, and explicit handoff. If you do not need that experience or
that pattern, a simpler tool is the right answer.

### What is the single biggest risk?

Scope creep into clinical territory. The demo is safe because the intent list
is small and the escalation list is explicit. An MVP stays safe by holding
that line under pressure from stakeholders who want the agent to do "just one
more thing."

---

## What this document is not

- Not legal, clinical, or regulatory advice.
- Not an implementation plan for any specific health system.
- Not an endorsement of any specific vendor, including the ones referenced in
  the demo.

It is a starting frame. The real plan is the one you write with your clinical,
compliance, security, and operations leaders, against your own systems and
your own patients.
