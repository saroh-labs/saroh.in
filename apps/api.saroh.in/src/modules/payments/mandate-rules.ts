/**
 * The pure rules of an autopay mandate (round-2 D11, DEC-038): the limit a
 * customer is asked to authorise, what may be shown of their account, and
 * which reported states move a mandate. No database, no provider.
 */

/** A mandate's state in Saroh (`PaymentMandate.status`). */
export type MandateStatus =
    "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED" | "FAILED";

/** What a provider (a webhook, or a read) says a mandate is now. */
export type ReportedMandateStatus = Exclude<MandateStatus, "PENDING">;

/**
 * What a provider reports about one mandate (a webhook, or a read). Found
 * by the provider's mandate id or, before the provider has named one, by
 * the set-up it answers.
 */
export interface ReportedMandateChange {
    status: ReportedMandateStatus;
    providerMandateId?: string;
    providerCustomerId?: string;
    setupReference?: string;
    /** UPI | CARD | EMANDATE, when the report says. */
    method?: string;
    /** Only a masked handle or last four — never a full VPA or number. */
    displayHint?: string;
    maxAmountCents?: number;
    expiresAt?: Date;
    /** The provider's reason code on a failed set-up. */
    failureReason?: string;
}

/**
 * The most a UPI mandate may authorise at Razorpay for most businesses:
 * ₹99,999 (D11 spike; ₹2,00,000 for a few business categories, which
 * Saroh doesn't claim).
 */
export const MANDATE_MAX_CENTS = 9_999_900;

/**
 * The limit to ask for on a price, in minor units: half again, so one
 * price rise still fits, rounded up to the next ₹100 and never above
 * {@link MANDATE_MAX_CENTS}. Razorpay advises a limit close to the real
 * charge; an invoice above it isn't charged (D13, MANDATE_LIMIT_LOW) and
 * the customer authorises again.
 */
export function mandateLimitCents(priceCents: number): number {
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
        throw new Error(
            "A mandate limit needs a positive price in minor units",
        );
    }
    const withHeadroom = Math.ceil((priceCents * 3) / 2 / 10_000) * 10_000;
    return Math.min(Math.max(withHeadroom, priceCents), MANDATE_MAX_CENTS);
}

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
    razorpay: "Razorpay",
    cashfree: "Cashfree",
};

/** The provider as a merchant knows it. */
export function providerName(provider: string | null | undefined): string {
    const key = (provider ?? "").trim().toLowerCase();
    return PROVIDER_NAMES[key] ?? "your payment provider";
}

/** How long a set-up waits for the customer before it lapses. */
export const SETUP_TTL_MS = 24 * 60 * 60 * 1000;

/** How long the authority itself lasts at the provider (Razorpay's default). */
export const MANDATE_TERM_YEARS = 10;

/**
 * Mask a UPI handle for display: the first two characters of the name,
 * then the bank's handle (`as•••@okbank`). Null when there's nothing to
 * show.
 */
export function maskVpa(
    username: string | null | undefined,
    handle: string | null | undefined,
): string | null {
    const user = (username ?? "").trim();
    const bank = (handle ?? "").trim().replace(/^@/, "");
    if (!user && !bank) return null;
    return `${user.slice(0, 2)}•••@${bank}`;
}

/**
 * A display hint as Saroh keeps it: only an already-masked handle or a
 * card's last four. Anything that could be a full UPI id or number is
 * dropped, whatever a payload says.
 */
export function safeDisplayHint(
    hint: string | null | undefined,
): string | null {
    const value = (hint ?? "").trim();
    if (!value || value.length > 64) return null;
    // A masked UPI handle: at most two characters before the mask.
    if (/^[^\s@•*]{0,2}[•*]{2,}@[A-Za-z0-9.-]+$/.test(value)) return value;
    // A card or account's last four.
    if (/^[•*]{2,}\s?\d{4}$/.test(value)) return value;
    return null;
}

/** A provider's reason code, kept only as a short code; never its prose. */
export function safeFailureReason(reason: string | null | undefined): string {
    const value = (reason ?? "").trim();
    return /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : "UNKNOWN";
}

/**
 * The state a mandate moves to when the provider reports `reported`, or
 * null when it doesn't move. A CANCELLED or FAILED mandate never comes
 * back: a new authorisation is a new mandate. PAUSED → ACTIVE is a UPI
 * mandate the customer resumed in their app.
 */
export function nextMandateStatus(
    current: MandateStatus,
    reported: ReportedMandateStatus,
): MandateStatus | null {
    switch (reported) {
        case "ACTIVE":
            return current === "PENDING" || current === "PAUSED"
                ? "ACTIVE"
                : null;
        case "PAUSED":
            return current === "ACTIVE" ? "PAUSED" : null;
        case "CANCELLED":
            return current === "PENDING" ||
                current === "ACTIVE" ||
                current === "PAUSED"
                ? "CANCELLED"
                : null;
        case "FAILED":
            return current === "PENDING" ? "FAILED" : null;
    }
}
