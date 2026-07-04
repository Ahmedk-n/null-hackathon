// Throwaway screenshot harness for the GRAPH/STRESS canvas visual bug fix.
// NOT wired into npm test. Usage: TAG=before node e2e/_shot.mjs
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";
const OUT = process.env.OUT || "/tmp";
const TAG = process.env.TAG || "shot";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();

  const clickText = (t) => page.getByRole("button", { name: t, exact: false }).first();
  const waitTabActive = (id) =>
    page.waitForFunction(
      (tabId) => {
        const el = document.querySelector(`[data-tab="${tabId}"]`);
        return !!el && el.className.includes("tab-active");
      },
      id,
      { timeout: 15000 },
    );
  const waitNodes = () =>
    page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length > 0, undefined, {
      timeout: 15000,
    });

  await page.goto(BASE_URL + "/studio", { waitUntil: "networkidle", timeout: 60000 });
  await waitTabActive("context");
  // Scenario R (the founder's screenshotted sample).
  await page.click('[data-scenario="R"]');
  await page.waitForSelector('[data-testid="mode-chip"][data-mode="R"]', { timeout: 10000 });
  await clickText("ANALYSE").click();
  await waitTabActive("graph");
  await waitNodes();
  // Let the assembly build-in settle.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/graph-standing-${TAG}.png` });
  console.log(`wrote ${OUT}/graph-standing-${TAG}.png`);

  // STRESS → Apply Load → GROUND IN CONTEXT → capture FAILED state on the STRESS canvas.
  await page.click('[data-tab="stress"]');
  await waitTabActive("stress");
  await waitNodes();
  await clickText("Apply Load").click();
  await page.waitForSelector('button:has-text("Reinforce")', { timeout: 15000 });
  // ensure grounded (button toggles between IGNORE/GROUND)
  const groundBtn = page.locator('[data-testid="context-toggle"] button:has-text("Ground In Context")');
  if ((await groundBtn.count()) > 0) {
    const pressed = await groundBtn.first().getAttribute("aria-pressed");
    if (pressed !== "true") await groundBtn.first().click();
  }
  // Let the collapse animation fully settle to its RESTING state.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/stress-failed-${TAG}.png` });
  console.log(`wrote ${OUT}/stress-failed-${TAG}.png`);

  // Also hop back to GRAPH to see the failed structure in the SECTION view.
  await page.click('[data-tab="graph"]');
  await waitTabActive("graph");
  await waitNodes();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/graph-failed-${TAG}.png` });
  console.log(`wrote ${OUT}/graph-failed-${TAG}.png`);

  await browser.close();
}

main().catch((e) => {
  console.error("SHOT HARNESS CRASH:", e);
  process.exit(1);
});
