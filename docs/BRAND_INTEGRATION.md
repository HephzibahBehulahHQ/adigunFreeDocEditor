* {
  box-sizing: border-box;
}

:root {
  color-scheme: light;
  --navy: #0b1220;
  --navy-soft: #16233b;
  --blue: #2563eb;
  --gold: #d4af37;
  --ivory: #f8fafc;
  --slate: #64748b;
  --panel: #ffffff;
  --panel-alt: #eef4ff;
  --border: rgba(15, 23, 42, 0.12);
  --shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
  font-family: Inter, "Segoe UI", sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: var(--navy);
  background: linear-gradient(180deg, #f8fafc 0%, #edf3ff 100%);
}

html, body, #root {
  margin: 0;
  min-height: 100%;
  min-height: 100vh;
}

body {
  background: var(--navy);
}

button, input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  background: #eef3fb;
}

.landing-page {
  min-height: 100vh;
  background: radial-gradient(circle at top left, rgba(37, 99, 235, 0.14), transparent 20%), var(--navy);
  color: var(--ivory);
  padding: 32px 24px 48px;
}

.landing-header,
.topbar {
  max-width: 1440px;
  margin: 0 auto;
}

.landing-header {
  display: flex;
  justify-content: flex-start;
  padding: 8px 0 16px;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--navy);
  background: linear-gradient(135deg, var(--gold), #f9d979);
  font-weight: 800;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(248, 250, 252, 0.7);
}

.eyebrow.accent {
  color: #d4af37;
}

.hero-section {
  max-width: 1440px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr 0.8fr;
  gap: 28px;
  align-items: center;
  min-height: calc(100vh - 120px);
}

.hero-copy {
  padding-right: 24px;
}

.hero-copy h1 {
  font-size: clamp(2.5rem, 5vw, 4rem);
  margin: 16px 0;
  line-height: 1.08;
  letter-spacing: -0.05em;
}

.hero-copy p {
  font-size: 1.08rem;
  max-width: 620px;
  color: rgba(248, 250, 252, 0.82);
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 28px;
}

.primary-button,
.secondary-button,
.topbar-actions button,
.toolbar button,
.left-rail button,
.assistant-controls button,
.mini-doc,
.file-upload-button {
  border: 1px solid transparent;
  border-radius: 10px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.primary-button,
.secondary-button {
  padding: 0.9rem 1.4rem;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-button {
  background: linear-gradient(135deg, var(--gold), #f0c94c);
  color: var(--navy);
  font-weight: 700;
  box-shadow: 0 8px 24px rgba(212, 175, 55, 0.35);
}

.secondary-button {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ivory);
  border-color: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.secondary-button input,
.file-upload-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 32px;
}

.feature-grid > div {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-grid strong {
  color: var(--ivory);
}

.feature-grid span {
  color: rgba(248, 250, 252, 0.7);
}

.hero-panel {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 18px;
  backdrop-filter: blur(10px);
}

.panel-section {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 18px;
}

.panel-section h3 {
  margin: 0 0 12px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(248, 250, 252, 0.7);
}

.recent-card,
.mini-doc {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: var(--ivory);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 4px;
  margin-bottom: 10px;
}

.recent-card span,
.mini-doc small {
  color: rgba(248, 250, 252, 0.7);
  font-size: 0.8rem;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px 8px;
  color: var(--navy);
}

.topbar .brand-group {
  color: var(--navy);
}

.topbar .brand-group .eyebrow {
  color: var(--slate);
}

.title-editor {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 220px;
}

.title-label {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--slate);
}

.doc-title-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--navy);
  outline: none;
}

.topbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.topbar-actions button,
.toolbar button,
.left-rail button,
.assistant-controls button,
.file-upload-button {
  background: rgba(255, 255, 255, 0.9);
  color: var(--navy);
  border-color: var(--border);
  padding: 0.8rem 0.95rem;
  min-height: 40px;
}

.workspace-layout {
  max-width: 1440px;
  margin: 0 auto;
  padding: 18px 20px 36px;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 280px;
  gap: 18px;
  min-height: calc(100vh - 118px);
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.left-rail .panel-section,
.right-rail .panel-section {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 18px 14px;
  box-shadow: var(--shadow);
}

.left-rail h3,
.right-rail h3 {
  margin: 0 0 12px;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--slate);
}

.mini-doc {
  background: #f8fafc;
  color: var(--navy);
  border-color: var(--border);
}

.mini-doc.active {
  background: #e8f0ff;
  border-color: rgba(37, 99, 235, 0.28);
}

.file-upload-button {
  position: relative;
  display: inline-flex;
  width: 100%;
  justify-content: center;
  align-items: center;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: #f8fafc;
}

.toolbar button {
  background: transparent;
  border-color: var(--border);
}

.underline {
  text-decoration: underline;
}

.editor-surface {
  flex: 1;
  min-height: 620px;
  padding: 28px 32px 42px;
  outline: none;
  line-height: 1.7;
  font-size: 1.03rem;
  background: #fff;
}

.editor-surface h1,
.editor-surface h2,
.editor-surface h3,
.editor-surface p,
.editor-surface ul,
.editor-surface ol,
.editor-surface blockquote {
  margin-top: 0;
  margin-bottom: 14px;
}

.editor-surface h2 {
  font-size: 1.7rem;
  color: var(--navy);
}

.editor-surface p {
  color: rgba(11, 18, 32, 0.9);
}

.assistant-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.assistant-controls button {
  background: #f8fafc;
  color: var(--navy);
  border-color: var(--border);
}

.assistant-controls button.active {
  background: #dfeeff;
  border-color: rgba(37, 99, 235, 0.28);
}

.status-copy {
  color: var(--slate);
  margin: 14px 0 16px;
}

.metrics-panel {
  color: var(--navy);
}

.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.metric-row:last-child {
  border-bottom: none;
}

.empty-state {
  color: var(--slate);
}

@media (max-width: 1080px) {
  .workspace-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .right-rail {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .landing-page {
    padding-left: 18px;
    padding-right: 18px;
  }

  .hero-section {
    grid-template-columns: 1fr;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .workspace-layout {
    grid-template-columns: 1fr;
  }

  .topbar {
    flex-wrap: wrap;
    justify-content: center;
  }

  .title-editor {
    width: 100%;
  }

  .editor-surface {
    min-height: 480px;
    padding: 18px 20px 26px;
  }
}
