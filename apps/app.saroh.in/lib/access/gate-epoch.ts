/**
 * The gate epoch (`gate-memo.ts`): part of the key the server keeps the
 * gate's answers under. A save that changed role, membership, modules or
 * plan sets a new one from the browser, before its reads go out, so no
 * isolate serves this browser an answer from before the save. Set here,
 * not by the Server Action: a cookie set in an action re-renders the page
 * on the server, which React Query saves never do (DEC-259). A nonce, not
 * a secret: the key also holds the session, which script can't read.
 */
export const GATE_EPOCH_COOKIE = "gate_epoch";

export function bumpGateEpoch(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${GATE_EPOCH_COOKIE}=${Date.now().toString(36)}; path=/; samesite=lax; secure`;
}
