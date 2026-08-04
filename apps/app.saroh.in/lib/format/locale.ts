/**
 * The one locale every `Intl` call in the workspace formats against.
 *
 * Passing `undefined` — the obvious default — means "use the runtime's locale",
 * and the runtime is not the same on both sides of a render. Node resolves one
 * default and the browser another, so a date server-rendered as "3 Aug 2026"
 * hydrated as "Aug 3, 2026" and React failed hydration on the mismatch, throwing
 * away the tree and re-rendering it on the client. Every `toLocaleDateString`
 * and `Intl.NumberFormat` in a component that server-renders is exposed to this.
 *
 * `en-GB` rather than `en-US` for day-first dates ("3 Aug 2026"), and rather
 * than `en-IN` because en-IN groups digits by lakh (1,23,456) — correct for
 * India and unreadable for anyone reading the same screen from outside it.
 *
 * This is a placeholder for a real preference, not a claim that everyone reads
 * British English. When the workspace grows a per-user locale, it replaces this
 * constant and the mismatch stays fixed, because the value would then travel
 * with the render instead of being sniffed from the environment.
 */
export const DISPLAY_LOCALE = "en-GB";
