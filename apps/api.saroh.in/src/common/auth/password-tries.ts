import { env } from "../../env";
import type { WindowLimiter } from "../../modules/rate-limits/shared-window";
import { SharedRateLimiter } from "../../modules/rate-limits/shared-window";
import { emailHash } from "./code-mail-limits";

const DEFAULT_FAILS = 10;
const DEFAULT_WINDOW_MINUTES = 15;

type TriesLimiter = WindowLimiter & {
    blocked(key: string, now?: number): boolean | Promise<boolean>;
};

/**
 * Wrong passwords per account (A-03), on top of Better Auth's per-caller
 * limit: past `PASSWORD_FAILS_PER_ACCOUNT` in `PASSWORD_FAIL_WINDOW_MINUTES`
 * a password sign-in for that address is refused until the window turns,
 * from any address. Keyed by the address's hash, known or not, so the
 * answer never says whether an account exists. In Redis (`SharedRateLimiter`).
 */
export function passwordTries(
    limiter: TriesLimiter = new SharedRateLimiter(
        "password-fails",
        Number(env.PASSWORD_FAILS_PER_ACCOUNT) || DEFAULT_FAILS,
        (Number(env.PASSWORD_FAIL_WINDOW_MINUTES) || DEFAULT_WINDOW_MINUTES) *
            60_000,
    ),
) {
    return {
        blocked: async (email: string) => {
            const key = emailHash(email);
            return (await limiter.blocked(key))
                ? { retryAfterSeconds: await limiter.retryAfterSeconds(key) }
                : null;
        },
        failed: async (email: string) => {
            await limiter.take(emailHash(email));
        },
    };
}
