#!/usr/bin/env python3
"""Local demo server with an optional Entra-authenticated Azure Foundry proxy.

Environment variables:
  FOUNDRY_ENDPOINT     Example: https://my-resource.openai.azure.com
  FOUNDRY_DEPLOYMENT   Example: gpt-4.1 or model-router-demo
  FOUNDRY_API_VERSION  Optional, defaults to 2025-01-01-preview
  FOUNDRY_CHAT_URL     Optional full chat completions URL override
  AZURE_TENANT_ID      Optional tenant for az account get-access-token
  FOUNDRY_ACCESS_TOKEN Optional pre-fetched Entra token override
  PORT                 Optional, defaults to 8787
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
TOKEN_CACHE = {"token": "", "expires_at": 0}


def foundry_config():
    endpoint = os.environ.get("FOUNDRY_ENDPOINT", "").rstrip("/")
    deployment = os.environ.get("FOUNDRY_DEPLOYMENT", "")
    api_version = os.environ.get("FOUNDRY_API_VERSION", "2025-01-01-preview")
    chat_url = os.environ.get("FOUNDRY_CHAT_URL", "")
    tenant_id = os.environ.get("AZURE_TENANT_ID", "")
    access_token = os.environ.get("FOUNDRY_ACCESS_TOKEN", "")
    configured = bool(chat_url or (endpoint and deployment))
    return {
        "endpoint": endpoint,
        "deployment": deployment,
        "api_version": api_version,
        "chat_url": chat_url,
        "tenant_id": tenant_id,
        "access_token": access_token,
        "configured": configured,
    }


def get_entra_token(cfg):
    if cfg["access_token"]:
        return cfg["access_token"]

    now = int(time.time())
    if TOKEN_CACHE["token"] and TOKEN_CACHE["expires_at"] - 120 > now:
        return TOKEN_CACHE["token"]

    command = [
        "az",
        "account",
        "get-access-token",
        "--resource",
        "https://cognitiveservices.azure.com/",
        "--output",
        "json",
    ]
    if cfg["tenant_id"]:
        command.extend(["--tenant", cfg["tenant_id"]])

    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    except FileNotFoundError as exc:
        raise RuntimeError("Azure CLI is required for Entra auth. Install az or set FOUNDRY_ACCESS_TOKEN.") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise RuntimeError(f"Azure CLI token request failed: {detail}") from exc

    data = json.loads(result.stdout)
    TOKEN_CACHE["token"] = data["accessToken"]
    TOKEN_CACHE["expires_at"] = data.get("expiresOnTimestamp", now + 3000)
    return TOKEN_CACHE["token"]


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

    def do_GET(self):
        if self.path == "/api/foundry/status":
          cfg = foundry_config()
          self._json(200, {
              "configured": cfg["configured"],
              "deployment": cfg["deployment"] or "custom chat URL",
              "apiVersion": cfg["api_version"],
              "auth": "Entra ID via Azure CLI" if not cfg["access_token"] else "Entra ID via FOUNDRY_ACCESS_TOKEN",
          })
          return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/foundry/chat":
            self._json(404, {"error": "Not found"})
            return

        cfg = foundry_config()
        if not cfg["configured"]:
            self._json(503, {"error": "Foundry proxy not configured"})
            return

        try:
            token = get_entra_token(cfg)
        except RuntimeError as exc:
            self._json(503, {"error": str(exc)})
            return

        length = int(self.headers.get("Content-Length", "0"))
        request_body = json.loads(self.rfile.read(length) or b"{}")
        system_prompt = request_body.get("systemPrompt", "")
        patient_context = request_body.get("patientContext", "")
        requested_beat = request_body.get("requestedBeat", "")
        fallback = request_body.get("fallback", "")

        prompt = (
            "Create one concise spoken response for a 90-second executive screen-recording demo.\n"
            "Keep it under 38 words. Do not request PHI. Do not provide clinical advice.\n\n"
            f"Scenario: {request_body.get('scenario', 'Patient access')}\n"
            f"Beat: {requested_beat}\n"
            f"Transcript so far:\n{patient_context}\n\n"
            f"Fallback response style:\n{fallback}"
        )

        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
            "max_tokens": 120,
        }

        if cfg["chat_url"]:
            url = cfg["chat_url"]
        else:
            deployment = quote(cfg["deployment"], safe="")
            url = (
                f"{cfg['endpoint']}/openai/deployments/{deployment}/chat/completions"
                f"?api-version={cfg['api_version']}"
            )

        req = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )

        try:
            with urlopen(req, timeout=30) as response:
                data = json.loads(response.read())
            reply = data["choices"][0]["message"]["content"].strip()
            self._json(200, {"reply": reply, "modelResponse": data.get("model")})
        except HTTPError as exc:
            self._json(exc.code, {"error": exc.read().decode("utf-8", errors="replace")})
        except (URLError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
            self._json(502, {"error": str(exc)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), DemoHandler)
    print(f"Voice Agent demo running at http://127.0.0.1:{port}")
    print("Foundry proxy:", "configured for Entra auth" if foundry_config()["configured"] else "not configured")
    server.serve_forever()
