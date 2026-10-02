import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const baseUrl = arg("--base-url", "http://127.0.0.1:4173");
const captureId = arg("--capture");
const output = arg("--output");
const metadataOutput = arg("--metadata-output");
if (!captureId || !output) {
  console.error("usage: node .uigs/capture-ui.mjs --capture ID --output FILE [--base-url URL] [--metadata-output FILE]");
  process.exit(2);
}
const contract = JSON.parse(await fs.readFile(new URL("./ui-visual-capture.json", import.meta.url), "utf8"));
const capture = contract.captures.find((x) => x.id === captureId);
if (!capture) throw new Error(`Unknown capture id: ${captureId}`);

const viewport = {
  width: capture.viewport.width,
  height: capture.viewport.height,
  deviceScaleFactor: capture.viewport.device_scale_factor ?? 1,
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: capture.locale ?? "en-US",
    colorScheme: capture.color_scheme ?? "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const targetUrl = new URL(capture.route ?? "/", baseUrl).toString();
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const fixtureState = capture.fixture?.state ?? null;
  if (fixtureState === "editor-all") {
    await page.locator('[data-editor-filter="all"]').click();
  } else if (fixtureState === "preview-dialog") {
    await page.evaluate(() => {
      const dialog = document.querySelector("#previewDialog");
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  const ready = capture.ready ?? {};
  if (ready.selector) {
    await page.locator(ready.selector).waitFor({ state: ready.state ?? "visible", timeout: 30_000 });
  }
  if (ready.settle_ms) await page.waitForTimeout(ready.settle_ms);
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (capture.capture_region === "element") {
    const locator = page.locator(capture.selector).first();
    await locator.waitFor({ state: "visible", timeout: 30_000 });
    await locator.screenshot({ path: output, animations: "disabled" });
  } else {
    await page.screenshot({ path: output, fullPage: capture.capture_region === "full-page", animations: "disabled" });
  }
  if (metadataOutput) {
    await fs.mkdir(path.dirname(metadataOutput), { recursive: true });
    await fs.writeFile(metadataOutput, JSON.stringify({
      schema_version: 1,
      capture_id: capture.id,
      surface_ids: capture.surface_ids,
      adapter: capture.adapter,
      evidence_level: capture.evidence_level,
      browser: { name: "chromium", version: browser.version() },
      target_url: targetUrl,
      viewport,
      color_scheme: capture.color_scheme ?? "light",
      locale: capture.locale ?? "en-US",
      selector: capture.selector ?? null,
    }, null, 2) + "\n");
  }
} finally {
  await browser.close();
}
