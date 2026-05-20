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

Keep Azure OpenAI credentials in a local `.env` file only. `.env` and `.env.*` are ignored by git, and the GitHub Actions workflow blocks tracked environment files other than `.env.example`.

Before publishing, sharing, or archiving this project, confirm that `.env` is not included. If a real API key is ever committed, shared, pasted into an issue, or included in an archive, rotate that key immediately in Azure.

## Production Security Gaps

This demo is not production-hardened. Before adapting the pattern for a patient-facing MVP, add at minimum:

- server-managed WebRTC session lifecycle, tool authorization, and session state
- strict CORS, CSP, origin checks, and rate limits
- managed secrets, not local `.env` files
- PHI screening/minimization before prompts, logs, transcripts, analytics, or handoffs
- retention, encryption, and access controls for audio, transcripts, action packets, and audit logs
- cache controls that prevent patient-specific data from being stored in browser, CDN, or shared proxy caches
