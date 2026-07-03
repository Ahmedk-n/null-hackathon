// Keystone — headless zero-console-error rehearsal (closes v3 item "HUMAN: zero-console-error
// rehearsal" by AUTOMATING it). Plain Playwright, NOT wired into vitest. Launches chromium
// headless against BASE_URL and drives BOTH demos while capturing every console error/warning,
// pageerror, and failed request.
//
//   REHEARSED DEMO (scenario A, pinned/offline-deterministic):
//     load / → CONTEXT tab → Analyse → GRAPH tab + canvas nodes → STRESS tab → Apply Load →
//     toggle IGNORE CONTEXT / GROUND IN CONTEXT → Reinforce → DE-RISKING PLAN → scrub TIMELINE →
//     Reset.
//   SCENARIO B: mode B → Analyse → Apply Load → verify it HOLDS (integrity >= 35).
//   (CUSTOM/live mode deliberately skipped — it costs ~50s of API calls; the live acid test in
//    v3-8 already covers that path. See report.)
//
// PASS = zero console errors AND zero pageerrors (warnings reported but non-fatal, EXCEPT React
// hydration warnings, which count as failures per GOAL "zero client console errors"). Nonzero
// exit + a listing of each captured message (tagged with the demo step) otherwise.
//
//   Usage:  BASE_URL=http://localhost:3002 node e2e/rehearsal.mjs
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";

// ── Capture buffers ────────────────────────────────────────────────────────
let currentStep = "boot";
const captured = []; // { kind, text, step } — kind: error | pageerror | requestfailed | warning | hydration
const timings = []; // { step, ms, slow }

function record(kind, text) {
  captured.push({ kind, text: String(text).slice(0, 600), step: currentStep });
}

// A warning that is really a React hydration mismatch counts as a hard failure.
function isHydrationWarning(text) {
  return /hydrat|did not match|server rendered|server-rendered|Text content does not match/i.test(
    text,
  );
}

// ── Step runner (times each step; flags tab switches > 1s per T12) ───────────
async function step(name, fn, { tabSwitch = false } = {}) {
  currentStep = name;
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  const slow = tabSwitch && ms > 1000;
  timings.push({ step: name, ms, slow });
  console.log(`  · ${name} — ${ms}ms${slow ? "  ⚠ SLOW (>1s tab switch)" : ""}`);
}

async function main() {
  console.log(`REHEARSAL START — target ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Wire capture BEFORE any navigation.
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") record("error", text);
    else if (type === "warning") record(isHydrationWarning(text) ? "hydration" : "warning", text);
  });
  page.on("pageerror", (err) => record("pageerror", err.stack || err.message || String(err)));
  page.on("requestfailed", (req) => {
    const f = req.failure();
    record("requestfailed", `${req.method()} ${req.url()} — ${f ? f.errorText : "failed"}`);
  });

  const clickText = (text) => page.getByRole("button", { name: text, exact: false }).first();

  // Await a tab becoming active (its button carries class `tab-active`).
  const waitTabActive = (id) =>
    page.waitForFunction(
      (tabId) => {
        const el = document.querySelector(`[data-tab="${tabId}"]`);
        return !!el && el.className.includes("tab-active");
      },
      id,
      { timeout: 15000 },
    );

  // Read the status-strip Integrity readout (e.g. "62%") as a number, or null.
  const readIntegrity = () =>
    page.evaluate(() => {
      const foot = document.querySelector("footer");
      if (!foot) return null;
      const m = /Integrity\s*([\d]+)%/i.exec(foot.innerText || "");
      return m ? Number(m[1]) : null;
    });

  try {
    // ── SCENARIO A — the rehearsed, pinned demo ──────────────────────────────
    console.log("\n[SCENARIO A · rehearsed / pinned]");

    await step("A: load /", async () => {
      await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
    });

    await step("A: CONTEXT tab visible", async () => {
      await waitTabActive("context");
      // Mode defaults to A (pinned). Confirm the mode chip reads PINNED · SCENARIO A.
      await page.waitForSelector('[data-testid="mode-chip"][data-mode="A"]', { timeout: 10000 });
    });

    await step("A: click Analyse", async () => {
      await clickText("ANALYSE").click();
    });

    await step(
      "A: GRAPH tab active + canvas nodes render",
      async () => {
        await waitTabActive("graph");
        await page.waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 },
        );
      },
      { tabSwitch: true },
    );

    await step(
      "A: switch to STRESS tab",
      async () => {
        await page.click('[data-tab="stress"]');
        await waitTabActive("stress");
        // Stress tab renders its own canvas — wait for nodes so the tab is truly settled.
        await page.waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 },
        );
      },
      { tabSwitch: true },
    );

    await step("A: Apply Load", async () => {
      await clickText("Apply Load").click();
      // loadApplied → the Reinforce button mounts. That is the settle signal.
      await page.waitForSelector('button:has-text("Reinforce")', { timeout: 15000 });
    });

    await step("A: toggle IGNORE CONTEXT", async () => {
      await page.click('[data-testid="context-toggle"] button:has-text("Ignore Context")');
      await page.waitForFunction(
        () => {
          const b = [...document.querySelectorAll('[data-testid="context-toggle"] button')].find(
            (x) => /Ignore Context/i.test(x.textContent || ""),
          );
          return b && b.getAttribute("aria-pressed") === "true";
        },
        undefined,
        { timeout: 10000 },
      );
    });

    await step("A: toggle GROUND IN CONTEXT", async () => {
      await page.click('[data-testid="context-toggle"] button:has-text("Ground In Context")');
      await page.waitForFunction(
        () => {
          const b = [...document.querySelectorAll('[data-testid="context-toggle"] button')].find(
            (x) => /Ground In Context/i.test(x.textContent || ""),
          );
          return b && b.getAttribute("aria-pressed") === "true";
        },
        undefined,
        { timeout: 10000 },
      );
    });

    await step("A: Reinforce", async () => {
      await clickText("Reinforce").click();
    });

    await step("A: DE-RISKING PLAN panel appears", async () => {
      await page.waitForSelector('[data-testid="derisking-plan"]', { timeout: 10000 });
      const proveRows = await page.locator('[data-testid="prove-row"]').count();
      console.log(`      derisking rows: ${proveRows}`);
    });

    await step("A: scrub TIMELINE slider", async () => {
      await page.waitForSelector('[data-testid="timeline-slider"]', { timeout: 10000 });
      const slider = page.locator('[data-testid="timeline-slider"]');
      // Drive the value directly (range inputs respond to fill + input/change events).
      await slider.fill("14");
      await slider.evaluate((el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // Keyboard nudge as a second scrub gesture.
      await slider.focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
    });

    await step("A: Reset", async () => {
      // The STRESS-rail Reset button (there is also a TopBar Reset — take the rail one).
      await page.locator('button:has-text("Reset")').last().click();
      await page.waitForTimeout(150);
    });

    // ── SCENARIO B — pinned; must HOLD ───────────────────────────────────────
    console.log("\n[SCENARIO B · pinned / must hold]");

    await step(
      "B: back to CONTEXT tab",
      async () => {
        await page.click('[data-tab="context"]');
        await waitTabActive("context");
      },
      { tabSwitch: true },
    );

    await step("B: select mode B", async () => {
      await page.click('[data-scenario="B"]');
      await page.waitForSelector('[data-testid="mode-chip"][data-mode="B"]', { timeout: 10000 });
    });

    await step("B: click Analyse", async () => {
      await clickText("ANALYSE").click();
    });

    await step(
      "B: GRAPH tab active + canvas nodes render",
      async () => {
        await waitTabActive("graph");
        await page.waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 },
        );
      },
      { tabSwitch: true },
    );

    await step(
      "B: switch to STRESS tab",
      async () => {
        await page.click('[data-tab="stress"]');
        await waitTabActive("stress");
        await page.waitForFunction(
          () => document.querySelectorAll(".react-flow__node").length > 0,
          undefined,
          { timeout: 15000 },
        );
      },
      { tabSwitch: true },
    );

    let integrityB = null;
    await step("B: Apply Load", async () => {
      await clickText("Apply Load").click();
      await page.waitForSelector('button:has-text("Reinforce")', { timeout: 15000 });
      // Let the engine + gauge settle, then read the integrity readout.
      await page.waitForTimeout(300);
      integrityB = await readIntegrity();
    });

    await step("B: verify HOLDS (integrity >= 35)", async () => {
      console.log(`      scenario B integrity: ${integrityB}%`);
      if (integrityB === null) throw new Error("could not read scenario-B integrity readout");
      if (integrityB < 35)
        throw new Error(`scenario B did NOT hold — integrity ${integrityB}% < 35% (expected hold)`);
    });
  } catch (err) {
    record("error", `SCRIPT DRIVE FAILURE: ${err.message}`);
    console.error(`\n✗ drive failure during step "${currentStep}": ${err.message}`);
  } finally {
    // Give any trailing microtask console output a beat to flush.
    await page.waitForTimeout(200);
    await browser.close();
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  const fatals = captured.filter(
    (c) => c.kind === "error" || c.kind === "pageerror" || c.kind === "hydration",
  );
  const warns = captured.filter((c) => c.kind === "warning");
  const failedReqs = captured.filter((c) => c.kind === "requestfailed");

  console.log("\n──────── STEP TIMINGS ────────");
  for (const t of timings) console.log(`  ${String(t.ms).padStart(6)}ms  ${t.step}${t.slow ? "  ⚠SLOW" : ""}`);
  const slowSwitches = timings.filter((t) => t.slow);
  if (slowSwitches.length) console.log(`  ⚠ ${slowSwitches.length} tab switch(es) exceeded 1s`);

  if (warns.length) {
    console.log(`\n──────── WARNINGS (non-fatal · ${warns.length}) ────────`);
    for (const w of warns) console.log(`  [${w.step}] ${w.text}`);
  }
  if (failedReqs.length) {
    console.log(`\n──────── FAILED REQUESTS (reported · ${failedReqs.length}) ────────`);
    for (const r of failedReqs) console.log(`  [${r.step}] ${r.text}`);
  }

  if (fatals.length === 0) {
    console.log("\nREHEARSAL PASS — 0 console errors");
    process.exit(0);
  } else {
    console.log(`\n──────── FATAL MESSAGES (${fatals.length}) ────────`);
    for (const f of fatals) console.log(`  [${f.kind}] (step: ${f.step})\n    ${f.text}`);
    console.log(`\nREHEARSAL FAIL — ${fatals.length} console error(s)/pageerror(s)/hydration warning(s)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("REHEARSAL HARNESS CRASH:", e);
  process.exit(2);
});
