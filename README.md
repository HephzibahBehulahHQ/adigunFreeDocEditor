# Model Routing and AI Handling

## Current position

This foundation release does not connect to an external AI provider. The repository has no approved runtime credentials or server-side AI routing layer configured.

## Local assistive model behavior

The Adigun panel performs local, transparent document operations on the current selection:

- Summary generation
- Light rewrite of selected text
- Basic local translation pass for a small language set

These actions are processed in the browser and are clearly disclosed in the product UI.

## Security and consent posture

The product follows the shared HB-AI-policy principle: do not send sensitive content to a provider without explicit consent and a clear disclosure mechanism. In this foundation state, no remote call is made.

## Future provider-ready design

A production-ready extension would add a server-side model router with:

- Request validation
- Request rate limiting
- Redaction or minimization of document context
- Consent gating before sensitive content is transmitted
- Logging and auditability for model calls
