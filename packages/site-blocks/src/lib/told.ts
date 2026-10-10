/**
 * What a confirmation says happens next: whether a message is on its way.
 *
 * The API says how the customer hears about their own order or booking
 * (its notice reach, the one the waitlist card already reads): by email
 * when the business's own email is connected, in their account on the
 * site, or not at all. The page says "We've emailed ‹address›" only when
 * an email goes, and otherwise where it is kept. It never promises a
 * message that isn't sent.
 *
 * No directive: the order page is drawn on the server, the booked card in
 * the browser.
 */
export type NoticeReach =
    "EMAIL_AND_ACCOUNT" | "EMAIL" | "ACCOUNT" | "ON_SIGN_IN" | "NONE";

const REACHES: readonly NoticeReach[] = [
    "EMAIL_AND_ACCOUNT",
    "EMAIL",
    "ACCOUNT",
    "ON_SIGN_IN",
    "NONE",
];

/** A reach worth reading, or null: anything else promises nothing. */
export function reachOrNull(value: unknown): NoticeReach | null {
    return REACHES.find((r) => r === value) ?? null;
}

/** Whether an email goes. */
export function emailed(reach: NoticeReach | null | undefined): boolean {
    return reach === "EMAIL" || reach === "EMAIL_AND_ACCOUNT";
}

/**
 * "We've emailed asha@example.com." when an email goes and the page knows
 * the address; "It's saved in your account." otherwise.
 */
export function toldText(
    reach: NoticeReach | null | undefined,
    email: string | null | undefined,
): string {
    const address = email?.trim();
    return emailed(reach) && address
        ? `We've emailed ${address}.`
        : "It's saved in your account.";
}
