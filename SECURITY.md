# Security

This repository is a personal demo project.

## Reporting Security Issues

Do not report suspected vulnerabilities through public GitHub issues.

If you discover a security issue in this repository, contact the repository owner privately through GitHub and avoid including secrets, credentials, or any sensitive data in public discussion.

Please include the following information when possible:

- type of issue
- affected file paths
- steps to reproduce the behavior
- impact assessment
- any suggested mitigation

## Supported Scope

This repository is a sample application for demonstration purposes. Security fixes may be accepted at the maintainer's discretion, but there are no guaranteed response times or support commitments for sample-code hardening.

## Local Secrets

Keep Azure OpenAI credentials in a local `.env` file only. `.env` and `.env.*` are ignored by git, and the GitHub Actions workflow blocks tracked environment files other than `.env.example`. The local server uses an explicit static-asset allowlist, so `.env`, repository metadata, server source, and other unlisted paths are not served over HTTP.

The demo scheduling route requires a short-lived opaque capability issued only after the local server validates both active-profile factors for an in-memory Realtime session. This prevents a direct unauthenticated POST from checking or confirming a slot. The values remain public synthetic demo identities, so this capability is a demo safety boundary—not production patient authentication.

Before publishing, sharing, or archiving this project, confirm that `.env` is not included. If a real API key is ever committed, shared, pasted into an issue, or included in an archive, rotate that key immediately in Azure.

If your environment requires Microsoft Entra ID instead of API keys, follow [docs/entra-identity-auth.md](docs/entra-identity-auth.md) and disable local authentication (API key auth) on the Azure AI/OpenAI resource after identity-based auth is validated.

## Production Security Gaps

This demo is not production-hardened. Before adapting the pattern for a patient-facing MVP, add at minimum:

- server-managed WebRTC session lifecycle, user authentication, tool authorization, and session state
- an authenticated deployment gateway, production-grade origin policy, abuse protection, and rate limits
- managed secrets or Microsoft Entra ID, not local `.env` files
- PHI screening/minimization before prompts, logs, transcripts, analytics, or handoffs
- retention, encryption, and access controls for audio, transcripts, action packets, and audit logs
- cache controls that prevent patient-specific data from being stored in browser, CDN, or shared proxy caches
