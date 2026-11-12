# Brand integration

This first interface slice follows the verified Hephzibah Behulah references below. Source commit IDs are recorded so the adopted material can be checked later.

| Source | Version inspected | Use in this product |
|---|---|---|
| [Corporate website](https://github.com/HephzibahBehulahHQ/HephzibahBehulahHQ.github.io) | `bd116504412b37105166805018f64a6e7bbe3cde` | Product code and deployment stay in this repository; corporate website is the public company gateway. |
| [HB design system](https://github.com/HephzibahBehulahHQ/hb-design-system) | `6311fe56be14eec01e1c96e64dc5d6ce7ca41f28` | Corporate navy `#0B1220`, gold `#D4AF37`, AI division accent `#A78BFA`; official artwork and Adigun BOT floating-window behavior. |
| [HB AI policy](https://github.com/HephzibahBehulahHQ/hb-AI-policy) | v2.0, `d42d4e04ac6ab77ebafa1d4fccb724a4dde8d02e` | Data stays in the browser in this slice. No provider calls, AI claims, cloud persistence or secrets are present. |
| [HB Trading](https://github.com/HephzibahBehulahHQ/hb-trading) | `65b28cfc20925494b056321d57955e304eb09ac7` | Reviewed as the supplied product-brand reference. It is a trading-division identity, so its trading-specific styling is not applied to this document product. |

## Adopted assets and behavior

- `assets/hb-official.jpg` is the design system's supplied `assets/corporate/hephzibah-behulah-official.jpg`, copied without editing. The design system's asset README identifies it as official corporate artwork and prohibits replacing it with generated artwork.
- The workspace uses the official navy, gold and HB Artificial Intelligence violet token. Other layout colors are neutral interface surfaces.
- The Adigun panel is non-modal, can be moved, resized, minimized and closed, and keeps its last position locally. Its live functions are local document statistics and a clearly labelled extractive overview.
- The supplied product mockup informs the workspace layout. Unsupported translation, conversion, DOCX and hosted AI controls are not represented as active.

## Open dependency

The shared repository provides a wide corporate banner, not a compact standalone wordmark. The application uses the exact supplied image without cropping or recreating a mark. A compact approved product logo was not available in the inspected design-system asset directory.
