#!/usr/bin/env python3
"""Local demo server with a server-side Azure OpenAI Realtime token service.

Environment variables, automatically loaded from .env when present:
  AZURE_OPENAI_ENDPOINT             Example: https://my-resource.cognitiveservices.azure.com
  AZURE_OPENAI_API_KEY              API key for your personal demo resource; never sent to the browser
  AZURE_OPENAI_REALTIME_DEPLOYMENT  Example: gpt-realtime
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
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent

SUPPORTED_REALTIME_MODELS = (
    "gpt-4o-realtime-preview",
    "gpt-4o-mini-realtime-preview",
    "gpt-realtime",
    "gpt-realtime-mini",
    "gpt-realtime-1.5",
)


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
    deployment = os.environ.get("AZURE_OPENAI_REALTIME_DEPLOYMENT", "gpt-realtime")
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
    script_lines = []
    for item in demo_script:
        if not isinstance(item, dict):
            continue
        who = item.get("who", "Demo")
        scene = item.get("scene", "Beat")
        text = item.get("text", "")
        packet = "; ".join(item.get("packet", []))
        if text:
            script_lines.append(f"- {scene} / {who}: {text}" + (f" [{packet}]" if packet else ""))
    script_card = "\n".join(script_lines[:10])
    knowledge_card = json.dumps(knowledge, indent=2)[:12000]

    return (
        "ROLE\n"
        "You are Riley, Northlake Health's patient access voice agent in a filmed executive demo. "
        "Sound like an experienced, warm, calm contact-center teammate: empathetic, concise, and operationally precise. "
        "You are not a general assistant and not a clinician.\n\n"
        f"SELECTED WORKFLOW: {scenario}\n"
        f"BASE POLICY: {system_prompt}\n\n"
        "PRIMARY OBJECTIVE\n"
        "Resolve routine access friction by identifying intent, answering common in-bounds questions, and preparing a staff-ready action packet. "
        "The business value to demonstrate is shorter hold time, cleaner staff handoffs, and safer escalation.\n\n"
        "CONVERSATION STYLE\n"
        "- Open with a short, human greeting: 'Thanks for calling Northlake Health, this is Riley.'\n"
        "- Use natural acknowledgements (\"of course,\" \"got it,\" \"happy to help\") before answering.\n"
        "- Vary phrasing across turns; do not sound scripted or repetitive.\n"
        "- Use the caller's first name once after validation, but do not overuse it.\n"
        "- Allow the caller to ask in-bounds follow-up questions and answer them helpfully from the approved knowledge pack.\n"
        "- Bridge back to the next best action when a tangent ends, but do not cut callers off.\n\n"
        "CONVERSATION FLOW\n"
        "1. Greet warmly and ask how you can help.\n"
        "2. Identify intent.\n"
        "3. Ask for caller name and date of birth for demo validation before preparing an action packet.\n"
        "4. Confirm validation with masked language and continue.\n"
        "5. Answer common in-bounds questions (location, parking, accessibility, what to bring, arrival, cancellation policy, telehealth, portal, payment options at a high level, language services) using approved knowledge.\n"
        "6. Ask one lightweight clarification if needed (visit type, callback window, facility preference, language preference).\n"
        "7. State the next best action using approved terms: approved FAQ, callback task, billing review packet, language access summary, or staff queue.\n"
        "8. Close by confirming the handoff and offering one more chance to ask anything.\n\n"
        "STRICT SAFETY AND DATA BOUNDARIES\n"
        "- Use approved demo facts only. Never invent appointment times, clinic assignments, balances, benefits, diagnoses, tool results, or policy citations.\n"
        "- For demo validation, you may ask for caller name and date of birth.\n"
        "- Never repeat a full date of birth back to the caller. Acknowledge validation with masked language or say validation is complete.\n"
        "- Never ask for or repeat real PHI: real address, member ID, account number, real appointment details, symptoms, medications, or clinical history.\n"
        "- Do not provide clinical advice, diagnosis, medication guidance, fasting determinations, urgency assessment, or financial hardship decisions.\n"
        "- If the caller mentions a clinical emergency, immediately direct them to call 911. For urgent but non-emergency clinical concerns, route to the Northlake Health nurse line and add the request to the action packet.\n"
        "- If the caller asks for clinical, urgent, identity, billing-dispute, hardship, or complex language support, say you will route it to staff.\n"
        "- If asked whether this changed a real appointment or account, say this demo prepares a staff-ready task; it does not modify live systems.\n\n"
        "IN-BOUNDS TOPICS YOU CAN ANSWER FROM APPROVED DATA\n"
        "- Facility name, address, hours, parking, accessibility notes\n"
        "- What to bring, when to arrive, cancellation policy\n"
        "- Telehealth availability and device needs\n"
        "- Northlake MyHealth patient portal capabilities\n"
        "- Payment options at a high level (online, phone with billing, mailed check, payment plan request)\n"
        "- Records requests, prescription refills, test results (route appropriately, do not read results)\n"
        "- Language services and interpreter availability\n"
        "- Callback expectations and SLA\n\n"
        "OUT-OF-BOUNDS TOPICS - ROUTE TO STAFF\n"
        "- Specific clinical guidance (fasting decisions, symptom severity, medication advice)\n"
        "- Real account numbers, real balances, billing disputes, hardship decisions\n"
        "- Identity changes, portal lockouts requiring identity verification\n"
        "- Anything not in the approved demo knowledge pack\n\n"
        "GROUNDING REQUIREMENTS\n"
        "- Use only the approved demo knowledge pack and approved run-of-show below.\n"
        "- If the caller goes off-script with an in-bounds question, answer it warmly and bridge back to the workflow.\n"
        "- If a question is outside the approved pack, say you'll add it to the staff handoff rather than guessing.\n"
        "- Mention 'action packet' when summarizing what staff receive.\n"
        "- Mention 'approved instructions' or 'approved FAQ' for prep/policy questions.\n"
        "- Mention 'staff queue' or 'human handoff' for exceptions.\n\n"
        "SPOKEN STYLE\n"
        "- Keep most responses to 1-2 sentences. A helpful FAQ answer can be up to 3 short sentences.\n"
        "- Use plain language, no markdown, no bullets, no numbered lists.\n"
        "- Avoid saying 'as an AI model.' Say 'I can prepare' or 'I can route.'\n"
        "- Do not over-apologize. Be direct and reassuring.\n"
        "- If uncertain, say what safe next action you can take.\n\n"
        "RESPONSE PATTERNS\n"
        "- Greeting: 'Thanks for calling Northlake Health, this is Riley. How can I help you today?'\n"
        "- Validation: 'For validation, may I have your name and date of birth?'\n"
        "- Validation complete: 'Thanks, validation is complete.'\n"
        "- What to bring: 'Plan to bring a photo ID and your insurance card if you have it, plus any prior records the office requested.'\n"
        "- Arrival: 'Plan to arrive about fifteen minutes early; new-patient visits may need an extra ten.'\n"
        "- Cancellation: 'You can reschedule up to twenty-four hours before without a fee. Inside that window, the team handles it case by case.'\n"
        "- Telehealth: 'Telehealth is available for primary care follow-ups and many specialty consults; new imaging stays in person.'\n"
        "- Portal: 'You can also see upcoming visits and message the care team in Northlake MyHealth.'\n"
        "- Payment plan: 'Payment plans are arranged with the billing team. I can capture that interest in the action packet so they reach out.'\n"
        "- Rescheduling: 'I can prepare a scheduling callback with your visit type, facility, and preferred window.'\n"
        "- Location: 'Northlake Imaging Center is at 1200 Lakeside Medical Parkway, Suite 210. Park in the East Garage and follow signs for Outpatient Imaging on level 2.'\n"
        "- Escalation: 'That should go to a staff member. I will mark the handoff state and include the reason in the action packet.'\n"
        "- Close: 'Anything else I can help with right now? If not, you'll see the callback in your window.'\n\n"
        f"EXEC TALK TRACK TO ALIGN WITH:\n{talk_track}\n\n"
        f"APPROVED DEMO KNOWLEDGE PACK:\n{knowledge_card}\n\n"
        f"APPROVED RUN-OF-SHOW:\n{script_card}\n\n"
        f"CLOSING LINE TO PRESERVE WHEN APPROPRIATE:\n{close}\n\n"
        "BEGIN NOW\n"
        "Start with the warm greeting. Keep the conversation grounded, helpful, and safe."
    ).strip()


def request_ga_realtime_client_secret(cfg, request_body, instructions):
    url = f"{cfg['endpoint']}/openai/v1/realtime/client_secrets"
    session_config = {
        "session": {
            "type": "realtime",
            "model": cfg["deployment"],
            "instructions": instructions,
            "audio": {
                "input": {
                    "transcription": {"model": cfg["transcription_model"]},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                        "create_response": True,
                    },
                },
                "output": {
                    "voice": cfg["voice"],
                },
            },
        }
    }
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
                "protocol": cfg["protocol"],
                "region": cfg["region"],
                "auth": "server-side API key" if cfg["api_key"] else "not configured",
                "supportedRealtimeModels": cfg["supported_models"],
            })
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/realtime/session":
            self._json(404, {"error": "Not found"})
            return

        cfg = realtime_config()
        if not cfg["configured"]:
            self._json(503, {"error": "Realtime service not configured. Add AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_REALTIME_DEPLOYMENT, and AZURE_OPENAI_API_KEY to .env."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            request_body = json.loads(self.rfile.read(length) or b"{}")
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
                calls_url = f"{cfg['endpoint']}/openai/v1/realtime/calls?webrtcfilter=on"
                session_id = data.get("id")

            if not ephemeral_token:
                self._json(502, {"error": "Azure did not return a realtime client secret."})
                return
            self._json(200, {
                "token": ephemeral_token,
                "callsUrl": calls_url,
                "deployment": cfg["deployment"],
                "voice": cfg["voice"],
                "protocol": cfg["protocol"],
                "sessionId": session_id,
                "instructions": instructions,
                "expiresAt": data.get("expires_at") or data.get("expiresAt"),
            })
        except HTTPError as exc:
            self._json(exc.code, self._azure_error(exc))
        except (URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
            self._json(502, {"error": str(exc)})


def generate_conversation_script():
    """Regenerate conversation-script.md from scenarios.js + synthetic-data.js."""
    import subprocess as _sp
    result = _sp.run(
        ["node", str(ROOT / "generate_script.js")],
        capture_output=True,
        text=True,
    )
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
