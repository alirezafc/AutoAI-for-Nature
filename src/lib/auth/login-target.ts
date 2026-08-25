/**
 * Login navigation helpers.
 *
 * Root cause of the "first click hangs" bug: after a successful fetch login,
 * the form called router.push() + router.refresh() inside the App Router.
 * The client router cache still held the UNAUTHENTICATED /admin payload
 * (middleware had rewritten it to /admin/login), and refresh() raced the
 * push — the component never unmounted, so the spinner never resolved. A
 * manual page refresh re-fetched HTML with the new cookie, which is why the
 * second attempt worked.
 *
 * The reliable contract is a FULL navigation after the session cookie exists:
 * the server middleware always sees the fresh cookie and renders the
 * dashboard. No client cache can interfere.
 */

/** Only same-origin internal paths are allowed as post-login targets. */
export function safeLoginTarget(from?: string | null, fallback = "/admin"): string {
  if (!from) return fallback;
  if (!from.startsWith("/")) return fallback;
  if (from.startsWith("//") || from.startsWith("/\\")) return fallback;
  return from;
}

/**
 * Development-only credential hint. Production must NEVER display
 * .env.local / default-credential messaging.
 */
export function shouldRenderDemoHint(nodeEnv?: string): boolean {
  return nodeEnv !== "production";
}
