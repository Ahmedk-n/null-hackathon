// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { IntegrityGauge } from "./IntegrityGauge";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("IntegrityGauge (W1-1)", () => {
  it("maps the three status bands (HOLDING ≥35 · STRESSED 10–35 · FAILED <10)", () => {
    const { rerender } = render(<IntegrityGauge value={62} />);
    expect(screen.getByText("HOLDING")).toBeDefined();
    expect(screen.queryByText("STRESSED")).toBeNull();
    expect(screen.queryByText("FAILED")).toBeNull();

    // Band boundary: 35 is HOLDING, just under is STRESSED.
    rerender(<IntegrityGauge value={35} />);
    expect(screen.getByText("HOLDING")).toBeDefined();
    rerender(<IntegrityGauge value={20} />);
    expect(screen.getByText("STRESSED")).toBeDefined();

    // Band boundary: 10 is STRESSED, just under is FAILED.
    rerender(<IntegrityGauge value={10} />);
    expect(screen.getByText("STRESSED")).toBeDefined();
    rerender(<IntegrityGauge value={6} />);
    expect(screen.getByText("FAILED")).toBeDefined();
  });

  it("colors the status word --ok / --warn / --bad by band", () => {
    const colorOf = (word: string) =>
      (screen.getByText(word) as HTMLElement).style.color;
    const { rerender } = render(<IntegrityGauge value={62} />);
    expect(colorOf("HOLDING")).toBe("rgb(63, 122, 52)"); // --ok #3f7a34 (warm-editorial redesign)
    rerender(<IntegrityGauge value={20} />);
    expect(colorOf("STRESSED")).toBe("rgb(181, 133, 15)"); // --warn #b5850f (gold)
    rerender(<IntegrityGauge value={6} />);
    expect(colorOf("FAILED")).toBe("rgb(166, 42, 40)"); // --bad #a62a28 (crimson)
  });

  it("renders the rounded value and keeps the persistent label", () => {
    const { container } = render(<IntegrityGauge value={61.97} />);
    expect(screen.getByText("Structural Integrity")).toBeDefined();
    const texts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(texts).toContain("62"); // Math.round(61.97)
  });

  it("is deterministic: same value in → same final render", () => {
    const first = render(<IntegrityGauge value={6} />).container.innerHTML;
    cleanup();
    const second = render(<IntegrityGauge value={6} />).container.innerHTML;
    expect(first).toBe(second);
    expect(first).toContain("FAILED");
  });
});
