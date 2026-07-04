// V6-3 · SKYLINE e2e leg — STANDALONE snippet. The orchestrator splices this into
// e2e/rehearsal.mjs; it is written as an exported async function matching rehearsal.mjs's
// conventions (the shared `step(name, fn, opts)` runner + Playwright `page`, `BASE_URL`).
//
// CONTRACT (for the orchestrator):
//   import { runSkylineLeg } from "./skyline-leg.mjs";
//   ...inside main(), after the existing legs, with the SAME `page`:
//     console.log("\n[SKYLINE · /skyline — shared foundations]");
//     await runSkylineLeg(page, step, BASE_URL);
//   `step` is rehearsal.mjs's runner: step(name, async fn, { tabSwitch } = {}).
//   The function throws on assertion failure (captured by rehearsal's try/catch as a drive failure);
//   it neither closes the browser nor exits the process.
//
// It exercises the OFFLINE, SAMPLE-seeded skyline (empty library → 3 sample buildings, R+A share the
// "spare capacity" foundation): load /skyline, assert buildings + a foundation render, CRACK IT,
// assert the "1 ASSUMPTION FEEDS 2 STRUCTURES · 2 COLLAPSE" readout + 2 dropped buildings, then RESET.

export async function runSkylineLeg(page, step, BASE_URL) {
  await step("SKYLINE: load /skyline — buildings render from seeded samples", async () => {
    // Earlier rehearsal legs auto-save library entries (V5-4), which would suppress the
    // empty-library SAMPLE seeding this leg asserts. Clear storage first so the deterministic
    // 3-sample skyline (with its aliased shared foundation) renders reliably.
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(BASE_URL + "/skyline", { waitUntil: "networkidle", timeout: 60000 });
    // Header + SAMPLE chip (empty library seeds the three sample buildings).
    await page.waitForFunction(
      () => /SKYLINE — YOUR STRATEGY AS ONE STRUCTURE/i.test(document.body.innerText || ""),
      undefined,
      { timeout: 15000 },
    );
    await page.waitForSelector('[data-testid="sample-chip"]', { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="skyline-building"]').length === 3,
      undefined,
      { timeout: 15000 },
    );
  });

  await step("SKYLINE: a shared foundation renders (spare capacity, R + A)", async () => {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="skyline-foundation"]').length >= 1,
      undefined,
      { timeout: 10000 },
    );
    const foundationRows = await page.locator('[data-testid="foundation-row"]').count();
    if (foundationRows < 1) throw new Error("no shared-foundation row rendered on the skyline");
  });

  await step("SKYLINE: CRACK IT → readout + collapsed buildings", async () => {
    await page.getByRole("button", { name: /CRACK IT/i }).first().click();
    await page.waitForSelector('[data-testid="crack-readout"]', { timeout: 10000 });
    const readout = await page.locator('[data-testid="crack-readout"]').innerText();
    if (!/1 ASSUMPTION FEEDS 2 STRUCTURES · 2 COLLAPSE/i.test(readout)) {
      throw new Error(`unexpected crack readout: "${readout}"`);
    }
    const rows = await page.locator('[data-testid="crack-row"]').count();
    if (rows !== 2) throw new Error(`expected 2 crack rows, got ${rows}`);
    const failed = await page.locator('[data-testid="skyline-building"][data-failed="true"]').count();
    if (failed !== 2) throw new Error(`expected 2 collapsed buildings, got ${failed}`);
  });

  await step("SKYLINE: RESET restores", async () => {
    await page.getByRole("button", { name: /^RESET$/i }).first().click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="crack-readout"]').length === 0,
      undefined,
      { timeout: 10000 },
    );
    const failed = await page.locator('[data-testid="skyline-building"][data-failed="true"]').count();
    if (failed !== 0) throw new Error(`RESET did not restore — ${failed} buildings still collapsed`);
  });
}
