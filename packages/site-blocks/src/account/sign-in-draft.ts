"use client";

/**
 * Where a sign-in had got to, kept for the visit (`sessionStorage`): the
 * email typed, and whether a code has been sent to it. The code arrives in
 * another app, and a phone often loads the page again on the way back (the
 * browsers inside WhatsApp and Instagram do it most). Without this the
 * sheet came back empty, asking for the email a second time and sending a
 * second code.
 *
 * Never the code itself, and nothing the customer didn't type. It never
 * leaves the browser, ends with the tab, and is cleared on signing in. A
 * code step older than {@link CODE_STEP_MS} comes back as the email step,
 * with the email still filled in: that code has likely run out.
 */

const KEY = "saroh.sign-in";
const MAX_EMAIL = 254;

/** How long a restored "Enter the code" step is worth showing. */
export const CODE_STEP_MS = 10 * 60_000;

export interface SignInDraft {
    email: string;
    step: "email" | "code";
    /** When the code was sent, by this browser's clock; null before one. */
    sentAt: number | null;
}

const NONE: SignInDraft = { email: "", step: "email", sentAt: null };

/** What is stored, narrowed: anything else reads as nothing kept. */
export function parseSignInDraft(raw: string | null, now: number): SignInDraft {
    if (!raw) return NONE;
    let stored: unknown;
    try {
        stored = JSON.parse(raw);
    } catch {
        return NONE;
    }
    if (typeof stored !== "object" || stored === null) return NONE;
    const s = stored as Record<string, unknown>;
    if (typeof s.email !== "string" || s.email.length > MAX_EMAIL) return NONE;
    // The time the code was sent, never the time of this read: reloading
    // the page doesn't make an old code new.
    const sentAt = typeof s.sentAt === "number" ? s.sentAt : null;
    const fresh =
        sentAt !== null && now >= sentAt && now - sentAt <= CODE_STEP_MS;
    return s.step === "code" && s.email.trim() && fresh
        ? { email: s.email, step: "code", sentAt }
        : { email: s.email, step: "email", sentAt: null };
}

export function readSignInDraft(): SignInDraft {
    try {
        return parseSignInDraft(window.sessionStorage.getItem(KEY), Date.now());
    } catch {
        return NONE;
    }
}

/** Keep it for the visit; nothing typed clears what was kept. */
export function writeSignInDraft(draft: SignInDraft): void {
    try {
        if (!draft.email.trim()) {
            window.sessionStorage.removeItem(KEY);
            return;
        }
        window.sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
        // Kept in the sheet's state for this page only.
    }
}

export function clearSignInDraft(): void {
    try {
        window.sessionStorage.removeItem(KEY);
    } catch {
        // Nothing was kept.
    }
}
