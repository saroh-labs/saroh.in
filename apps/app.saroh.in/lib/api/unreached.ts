/**
 * The two sentences for a save that never got an answer (10 Oct 2026).
 *
 * A write that couldn't reach the server had no time limit and no words,
 * and one sent after the session ended showed the server's own text. Now
 * every write says one of these, wherever it was started from:
 *
 * - `UNREACHED`: the request failed on the network or wasn't answered in
 *   20 seconds (`apiFetch` in `http.ts`, and `runAction` when the browser
 *   couldn't reach this app at all).
 * - `SIGNED_OUT`: the API answered 401. It is shown as the one toast that
 *   stays, with a "Sign in" button that opens accounts in a new tab, so the
 *   page and what was typed on it are still there to send again
 *   (`SignedOutToast` in the shell).
 *
 * Pure and client-safe: no server-only imports.
 */
export const UNREACHED =
    "That didn't reach Saroh. Check your connection and try again. Nothing was changed.";

export const SIGNED_OUT =
    "You've been signed out. Sign in again and what you typed stays here.";

/** How long a write waits for the API before it is called unreached. */
export const WRITE_TIMEOUT_MS = 20_000;

/**
 * The header `apiFetch` marks its own two answers with, so `mutate` and
 * `destroy` can tell them from the API's.
 */
export const SAID_HEADER = "x-saroh-said";
export type Said = "unreached" | "signed-out";
