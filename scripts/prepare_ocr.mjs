import { copyFile, mkdir, readdir } from "node:fs/promises";

const destination = "assets/vendor/ocr";
await mkdir(destination, { recursive: true });
const tesseract = "node_modules/tesseract.js/dist";
const core = "node_modules/tesseract.js-core";
for (const name of ["tesseract.min.js", "tesseract.min.js.LICENSE.txt", "worker.min.js", "worker.min.js.LICENSE.txt"]) {
  await copyFile(`${tesseract}/${name}`, `${destination}/${name}`);
}
for (const name of await readdir(core)) {
  if (/lstm\.wasm(?:\.js)?$/.test(name)) await copyFile(`${core}/${name}`, `${destination}/${name}`);
}
await copyFile(`${core}/LICENSE`, `${destination}/LICENSE`);
await copyFile("node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", `${destination}/eng.traineddata.gz`);
