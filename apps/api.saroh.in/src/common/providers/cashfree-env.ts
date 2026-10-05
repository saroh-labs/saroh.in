import { env } from "../../env";

/**
 * Which Cashfree the API talks to (`CASHFREE_ENV`, plan 2026-10-05-001
 * KTD-1): `sandbox` for test credentials, `production` for live ones. One
 * switch for merchants' payments and Saroh's own billing, and the mode goes
 * to the browser with every checkout so the drop-in opens where the order
 * was made. Unset — including under SKIP_ENV_VALIDATION, where the schema's
 * default never applies — is `production`, today's behaviour.
 */
export type CashfreeMode = "production" | "sandbox";

export function cashfreeMode(
    value: string | undefined = env.CASHFREE_ENV,
): CashfreeMode {
    return value === "sandbox" ? "sandbox" : "production";
}

/** The Payment Gateway API's base for a mode. */
export function cashfreeBaseUrl(mode: CashfreeMode = cashfreeMode()): string {
    return mode === "sandbox"
        ? "https://sandbox.cashfree.com/pg"
        : "https://api.cashfree.com/pg";
}
