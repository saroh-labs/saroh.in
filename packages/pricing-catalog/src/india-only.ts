/**
 * Words of India's catalogue that mean nothing outside India (stage 9, owner
 * 8 Nov 2026: "filter and flag"): GST and its number, UPI, rupees and paise,
 * India's payment providers, and a PIN code. saroh.tech leaves out a row or
 * line that has one; the admin console flags it on a Global draft, never
 * blocks it.
 */
const INDIA_ONLY =
    /₹|rupee|paise|\bINR\b|\bGST(IN)?\b|\bUPI\b|razorpay|cashfree/i;
// Capitals only: "pin" is an ordinary word.
const PIN_CODE = /\bPIN\b/;

/** The first India-only word in `text`, as written, or null. */
export function indiaOnlyWord(text: string): string | null {
    return (INDIA_ONLY.exec(text) ?? PIN_CODE.exec(text))?.[0] ?? null;
}
