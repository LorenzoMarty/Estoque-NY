/**
 * Browser error reporting to Sentry, off unless VITE_SENTRY_DSN is set. The SDK is
 * imported on demand, so builds without a DSN do not pay for it in the main bundle.
 * Unhandled errors and promise rejections are captured by the SDK's global handlers.
 */
export async function initErrorReporting(env: ImportMetaEnv = import.meta.env): Promise<boolean> {
  const dsn = (env.VITE_SENTRY_DSN ?? "").trim();
  if (!dsn) return false;

  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    environment: env.MODE,
    release: env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
  });
  return true;
}
