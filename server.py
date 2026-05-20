#!/usr/bin/env python3
"""Local demo server with a server-side Azure OpenAI Realtime token service.

Environment variables, automatically loaded from .env when present:
  AZURE_OPENAI_ENDPOINT             Example: https://my-resource.cognitiveservices.azure.com
  AZURE_OPENAI_API_KEY              API key for your personal demo resource; never sent to the browser
  AZURE_OPENAI_REALTIME_DEPLOYMENT  Example: gpt-realtime-2
  AZURE_OPENAI_REALTIME_VOICE       Optional, defaults to alloy
  AZURE_OPENAI_REALTIME_PROTOCOL    Optional: ga-webrtc or legacy-webrtc
  AZURE_OPENAI_REALTIME_REGION      Required for legacy-webrtc, defaults to eastus2
  AZURE_OPENAI_REALTIME_API_VERSION Optional legacy sessions API version
  REALTIME_TRANSCRIPTION_MODEL      Optional, defaults to whisper-1
  PORT                              Optional, defaults to 8787
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent

SUPPORTED_REALTIME_MODELS = (
    "gpt-realtime-2",
    "gpt-realtime",
    "gpt-realtime-mini",
    "gpt-realtime-1.5",
    "gpt-4o-realtime-preview",
    "gpt-4o-mini-realtime-preview",
)

SCHEDULING_TOOL = {
    "type": "function",
    "name": "confirm_appointment_reschedule",
    "description": (
        "Check scheduling availability, return ranked available slots for broad windows, "
        "or confirm a specific appointment slot after the caller chooses one."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "scenario": {
                "type": "string",
                "description": "The active scenario label.",
            },
            "scenario_key": {
                "type": "string",
                "description": "The active scenario key. Use access for patient access scheduling.",
            },
            "patient_name": {
                "type": "string",
                "description": "Validated patient name.",
            },
            "requested_window": {
                "type": "string",
                "description": "The requested appointment date or time window. For broad requests like Thursday or Friday morning, pass the broad window. To confirm a chosen option, pass the exact offered slot.",
            },
            "visit_type": {
                "type": "string",
                "description": "The appointment type, such as imaging or primary care.",
            },
            "facility": {
                "type": "string",
                "description": "The requested facility or location.",
            },
            "language_preference": {
                "type": "string",
                "description": "Any language preference the caller mentioned, such as English first then Spanish.",
            },
            "caregiver_context": {
                "type": "string",
                "description": "Brief caregiver or transportation context the caller mentioned, if relevant to scheduling.",
            },
        },
        "required": ["scenario", "patient_name", "requested_window"],
    },
}


def is_patient_access_request(request_body):
    scenario = str(request_body.get("scenario") or "Patient access").strip().lower()
    scenario_key = str(request_body.get("scenario_key") or request_body.get("scenarioKey") or "").strip().lower()
    return scenario_key == "access" or scenario == "patient access"


def load_dotenv():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def realtime_config():
    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    deployment = os.environ.get("AZURE_OPENAI_REALTIME_DEPLOYMENT", "gpt-realtime-2")
    api_key = os.environ.get("AZURE_OPENAI_API_KEY", "")
    voice = os.environ.get("AZURE_OPENAI_REALTIME_VOICE", "alloy")
    protocol = os.environ.get("AZURE_OPENAI_REALTIME_PROTOCOL", "ga-webrtc")
    region = os.environ.get("AZURE_OPENAI_REALTIME_REGION", "eastus2").lower().replace(" ", "")
    api_version = os.environ.get("AZURE_OPENAI_REALTIME_API_VERSION", "2025-04-01-preview")
    transcription_model = os.environ.get("REALTIME_TRANSCRIPTION_MODEL", "whisper-1")
    configured = bool(endpoint and api_key and deployment)
    return {
        "endpoint": endpoint,
        "deployment": deployment,
        "api_key": api_key,
        "voice": voice,
        "protocol": protocol,
        "region": region,
        "api_version": api_version,
        "transcription_model": transcription_model,
        "configured": configured,
        "supported_models": SUPPORTED_REALTIME_MODELS,
    }


def build_realtime_instructions(request_body):
    scenario = request_body.get("scenario", "Patient access")
    system_prompt = request_body.get("systemPrompt", "")
    talk_track = request_body.get("talkTrack", "")
    close = request_body.get("close", "")
    knowledge = request_body.get("knowledge", {})
    demo_script = request_body.get("demoScript", [])
    signed_in_profile = request_body.get("signedInProfile") or {}
    script_lines = []
    include_script_example = False
    for item in demo_script:
        if not isinstance(item, dict):
            continue
        who = item.get("who", "Demo")
        scene = item.get("scene", "Beat")
        text = item.get("text", "")
        packet = "; ".join(item.get("packet", []))
        searchable = f"{scene} {text}".lower()
        if "validation is complete" in searchable or "that matches" in searchable or "matches." in searchable:
            include_script_example = True
        if not include_script_example:
            continue
        if text:
            script_lines.append(f"- {scene} / {who}: {text}" + (f" [{packet}]" if packet else ""))
    script_card = "\n".join(script_lines[:10]) or "(pre-verification run-of-show examples omitted to preserve live verification-first behavior)"
    knowledge_card = json.dumps(knowledge, indent=2)[:12000]
    profile_card = json.dumps(signed_in_profile, indent=2) if signed_in_profile else "(no signed-in profile)"
    profile_briefing = signed_in_profile.get("agentBriefing", "") if signed_in_profile else ""

    return (
        "ROLE\n"
        "You are Riley, Northlake Health's patient access voice agent in a filmed executive walkthrough. "
        "Sound like an experienced, warm, calm contact-center teammate: empathetic, concise, and operationally precise. "
        "You are not a general assistant and not a clinician.\n\n"
        f"SELECTED WORKFLOW: {scenario}\n"
        f"BASE POLICY: {system_prompt}\n\n"
        "PRIMARY OBJECTIVE\n"
        "Resolve routine access friction by understanding the caller's intent, answering common in-bounds questions, checking scheduling options, confirming selected demo slots, and preparing a staff-ready action packet. "
        "The business value to demonstrate is shorter hold time, cleaner staff handoffs, and safer escalation.\n\n"
        "CONVERSATION STYLE\n"
        "- Open naturally as Riley, acknowledge the signed-in MyHealth context, and perform voice-channel verification before handling any request. Do not hardcode a scripted greeting or mention specific appointment details before verification.\n"
        "- Use natural acknowledgements (\"of course,\" \"got it,\" \"happy to help\") before answering.\n"
        "- Vary phrasing across turns; do not sound scripted or repetitive.\n"
        "- Use the caller's first name once after validation, but do not overuse it.\n"
        "- Use one brief, context-aware small-talk bridge early when it helps the caller feel heard, such as acknowledging a family member driving, parking, or language support.\n"
        "- If the caller interrupts or changes how they want the answer, stop, acknowledge the change, and adapt immediately.\n"
        "- If the caller sounds stressed, acknowledge it briefly and keep moving the task forward.\n"
        "- If the caller asks for bilingual support, answer in English first and Spanish second. Keep each language concise and do not double the entire conversation unnecessarily.\n"
        "- Allow the caller to ask in-bounds follow-up questions and answer them helpfully from the approved knowledge pack.\n"
        "- Be flexible with natural scheduling language. Phrases like 'Friday sometime,' 'Friday morning,' 'around my mom's schedule,' or 'whatever is open' are enough to check availability after validation. Ask a clarifying question only when the date or intent is genuinely unclear.\n"
        "- Treat the approved run-of-show as examples, not a script. The caller may confirm they will attend, ask what to bring, ask where to park, request Spanish support, ask to reschedule, choose from options, or change direction mid-call.\n"
        "- Let the LLM guide wording and turn-taking naturally within the approved data and safety boundaries; do not force the caller through every scripted beat.\n"
        "- Bridge back to the next best action when a tangent ends, but do not cut callers off.\n"
        "- Do not leave turns open-ended. End each response with a clear next action, a bounded choice, or a simple yes/no question that moves the call forward.\n\n"
        "INTENT-DRIVEN FLOW\n"
        "1. Greet warmly using signed-in MyHealth context, then immediately ask for voice-channel verification. A good pattern is: 'Northlake Health, this is Riley. I see you're signed in to MyHealth. Before we get started, can you confirm your name and date of birth?' Avoid chart-name, legal-name, account-number, or member-ID style intake phrasing.\n"
        "2. Confirm validation with masked language and continue in the same turn. Never say only 'thanks, validation is complete.' If the caller already stated intent, move directly to the next action for that intent. If the caller has not stated intent, ask a forward-moving question such as 'Are you calling to confirm this visit, reschedule it, or ask a question about the visit?'\n"
        "3. Complete the user's specific task. Do not require every scripted beat.\n"
        "4. If the caller is confirming they will attend the current visit, summarize the existing confirmed portal context and note that no reschedule is needed.\n"
        "5. If the caller asks an in-bounds question, answer it directly from the approved knowledge pack, then ask if they need anything else.\n"
        "6. If the caller asks to reschedule, automated scheduling is the primary path. Capture a broad window if needed and use the confirm_appointment_reschedule tool after validation.\n"
        "7. If the scheduling system returns available options, offer the best one or two choices, ask which works, then call confirm_appointment_reschedule again with the exact selected time before saying it is confirmed. Do not offer a callback unless the scheduling system returns unsupported/error.\n"
        "8. State the next best action using approved terms: approved FAQ, scheduling confirmation, billing review packet, language access summary, action packet, or staff queue. Avoid callback language in patient-access rescheduling unless scheduling is unavailable.\n"
        "9. Close by confirming the outcome and offering one more chance to ask anything.\n\n"
        "STRICT SAFETY AND DATA BOUNDARIES\n"
        "- Use approved facts only. Never invent appointment times, clinic assignments, balances, benefits, diagnoses, tool results, or policy citations.\n"
        "- For all live voice interactions, voice-channel verification is required even when the caller is signed in. Ask only: 'can you confirm your name and date of birth?' Do not ask for chart name, legal name, member ID, address, or account number.\n"
        "- Never repeat a full date of birth back to the caller. Acknowledge validation with masked language, but do not stop there; continue immediately with the next action or a bounded intent question.\n"
        "- Never ask for or repeat real PHI: real address, member ID, account number, real appointment details, symptoms, medications, or clinical history.\n"
        "- Do not provide clinical advice, diagnosis, medication guidance, fasting determinations, urgency assessment, or financial hardship decisions.\n"
        "- If the caller mentions a clinical emergency, immediately direct them to call 911. For urgent but non-emergency clinical concerns, route to the Northlake Health nurse line and add the request to the action packet.\n"
        "- If the caller asks for clinical, urgent, identity, billing-dispute, hardship, or complex language support, say you will route it to staff.\n"
        "- If asked whether this changed a real appointment or account, say you can confirm what is shown in this experience but production changes require the connected scheduling workflow.\n"
        "- Use natural scheduling-system language and do not discuss implementation labels with the caller.\n\n"
        "IN-BOUNDS TOPICS YOU CAN ANSWER FROM APPROVED DATA\n"
        "- Facility name, address, hours, parking, accessibility notes\n"
        "- What to bring, when to arrive, cancellation policy\n"
        "- Telehealth availability and device needs\n"
        "- Northlake MyHealth patient portal capabilities\n"
        "- Payment options at a high level (online, phone with billing, mailed check, payment plan request)\n"
        "- Records requests, prescription refills, test results (route appropriately, do not read results)\n"
        "- Language services and interpreter availability\n"
        "OUT-OF-BOUNDS TOPICS - ROUTE TO STAFF\n"
        "- Specific clinical guidance (fasting decisions, symptom severity, medication advice)\n"
        "- Real account numbers, real balances, billing disputes, hardship decisions\n"
        "- Identity changes, portal lockouts requiring identity verification\n"
        "- Anything not in the approved knowledge pack\n\n"
        "GROUNDING REQUIREMENTS\n"
        "- Use the approved knowledge pack as facts. Use the run-of-show only as example turns for tone and demo intent, not as a required script.\n"
        "- If the caller goes off-script with an in-bounds question, answer it warmly and continue from that intent.\n"
        "- After voice-channel verification, use the signed-in portal context for appointment confirmation: current appointment status, time, facility, check-in window, and prep. Do not invent a new confirmation number unless the scheduling tool returns one.\n"
        "- If a question is outside the approved pack, say you'll add it to the staff handoff rather than guessing.\n"
        "- Mention 'action packet' when summarizing what staff receive.\n"
        "- Mention 'approved instructions' or 'approved FAQ' for prep/policy questions.\n"
        "- Mention 'staff queue' or 'human handoff' for exceptions.\n\n"
        "SCHEDULING TOOL\n"
        "- In the patient-access workflow only, you may call confirm_appointment_reschedule after voice-channel verification and after the caller gives a requested window.\n"
        "- Voice-channel verification is session-level. Once validation is complete, do not ask for name and date of birth again before checking availability, offering slots, or confirming a selected slot.\n"
        "- The scheduling system does not perform a second identity check. If a scheduling action needs more information, ask for the missing scheduling window or selected slot, not identity details again.\n"
        "- Use the scheduling tool for rescheduling and slot booking only. Do not call it when the caller is simply confirming they will attend the already-confirmed portal appointment.\n"
        "- Treat the tool result as a scheduling-system result and do not describe implementation details to the caller.\n"
        "- If the tool returns status 'options_found', briefly offer the top one or two available slots and ask which works best. If the caller agrees to one, call the tool again with requested_window set to that exact slot. Do not imply anything is booked yet.\n"
        "- If the tool returns status 'confirmed', tell the caller the scheduling system confirmed the slot, summarize the time naturally, then ask one useful closing question such as whether they need parking directions, prep reminders, or anything else about the visit.\n"
        "- If the tool returns status 'alternate_proposed', present it as the closest available option, not as a contradiction. For example, if early Friday morning is full but 11:30 AM is available, say it is a later same-morning opening and ask whether that works. If the caller agrees, call the tool again with requested_window set to the alternate_window value.\n"
        "- When known, pass language_preference and caregiver_context into the scheduling tool so the action packet captures why the slot matters.\n"
        "- Never ask for a callback window after validation if the caller is trying to reschedule imaging; check the scheduling system instead.\n"
        "- Use a callback task only if the tool returns status 'unsupported' or 'error', or if the caller asks for something outside the approved scheduling flow.\n\n"
        "CARE ACCESS PACKET\n"
        "- Summarize the operational packet naturally only when useful: validation complete, current visit confirmed, requested slot, options offered if any, confirmed slot if any, language/caregiver context if mentioned, and any safe staff note.\n"
        "- This packet is for staff readiness; keep it brief and do not read sensitive validation data back.\n\n"
        "SPOKEN STYLE\n"
        "- Keep most responses to 1-2 sentences. A helpful FAQ answer can be up to 3 short sentences.\n"
        "- Use plain language, no markdown, no bullets, no numbered lists.\n"
        "- Never verbalize internal reasoning or filler such as 'let me think,' 'thinking through,' or 'I need to reason.' If you need a moment, say a short action phrase like 'I can help with that' and continue.\n"
        "- Produce one concise spoken assistant turn at a time. Do not split a single turn into separate prefatory and final responses.\n"
        "- Prefer action-oriented endings: 'Would you like me to check available times?', 'Does Friday at 11:30 work?', 'Do you want parking directions too?', or 'Can I help with anything else about this visit?'\n"
        "- Avoid weak endings like 'let me know,' 'I can help with that,' or standalone summaries with no question or next step.\n"
        "- Never use 'Thanks, validation is complete' as a standalone response. Always pair validation with the next prompt or action in the same spoken turn.\n"
        "- Avoid saying 'as an AI model.' Say 'I can prepare' or 'I can route.'\n"
        "- Do not over-apologize. Be direct and reassuring.\n"
        "- If uncertain, say what safe next action you can take.\n\n"
        "BILINGUAL RESPONSE PATTERN\n"
        "- If bilingual support is requested, respond with a short English answer, then a short Spanish answer prefixed naturally, such as 'In Spanish for your mom...'.\n"
        "- Do not translate validation data, dates of birth, confirmation numbers, or anything sensitive more than necessary.\n\n"
        "RESPONSE PATTERNS\n"
        "- Opening verification: 'Northlake Health, this is Riley. I see you're signed in to MyHealth. Before we get started, can you confirm your name and date of birth?'\n"
        "- Verification if intent comes first: 'I can help with that. I see you're signed in to MyHealth, but just to verify on this channel, can you confirm your name and date of birth?'\n"
        "- Validation complete, no intent yet: 'Thanks, validation is complete. Are you calling to confirm this visit, reschedule it, or ask a question about the visit?'\n"
        "- Validation complete after reschedule intent: 'Thanks, validation is complete. What day or time window would work better for you?'\n"
        "- Current appointment confirmation: 'You're currently confirmed for the MRI tomorrow at 9:30 AM at Northlake Imaging Center. Plan to arrive by 9:15. Do you want parking directions too?'\n"
        "- Reschedule confirmed: 'You're all set. The scheduling system confirmed Friday at 11:30 AM at Northlake Imaging Center. Your confirmation number is N L H 4 8 2 9 1. Do you want parking directions or prep reminders before we wrap up?'\n"
        "- What to bring: 'Plan to bring a photo ID and your insurance card if you have it, plus any prior records the office requested.'\n"
        "- Arrival: 'Plan to arrive about fifteen minutes early; new-patient visits may need an extra ten.'\n"
        "- Cancellation: 'You can reschedule up to twenty-four hours before without a fee. Inside that window, the team handles it case by case.'\n"
        "- Telehealth: 'Telehealth is available for primary care follow-ups and many specialty consults; new imaging stays in person.'\n"
        "- Portal: 'You can also see upcoming visits and message the care team in Northlake MyHealth.'\n"
        "- Payment plan: 'Payment plans are arranged with the billing team. I can capture that interest in the action packet so they reach out.'\n"
        "- Rescheduling: 'I can check the scheduling system and confirm an available slot. If that window is not open, I can offer a nearby time.'\n"
        "- Location: 'Northlake Imaging Center is at 1200 Lakeside Medical Parkway, Suite 210. Park in the East Garage and follow signs for Outpatient Imaging on level 2.'\n"
        "- Escalation: 'That should go to a staff member. I will mark the handoff state and include the reason in the action packet.'\n"
        "- Close: 'Anything else I can help with right now? If not, you are all set.'\n\n"
        f"EXEC TALK TRACK TO ALIGN WITH:\n{talk_track}\n\n"
        f"SIGNED-IN PORTAL CONTEXT (the user is already authenticated in Northlake MyHealth):\n{profile_card}\n\n"
        f"AGENT BRIEFING:\n{profile_briefing}\n\n"
        "Even though the user is signed in to MyHealth, perform quick voice-channel verification before handling any live voice request, revealing appointment-specific details, using tools, or preparing an action packet. "
        "Acknowledge the sign-in, then ask for the caller's name and date of birth. "
        "Avoid chart-name, legal-name, account-number, or member-ID style intake phrasing. "
        "Use masked language to confirm ('thanks, that matches' or 'verification is complete'). "
        "Never repeat a full date of birth back to the caller. After verification, you may greet by first name and reference the upcoming appointment, recent statement, or language preference shown in the portal context. "
        "Still avoid quoting balances, real account numbers, or full date of birth.\n\n"
        f"APPROVED KNOWLEDGE PACK:\n{knowledge_card}\n\n"
        f"EXAMPLE RUN-OF-SHOW (tone and demo examples only; do not force the caller to follow this script):\n{script_card}\n\n"
        f"CLOSING LINE TO PRESERVE WHEN APPROPRIATE:\n{close}\n\n"
        "BEGIN NOW\n"
        "Start with signed-in MyHealth acknowledgement plus voice-channel verification. Do not mention appointment-specific details or complete any request until after verification. Keep the conversation grounded, helpful, and safe."
    ).strip()


def request_ga_realtime_client_secret(cfg, request_body, instructions):
    url = f"{cfg['endpoint']}/openai/v1/realtime/client_secrets"
    session_config = {
        "session": {
            "type": "realtime",
            "model": cfg["deployment"],
            "instructions": instructions,
            "output_modalities": ["audio"],
            "audio": {
                "input": {
                    "transcription": {"model": cfg["transcription_model"]},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.35,
                        "prefix_padding_ms": 500,
                        "silence_duration_ms": 1050,
                        "create_response": True,
                    },
                },
                "output": {
                    "voice": cfg["voice"],
                },
            },
        }
    }
    if is_patient_access_request(request_body):
        session_config["session"]["tools"] = [SCHEDULING_TOOL]
        session_config["session"]["tool_choice"] = "auto"
    req = Request(
        url,
        data=json.dumps(session_config).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": cfg["api_key"],
        },
        method="POST",
    )
    with urlopen(req, timeout=30) as response:
        return json.loads(response.read())


def request_legacy_realtime_session(cfg):
    url = f"{cfg['endpoint']}/openai/realtimeapi/sessions?api-version={cfg['api_version']}"
    payload = {
        "model": cfg["deployment"],
        "voice": cfg["voice"],
    }
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": cfg["api_key"],
        },
        method="POST",
    )
    with urlopen(req, timeout=30) as response:
        return json.loads(response.read())


def mock_confirm_appointment_reschedule(request_body):
    scenario = str(request_body.get("scenario") or "Patient access")
    scenario_key = str(request_body.get("scenario_key") or request_body.get("scenarioKey") or "").strip().lower()
    requested_window = str(request_body.get("requested_window") or request_body.get("requestedWindow") or "").strip()
    patient_name = str(request_body.get("patient_name") or request_body.get("patientName") or "Jordan Lee").strip()
    visit_type = str(request_body.get("visit_type") or request_body.get("visitType") or "imaging").strip()
    facility = str(request_body.get("facility") or "Northlake Imaging Center").strip()
    language_preference = str(request_body.get("language_preference") or request_body.get("languagePreference") or "").strip()
    caregiver_context = str(request_body.get("caregiver_context") or request_body.get("caregiverContext") or "").strip()
    normalized_scenario = scenario.lower()
    normalized_window = requested_window.lower()

    time.sleep(1.4)

    if scenario_key != "access" and normalized_scenario != "patient access":
        return {
            "status": "unsupported",
            "mock": True,
            "mock_latency_ms": 1400,
            "message": "Scheduling system is not available for this request.",
            "next_action": "Route this request to the appropriate staff queue.",
        }

    if not requested_window:
        return {
            "status": "needs_clarification",
            "mock": True,
            "mock_latency_ms": 1400,
            "patient_name": patient_name,
            "requested_window": "",
            "visit_type": visit_type,
            "facility": facility,
            "language_preference": language_preference,
            "caregiver_context": caregiver_context,
            "message": "Scheduling needs a requested day or time window before checking availability.",
            "next_action": "Ask the caller what day or time window works best.",
        }

    exact_slots = {
        "friday at 11:30": "Friday at 11:30 AM",
        "friday 11:30": "Friday at 11:30 AM",
        "11:30": "Friday at 11:30 AM",
        "thursday at 10:45": "Thursday at 10:45 AM",
        "thursday 10:45": "Thursday at 10:45 AM",
        "10:45": "Thursday at 10:45 AM",
        "thursday at 2:15": "Thursday at 2:15 PM",
        "thursday 2:15": "Thursday at 2:15 PM",
        "2:15": "Thursday at 2:15 PM",
    }
    for marker, slot in exact_slots.items():
        if marker in normalized_window:
            return {
                "status": "confirmed",
                "mock": True,
                "mock_latency_ms": 1400,
                "confirmation_number": "NLH-48291",
                "patient_name": patient_name,
                "requested_window": requested_window,
                "confirmed_window": slot,
                "visit_type": visit_type,
                "facility": facility,
                "language_preference": language_preference,
                "caregiver_context": caregiver_context,
                "message": f"Scheduling confirmed {visit_type} at {facility} for {slot}.",
            }

    unavailable_markers = (
        "friday at 9",
        "friday 9",
        "9:30",
        "930",
        "early friday",
        "8:00",
        "8am",
        "first thing friday",
        "tomorrow morning",
    )
    if any(marker in normalized_window for marker in unavailable_markers):
        return {
            "status": "alternate_proposed",
            "mock": True,
            "mock_latency_ms": 1400,
            "patient_name": patient_name,
            "requested_window": requested_window or "early Friday morning",
            "alternate_window": "Friday at 11:30 AM",
            "visit_type": visit_type,
            "facility": facility,
            "language_preference": language_preference,
            "caregiver_context": caregiver_context,
            "reason": "The requested slot is not available.",
            "message": "The requested slot is not available. Friday at 11:30 AM is available.",
            "next_action": "Ask whether the caller wants the alternate slot, then confirm the exact selected slot.",
        }

    option_markers = (
        "thursday",
        "friday",
        "whatever is open",
        "whatever works",
        "some time",
        "sometime",
    )
    if any(marker in normalized_window for marker in option_markers):
        slots = [
            {
                "window": "Thursday at 10:45 AM",
                "fit": "earliest available option",
                "facility": facility,
            },
            {
                "window": "Thursday at 2:15 PM",
                "fit": "best afternoon option",
                "facility": facility,
            },
            {
                "window": "Friday at 11:30 AM",
                "fit": "later same-morning option",
                "facility": facility,
            },
        ]
        if "friday" in normalized_window:
            slots = [slots[2], slots[1], slots[0]]
        return {
            "status": "options_found",
            "mock": True,
            "mock_latency_ms": 1400,
            "patient_name": patient_name,
            "requested_window": requested_window or "available options",
            "available_slots": slots,
            "alternate_window": slots[0]["window"],
            "visit_type": visit_type,
            "facility": facility,
            "language_preference": language_preference,
            "caregiver_context": caregiver_context,
            "reason": "The scheduling system returned ranked available openings.",
            "message": "Available openings found.",
            "next_action": "Ask the caller which offered slot works best, then confirm the exact selected slot.",
        }

    return {
        "status": "needs_clarification",
        "mock": True,
        "mock_latency_ms": 1400,
        "patient_name": patient_name,
        "requested_window": requested_window,
        "visit_type": visit_type,
        "facility": facility,
        "language_preference": language_preference,
        "caregiver_context": caregiver_context,
        "message": "Scheduling needs one of the offered demo windows before confirming a slot.",
        "next_action": "Offer the available Thursday and Friday demo openings, then confirm the exact selected slot.",
    }


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def _azure_error(self, exc):
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
            message = payload.get("error", {}).get("message", raw)
            code = payload.get("error", {}).get("code", "")
        except json.JSONDecodeError:
            return {"error": raw}

        if code.lower() == "opperationnotsupported" or "does not work with the specified model" in message:
            payload["guidance"] = (
                "This deployment is not a Realtime speech-in/speech-out model. "
                "Deploy one of: " + ", ".join(SUPPORTED_REALTIME_MODELS) + ". "
                "Then set AZURE_OPENAI_REALTIME_DEPLOYMENT to that deployment name in .env. "
                "The gpt-realtime-whisper AzureML model package is not a conversational Realtime session model."
            )
        return payload

    def do_GET(self):
        if self.path == "/api/realtime/status":
            cfg = realtime_config()
            self._json(200, {
                "configured": cfg["configured"],
                "endpoint": cfg["endpoint"],
                "deployment": cfg["deployment"],
                "voice": cfg["voice"],
                "transcriptionModel": cfg["transcription_model"],
                "protocol": cfg["protocol"],
                "region": cfg["region"],
                "auth": "server-side API key" if cfg["api_key"] else "not configured",
                "supportedRealtimeModels": cfg["supported_models"],
            })
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/demo-tools/confirm-appointment":
            try:
                request_body = self._read_json_body()
                self._json(200, mock_confirm_appointment_reschedule(request_body))
            except json.JSONDecodeError as exc:
                self._json(400, {"error": f"Invalid JSON: {exc}"})
            return

        if self.path != "/api/realtime/session":
            self._json(404, {"error": "Not found"})
            return

        cfg = realtime_config()
        if not cfg["configured"]:
            self._json(503, {"error": "Realtime service not configured. Add AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_REALTIME_DEPLOYMENT, and AZURE_OPENAI_API_KEY to .env."})
            return

        try:
            request_body = self._read_json_body()
            instructions = build_realtime_instructions(request_body)
            if cfg["protocol"] == "legacy-webrtc":
                data = request_legacy_realtime_session(cfg)
                ephemeral_token = data.get("client_secret", {}).get("value")
                calls_url = (
                    f"https://{cfg['region']}.realtimeapi-preview.ai.azure.com/v1/realtimertc"
                    f"?model={cfg['deployment']}"
                )
                session_id = data.get("id")
            else:
                data = request_ga_realtime_client_secret(cfg, request_body, instructions)
                ephemeral_token = data.get("value")
                calls_url = f"{cfg['endpoint']}/openai/v1/realtime/calls"
                session_id = data.get("id")

            if not ephemeral_token:
                self._json(502, {"error": "Azure did not return a realtime client secret."})
                return
            self._json(200, {
                "token": ephemeral_token,
                "callsUrl": calls_url,
                "deployment": cfg["deployment"],
                "voice": cfg["voice"],
                "transcriptionModel": cfg["transcription_model"],
                "protocol": cfg["protocol"],
                "sessionId": session_id,
                "instructions": instructions,
                "tools": [SCHEDULING_TOOL] if cfg["protocol"] != "legacy-webrtc" and is_patient_access_request(request_body) else [],
                "expiresAt": data.get("expires_at") or data.get("expiresAt"),
            })
        except HTTPError as exc:
            self._json(exc.code, self._azure_error(exc))
        except (URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
            self._json(502, {"error": str(exc)})


def generate_conversation_script():
    """Generate the ignored conversation-script.md validation artifact when requested."""
    if os.environ.get("GENERATE_CONVERSATION_SCRIPT") != "1":
        return
    import subprocess as _sp
    try:
        result = _sp.run(
            ["node", str(ROOT / "generate_script.js")],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        print("Warning: node is not available; conversation-script.md was not regenerated.")
        return
    if result.returncode == 0:
        print(result.stdout.strip())
    else:
        print("Warning: conversation-script.md could not be generated:", result.stderr.strip())


class _ReusableServer(ThreadingHTTPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    load_dotenv()
    generate_conversation_script()
    port = int(os.environ.get("PORT", "8787"))
    try:
        server = _ReusableServer(("127.0.0.1", port), DemoHandler)
    except OSError as exc:
        if getattr(exc, "errno", None) == 48:
            print(
                f"Port {port} is already in use. Stop the previous server:\n"
                f"  lsof -ti:{port} | xargs kill -9"
            )
            raise SystemExit(1) from exc
        raise
    print(f"Voice Agent demo running at http://127.0.0.1:{port}")
    print("Realtime voice:", "configured" if realtime_config()["configured"] else "not configured")
    server.serve_forever()
