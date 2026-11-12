# Security and privacy

## Current behavior

- Editable document content and local settings are stored in this browser's IndexedDB and localStorage.
- TXT, Markdown and HTML are read in the browser. HTML import is reduced to plain text before display.
- PDF bytes are held in an object URL only while the PDF is open. The app does not upload documents.
- No account, server endpoint, telemetry pipeline or AI provider is configured.
- The Adigun overview is extractive local processing and is not described as AI output.

## Limits

Browser-local data is subject to browser profile removal, storage limits and the user's device security. This app does not provide account recovery, cross-device sync or server-side backups. The local editing surface is not a DOCX fidelity claim.

Before connecting an external AI provider, implement the applicable HB AI policy, a server-side credential boundary, explicit disclosure and consent, request validation and rate limits. Do not send document text until the user approves that operation.
