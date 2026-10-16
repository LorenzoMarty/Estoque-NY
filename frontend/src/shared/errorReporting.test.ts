import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
vi.mock("@sentry/react", () => ({ init }));

import { initErrorReporting } from "./errorReporting";

const env = (values: Record<string, string>) => values as unknown as ImportMetaEnv;

describe("initErrorReporting", () => {
  beforeEach(() => init.mockReset());

  it("stays off, and loads nothing, without a DSN", async () => {
    expect(await initErrorReporting(env({}))).toBe(false);
    expect(await initErrorReporting(env({ VITE_SENTRY_DSN: "   " }))).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("starts Sentry with the environment and release when a DSN is set", async () => {
    const started = await initErrorReporting(
      env({ VITE_SENTRY_DSN: "https://k@o.ingest.sentry.io/1", MODE: "production", VITE_SENTRY_RELEASE: "abc123" })
    );

    expect(started).toBe(true);
    expect(init).toHaveBeenCalledWith({
      dsn: "https://k@o.ingest.sentry.io/1",
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0,
    });
  });

  it("leaves the release unset when none is given", async () => {
    await initErrorReporting(env({ VITE_SENTRY_DSN: "https://k@o.ingest.sentry.io/1", MODE: "staging" }));
    expect(init.mock.calls[0][0].release).toBeUndefined();
  });
});
