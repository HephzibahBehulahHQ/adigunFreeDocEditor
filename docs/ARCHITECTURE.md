# Brand Integration

This project adopts the verified Hephzibah Behulah global brand rules and AI governance requirements, as observed from the authoritative repositories below.

## Verified sources used

- Corporate website and organization identity: https://github.com/HephzibahBehulahHQ/HephzibahBehulahHQ.github.io
  - Repo README verified at commit `bd116504412b37105166805018f64a6e7bbe3cde`
  - Corporate values and design language documented there support a professional corporate identity with a navy/gold/blue palette.

- Shared design system: https://github.com/HephzibahBehulahHQ/hb-design-system
  - Verified design tokens at `tokens/corporate.json` and `tokens/brands.json`
  - Commit used: `52f01f9986d97088413ca9785bc7a2d3f2967123`
  - Corporate colors adopted: Midnight Navy `#0B1220`, Royal Blue `#2563EB`, Metallic Gold `#D4AF37`, Ivory `#F8FAFC`.

- Shared Adigun BOT component guidance: https://github.com/HephzibahBehulahHQ/hb-design-system/tree/main/components/AdigunBot
  - Verified standard: floating non-modal AI copilot, with emphasis on privacy, accessibility, and proper user control.
  - This product adopts the general structure and user principles without importing the unimplemented AI product code.

- AI governance policy: https://github.com/HephzibahBehulahHQ/hb-AI-policy
  - Governance and security policy verified at commit `d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e`
  - Product work follows bounded execution, privacy-by-default handling, and truthful reporting.

- Brand reference repo: https://github.com/HephzibahBehulahHQ/hb-trading
  - Verified at commit `65b28cfc20925494b056321d57955e304eb09ac7`
  - Used as a brand reference for tone and product-organizational consistency.

## Applied design decisions

- Primary palette: midnight navy, royal blue, metallic gold, and ivory from the verified tokens.
- Product naming and layout: `adigunFreeDocEditor` follows the established corporate naming pattern and product style while staying specific to the document workspace.
- Interface treatment: responsive, sober, professional, with clear document-first focus rather than decorative glassmorphism.
- Adigun panel: implemented as a document-side assistant panel, not a blocking modal, consistent with the shared floating-panel standard.

## Unresolved dependencies and constraints

- The official corporate logo asset is not yet present in this product repo and is intentionally not generated or substituted. The design system explicitly says the exact approved artwork should be used as supplied.
- No external AI provider is wired in this foundation release. As a result, the AI assistant is currently a local, document-centric helper that performs transparent in-browser text actions instead of claiming remote model connectivity.
- Full Microsoft Word and PDF fidelity is not claimed in this initial foundation; the app implements a real document editor foundation, document import/export, and honest local assistance.

## Source-of-truth summary

| Shared dependency | Origin | Verified commit / ref |
| --- | --- | --- |
| Corporate identity | HephzibahBehulahHQ.github.io | `bd116504412b37105166805018f64a6e7bbe3cde` |
| Design tokens | hb-design-system | `52f01f9986d97088413ca9785bc7a2d3f2967123` |
| AI policy | hb-AI-policy | `d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e` |
| Product reference | hb-trading | `65b28cfc20925494b056321d57955e304eb09ac7` |

This document reflects only the verified, accessible materials available at the time of implementation.
