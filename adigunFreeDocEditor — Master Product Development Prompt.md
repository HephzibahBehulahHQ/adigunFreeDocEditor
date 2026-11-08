# MASTER DEVELOPMENT PROMPT
## adigunFreeDocEditor — Free AI-Powered Word & PDF Document Workspace

### 1. ROLE AND MISSION

Act as a principal front-end engineer, senior UI/UX designer, Microsoft Word document-processing specialist, PDF engineer, AI systems architect, accessibility specialist, and production deployment engineer.

Your mission is to design, build, test, and deploy **adigunFreeDocEditor**, a professional, free-to-use, browser-based document editing workspace that combines Word document editing, PDF reading and manipulation, document conversion, translation, and an integrated AI document assistant called **Adigun**.

The finished application must be a genuine working product, not a prototype, static demonstration, simulated editor, or collection of nonfunctional interface components.

**Product name:** adigunFreeDocEditor

**Product repository:**
https://github.com/HephzibahBehulahHQ/adigunFreeDocEditor

**Production domain:**
https://adigunFreeDocEditor.hephzibahbehulah.com/

**Core product promise:**
Create, edit, translate, review, convert, and export professional documents in one secure, accessible workspace.

**Product identity:**
A modern document editor with the familiarity of Microsoft Word, the convenience of a PDF workspace, and the intelligence of an AI assistant operating directly on the document.

---

### 2. GLOBAL BRAND AND TEMPLATE INTEGRATION

Before designing or implementing the application, inspect and integrate the actual reusable design, branding, architectural conventions, and AI governance requirements from the following repositories.

#### Global template repositories

1. Organization website and global template:
   https://github.com/HephzibahBehulahHQ/HephzibahBehulahHQ.github.io

2. Shared design system:
   https://github.com/HephzibahBehulahHQ/hb-design-system

3. AI governance and policy:
   https://github.com/HephzibahBehulahHQ/hb-AI-policy

#### Brand reference repository

4. Brand identity and product reference:
   https://github.com/HephzibahBehulahHQ/hb-trading

#### Product repository

5. adigunFreeDocEditor:
   https://github.com/HephzibahBehulahHQ/adigunFreeDocEditor

#### Mandatory brand ingestion process

- Inspect repository contents, including design tokens, components, fonts, logos, assets, layout templates, theme configuration, documentation, and applicable policies.
- Reuse shared components and existing templates where compatible with the document editor.
- Apply the organization's established visual identity consistently across every screen.
- Preserve the brand's approved typography, color palette, logo usage, spacing, border treatments, navigation patterns, and accessibility requirements.
- Read and implement the relevant AI policy before integrating any AI provider.
- Record the source repository and version or commit used for each shared dependency.
- Avoid copying brand code that creates unnecessary duplication when a maintainable shared dependency is available.

**Precedence:**
Security and accessibility requirements take priority. The shared design system defines common UI rules, the brand repository supplies applicable brand-specific treatments, and the product repository defines document-editor-specific functionality.

If a reference repository is private, unavailable, empty, or returns HTTP 404, report the exact access problem. Do not invent its contents, design tokens, or policies.

Do not silently substitute unrelated branding. Continue only with the verifiable materials that can be used without violating mandatory brand or AI-policy requirements.

**Required output:**
`docs/BRAND_INTEGRATION.md`

Document which templates, components, tokens, and policies were adopted, where they originated, and any unresolved dependencies.

---

### 3. PRODUCT DESIGN DIRECTION

Design a premium, contemporary, 2026-era document workspace characterized by clarity, precision, speed, and professional usability.

The visual direction should feel modern and technologically advanced without sacrificing the familiar interaction patterns users expect from a word processor.

Avoid excessive gradients, decorative glass effects, oversized dashboards, distracting animations, and unnecessary visual complexity.

The document itself must remain the visual priority.

#### 3.1 Workspace architecture

Use a responsive application shell containing:

**Top application bar**
- Product logo and name.
- Document title with rename support.
- Save state and last-saved information.
- Undo and redo.
- Export and download actions.
- Contextual document actions.
- Account controls only if real account functionality exists.

**Formatting ribbon**
- Home, Insert, Layout, Review, and View tools.
- Familiar Microsoft Word-style interaction patterns without copying protected branding.
- Context-aware controls that reflect the current text selection.
- Compact mode for smaller screens.

**Left navigation rail**
- Document outline and headings.
- Page thumbnails where meaningful.
- Search and navigation.
- Recent documents.
- Optional comments and revision navigation.

**Central document canvas**
- Real editable document content.
- Paginated print layout.
- Accurate cursor and selection behavior.
- Visible page boundaries and margins.
- Zoom and fit-to-width controls.
- Document ruler when supported.
- Scroll and page navigation.

**Right Adigun workspace**
- Context-aware document assistance.
- Translation.
- Grammar and rewriting.
- Summarization.
- Document questions.
- Reviewable AI changes.
- Source highlighting and explanations.

The right panel must be collapsible, resizable where practical, and nonintrusive.

#### 3.2 Responsive behavior

Desktop:
Full ribbon, document canvas, left navigation, and optional right AI panel.

Tablet:
Compact toolbar, collapsible navigation, and a single auxiliary panel at a time.

Mobile:
Functional landing page, file opening, document viewing, navigation, and supported download actions. Advanced document editing may be restricted until it can be implemented reliably.

#### 3.3 Accessibility

Target WCAG 2.2 AA.

Implement keyboard navigation, visible focus states, semantic controls, accessible dialogs, screen-reader labels, sufficient contrast, reduced-motion support, and predictable error handling.

---

### 4. REQUIRED PRODUCT SCREENS

#### 4.1 Landing page

Create a polished product entry experience with:

- Clear product branding.
- Primary actions: Create blank document, Open Word document, Open PDF.
- Drag-and-drop file upload.
- File picker.
- Recent documents, populated from genuine locally saved data.
- Privacy explanation.
- Supported formats.
- Responsive layout.

Use concise product copy such as:

**Your documents. Your workspace. Powered by Adigun.**

Do not display fake recent files or misleading claims about security, AI availability, or conversion capabilities.

#### 4.2 Document workspace

Build a professional word-processing environment that supports real content editing.

The interface must display the current document rather than an HTML imitation of a screenshot.

#### 4.3 Document conversion workspace

Provide a clear conversion workflow with source format, target format, progress, warnings, result preview when available, and a real downloadable output.

#### 4.4 Review workspace

Display proposed changes, comments, author attribution where supported, and accept/reject controls anchored to their corresponding document locations.

#### 4.5 Settings and preferences

Provide functional controls for supported theme settings, language, document defaults, privacy preferences, autosave, and AI consent.

Do not expose settings that cannot be persisted or applied.

---

### 5. MICROSOFT WORD DOCUMENT ENGINE

Microsoft Word compatibility is a central product requirement.

Support DOCX as the primary editable Word format.

#### 5.1 Essential editing features

Implement:

- Create, open, save, and rename documents.
- Insert, delete, select, copy, cut, and paste text.
- Undo and redo.
- Bold, italic, underline, strikethrough.
- Font family and font size.
- Text and highlight colors.
- Paragraph alignment.
- Line spacing.
- Paragraph spacing.
- Indentation.
- Bulleted and numbered lists.
- Heading styles.
- Page breaks.
- Hyperlinks.
- Tables and table editing.
- Images and image positioning.
- Headers and footers.
- Page numbering.
- Page size, orientation, and margins.
- Find and replace.
- Word count and character count.
- Spellcheck where supported.
- Keyboard shortcuts.
- Print layout.

Implement these using a structured document model rather than direct manipulation of arbitrary HTML.

#### 5.2 DOCX compatibility

Preserve supported WordprocessingML structures, styles, numbering, tables, images, hyperlinks, page settings, and document metadata.

Do not claim perfect Microsoft Word compatibility unless verified against a representative test corpus.

Where unsupported DOCX features are encountered, preserve their underlying data when feasible and warn before an operation that could cause irreversible loss.

Evaluate suitable document editing frameworks, DOCX parsers, renderers, and serialization libraries based on actual compatibility tests, maintenance status, licensing, and integration cost.

#### 5.3 Track changes

Support insertions, deletions, review status, and accept/reject actions.

For native Microsoft Word interoperability, implement and test the corresponding OOXML revision structures rather than relying solely on colored HTML.

Preserve pending revisions during DOCX export where supported.

Rejected changes must not appear in the final accepted document.

#### 5.4 Persistence

Use reliable local persistence such as IndexedDB for document content and metadata.

Avoid relying on localStorage for large document files.

Provide autosave, explicit save status, recovery behavior, and safeguards against data loss.

---

### 6. PDF ENGINE AND CONVERSION

PDF functionality must be technically honest.

PDF is primarily a fixed-layout document format. Editing existing PDF text with the same fidelity as Word is not universally possible.

Separate these capabilities:

1. PDF viewing and text selection.
2. PDF annotation and form editing.
3. PDF page manipulation.
4. PDF text extraction.
5. PDF-to-editable-document reconstruction.

#### 6.1 PDF features

Support:

- Open and render real PDFs.
- Search and select text when a text layer exists.
- Zoom and page navigation.
- Rotate pages.
- Reorder pages.
- Delete and extract pages.
- Merge PDFs.
- Add supported annotations.
- Fill supported PDF forms.
- Export modified PDFs.
- Extract text.
- Identify scanned or image-only pages.

Implement OCR only through a real supported engine and clearly communicate its accuracy limitations.

#### 6.2 Required conversions

Implement and test:

- DOCX to PDF.
- PDF to DOCX.
- DOCX to Markdown.
- Markdown to DOCX.
- Markdown to PDF.
- PDF to Markdown.
- PDF to plain text.
- Plain text to DOCX.
- Plain text to PDF.

Preserve layout and semantic structure to the extent technically achievable.

For PDF-to-DOCX, disclose when reconstructed text, tables, or formatting may differ from the source.

#### 6.3 Conversion integrity

Every conversion must produce a genuine output file.

Validate that exported files open successfully in compatible readers and editors.

Check document content, formatting, page count where relevant, embedded images, tables, hyperlinks, and Unicode text.

Do not use fake progress bars or fabricated conversion success messages.

#### 6.4 Licensing

Evaluate dependencies such as PDF.js, pdf-lib, MuPDF, DOCX libraries, and document rendering engines for functionality, maintenance, license obligations, and commercial compatibility.

Do not introduce AGPL or other reciprocal-license dependencies without documenting and satisfying their requirements.

---

### 7. ADIGUN — IN-DOCUMENT AI ASSISTANT

Adigun is an integrated document collaborator, not a generic chatbot attached to the editor.

Its primary interaction surface is the document itself.

#### 7.1 Core capabilities

**Translate**
Translate selected text, paragraphs, sections, or complete documents using supported language pairs.

**Rewrite**
Improve grammar, clarity, conciseness, professionalism, tone, and readability.

**Summarize**
Summarize a selection, page, section, or complete document.

**Document questions**
Answer questions grounded in document content and identify supporting passages.

**Structural editing**
Convert selected text into headings, lists, tables where feasible, or other supported structures.

**Review**
Suggest improvements without silently replacing user content.

#### 7.2 Mandatory AI interaction model

Every AI modification must follow this sequence:

1. User selects content or specifies a document scope.
2. Adigun receives only the data necessary for the requested operation.
3. The system produces a proposed change.
4. The proposal appears in context.
5. The user reviews the original and proposed content.
6. The user accepts or rejects the change.
7. Accepted changes update the document and undo history.

No AI operation may silently overwrite the original document.

#### 7.3 Grounded answers

When answering document questions, reference the relevant paragraph, heading, page, or selection where possible.

If evidence is missing, state that the document does not establish the answer.

Do not fabricate quotations or source locations.

#### 7.4 Model architecture

Use a configurable model-routing layer for translation, rewriting, summarization, and document Q&A.

Keep provider credentials server-side.

Apply rate limiting, request validation, appropriate file-size restrictions, and abuse protection.

Document model choices and tradeoffs in:

`docs/MODEL_ROUTING.md`

#### 7.5 Privacy and consent

Follow the actual requirements from `hb-AI-policy`.

Before sending document content to an external AI provider, clearly disclose the operation and obtain appropriate consent.

Prefer local processing where practical.

Never claim that documents remain entirely on-device when an operation sends their contents to a server or third-party model.

---

### 8. TECHNICAL ARCHITECTURE

Inspect the existing product repository before selecting or replacing any technology.

Prefer a maintainable TypeScript-based front end with a component architecture suitable for complex editing interactions.

Evaluate React and a structured editor framework such as ProseMirror or Tiptap, subject to licensing and compatibility requirements.

Use the shared HB design system as the primary source for UI components and tokens.

Recommended architectural boundaries:

- Application shell and routing.
- Shared design system integration.
- Document editor core.
- DOCX import/export.
- PDF viewing and manipulation.
- Conversion services.
- Adigun AI operations.
- Review and revision management.
- Local document storage.
- Settings and preferences.
- Security and consent.
- Automated tests.

Do not force every feature into a single component or tightly couple AI services to the document rendering layer.

Use explicit interfaces and predictable error handling.

---

### 9. FRONT-END-FIRST DELIVERY PLAN

#### Phase 0 — Repository and brand discovery

Inspect all source repositories.

Identify reusable assets, existing project structure, security constraints, deployment configuration, and design dependencies.

Record access limitations and resolve mandatory blockers before claiming brand compliance.

#### Phase 1 — Fully functional front-end foundation

Build the landing page, workspace shell, navigation, responsive layout, functional document creation, local file upload, real basic editing, save state, and supported document viewing.

Integrate verified brand components.

No simulated AI results or fake document conversions.

Deploy the working foundation for review.

#### Phase 2 — Professional document editing

Complete DOCX import/export, formatting, tables, images, page layout, document persistence, undo/redo, and revision management.

#### Phase 3 — PDF and conversion services

Implement actual PDF rendering, annotation, supported page operations, extraction, and conversion pipelines.

#### Phase 4 — Adigun AI integration

Implement real model connections, consent, grounded document actions, tracked proposals, and review controls.

#### Phase 5 — Production hardening

Complete accessibility, performance optimization, security testing, browser testing, conversion fidelity testing, deployment verification, and documentation.

Proceed through phases without repeatedly requesting permission for routine authorized development work.

Do not bypass explicitly required human approvals, security controls, or deployment permissions.

---

### 10. REQUIRED REPOSITORY DELIVERABLES

Maintain a clear project structure, adapting to existing conventions where appropriate.

Suggested deliverables:

- `README.md` — product overview, installation, build, testing, and deployment.
- `docs/PRODUCT_BUILD_PROMPT.md` — this specification.
- `docs/BRAND_INTEGRATION.md` — verified shared template integration.
- `docs/ARCHITECTURE.md` — technical architecture.
- `docs/MODEL_ROUTING.md` — AI model routing.
- `docs/FEATURE_MATRIX.md` — implemented, tested, and unsupported features.
- `docs/SECURITY_AND_PRIVACY.md` — privacy and security decisions.
- `docs/mockups/` — approved visual interface concepts.
- `src/` or `frontend/` — application source.
- `tests/` — automated quality checks.
- `.github/workflows/` — continuous integration and deployment.

Avoid unnecessary restructuring of an existing working repository.

---

### 11. TESTING AND QUALITY GATES

A feature is complete only when its actual behavior is verified.

#### Front-end tests

- Application loads without a blank screen.
- Navigation works.
- Document creation works.
- Upload accepts valid files.
- Invalid files produce useful errors.
- Formatting controls update real document content.
- Keyboard interactions work.
- Autosave and recovery work.
- Responsive layouts remain usable.
- Accessibility checks pass.

#### Document tests

- Open real DOCX documents.
- Edit and export without losing supported content.
- Preserve tables, images, headings, and Unicode.
- Verify undo and redo.
- Test tracked-change acceptance and rejection.
- Reopen exported documents.
- Compare important document structures before and after conversion.

#### PDF tests

- Open multipage PDFs.
- Render actual page contents.
- Extract selectable text.
- Detect image-only pages.
- Verify annotations and page operations.
- Reopen exported PDFs.
- Validate conversion outputs.

#### AI tests

- Real requests return actual provider or local-model results.
- AI changes remain proposals until accepted.
- Rejected changes do not modify document content.
- Source references identify the correct passages.
- Consent controls prevent unauthorized transmission.
- API credentials are absent from browser bundles.

#### Deployment tests

- Production build succeeds.
- Browser tests pass.
- Custom domain resolves correctly.
- HTTPS certificate is valid.
- JavaScript and CSS assets load successfully.
- The application root renders meaningful content.
- No fatal browser console errors occur.
- Critical document workflows pass on the deployed version.

Never report deployment as successful based only on an HTTP 200 response.

---

### 12. DEPLOYMENT REQUIREMENTS

Deploy the application to:

https://adigunFreeDocEditor.hephzibahbehulah.com/

Inspect the repository's existing hosting and deployment configuration.

If GitHub Pages is used, ensure that the production asset base matches the custom domain.

Do not assume GitHub Pages can execute server-side AI proxies or document conversion services. Deploy such services to compatible infrastructure and configure the front end securely.

Use environment variables and managed secrets for sensitive configuration.

Keep builds reproducible and deployment workflows documented.

---

### 13. NON-NEGOTIABLE ENGINEERING RULES

1. No fake AI responses.
2. No simulated document conversions.
3. No hardcoded document screenshots masquerading as editors.
4. No dead buttons.
5. No unverified claims of Microsoft Word fidelity.
6. No invented brand tokens or AI policies.
7. No exposed AI API keys.
8. No silent AI document modifications.
9. No destructive conversions without appropriate warnings.
10. No production release without passing required checks.
11. No bypassing failing tests merely to obtain a green build.
12. No claim that a feature is complete without evidence.
13. No unnecessary rewriting of existing functional code.
14. No repeated dumping of repository contents or lengthy logs.
15. No fabricated deployment, test, or implementation results.

---

### 14. TOKEN DISCIPLINE AND PROGRESS REPORTING

Minimize unnecessary token consumption and redundant tool calls.

Do not repeat the full specification, repository history, or unchanged source files in progress reports.

Read only relevant files, reuse verified findings, and show only changed code when necessary.

Use the following concise reporting structure:

**STATUS**

**Done:** Actual files changed, commits created, features implemented, or deployments completed.

**Tested:** Checks that passed or failed, with relevant evidence.

**BLOCKED:** Specific unresolved dependencies or failures.

**ESTIMATED FINISH TIME:** Realistic remaining work estimate, or state that it cannot yet be determined.

**ETA:** Estimated completion date/time when justified.

**Next:** The next concrete action.

Never claim that a change was committed, merged, tested, or deployed unless the operation actually succeeded.

---

### 15. FINAL ACCEPTANCE CRITERIA

The product is ready for production only when:

- It uses the verified applicable HB global and brand templates.
- The front end is polished, responsive, and accessible.
- Real Word documents can be created, edited, saved, and exported.
- Real PDFs can be opened and manipulated within the supported feature set.
- Document conversions generate valid files.
- Adigun performs genuine AI operations with appropriate consent.
- AI modifications are reviewable and reversible.
- User documents are protected according to the applicable privacy policy.
- Automated tests pass.
- The deployed application works at its configured custom domain.
- Documentation accurately describes supported capabilities and limitations.

### FINAL EXECUTION DIRECTIVE

Begin by inspecting the product repository and all specified global and brand repositories.

Reuse the verified shared templates and policies rather than inventing replacements.

Implement the front-end foundation first, then deliver genuine document functionality, conversion services, and Adigun AI capabilities in tested stages.

Prioritize document fidelity, user trust, visual consistency, and reliable production behavior.

**Build a real professional document workspace—not a mockup presented as a finished product.**
