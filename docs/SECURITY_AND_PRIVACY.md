# Security and privacy

## Current behavior

- Versioned editable document trees and local settings are stored in this browser's IndexedDB and localStorage. The model allow-lists nodes, links, images, table spans and presentation attributes before persistence or export.
- Images inserted from the device are signature-checked and embedded in the local document; they are not uploaded. PNG, JPEG and GIF files are limited to 8 MB each.
- TXT, Markdown and HTML are read in the browser. HTML import is reduced to plain text before display.
- DOCX export is generated entirely in the browser from the open document; there is no upload or external conversion service.
- DOCX import uses a bundled parser in the browser, limits archive and expanded sizes, and sanitizes generated HTML before inserting it into the editor. Links are limited to HTTP, HTTPS and mailto; embedded images are limited to base64 PNG, JPEG, GIF and WebP.
- PDF bytes are held in an object URL only while the PDF is open. The app does not upload documents.
- GitHub Pages has no hosted AI provider or telemetry. The optional private relay keeps provider credentials on the server, requires a separate access token and approved prompt, and limits request size, rate, and duration. The browser does not include open documents or slides in requests.
- The Adigun overview is extractive local processing and is not described as AI output.

## Limits

Browser-local data is subject to browser profile removal, storage limits and the user's device security. This app does not provide account recovery, cross-device sync or server-side backups. DOCX export currently supports a bounded set of text and layout features; it is not a Word fidelity or round-trip claim.

Review the configured provider’s data handling before submitting confidential text. The relay sends approved prompts to its single configured endpoint and does not log or persist them.

