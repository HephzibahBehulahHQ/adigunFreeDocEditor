import { copyFileSync } from "node:fs";

copyFileSync("node_modules/pdf-lib/dist/pdf-lib.min.js", "assets/vendor/pdf-lib.min.js");
copyFileSync("node_modules/pdf-lib/LICENSE.md", "assets/vendor/PDF-LIB-LICENSE.md");
