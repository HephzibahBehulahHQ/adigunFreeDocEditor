import base64
from pathlib import Path

vendor = Path("assets/vendor")
parts_dir = vendor / "pdfjs-chunks"

for asset in ("pdf.min.js", "pdf.worker.min.js"):
    chunks = sorted(parts_dir.glob(asset + ".part-*.b64"))
    if not chunks:
        raise SystemExit(f"Missing PDF.js source chunks for {asset}")
    encoded = "".join(chunk.read_text(encoding="ascii").strip() for chunk in chunks)
    (vendor / asset).write_bytes(base64.b64decode(encoded, validate=True))

