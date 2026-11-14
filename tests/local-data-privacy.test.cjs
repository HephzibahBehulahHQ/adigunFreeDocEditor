const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = source.indexOf("  function clearLocalDocumentStore(");
const end = source.indexOf("  function refreshLocalDataCount(", start);
assert.ok(start >= 0 && end > start);

function makeClear(database) {
  return new Function("database", `${source.slice(start, end)}\nreturn clearLocalDocumentStore;`)(database);
}

async function run() {
  let cleared = 0;
  let transaction;
  const store = {
    transaction(name, mode) {
      assert.equal(name, "documents");
      assert.equal(mode, "readwrite");
      transaction = {
        objectStore(storeName) {
          assert.equal(storeName, "documents");
          return { clear() { cleared += 1; } };
        },
      };
      return transaction;
    },
  };

  const clear = makeClear(store);
  const success = clear();
  assert.equal(cleared, 1, "clears the IndexedDB documents object store");
  transaction.oncomplete();
  await success;

  const failure = new Error("storage unavailable");
  const failedStore = { transaction() { return { objectStore() { return { clear() {} }; }, error: failure }; } };
  const failedTransaction = failedStore.transaction();
  const failedClear = makeClear({ transaction() { return failedTransaction; } })();
  failedTransaction.onerror();
  await assert.rejects(failedClear, /storage unavailable/);
  await assert.rejects(makeClear(undefined)(), /unavailable/);

  assert.match(markup, /id="clear-local-data-dialog"[^>]*role="alertdialog"[^>]*aria-describedby="clear-local-data-warning"/);
  assert.match(markup, /id="clear-local-data-warning"[^>]*>.*?discards unsaved changes/s);
  assert.match(markup, /id="cancel-clear-local-data"/);
  assert.match(markup, /id="confirm-clear-local-data"[^>]*>Delete local documents/);
  assert.match(source, /\$\("#clear-local-data"\)\.addEventListener\("click", \(\) => \{[\s\S]*?\$\("#clear-local-data-dialog"\)\.showModal\(\);/);
  assert.match(source, /\$\("#confirm-clear-local-data"\)\.addEventListener\("click", deleteLocalDocuments\);/);

  const storageClasses = new Set(["checking"]);
  const storageStatus = {
    attributes: {},
    classList: { toggle(name, enabled) { enabled ? storageClasses.add(name) : storageClasses.delete(name); } },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const storageLabel = { textContent: "Checking local storage…" };
  const fileKind = { textContent: "" };
  const storageElements = new Map([["#local-storage-status", storageStatus], ["#local-storage-label", storageLabel], ["#file-kind", fileKind]]);
  const availabilityStart = source.indexOf("  function setStorageAvailability(");
  const availabilityEnd = source.indexOf("  function openDatabase(", availabilityStart);
  assert.ok(availabilityStart >= 0 && availabilityEnd > availabilityStart);
  const createAvailability = new Function("$", `let storageAvailability; let activeWorkspaceMode = "landing"; ${source.slice(availabilityStart, availabilityEnd)}; return { setStorageAvailability, get value() { return storageAvailability; } };`);
  const availability = createAvailability((selector) => storageElements.get(selector));
  availability.setStorageAvailability(true);
  assert.equal(storageLabel.textContent, "Saved on this device");
  assert.equal(fileKind.textContent, "Private by default · saved in this browser");
  assert.equal(availability.value, true);
  assert.equal(storageClasses.has("available"), true);
  assert.equal(storageClasses.has("checking"), false);
  availability.setStorageAvailability(false);
  assert.equal(storageLabel.textContent, "Local saving unavailable");
  assert.equal(fileKind.textContent, "Local saving unavailable · export documents to keep changes");
  assert.equal(storageStatus.attributes["aria-label"], "Local saving unavailable");
  assert.equal(storageClasses.has("unavailable"), true);
  assert.equal(storageClasses.has("available"), false);
  assert.match(markup, /id="local-storage-status" role="status" aria-live="polite"/);
  assert.match(markup, /id="local-storage-label">Checking local storage…/);
  assert.match(source, /openDatabase\(\)\.then\(\(\) => \{ setStorageAvailability\(true\);/);
  assert.match(source, /\.catch\(\(\) => \{ setStorageAvailability\(false\); setSaveStatus\("Local save unavailable"\)/);
  assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /.sidebar-footer.unavailable .privacy-dot\{background:#e45f52\}/);

  process.stdout.write("Local data privacy tests passed: deletion is confirmed, clears only IndexedDB documents, and reports transaction errors.\n");
}

run().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });

