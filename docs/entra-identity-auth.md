# Moving This Repo from API Keys to Microsoft Entra ID (Identity-Based Auth)

This demo currently runs with server-side API key auth. If your subscription requires identity-based auth (common in enterprise and internal Microsoft-style environments), this is the clean path to move over while keeping the browser experience the same.

## What changes, in plain terms

- **Today**: `server.py` reads `AZURE_OPENAI_API_KEY` and sends `api-key` headers to Azure OpenAI.
- **Target**: `server.py` gets a Microsoft Entra token and sends `Authorization: Bearer <token>` instead.
- **Result**: no long-lived keys in local files, auth is controlled with Azure RBAC and managed identity.

## Current repo behavior (important)

As of now, this repo is implemented for key auth only:

- `realtime_config()` requires `AZURE_OPENAI_API_KEY`.
- `/api/realtime/session` returns 503 unless endpoint + deployment + API key are set.
- Azure OpenAI requests currently send `api-key` headers.

So the migration is a documented implementation path plus rollout recommendations for teams that must use Entra.

## Recommended migration approach

### 1. Prepare Azure resource for Entra auth

1. Use a **custom subdomain endpoint** for your Azure AI/OpenAI resource.
2. Confirm you are not using regional endpoint patterns for Entra auth.
3. Use the endpoint shown on your Azure resource. Depending on how the resource was created, this may look like `https://YOUR-RESOURCE.openai.azure.com` or `https://YOUR-RESOURCE.cognitiveservices.azure.com`.

Microsoft Learn:

- [Custom subdomains requirement](https://learn.microsoft.com/azure/ai-services/cognitive-services-custom-subdomains)
- [AI services authentication overview (Entra + key options)](https://learn.microsoft.com/azure/ai-services/authentication)

### 2. Assign the right RBAC role

At minimum, assign the calling identity one of these roles on the Azure OpenAI resource scope:

- `Cognitive Services OpenAI User` (inference)
- `Cognitive Services OpenAI Contributor` (broader operational scope)

Microsoft Learn:

- [Azure OpenAI RBAC roles](https://learn.microsoft.com/azure/ai-services/openai/how-to/role-based-access-control)
- [Role assignment steps in portal](https://learn.microsoft.com/azure/role-based-access-control/role-assignments-portal)

### 3. Decide identity per environment

- **Local dev**: `DefaultAzureCredential` via `az login` is the fastest path.
- **Azure-hosted runtime**: system-assigned or user-assigned managed identity.

Microsoft Learn:

- [Azure Identity for Python (`DefaultAzureCredential`)](https://learn.microsoft.com/python/api/overview/azure/identity-readme?view=azure-python)
- [Azure OpenAI with managed identity guidance](https://learn.microsoft.com/azure/ai-services/openai/how-to/managed-identity)

### 4. Update this repo's server auth layer

Recommended implementation is to add an auth mode switch in `server.py`, then preserve current key behavior as fallback during rollout.

Suggested env additions:

```bash
# auth mode: key (default) or entra
AZURE_OPENAI_AUTH_MODE=entra

# still required; use the endpoint shown on your Azure resource
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-2
```

Suggested Python dependencies:

```bash
pip install azure-identity
```

Suggested server behavior:

1. If `AZURE_OPENAI_AUTH_MODE=entra`, do not require `AZURE_OPENAI_API_KEY`.
2. Build credential once (for example `DefaultAzureCredential()`).
3. Request access token and send `Authorization: Bearer ...` header.
4. If auth mode is `key`, keep current `api-key` header behavior.

Example pattern for the server-side request to mint the short-lived Realtime client secret:

```python
from azure.identity import DefaultAzureCredential

_credential = DefaultAzureCredential()

def _entra_auth_header():
    token = _credential.get_token("https://cognitiveservices.azure.com/.default")
    return {"Authorization": f"Bearer {token.token}"}
```

Then use that header when `server.py` calls:

- `/openai/v1/realtime/client_secrets`

Do **not** move the long-lived Entra token into the browser. The browser should continue to receive only the short-lived Realtime client secret returned by the server, then use that short-lived token for the `/openai/v1/realtime/calls` SDP exchange.

This repo calls the Azure OpenAI REST endpoint directly, so the expected token audience is `https://cognitiveservices.azure.com/.default`. If you are using a different API surface or Azure cloud, confirm the token audience against the Microsoft Learn page for that API before rollout.

### 5. Lock down key auth after cutover

Once identity-based auth is verified in every environment:

1. Remove `AZURE_OPENAI_API_KEY` from active env configs.
2. Disable local auth on the Azure resource so keys can no longer be used.
3. Keep rollback notes for emergency break-glass only.

Microsoft Learn:

- [Disable local authentication](https://learn.microsoft.com/azure/ai-services/disable-local-auth)

## Rollout and validation checklist

Use this checklist so the cutover is controlled and easy to audit:

1. **Resource endpoint** is custom subdomain and reachable.
2. **Identity** (developer account or managed identity) has correct OpenAI RBAC role.
3. **Server status endpoint** reports configured without API key when in `entra` mode.
4. **Realtime session minting** works in both local and hosted runs.
5. **No secrets drift**: no API keys in deployment settings, pipeline vars, or local `.env` defaults.
6. **Local auth disabled** only after successful end-to-end validation.

## Best spot in this repo

For discoverability, the right placement is:

- Keep this doc in `docs/entra-identity-auth.md` for full implementation guidance.
- Link it from the README "Optional Live Voice Setup" section (where setup decisions happen).
- Keep `SECURITY.md` and `README.md` safety notes pointing to this doc for teams with identity requirements.

That gives new contributors a clear setup fork: key-based quickstart for demos, Entra-based path for enterprise-required environments.
