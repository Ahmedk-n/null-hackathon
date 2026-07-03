import { describe, it, expect, vi } from "vitest";
import { retryOnce, rejectAfter } from "./retry";

describe("retryOnce", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(retryOnce(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once and succeeds on the second attempt", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("recovered");
    await expect(retryOnce(fn)).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propagates the error after the single retry also fails (so callers fall back)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("still down");
    });
    await expect(retryOnce(fn)).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("rejectAfter", () => {
  it("rejects once the deadline elapses", async () => {
    await expect(rejectAfter(5, "unit")).rejects.toThrow(/exceeded 5ms deadline/);
  });

  it("loses a Promise.race against work that finishes first", async () => {
    const fast = Promise.resolve("done");
    await expect(Promise.race([fast, rejectAfter(1000, "unit")])).resolves.toBe("done");
  });
});
